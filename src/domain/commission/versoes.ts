/**
 * Edição e publicação de versões de regras (R7) — funções puras.
 *
 *  - formularioDeRegras / regrasDeFormulario: converte entre o formulário (texto em %, x, R$)
 *    e as regras internas (bp e centavos), sem float (R9).
 *  - diffRegras: o que muda de uma versão para outra, em linguagem de negócio.
 *  - validarPublicacao: regras de processo para publicar uma nova versão.
 */
import { BP, formatarBRL, formatarMultiplicador, formatarPercentual } from "./dinheiro";
import { validarCompetencia } from "./datas";
import { regrasSchema, type Faixa, type Regras, type VersaoRegras } from "./regras";

// ───────────────────────────── números digitados ─────────────────────────────

/**
 * Converte um decimal digitado ("4,5", "1.2", "25.000,00") num inteiro escalado por 10^casas,
 * usando só aritmética de strings. Retorna null se o texto não for um número válido
 * ou tiver mais casas decimais do que o permitido.
 */
export function lerDecimal(texto: string, casas: number, { milhar = false } = {}): number | null {
  let t = texto.trim().replace(/^R\$\s*/, "").replace(/\s|%|x$/gi, "");
  if (t === "") return null;
  if (t.includes(",")) {
    t = t.replace(/\./g, "").replace(",", ".");
  } else if (milhar && /^\d{1,3}(\.\d{3})+$/.test(t)) {
    t = t.replace(/\./g, ""); // "25.000" em campo de dinheiro = vinte e cinco mil
  }
  const m = /^(\d+)(?:\.(\d+))?$/.exec(t);
  if (!m) return null;
  const [, inteiro, fracao = ""] = m;
  if (fracao.length > casas) return null;
  return Number(inteiro) * 10 ** casas + Number(fracao.padEnd(casas, "0") || "0");
}

/** bp → texto para o formulário ("450" → "4,5"). */
const bpParaTexto = (bp: number, divisor: number) =>
  (bp / divisor).toLocaleString("pt-BR", { maximumFractionDigits: 4, useGrouping: false });

// ───────────────────────────── formulário ─────────────────────────────

export type FormularioRegras = {
  /** slug → percentual digitado ("4,5"). */
  categorias: Record<string, string>;
  /** Atingimento mínimo em % ("70") e multiplicador ("1,2"). */
  faixas: { minPct: string; multiplicador: string }[];
  inadimplenciaDias: string;
  bonusGestorPct: string;
  /** Vazio = sem teto. */
  tetoReais: string;
};

export function formularioDeRegras(r: Regras): FormularioRegras {
  return {
    categorias: Object.fromEntries(Object.entries(r.categorias).map(([slug, bp]) => [slug, bpParaTexto(bp, 100)])),
    faixas: r.faixas.map((f) => ({ minPct: bpParaTexto(f.minAtingimentoBp, 100), multiplicador: bpParaTexto(f.multiplicadorBp, BP) })),
    inadimplenciaDias: String(r.inadimplenciaDias),
    bonusGestorPct: bpParaTexto(r.bonusGestorBp, 100),
    tetoReais:
      r.tetoMensalCentavos === null
        ? ""
        : (r.tetoMensalCentavos / 100).toLocaleString("pt-BR", { minimumFractionDigits: 2, maximumFractionDigits: 2 }),
  };
}

/** Erros indexados pelo caminho do campo ("categorias.bebidas", "faixas.1.minPct", "tetoReais"…). */
export type ErrosFormulario = Record<string, string>;

export function regrasDeFormulario(
  f: FormularioRegras,
): { ok: true; regras: Regras } | { ok: false; erros: ErrosFormulario } {
  const erros: ErrosFormulario = {};
  const ler = (campo: string, texto: string, casas: number, msg: string, opcoes?: { milhar?: boolean }) => {
    const v = lerDecimal(texto, casas, opcoes);
    if (v === null) erros[campo] = msg;
    return v ?? 0;
  };

  const categorias = Object.fromEntries(
    Object.entries(f.categorias).map(([slug, texto]) => [
      slug,
      ler(`categorias.${slug}`, texto, 2, "Use um percentual com até 2 casas, ex.: 3,5"),
    ]),
  );
  const faixas: Faixa[] = f.faixas.map((fx, i) => ({
    minAtingimentoBp: ler(`faixas.${i}.minPct`, fx.minPct, 2, "Atingimento em %, ex.: 70"),
    multiplicadorBp: ler(`faixas.${i}.multiplicador`, fx.multiplicador, 4, "Multiplicador, ex.: 1,2"),
  }));
  const dias = /^\d+$/.test(f.inadimplenciaDias.trim()) ? Number(f.inadimplenciaDias.trim()) : null;
  if (dias === null) erros.inadimplenciaDias = "Informe um número inteiro de dias";
  const bonusGestorBp = ler("bonusGestorPct", f.bonusGestorPct, 2, "Use um percentual com até 2 casas, ex.: 10");
  const tetoMensalCentavos =
    f.tetoReais.trim() === "" ? null : ler("tetoReais", f.tetoReais, 2, "Valor em reais, ex.: 25.000,00", { milhar: true });

  if (Object.keys(erros).length > 0) return { ok: false, erros };

  const r = regrasSchema.safeParse({ categorias, faixas, inadimplenciaDias: dias, bonusGestorBp, tetoMensalCentavos });
  if (!r.success) {
    for (const issue of r.error.issues) {
      const [raiz, indice] = issue.path;
      const campo =
        raiz === "faixas" && typeof indice === "number"
          ? `faixas.${indice}.minPct`
          : raiz === "categorias" && typeof indice === "string"
            ? `categorias.${indice}`
            : raiz === "bonusGestorBp"
              ? "bonusGestorPct"
              : raiz === "tetoMensalCentavos"
                ? "tetoReais"
                : String(raiz ?? "geral");
      erros[campo] ??= traduzir(issue.message, campo);
    }
    return { ok: false, erros };
  }
  return { ok: true, regras: r.data };
}

function traduzir(mensagem: string, campo: string): string {
  // Mensagens do superRefine já estão em português; as do Zod (limites) recebem um texto de negócio.
  if (/[áéíóúãç]|faixa|categoria/i.test(mensagem)) return mensagem;
  if (campo === "inadimplenciaDias") return "Entre 1 e 365 dias";
  if (campo === "tetoReais") return "O teto precisa ser maior que zero (ou deixe vazio)";
  if (campo.startsWith("faixas")) return "Multiplicador entre 0 e 5x";
  return "Percentual entre 0% e 100%";
}

// ───────────────────────────── diff ─────────────────────────────

export type Mudanca = { campo: string; antes: string | null; depois: string | null };

export function diffRegras(antes: Regras, depois: Regras, nomesCategorias: Record<string, string> = {}): Mudanca[] {
  const mudancas: Mudanca[] = [];
  const pct = (bp: number | undefined) => (bp === undefined ? null : formatarPercentual(bp, 2));

  const slugs = [...new Set([...Object.keys(antes.categorias), ...Object.keys(depois.categorias)])].sort();
  for (const s of slugs) {
    if (antes.categorias[s] !== depois.categorias[s]) {
      mudancas.push({ campo: `Comissão · ${nomesCategorias[s] ?? s}`, antes: pct(antes.categorias[s]), depois: pct(depois.categorias[s]) });
    }
  }

  const porMin = (fs: readonly Faixa[]) => new Map(fs.map((f) => [f.minAtingimentoBp, f.multiplicadorBp]));
  const fa = porMin(antes.faixas);
  const fd = porMin(depois.faixas);
  const minimos = [...new Set([...fa.keys(), ...fd.keys()])].sort((a, b) => a - b);
  for (const min of minimos) {
    const a = fa.get(min);
    const d = fd.get(min);
    if (a !== d) {
      mudancas.push({
        campo: `Faixa a partir de ${formatarPercentual(min, 2)}`,
        antes: a === undefined ? null : formatarMultiplicador(a),
        depois: d === undefined ? null : formatarMultiplicador(d),
      });
    }
  }

  if (antes.inadimplenciaDias !== depois.inadimplenciaDias) {
    mudancas.push({ campo: "Estorno por inadimplência após", antes: `${antes.inadimplenciaDias} dias`, depois: `${depois.inadimplenciaDias} dias` });
  }
  if (antes.bonusGestorBp !== depois.bonusGestorBp) {
    mudancas.push({ campo: "Bônus do gestor", antes: pct(antes.bonusGestorBp), depois: pct(depois.bonusGestorBp) });
  }
  if (antes.tetoMensalCentavos !== depois.tetoMensalCentavos) {
    const teto = (c: number | null) => (c === null ? "Sem teto" : formatarBRL(c));
    mudancas.push({ campo: "Teto mensal por vendedor", antes: teto(antes.tetoMensalCentavos), depois: teto(depois.tetoMensalCentavos) });
  }
  return mudancas;
}

// ───────────────────────────── publicação ─────────────────────────────

export type ErroPublicacao =
  | { codigo: "VIGENCIA_INVALIDA"; mensagem: string }
  | { codigo: "VIGENCIA_EM_MES_FECHADO"; mensagem: string }
  | { codigo: "VIGENCIA_DUPLICADA"; mensagem: string }
  | { codigo: "CATEGORIA_SEM_PERCENTUAL"; mensagem: string }
  | { codigo: "CATEGORIA_DESCONHECIDA"; mensagem: string }
  | { codigo: "SEM_MUDANCAS"; mensagem: string };

/**
 * R7/R8 — uma nova versão só pode valer a partir de um mês ainda não fechado,
 * para que nenhum fechamento gravado mude. Também exige percentual para toda categoria
 * existente (senão o motor falharia ao fechar) e pelo menos uma mudança.
 */
export function validarPublicacao(p: {
  vigencia: string; // "YYYY-MM"
  regras: Regras;
  versoes: readonly VersaoRegras[];
  ultimaCompetenciaFechada: string | null;
  slugsCategorias: readonly string[];
}): ErroPublicacao[] {
  try {
    validarCompetencia(p.vigencia);
  } catch {
    return [{ codigo: "VIGENCIA_INVALIDA", mensagem: "Escolha o mês de início da vigência" }];
  }
  const erros: ErroPublicacao[] = [];
  const inicio = `${p.vigencia}-01`;

  if (p.ultimaCompetenciaFechada && p.vigencia <= p.ultimaCompetenciaFechada) {
    erros.push({
      codigo: "VIGENCIA_EM_MES_FECHADO",
      mensagem: `${p.ultimaCompetenciaFechada} já foi fechado: a vigência precisa começar depois dele`,
    });
  }
  if (p.versoes.some((v) => v.vigenciaInicio === inicio)) {
    erros.push({ codigo: "VIGENCIA_DUPLICADA", mensagem: `Já existe uma versão com vigência em ${p.vigencia}` });
  }
  const faltando = p.slugsCategorias.filter((s) => p.regras.categorias[s] === undefined);
  if (faltando.length > 0) {
    erros.push({ codigo: "CATEGORIA_SEM_PERCENTUAL", mensagem: `Sem percentual: ${faltando.join(", ")}` });
  }
  const desconhecidas = Object.keys(p.regras.categorias).filter((s) => !p.slugsCategorias.includes(s));
  if (desconhecidas.length > 0) {
    erros.push({ codigo: "CATEGORIA_DESCONHECIDA", mensagem: `Categorias inexistentes: ${desconhecidas.join(", ")}` });
  }

  const anteriores = p.versoes.filter((v) => v.vigenciaInicio < inicio);
  const base = anteriores.length > 0 ? anteriores.reduce((a, b) => (b.vigenciaInicio > a.vigenciaInicio ? b : a)) : null;
  if (base && diffRegras(base.regras, p.regras).length === 0) {
    erros.push({ codigo: "SEM_MUDANCAS", mensagem: "Os parâmetros são iguais aos da versão vigente nesse mês" });
  }
  return erros;
}
