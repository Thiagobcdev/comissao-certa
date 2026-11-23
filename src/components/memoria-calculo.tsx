import { formatarBRL, formatarMultiplicador, formatarPercentual, type TipoLinha } from "@/domain/commission";
import { dataBR } from "@/lib/formato";

type Item = { categoria: string; valorCentavos: number; pctBp: number };
type M = Record<string, unknown>;

const n = (v: unknown) => Number(v ?? 0);

/** Explica em linguagem natural como o valor de uma linha foi obtido. */
export function MemoriaCalculo({
  tipo,
  memoria,
  valorCentavos,
  categorias,
}: {
  tipo: TipoLinha;
  memoria: M;
  valorCentavos: number;
  categorias: Record<string, string>;
}) {
  const passos: { texto: string; valor?: string; destaque?: boolean }[] = [];

  if (tipo === "BASE") {
    const itens = (memoria.itens as Item[]) ?? [];
    for (const i of itens) {
      passos.push({
        texto: `${categorias[i.categoria] ?? i.categoria}: ${formatarBRL(i.valorCentavos)} × ${formatarPercentual(i.pctBp)}`,
        valor: formatarBRL((i.valorCentavos * i.pctBp) / 10_000),
      });
    }
    const faixa = memoria.faixa as { minAtingimentoBp: number; multiplicadorBp: number };
    passos.push({ texto: "Comissão antes do multiplicador (R1)", valor: formatarBRL(n(memoria.comissaoSemMultiplicadorCentavos)) });
    passos.push({
      texto: `× ${formatarMultiplicador(faixa.multiplicadorBp)}: atingimento de ${formatarPercentual(n(memoria.atingimentoBp))} da meta, faixa a partir de ${formatarPercentual(faixa.minAtingimentoBp, 0)} (R2)`,
    });
    passos.push({ texto: "Comissão da venda (arredondada ao centavo, R9)", valor: formatarBRL(valorCentavos), destaque: true });
    const fator = n(memoria.fatorTeto);
    if (fator < 1) {
      passos.push({
        texto: `Teto mensal atingido: esta venda rendeu efetivamente ${formatarPercentual(fator * 10_000)} do valor (R6)`,
        valor: formatarBRL(valorCentavos * fator),
      });
    }
  } else if (tipo === "AJUSTE_TETO") {
    passos.push({ texto: "Comissão do mês antes do teto", valor: formatarBRL(n(memoria.baseCentavos)) });
    passos.push({ texto: "Teto mensal por vendedor (R6)", valor: formatarBRL(n(memoria.tetoCentavos)) });
    passos.push({ texto: "Excedente cortado", valor: formatarBRL(valorCentavos), destaque: true });
  } else if (tipo === "ESTORNO_DEVOLUCAO") {
    passos.push({ texto: `Pedido devolvido em ${dataBR(String(memoria.devolvidaEm))}` });
    passos.push({ texto: "Comissão paga anteriormente por esta venda", valor: formatarBRL(n(memoria.pagoCentavos)) });
    passos.push({ texto: "Estorno no mês da devolução (R3)", valor: formatarBRL(valorCentavos), destaque: true });
  } else if (tipo === "ESTORNO_INADIMPLENCIA") {
    passos.push({
      texto: `Título vencido em ${dataBR(String(memoria.vencimento))}: ${n(memoria.diasEmAtraso)} dias em atraso no fim do mês (tolerância: ${n(memoria.toleranciaDias)} dias)`,
    });
    passos.push({ texto: "Comissão paga anteriormente por esta venda", valor: formatarBRL(n(memoria.pagoCentavos)) });
    passos.push({ texto: "Estorno por inadimplência (R4)", valor: formatarBRL(valorCentavos), destaque: true });
  } else if (tipo === "REVERSAO_INADIMPLENCIA") {
    passos.push({ texto: `O cliente pagou em ${dataBR(String(memoria.pagoEm))}, depois do estorno` });
    passos.push({ texto: "Comissão devolvida (R4)", valor: formatarBRL(valorCentavos), destaque: true });
  } else if (tipo === "BONUS_GESTOR") {
    passos.push({
      texto: `Equipe ${String(memoria.equipe)} faturou ${formatarBRL(n(memoria.faturadoEquipeCentavos))} de uma meta de ${formatarBRL(n(memoria.metaEquipeCentavos))}`,
    });
    passos.push({ texto: "Comissão total da equipe", valor: formatarBRL(n(memoria.comissaoEquipeCentavos)) });
    passos.push({ texto: `Bônus de ${formatarPercentual(n(memoria.bonusGestorBp))} (R5)`, valor: formatarBRL(valorCentavos), destaque: true });
  }

  return (
    <ol className="space-y-1.5 text-sm">
      {passos.map((p, i) => (
        <li key={i} className={`flex justify-between gap-6 ${p.destaque ? "border-t border-line pt-1.5 font-medium" : "text-muted"}`}>
          <span>{p.texto}</span>
          {p.valor && <span className="tabular shrink-0">{p.valor}</span>}
        </li>
      ))}
    </ol>
  );
}
