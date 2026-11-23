/**
 * Conferência antes do fechamento — função pura sobre o resultado do motor.
 * Resume o mês por tipo de lançamento e por equipe e aponta o que merece um olhar humano
 * antes de gravar algo irreversível (R8).
 */
import { formatarBRL } from "./dinheiro";
import type { ResultadoFechamento, TipoLinha } from "./motor";

export type Alerta = { tom: "warn" | "neg" | "info"; texto: string };

export type Conferencia = {
  totalCentavos: number;
  linhas: number;
  porTipo: { tipo: TipoLinha; quantidade: number; centavos: number }[];
  porEquipe: {
    nome: string;
    faturadoCentavos: number;
    metaCentavos: number;
    atingiuMeta: boolean;
    comissaoCentavos: number;
    bonusGestorCentavos: number;
  }[];
  alertas: Alerta[];
};

const ORDEM: TipoLinha[] = ["BASE", "AJUSTE_TETO", "ESTORNO_DEVOLUCAO", "ESTORNO_INADIMPLENCIA", "REVERSAO_INADIMPLENCIA", "BONUS_GESTOR"];

export function conferirFechamento(r: ResultadoFechamento): Conferencia {
  const porTipo = ORDEM.map((tipo) => {
    const ls = r.linhas.filter((l) => l.tipo === tipo);
    return { tipo, quantidade: ls.length, centavos: ls.reduce((s, l) => s + l.valorCentavos, 0) };
  }).filter((t) => t.quantidade > 0);

  const porEquipe = r.equipes.map((e) => ({
    nome: e.nome,
    faturadoCentavos: e.faturadoCentavos,
    metaCentavos: e.metaCentavos,
    atingiuMeta: e.atingiuMeta,
    comissaoCentavos: r.vendedores.filter((v) => v.equipeId === e.equipeId).reduce((s, v) => s + v.totalCentavos, 0),
    bonusGestorCentavos: e.bonusGestorCentavos,
  }));

  const alertas: Alerta[] = [];
  for (const v of r.vendedores) {
    if (v.ajusteTetoCentavos < 0) {
      alertas.push({ tom: "warn", texto: `${v.nome} passou do teto (R6): ${formatarBRL(-v.ajusteTetoCentavos)} não serão pagos` });
    }
    if (v.totalCentavos < 0) {
      alertas.push({ tom: "neg", texto: `${v.nome} fecha o mês negativo (${formatarBRL(v.totalCentavos)}) por estornos` });
    }
    if (v.faturadoCentavos === 0 && v.metaCentavos > 0) {
      alertas.push({ tom: "info", texto: `${v.nome} não tem vendas no mês` });
    }
  }
  for (const e of porEquipe) {
    if (e.atingiuMeta) alertas.push({ tom: "info", texto: `Equipe ${e.nome} bateu a meta coletiva: bônus de ${formatarBRL(e.bonusGestorCentavos)} (R5)` });
  }

  return { totalCentavos: r.totalCentavos, linhas: r.linhas.length, porTipo, porEquipe, alertas };
}
