/**
 * Importação de vendas: monta o contexto a partir do banco e grava tudo ou nada.
 * A gravação valida de novo dentro da transação (pedido duplicado, mês fechado no meio tempo).
 */
import "server-only";
import type { Prisma } from "@/generated/prisma/client";
import {
  lerCsv,
  lerData,
  semAcento,
  validarImportacao,
  type ErroImportacao,
  type ResumoImportacao,
  type VendaNova,
} from "@/domain/vendas/importacao";
import { hojeISO } from "@/lib/formato";
import { prisma } from "./db";
import { ultimaCompetenciaFechada } from "./versoes";

type Leitor = Prisma.TransactionClient;

export type ResultadoValidacao = {
  vendas: VendaNova[];
  erros: ErroImportacao[];
  resumo: ResumoImportacao | null;
};


export async function validarCsv(texto: string, db: Leitor = prisma, hoje: string = hojeISO()): Promise<ResultadoValidacao> {
  const lido = lerCsv(texto);
  if (!lido.ok) return { vendas: [], erros: lido.erros, resumo: null };

  const numeros = [...new Set(lido.linhas.map((l) => l.campos.pedido.trim()))];
  const competencias = [
    ...new Set(lido.linhas.flatMap((l) => lerData(l.campos.data)?.slice(0, 7) ?? [])),
  ];

  const [vendedores, categorias, existentes, ultimaFechada] = await Promise.all([
    db.usuario.findMany({
      where: { papel: "VENDEDOR" },
      select: { id: true, nome: true, email: true, metas: { where: { competencia: { in: competencias } }, select: { competencia: true } } },
    }),
    db.categoria.findMany({ select: { slug: true, nome: true } }),
    db.venda.findMany({ where: { numeroPedido: { in: numeros } }, select: { numeroPedido: true } }),
    ultimaCompetenciaFechada(db),
  ]);

  const r = validarImportacao(lido.linhas, {
    hoje,
    ultimaCompetenciaFechada: ultimaFechada,
    vendedores: Object.fromEntries(
      vendedores.map((v) => [v.email.toLowerCase(), { id: v.id, nome: v.nome, competenciasComMeta: v.metas.map((m) => m.competencia) }]),
    ),
    categorias: Object.fromEntries(categorias.flatMap((c) => [[semAcento(c.slug), c.slug], [semAcento(c.nome), c.slug]])),
    pedidosExistentes: new Set(existentes.map((e) => e.numeroPedido)),
  });
  return { vendas: r.vendas, erros: r.erros, resumo: r.erros.length === 0 ? r.resumo : null };
}

export class ErroDeImportacao extends Error {
  constructor(public readonly erros: ErroImportacao[]) {
    super(`${erros.length} erro(s) na importação`);
    this.name = "ErroDeImportacao";
  }
}

/** Tudo ou nada: valida de novo na transação e grava vendas, itens e auditoria juntos. */
export async function importarCsv(
  texto: string,
  p: { usuarioId: string; arquivo: string },
): Promise<ResumoImportacao> {
  return prisma.$transaction(
    async (tx) => {
      const r = await validarCsv(texto, tx);
      if (r.erros.length > 0 || !r.resumo) throw new ErroDeImportacao(r.erros);

      const categorias = new Map((await tx.categoria.findMany({ select: { id: true, slug: true } })).map((c) => [c.slug, c.id]));
      for (const v of r.vendas) {
        await tx.venda.create({
          data: {
            numeroPedido: v.numeroPedido,
            vendedorId: v.vendedorId,
            clienteNome: v.clienteNome,
            data: new Date(`${v.data}T00:00:00Z`),
            vencimento: new Date(`${v.vencimento}T00:00:00Z`),
            itens: { create: v.itens.map((i) => ({ categoriaId: categorias.get(i.categoria)!, valorCentavos: i.valorCentavos })) },
          },
        });
      }
      await tx.auditoria.create({
        data: {
          usuarioId: p.usuarioId,
          acao: "VENDAS_IMPORTADAS",
          detalhes: { arquivo: p.arquivo, ...r.resumo } as Prisma.InputJsonValue,
        },
      });
      return r.resumo;
    },
    { isolationLevel: "Serializable", timeout: 60_000 },
  );
}
