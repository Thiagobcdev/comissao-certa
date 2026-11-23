/**
 * Projeção de fim de mês — função pura.
 *
 * Estende o ritmo de vendas até o último dia da competência e devolve uma nova
 * EntradaFechamento. A projeção em si é `calcularFechamento(projecao.entrada)`:
 * faixa (R2), teto (R6) e bônus (R5) são aplicados pelo mesmo motor do fechamento.
 *
 *   fator = dias no mês ÷ dias decorridos (em bp, arredondado para baixo — R9)
 *
 * Só as vendas DA competência são escaladas. Eventos sobre vendas de meses
 * anteriores (R3/R4) ficam como estão: não se projeta devolução nem inadimplência.
 */
import { BP, aplicarBp } from "./dinheiro";
import { diasEntre, primeiroDia, ultimoDia, validarData } from "./datas";
import type { EntradaFechamento } from "./motor";

export type Projecao = {
  entrada: EntradaFechamento;
  /** Multiplicador aplicado às vendas do mês, em bp (10_000 = sem extrapolação). */
  fatorBp: number;
  diasDecorridos: number;
  diasNoMes: number;
};

export function projetarEntrada(entrada: EntradaFechamento, hoje: string): Projecao {
  validarData(hoje);
  const inicio = primeiroDia(entrada.competencia);
  const fim = ultimoDia(entrada.competencia);
  const diasNoMes = diasEntre(inicio, fim) + 1;

  // Mês já terminado (ou ainda não começado): não há o que extrapolar.
  if (hoje > fim || hoje < inicio) {
    return { entrada, fatorBp: BP, diasDecorridos: diasNoMes, diasNoMes };
  }

  const diasDecorridos = diasEntre(inicio, hoje) + 1; // hoje conta como dia decorrido
  const fatorBp = Math.floor((diasNoMes * BP) / diasDecorridos);
  if (fatorBp === BP) return { entrada, fatorBp, diasDecorridos, diasNoMes };

  return {
    entrada: {
      ...entrada,
      vendasDoMes: entrada.vendasDoMes.map((v) => ({
        ...v,
        itens: v.itens.map((i) => ({ ...i, valorCentavos: aplicarBp(i.valorCentavos, fatorBp) })),
      })),
    },
    fatorBp,
    diasDecorridos,
    diasNoMes,
  };
}
