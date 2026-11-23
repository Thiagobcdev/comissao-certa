import type { Metadata } from "next";
import Link from "next/link";
import { Suspense } from "react";
import { Skeleton } from "@/components/ui";
import { formularioDeRegras, proximaCompetencia, selecionarVersao } from "@/domain/commission";
import { competenciaAtual } from "@/lib/formato";
import { exigirPapel } from "@/server/auth";
import { contextoNovaVersao } from "@/server/versoes";
import { FormularioVersao } from "./formulario-versao";

export const metadata: Metadata = { title: "Nova versão de regras" };

export default function NovaVersaoPage() {
  return (
    <div className="mx-auto max-w-5xl space-y-6">
      <div>
        <Link href="/admin/regras" className="text-sm text-muted hover:text-fg">
          ← Regras
        </Link>
        <h1 className="mt-1 text-2xl font-semibold">Nova versão de regras</h1>
        <p className="text-sm text-muted">
          Os campos começam com os valores da versão vigente. Ajuste o que muda, revise e publique.
        </p>
      </div>
      <Suspense fallback={<Skeleton className="h-[40rem] w-full" />}>
        <Conteudo />
      </Suspense>
    </div>
  );
}

async function Conteudo() {
  await exigirPapel("ADMIN");
  const ctx = await contextoNovaVersao();
  const atual = competenciaAtual();
  const vigenciaMinima = ctx.ultimaFechada ? proximaCompetencia(ctx.ultimaFechada) : atual;
  const referencia = selecionarVersao(ctx.versoes, vigenciaMinima > atual ? vigenciaMinima : atual);
  // garante um campo para toda categoria existente, mesmo que a versão de referência não tenha
  const inicial = formularioDeRegras(referencia.regras);
  for (const slug of Object.keys(ctx.categorias)) inicial.categorias[slug] ??= "";

  return <FormularioVersao inicial={inicial} categorias={ctx.categorias} vigenciaMinima={vigenciaMinima} />;
}
