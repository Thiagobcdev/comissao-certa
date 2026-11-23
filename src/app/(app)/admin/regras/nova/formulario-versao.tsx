"use client";

import Link from "next/link";
import { useActionState, useState, type ReactNode } from "react";
import { Badge, Button, Card, CardHeader } from "@/components/ui";
import type { FormularioRegras } from "@/domain/commission";
import { rotuloCompetencia } from "@/lib/formato";
import { cn } from "@/lib/utils";
import { processarVersao, type EstadoVersao, type Rascunho } from "./actions";

const INICIAL: EstadoVersao = { etapa: "edicao", erros: {}, avisos: [] };

const classeInput =
  "h-10 w-full rounded-lg border border-line bg-surface px-3 text-sm tabular aria-[invalid=true]:border-neg disabled:bg-surface-2 disabled:text-muted";

export function FormularioVersao({
  inicial,
  categorias,
  vigenciaMinima,
}: {
  inicial: FormularioRegras;
  categorias: Record<string, string>;
  vigenciaMinima: string;
}) {
  const [estado, acao, pendente] = useActionState(processarVersao, INICIAL);
  const [descricao, setDescricao] = useState("");
  const [vigencia, setVigencia] = useState(vigenciaMinima);
  const [f, setF] = useState<FormularioRegras>(inicial);
  const revisando = estado.etapa === "revisao";
  const erros = estado.erros;

  const rascunho: Rascunho = { descricao, vigencia, formulario: f };
  const setFaixa = (i: number, campo: "minPct" | "multiplicador", valor: string) =>
    setF((x) => ({ ...x, faixas: x.faixas.map((fx, j) => (j === i ? { ...fx, [campo]: valor } : fx)) }));

  return (
    <form action={acao} className="space-y-6" noValidate>
      <input type="hidden" name="rascunho" value={JSON.stringify(rascunho)} />

      {estado.avisos.length > 0 && (
        <div role="alert" className="rounded-lg bg-neg-bg px-4 py-3 text-sm text-neg">
          <p className="font-medium">Não foi possível continuar:</p>
          <ul className="mt-1 list-disc pl-5">
            {estado.avisos.map((a) => (
              <li key={a}>{a}</li>
            ))}
          </ul>
        </div>
      )}

      {revisando && estado.revisao && <Revisao revisao={estado.revisao} vigencia={vigencia} pendente={pendente} />}

      <fieldset disabled={revisando || pendente} className="space-y-6">
        <legend className="sr-only">Parâmetros da nova versão</legend>
        <Card>
          <CardHeader title="Identificação" description="Uma versão vale do dia 1 do mês escolhido até a próxima versão (R7)." />
          <div className="grid gap-4 px-5 py-4 sm:grid-cols-[1fr_12rem]">
            <Campo id="descricao" rotulo="O que muda" erro={erros.descricao}>
              <input
                id="descricao"
                value={descricao}
                onChange={(e) => setDescricao(e.target.value)}
                placeholder="Ex.: Campanha Limpeza: categoria sobe para 5%"
                maxLength={120}
                className={classeInput}
                aria-invalid={Boolean(erros.descricao)}
                aria-describedby={erros.descricao ? "descricao-erro" : undefined}
              />
            </Campo>
            <Campo id="vigencia" rotulo="Vale a partir de" erro={erros.vigencia}>
              <input
                id="vigencia"
                type="month"
                value={vigencia}
                min={vigenciaMinima}
                onChange={(e) => setVigencia(e.target.value)}
                className={classeInput}
                aria-invalid={Boolean(erros.vigencia)}
                aria-describedby={erros.vigencia ? "vigencia-erro" : "vigencia-dica"}
              />
              {!erros.vigencia && (
                <p id="vigencia-dica" className="mt-1 text-xs text-muted">
                  A partir de {rotuloCompetencia(vigenciaMinima)}: meses fechados não mudam (R8).
                </p>
              )}
            </Campo>
          </div>
        </Card>

        <Card>
          <CardHeader title="Comissão por categoria (R1)" description="Percentual sobre o valor faturado de cada item." />
          <div className="grid gap-4 px-5 py-4 sm:grid-cols-2 lg:grid-cols-4">
            {Object.entries(categorias).map(([slug, nome]) => {
              const id = `cat-${slug}`;
              const erro = erros[`categorias.${slug}`];
              return (
                <Campo key={slug} id={id} rotulo={nome} erro={erro} sufixo="%">
                  <input
                    id={id}
                    inputMode="decimal"
                    value={f.categorias[slug] ?? ""}
                    onChange={(e) => setF((x) => ({ ...x, categorias: { ...x.categorias, [slug]: e.target.value } }))}
                    className={cn(classeInput, "pr-8")}
                    aria-invalid={Boolean(erro)}
                    aria-describedby={erro ? `${id}-erro` : undefined}
                  />
                </Campo>
              );
            })}
          </div>
        </Card>

        <Card>
          <CardHeader
            title="Faixas de atingimento (R2)"
            description="Multiplicador aplicado à comissão conforme o faturado ÷ meta. A primeira faixa começa em 0%."
          />
          <div className="space-y-3 px-5 py-4">
            {f.faixas.map((fx, i) => {
              const eMin = erros[`faixas.${i}.minPct`];
              const eMult = erros[`faixas.${i}.multiplicador`];
              return (
                <div key={i} role="group" aria-labelledby={`faixa-${i}-titulo`} className="grid grid-cols-[1fr_1fr_auto] items-start gap-x-3 gap-y-1">
                  <p id={`faixa-${i}-titulo`} className="col-span-3 text-xs font-medium uppercase tracking-wide text-muted">
                    Faixa {i + 1}
                  </p>
                  <Campo id={`faixa-${i}-min`} rotulo="A partir de" erro={eMin} sufixo="%">
                    <input
                      id={`faixa-${i}-min`}
                      inputMode="decimal"
                      value={fx.minPct}
                      readOnly={i === 0}
                      onChange={(e) => setFaixa(i, "minPct", e.target.value)}
                      className={cn(classeInput, "pr-8", i === 0 && "bg-surface-2 text-muted")}
                      aria-invalid={Boolean(eMin)}
                      aria-describedby={eMin ? `faixa-${i}-min-erro` : undefined}
                    />
                  </Campo>
                  <Campo id={`faixa-${i}-mult`} rotulo="Multiplicador" erro={eMult} sufixo="x">
                    <input
                      id={`faixa-${i}-mult`}
                      inputMode="decimal"
                      value={fx.multiplicador}
                      onChange={(e) => setFaixa(i, "multiplicador", e.target.value)}
                      className={cn(classeInput, "pr-8")}
                      aria-invalid={Boolean(eMult)}
                      aria-describedby={eMult ? `faixa-${i}-mult-erro` : undefined}
                    />
                  </Campo>
                  <button
                    type="button"
                    disabled={i === 0}
                    onClick={() => setF((x) => ({ ...x, faixas: x.faixas.filter((_, j) => j !== i) }))}
                    className="mt-6 h-10 rounded-lg px-3 text-sm text-muted hover:bg-surface-2 hover:text-neg disabled:invisible"
                    aria-label={`Remover faixa ${i + 1}`}
                  >
                    Remover
                  </button>
                </div>
              );
            })}
            <Button
              type="button"
              variante="secundario"
              disabled={f.faixas.length >= 8}
              onClick={() => setF((x) => ({ ...x, faixas: [...x.faixas, { minPct: "", multiplicador: "" }] }))}
            >
              Adicionar faixa
            </Button>
          </div>
        </Card>

        <Card>
          <CardHeader title="Estornos, bônus e teto" />
          <div className="grid gap-4 px-5 py-4 sm:grid-cols-3">
            <Campo id="inadimplencia" rotulo="Estorno por inadimplência após (R4)" erro={erros.inadimplenciaDias} sufixo="dias">
              <input
                id="inadimplencia"
                inputMode="numeric"
                value={f.inadimplenciaDias}
                onChange={(e) => setF((x) => ({ ...x, inadimplenciaDias: e.target.value }))}
                className={cn(classeInput, "pr-12")}
                aria-invalid={Boolean(erros.inadimplenciaDias)}
                aria-describedby={erros.inadimplenciaDias ? "inadimplencia-erro" : undefined}
              />
            </Campo>
            <Campo id="bonus" rotulo="Bônus do gestor (R5)" erro={erros.bonusGestorPct} sufixo="%">
              <input
                id="bonus"
                inputMode="decimal"
                value={f.bonusGestorPct}
                onChange={(e) => setF((x) => ({ ...x, bonusGestorPct: e.target.value }))}
                className={cn(classeInput, "pr-8")}
                aria-invalid={Boolean(erros.bonusGestorPct)}
                aria-describedby={erros.bonusGestorPct ? "bonus-erro" : undefined}
              />
            </Campo>
            <Campo id="teto" rotulo="Teto mensal por vendedor (R6)" erro={erros.tetoReais} prefixo="R$">
              <input
                id="teto"
                inputMode="decimal"
                value={f.tetoReais}
                placeholder="Sem teto"
                onChange={(e) => setF((x) => ({ ...x, tetoReais: e.target.value }))}
                className={cn(classeInput, "pl-10")}
                aria-invalid={Boolean(erros.tetoReais)}
                aria-describedby={erros.tetoReais ? "teto-erro" : undefined}
              />
            </Campo>
          </div>
        </Card>
      </fieldset>

      {!revisando && (
        <div className="flex items-center justify-end gap-3">
          <Link href="/admin/regras" className="text-sm text-muted hover:text-fg">
            Cancelar
          </Link>
          <Button type="submit" name="intencao" value="revisar" disabled={pendente}>
            {pendente ? "Validando…" : "Revisar mudanças"}
          </Button>
        </div>
      )}
    </form>
  );
}

function Revisao({
  revisao,
  vigencia,
  pendente,
}: {
  revisao: NonNullable<EstadoVersao["revisao"]>;
  vigencia: string;
  pendente: boolean;
}) {
  return (
    <Card className="border-brand">
      <CardHeader
        title={`Revisão · vale a partir de ${rotuloCompetencia(vigencia)}`}
        description={
          revisao.base
            ? `Comparada com a versão de ${rotuloCompetencia(revisao.base.vigencia)}: ${revisao.base.descricao}`
            : "Primeira versão: não há o que comparar."
        }
        action={<Badge tom="brand">{revisao.mudancas.length} mudança(s)</Badge>}
      />
      {revisao.mudancas.length > 0 && (
        <div className="overflow-x-auto">
          <table className="w-full text-sm">
            <caption className="sr-only">Parâmetros alterados</caption>
            <thead>
              <tr className="border-b border-line text-left text-xs uppercase tracking-wide text-muted">
                <th scope="col" className="px-5 py-2 font-medium">Parâmetro</th>
                <th scope="col" className="px-2 py-2 text-right font-medium">Antes</th>
                <th scope="col" className="px-5 py-2 text-right font-medium">Depois</th>
              </tr>
            </thead>
            <tbody className="tabular divide-y divide-line">
              {revisao.mudancas.map((m) => (
                <tr key={m.campo}>
                  <th scope="row" className="px-5 py-2 text-left font-normal">{m.campo}</th>
                  <td className="px-2 py-2 text-right text-muted line-through decoration-neg/60">{m.antes ?? "—"}</td>
                  <td className="px-5 py-2 text-right font-medium text-pos">{m.depois ?? "removida"}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
      <div className="space-y-3 border-t border-line px-5 py-4 text-sm">
        {revisao.afetaMesAberto && (
          <p className="rounded-lg bg-warn-bg px-3 py-2 text-warn">
            {rotuloCompetencia(vigencia)} ainda está em aberto: a prévia e o painel desse mês passam a usar estas regras.
          </p>
        )}
        <p className="text-muted">
          Publicar é definitivo: versões não são editadas nem apagadas. Para corrigir, publique outra versão para um mês ainda aberto.
        </p>
        <div className="flex flex-wrap justify-end gap-3">
          <Button type="submit" name="intencao" value="editar" variante="secundario" disabled={pendente}>
            Voltar e editar
          </Button>
          <Button type="submit" name="intencao" value="publicar" disabled={pendente}>
            {pendente ? "Publicando…" : "Publicar versão"}
          </Button>
        </div>
      </div>
    </Card>
  );
}

function Campo({
  id,
  rotulo,
  erro,
  sufixo,
  prefixo,
  children,
}: {
  id: string;
  rotulo: string;
  erro?: string;
  sufixo?: string;
  prefixo?: string;
  children: ReactNode;
}) {
  return (
    <div className="space-y-1.5">
      <label htmlFor={id} className="block text-sm font-medium">
        {rotulo}
      </label>
      <div className="relative">
        {prefixo && <span className="pointer-events-none absolute inset-y-0 left-3 flex items-center text-sm text-muted">{prefixo}</span>}
        {children}
        {sufixo && <span className="pointer-events-none absolute inset-y-0 right-3 flex items-center text-sm text-muted">{sufixo}</span>}
      </div>
      {erro && (
        <p id={`${id}-erro`} className="text-xs text-neg">
          {erro}
        </p>
      )}
    </div>
  );
}
