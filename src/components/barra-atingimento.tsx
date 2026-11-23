import { cn } from "@/lib/utils";

const ESCALA = 150; // a barra vai até 150% da meta
const MARCOS: [number, string][] = [
  [70, "1x"],
  [100, "1,2x"],
  [120, "1,5x"],
];

/**
 * Barra de atingimento com marcas nas faixas do multiplicador (R2).
 * `projetadoBp` desenha, atrás da barra, até onde o ritmo atual leva no fim do mês.
 */
export function BarraAtingimento({
  atingimentoBp,
  projetadoBp,
  compacta = false,
  className,
}: {
  atingimentoBp: number;
  projetadoBp?: number;
  compacta?: boolean;
  className?: string;
}) {
  const pct = Math.min(ESCALA, atingimentoBp / 100);
  const pctProj = projetadoBp !== undefined ? Math.min(ESCALA, projetadoBp / 100) : null;
  const rotulo =
    `Atingimento de ${Math.floor(atingimentoBp / 100)}% da meta` +
    (projetadoBp !== undefined ? `, projeção de ${Math.floor(projetadoBp / 100)}%` : "");

  return (
    <div className={className}>
      <div className={cn("relative rounded-full bg-surface-2", compacta ? "h-1.5" : "h-2")} role="img" aria-label={rotulo}>
        {pctProj !== null && (
          <div className="absolute inset-y-0 left-0 rounded-full bg-brand/25" style={{ width: `${(pctProj / ESCALA) * 100}%` }} />
        )}
        <div className="absolute inset-y-0 left-0 rounded-full bg-brand" style={{ width: `${(pct / ESCALA) * 100}%` }} />
        {MARCOS.map(([marco]) => (
          <span key={marco} className="absolute inset-y-0 w-px bg-fg/40" style={{ left: `${(marco / ESCALA) * 100}%` }} />
        ))}
      </div>
      {!compacta && (
        <div className="relative mt-1 h-4 text-xs text-muted" aria-hidden>
          {MARCOS.map(([marco, mult]) => (
            <span key={marco} className="absolute -translate-x-1/2 whitespace-nowrap" style={{ left: `${(marco / ESCALA) * 100}%` }}>
              {marco}%<span className="hidden sm:inline"> · {mult}</span>
            </span>
          ))}
        </div>
      )}
    </div>
  );
}
