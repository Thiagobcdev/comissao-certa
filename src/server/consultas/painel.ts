/**
 * Painel do gestor: visão da equipe numa competência e série mês a mês.
 *  - Mês FECHADO → linhas gravadas (R8), valores exatos.
 *  - Mês ABERTO  → prévia do motor ("se fechasse hoje") + projeção para o fim do mês.
 */
import "server-only";
import {
  calcularFechamento,
  faixaPara,
  projetarEntrada,
  selecionarVersao,
  somar,
  BP,
  type Faixa,
  type ResultadoFechamento,
} from "@/domain/commission";
import { hojeISO } from "@/lib/formato";
import { prisma } from "../db";
import { carregarVersoes, montarEntrada } from "../fechamento";
import { calcularProximaFaixa, faturadoDoMes } from "./extrato";

export type EquipeDoGestor = { id: string; nome: string };

export type LinhaPainel = {
  vendedorId: string;
  nome: string;
  faturadoCentavos: number;
  metaCentavos: number;
  atingimentoBp: number;
  faixa: Faixa;
  proximaFaixa: (Faixa & { faltaCentavos: number }) | null;
  /** Comissão do mês (fechada ou prévia), já com teto, estornos e reversões. */
  totalCentavos: number;
  ajusteTetoCentavos: number;
  estornosCentavos: number;
  projecao: { faturadoCentavos: number; atingimentoBp: number; faixa: Faixa; totalCentavos: number } | null;
};

export type ResumoEquipePainel = {
  faturadoCentavos: number;
  metaCentavos: number;
  atingimentoBp: number;
  atingiuMeta: boolean;
  /** Soma das comissões dos vendedores (total, com estornos). */
  comissaoCentavos: number;
  bonusGestorCentavos: number;
};

export type Painel = {
  competencia: string;
  fechado: boolean;
  fechadoEm: string | null;
  versaoDescricao: string;
  equipe: ResumoEquipePainel;
  vendedores: LinhaPainel[]; // ranking: maior atingimento primeiro
  projecao: {
    equipe: ResumoEquipePainel;
    diasDecorridos: number;
    diasNoMes: number;
    fatorBp: number;
  } | null;
};

export type PontoSerie = {
  competencia: string;
  fechado: boolean;
  faturadoCentavos: number;
  metaCentavos: number;
  comissaoCentavos: number;
  bonusGestorCentavos: number;
  /** Só no mês aberto: faturado projetado para o fim do mês. */
  faturadoProjetadoCentavos: number | null;
};

export async function getEquipeDoGestor(gestorId: string): Promise<EquipeDoGestor | null> {
  return prisma.equipe.findUnique({ where: { gestorId }, select: { id: true, nome: true } });
}

/** Competências com meta coletiva para a equipe (mais recentes primeiro). */
export async function competenciasDaEquipe(equipeId: string): Promise<string[]> {
  const metas = await prisma.metaEquipe.findMany({
    where: { equipeId },
    select: { competencia: true },
    orderBy: { competencia: "desc" },
  });
  return metas.map((m) => m.competencia);
}

const atingimento = (faturado: number, meta: number) => (meta > 0 ? Math.floor((faturado * BP) / meta) : 0);

function resumoDoMotor(r: ResultadoFechamento, equipeId: string): ResumoEquipePainel {
  const eq = r.equipes.find((e) => e.equipeId === equipeId);
  const membros = r.vendedores.filter((v) => v.equipeId === equipeId);
  const faturado = eq?.faturadoCentavos ?? 0;
  const meta = eq?.metaCentavos ?? 0;
  return {
    faturadoCentavos: faturado,
    metaCentavos: meta,
    atingimentoBp: atingimento(faturado, meta),
    atingiuMeta: eq?.atingiuMeta ?? false,
    comissaoCentavos: somar(membros.map((m) => m.totalCentavos)),
    bonusGestorCentavos: eq?.bonusGestorCentavos ?? 0,
  };
}

const porAtingimento = (a: LinhaPainel, b: LinhaPainel) =>
  b.atingimentoBp - a.atingimentoBp || b.totalCentavos - a.totalCentavos || a.nome.localeCompare(b.nome);

async function painelFechado(
  equipeId: string,
  competencia: string,
  fechamento: { id: string; fechadoEm: Date; versaoRegrasId: string; versaoRegras: { descricao: string } },
): Promise<Painel> {
  const [equipe, membros, metas, metaEquipe, versoes] = await Promise.all([
    prisma.equipe.findUniqueOrThrow({ where: { id: equipeId }, select: { gestorId: true } }),
    prisma.usuario.findMany({ where: { equipeId, papel: "VENDEDOR" }, select: { id: true, nome: true }, orderBy: { nome: "asc" } }),
    prisma.meta.findMany({ where: { competencia, vendedor: { equipeId } } }),
    prisma.metaEquipe.findUnique({ where: { equipeId_competencia: { equipeId, competencia } } }),
    carregarVersoes(prisma),
  ]);
  const ids = membros.map((m) => m.id);
  const beneficiarios = equipe.gestorId ? [...ids, equipe.gestorId] : ids;

  const [linhas, faturados] = await Promise.all([
    prisma.linhaComissao.groupBy({
      by: ["beneficiarioId", "tipo"],
      where: { fechamentoId: fechamento.id, beneficiarioId: { in: beneficiarios } },
      _sum: { valorCentavos: true },
    }),
    Promise.all(ids.map((id) => faturadoDoMes(id, competencia))),
  ]);
  const soma = (id: string, filtro: (t: string) => boolean) =>
    somar(linhas.filter((l) => l.beneficiarioId === id && filtro(l.tipo)).map((l) => l._sum.valorCentavos ?? 0));

  const regras = versoes.find((v) => v.id === fechamento.versaoRegrasId)!.regras;
  const metaDe = new Map(metas.map((m) => [m.vendedorId, m.valorCentavos]));

  const vendedores: LinhaPainel[] = membros.map((m, i) => {
    const faturado = faturados[i];
    const meta = metaDe.get(m.id) ?? 0;
    const atingimentoBp = atingimento(faturado, meta);
    return {
      vendedorId: m.id,
      nome: m.nome,
      faturadoCentavos: faturado,
      metaCentavos: meta,
      atingimentoBp,
      faixa: faixaPara(regras.faixas, atingimentoBp),
      proximaFaixa: calcularProximaFaixa(regras.faixas, atingimentoBp, faturado, meta),
      totalCentavos: soma(m.id, () => true),
      ajusteTetoCentavos: soma(m.id, (t) => t === "AJUSTE_TETO"),
      estornosCentavos: soma(m.id, (t) => t.startsWith("ESTORNO")),
      projecao: null,
    };
  });

  const faturadoEquipe = somar(faturados);
  const metaEquipeCentavos = metaEquipe?.valorCentavos ?? 0;

  return {
    competencia,
    fechado: true,
    fechadoEm: fechamento.fechadoEm.toISOString(),
    versaoDescricao: fechamento.versaoRegras.descricao,
    equipe: {
      faturadoCentavos: faturadoEquipe,
      metaCentavos: metaEquipeCentavos,
      atingimentoBp: atingimento(faturadoEquipe, metaEquipeCentavos),
      atingiuMeta: metaEquipeCentavos > 0 && faturadoEquipe >= metaEquipeCentavos,
      comissaoCentavos: somar(vendedores.map((v) => v.totalCentavos)),
      bonusGestorCentavos: equipe.gestorId ? soma(equipe.gestorId, (t) => t === "BONUS_GESTOR") : 0,
    },
    vendedores: vendedores.sort(porAtingimento),
    projecao: null,
  };
}

async function painelAberto(equipeId: string, competencia: string, hoje: string): Promise<Painel> {
  const entrada = await montarEntrada(prisma, competencia);
  const previa = calcularFechamento(entrada);
  const proj = projetarEntrada(entrada, hoje);
  const projetado = proj.fatorBp === BP ? previa : calcularFechamento(proj.entrada);

  const versao = selecionarVersao(entrada.versoes, competencia);
  const descricao = await prisma.versaoRegras.findUnique({ where: { id: versao.id }, select: { descricao: true } });
  const projPorId = new Map(projetado.vendedores.map((v) => [v.vendedorId, v]));

  const vendedores: LinhaPainel[] = previa.vendedores
    .filter((v) => v.equipeId === equipeId)
    .map((v) => {
      const p = projPorId.get(v.vendedorId)!;
      return {
        vendedorId: v.vendedorId,
        nome: v.nome,
        faturadoCentavos: v.faturadoCentavos,
        metaCentavos: v.metaCentavos,
        atingimentoBp: v.atingimentoBp,
        faixa: v.faixa,
        proximaFaixa: calcularProximaFaixa(versao.regras.faixas, v.atingimentoBp, v.faturadoCentavos, v.metaCentavos),
        totalCentavos: v.totalCentavos,
        ajusteTetoCentavos: v.ajusteTetoCentavos,
        estornosCentavos: v.estornosCentavos,
        projecao: { faturadoCentavos: p.faturadoCentavos, atingimentoBp: p.atingimentoBp, faixa: p.faixa, totalCentavos: p.totalCentavos },
      };
    });

  return {
    competencia,
    fechado: false,
    fechadoEm: null,
    versaoDescricao: descricao?.descricao ?? "",
    equipe: resumoDoMotor(previa, equipeId),
    vendedores: vendedores.sort(porAtingimento),
    projecao: {
      equipe: resumoDoMotor(projetado, equipeId),
      diasDecorridos: proj.diasDecorridos,
      diasNoMes: proj.diasNoMes,
      fatorBp: proj.fatorBp,
    },
  };
}

export async function getPainel(equipeId: string, competencia: string, hoje: string = hojeISO()): Promise<Painel> {
  const fechamento = await prisma.fechamento.findUnique({
    where: { competencia },
    select: { id: true, fechadoEm: true, versaoRegrasId: true, versaoRegras: { select: { descricao: true } } },
  });
  return fechamento ? painelFechado(equipeId, competencia, fechamento) : painelAberto(equipeId, competencia, hoje);
}

/** Série para o gráfico: uma entrada por competência com meta coletiva (mais antiga primeiro). */
export async function getSerieMensal(equipeId: string, hoje: string = hojeISO()): Promise<PontoSerie[]> {
  const competencias = (await competenciasDaEquipe(equipeId)).filter((c) => c <= hoje.slice(0, 7)).reverse();
  const paineis = await Promise.all(competencias.map((c) => getPainel(equipeId, c, hoje)));
  return paineis.map((p) => ({
    competencia: p.competencia,
    fechado: p.fechado,
    faturadoCentavos: p.equipe.faturadoCentavos,
    metaCentavos: p.equipe.metaCentavos,
    comissaoCentavos: p.equipe.comissaoCentavos,
    bonusGestorCentavos: p.equipe.bonusGestorCentavos,
    faturadoProjetadoCentavos: p.projecao?.equipe.faturadoCentavos ?? null,
  }));
}
