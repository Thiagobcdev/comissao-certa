import { describe, expect, it } from "vitest";
import { lerCsv, lerData, validarImportacao, type ContextoImportacao } from "../importacao";

const CAB = "pedido;data;vendedor;cliente;vencimento;categoria;valor";

const ctx: ContextoImportacao = {
  hoje: "2026-11-23",
  ultimaCompetenciaFechada: "2026-10",
  vendedores: {
    "ana@x.test": { id: "A", nome: "Ana", competenciasComMeta: ["2026-11"] },
    "bia@x.test": { id: "B", nome: "Bia", competenciasComMeta: [] },
  },
  categorias: { bebidas: "bebidas", higiene: "higiene", limpeza: "limpeza" },
  pedidosExistentes: new Set(["PED-1"]),
};

function importar(...linhas: string[]) {
  const lido = lerCsv([CAB, ...linhas].join("\n"));
  if (!lido.ok) throw new Error(JSON.stringify(lido.erros));
  return validarImportacao(lido.linhas, ctx);
}

describe("lerCsv", () => {
  it("lê ; com aspas, BOM, CRLF e ignora linhas vazias do Excel", () => {
    const r = lerCsv(`﻿${CAB}\r\nP1;01/11/2026;ana@x.test;"Mercado ""Bom""; Preço";01/12/2026;Bebidas;1.250,00\r\n;;;;;;\r\n`);
    expect(r.ok).toBe(true);
    if (r.ok) {
      expect(r.linhas).toHaveLength(1);
      expect(r.linhas[0].numero).toBe(2);
      expect(r.linhas[0].campos.cliente).toBe('Mercado "Bom"; Preço');
      expect(r.linhas[0].campos.valor).toBe("1.250,00");
    }
  });

  it("aceita cabeçalho em outra ordem, com acento e maiúsculas, separado por vírgula", () => {
    const r = lerCsv("Valor,Categoria,Vencimento,Cliente,Vendedor,Data,Pedido\n10.5,bebidas,2026-12-01,X Ltda,ana@x.test,2026-11-01,P2");
    expect(r.ok && r.linhas[0].campos).toEqual({
      pedido: "P2",
      data: "2026-11-01",
      vendedor: "ana@x.test",
      cliente: "X Ltda",
      vencimento: "2026-12-01",
      categoria: "bebidas",
      valor: "10.5",
    });
  });

  it("aponta colunas faltando no cabeçalho", () => {
    const r = lerCsv("pedido;data;valor\nP1;01/11/2026;10");
    expect(!r.ok && r.erros[0].mensagem).toMatch(/vendedor, cliente, vencimento, categoria/);
  });

  it("aponta linha com colunas a menos e arquivo vazio", () => {
    const r = lerCsv(`${CAB}\nP1;01/11/2026`);
    expect(!r.ok && r.erros[0]).toEqual({ linha: 2, coluna: null, mensagem: "Esperava 7 colunas, veio 2" });
    expect(lerCsv("  \n").ok).toBe(false);
    expect(lerCsv(CAB).ok).toBe(false);
  });
});

describe("lerData", () => {
  it.each([
    ["23/11/2026", "2026-11-23"],
    ["1/2/2026", "2026-02-01"],
    ["2026-11-23", "2026-11-23"],
    ["31/02/2026", null],
    ["2026-13-01", null],
    ["ontem", null],
  ])("%s → %s", (t, esperado) => expect(lerData(t)).toBe(esperado));
});

describe("validarImportacao", () => {
  it("agrupa itens do mesmo pedido e resume por mês e vendedor", () => {
    const r = importar(
      "P10;10/11/2026;ANA@x.test;Mercado Sol;10/12/2026;Bebidas;1.000,00",
      "P10;10/11/2026;ana@x.test;Mercado Sol;10/12/2026;higiene;250,50",
      "P11;12/11/2026;ana@x.test;Hotel Lua;12/12/2026;Limpeza;99",
    );
    expect(r.erros).toEqual([]);
    expect(r.vendas).toEqual([
      {
        numeroPedido: "P10",
        vendedorId: "A",
        clienteNome: "Mercado Sol",
        data: "2026-11-10",
        vencimento: "2026-12-10",
        itens: [
          { categoria: "bebidas", valorCentavos: 100_000 },
          { categoria: "higiene", valorCentavos: 25_050 },
        ],
      },
      expect.objectContaining({ numeroPedido: "P11", itens: [{ categoria: "limpeza", valorCentavos: 9_900 }] }),
    ]);
    expect(r.resumo).toEqual({
      pedidos: 2,
      itens: 3,
      totalCentavos: 134_950,
      porCompetencia: [{ competencia: "2026-11", pedidos: 2, totalCentavos: 134_950 }],
      porVendedor: [{ nome: "Ana", pedidos: 2, totalCentavos: 134_950 }],
    });
  });

  it.each([
    ["PED-1;10/11/2026;ana@x.test;Cliente;10/12/2026;Bebidas;10", "pedido", /já existe/],
    ["P 1!;10/11/2026;ana@x.test;Cliente;10/12/2026;Bebidas;10", "pedido", /letras, números/],
    ["P2;15/10/2026;ana@x.test;Cliente;15/11/2026;Bebidas;10", "data", /já foi fechado/],
    ["P2;24/11/2026;ana@x.test;Cliente;24/12/2026;Bebidas;10", "data", /futura/],
    ["P2;10/11/2026;ana@x.test;Cliente;01/11/2026;Bebidas;10", "vencimento", /antes da data/],
    ["P2;10/11/2026;zeca@x.test;Cliente;10/12/2026;Bebidas;10", "vendedor", /não encontrado/],
    ["P2;10/11/2026;bia@x.test;Cliente;10/12/2026;Bebidas;10", "vendedor", /não tem meta/],
    ["P2;10/11/2026;ana@x.test;;10/12/2026;Bebidas;10", "cliente", /nome do cliente/],
    ["P2;10/11/2026;ana@x.test;Cliente;10/12/2026;Pet;10", "categoria", /desconhecida/],
    ["P2;10/11/2026;ana@x.test;Cliente;10/12/2026;Bebidas;0", "valor", /maior que zero/],
    ["P2;10/11/2026;ana@x.test;Cliente;10/12/2026;Bebidas;1,234", "valor", /inválido/],
  ])("recusa %s (%s)", (linha, coluna, msg) => {
    const r = importar(linha);
    expect(r.vendas).toEqual([]);
    expect(r.erros).toHaveLength(1);
    expect(r.erros[0]).toMatchObject({ linha: 2, coluna });
    expect(r.erros[0].mensagem).toMatch(msg);
  });

  it("recusa item do mesmo pedido com dados divergentes e aponta a linha original", () => {
    const r = importar(
      "P3;10/11/2026;ana@x.test;Cliente;10/12/2026;Bebidas;10",
      "P3;11/11/2026;ana@x.test;Cliente;10/12/2026;Bebidas;10",
    );
    expect(r.erros).toEqual([{ linha: 3, coluna: "data", mensagem: "Pedido P3 aparece com data diferente na linha 2" }]);
  });

  it("junta todos os erros de todas as linhas (relatório completo)", () => {
    const r = importar(
      "P4;10/11/2026;zeca@x.test;Cliente;10/12/2026;Pet;abc",
      "P5;10/11/2026;ana@x.test;Cliente;10/12/2026;Bebidas;10",
    );
    expect(r.erros.map((e) => `${e.linha}:${e.coluna}`)).toEqual(["2:vendedor", "2:categoria", "2:valor"]);
    expect(r.vendas.map((v) => v.numeroPedido)).toEqual(["P5"]);
  });
});
