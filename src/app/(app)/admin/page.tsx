import type { Metadata } from "next";
import Link from "next/link";
import { Suspense, type ReactNode } from "react";
import { Badge, Skeleton } from "@/components/ui";
import { formatarBRL } from "@/domain/commission";
import { rotuloCompetencia } from "@/lib/formato";
import { exigirPapel } from "@/server/auth";
import { situacaoFechamento } from "@/server/fechamento-admin";
import { listarVersoes } from "@/server/versoes";

export const metadata: Metadata = { title: "Visão geral" };

export default function AdminPage() {
  return (
    <div className="mx-auto max-w-5xl space-y-6">
      <div>
        <h1 className="text-2xl font-semibold">Visão geral</h1>
        <p className="text-sm text-muted">O ciclo do mês: regras vigentes → vendas importadas → fechamento.</p>
      </div>
      <Suspense fallback={<Skeleton className="h-44 w-full" />}>
        <Conteudo />
      </Suspense>
    </div>
  );
}

async function Conteudo() {
  await exigirPapel("ADMIN");
  const [versoes, s] = await Promise.all([listarVersoes(), situacaoFechamento()]);
  const vigente = versoes.find((v) => v.vigenteHoje);
  const agendadas = versoes.filter((v) => v.futura).length;

  return (
    <ol className="grid gap-4 md:grid-cols-3">
      <Etapa
        numero={1}
        href="/admin/regras"
        titulo="Regras"
        selo={agendadas > 0 ? <Badge tom="warn">{agendadas} agendada(s)</Badge> : undefined}
      >
        {vigente ? (
          <>
            Vigente desde {rotuloCompetencia(vigente.vigencia)}: <span className="text-fg">{vigente.descricao}</span>
          </>
        ) : (
          "Nenhuma versão vigente"
        )}
      </Etapa>
      <Etapa numero={2} href="/admin/importar" titulo="Importar vendas">
        CSV validado linha a linha. As vendas entram na prévia do mês em aberto.
      </Etapa>
      <Etapa
        numero={3}
        href="/admin/fechamento"
        titulo="Fechamento"
        selo={
          s.bloqueio ? <Badge tom="neg">Bloqueado</Badge> : s.podeFechar ? <Badge tom="pos">Pronto</Badge> : undefined
        }
      >
        {s.proxima && s.conferencia ? (
          <>
            Próximo: {rotuloCompetencia(s.proxima)} · prévia de{" "}
            <span className="tabular text-fg">{formatarBRL(s.conferencia.totalCentavos)}</span>
          </>
        ) : s.historico[0] ? (
          `Último fechado: ${rotuloCompetencia(s.historico[0].competencia)}`
        ) : (
          "Nenhum fechamento ainda"
        )}
      </Etapa>
    </ol>
  );
}

function Etapa({
  numero,
  href,
  titulo,
  selo,
  children,
}: {
  numero: number;
  href: string;
  titulo: string;
  selo?: ReactNode;
  children: ReactNode;
}) {
  return (
    <li>
      <Link
        href={href}
        className="flex h-full flex-col gap-2 rounded-xl border border-line bg-surface p-5 transition-colors hover:border-brand"
      >
        <span className="flex items-center justify-between gap-2">
          <span className="text-sm font-semibold">
            <span className="tabular mr-2 text-muted">{numero}</span>
            {titulo}
          </span>
          {selo}
        </span>
        <span className="text-sm text-muted">{children}</span>
      </Link>
    </li>
  );
}
