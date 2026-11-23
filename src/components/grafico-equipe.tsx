"use client";

import { useSyncExternalStore } from "react";
import { Bar, CartesianGrid, ComposedChart, Legend, Line, Tooltip, XAxis, YAxis } from "recharts";
import { formatarBRL } from "@/domain/commission";

export type PontoGrafico = {
  rotulo: string; // "out/2026"
  aberto: boolean; // mês ainda sem fechamento (prévia)
  faturadoCentavos: number;
  metaCentavos: number;
  comissaoCentavos: number;
  /** Só no mês aberto: faturado projetado para o fim do mês. */
  faturadoProjetadoCentavos: number | null;
};

const compacto = new Intl.NumberFormat("pt-BR", { notation: "compact", maximumFractionDigits: 1 });
const eixo = (centavos: number) => `R$ ${compacto.format(centavos / 100)}`;

const consultaReduzir = "(prefers-reduced-motion: reduce)";
function usePrefereMenosMovimento() {
  return useSyncExternalStore(
    (avisar) => {
      const mq = window.matchMedia(consultaReduzir);
      mq.addEventListener("change", avisar);
      return () => mq.removeEventListener("change", avisar);
    },
    () => window.matchMedia(consultaReduzir).matches,
    () => true, // no servidor, sem animação
  );
}

const NOMES: Record<string, string> = {
  faturadoCentavos: "Faturado",
  metaCentavos: "Meta da equipe",
  comissaoCentavos: "Comissão da equipe",
  restoProjetadoCentavos: "Projeção do mês",
};

export function GraficoEquipe({ dados }: { dados: PontoGrafico[] }) {
  const semAnimacao = usePrefereMenosMovimento();
  const dadosRotulados = dados.map((d) => ({
    ...d,
    rotulo: d.aberto ? `${d.rotulo}*` : d.rotulo,
    // a barra empilhada mostra só o que falta até a projeção
    restoProjetadoCentavos:
      d.faturadoProjetadoCentavos !== null ? Math.max(0, d.faturadoProjetadoCentavos - d.faturadoCentavos) : null,
  }));

  return (
    <ComposedChart
      responsive
      data={dadosRotulados}
      style={{ width: "100%", height: 300 }}
      margin={{ top: 8, right: 8, bottom: 0, left: 0 }}
      accessibilityLayer={false}
    >
      <CartesianGrid yAxisId="valor" stroke="var(--color-line)" vertical={false} />
      <XAxis dataKey="rotulo" tick={{ fill: "var(--color-muted)", fontSize: 12 }} tickLine={false} axisLine={{ stroke: "var(--color-line)" }} />
      <YAxis
        yAxisId="valor"
        width="auto"
        tickFormatter={eixo}
        tick={{ fill: "var(--color-muted)", fontSize: 12 }}
        tickLine={false}
        axisLine={false}
      />
      <YAxis
        yAxisId="comissao"
        orientation="right"
        width="auto"
        tickFormatter={eixo}
        tick={{ fill: "var(--color-pos)", fontSize: 12 }}
        tickLine={false}
        axisLine={false}
      />
      <Tooltip
        formatter={(valor, nome, item) =>
          nome === "restoProjetadoCentavos"
            ? [formatarBRL(Number(item.payload.faturadoProjetadoCentavos)), "Faturado projetado"]
            : [formatarBRL(Number(valor)), NOMES[String(nome)] ?? String(nome)]
        }
        contentStyle={{
          background: "var(--color-surface)",
          border: "1px solid var(--color-line)",
          borderRadius: 8,
          color: "var(--color-fg)",
          fontSize: 13,
        }}
        cursor={{ fill: "var(--color-surface-2)" }}
      />
      <Legend formatter={(nome) => NOMES[String(nome)] ?? String(nome)} wrapperStyle={{ fontSize: 13 }} />
      <Bar yAxisId="valor" dataKey="faturadoCentavos" fill="var(--color-brand)" maxBarSize={44} stackId="faturado" isAnimationActive={!semAnimacao} />
      <Bar
        yAxisId="valor"
        dataKey="restoProjetadoCentavos"
        stackId="faturado"
        fill="var(--color-brand)"
        fillOpacity={0.25}
        stroke="var(--color-brand)"
        strokeDasharray="4 3"
        radius={[4, 4, 0, 0]}
        maxBarSize={44}
        legendType="none"
        isAnimationActive={!semAnimacao}
      />
      <Line
        yAxisId="valor"
        dataKey="metaCentavos"
        type="stepAfter"
        stroke="var(--color-muted)"
        strokeDasharray="5 4"
        strokeWidth={2}
        dot={false}
        isAnimationActive={!semAnimacao}
      />
      <Line
        yAxisId="comissao"
        dataKey="comissaoCentavos"
        type="monotone"
        stroke="var(--color-pos)"
        strokeWidth={2}
        dot={{ r: 3 }}
        isAnimationActive={!semAnimacao}
      />
    </ComposedChart>
  );
}
