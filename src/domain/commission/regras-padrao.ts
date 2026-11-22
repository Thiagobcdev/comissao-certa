import type { Regras } from "./regras";

/** Regras da versão inicial da Distribuidora Horizonte (docs/design.md §3). */
export const REGRAS_INICIAIS: Regras = {
  categorias: { alimentos: 200, bebidas: 300, limpeza: 400, higiene: 350 }, // 2% · 3% · 4% · 3,5%
  faixas: [
    { minAtingimentoBp: 0, multiplicadorBp: 5_000 }, //   < 70%  → 0,5x
    { minAtingimentoBp: 7_000, multiplicadorBp: 10_000 }, // 70–99% → 1,0x
    { minAtingimentoBp: 10_000, multiplicadorBp: 12_000 }, // 100–119% → 1,2x
    { minAtingimentoBp: 12_000, multiplicadorBp: 15_000 }, // ≥ 120% → 1,5x
  ],
  inadimplenciaDias: 60,
  bonusGestorBp: 1_000, // 10%
  tetoMensalCentavos: 2_500_000, // R$ 25.000,00
};
