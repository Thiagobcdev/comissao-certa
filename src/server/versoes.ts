/**
 * Versões de regras (R7): leitura para o admin e publicação.
 * A publicação valida com as regras de domínio (validarPublicacao) DENTRO da transação,
 * para que um fechamento concorrente não deixe passar uma vigência num mês já fechado.
 */
import "server-only";
import type { Prisma } from "@/generated/prisma/client";
import {
  diffRegras,
  paraISO,
  parseRegras,
  selecionarVersao,
  validarPublicacao,
  type ErroPublicacao,
  type Mudanca,
  type Regras,
  type VersaoRegras,
} from "@/domain/commission";
import { competenciaAtual } from "@/lib/formato";
type Leitor = Prisma.TransactionClient; // PrismaClient ou transação
import { prisma } from "./db";
import { carregarVersoes } from "./fechamento";

export type VersaoListada = {
  id: string;
  vigencia: string; // "YYYY-MM"
  descricao: string;
  regras: Regras;
  publicadaPor: string;
  publicadaEm: string;
  fechamentos: number;
  vigenteHoje: boolean;
  futura: boolean;
  mudancas: Mudanca[]; // em relação à versão anterior (vazio na primeira)
};

export async function categoriasPorSlug(db: Leitor = prisma): Promise<Record<string, string>> {
  const cats = await db.categoria.findMany({ select: { slug: true, nome: true }, orderBy: { nome: "asc" } });
  return Object.fromEntries(cats.map((c) => [c.slug, c.nome]));
}

export async function ultimaCompetenciaFechada(db: Leitor = prisma): Promise<string | null> {
  const f = await db.fechamento.findFirst({ orderBy: { competencia: "desc" }, select: { competencia: true } });
  return f?.competencia ?? null;
}

/** Versões da mais nova para a mais antiga, com o diff de cada uma contra a anterior. */
export async function listarVersoes(): Promise<VersaoListada[]> {
  const [versoes, nomes] = await Promise.all([
    prisma.versaoRegras.findMany({
      orderBy: { vigenciaInicio: "asc" },
      include: { publicadaPor: { select: { nome: true } }, _count: { select: { fechamentos: true } } },
    }),
    categoriasPorSlug(),
  ]);
  const hoje = competenciaAtual();
  const doDominio: VersaoRegras[] = versoes.map((v) => ({
    id: v.id,
    vigenciaInicio: paraISO(v.vigenciaInicio),
    regras: parseRegras(v.regras),
  }));
  const vigenteId = doDominio.some((v) => v.vigenciaInicio <= `${hoje}-01`) ? selecionarVersao(doDominio, hoje).id : null;

  return versoes
    .map((v, i) => ({
      id: v.id,
      vigencia: doDominio[i].vigenciaInicio.slice(0, 7),
      descricao: v.descricao,
      regras: doDominio[i].regras,
      publicadaPor: v.publicadaPor.nome,
      publicadaEm: v.publicadaEm.toISOString(),
      fechamentos: v._count.fechamentos,
      vigenteHoje: v.id === vigenteId,
      futura: doDominio[i].vigenciaInicio > `${hoje}-01`,
      mudancas: i === 0 ? [] : diffRegras(doDominio[i - 1].regras, doDominio[i].regras, nomes),
    }))
    .reverse();
}

export type ContextoNovaVersao = {
  categorias: Record<string, string>;
  ultimaFechada: string | null;
  versoes: VersaoRegras[];
};

export async function contextoNovaVersao(db: Leitor = prisma): Promise<ContextoNovaVersao> {
  const [categorias, ultimaFechada, versoes] = await Promise.all([
    categoriasPorSlug(db),
    ultimaCompetenciaFechada(db),
    carregarVersoes(db),
  ]);
  return { categorias, ultimaFechada, versoes };
}

/** A versão que a nova substituiria a partir da vigência escolhida (null se não houver anterior). */
export function versaoBase(versoes: readonly VersaoRegras[], vigencia: string): VersaoRegras | null {
  const anteriores = versoes.filter((v) => v.vigenciaInicio < `${vigencia}-01`);
  return anteriores.length > 0 ? selecionarVersao(anteriores, vigencia) : null;
}

export class ErroDePublicacao extends Error {
  constructor(public readonly erros: ErroPublicacao[]) {
    super(erros.map((e) => e.mensagem).join("; "));
    this.name = "ErroDePublicacao";
  }
}

export async function publicarVersao(
  db: typeof prisma,
  p: { vigencia: string; descricao: string; regras: Regras; usuarioId: string },
): Promise<{ id: string }> {
  return db.$transaction(
    async (tx) => {
      const ctx = await contextoNovaVersao(tx);
      const erros = validarPublicacao({
        vigencia: p.vigencia,
        regras: p.regras,
        versoes: ctx.versoes,
        ultimaCompetenciaFechada: ctx.ultimaFechada,
        slugsCategorias: Object.keys(ctx.categorias),
      });
      if (erros.length > 0) throw new ErroDePublicacao(erros);

      const versao = await tx.versaoRegras.create({
        data: {
          vigenciaInicio: new Date(`${p.vigencia}-01T00:00:00Z`),
          descricao: p.descricao,
          regras: p.regras as Prisma.InputJsonValue,
          publicadaPorId: p.usuarioId,
        },
      });
      const base = versaoBase(ctx.versoes, p.vigencia);
      await tx.auditoria.create({
        data: {
          usuarioId: p.usuarioId,
          acao: "VERSAO_REGRAS_PUBLICADA",
          detalhes: {
            versaoId: versao.id,
            vigencia: p.vigencia,
            descricao: p.descricao,
            mudancas: base ? diffRegras(base.regras, p.regras, ctx.categorias) : [],
          } as Prisma.InputJsonValue,
        },
      });
      return { id: versao.id };
    },
    { isolationLevel: "Serializable" },
  );
}
