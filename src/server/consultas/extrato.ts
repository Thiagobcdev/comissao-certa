/**
 * Extrato de comissão de um beneficiário numa competência.
 *  - Mês FECHADO → lê as linhas gravadas (imutáveis, R8).
 *  - Mês ABERTO  → prévia calculada pelo motor (pode mudar até o fechamento).
 */
import "server-only";
import {
  BP,
  faixaPara,
  paraISO,
  primeiroDia,
  selecionarVersao,
  somar,
  ultimoDia,
  type Faixa,
  type TipoLinha,
} from "@/domain/commission";
import { prisma } from "../db";
import { carregarVersoes, previaFechamento } from "../fechamento";

export type LinhaExtrato = {
  chave: string;
  tipo: TipoLinha;
  valorCentavos: number;
  numeroPedido: string | null;
  clienteNome: string | null;
  data: string | null;
  memoria: Record<string, unknown>;
};

export type ResumoExtrato = {
  faturadoCentavos: number;
  metaCentavos: number;
  atingimentoBp: number;
  faixa: Faixa;
  proximaFaixa: (Faixa & { faltaCentavos: number }) | null;
  baseCentavos: number;
  ajusteTetoCentavos: number;
  estornosCentavos: number;
  reversoesCentavos: number;
  bonusCentavos: number;
  totalCentavos: number;
};

export type Extrato = {
  competencia: string;
  fechado: boolean;
  fechadoEm: string | null;
  versao: { id: string; descricao: string };
  resumo: ResumoExtrato;
  linhas: LinhaExtrato[];
  categorias: Record<string, string>; // slug → nome
};

/** Competências com meta para o vendedor (mais recentes primeiro). */
export async function competenciasDisponiveis(usuarioId: string): Promise<string[]> {
  const metas = await prisma.meta.findMany({
    where: { vendedorId: usuarioId },
    select: { competencia: true },
    orderBy: { competencia: "desc" },
  });
  return metas.map((m) => m.competencia);
}

export function calcularProximaFaixa(faixas: readonly Faixa[], atingimentoBp: number, faturado: number, meta: number) {
  const proxima = faixas.find((f) => f.minAtingimentoBp > atingimentoBp);
  if (!proxima || meta <= 0) return null;
  const necessario = Math.ceil((meta * proxima.minAtingimentoBp) / BP);
  return { ...proxima, faltaCentavos: Math.max(0, necessario - faturado) };
}

export async function faturadoDoMes(usuarioId: string, competencia: string): Promise<number> {
  const inicio = new Date(`${primeiroDia(competencia)}T00:00:00Z`);
  const fim = new Date(`${ultimoDia(competencia)}T00:00:00Z`);
  const itens = await prisma.itemVenda.findMany({
    where: {
      venda: {
        vendedorId: usuarioId,
        data: { gte: inicio, lte: fim },
        OR: [{ devolvidaEm: null }, { devolvidaEm: { gt: fim } }], // devolvida no mês não conta (R3)
      },
    },
    select: { valorCentavos: true },
  });
  return somar(itens.map((i) => i.valorCentavos));
}

function somaPorTipo(linhas: readonly LinhaExtrato[], filtro: (t: TipoLinha) => boolean) {
  return somar(linhas.filter((l) => filtro(l.tipo)).map((l) => l.valorCentavos));
}

export async function getExtrato(usuarioId: string, competencia: string): Promise<Extrato> {
  const [fechamento, versoes, categoriasDb, meta] = await Promise.all([
    prisma.fechamento.findUnique({ where: { competencia }, include: { versaoRegras: true } }),
    carregarVersoes(prisma),
    prisma.categoria.findMany({ select: { slug: true, nome: true } }),
    prisma.meta.findUnique({ where: { vendedorId_competencia: { vendedorId: usuarioId, competencia } } }),
  ]);
  const categorias = Object.fromEntries(categoriasDb.map((c) => [c.slug, c.nome]));
  const metaCentavos = meta?.valorCentavos ?? 0;

  let linhas: LinhaExtrato[];
  let versao: { id: string; descricao: string };
  let atingimentoBp: number;
  let faturado: number;

  if (fechamento) {
    const gravadas = await prisma.linhaComissao.findMany({
      where: { fechamentoId: fechamento.id, beneficiarioId: usuarioId },
      include: { venda: { select: { numeroPedido: true, clienteNome: true, data: true } } },
      orderBy: [{ tipo: "asc" }, { venda: { data: "asc" } }],
    });
    linhas = gravadas.map((l) => ({
      chave: l.id,
      tipo: l.tipo,
      valorCentavos: l.valorCentavos,
      numeroPedido: l.venda?.numeroPedido ?? null,
      clienteNome: l.venda?.clienteNome ?? null,
      data: l.venda ? paraISO(l.venda.data) : null,
      memoria: l.memoria as Record<string, unknown>,
    }));
    versao = { id: fechamento.versaoRegras.id, descricao: fechamento.versaoRegras.descricao };
    faturado = await faturadoDoMes(usuarioId, competencia);
    atingimentoBp = metaCentavos > 0 ? Math.floor((faturado * BP) / metaCentavos) : 0;
  } else {
    const previa = await previaFechamento(prisma, competencia);
    const minhas = previa.linhas.filter((l) => l.beneficiarioId === usuarioId);
    const vendas = await prisma.venda.findMany({
      where: { id: { in: minhas.flatMap((l) => (l.vendaId ? [l.vendaId] : [])) } },
      select: { id: true, numeroPedido: true, clienteNome: true, data: true },
    });
    const porId = new Map(vendas.map((v) => [v.id, v]));
    linhas = minhas.map((l, i) => {
      const v = l.vendaId ? porId.get(l.vendaId) : undefined;
      return {
        chave: `${l.tipo}-${l.vendaId ?? i}`,
        tipo: l.tipo,
        valorCentavos: l.valorCentavos,
        numeroPedido: v?.numeroPedido ?? null,
        clienteNome: v?.clienteNome ?? null,
        data: v ? paraISO(v.data) : null,
        memoria: l.memoria,
      };
    });
    const resumo = previa.vendedores.find((r) => r.vendedorId === usuarioId);
    faturado = resumo?.faturadoCentavos ?? 0;
    atingimentoBp = resumo?.atingimentoBp ?? 0;
    const v = selecionarVersao(versoes, competencia);
    const descricao = (await prisma.versaoRegras.findUnique({ where: { id: v.id }, select: { descricao: true } }))?.descricao;
    versao = { id: v.id, descricao: descricao ?? "" };
  }

  const regras = versoes.find((v) => v.id === versao.id)!.regras;
  const faixa = faixaPara(regras.faixas, atingimentoBp);
  const ordem: TipoLinha[] = ["BASE", "AJUSTE_TETO", "ESTORNO_DEVOLUCAO", "ESTORNO_INADIMPLENCIA", "REVERSAO_INADIMPLENCIA", "BONUS_GESTOR"];
  linhas.sort((a, b) => ordem.indexOf(a.tipo) - ordem.indexOf(b.tipo) || String(a.data).localeCompare(String(b.data)));

  return {
    competencia,
    fechado: Boolean(fechamento),
    fechadoEm: fechamento ? fechamento.fechadoEm.toISOString() : null,
    versao,
    categorias,
    linhas,
    resumo: {
      faturadoCentavos: faturado,
      metaCentavos,
      atingimentoBp,
      faixa,
      proximaFaixa: calcularProximaFaixa(regras.faixas, atingimentoBp, faturado, metaCentavos),
      baseCentavos: somaPorTipo(linhas, (t) => t === "BASE"),
      ajusteTetoCentavos: somaPorTipo(linhas, (t) => t === "AJUSTE_TETO"),
      estornosCentavos: somaPorTipo(linhas, (t) => t.startsWith("ESTORNO")),
      reversoesCentavos: somaPorTipo(linhas, (t) => t === "REVERSAO_INADIMPLENCIA"),
      bonusCentavos: somaPorTipo(linhas, (t) => t === "BONUS_GESTOR"),
      totalCentavos: somar(linhas.map((l) => l.valorCentavos)),
    },
  };
}
