/**
 * Importação de vendas por CSV — funções puras.
 *
 *  lerCsv(texto)                 → linhas com as colunas pelo nome (ou erros de formato)
 *  validarImportacao(linhas, ctx) → vendas prontas para gravar + relatório de erros linha a linha
 *
 * Formato: uma linha por ITEM; itens do mesmo pedido repetem os dados do pedido.
 *   pedido;data;vendedor;cliente;vencimento;categoria;valor
 *   PED-9001;23/11/2026;ana.ribeiro@horizonte.test;Mercado Bom Preço;23/12/2026;Bebidas;1.250,00
 *
 * Tudo ou nada: se houver qualquer erro, nada é gravado (design §7).
 */
import { lerDecimal } from "../commission/versoes";
import { validarData } from "../commission/datas";

export const COLUNAS = ["pedido", "data", "vendedor", "cliente", "vencimento", "categoria", "valor"] as const;
export type Coluna = (typeof COLUNAS)[number];

export const LIMITE_LINHAS = 5_000;
const VALOR_MAXIMO_CENTAVOS = 10_000_000_00; // R$ 10 milhões por item: acima disso é erro de digitação

export type LinhaCsv = { numero: number; campos: Record<Coluna, string> };
export type ErroImportacao = { linha: number; coluna: Coluna | null; mensagem: string };

// ───────────────────────────── leitura ─────────────────────────────

/** Divide uma linha CSV respeitando aspas ("a;b" é um campo só; "" vira "). */
function dividir(linha: string, sep: string): string[] {
  const campos: string[] = [];
  let atual = "";
  let aspas = false;
  for (let i = 0; i < linha.length; i++) {
    const c = linha[i];
    if (aspas) {
      if (c === '"' && linha[i + 1] === '"') {
        atual += '"';
        i++;
      } else if (c === '"') aspas = false;
      else atual += c;
    } else if (c === '"' && atual.trim() === "") {
      aspas = true;
      atual = "";
    } else if (c === sep) {
      campos.push(atual);
      atual = "";
    } else atual += c;
  }
  campos.push(atual);
  return campos.map((c) => c.trim());
}

const normalizarCabecalho = (s: string) =>
  s.trim().toLowerCase().normalize("NFD").replace(/[̀-ͯ]/g, "").replace(/\s+/g, "_");

export function lerCsv(texto: string): { ok: true; linhas: LinhaCsv[] } | { ok: false; erros: ErroImportacao[] } {
  const fisicas = texto.replace(/^﻿/, "").split(/\r\n|\n|\r/);
  const iCab = fisicas.findIndex((l) => l.trim() !== "");
  if (iCab === -1) return { ok: false, erros: [{ linha: 1, coluna: null, mensagem: "Arquivo vazio" }] };

  const cab = fisicas[iCab];
  const sep = [";", "\t", ","].reduce((melhor, s) => (cab.split(s).length > cab.split(melhor).length ? s : melhor), ";");
  const nomes = dividir(cab, sep).map(normalizarCabecalho);
  const faltando = COLUNAS.filter((c) => !nomes.includes(c));
  if (faltando.length > 0) {
    return {
      ok: false,
      erros: [{ linha: iCab + 1, coluna: null, mensagem: `Cabeçalho sem as colunas: ${faltando.join(", ")}. Esperado: ${COLUNAS.join(";")}` }],
    };
  }
  const posicao = Object.fromEntries(COLUNAS.map((c) => [c, nomes.indexOf(c)])) as Record<Coluna, number>;

  const linhas: LinhaCsv[] = [];
  const erros: ErroImportacao[] = [];
  for (let i = iCab + 1; i < fisicas.length; i++) {
    if (fisicas[i].trim() === "" || /^[;,\t\s]*$/.test(fisicas[i])) continue; // linha vazia (inclusive ";;;;" do Excel)
    const valores = dividir(fisicas[i], sep);
    if (valores.length < nomes.length) {
      erros.push({ linha: i + 1, coluna: null, mensagem: `Esperava ${nomes.length} colunas, veio ${valores.length}` });
      continue;
    }
    linhas.push({
      numero: i + 1,
      campos: Object.fromEntries(COLUNAS.map((c) => [c, valores[posicao[c]] ?? ""])) as Record<Coluna, string>,
    });
  }
  if (linhas.length === 0 && erros.length === 0) erros.push({ linha: iCab + 1, coluna: null, mensagem: "Nenhuma venda no arquivo" });
  if (linhas.length > LIMITE_LINHAS) {
    erros.push({ linha: iCab + 1, coluna: null, mensagem: `Máximo de ${LIMITE_LINHAS} linhas por arquivo (veio ${linhas.length})` });
  }
  return erros.length > 0 ? { ok: false, erros } : { ok: true, linhas };
}

// ───────────────────────────── validação ─────────────────────────────

export type ContextoImportacao = {
  hoje: string; // YYYY-MM-DD
  ultimaCompetenciaFechada: string | null;
  /** e-mail (minúsculo) → vendedor e as competências em que tem meta. */
  vendedores: Readonly<Record<string, { id: string; nome: string; competenciasComMeta: readonly string[] }>>;
  /** slug ou nome (minúsculo, sem acento) → slug. */
  categorias: Readonly<Record<string, string>>;
  /** Pedidos do arquivo que já existem no banco. */
  pedidosExistentes: ReadonlySet<string>;
};

export type VendaNova = {
  numeroPedido: string;
  vendedorId: string;
  clienteNome: string;
  data: string;
  vencimento: string;
  itens: { categoria: string; valorCentavos: number }[];
};

export type ResumoImportacao = {
  pedidos: number;
  itens: number;
  totalCentavos: number;
  porCompetencia: { competencia: string; pedidos: number; totalCentavos: number }[];
  porVendedor: { nome: string; pedidos: number; totalCentavos: number }[];
};

/** "23/11/2026" ou "2026-11-23" → "2026-11-23"; null se inválida. */
export function lerData(texto: string): string | null {
  const t = texto.trim();
  const br = /^(\d{1,2})\/(\d{1,2})\/(\d{4})$/.exec(t);
  const iso = br ? `${br[3]}-${br[2].padStart(2, "0")}-${br[1].padStart(2, "0")}` : t;
  try {
    validarData(iso);
  } catch {
    return null;
  }
  // Date.parse aceita 31/02; confere se a data "volta" igual
  return new Date(`${iso}T00:00:00Z`).toISOString().slice(0, 10) === iso ? iso : null;
}

export const semAcento = (s: string) => s.trim().toLowerCase().normalize("NFD").replace(/[̀-ͯ]/g, "");

export function validarImportacao(
  linhas: readonly LinhaCsv[],
  ctx: ContextoImportacao,
): { vendas: VendaNova[]; erros: ErroImportacao[]; resumo: ResumoImportacao } {
  const erros: ErroImportacao[] = [];
  const pedidos = new Map<string, VendaNova & { primeiraLinha: number }>();

  for (const { numero, campos } of linhas) {
    const erro = (coluna: Coluna, mensagem: string) => erros.push({ linha: numero, coluna, mensagem });
    const antes = erros.length;

    const numeroPedido = campos.pedido.trim();
    if (!/^[\w./-]{1,30}$/.test(numeroPedido)) erro("pedido", "Use até 30 letras, números, - . / ou _");
    else if (ctx.pedidosExistentes.has(numeroPedido)) erro("pedido", `Pedido ${numeroPedido} já existe no sistema`);

    const data = lerData(campos.data);
    const errosAntesDaData = erros.length;
    if (!data) erro("data", "Data inválida (use dd/mm/aaaa)");
    else if (data > ctx.hoje) erro("data", "Venda com data futura");
    else if (ctx.ultimaCompetenciaFechada && data.slice(0, 7) <= ctx.ultimaCompetenciaFechada) {
      erro("data", `${data.slice(0, 7)} já foi fechado: vendas de meses fechados não entram (R8)`);
    }
    const dataOk = data !== null && erros.length === errosAntesDaData;

    const vencimento = lerData(campos.vencimento);
    if (!vencimento) erro("vencimento", "Data inválida (use dd/mm/aaaa)");
    else if (data && vencimento < data) erro("vencimento", "Vencimento antes da data da venda");

    const vendedor = ctx.vendedores[campos.vendedor.trim().toLowerCase()];
    if (!vendedor) erro("vendedor", `Vendedor não encontrado: ${campos.vendedor || "(vazio)"}`);
    else if (dataOk && !vendedor.competenciasComMeta.includes(data.slice(0, 7))) {
      erro("vendedor", `${vendedor.nome} não tem meta em ${data.slice(0, 7)}: cadastre a meta antes`);
    }

    const cliente = campos.cliente.trim();
    if (cliente.length < 2 || cliente.length > 120) erro("cliente", "Informe o nome do cliente (2 a 120 caracteres)");

    const categoria = ctx.categorias[semAcento(campos.categoria)];
    if (!categoria) erro("categoria", `Categoria desconhecida: ${campos.categoria || "(vazia)"}`);

    const valor = lerDecimal(campos.valor, 2, { milhar: true });
    if (valor === null) erro("valor", "Valor inválido (ex.: 1.250,00)");
    else if (valor <= 0) erro("valor", "O valor precisa ser maior que zero");
    else if (valor > VALOR_MAXIMO_CENTAVOS) erro("valor", "Valor acima de R$ 10 milhões por item");

    if (erros.length > antes || !data || !vencimento || !vendedor || !categoria || valor === null) continue;

    const existente = pedidos.get(numeroPedido);
    if (!existente) {
      pedidos.set(numeroPedido, {
        numeroPedido,
        vendedorId: vendedor.id,
        clienteNome: cliente,
        data,
        vencimento,
        itens: [{ categoria, valorCentavos: valor }],
        primeiraLinha: numero,
      });
      continue;
    }
    // itens do mesmo pedido precisam repetir os mesmos dados do pedido
    const divergente: [Coluna, boolean][] = [
      ["data", existente.data !== data],
      ["vendedor", existente.vendedorId !== vendedor.id],
      ["cliente", existente.clienteNome !== cliente],
      ["vencimento", existente.vencimento !== vencimento],
    ];
    const col = divergente.find(([, d]) => d)?.[0];
    if (col) erro(col, `Pedido ${numeroPedido} aparece com ${col} diferente na linha ${existente.primeiraLinha}`);
    else existente.itens.push({ categoria, valorCentavos: valor });
  }

  // eslint-disable-next-line @typescript-eslint/no-unused-vars -- descarta o campo auxiliar
  const vendas = [...pedidos.values()].map(({ primeiraLinha, ...v }) => v);
  return { vendas, erros, resumo: resumir(vendas, ctx) };
}

function resumir(vendas: readonly VendaNova[], ctx: ContextoImportacao): ResumoImportacao {
  const total = (v: VendaNova) => v.itens.reduce((s, i) => s + i.valorCentavos, 0);
  const nomePorId = new Map(Object.values(ctx.vendedores).map((v) => [v.id, v.nome]));
  const agrupar = (chave: (v: VendaNova) => string) => {
    const m = new Map<string, { pedidos: number; totalCentavos: number }>();
    for (const v of vendas) {
      const g = m.get(chave(v)) ?? { pedidos: 0, totalCentavos: 0 };
      g.pedidos += 1;
      g.totalCentavos += total(v);
      m.set(chave(v), g);
    }
    return m;
  };
  return {
    pedidos: vendas.length,
    itens: vendas.reduce((s, v) => s + v.itens.length, 0),
    totalCentavos: vendas.reduce((s, v) => s + total(v), 0),
    porCompetencia: [...agrupar((v) => v.data.slice(0, 7))]
      .map(([competencia, g]) => ({ competencia, ...g }))
      .sort((a, b) => a.competencia.localeCompare(b.competencia)),
    porVendedor: [...agrupar((v) => nomePorId.get(v.vendedorId) ?? v.vendedorId)]
      .map(([nome, g]) => ({ nome, ...g }))
      .sort((a, b) => b.totalCentavos - a.totalCentavos),
  };
}
