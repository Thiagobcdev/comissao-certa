"use server";

import { redirect } from "next/navigation";
import type { ErroImportacao, ResumoImportacao } from "@/domain/vendas/importacao";
import { exigirPapel } from "@/server/auth";
import { ErroDeImportacao, importarCsv, validarCsv } from "@/server/importacao";

/** O limite padrão do corpo de uma Server Action é 1 MB; o arquivo fica bem abaixo disso. */
const LIMITE_BYTES = 512 * 1024;
const MAX_ERROS_EXIBIDOS = 200;

export type EstadoImportacao = {
  etapa: "inicio" | "erros" | "pronto";
  arquivo?: string;
  erros: ErroImportacao[];
  totalErros: number;
  resumo: ResumoImportacao | null;
  aviso?: string;
};

const erroGeral = (aviso: string): EstadoImportacao => ({ etapa: "inicio", erros: [], totalErros: 0, resumo: null, aviso });

export async function processarImportacao(_anterior: EstadoImportacao, form: FormData): Promise<EstadoImportacao> {
  const usuario = await exigirPapel("ADMIN"); // toda action é um endpoint público: confere de novo
  const texto = form.get("csv");
  const arquivo = String(form.get("arquivo") ?? "vendas.csv").slice(0, 120);
  if (typeof texto !== "string" || texto.trim() === "") return erroGeral("Escolha um arquivo CSV.");
  if (new TextEncoder().encode(texto).length > LIMITE_BYTES) return erroGeral("Arquivo acima de 512 KB: divida em partes.");

  if (form.get("intencao") === "importar") {
    try {
      const resumo = await importarCsv(texto, { usuarioId: usuario.id, arquivo });
      redirect(`/admin/importar?importados=${resumo.pedidos}&total=${resumo.totalCentavos}`);
    } catch (e) {
      if (!(e instanceof ErroDeImportacao)) throw e; // inclui o redirect, que é uma exceção de controle
      return {
        etapa: "erros",
        arquivo,
        erros: e.erros.slice(0, MAX_ERROS_EXIBIDOS),
        totalErros: e.erros.length,
        resumo: null,
        aviso: "Os dados mudaram desde a validação. Nada foi gravado.",
      };
    }
  }

  const r = await validarCsv(texto);
  return r.erros.length > 0
    ? { etapa: "erros", arquivo, erros: r.erros.slice(0, MAX_ERROS_EXIBIDOS), totalErros: r.erros.length, resumo: null }
    : { etapa: "pronto", arquivo, erros: [], totalErros: 0, resumo: r.resumo };
}
