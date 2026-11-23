import { describe, expect, it } from "vitest";
import { calcularFechamento } from "../motor";
import { projetarEntrada } from "../projecao";
import { entrada, linhasDe, regrasPadrao, venda } from "./fixtures";

// Junho/2026 tem 30 dias: no dia 15, o ritmo é extrapolado em 2x.
const bebidas = (valorCentavos: number) => [{ categoria: "bebidas", valorCentavos }];

describe("Projeção — fator de extrapolação", () => {
  it.each([
    ["2026-06-01", 1, 300_000], // 30 ÷ 1
    ["2026-06-15", 15, 20_000], // 30 ÷ 15
    ["2026-06-07", 7, 42_857], // 30 ÷ 7, arredondado para baixo
    ["2026-06-30", 30, 10_000], // último dia: sem extrapolação
  ])("hoje %s → %d dias decorridos → fator %d bp", (hoje, dias, fatorBp) => {
    const p = projetarEntrada(entrada(), hoje);
    expect(p.diasNoMes).toBe(30);
    expect(p.diasDecorridos).toBe(dias);
    expect(p.fatorBp).toBe(fatorBp);
  });

  it("escala só os itens das vendas do mês, uma vez por item (R9)", () => {
    const e = entrada({
      vendasDoMes: [venda({ vendedorId: "A", data: "2026-06-03", itens: [...bebidas(10_001), ...bebidas(3)] })],
      comissionadasAnteriores: [
        { venda: venda({ vendedorId: "A", data: "2026-05-10" }), pagoCentavos: 3_000, situacao: "ATIVA" },
      ],
    });
    const p = projetarEntrada(e, "2026-06-15");
    expect(p.entrada.vendasDoMes[0].itens.map((i) => i.valorCentavos)).toEqual([20_002, 6]);
    expect(p.entrada.comissionadasAnteriores).toBe(e.comissionadasAnteriores);
    expect(e.vendasDoMes[0].itens[0].valorCentavos).toBe(10_001); // entrada original intacta
  });

  it("mês já terminado não muda: a projeção é igual ao fechamento", () => {
    const e = entrada({ vendasDoMes: [venda({ vendedorId: "A", itens: bebidas(80_000) })] });
    const p = projetarEntrada(e, "2026-07-05");
    expect(p.fatorBp).toBe(10_000);
    expect(p.entrada).toBe(e);
    expect(calcularFechamento(p.entrada)).toEqual(calcularFechamento(e));
  });
});

describe("Projeção — passa pelo motor inteiro", () => {
  it("sobe de faixa (R2) quando o ritmo cruza a meta", () => {
    const e = entrada({ vendasDoMes: [venda({ vendedorId: "A", data: "2026-06-10", itens: bebidas(60_000) })] });
    const previa = calcularFechamento(e).vendedores.find((v) => v.vendedorId === "A")!;
    const proj = calcularFechamento(projetarEntrada(e, "2026-06-15").entrada).vendedores.find((v) => v.vendedorId === "A")!;

    expect(previa.atingimentoBp).toBe(6_000); // 60% → 0,5x
    expect(previa.faixa.multiplicadorBp).toBe(5_000);
    expect(proj.faturadoCentavos).toBe(120_000);
    expect(proj.atingimentoBp).toBe(12_000); // 120% → 1,5x
    expect(proj.faixa.multiplicadorBp).toBe(15_000);
    expect(proj.totalCentavos).toBe(5_400); // 120.000 × 3% × 1,5
  });

  it("respeita o teto mensal (R6)", () => {
    const versao = { id: "v-teto", vigenciaInicio: "2026-01-01", regras: { ...regrasPadrao, tetoMensalCentavos: 10_000 } };
    const e = entrada({
      versoes: [versao],
      vendasDoMes: [venda({ vendedorId: "A", data: "2026-06-10", itens: bebidas(500_000) })],
    });
    const r = calcularFechamento(projetarEntrada(e, "2026-06-15").entrada);
    const a = r.vendedores.find((v) => v.vendedorId === "A")!;
    expect(a.baseCentavos).toBe(45_000); // 1.000.000 × 3% × 1,5
    expect(a.totalCentavos).toBe(10_000);
    expect(linhasDe(r, "AJUSTE_TETO")).toHaveLength(1);
  });

  it("gera o bônus do gestor (R5) quando a equipe só bate a meta na projeção", () => {
    const e = entrada({
      metasEquipe: { co: 300_000 },
      vendasDoMes: [
        venda({ vendedorId: "A", data: "2026-06-04", itens: bebidas(60_000) }),
        venda({ vendedorId: "B", data: "2026-06-12", itens: bebidas(90_000) }),
      ],
    });
    const previa = calcularFechamento(e);
    const proj = calcularFechamento(projetarEntrada(e, "2026-06-15").entrada);

    expect(previa.equipes[0].atingiuMeta).toBe(false);
    expect(linhasDe(previa, "BONUS_GESTOR")).toHaveLength(0);

    expect(proj.equipes[0].faturadoCentavos).toBe(300_000);
    expect(proj.equipes[0].atingiuMeta).toBe(true);
    expect(proj.equipes[0].comissaoEquipeCentavos).toBe(13_500); // 5.400 + 8.100
    expect(proj.equipes[0].bonusGestorCentavos).toBe(1_350);
  });
});
