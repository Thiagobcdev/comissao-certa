import type { Metadata } from "next";
import { Suspense } from "react";
import { Card, Skeleton } from "@/components/ui";
import { entradaDoVendedor } from "@/domain/commission";
import { competenciaAtual, rotuloCompetencia } from "@/lib/formato";
import { exigirPapel } from "@/server/auth";
import { prisma } from "@/server/db";
import { montarEntrada } from "@/server/fechamento";
import { categoriasPorSlug } from "@/server/versoes";
import { Simulador } from "./simulador";

export const metadata: Metadata = { title: "Simulador" };

export default function SimuladorPage() {
  return (
    <div className="mx-auto max-w-5xl space-y-6">
      <div>
        <h1 className="text-2xl font-semibold">Simulador</h1>
        <p className="text-sm text-muted">Quanto a sua comissão muda se você vender mais até o fim do mês.</p>
      </div>
      <Suspense fallback={<Skeleton className="h-96 w-full" />}>
        <Conteudo />
      </Suspense>
    </div>
  );
}

async function Conteudo() {
  const usuario = await exigirPapel("VENDEDOR");
  const competencia = competenciaAtual();
  const [fechado, meta, categorias] = await Promise.all([
    prisma.fechamento.findUnique({ where: { competencia }, select: { id: true } }),
    prisma.meta.findUnique({ where: { vendedorId_competencia: { vendedorId: usuario.id, competencia } } }),
    categoriasPorSlug(),
  ]);

  if (fechado) {
    return <Card className="p-6 text-sm text-muted">{rotuloCompetencia(competencia)} já foi fechado: não há o que simular.</Card>;
  }
  if (!meta) {
    return (
      <Card className="p-6 text-sm text-muted">
        Você ainda não tem meta em {rotuloCompetencia(competencia)}. O simulador fica disponível quando a meta for cadastrada.
      </Card>
    );
  }

  // Só os dados deste vendedor vão para o navegador (sem vendas de colegas nem metas de equipe).
  const entrada = entradaDoVendedor(await montarEntrada(prisma, competencia), usuario.id);
  return <Simulador entrada={entrada} vendedorId={usuario.id} categorias={categorias} />;
}
