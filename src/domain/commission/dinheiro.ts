/**
 * R9 — Dinheiro sem float.
 * Valores em CENTAVOS (inteiros). Percentuais e multiplicadores em PONTOS-BASE (bp):
 *   1% = 100 bp · 100% = 10_000 bp · multiplicador 1,2x = 12_000 bp.
 */

export const BP = 10_000;

/** Arredondamento half-up simétrico (meio centavo vai para longe do zero). */
export function arredondar(valor: number): number {
  const r = Math.sign(valor) * Math.round(Math.abs(valor));
  return r === 0 ? 0 : r; // evita -0
}

/** Aplica um percentual em bp sobre centavos, arredondando para o centavo. */
export function aplicarBp(centavos: number, bp: number): number {
  return arredondar((centavos * bp) / BP);
}

export function somar(valores: readonly number[]): number {
  return valores.reduce((acc, v) => acc + v, 0);
}

/** Formata centavos como BRL ("R$ 1.234,56"). Só para exibição. */
export function formatarBRL(centavos: number): string {
  return (centavos / 100).toLocaleString("pt-BR", { style: "currency", currency: "BRL" });
}

/** Formata bp como percentual ("12,5%"). */
export function formatarPercentual(bp: number, casas = 1): string {
  return `${(bp / 100).toLocaleString("pt-BR", { minimumFractionDigits: 0, maximumFractionDigits: casas })}%`;
}

/** Formata multiplicador em bp ("1,2x"). */
export function formatarMultiplicador(bp: number): string {
  return `${(bp / BP).toLocaleString("pt-BR", { maximumFractionDigits: 2 })}x`;
}
