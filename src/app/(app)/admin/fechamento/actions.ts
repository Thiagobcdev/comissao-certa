"use server";

import { redirect } from "next/navigation";
import { ErroDeRegra } from "@/domain/commission";
import { hojeISO, rotuloCompetencia } from "@/lib/formato";
import { exigirPapel } from "@/server/auth";
import { prisma } from "@/server/db";
import { ErroDeFechamento, fecharCompetencia } from "@/server/fechamento";

export type EstadoFechamento = { erro?: string };

export async function fecharMes(_anterior: EstadoFechamento, form: FormData): Promise<EstadoFechamento> {
  const usuario = await exigirPapel("ADMIN"); // toda action é um endpoint público: confere de novo
  const competencia = String(form.get("competencia") ?? "");
  if (!/^\d{4}-(0[1-9]|1[0-2])$/.test(competencia)) return { erro: "Competência inválida" };

  const esperado = rotuloCompetencia(competencia);
  if (String(form.get("confirmacao") ?? "").trim().toLowerCase() !== esperado) {
    return { erro: `Digite ${esperado} para confirmar` };
  }

  try {
    await fecharCompetencia(prisma, competencia, usuario.id, hojeISO());
  } catch (e) {
    if (e instanceof ErroDeFechamento || e instanceof ErroDeRegra) return { erro: e.message };
    throw e;
  }
  redirect(`/admin/fechamento?fechado=${competencia}`);
}
