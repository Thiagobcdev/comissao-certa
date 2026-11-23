import { describe, expect, it } from "vitest";
import { formatarBRL } from "../dinheiro";
import { diffRegras, formularioDeRegras, lerDecimal, regrasDeFormulario, validarPublicacao } from "../versoes";
import { regrasPadrao, versaoPadrao } from "./fixtures";

const SLUGS = ["alimentos", "bebidas", "limpeza", "higiene"];

describe("lerDecimal — números digitados sem float (R9)", () => {
  it.each([
    ["4,5", 2, 450],
    ["4.5", 2, 450],
    ["10", 2, 1_000],
    ["0,01", 2, 1],
    ["1,2", 4, 12_000],
    ["1,25x", 4, 12_500],
    ["3,5 %", 2, 350],
    [" 70 ", 2, 7_000],
  ])("%s com %d casas → %d", (texto, casas, esperado) => {
    expect(lerDecimal(texto, casas)).toBe(esperado);
  });

  it("aceita separador de milhar em dinheiro", () => {
    expect(lerDecimal("25.000,00", 2, { milhar: true })).toBe(2_500_000);
    expect(lerDecimal("R$ 25.000", 2, { milhar: true })).toBe(2_500_000);
    expect(lerDecimal("25000", 2, { milhar: true })).toBe(2_500_000);
    expect(lerDecimal("1.234.567,89", 2, { milhar: true })).toBe(123_456_789);
  });

  it.each(["", "abc", "-1", "4,555", "1,2,3", "1e3"])("rejeita %j", (texto) => {
    expect(lerDecimal(texto, 2)).toBeNull();
  });
});

describe("formulário ⇄ regras", () => {
  it("ida e volta preserva as regras", () => {
    const f = formularioDeRegras(regrasPadrao);
    expect(f.categorias.higiene).toBe("3,5");
    expect(f.faixas[2]).toEqual({ minPct: "100", multiplicador: "1,2" });
    expect(f.tetoReais).toBe("25.000,00");
    expect(regrasDeFormulario(f)).toEqual({ ok: true, regras: regrasPadrao });
  });

  it("teto vazio vira 'sem teto'", () => {
    const r = regrasDeFormulario({ ...formularioDeRegras(regrasPadrao), tetoReais: "" });
    expect(r.ok && r.regras.tetoMensalCentavos).toBeNull();
  });

  it("aponta o campo de cada erro de digitação", () => {
    const f = formularioDeRegras(regrasPadrao);
    const r = regrasDeFormulario({
      ...f,
      categorias: { ...f.categorias, bebidas: "três" },
      faixas: [f.faixas[0], { minPct: "70", multiplicador: "x" }],
      inadimplenciaDias: "60,5",
    });
    expect(r.ok).toBe(false);
    if (!r.ok) {
      expect(Object.keys(r.erros).sort()).toEqual(["categorias.bebidas", "faixas.1.multiplicador", "inadimplenciaDias"]);
    }
  });

  it("traz as regras de negócio do schema para o campo certo", () => {
    const f = formularioDeRegras(regrasPadrao);
    const r = regrasDeFormulario({
      ...f,
      faixas: [{ minPct: "0", multiplicador: "0,5" }, { minPct: "100", multiplicador: "1" }, { minPct: "90", multiplicador: "1,2" }],
      bonusGestorPct: "150",
      inadimplenciaDias: "0",
    });
    expect(r.ok).toBe(false);
    if (!r.ok) {
      expect(r.erros["faixas.2.minPct"]).toMatch(/ordem crescente/);
      expect(r.erros.bonusGestorPct).toBe("Percentual entre 0% e 100%");
      expect(r.erros.inadimplenciaDias).toBe("Entre 1 e 365 dias");
    }
  });

  it("exige que a primeira faixa comece em 0%", () => {
    const f = formularioDeRegras(regrasPadrao);
    const r = regrasDeFormulario({ ...f, faixas: f.faixas.slice(1) });
    expect(!r.ok && r.erros["faixas.0.minPct"]).toMatch(/0%/);
  });
});

describe("diffRegras", () => {
  it("sem mudanças → lista vazia", () => {
    expect(diffRegras(regrasPadrao, regrasPadrao)).toEqual([]);
  });

  it("descreve as mudanças em linguagem de negócio", () => {
    const depois = {
      ...regrasPadrao,
      categorias: { ...regrasPadrao.categorias, higiene: 450 },
      faixas: [...regrasPadrao.faixas.slice(0, 3), { minAtingimentoBp: 13_000, multiplicadorBp: 20_000 }],
      tetoMensalCentavos: null,
    };
    expect(diffRegras(regrasPadrao, depois, { higiene: "Higiene" })).toEqual([
      { campo: "Comissão · Higiene", antes: "3,5%", depois: "4,5%" },
      { campo: "Faixa a partir de 120%", antes: "1,5x", depois: null },
      { campo: "Faixa a partir de 130%", antes: null, depois: "2x" },
      { campo: "Teto mensal por vendedor", antes: formatarBRL(2_500_000), depois: "Sem teto" },
    ]);
  });
});

describe("validarPublicacao — R7/R8", () => {
  const nova = { ...regrasPadrao, bonusGestorBp: 1_500 };
  const base = { regras: nova, versoes: [versaoPadrao], ultimaCompetenciaFechada: "2026-10", slugsCategorias: SLUGS };

  it("aceita vigência depois do último mês fechado", () => {
    expect(validarPublicacao({ ...base, vigencia: "2026-11" })).toEqual([]);
  });

  it.each(["2026-10", "2026-03"])("recusa vigência em mês já fechado (%s)", (vigencia) => {
    expect(validarPublicacao({ ...base, vigencia }).map((e) => e.codigo)).toContain("VIGENCIA_EM_MES_FECHADO");
  });

  it("recusa vigência repetida", () => {
    const erros = validarPublicacao({ ...base, vigencia: "2026-01", ultimaCompetenciaFechada: null });
    expect(erros.map((e) => e.codigo)).toEqual(["VIGENCIA_DUPLICADA"]);
  });

  it("recusa competência inválida", () => {
    expect(validarPublicacao({ ...base, vigencia: "" }).map((e) => e.codigo)).toEqual(["VIGENCIA_INVALIDA"]);
  });

  it("exige percentual para toda categoria existente e nenhuma a mais", () => {
    const erros = validarPublicacao({ ...base, vigencia: "2026-12", slugsCategorias: [...SLUGS, "pet"] });
    expect(erros.map((e) => e.codigo)).toEqual(["CATEGORIA_SEM_PERCENTUAL"]);
    const erros2 = validarPublicacao({ ...base, vigencia: "2026-12", slugsCategorias: SLUGS.slice(1) });
    expect(erros2.map((e) => e.codigo)).toEqual(["CATEGORIA_DESCONHECIDA"]);
  });

  it("recusa versão idêntica à vigente no mês", () => {
    const erros = validarPublicacao({ ...base, regras: regrasPadrao, vigencia: "2026-12" });
    expect(erros.map((e) => e.codigo)).toEqual(["SEM_MUDANCAS"]);
  });
});
