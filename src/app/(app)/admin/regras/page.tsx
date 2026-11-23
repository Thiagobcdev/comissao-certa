import type { Metadata } from "next";
import Link from "next/link";
import { Suspense } from "react";
import { Badge, Card, CardHeader, Skeleton } from "@/components/ui";
import { formatarBRL, formatarMultiplicador, formatarPercentual } from "@/domain/commission";
import { dataBR, rotuloCompetencia } from "@/lib/formato";
import { exigirPapel } from "@/server/auth";
import { categoriasPorSlug, listarVersoes, type VersaoListada } from "@/server/versoes";

export const metadata: Metadata = { title: "Regras" };

export default function RegrasPage({ searchParams }: PageProps<"/admin/regras">) {
  return (
    <div className="mx-auto max-w-5xl space-y-6">
      <div className="flex flex-wrap items-end justify-between gap-4">
        <div>
          <h1 className="text-2xl font-semibold">Regras de comissão</h1>
          <p className="text-sm text-muted">
            Cada versão vale a partir do mês da vigência. Publicar uma nova nunca altera meses já fechados (R7, R8).
          </p>
        </div>
        <Link
          href="/admin/regras/nova"
          className="inline-flex h-10 items-center rounded-lg bg-brand px-4 text-sm font-medium text-brand-fg hover:bg-brand/90"
        >
          Nova versão
        </Link>
      </div>
      <Suspense fallback={<Skeleton className="h-96 w-full" />}>
        <Conteudo searchParams={searchParams} />
      </Suspense>
    </div>
  );
}

async function Conteudo({ searchParams }: { searchParams: PageProps<"/admin/regras">["searchParams"] }) {
  await exigirPapel("ADMIN");
  const [versoes, nomes, { publicada }] = await Promise.all([listarVersoes(), categoriasPorSlug(), searchParams]);

  return (
    <>
      {typeof publicada === "string" && (
        <p role="status" className="rounded-lg bg-pos-bg px-4 py-3 text-sm text-pos">
          Versão publicada. Vale a partir de {rotuloCompetencia(publicada)}.
        </p>
      )}
      <ol className="space-y-4">
        {versoes.map((v) => (
          <li key={v.id}>
            <CartaoVersao v={v} nomes={nomes} />
          </li>
        ))}
      </ol>
    </>
  );
}

function CartaoVersao({ v, nomes }: { v: VersaoListada; nomes: Record<string, string> }) {
  const r = v.regras;
  return (
    <Card className={v.vigenteHoje ? "border-brand" : undefined}>
      <CardHeader
        title={`A partir de ${rotuloCompetencia(v.vigencia)} · ${v.descricao}`}
        description={`Publicada por ${v.publicadaPor} em ${dataBR(v.publicadaEm)} · usada em ${v.fechamentos} fechamento(s)`}
        action={
          v.vigenteHoje ? <Badge tom="brand">Vigente</Badge> : v.futura ? <Badge tom="warn">Agendada</Badge> : <Badge>Anterior</Badge>
        }
      />
      {v.mudancas.length > 0 && (
        <div className="border-b border-line px-5 py-3 text-sm">
          <p className="text-xs font-medium uppercase tracking-wide text-muted">O que mudou em relação à anterior</p>
          <ul className="mt-1 space-y-0.5">
            {v.mudancas.map((m) => (
              <li key={m.campo}>
                {m.campo}: <span className="tabular text-muted">{m.antes ?? "—"}</span> →{" "}
                <span className="tabular font-medium">{m.depois ?? "removida"}</span>
              </li>
            ))}
          </ul>
        </div>
      )}
      <details className="group">
        <summary className="cursor-pointer list-none px-5 py-3 text-sm text-muted hover:text-fg [&::-webkit-details-marker]:hidden">
          <span aria-hidden className="mr-2 inline-block transition-transform group-open:rotate-90">›</span>
          Ver todos os parâmetros
        </summary>
        <dl className="tabular grid gap-x-8 gap-y-3 border-t border-line px-5 py-4 text-sm sm:grid-cols-2">
          <div>
            <dt className="text-xs font-medium uppercase tracking-wide text-muted">Comissão por categoria (R1)</dt>
            <dd>
              {Object.entries(r.categorias).map(([slug, bp]) => (
                <p key={slug}>
                  {nomes[slug] ?? slug}: {formatarPercentual(bp, 2)}
                </p>
              ))}
            </dd>
          </div>
          <div>
            <dt className="text-xs font-medium uppercase tracking-wide text-muted">Faixas (R2)</dt>
            <dd>
              {r.faixas.map((f) => (
                <p key={f.minAtingimentoBp}>
                  a partir de {formatarPercentual(f.minAtingimentoBp, 2)}: {formatarMultiplicador(f.multiplicadorBp)}
                </p>
              ))}
            </dd>
          </div>
          <div>
            <dt className="text-xs font-medium uppercase tracking-wide text-muted">Inadimplência (R4)</dt>
            <dd>estorno após {r.inadimplenciaDias} dias do vencimento</dd>
          </div>
          <div>
            <dt className="text-xs font-medium uppercase tracking-wide text-muted">Bônus do gestor (R5) · Teto (R6)</dt>
            <dd>
              {formatarPercentual(r.bonusGestorBp, 2)} ·{" "}
              {r.tetoMensalCentavos === null ? "sem teto" : `${formatarBRL(r.tetoMensalCentavos)} por mês`}
            </dd>
          </div>
        </dl>
      </details>
    </Card>
  );
}
