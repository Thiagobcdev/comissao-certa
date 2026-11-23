import { describe, expect, it } from "vitest";
import { conferirFechamento } from "../conferencia";
import { formatarBRL } from "../dinheiro";
import { calcularFechamento } from "../motor";
import { entrada, regrasPadrao, venda } from "./fixtures";

describe("conferirFechamento", () => {
  it("resume por tipo e por equipe, e o total bate com o motor", () => {
    const r = calcularFechamento(
      entrada({
        metasEquipe: { co: 200_000 },
        vendasDoMes: [
          venda({ vendedorId: "A", itens: [{ categoria: "bebidas", valorCentavos: 120_000 }] }), // 1,5x → 5.400
          venda({ vendedorId: "B", itens: [{ categoria: "bebidas", valorCentavos: 100_000 }] }), // 1,2x → 3.600
        ],
      }),
    );
    const c = conferirFechamento(r);
    expect(c.totalCentavos).toBe(r.totalCentavos);
    expect(c.porTipo).toEqual([
      { tipo: "BASE", quantidade: 2, centavos: 9_000 },
      { tipo: "BONUS_GESTOR", quantidade: 1, centavos: 900 },
    ]);
    expect(c.porEquipe).toEqual([
      {
        nome: "Centro-Oeste",
        faturadoCentavos: 220_000,
        metaCentavos: 200_000,
        atingiuMeta: true,
        comissaoCentavos: 9_000,
        bonusGestorCentavos: 900,
      },
    ]);
    expect(c.alertas).toEqual([{ tom: "info", texto: `Equipe Centro-Oeste bateu a meta coletiva: bônus de ${formatarBRL(900)} (R5)` }]);
  });

  it("alerta teto, saldo negativo e vendedor sem vendas", () => {
    const versao = { id: "v", vigenciaInicio: "2026-01-01", regras: { ...regrasPadrao, tetoMensalCentavos: 1_000 } };
    const r = calcularFechamento(
      entrada({
        competencia: "2026-07",
        versoes: [versao],
        vendasDoMes: [venda({ vendedorId: "A", data: "2026-07-05", itens: [{ categoria: "bebidas", valorCentavos: 100_000 }] })],
        comissionadasAnteriores: [
          {
            venda: venda({ vendedorId: "B", data: "2026-06-05", devolvidaEm: "2026-07-02" }),
            pagoCentavos: 500,
            situacao: "ATIVA",
          },
        ],
      }),
    );
    const textos = conferirFechamento(r).alertas.map((a) => `${a.tom}:${a.texto}`);
    expect(textos).toEqual([
      `warn:Ana passou do teto (R6): ${formatarBRL(2_600)} não serão pagos`,
      `neg:Bruno fecha o mês negativo (${formatarBRL(-500)}) por estornos`,
      "info:Bruno não tem vendas no mês",
    ]);
  });
});
