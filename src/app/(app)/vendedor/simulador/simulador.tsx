"use client";

import { useMemo, useState } from "react";
import { BarraAtingimento } from "@/components/barra-atingimento";
import { Badge, Button, Card, CardHeader } from "@/components/ui";
import {
  BP,
  formatarBRL,
  formatarMultiplicador,
  formatarPercentual,
  lerDecimal,
  selecionarVersao,
  simular,
  type EntradaFechamento,
} from "@/domain/commission";
import { rotuloCompetencia } from "@/lib/formato";
import { cn } from "@/lib/utils";

/** Roda o mesmo motor do fechamento no navegador, com a entrada recortada só para este vendedor. */
export function Simulador({
  entrada,
  vendedorId,
  categorias,
}: {
  entrada: EntradaFechamento;
  vendedorId: string;
  categorias: Record<string, string>;
}) {
  const regras = selecionarVersao(entrada.versoes, entrada.competencia).regras;
  const ordem = Object.keys(categorias).sort((a, b) => (regras.categorias[b] ?? 0) - (regras.categorias[a] ?? 0));
  const [valores, setValores] = useState<Record<string, string>>(() => Object.fromEntries(ordem.map((s) => [s, ""])));

  const lidos = Object.fromEntries(ordem.map((s) => [s, valores[s].trim() === "" ? 0 : lerDecimal(valores[s], 2, { milhar: true })]));
  const invalidos = ordem.filter((s) => lidos[s] === null);
  const adicionais = ordem.map((s) => ({ categoria: s, valorCentavos: lidos[s] ?? 0 }));
  const chave = JSON.stringify(adicionais);
  // eslint-disable-next-line react-hooks/exhaustive-deps -- recalcula só quando os valores mudam
  const r = useMemo(() => simular(entrada, vendedorId, adicionais), [entrada, vendedorId, chave]);

  const { antes, depois } = r;
  const proxima = regras.faixas.find((f) => f.minAtingimentoBp > antes.atingimentoBp);
  const faltaProxima = proxima && antes.metaCentavos > 0
    ? Math.max(0, Math.ceil((antes.metaCentavos * proxima.minAtingimentoBp) / BP) - antes.faturadoCentavos)
    : null;
  const melhor = ordem[0];
  const mudouFaixa = depois.faixa.multiplicadorBp !== antes.faixa.multiplicadorBp;
  const rendimento = r.adicionalCentavos > 0 ? Math.round((r.ganhoCentavos * 100_000) / r.adicionalCentavos) : 0; // por R$ 1.000

  const preencher = (centavos: number) =>
    setValores(
      Object.fromEntries(
        ordem.map((s) => [
          s,
          s === melhor ? (centavos / 100).toLocaleString("pt-BR", { minimumFractionDigits: 2, maximumFractionDigits: 2 }) : "",
        ]),
      ),
    );

  return (
    <div className="grid gap-6 lg:grid-cols-[1fr_1.1fr]">
      <Card>
        <CardHeader
          title={`Se eu vender mais até o fim de ${rotuloCompetencia(entrada.competencia)}…`}
          description="Valores faturados a mais, por categoria. Categorias ordenadas pela que mais rende."
        />
        <div className="space-y-3 px-5 py-4">
          {ordem.map((slug) => {
            const id = `sim-${slug}`;
            const invalido = lidos[slug] === null;
            return (
              <div key={slug} className="grid grid-cols-[1fr_11rem] items-center gap-3">
                <label htmlFor={id} className="text-sm">
                  <span className="font-medium">{categorias[slug]}</span>{" "}
                  <span className="text-muted">· {formatarPercentual(regras.categorias[slug] ?? 0, 2)}</span>
                </label>
                <div>
                  <div className="relative">
                    <span className="pointer-events-none absolute inset-y-0 left-3 flex items-center text-sm text-muted">R$</span>
                    <input
                      id={id}
                      inputMode="decimal"
                      placeholder="0,00"
                      value={valores[slug]}
                      onChange={(e) => setValores((v) => ({ ...v, [slug]: e.target.value }))}
                      aria-invalid={invalido}
                      aria-describedby={invalido ? `${id}-erro` : undefined}
                      className="tabular h-10 w-full rounded-lg border border-line bg-surface pl-10 pr-3 text-right text-sm aria-[invalid=true]:border-neg"
                    />
                  </div>
                  {invalido && (
                    <p id={`${id}-erro`} className="mt-1 text-xs text-neg">
                      Valor inválido (ex.: 5.000,00)
                    </p>
                  )}
                </div>
              </div>
            );
          })}
        </div>
        <div className="flex flex-wrap gap-2 border-t border-line px-5 py-4">
          {proxima && faltaProxima !== null && faltaProxima > 0 && (
            <Button type="button" variante="secundario" onClick={() => preencher(faltaProxima)}>
              Completar {formatarPercentual(proxima.minAtingimentoBp, 0)} ({formatarBRL(faltaProxima)} em {categorias[melhor]})
            </Button>
          )}
          <Button type="button" variante="secundario" onClick={() => preencher(0)} disabled={r.adicionalCentavos === 0 && invalidos.length === 0}>
            Limpar
          </Button>
        </div>
      </Card>

      <Card aria-live="polite">
        <CardHeader
          title="Resultado"
          description="Calculado pelo mesmo motor do fechamento. Estornos já lançados no mês continuam valendo."
          action={r.ganhoCentavos > 0 ? <Badge tom="pos">+{formatarBRL(r.ganhoCentavos)}</Badge> : undefined}
        />
        <dl className="tabular divide-y divide-line text-sm">
          <Linha rotulo="Faturado no mês" antes={formatarBRL(antes.faturadoCentavos)} depois={formatarBRL(depois.faturadoCentavos)} />
          <Linha rotulo="Atingimento da meta" antes={formatarPercentual(antes.atingimentoBp)} depois={formatarPercentual(depois.atingimentoBp)} />
          <Linha
            rotulo="Multiplicador (R2)"
            antes={formatarMultiplicador(antes.faixa.multiplicadorBp)}
            depois={formatarMultiplicador(depois.faixa.multiplicadorBp)}
            destaque={mudouFaixa}
          />
          <Linha rotulo="Comissão do mês" antes={formatarBRL(antes.totalCentavos)} depois={formatarBRL(depois.totalCentavos)} destaque />
        </dl>
        <div className="space-y-3 border-t border-line px-5 py-4">
          <BarraAtingimento atingimentoBp={antes.atingimentoBp} projetadoBp={depois.atingimentoBp} />
          <ul className="space-y-1 text-sm">
            {r.adicionalCentavos === 0 ? (
              <li className="text-muted">
                Digite um valor ao lado para ver quanto a comissão muda.
                {faltaProxima !== null && proxima && faltaProxima > 0 &&
                  ` Faltam ${formatarBRL(faltaProxima)} para ${formatarMultiplicador(proxima.multiplicadorBp)}.`}
              </li>
            ) : (
              <>
                <li>
                  Cada R$ 1.000 a mais rende <strong>{formatarBRL(rendimento)}</strong> de comissão nesta simulação.
                </li>
                {mudouFaixa && (
                  <li className="text-pos">
                    A faixa nova vale para o mês inteiro: as vendas que você já fez também passam a render{" "}
                    {formatarMultiplicador(depois.faixa.multiplicadorBp)}.
                  </li>
                )}
                {depois.ajusteTetoCentavos < 0 && (
                  <li className={cn("text-warn")}>
                    Você chega ao teto mensal (R6): {formatarBRL(-depois.ajusteTetoCentavos)} não seriam pagos.
                  </li>
                )}
              </>
            )}
          </ul>
        </div>
      </Card>
    </div>
  );
}

function Linha({ rotulo, antes, depois, destaque }: { rotulo: string; antes: string; depois: string; destaque?: boolean }) {
  const mudou = antes !== depois;
  return (
    <div className="grid grid-cols-[1fr_auto_auto_auto] items-baseline gap-3 px-5 py-3">
      <dt className="text-muted">{rotulo}</dt>
      <dd className={cn(mudou && "text-muted line-through decoration-muted/50")}>{antes}</dd>
      <dd aria-hidden className="text-muted">→</dd>
      <dd className={cn("text-right", mudou && "font-semibold", mudou && destaque && "text-pos")}>
        <span className="sr-only">depois: </span>
        {depois}
      </dd>
    </div>
  );
}
