import { describe, expect, it } from "vitest";
import { calcularFechamento } from "../motor";
import { entradaDoVendedor, simular } from "../simulacao";
import { entrada, regrasPadrao, venda } from "./fixtures";

const bebidas = (valorCentavos: number) => [{ categoria: "bebidas", valorCentavos }];

describe("entradaDoVendedor", () => {
  const completa = entrada({
    metasEquipe: { co: 150_000 },
    vendasDoMes: [
      venda({ vendedorId: "A", itens: bebidas(90_000) }),
      venda({ vendedorId: "B", itens: bebidas(80_000) }),
    ],
    comissionadasAnteriores: [
      { venda: venda({ vendedorId: "A", data: "2026-05-02", devolvidaEm: "2026-06-03" }), pagoCentavos: 700, situacao: "ATIVA" },
      { venda: venda({ vendedorId: "B", data: "2026-05-02", devolvidaEm: "2026-06-03" }), pagoCentavos: 900, situacao: "ATIVA" },
    ],
  });

  it("dá o mesmo resultado do vendedor que a entrada completa", () => {
    const cheio = calcularFechamento(completa).vendedores.find((v) => v.vendedorId === "A")!;
    const recorte = calcularFechamento(entradaDoVendedor(completa, "A")).vendedores[0];
    expect({ ...recorte, equipeId: "co" }).toEqual(cheio);
  });

  it("não leva dados de outros vendedores nem de equipes", () => {
    const r = entradaDoVendedor(completa, "A");
    const json = JSON.stringify(r);
    expect(json).not.toContain('"B"');
    expect(r.equipes).toEqual([]);
    expect(r.metasEquipe).toEqual({});
  });
});

describe("simular", () => {
  const e = entrada({ vendasDoMes: [venda({ vendedorId: "A", itens: bebidas(60_000) })] }); // 60% → 0,5x → 900

  it("sem valores, nada muda", () => {
    const r = simular(e, "A", [{ categoria: "bebidas", valorCentavos: 0 }]);
    expect(r.ganhoCentavos).toBe(0);
    expect(r.depois).toBe(r.antes);
  });

  it("vender o que falta muda a faixa e recalcula o mês inteiro (R2)", () => {
    const r = simular(e, "A", [{ categoria: "bebidas", valorCentavos: 40_000 }]); // 100% → 1,2x
    expect(r.antes.totalCentavos).toBe(900);
    expect(r.depois.atingimentoBp).toBe(10_000);
    expect(r.depois.faixa.multiplicadorBp).toBe(12_000);
    expect(r.depois.totalCentavos).toBe(3_600); // 100.000 × 3% × 1,2
    expect(r.ganhoCentavos).toBe(2_700);
    expect(r.adicionalCentavos).toBe(40_000);
  });

  it("soma categorias diferentes com percentuais diferentes (R1)", () => {
    const r = simular(e, "A", [
      { categoria: "limpeza", valorCentavos: 10_000 },
      { categoria: "alimentos", valorCentavos: 10_000 },
    ]); // 80% → 1,0x: 60.000×3% + 10.000×4% + 10.000×2% = 2.400
    expect(r.depois.totalCentavos).toBe(2_400);
  });

  it("respeita o teto (R6): acima dele o ganho é zero", () => {
    const comTeto = entrada({
      versoes: [{ id: "v", vigenciaInicio: "2026-01-01", regras: { ...regrasPadrao, tetoMensalCentavos: 5_000 } }],
      vendasDoMes: [venda({ vendedorId: "A", itens: bebidas(150_000) })], // 150% → 1,5x → 6.750 → teto 5.000
    });
    const r = simular(comTeto, "A", [{ categoria: "bebidas", valorCentavos: 50_000 }]);
    expect(r.antes.totalCentavos).toBe(5_000);
    expect(r.depois.totalCentavos).toBe(5_000);
    expect(r.ganhoCentavos).toBe(0);
  });

  it("falha se o vendedor não estiver na entrada", () => {
    expect(() => simular(e, "Z", [])).toThrow(/Z/);
  });
});
