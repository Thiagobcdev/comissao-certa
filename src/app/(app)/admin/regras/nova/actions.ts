"use server";

import { redirect } from "next/navigation";
import { z } from "zod";
import { diffRegras, regrasDeFormulario, validarPublicacao, type ErrosFormulario, type Mudanca } from "@/domain/commission";
import { competenciaAtual } from "@/lib/formato";
import { exigirPapel } from "@/server/auth";
import { prisma } from "@/server/db";
import { contextoNovaVersao, ErroDePublicacao, publicarVersao, versaoBase } from "@/server/versoes";

export type EstadoVersao = {
  etapa: "edicao" | "revisao";
  erros: ErrosFormulario;
  /** Erros de processo (vigência, categorias…), exibidos no topo. */
  avisos: string[];
  revisao?: {
    mudancas: Mudanca[];
    base: { vigencia: string; descricao: string } | null;
    /** Competência em aberto cuja prévia muda com esta versão. */
    afetaMesAberto: boolean;
  };
};

const texto = z.string().max(40);
const rascunhoSchema = z.object({
  descricao: z.string(),
  vigencia: z.string(),
  formulario: z.object({
    categorias: z.record(z.string(), texto),
    faixas: z.array(z.object({ minPct: texto, multiplicador: texto })).max(12),
    inadimplenciaDias: texto,
    bonusGestorPct: texto,
    tetoReais: texto,
  }),
});

export type Rascunho = z.infer<typeof rascunhoSchema>;

export async function processarVersao(_anterior: EstadoVersao, form: FormData): Promise<EstadoVersao> {
  const usuario = await exigirPapel("ADMIN"); // toda action é um endpoint público: confere de novo
  const intencao = form.get("intencao");
  if (intencao === "editar") return { etapa: "edicao", erros: {}, avisos: [] };

  let json: unknown;
  try {
    json = JSON.parse(String(form.get("rascunho") ?? ""));
  } catch {
    return { etapa: "edicao", erros: {}, avisos: ["Não foi possível ler o formulário. Recarregue a página."] };
  }
  const rascunho = rascunhoSchema.safeParse(json);
  if (!rascunho.success) {
    return { etapa: "edicao", erros: {}, avisos: ["Formulário inválido. Recarregue a página."] };
  }

  const { descricao, vigencia, formulario } = rascunho.data;
  const erros: ErrosFormulario = {};
  const desc = descricao.trim();
  if (desc.length < 5 || desc.length > 120) erros.descricao = "Descreva a mudança em 5 a 120 caracteres";

  const convertido = regrasDeFormulario(formulario);
  if (!convertido.ok) Object.assign(erros, convertido.erros);
  if (!convertido.ok || Object.keys(erros).length > 0) return { etapa: "edicao", erros, avisos: [] };

  const ctx = await contextoNovaVersao();
  const errosProcesso = validarPublicacao({
    vigencia,
    regras: convertido.regras,
    versoes: ctx.versoes,
    ultimaCompetenciaFechada: ctx.ultimaFechada,
    slugsCategorias: Object.keys(ctx.categorias),
  });
  if (errosProcesso.length > 0) {
    const vigenciaErrada = errosProcesso.find((e) => e.codigo.startsWith("VIGENCIA"));
    return {
      etapa: "edicao",
      erros: vigenciaErrada ? { vigencia: vigenciaErrada.mensagem } : {},
      avisos: errosProcesso.filter((e) => e !== vigenciaErrada).map((e) => e.mensagem),
    };
  }

  if (intencao === "publicar") {
    try {
      await publicarVersao(prisma, { vigencia, descricao: desc, regras: convertido.regras, usuarioId: usuario.id });
    } catch (e) {
      if (e instanceof ErroDePublicacao) return { etapa: "edicao", erros: {}, avisos: e.erros.map((x) => x.mensagem) };
      throw e;
    }
    redirect(`/admin/regras?publicada=${vigencia}`);
  }

  // intencao === "revisar"
  const base = versaoBase(ctx.versoes, vigencia);
  const descricaoBase = base
    ? (await prisma.versaoRegras.findUnique({ where: { id: base.id }, select: { descricao: true } }))?.descricao ?? ""
    : "";
  return {
    etapa: "revisao",
    erros: {},
    avisos: [],
    revisao: {
      mudancas: base ? diffRegras(base.regras, convertido.regras, ctx.categorias) : [],
      base: base ? { vigencia: base.vigenciaInicio.slice(0, 7), descricao: descricaoBase } : null,
      afetaMesAberto: vigencia <= competenciaAtual(),
    },
  };
}
