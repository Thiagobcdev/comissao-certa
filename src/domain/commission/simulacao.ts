/**
 * Simulador do vendedor — funções puras.
 *
 *  entradaDoVendedor: recorta a entrada do mês só com os dados de UM vendedor. O cálculo de um
 *    vendedor (R1–R4, R6) não depende dos colegas; só o bônus do gestor (R5) depende, e ele fica
 *    de fora. Assim a entrada pode ir para o navegador sem expor vendas de outras pessoas.
 *  simular: "se eu vender +R$ X em <categoria> até o fim do mês" → nova faixa e nova comissão,
 *    recalculadas pelo mesmo motor do fechamento.
 */
import { calcularFechamento, type EntradaFechamento, type ResumoVendedor } from "./motor";
import { ultimoDia } from "./datas";

export function entradaDoVendedor(e: EntradaFechamento, vendedorId: string): EntradaFechamento {
  const meta = e.metas[vendedorId];
  return {
    competencia: e.competencia,
    versoes: e.versoes,
    vendedores: e.vendedores.filter((v) => v.id === vendedorId).map((v) => ({ ...v, equipeId: null })),
    equipes: [],
    metas: meta !== undefined ? { [vendedorId]: meta } : {},
    metasEquipe: {},
    vendasDoMes: e.vendasDoMes.filter((v) => v.vendedorId === vendedorId),
    comissionadasAnteriores: e.comissionadasAnteriores.filter((c) => c.venda.vendedorId === vendedorId),
  };
}

export type VendaSimulada = { categoria: string; valorCentavos: number };

export type ResultadoSimulacao = {
  antes: ResumoVendedor;
  depois: ResumoVendedor;
  /** Comissão a mais no mês (pode ser 0 se o teto já foi atingido). */
  ganhoCentavos: number;
  /** Quanto foi somado ao faturado. */
  adicionalCentavos: number;
};

export function simular(e: EntradaFechamento, vendedorId: string, adicionais: readonly VendaSimulada[]): ResultadoSimulacao {
  const itens = adicionais.filter((a) => a.valorCentavos > 0);
  const resumoDe = (entrada: EntradaFechamento) => {
    const r = calcularFechamento(entrada).vendedores.find((v) => v.vendedorId === vendedorId);
    if (!r) throw new Error(`Vendedor ${vendedorId} não está na entrada`);
    return r;
  };

  const antes = resumoDe(e);
  if (itens.length === 0) return { antes, depois: antes, ganhoCentavos: 0, adicionalCentavos: 0 };

  const fim = ultimoDia(e.competencia);
  const depois = resumoDe({
    ...e,
    vendasDoMes: [
      ...e.vendasDoMes,
      {
        id: "simulacao",
        numeroPedido: "SIMULACAO",
        vendedorId,
        data: fim, // vendida até o fim do mês
        vencimento: fim,
        pagoEm: null,
        devolvidaEm: null,
        itens,
      },
    ],
  });
  return {
    antes,
    depois,
    ganhoCentavos: depois.totalCentavos - antes.totalCentavos,
    adicionalCentavos: itens.reduce((s, i) => s + i.valorCentavos, 0),
  };
}
