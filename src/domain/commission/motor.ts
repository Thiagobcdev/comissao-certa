/**
 * Motor de comissões — funções puras, sem banco e sem framework.
 *
 *   calcularFechamento(entrada) → { linhas, resumo, total }
 *
 * Aplica, para UMA competência (mês):
 *   R1 base por categoria · R2 multiplicador por atingimento · R3 estorno por devolução
 *   R4 estorno/reversão por inadimplência · R5 bônus do gestor · R6 teto mensal
 *   R7 versão de regras vigente · R9 centavos inteiros com arredondamento half-up por linha
 * R8 (fechamento imutável) é garantido pela camada de persistência.
 *
 * Toda linha carrega uma `memoria` explicando como o valor foi obtido.
 */
import { BP, arredondar, somar } from "./dinheiro";
import { diasEntre, estaNaCompetencia, ultimoDia, validarCompetencia } from "./datas";
import { ErroDeRegra, faixaPara, selecionarVersao, type Faixa, type VersaoRegras } from "./regras";

// ───────────────────────────── tipos de entrada ─────────────────────────────

export type ItemInput = { categoria: string; valorCentavos: number };

export type VendaInput = {
  id: string;
  numeroPedido: string;
  vendedorId: string;
  data: string; // YYYY-MM-DD
  vencimento: string;
  pagoEm: string | null;
  devolvidaEm: string | null;
  itens: readonly ItemInput[];
};

export type VendedorInput = { id: string; nome: string; equipeId: string | null };
export type EquipeInput = { id: string; nome: string; gestorId: string | null };

/** Situação, ao início do mês, de uma venda comissionada em mês anterior. */
export type SituacaoAnterior = "ATIVA" | "ESTORNADA_DEVOLUCAO" | "ESTORNADA_INADIMPLENCIA";

export type VendaComissionadaAnterior = {
  venda: VendaInput;
  /** Quanto foi efetivamente pago pela linha BASE (já com teto aplicado), em centavos. */
  pagoCentavos: number;
  situacao: SituacaoAnterior;
};

export type EntradaFechamento = {
  competencia: string; // YYYY-MM
  versoes: readonly VersaoRegras[];
  vendedores: readonly VendedorInput[];
  equipes: readonly EquipeInput[];
  /** vendedorId → meta do mês (centavos). */
  metas: Readonly<Record<string, number>>;
  /** equipeId → meta coletiva do mês (centavos). */
  metasEquipe: Readonly<Record<string, number>>;
  /** Vendas com data dentro da competência. */
  vendasDoMes: readonly VendaInput[];
  /** Vendas de meses anteriores que já geraram linha BASE (para R3/R4). */
  comissionadasAnteriores: readonly VendaComissionadaAnterior[];
};

// ───────────────────────────── tipos de saída ─────────────────────────────

export type TipoLinha =
  | "BASE"
  | "AJUSTE_TETO"
  | "BONUS_GESTOR"
  | "ESTORNO_DEVOLUCAO"
  | "ESTORNO_INADIMPLENCIA"
  | "REVERSAO_INADIMPLENCIA";

export type Linha = {
  beneficiarioId: string;
  vendaId: string | null;
  tipo: TipoLinha;
  valorCentavos: number;
  memoria: Record<string, unknown>;
};

export type ResumoVendedor = {
  vendedorId: string;
  nome: string;
  equipeId: string | null;
  faturadoCentavos: number;
  metaCentavos: number;
  atingimentoBp: number;
  faixa: Faixa;
  baseCentavos: number;
  ajusteTetoCentavos: number;
  estornosCentavos: number;
  reversoesCentavos: number;
  totalCentavos: number;
};

export type ResumoEquipe = {
  equipeId: string;
  nome: string;
  gestorId: string | null;
  faturadoCentavos: number;
  metaCentavos: number;
  atingiuMeta: boolean;
  comissaoEquipeCentavos: number;
  bonusGestorCentavos: number;
};

export type ResultadoFechamento = {
  competencia: string;
  versaoId: string;
  linhas: Linha[];
  vendedores: ResumoVendedor[];
  equipes: ResumoEquipe[];
  totalCentavos: number;
};

// ───────────────────────────── helpers ─────────────────────────────

const valorDaVenda = (v: VendaInput) => somar(v.itens.map((i) => i.valorCentavos));

/** Devolvida dentro do próprio mês não conta: nem para meta nem para comissão (R3). */
const devolvidaNoMes = (v: VendaInput, competencia: string) => estaNaCompetencia(v.devolvidaEm, competencia);

/** R2 — atingimento em bp, arredondado para baixo (99,999% não vira 100%). */
export function calcularAtingimentoBp(faturado: number, meta: number): number {
  if (meta <= 0) throw new ErroDeRegra("META_AUSENTE", "Meta deve ser maior que zero");
  return Math.floor((faturado * BP) / meta);
}

// ───────────────────────────── motor ─────────────────────────────

export function calcularFechamento(e: EntradaFechamento): ResultadoFechamento {
  validarCompetencia(e.competencia);
  const versao = selecionarVersao(e.versoes, e.competencia); // R7
  const { regras } = versao;
  const fim = ultimoDia(e.competencia);
  const linhas: Linha[] = [];

  for (const v of e.vendasDoMes) {
    if (!estaNaCompetencia(v.data, e.competencia)) {
      throw new ErroDeRegra(
        "VENDA_FORA_DA_COMPETENCIA",
        `Pedido ${v.numeroPedido} (${v.data}) não pertence a ${e.competencia}`,
      );
    }
  }

  // Vendas válidas do mês, agrupadas por vendedor
  const validas = e.vendasDoMes.filter((v) => !devolvidaNoMes(v, e.competencia));
  const porVendedor = new Map<string, VendaInput[]>();
  for (const v of validas) porVendedor.set(v.vendedorId, [...(porVendedor.get(v.vendedorId) ?? []), v]);

  // Quem vendeu precisa ter meta (não se fecha mês sem meta)
  const semMeta = [...porVendedor.keys()].filter((id) => !(e.metas[id] > 0));
  if (semMeta.length > 0) {
    const nomes = semMeta.map((id) => e.vendedores.find((x) => x.id === id)?.nome ?? id);
    throw new ErroDeRegra("META_AUSENTE", `Vendedores sem meta em ${e.competencia}: ${nomes.join(", ")}`, semMeta);
  }

  const resumoVendedores: ResumoVendedor[] = [];

  for (const vendedor of e.vendedores) {
    const vendas = porVendedor.get(vendedor.id) ?? [];
    const meta = e.metas[vendedor.id] ?? 0;
    const faturado = somar(vendas.map(valorDaVenda));
    const atingimentoBp = meta > 0 ? calcularAtingimentoBp(faturado, meta) : 0;
    const faixa = faixaPara(regras.faixas, atingimentoBp); // R2

    // R1 × R2 — uma linha BASE por venda
    const linhasBase: Linha[] = vendas.map((venda) => {
      const itens = venda.itens.map((item) => {
        const pctBp = regras.categorias[item.categoria];
        if (pctBp === undefined) {
          throw new ErroDeRegra(
            "CATEGORIA_SEM_PERCENTUAL",
            `Categoria "${item.categoria}" sem percentual na versão vigente (pedido ${venda.numeroPedido})`,
          );
        }
        return { categoria: item.categoria, valorCentavos: item.valorCentavos, pctBp };
      });
      // Σ(valor × pct) × multiplicador, um único arredondamento por linha (R9)
      const brutoEscalado = somar(itens.map((i) => i.valorCentavos * i.pctBp));
      const valorCentavos = arredondar((brutoEscalado * faixa.multiplicadorBp) / (BP * BP));
      return {
        beneficiarioId: vendedor.id,
        vendaId: venda.id,
        tipo: "BASE" as const,
        valorCentavos,
        memoria: {
          regra: "R1×R2",
          versaoId: versao.id,
          numeroPedido: venda.numeroPedido,
          itens,
          comissaoSemMultiplicadorCentavos: arredondar(brutoEscalado / BP),
          atingimentoBp,
          faixa,
          fatorTeto: 1,
        },
      };
    });

    // R6 — teto mensal (corta o excedente numa linha de ajuste)
    const baseCentavos = somar(linhasBase.map((l) => l.valorCentavos));
    const teto = regras.tetoMensalCentavos;
    let ajusteTetoCentavos = 0;
    if (teto !== null && baseCentavos > teto) {
      ajusteTetoCentavos = teto - baseCentavos;
      const fatorTeto = teto / baseCentavos;
      for (const l of linhasBase) l.memoria.fatorTeto = fatorTeto;
      linhas.push({
        beneficiarioId: vendedor.id,
        vendaId: null,
        tipo: "AJUSTE_TETO",
        valorCentavos: ajusteTetoCentavos,
        memoria: { regra: "R6", versaoId: versao.id, baseCentavos, tetoCentavos: teto, fatorTeto },
      });
    }
    linhas.push(...linhasBase);

    resumoVendedores.push({
      vendedorId: vendedor.id,
      nome: vendedor.nome,
      equipeId: vendedor.equipeId,
      faturadoCentavos: faturado,
      metaCentavos: meta,
      atingimentoBp,
      faixa,
      baseCentavos,
      ajusteTetoCentavos,
      estornosCentavos: 0,
      reversoesCentavos: 0,
      totalCentavos: 0, // preenchido no fim
    });
  }

  // R3 / R4 — eventos sobre vendas comissionadas em meses anteriores
  for (const { venda, pagoCentavos, situacao } of e.comissionadasAnteriores) {
    const base = { beneficiarioId: venda.vendedorId, vendaId: venda.id };
    const memoriaBase = { versaoId: versao.id, numeroPedido: venda.numeroPedido, pagoCentavos };

    if (situacao === "ATIVA" && estaNaCompetencia(venda.devolvidaEm, e.competencia)) {
      linhas.push({
        ...base,
        tipo: "ESTORNO_DEVOLUCAO",
        valorCentavos: -pagoCentavos,
        memoria: { regra: "R3", ...memoriaBase, devolvidaEm: venda.devolvidaEm },
      });
      continue;
    }

    const pagoAteOFim = venda.pagoEm !== null && venda.pagoEm <= fim;
    const devolvidaAteOFim = venda.devolvidaEm !== null && venda.devolvidaEm <= fim;
    const diasEmAtraso = diasEntre(venda.vencimento, fim);

    if (
      situacao === "ATIVA" &&
      !pagoAteOFim &&
      !devolvidaAteOFim &&
      diasEmAtraso > regras.inadimplenciaDias
    ) {
      linhas.push({
        ...base,
        tipo: "ESTORNO_INADIMPLENCIA",
        valorCentavos: -pagoCentavos,
        memoria: {
          regra: "R4",
          ...memoriaBase,
          vencimento: venda.vencimento,
          diasEmAtraso,
          toleranciaDias: regras.inadimplenciaDias,
        },
      });
      continue;
    }

    if (situacao === "ESTORNADA_INADIMPLENCIA" && estaNaCompetencia(venda.pagoEm, e.competencia)) {
      linhas.push({
        ...base,
        tipo: "REVERSAO_INADIMPLENCIA",
        valorCentavos: pagoCentavos,
        memoria: { regra: "R4", ...memoriaBase, pagoEm: venda.pagoEm },
      });
    }
  }

  // R5 — bônus do gestor quando a equipe atinge a meta coletiva
  const resumoEquipes: ResumoEquipe[] = e.equipes.map((equipe) => {
    const membros = resumoVendedores.filter((r) => r.equipeId === equipe.id);
    const faturado = somar(membros.map((m) => m.faturadoCentavos));
    const meta = e.metasEquipe[equipe.id] ?? 0;
    const comissaoEquipe = somar(membros.map((m) => m.baseCentavos + m.ajusteTetoCentavos));
    const atingiuMeta = meta > 0 && faturado >= meta;
    let bonus = 0;

    if (atingiuMeta && equipe.gestorId && regras.bonusGestorBp > 0) {
      bonus = arredondar((comissaoEquipe * regras.bonusGestorBp) / BP);
      if (bonus > 0) {
        linhas.push({
          beneficiarioId: equipe.gestorId,
          vendaId: null,
          tipo: "BONUS_GESTOR",
          valorCentavos: bonus,
          memoria: {
            regra: "R5",
            versaoId: versao.id,
            equipe: equipe.nome,
            faturadoEquipeCentavos: faturado,
            metaEquipeCentavos: meta,
            comissaoEquipeCentavos: comissaoEquipe,
            bonusGestorBp: regras.bonusGestorBp,
          },
        });
      }
    }

    return {
      equipeId: equipe.id,
      nome: equipe.nome,
      gestorId: equipe.gestorId,
      faturadoCentavos: faturado,
      metaCentavos: meta,
      atingiuMeta,
      comissaoEquipeCentavos: comissaoEquipe,
      bonusGestorCentavos: bonus,
    };
  });

  // Totais por vendedor (estornos e reversões entram depois do teto, de propósito)
  for (const r of resumoVendedores) {
    const minhas = linhas.filter((l) => l.beneficiarioId === r.vendedorId);
    r.estornosCentavos = somar(minhas.filter((l) => l.tipo.startsWith("ESTORNO")).map((l) => l.valorCentavos));
    r.reversoesCentavos = somar(minhas.filter((l) => l.tipo === "REVERSAO_INADIMPLENCIA").map((l) => l.valorCentavos));
    r.totalCentavos = r.baseCentavos + r.ajusteTetoCentavos + r.estornosCentavos + r.reversoesCentavos;
  }

  const ordem: Record<TipoLinha, number> = {
    BASE: 0,
    AJUSTE_TETO: 1,
    ESTORNO_DEVOLUCAO: 2,
    ESTORNO_INADIMPLENCIA: 3,
    REVERSAO_INADIMPLENCIA: 4,
    BONUS_GESTOR: 5,
  };
  linhas.sort(
    (a, b) =>
      a.beneficiarioId.localeCompare(b.beneficiarioId) ||
      ordem[a.tipo] - ordem[b.tipo] ||
      String(a.vendaId).localeCompare(String(b.vendaId)),
  );

  return {
    competencia: e.competencia,
    versaoId: versao.id,
    linhas,
    vendedores: resumoVendedores,
    equipes: resumoEquipes,
    totalCentavos: somar(linhas.map((l) => l.valorCentavos)),
  };
}

/**
 * Quanto uma linha BASE efetivamente pagou depois do teto (R6).
 * Usado para calcular o valor de estornos futuros (R3/R4).
 */
export function valorPagoDaLinhaBase(valorCentavos: number, fatorTeto: number): number {
  return arredondar(valorCentavos * fatorTeto);
}
