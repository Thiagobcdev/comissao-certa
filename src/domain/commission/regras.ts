import { z } from "zod";
import { BP } from "./dinheiro";
import { primeiroDia } from "./datas";

/**
 * Parâmetros de uma versão de regras (guardados como JSON em VersaoRegras.regras).
 * Todos os percentuais/multiplicadores em pontos-base (bp). Dinheiro em centavos.
 */
export const faixaSchema = z.object({
  /** Atingimento mínimo da meta para entrar na faixa (bp). 7_000 = 70%. */
  minAtingimentoBp: z.number().int().min(0),
  /** Multiplicador aplicado à comissão base (bp). 12_000 = 1,2x. */
  multiplicadorBp: z.number().int().min(0).max(5 * BP),
});

export const regrasSchema = z
  .object({
    /** R1 — % de comissão por categoria (slug → bp). */
    categorias: z.record(z.string().min(1), z.number().int().min(0).max(BP)),
    /** R2 — faixas de atingimento, em ordem crescente, a primeira começando em 0%. */
    faixas: z.array(faixaSchema).min(1),
    /** R4 — dias após o vencimento para estornar por inadimplência. */
    inadimplenciaDias: z.number().int().min(1).max(365),
    /** R5 — % de bônus do gestor sobre a comissão da equipe (bp). */
    bonusGestorBp: z.number().int().min(0).max(BP),
    /** R6 — teto mensal de comissão por vendedor (centavos). null = sem teto. */
    tetoMensalCentavos: z.number().int().positive().nullable(),
  })
  .superRefine((r, ctx) => {
    if (Object.keys(r.categorias).length === 0) {
      ctx.addIssue({ code: "custom", path: ["categorias"], message: "Informe ao menos uma categoria" });
    }
    if (r.faixas[0]?.minAtingimentoBp !== 0) {
      ctx.addIssue({ code: "custom", path: ["faixas", 0], message: "A primeira faixa deve começar em 0%" });
    }
    for (let i = 1; i < r.faixas.length; i++) {
      if (r.faixas[i].minAtingimentoBp <= r.faixas[i - 1].minAtingimentoBp) {
        ctx.addIssue({
          code: "custom",
          path: ["faixas", i],
          message: "As faixas devem estar em ordem crescente de atingimento, sem repetição",
        });
      }
    }
  });

export type Faixa = z.infer<typeof faixaSchema>;
export type Regras = z.infer<typeof regrasSchema>;

export type VersaoRegras = {
  id: string;
  /** Sempre o dia 1 de um mês ("YYYY-MM-01"). */
  vigenciaInicio: string;
  regras: Regras;
};

/** Valida o JSON vindo do banco/formulário. Lança ZodError com mensagens em pt-BR. */
export function parseRegras(json: unknown): Regras {
  return regrasSchema.parse(json);
}

/**
 * R7 — Versionamento: a versão que vale para a competência é a de maior vigência
 * que já tinha começado no dia 1 do mês. Como toda vigência começa no dia 1,
 * todas as vendas de um mês usam a mesma versão (a vigente na data da venda).
 */
export function selecionarVersao(versoes: readonly VersaoRegras[], competencia: string): VersaoRegras {
  const inicio = primeiroDia(competencia);
  const vigentes = versoes.filter((v) => v.vigenciaInicio <= inicio);
  if (vigentes.length === 0) {
    throw new ErroDeRegra("SEM_VERSAO_VIGENTE", `Nenhuma versão de regras vigente em ${competencia}`);
  }
  return vigentes.reduce((a, b) => (b.vigenciaInicio > a.vigenciaInicio ? b : a));
}

/** R2 — faixa aplicável a um atingimento (bp). */
export function faixaPara(faixas: readonly Faixa[], atingimentoBp: number): Faixa {
  let escolhida = faixas[0];
  for (const f of faixas) if (atingimentoBp >= f.minAtingimentoBp) escolhida = f;
  return escolhida;
}

/** Erro de regra de negócio, com código estável para a UI tratar. */
export class ErroDeRegra extends Error {
  constructor(
    public readonly codigo:
      | "SEM_VERSAO_VIGENTE"
      | "META_AUSENTE"
      | "CATEGORIA_SEM_PERCENTUAL"
      | "VENDA_FORA_DA_COMPETENCIA",
    mensagem: string,
    public readonly detalhes?: unknown,
  ) {
    super(mensagem);
    this.name = "ErroDeRegra";
  }
}
