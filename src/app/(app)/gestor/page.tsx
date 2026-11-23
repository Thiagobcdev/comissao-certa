import type { Metadata } from "next";
import { Suspense } from "react";
import { BarraAtingimento } from "@/components/barra-atingimento";
import { GraficoEquipe } from "@/components/grafico-equipe";
import { SeletorCompetencia } from "@/components/seletor-competencia";
import { Badge, Card, CardHeader, Skeleton, Stat } from "@/components/ui";
import { formatarBRL, formatarMultiplicador, formatarPercentual } from "@/domain/commission";
import { competenciaAtual, dataBR, rotuloCompetencia } from "@/lib/formato";
import { cn } from "@/lib/utils";
import { exigirPapel } from "@/server/auth";
import {
  competenciasDaEquipe,
  getEquipeDoGestor,
  getPainel,
  getSerieMensal,
  type Painel,
  type PontoSerie,
  type ResumoEquipePainel,
} from "@/server/consultas/painel";

export const metadata: Metadata = { title: "Minha equipe" };

export default function GestorPage({ searchParams }: PageProps<"/gestor">) {
  return (
    <div className="mx-auto max-w-5xl space-y-6">
      <div>
        <h1 className="text-2xl font-semibold">Minha equipe</h1>
        <p className="text-sm text-muted">Atingimento, comissão e bônus da equipe, com projeção para o fim do mês.</p>
      </div>
      <Suspense fallback={<CarregandoPainel />}>
        <ConteudoPainel searchParams={searchParams} />
      </Suspense>
    </div>
  );
}

async function ConteudoPainel({ searchParams }: { searchParams: PageProps<"/gestor">["searchParams"] }) {
  const usuario = await exigirPapel("GESTOR");
  const equipe = await getEquipeDoGestor(usuario.id);
  if (!equipe) {
    return <Card className="p-6 text-sm text-muted">Você ainda não gerencia nenhuma equipe.</Card>;
  }

  const competencias = await competenciasDaEquipe(equipe.id);
  const pedida = (await searchParams).c;
  const atual = competenciaAtual();
  const competencia =
    typeof pedida === "string" && competencias.includes(pedida)
      ? pedida
      : (competencias.find((c) => c <= atual) ?? competencias[0]);

  if (!competencia) {
    return <Card className="p-6 text-sm text-muted">A equipe ainda não tem metas cadastradas.</Card>;
  }

  const [painel, serie] = await Promise.all([getPainel(equipe.id, competencia), getSerieMensal(equipe.id)]);

  return (
    <>
      <SeletorCompetencia competencias={competencias} atual={competencia} />
      <ResumoEquipe painel={painel} nomeEquipe={equipe.nome} />
      <Ranking painel={painel} />
      <Evolucao serie={serie} />
    </>
  );
}

function StatsEquipe({ r }: { r: ResumoEquipePainel }) {
  const falta = Math.max(0, r.metaCentavos - r.faturadoCentavos);
  return (
    <div className="grid divide-y divide-line sm:grid-cols-3 sm:divide-x sm:divide-y-0">
      <Stat
        label="Faturado / meta da equipe"
        value={formatarPercentual(r.atingimentoBp)}
        hint={`${formatarBRL(r.faturadoCentavos)} de ${formatarBRL(r.metaCentavos)}`}
      />
      <Stat
        label="Comissão da equipe"
        value={formatarBRL(r.comissaoCentavos)}
        tom={r.comissaoCentavos < 0 ? "neg" : undefined}
        hint="Soma dos vendedores, com teto e estornos"
      />
      <Stat
        label="Seu bônus (R5)"
        value={formatarBRL(r.bonusGestorCentavos)}
        tom={r.bonusGestorCentavos > 0 ? "pos" : undefined}
        hint={r.atingiuMeta ? "Meta coletiva atingida · 10% da comissão antes de estornos" : `Faltam ${formatarBRL(falta)} na meta coletiva`}
      />
    </div>
  );
}

function ResumoEquipe({ painel, nomeEquipe }: { painel: Painel; nomeEquipe: string }) {
  const p = painel.projecao;
  return (
    <Card>
      <CardHeader
        title={`Equipe ${nomeEquipe} · ${rotuloCompetencia(painel.competencia)}`}
        description={`Regras: ${painel.versaoDescricao}`}
        action={
          painel.fechado ? (
            <Badge tom="pos">Fechado em {dataBR(painel.fechadoEm!)}</Badge>
          ) : (
            <Badge tom="warn">Prévia · se fechasse hoje</Badge>
          )
        }
      />
      <StatsEquipe r={painel.equipe} />
      <div className="border-t border-line px-5 py-4">
        <BarraAtingimento atingimentoBp={painel.equipe.atingimentoBp} projetadoBp={p?.equipe.atingimentoBp} />
      </div>
      {p && (
        <div className="border-t border-line bg-surface-2/40">
          <div className="flex flex-wrap items-baseline justify-between gap-2 px-5 pt-4">
            <h3 className="text-sm font-semibold">Projeção para o fim do mês</h3>
            <p className="text-sm text-muted">
              Ritmo de {p.diasDecorridos} de {p.diasNoMes} dias, extrapolado e recalculado pelo motor (faixa, teto e bônus)
            </p>
          </div>
          <StatsEquipe r={p.equipe} />
        </div>
      )}
    </Card>
  );
}

function Ranking({ painel }: { painel: Painel }) {
  const aberto = !painel.fechado;
  return (
    <Card>
      <CardHeader
        title="Ranking dos vendedores"
        description={aberto ? "Ordenado pelo atingimento até hoje. A barra clara mostra a projeção." : "Ordenado pelo atingimento no mês."}
      />
      {/* Celular: lista empilhada */}
      <ol className="divide-y divide-line md:hidden">
        {painel.vendedores.map((v, i) => (
          <li key={v.vendedorId} className="space-y-2 px-5 py-4">
            <div className="flex items-baseline justify-between gap-3">
              <p className="font-medium">
                <span className="tabular mr-2 text-muted">{i + 1}</span>
                {v.nome}
              </p>
              <p className="tabular text-sm">
                {formatarPercentual(v.atingimentoBp, 0)} · {formatarMultiplicador(v.faixa.multiplicadorBp)}
              </p>
            </div>
            <BarraAtingimento compacta atingimentoBp={v.atingimentoBp} projetadoBp={v.projecao?.atingimentoBp} />
            <dl className="tabular grid grid-cols-2 gap-x-4 text-sm">
              <dt className="text-xs text-muted">{aberto ? "Prévia" : "Comissão"}</dt>
              {v.projecao && <dt className="text-right text-xs text-muted">Projeção</dt>}
              <dd className={cn("col-start-1 font-medium", v.totalCentavos < 0 && "text-neg")}>{formatarBRL(v.totalCentavos)}</dd>
              {v.projecao && (
                <dd className="text-right font-medium">
                  {formatarBRL(v.projecao.totalCentavos)}{" "}
                  <span className="text-xs font-normal text-muted">({formatarMultiplicador(v.projecao.faixa.multiplicadorBp)})</span>
                </dd>
              )}
            </dl>
            <p className="text-xs text-muted">
              {v.proximaFaixa
                ? `Faltam ${formatarBRL(v.proximaFaixa.faltaCentavos)} para ${formatarMultiplicador(v.proximaFaixa.multiplicadorBp)}`
                : "Na faixa máxima"}
              {v.ajusteTetoCentavos !== 0 && " · no teto"}
            </p>
          </li>
        ))}
      </ol>
      <div className="hidden overflow-x-auto md:block">
        <table className="w-full min-w-[640px] text-sm">
          <caption className="sr-only">Ranking dos vendedores em {rotuloCompetencia(painel.competencia)}</caption>
          <thead>
            <tr className="border-b border-line text-left text-xs uppercase tracking-wide text-muted">
              <th scope="col" className="w-10 px-5 py-2 font-medium">#</th>
              <th scope="col" className="px-2 py-2 font-medium">Vendedor</th>
              <th scope="col" className="w-48 px-2 py-2 font-medium">Atingimento</th>
              <th scope="col" className="px-2 py-2 text-right font-medium">Faixa</th>
              <th scope="col" className="px-2 py-2 text-right font-medium">{aberto ? "Prévia" : "Comissão"}</th>
              {aberto && <th scope="col" className="px-5 py-2 text-right font-medium">Projeção</th>}
            </tr>
          </thead>
          <tbody className="divide-y divide-line">
            {painel.vendedores.map((v, i) => (
              <tr key={v.vendedorId}>
                <td className="tabular px-5 py-3 text-muted">{i + 1}</td>
                <td className="px-2 py-3">
                  <p className="font-medium">{v.nome}</p>
                  <p className="text-xs text-muted">
                    {v.proximaFaixa
                      ? `Faltam ${formatarBRL(v.proximaFaixa.faltaCentavos)} para ${formatarMultiplicador(v.proximaFaixa.multiplicadorBp)}`
                      : "Na faixa máxima"}
                    {v.ajusteTetoCentavos !== 0 && " · no teto"}
                  </p>
                </td>
                <td className="px-2 py-3">
                  <div className="flex items-center gap-2">
                    <BarraAtingimento compacta className="flex-1" atingimentoBp={v.atingimentoBp} projetadoBp={v.projecao?.atingimentoBp} />
                    <span className="tabular w-14 text-right">{formatarPercentual(v.atingimentoBp, 0)}</span>
                  </div>
                </td>
                <td className="tabular px-2 py-3 text-right">{formatarMultiplicador(v.faixa.multiplicadorBp)}</td>
                <td className={cn("tabular px-2 py-3 text-right font-medium", v.totalCentavos < 0 && "text-neg")}>
                  {formatarBRL(v.totalCentavos)}
                </td>
                {v.projecao && (
                  <td className="tabular px-5 py-3 text-right">
                    <p className="font-medium">{formatarBRL(v.projecao.totalCentavos)}</p>
                    <p className="text-xs text-muted">
                      {formatarPercentual(v.projecao.atingimentoBp, 0)} · {formatarMultiplicador(v.projecao.faixa.multiplicadorBp)}
                    </p>
                  </td>
                )}
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </Card>
  );
}

function Evolucao({ serie }: { serie: PontoSerie[] }) {
  const dados = serie.map((s) => ({
    rotulo: rotuloCompetencia(s.competencia),
    aberto: !s.fechado,
    faturadoCentavos: s.faturadoCentavos,
    metaCentavos: s.metaCentavos,
    comissaoCentavos: s.comissaoCentavos,
    faturadoProjetadoCentavos: s.faturadoProjetadoCentavos,
  }));
  return (
    <Card>
      <CardHeader
        title="Evolução mês a mês"
        description={`Faturado, meta coletiva e comissão da equipe${serie.some((s) => !s.fechado) ? " · * mês em aberto (prévia)" : ""}`}
      />
      <div className="px-2 py-4 sm:px-4" aria-hidden>
        <GraficoEquipe dados={dados} />
      </div>
      <details className="border-t border-line px-5 py-3 text-sm">
        <summary className="cursor-pointer text-muted hover:text-fg">Ver dados do gráfico em tabela</summary>
        <div className="mt-3 overflow-x-auto">
          <table className="w-full min-w-[520px]">
            <thead>
              <tr className="text-left text-xs uppercase tracking-wide text-muted">
                <th scope="col" className="py-1 font-medium">Mês</th>
                <th scope="col" className="py-1 text-right font-medium">Faturado</th>
                <th scope="col" className="py-1 text-right font-medium">Meta</th>
                <th scope="col" className="py-1 text-right font-medium">Comissão</th>
                <th scope="col" className="py-1 text-right font-medium">Bônus</th>
              </tr>
            </thead>
            <tbody className="tabular">
              {serie.map((s) => (
                <tr key={s.competencia} className="border-t border-line">
                  <th scope="row" className="py-1.5 text-left font-normal">
                    {rotuloCompetencia(s.competencia)}
                    {!s.fechado && <span className="text-muted"> (prévia)</span>}
                  </th>
                  <td className="py-1.5 text-right">
                    {formatarBRL(s.faturadoCentavos)}
                    {s.faturadoProjetadoCentavos !== null && (
                      <span className="block text-xs text-muted">projeção {formatarBRL(s.faturadoProjetadoCentavos)}</span>
                    )}
                  </td>
                  <td className="py-1.5 text-right">{formatarBRL(s.metaCentavos)}</td>
                  <td className="py-1.5 text-right">{formatarBRL(s.comissaoCentavos)}</td>
                  <td className="py-1.5 text-right">{formatarBRL(s.bonusGestorCentavos)}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </details>
    </Card>
  );
}

function CarregandoPainel() {
  return (
    <div className="space-y-6" aria-busy="true" aria-label="Carregando painel">
      <Skeleton className="h-8 w-96" />
      <Skeleton className="h-56 w-full" />
      <Skeleton className="h-72 w-full" />
      <Skeleton className="h-80 w-full" />
    </div>
  );
}
