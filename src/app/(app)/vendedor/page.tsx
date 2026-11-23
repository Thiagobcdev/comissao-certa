import type { Metadata } from "next";
import { Suspense } from "react";
import { BarraAtingimento } from "@/components/barra-atingimento";
import { MemoriaCalculo } from "@/components/memoria-calculo";
import { SeletorCompetencia } from "@/components/seletor-competencia";
import { Badge, Card, CardHeader, Skeleton, Stat } from "@/components/ui";
import { formatarBRL, formatarMultiplicador, formatarPercentual, type TipoLinha } from "@/domain/commission";
import { competenciaAtual, dataBR, rotuloCompetencia } from "@/lib/formato";
import { cn } from "@/lib/utils";
import { exigirPapel } from "@/server/auth";
import { competenciasDisponiveis, getExtrato, type Extrato } from "@/server/consultas/extrato";

export const metadata: Metadata = { title: "Meu extrato" };

const ROTULO: Record<TipoLinha, { texto: string; tom: "neutro" | "pos" | "neg" | "warn" | "brand" }> = {
  BASE: { texto: "Comissão", tom: "neutro" },
  AJUSTE_TETO: { texto: "Ajuste ao teto", tom: "warn" },
  ESTORNO_DEVOLUCAO: { texto: "Estorno · devolução", tom: "neg" },
  ESTORNO_INADIMPLENCIA: { texto: "Estorno · inadimplência", tom: "neg" },
  REVERSAO_INADIMPLENCIA: { texto: "Reversão · pagamento", tom: "pos" },
  BONUS_GESTOR: { texto: "Bônus de gestor", tom: "brand" },
};

export default function VendedorPage({ searchParams }: PageProps<"/vendedor">) {
  return (
    <div className="mx-auto max-w-5xl space-y-6">
      <div>
        <h1 className="text-2xl font-semibold">Meu extrato</h1>
        <p className="text-sm text-muted">Sua comissão mês a mês, com o cálculo de cada valor.</p>
      </div>
      <Suspense fallback={<CarregandoExtrato />}>
        <ConteudoExtrato searchParams={searchParams} />
      </Suspense>
    </div>
  );
}

async function ConteudoExtrato({ searchParams }: { searchParams: PageProps<"/vendedor">["searchParams"] }) {
  const usuario = await exigirPapel("VENDEDOR");
  const competencias = await competenciasDisponiveis(usuario.id);
  const pedida = (await searchParams).c;
  const atual = competenciaAtual();
  const competencia =
    typeof pedida === "string" && competencias.includes(pedida)
      ? pedida
      : (competencias.find((c) => c <= atual) ?? competencias[0]);

  if (!competencia) {
    return <Card className="p-6 text-sm text-muted">Você ainda não tem metas cadastradas.</Card>;
  }

  const extrato = await getExtrato(usuario.id, competencia);

  return (
    <>
      <SeletorCompetencia competencias={competencias} atual={competencia} />
      <ResumoMes extrato={extrato} />
      <Linhas extrato={extrato} />
    </>
  );
}

function ResumoMes({ extrato }: { extrato: Extrato }) {
  const r = extrato.resumo;

  return (
    <Card>
      <CardHeader
        title={`Competência ${rotuloCompetencia(extrato.competencia)}`}
        description={`Regras: ${extrato.versao.descricao}`}
        action={
          extrato.fechado ? (
            <Badge tom="pos">Fechado em {dataBR(extrato.fechadoEm!)}</Badge>
          ) : (
            <Badge tom="warn">Prévia · pode mudar até o fechamento</Badge>
          )
        }
      />
      <div className="grid divide-y divide-line sm:grid-cols-3 sm:divide-x sm:divide-y-0">
        <Stat
          label="Comissão do mês"
          value={formatarBRL(r.totalCentavos)}
          tom={r.totalCentavos < 0 ? "neg" : undefined}
          hint={
            r.estornosCentavos !== 0 || r.ajusteTetoCentavos !== 0
              ? `Inclui ${formatarBRL(r.estornosCentavos + r.ajusteTetoCentavos)} de estornos/ajustes`
              : "Sem estornos no mês"
          }
        />
        <Stat
          label="Faturado / meta"
          value={formatarPercentual(r.atingimentoBp)}
          hint={`${formatarBRL(r.faturadoCentavos)} de ${formatarBRL(r.metaCentavos)}`}
        />
        <Stat
          label="Multiplicador"
          value={formatarMultiplicador(r.faixa.multiplicadorBp)}
          hint={
            r.proximaFaixa
              ? `Faltam ${formatarBRL(r.proximaFaixa.faltaCentavos)} para ${formatarMultiplicador(r.proximaFaixa.multiplicadorBp)}`
              : "Você está na faixa máxima"
          }
        />
      </div>
      <div className="border-t border-line px-5 py-4">
        <BarraAtingimento atingimentoBp={r.atingimentoBp} />
      </div>
    </Card>
  );
}

function Linhas({ extrato }: { extrato: Extrato }) {
  if (extrato.linhas.length === 0) {
    return <Card className="p-6 text-sm text-muted">Nenhuma comissão nesta competência.</Card>;
  }
  return (
    <Card>
      <CardHeader
        title="Lançamentos"
        description={`${extrato.linhas.length} lançamentos · clique em um para ver como o valor foi calculado`}
      />
      <ul className="divide-y divide-line">
        {extrato.linhas.map((l) => (
          <li key={l.chave}>
            <details className="group">
              <summary className="flex cursor-pointer list-none items-center gap-3 px-5 py-3 hover:bg-surface-2 [&::-webkit-details-marker]:hidden">
                <span aria-hidden className="text-muted transition-transform group-open:rotate-90">›</span>
                <Badge tom={ROTULO[l.tipo].tom} className="w-40 justify-center">
                  {ROTULO[l.tipo].texto}
                </Badge>
                <span className="min-w-0 flex-1 truncate text-sm">
                  {l.numeroPedido ? (
                    <>
                      <span className="font-mono">{l.numeroPedido}</span>
                      <span className="text-muted"> · {l.clienteNome}</span>
                    </>
                  ) : (
                    <span className="text-muted">Lançamento do mês</span>
                  )}
                </span>
                {l.data && <span className="hidden text-sm text-muted sm:inline">{dataBR(l.data)}</span>}
                <span className={cn("tabular w-28 text-right text-sm font-medium", l.valorCentavos < 0 && "text-neg")}>
                  {formatarBRL(l.valorCentavos)}
                </span>
              </summary>
              <div className="border-t border-line bg-surface-2/50 px-5 py-4 sm:pl-14">
                <MemoriaCalculo tipo={l.tipo} memoria={l.memoria} valorCentavos={l.valorCentavos} categorias={extrato.categorias} />
              </div>
            </details>
          </li>
        ))}
      </ul>
    </Card>
  );
}

function CarregandoExtrato() {
  return (
    <div className="space-y-6" aria-busy="true" aria-label="Carregando extrato">
      <Skeleton className="h-8 w-96" />
      <Skeleton className="h-48 w-full" />
      <Skeleton className="h-96 w-full" />
    </div>
  );
}
