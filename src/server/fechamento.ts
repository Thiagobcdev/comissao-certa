/**
 * Ponte entre o banco e o motor puro (src/domain/commission).
 *  - montarEntrada: lê o estado do banco e monta a EntradaFechamento
 *  - previaFechamento: calcula sem gravar (painéis, extrato, conferência)
 *  - fecharCompetencia: grava o fechamento de forma imutável (R8)
 */
import type { Prisma } from "@/generated/prisma/client";
import {
  calcularFechamento,
  ErroDeRegra,
  paraISO,
  parseRegras,
  primeiroDia,
  ultimoDia,
  valorPagoDaLinhaBase,
  type EntradaFechamento,
  type ResultadoFechamento,
  type SituacaoAnterior,
  type VendaComissionadaAnterior,
  type VendaInput,
  type VersaoRegras,
} from "@/domain/commission";
import type { Db } from "./db";

const incluirItens = { itens: { include: { categoria: { select: { slug: true } } } } } as const;

type VendaComItens = Prisma.VendaGetPayload<{ include: typeof incluirItens }>;

function paraVendaInput(v: VendaComItens): VendaInput {
  return {
    id: v.id,
    numeroPedido: v.numeroPedido,
    vendedorId: v.vendedorId,
    data: paraISO(v.data),
    vencimento: paraISO(v.vencimento),
    pagoEm: v.pagoEm ? paraISO(v.pagoEm) : null,
    devolvidaEm: v.devolvidaEm ? paraISO(v.devolvidaEm) : null,
    itens: v.itens.map((i) => ({ categoria: i.categoria.slug, valorCentavos: i.valorCentavos })),
  };
}

export async function carregarVersoes(db: Pick<Db, "versaoRegras">): Promise<VersaoRegras[]> {
  const versoes = await db.versaoRegras.findMany({ orderBy: { vigenciaInicio: "asc" } });
  return versoes.map((v) => ({ id: v.id, vigenciaInicio: paraISO(v.vigenciaInicio), regras: parseRegras(v.regras) }));
}

/**
 * Vendas comissionadas em fechamentos ANTERIORES à competência, com o valor efetivamente pago
 * (linha BASE × fator de teto) e a situação após o último evento (estorno/reversão).
 */
async function carregarComissionadasAnteriores(db: Db, competencia: string): Promise<VendaComissionadaAnterior[]> {
  const linhas = await db.linhaComissao.findMany({
    where: {
      vendaId: { not: null },
      fechamento: { competencia: { lt: competencia } },
      tipo: { in: ["BASE", "ESTORNO_DEVOLUCAO", "ESTORNO_INADIMPLENCIA", "REVERSAO_INADIMPLENCIA"] },
    },
    include: { fechamento: { select: { competencia: true } }, venda: { include: incluirItens } },
    orderBy: { fechamento: { competencia: "asc" } },
  });

  const porVenda = new Map<string, { venda: VendaComItens; pago: number; situacao: SituacaoAnterior }>();
  for (const l of linhas) {
    if (!l.venda) continue;
    if (l.tipo === "BASE") {
      const fator = Number((l.memoria as { fatorTeto?: number }).fatorTeto ?? 1);
      porVenda.set(l.venda.id, { venda: l.venda, pago: valorPagoDaLinhaBase(l.valorCentavos, fator), situacao: "ATIVA" });
      continue;
    }
    const atual = porVenda.get(l.venda.id);
    if (!atual) continue;
    atual.situacao =
      l.tipo === "ESTORNO_DEVOLUCAO"
        ? "ESTORNADA_DEVOLUCAO"
        : l.tipo === "ESTORNO_INADIMPLENCIA"
          ? "ESTORNADA_INADIMPLENCIA"
          : "ATIVA";
  }

  return [...porVenda.values()]
    .filter((x) => x.situacao !== "ESTORNADA_DEVOLUCAO" && x.pago > 0) // devolução é terminal
    .map((x) => ({ venda: paraVendaInput(x.venda), pagoCentavos: x.pago, situacao: x.situacao }));
}

export async function montarEntrada(db: Db, competencia: string): Promise<EntradaFechamento> {
  const inicio = new Date(`${primeiroDia(competencia)}T00:00:00Z`);
  const fim = new Date(`${ultimoDia(competencia)}T00:00:00Z`);

  const [versoes, vendedores, equipes, metas, metasEquipe, vendas, comissionadasAnteriores] = await Promise.all([
    carregarVersoes(db),
    db.usuario.findMany({ where: { papel: "VENDEDOR" }, orderBy: { nome: "asc" } }),
    db.equipe.findMany({ orderBy: { nome: "asc" } }),
    db.meta.findMany({ where: { competencia } }),
    db.metaEquipe.findMany({ where: { competencia } }),
    db.venda.findMany({ where: { data: { gte: inicio, lte: fim } }, include: incluirItens, orderBy: { data: "asc" } }),
    carregarComissionadasAnteriores(db, competencia),
  ]);

  return {
    competencia,
    versoes,
    vendedores: vendedores.map((v) => ({ id: v.id, nome: v.nome, equipeId: v.equipeId })),
    equipes: equipes.map((e) => ({ id: e.id, nome: e.nome, gestorId: e.gestorId })),
    metas: Object.fromEntries(metas.map((m) => [m.vendedorId, m.valorCentavos])),
    metasEquipe: Object.fromEntries(metasEquipe.map((m) => [m.equipeId, m.valorCentavos])),
    vendasDoMes: vendas.map(paraVendaInput),
    comissionadasAnteriores,
  };
}

/** Cálculo sem gravar nada. Se o mês já foi fechado, prefira ler o fechamento gravado. */
export async function previaFechamento(db: Db, competencia: string): Promise<ResultadoFechamento> {
  return calcularFechamento(await montarEntrada(db, competencia));
}

export class ErroDeFechamento extends Error {
  constructor(
    public readonly codigo: "JA_FECHADO" | "MES_ANTERIOR_ABERTO" | "COMPETENCIA_FUTURA",
    mensagem: string,
  ) {
    super(mensagem);
    this.name = "ErroDeFechamento";
  }
}

/**
 * R8 — grava o fechamento. Imutável: competência única no banco, e não há rota de edição.
 * Regras de processo:
 *  - não fecha competência que ainda não terminou (hoje <= último dia);
 *  - fecha em ordem: o mês anterior com vendas precisa estar fechado.
 */
export async function fecharCompetencia(
  db: Db,
  competencia: string,
  usuarioId: string,
  hoje: string = paraISO(new Date()),
): Promise<{ fechamentoId: string; resultado: ResultadoFechamento }> {
  if (hoje <= ultimoDia(competencia)) {
    throw new ErroDeFechamento("COMPETENCIA_FUTURA", `${competencia} ainda não terminou`);
  }
  if (await db.fechamento.findUnique({ where: { competencia } })) {
    throw new ErroDeFechamento("JA_FECHADO", `${competencia} já foi fechado e não pode ser alterado`);
  }

  const inicio = new Date(`${primeiroDia(competencia)}T00:00:00Z`);
  const vendaAnteriorNaoFechada = await db.venda.findFirst({
    where: { data: { lt: inicio } },
    orderBy: { data: "desc" },
    select: { data: true },
  });
  if (vendaAnteriorNaoFechada) {
    const compAnterior = paraISO(vendaAnteriorNaoFechada.data).slice(0, 7);
    const fechadoAnterior = await db.fechamento.findUnique({ where: { competencia: compAnterior } });
    if (!fechadoAnterior) {
      throw new ErroDeFechamento("MES_ANTERIOR_ABERTO", `Feche ${compAnterior} antes de ${competencia}`);
    }
  }

  const resultado = await previaFechamento(db, competencia);

  const fechamento = await db.$transaction(async (tx) => {
    const f = await tx.fechamento.create({
      data: {
        competencia,
        versaoRegrasId: resultado.versaoId,
        totalCentavos: resultado.totalCentavos,
        fechadoPorId: usuarioId,
      },
    });
    await tx.linhaComissao.createMany({
      data: resultado.linhas.map((l) => ({
        fechamentoId: f.id,
        beneficiarioId: l.beneficiarioId,
        vendaId: l.vendaId,
        tipo: l.tipo,
        valorCentavos: l.valorCentavos,
        memoria: l.memoria as Prisma.InputJsonValue,
      })),
    });
    await tx.auditoria.create({
      data: {
        usuarioId,
        acao: "FECHAMENTO_CRIADO",
        detalhes: { competencia, totalCentavos: resultado.totalCentavos, linhas: resultado.linhas.length },
      },
    });
    return f;
  });

  return { fechamentoId: fechamento.id, resultado };
}

export { ErroDeRegra };
