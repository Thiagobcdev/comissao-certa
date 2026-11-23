import type { Metadata } from "next";
import { Suspense } from "react";
import { Badge, Card, CardHeader, Skeleton } from "@/components/ui";
import { formatarBRL, formatarPercentual, type TipoLinha } from "@/domain/commission";
import { dataBR, rotuloCompetencia } from "@/lib/formato";
import { cn } from "@/lib/utils";
import { exigirPapel } from "@/server/auth";
import { situacaoFechamento, type SituacaoFechamento } from "@/server/fechamento-admin";
import { ConfirmarFechamento } from "./confirmar-fechamento";

export const metadata: Metadata = { title: "Fechamento" };

const ROTULO_TIPO: Record<TipoLinha, string> = {
  BASE: "Comissões (R1×R2)",
  AJUSTE_TETO: "Ajustes ao teto (R6)",
  ESTORNO_DEVOLUCAO: "Estornos por devolução (R3)",
  ESTORNO_INADIMPLENCIA: "Estornos por inadimplência (R4)",
  REVERSAO_INADIMPLENCIA: "Reversões por pagamento (R4)",
  BONUS_GESTOR: "Bônus de gestor (R5)",
};

export default function FechamentoPage({ searchParams }: PageProps<"/admin/fechamento">) {
  return (
    <div className="mx-auto max-w-5xl space-y-6">
      <div>
        <h1 className="text-2xl font-semibold">Fechamento do mês</h1>
        <p className="text-sm text-muted">Prévia, conferência e fechamento. Um mês fechado nunca muda (R8).</p>
      </div>
      <Suspense fallback={<Skeleton className="h-96 w-full" />}>
        <Conteudo searchParams={searchParams} />
      </Suspense>
    </div>
  );
}

async function Conteudo({ searchParams }: { searchParams: PageProps<"/admin/fechamento">["searchParams"] }) {
  await exigirPapel("ADMIN");
  const [s, { fechado }] = await Promise.all([situacaoFechamento(), searchParams]);
  return (
    <>
      {typeof fechado === "string" && (
        <p role="status" className="rounded-lg bg-pos-bg px-4 py-3 text-sm text-pos">
          {rotuloCompetencia(fechado)} fechado. Os extratos e painéis já mostram os valores gravados.
        </p>
      )}
      {s.proxima ? <ProximoFechamento s={s} /> : (
        <Card className="p-6 text-sm text-muted">Nenhum mês pendente de fechamento.</Card>
      )}
      <Historico s={s} />
    </>
  );
}

function ProximoFechamento({ s }: { s: SituacaoFechamento }) {
  const c = s.conferencia;
  const competencia = s.proxima!;
  return (
    <Card>
      <CardHeader
        title={`Próximo fechamento · ${rotuloCompetencia(competencia)}`}
        description="Valores calculados agora pelo motor. Nada é gravado até você confirmar."
        action={
          s.bloqueio ? <Badge tom="neg">Bloqueado</Badge> : s.podeFechar ? <Badge tom="pos">Pronto para fechar</Badge> : <Badge tom="warn">Mês em andamento</Badge>
        }
      />
      {s.bloqueio && <p role="alert" className="border-b border-line bg-neg-bg px-5 py-3 text-sm text-neg">{s.bloqueio}</p>}

      {c && (
        <>
          <div className="grid gap-6 px-5 py-4 lg:grid-cols-2">
            <section aria-labelledby="por-tipo">
              <h3 id="por-tipo" className="text-xs font-medium uppercase tracking-wide text-muted">Por tipo de lançamento</h3>
              <table className="tabular mt-2 w-full text-sm">
                <tbody className="divide-y divide-line">
                  {c.porTipo.map((t) => (
                    <tr key={t.tipo}>
                      <th scope="row" className="py-1.5 text-left font-normal">
                        {ROTULO_TIPO[t.tipo]} <span className="text-muted">· {t.quantidade}</span>
                      </th>
                      <td className={cn("py-1.5 text-right", t.centavos < 0 && "text-neg")}>{formatarBRL(t.centavos)}</td>
                    </tr>
                  ))}
                  <tr className="font-semibold">
                    <th scope="row" className="py-1.5 text-left">Total a pagar · {c.linhas} lançamentos</th>
                    <td className="py-1.5 text-right">{formatarBRL(c.totalCentavos)}</td>
                  </tr>
                </tbody>
              </table>
            </section>
            <section aria-labelledby="por-equipe">
              <h3 id="por-equipe" className="text-xs font-medium uppercase tracking-wide text-muted">Por equipe</h3>
              <table className="tabular mt-2 w-full text-sm">
                <thead>
                  <tr className="text-left text-xs text-muted">
                    <th scope="col" className="py-1 font-medium">Equipe</th>
                    <th scope="col" className="py-1 text-right font-medium">Meta</th>
                    <th scope="col" className="py-1 text-right font-medium">Comissão</th>
                    <th scope="col" className="py-1 text-right font-medium">Bônus</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-line">
                  {c.porEquipe.map((e) => (
                    <tr key={e.nome}>
                      <th scope="row" className="py-1.5 text-left font-normal">{e.nome}</th>
                      <td className={cn("py-1.5 text-right", e.atingiuMeta && "text-pos")}>
                        {e.metaCentavos > 0 ? formatarPercentual(Math.floor((e.faturadoCentavos * 10_000) / e.metaCentavos), 0) : "—"}
                      </td>
                      <td className="py-1.5 text-right">{formatarBRL(e.comissaoCentavos)}</td>
                      <td className="py-1.5 text-right">{formatarBRL(e.bonusGestorCentavos)}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </section>
          </div>

          {c.alertas.length > 0 && (
            <div className="border-t border-line px-5 py-4">
              <h3 className="text-xs font-medium uppercase tracking-wide text-muted">Para conferir</h3>
              <ul className="mt-2 space-y-1 text-sm">
                {c.alertas.map((a) => (
                  <li key={a.texto} className="flex gap-2">
                    <span aria-hidden className={cn(a.tom === "neg" ? "text-neg" : a.tom === "warn" ? "text-warn" : "text-muted")}>●</span>
                    {a.texto}
                  </li>
                ))}
              </ul>
            </div>
          )}

          <div className="border-t border-line bg-surface-2/40 px-5 py-4">
            {s.podeFechar ? (
              <ConfirmarFechamento competencia={competencia} totalTexto={formatarBRL(c.totalCentavos)} />
            ) : (
              <p className="text-sm text-muted">
                {rotuloCompetencia(competencia)} termina em {dataBR(s.terminaEm!)}. O fechamento fica disponível a partir do dia
                seguinte; até lá, vendas importadas e pagamentos ainda mudam estes valores.
              </p>
            )}
          </div>
        </>
      )}
    </Card>
  );
}

function Historico({ s }: { s: SituacaoFechamento }) {
  if (s.historico.length === 0) return null;
  return (
    <Card>
      <CardHeader title="Meses fechados" description="Gravados e imutáveis. Cada um guarda a versão de regras usada." />
      <div className="overflow-x-auto">
        <table className="tabular w-full min-w-[640px] text-sm">
          <thead>
            <tr className="border-b border-line text-left text-xs uppercase tracking-wide text-muted">
              <th scope="col" className="px-5 py-2 font-medium">Mês</th>
              <th scope="col" className="px-2 py-2 font-medium">Regras</th>
              <th scope="col" className="px-2 py-2 text-right font-medium">Lançamentos</th>
              <th scope="col" className="px-2 py-2 text-right font-medium">Total</th>
              <th scope="col" className="px-5 py-2 text-right font-medium">Fechado</th>
            </tr>
          </thead>
          <tbody className="divide-y divide-line">
            {s.historico.map((h) => (
              <tr key={h.competencia}>
                <th scope="row" className="px-5 py-2 text-left font-medium">{rotuloCompetencia(h.competencia)}</th>
                <td className="max-w-64 truncate px-2 py-2 text-muted" title={h.versao}>{h.versao}</td>
                <td className="px-2 py-2 text-right">{h.linhas}</td>
                <td className="px-2 py-2 text-right">{formatarBRL(h.totalCentavos)}</td>
                <td className="px-5 py-2 text-right text-muted">
                  {dataBR(h.fechadoEm)} · {h.fechadoPor}
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </Card>
  );
}
