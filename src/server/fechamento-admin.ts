/**
 * Tela de fechamento do admin: qual é o próximo mês a fechar, a prévia com conferência
 * e o histórico de fechamentos gravados.
 */
import "server-only";
import {
  conferirFechamento,
  ErroDeRegra,
  proximaCompetencia,
  ultimoDia,
  type Conferencia,
} from "@/domain/commission";
import { hojeISO } from "@/lib/formato";
import { prisma } from "./db";
import { previaFechamento } from "./fechamento";

export type SituacaoFechamento = {
  /** Próxima competência a fechar (null se não houver vendas). */
  proxima: string | null;
  /** O mês já terminou e pode ser fechado. */
  podeFechar: boolean;
  /** Último dia da competência (para explicar quando poderá ser fechada). */
  terminaEm: string | null;
  conferencia: Conferencia | null;
  /** Erro de regra que impede o fechamento (ex.: vendedor sem meta). */
  bloqueio: string | null;
  historico: {
    competencia: string;
    totalCentavos: number;
    linhas: number;
    versao: string;
    fechadoPor: string;
    fechadoEm: string;
  }[];
};

export async function situacaoFechamento(hoje: string = hojeISO()): Promise<SituacaoFechamento> {
  const [fechamentos, primeiraVenda] = await Promise.all([
    prisma.fechamento.findMany({
      orderBy: { competencia: "desc" },
      include: {
        versaoRegras: { select: { descricao: true } },
        fechadoPor: { select: { nome: true } },
        _count: { select: { linhas: true } },
      },
    }),
    prisma.venda.findFirst({ orderBy: { data: "asc" }, select: { data: true } }),
  ]);

  const historico = fechamentos.map((f) => ({
    competencia: f.competencia,
    totalCentavos: f.totalCentavos,
    linhas: f._count.linhas,
    versao: f.versaoRegras.descricao,
    fechadoPor: f.fechadoPor.nome,
    fechadoEm: f.fechadoEm.toISOString(),
  }));

  const ultima = fechamentos[0]?.competencia ?? null;
  const proxima = ultima ? proximaCompetencia(ultima) : (primeiraVenda?.data.toISOString().slice(0, 7) ?? null);
  if (!proxima || `${proxima}-01` > hoje) {
    return { proxima: null, podeFechar: false, terminaEm: null, conferencia: null, bloqueio: null, historico };
  }

  let conferencia: Conferencia | null = null;
  let bloqueio: string | null = null;
  try {
    conferencia = conferirFechamento(await previaFechamento(prisma, proxima));
  } catch (e) {
    if (!(e instanceof ErroDeRegra)) throw e;
    bloqueio = e.message;
  }
  const terminaEm = ultimoDia(proxima);
  return { proxima, podeFechar: hoje > terminaEm && !bloqueio, terminaEm, conferencia, bloqueio, historico };
}
