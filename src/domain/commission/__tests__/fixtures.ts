import type { EntradaFechamento, VendaInput } from "../motor";
import type { Regras, VersaoRegras } from "../regras";

/** Regras da versão inicial da Distribuidora Horizonte (ver docs/design.md §3). */
export const regrasPadrao: Regras = {
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

export const versaoPadrao: VersaoRegras = { id: "v1", vigenciaInicio: "2026-01-01", regras: regrasPadrao };

let seq = 0;
/** Cria uma venda com defaults sensatos; sobrescreva o que importa para o caso. */
export function venda(p: Partial<VendaInput> & Pick<VendaInput, "vendedorId">): VendaInput {
  seq += 1;
  return {
    id: p.id ?? `venda-${seq}`,
    numeroPedido: p.numeroPedido ?? `PED-${seq}`,
    data: "2026-06-10",
    vencimento: "2026-07-10",
    pagoEm: null,
    devolvidaEm: null,
    itens: [{ categoria: "bebidas", valorCentavos: 100_000 }],
    ...p,
  };
}

/** Entrada mínima: 1 equipe (Centro-Oeste) com gestor G e vendedores A e B. */
export function entrada(p: Partial<EntradaFechamento> = {}): EntradaFechamento {
  return {
    competencia: "2026-06",
    versoes: [versaoPadrao],
    vendedores: [
      { id: "A", nome: "Ana", equipeId: "co" },
      { id: "B", nome: "Bruno", equipeId: "co" },
    ],
    equipes: [{ id: "co", nome: "Centro-Oeste", gestorId: "G" }],
    metas: { A: 100_000, B: 100_000 },
    metasEquipe: { co: 10_000_000 }, // alta: bônus desligado por padrão
    vendasDoMes: [],
    comissionadasAnteriores: [],
    ...p,
  };
}

export const linhasDe = <L extends { tipo: string }>(r: { linhas: L[] }, tipo: L["tipo"]): L[] =>
  r.linhas.filter((l) => l.tipo === tipo);
