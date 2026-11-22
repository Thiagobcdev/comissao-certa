import { describe, expect, it } from "vitest";
import { arredondar, aplicarBp } from "../dinheiro";
import { calcularAtingimentoBp, calcularFechamento, valorPagoDaLinhaBase } from "../motor";
import { ErroDeRegra, faixaPara, parseRegras, selecionarVersao } from "../regras";
import { entrada, linhasDe, regrasPadrao, venda, versaoPadrao } from "./fixtures";

describe("R1 — comissão base por categoria", () => {
  it.each([
    // categoria, valor (centavos), meta → atingimento 80% (1,0x), comissão esperada
    ["alimentos", 100_000, 2_000], // 2%
    ["bebidas", 100_000, 3_000], // 3%
    ["limpeza", 100_000, 4_000], // 4%
    ["higiene", 100_000, 3_500], // 3,5%
  ])("%s: R$ %d centavos a 1,0x → %d centavos", (categoria, valor, esperado) => {
    const r = calcularFechamento(
      entrada({
        metas: { A: 125_000, B: 100_000 }, // 100k / 125k = 80% → 1,0x
        vendasDoMes: [venda({ vendedorId: "A", itens: [{ categoria, valorCentavos: valor }] })],
      }),
    );
    expect(linhasDe(r, "BASE")[0].valorCentavos).toBe(esperado);
  });

  it("soma itens de categorias diferentes no mesmo pedido", () => {
    const r = calcularFechamento(
      entrada({
        metas: { A: 125_000, B: 100_000 },
        vendasDoMes: [
          venda({
            vendedorId: "A",
            itens: [
              { categoria: "alimentos", valorCentavos: 50_000 }, // 1.000
              { categoria: "limpeza", valorCentavos: 50_000 }, // 2.000
            ],
          }),
        ],
      }),
    );
    expect(linhasDe(r, "BASE")[0].valorCentavos).toBe(3_000);
  });

  it("falha com erro de regra se a categoria não tem percentual na versão vigente", () => {
    const e = entrada({
      vendasDoMes: [venda({ vendedorId: "A", itens: [{ categoria: "pet", valorCentavos: 10_000 }] })],
    });
    expect(() => calcularFechamento(e)).toThrowError(expect.objectContaining({ codigo: "CATEGORIA_SEM_PERCENTUAL" }));
  });
});

describe("R2 — multiplicador por atingimento de meta", () => {
  it.each([
    // faturado, meta, atingimento (bp), multiplicador (bp)
    [6_999, 10_000, 6_999, 5_000], // 69,99% → 0,5x
    [7_000, 10_000, 7_000, 10_000], // 70%    → 1,0x
    [9_999, 10_000, 9_999, 10_000], // 99,99% → 1,0x
    [10_000, 10_000, 10_000, 12_000], // 100% → 1,2x
    [11_999, 10_000, 11_999, 12_000], // 119,99% → 1,2x
    [12_000, 10_000, 12_000, 15_000], // 120% → 1,5x
    [99_999, 100_000, 9_999, 10_000], // 99,999% NÃO arredonda para 100%
  ])("faturado %d / meta %d → %d bp → multiplicador %d bp", (faturado, meta, atingimento, mult) => {
    const at = calcularAtingimentoBp(faturado, meta);
    expect(at).toBe(atingimento);
    expect(faixaPara(regrasPadrao.faixas, at).multiplicadorBp).toBe(mult);
  });

  it("vendedor com 115% da meta recebe 1,2x sobre a base", () => {
    const r = calcularFechamento(
      entrada({
        metas: { A: 100_000, B: 100_000 },
        vendasDoMes: [venda({ vendedorId: "A", itens: [{ categoria: "bebidas", valorCentavos: 115_000 }] })],
      }),
    );
    // 115.000 × 3% = 3.450 × 1,2 = 4.140
    const base = linhasDe(r, "BASE")[0];
    expect(base.valorCentavos).toBe(4_140);
    expect(base.memoria).toMatchObject({ atingimentoBp: 11_500, faixa: { multiplicadorBp: 12_000 } });
  });

  it("o multiplicador vale para TODAS as vendas do mês do vendedor", () => {
    const r = calcularFechamento(
      entrada({
        metas: { A: 100_000, B: 100_000 },
        vendasDoMes: [
          venda({ vendedorId: "A", itens: [{ categoria: "bebidas", valorCentavos: 60_000 }] }),
          venda({ vendedorId: "A", itens: [{ categoria: "bebidas", valorCentavos: 60_000 }] }),
        ],
      }),
    );
    // 120% → 1,5x: cada venda 60.000 × 3% × 1,5 = 2.700
    expect(linhasDe(r, "BASE").map((l) => l.valorCentavos)).toEqual([2_700, 2_700]);
  });

  it("não fecha o mês se um vendedor que vendeu não tem meta", () => {
    const e = entrada({ metas: { B: 100_000 }, vendasDoMes: [venda({ vendedorId: "A" })] });
    expect(() => calcularFechamento(e)).toThrowError(expect.objectContaining({ codigo: "META_AUSENTE" }));
  });
});

describe("R3 — estorno por devolução", () => {
  it("devolução no próprio mês: a venda não conta para meta nem gera comissão", () => {
    const r = calcularFechamento(
      entrada({
        vendasDoMes: [
          venda({ vendedorId: "A", itens: [{ categoria: "bebidas", valorCentavos: 80_000 }] }),
          venda({ vendedorId: "A", devolvidaEm: "2026-06-20", itens: [{ categoria: "bebidas", valorCentavos: 50_000 }] }),
        ],
      }),
    );
    const resumoA = r.vendedores.find((v) => v.vendedorId === "A")!;
    expect(resumoA.faturadoCentavos).toBe(80_000); // 80% → 1,0x, não 130%
    expect(linhasDe(r, "BASE")).toHaveLength(1);
    expect(linhasDe(r, "ESTORNO_DEVOLUCAO")).toHaveLength(0);
  });

  it("devolução de venda comissionada em mês anterior gera estorno do valor pago no mês da devolução", () => {
    const vendida = venda({ vendedorId: "A", data: "2026-05-10", devolvidaEm: "2026-06-05" });
    const r = calcularFechamento(
      entrada({ comissionadasAnteriores: [{ venda: vendida, pagoCentavos: 3_600, situacao: "ATIVA" }] }),
    );
    const [estorno] = linhasDe(r, "ESTORNO_DEVOLUCAO");
    expect(estorno.valorCentavos).toBe(-3_600);
    expect(estorno.vendaId).toBe(vendida.id);
    expect(r.vendedores.find((v) => v.vendedorId === "A")!.totalCentavos).toBe(-3_600);
  });

  it("não estorna duas vezes uma venda já estornada", () => {
    const vendida = venda({ vendedorId: "A", data: "2026-04-10", devolvidaEm: "2026-06-05" });
    const r = calcularFechamento(
      entrada({ comissionadasAnteriores: [{ venda: vendida, pagoCentavos: 3_600, situacao: "ESTORNADA_INADIMPLENCIA" }] }),
    );
    expect(linhasDe(r, "ESTORNO_DEVOLUCAO")).toHaveLength(0);
  });
});

describe("R4 — estorno e reversão por inadimplência (tolerância de 60 dias)", () => {
  // Competência 2026-06 → avaliado em 2026-06-30
  it.each([
    ["2026-04-30", 61, true], // 61 dias de atraso → estorna
    ["2026-05-01", 60, false], // exatamente 60 → ainda tolera
  ])("vencimento %s (%d dias) → estorna: %s", (vencimento, _dias, estorna) => {
    const vendida = venda({ vendedorId: "A", data: "2026-03-30", vencimento });
    const r = calcularFechamento(
      entrada({ comissionadasAnteriores: [{ venda: vendida, pagoCentavos: 3_000, situacao: "ATIVA" }] }),
    );
    expect(linhasDe(r, "ESTORNO_INADIMPLENCIA")).toHaveLength(estorna ? 1 : 0);
    if (estorna) expect(linhasDe(r, "ESTORNO_INADIMPLENCIA")[0].valorCentavos).toBe(-3_000);
  });

  it("título pago (mesmo com atraso) antes do fim do mês não é estornado", () => {
    const vendida = venda({ vendedorId: "A", data: "2026-03-01", vencimento: "2026-03-31", pagoEm: "2026-06-10" });
    const r = calcularFechamento(
      entrada({ comissionadasAnteriores: [{ venda: vendida, pagoCentavos: 3_000, situacao: "ATIVA" }] }),
    );
    expect(r.linhas).toHaveLength(0);
  });

  it("cliente pagou depois do estorno → comissão volta (reversão)", () => {
    const vendida = venda({ vendedorId: "A", data: "2026-02-10", vencimento: "2026-03-10", pagoEm: "2026-06-15" });
    const r = calcularFechamento(
      entrada({ comissionadasAnteriores: [{ venda: vendida, pagoCentavos: 3_000, situacao: "ESTORNADA_INADIMPLENCIA" }] }),
    );
    const [rev] = linhasDe(r, "REVERSAO_INADIMPLENCIA");
    expect(rev.valorCentavos).toBe(3_000);
  });

  it("venda já estornada e ainda não paga não gera novo estorno", () => {
    const vendida = venda({ vendedorId: "A", data: "2026-02-10", vencimento: "2026-03-10" });
    const r = calcularFechamento(
      entrada({ comissionadasAnteriores: [{ venda: vendida, pagoCentavos: 3_000, situacao: "ESTORNADA_INADIMPLENCIA" }] }),
    );
    expect(r.linhas).toHaveLength(0);
  });
});

describe("R5 — bônus do gestor", () => {
  const vendas = [
    venda({ vendedorId: "A", itens: [{ categoria: "bebidas", valorCentavos: 120_000 }] }), // 120% → 1,5x → 5.400
    venda({ vendedorId: "B", itens: [{ categoria: "bebidas", valorCentavos: 100_000 }] }), // 100% → 1,2x → 3.600
  ];

  it("equipe que atinge a meta coletiva: gestor recebe 10% da comissão da equipe", () => {
    const r = calcularFechamento(entrada({ vendasDoMes: vendas, metasEquipe: { co: 220_000 } }));
    const [bonus] = linhasDe(r, "BONUS_GESTOR");
    expect(bonus.beneficiarioId).toBe("G");
    expect(bonus.valorCentavos).toBe(900); // 10% de (5.400 + 3.600)
    expect(r.equipes[0]).toMatchObject({ atingiuMeta: true, bonusGestorCentavos: 900 });
  });

  it("equipe abaixo da meta coletiva: sem bônus", () => {
    const r = calcularFechamento(entrada({ vendasDoMes: vendas, metasEquipe: { co: 220_001 } }));
    expect(linhasDe(r, "BONUS_GESTOR")).toHaveLength(0);
    expect(r.equipes[0].atingiuMeta).toBe(false);
  });
});

describe("R6 — teto mensal por vendedor", () => {
  it("corta o excedente numa linha AJUSTE_TETO e registra o fator aplicado", () => {
    const regras = { ...regrasPadrao, tetoMensalCentavos: 10_000 };
    const r = calcularFechamento(
      entrada({
        versoes: [{ ...versaoPadrao, regras }],
        metas: { A: 500_000, B: 100_000 },
        vendasDoMes: [venda({ vendedorId: "A", itens: [{ categoria: "bebidas", valorCentavos: 1_000_000 }] })],
      }),
    );
    // 1.000.000 × 3% × 1,5 (200%) = 45.000 → teto 10.000 → ajuste −35.000
    expect(linhasDe(r, "BASE")[0].valorCentavos).toBe(45_000);
    expect(linhasDe(r, "AJUSTE_TETO")[0].valorCentavos).toBe(-35_000);
    expect(r.vendedores.find((v) => v.vendedorId === "A")!.totalCentavos).toBe(10_000);

    const fator = linhasDe(r, "BASE")[0].memoria.fatorTeto as number;
    expect(valorPagoDaLinhaBase(45_000, fator)).toBe(10_000); // estorno futuro usa o valor efetivamente pago
  });

  it("estornos não são limitados pelo teto (entram depois do corte)", () => {
    const regras = { ...regrasPadrao, tetoMensalCentavos: 1_000 };
    const anterior = venda({ vendedorId: "A", data: "2026-05-02", devolvidaEm: "2026-06-03" });
    const r = calcularFechamento(
      entrada({
        versoes: [{ ...versaoPadrao, regras }],
        comissionadasAnteriores: [{ venda: anterior, pagoCentavos: 5_000, situacao: "ATIVA" }],
      }),
    );
    expect(r.vendedores.find((v) => v.vendedorId === "A")!.totalCentavos).toBe(-5_000);
  });
});

describe("R7 — versionamento das regras", () => {
  const v2 = { id: "v2", vigenciaInicio: "2026-06-01", regras: { ...regrasPadrao, categorias: { ...regrasPadrao.categorias, bebidas: 500 } } };

  it.each([
    ["2026-05", "v1"],
    ["2026-06", "v2"],
    ["2026-12", "v2"],
  ])("competência %s usa a versão %s", (competencia, esperado) => {
    expect(selecionarVersao([versaoPadrao, v2], competencia).id).toBe(esperado);
  });

  it("mudar a regra em junho não altera o cálculo de maio", () => {
    const base = { metas: { A: 125_000, B: 100_000 }, versoes: [versaoPadrao, v2] };
    const maio = calcularFechamento(
      entrada({ ...base, competencia: "2026-05", vendasDoMes: [venda({ vendedorId: "A", data: "2026-05-15" })] }),
    );
    const junho = calcularFechamento(entrada({ ...base, vendasDoMes: [venda({ vendedorId: "A" })] }));
    expect(linhasDe(maio, "BASE")[0].valorCentavos).toBe(3_000); // 3%
    expect(linhasDe(junho, "BASE")[0].valorCentavos).toBe(5_000); // 5%
    expect(junho.versaoId).toBe("v2");
  });

  it("sem versão vigente na competência → erro de regra", () => {
    expect(() => selecionarVersao([v2], "2026-05")).toThrowError(ErroDeRegra);
  });
});

describe("R9 — centavos inteiros e arredondamento", () => {
  it.each([
    [1.5, 2],
    [2.5, 3], // half-up, não "banker's rounding"
    [1.49, 1],
    [-1.5, -2], // simétrico: estornos arredondam igual aos créditos
    [-0.4, 0],
  ])("arredondar(%d) = %d", (v, esperado) => {
    expect(arredondar(v)).toBe(esperado);
  });

  it("aplica percentual em bp sem erro de ponto flutuante", () => {
    expect(aplicarBp(1_234, 300)).toBe(37); // 37,02
    expect(aplicarBp(50, 300)).toBe(2); // 1,5 → 2
  });

  it("arredonda uma única vez por linha (não item a item)", () => {
    const r = calcularFechamento(
      entrada({
        metas: { A: 30, B: 100_000 }, // 50/30 = 166% → 1,5x
        vendasDoMes: [
          venda({
            vendedorId: "A",
            itens: [
              { categoria: "bebidas", valorCentavos: 25 }, // 0,75
              { categoria: "bebidas", valorCentavos: 25 }, // 0,75
            ],
          }),
        ],
      }),
    );
    // (25×3% + 25×3%) × 1,5 = 2,25 → 2 (item a item daria 1×1,5 + 1×1,5 = 3)
    expect(linhasDe(r, "BASE")[0].valorCentavos).toBe(2);
  });

  it("todos os valores de saída são inteiros", () => {
    const r = calcularFechamento(
      entrada({
        metas: { A: 33_333, B: 77_777 },
        vendasDoMes: [
          venda({ vendedorId: "A", itens: [{ categoria: "higiene", valorCentavos: 12_345 }] }),
          venda({ vendedorId: "B", itens: [{ categoria: "alimentos", valorCentavos: 98_765 }] }),
        ],
        metasEquipe: { co: 1 },
      }),
    );
    for (const l of r.linhas) expect(Number.isInteger(l.valorCentavos)).toBe(true);
    expect(Number.isInteger(r.totalCentavos)).toBe(true);
  });
});

describe("Integridade do fechamento", () => {
  it("total do fechamento = soma de todas as linhas = soma dos totais (vendedores + bônus)", () => {
    const anterior = venda({ vendedorId: "B", data: "2026-05-02", devolvidaEm: "2026-06-03" });
    const r = calcularFechamento(
      entrada({
        vendasDoMes: [
          venda({ vendedorId: "A", itens: [{ categoria: "limpeza", valorCentavos: 130_000 }] }),
          venda({ vendedorId: "B", itens: [{ categoria: "alimentos", valorCentavos: 90_000 }] }),
        ],
        metasEquipe: { co: 200_000 },
        comissionadasAnteriores: [{ venda: anterior, pagoCentavos: 1_234, situacao: "ATIVA" }],
      }),
    );
    const somaVendedores = r.vendedores.reduce((s, v) => s + v.totalCentavos, 0);
    const somaBonus = r.equipes.reduce((s, e) => s + e.bonusGestorCentavos, 0);
    expect(r.totalCentavos).toBe(somaVendedores + somaBonus);
  });

  it("é determinístico: mesma entrada, mesma saída", () => {
    const e = entrada({ vendasDoMes: [venda({ vendedorId: "A" }), venda({ vendedorId: "B" })] });
    expect(calcularFechamento(e)).toEqual(calcularFechamento(e));
  });

  it("recusa venda fora da competência", () => {
    const e = entrada({ vendasDoMes: [venda({ vendedorId: "A", data: "2026-05-31" })] });
    expect(() => calcularFechamento(e)).toThrowError(expect.objectContaining({ codigo: "VENDA_FORA_DA_COMPETENCIA" }));
  });
});

describe("Validação das regras (Zod)", () => {
  it("aceita a versão padrão", () => {
    expect(parseRegras(regrasPadrao)).toEqual(regrasPadrao);
  });

  it("recusa faixas que não começam em 0%", () => {
    expect(() => parseRegras({ ...regrasPadrao, faixas: [{ minAtingimentoBp: 7_000, multiplicadorBp: 10_000 }] })).toThrow(
      /começar em 0%/,
    );
  });

  it("recusa faixas fora de ordem", () => {
    const faixas = [
      { minAtingimentoBp: 0, multiplicadorBp: 5_000 },
      { minAtingimentoBp: 12_000, multiplicadorBp: 15_000 },
      { minAtingimentoBp: 10_000, multiplicadorBp: 12_000 },
    ];
    expect(() => parseRegras({ ...regrasPadrao, faixas })).toThrow(/ordem crescente/);
  });

  it("recusa percentual acima de 100%", () => {
    expect(() => parseRegras({ ...regrasPadrao, categorias: { bebidas: 10_001 } })).toThrow();
  });
});
