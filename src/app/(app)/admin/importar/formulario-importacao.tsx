"use client";

import { useActionState, useState } from "react";
import { Badge, Button, Card, CardHeader } from "@/components/ui";
import { formatarBRL } from "@/domain/commission";
import { rotuloCompetencia } from "@/lib/formato";
import { processarImportacao, type EstadoImportacao } from "./actions";

const INICIAL: EstadoImportacao = { etapa: "inicio", erros: [], totalErros: 0, resumo: null };
const LIMITE_BYTES = 512 * 1024;

export function FormularioImportacao() {
  const [estado, acao, pendente] = useActionState(processarImportacao, INICIAL);
  const [arquivo, setArquivo] = useState<{ nome: string; texto: string } | null>(null);
  const [erroLocal, setErroLocal] = useState<string | null>(null);
  // ao trocar de arquivo, o resultado anterior deixa de valer
  const [estadoDescartado, setEstadoDescartado] = useState<EstadoImportacao | null>(null);

  async function escolher(f: File | undefined) {
    setErroLocal(null);
    setArquivo(null);
    setEstadoDescartado(estado);
    if (!f) return;
    if (f.size > LIMITE_BYTES) return setErroLocal("Arquivo acima de 512 KB: divida em partes.");
    setArquivo({ nome: f.name, texto: await f.text() });
  }

  const resultadoAtual = arquivo && estado !== estadoDescartado ? estado : null;

  return (
    <form action={acao} className="space-y-6">
      <input type="hidden" name="csv" value={arquivo?.texto ?? ""} />
      <input type="hidden" name="arquivo" value={arquivo?.nome ?? ""} />

      <Card>
        <CardHeader title="1. Escolha o arquivo" description="CSV separado por ponto e vírgula, uma linha por item do pedido. Até 512 KB." />
        <div className="flex flex-wrap items-center gap-4 px-5 py-4">
          {/* O input nativo é resetado pelo React após cada action; o nome exibido vem do estado. */}
          <input
            id="arquivo-csv"
            type="file"
            accept=".csv,text/csv"
            onChange={(e) => escolher(e.target.files?.[0])}
            aria-describedby={erroLocal ? "erro-arquivo" : "arquivo-nome"}
            className="peer sr-only"
          />
          <label
            htmlFor="arquivo-csv"
            className="inline-flex h-10 cursor-pointer items-center rounded-lg border border-line bg-surface px-4 text-sm font-medium hover:bg-surface-2 peer-focus-visible:outline-2 peer-focus-visible:outline-offset-2 peer-focus-visible:outline-brand"
          >
            {arquivo ? "Trocar arquivo" : "Escolher arquivo CSV"}
          </label>
          <span id="arquivo-nome" className="min-w-0 truncate text-sm text-muted">
            {arquivo ? arquivo.nome : "Nenhum arquivo escolhido"}
          </span>
          <Button type="submit" name="intencao" value="validar" disabled={!arquivo || pendente}>
            {pendente ? "Validando…" : "Validar arquivo"}
          </Button>
        </div>
        {(erroLocal || (resultadoAtual?.etapa === "inicio" && resultadoAtual.aviso)) && (
          <p id="erro-arquivo" role="alert" className="mx-5 mb-4 rounded-lg bg-neg-bg px-3 py-2 text-sm text-neg">
            {erroLocal ?? resultadoAtual?.aviso}
          </p>
        )}
      </Card>

      {resultadoAtual?.etapa === "erros" && <RelatorioErros estado={resultadoAtual} />}
      {resultadoAtual?.etapa === "pronto" && resultadoAtual.resumo && (
        <Card className="border-pos">
          <CardHeader
            title="2. Tudo certo: confira e importe"
            description={`${resultadoAtual.arquivo} · nenhuma linha com erro`}
            action={<Badge tom="pos">Pronto para importar</Badge>}
          />
          <dl className="tabular grid divide-y divide-line sm:grid-cols-3 sm:divide-x sm:divide-y-0">
            {[
              ["Pedidos", String(resultadoAtual.resumo.pedidos)],
              ["Itens", String(resultadoAtual.resumo.itens)],
              ["Valor total", formatarBRL(resultadoAtual.resumo.totalCentavos)],
            ].map(([rotulo, valor]) => (
              <div key={rotulo} className="px-5 py-4">
                <dt className="text-xs font-medium uppercase tracking-wide text-muted">{rotulo}</dt>
                <dd className="mt-1 text-2xl font-semibold">{valor}</dd>
              </div>
            ))}
          </dl>
          <div className="grid gap-6 border-t border-line px-5 py-4 text-sm sm:grid-cols-2">
            <div>
              <p className="text-xs font-medium uppercase tracking-wide text-muted">Por mês</p>
              <ul className="tabular mt-1 space-y-0.5">
                {resultadoAtual.resumo.porCompetencia.map((c) => (
                  <li key={c.competencia} className="flex justify-between gap-4">
                    <span>{rotuloCompetencia(c.competencia)} · {c.pedidos} pedido(s)</span>
                    <span>{formatarBRL(c.totalCentavos)}</span>
                  </li>
                ))}
              </ul>
            </div>
            <div>
              <p className="text-xs font-medium uppercase tracking-wide text-muted">Por vendedor</p>
              <ul className="tabular mt-1 space-y-0.5">
                {resultadoAtual.resumo.porVendedor.map((v) => (
                  <li key={v.nome} className="flex justify-between gap-4">
                    <span>{v.nome} · {v.pedidos}</span>
                    <span>{formatarBRL(v.totalCentavos)}</span>
                  </li>
                ))}
              </ul>
            </div>
          </div>
          <div className="flex flex-wrap items-center justify-end gap-3 border-t border-line px-5 py-4">
            <p className="mr-auto text-sm text-muted">As vendas entram na prévia do mês em aberto assim que forem importadas.</p>
            <Button type="submit" name="intencao" value="importar" disabled={pendente}>
              {pendente ? "Importando…" : `Importar ${resultadoAtual.resumo.pedidos} pedido(s)`}
            </Button>
          </div>
        </Card>
      )}
    </form>
  );
}

function RelatorioErros({ estado }: { estado: EstadoImportacao }) {
  const linhas = new Set(estado.erros.map((e) => e.linha)).size;
  return (
    <Card className="border-neg">
      <CardHeader
        title="2. Corrija o arquivo e valide de novo"
        description={`${estado.arquivo} · nada foi gravado`}
        action={<Badge tom="neg">{estado.totalErros} erro(s)</Badge>}
      />
      {estado.aviso && <p className="border-b border-line bg-warn-bg px-5 py-2 text-sm text-warn">{estado.aviso}</p>}
      <div className="max-h-[28rem] overflow-auto">
        <table className="w-full text-sm">
          <caption className="sr-only">Erros encontrados em {linhas} linha(s)</caption>
          <thead className="sticky top-0 bg-surface">
            <tr className="border-b border-line text-left text-xs uppercase tracking-wide text-muted">
              <th scope="col" className="w-20 px-5 py-2 font-medium">Linha</th>
              <th scope="col" className="w-32 px-2 py-2 font-medium">Coluna</th>
              <th scope="col" className="px-5 py-2 font-medium">Problema</th>
            </tr>
          </thead>
          <tbody className="divide-y divide-line">
            {estado.erros.map((e, i) => (
              <tr key={i}>
                <td className="tabular px-5 py-2">{e.linha}</td>
                <td className="px-2 py-2 font-mono text-xs">{e.coluna ?? "—"}</td>
                <td className="px-5 py-2">{e.mensagem}</td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
      {estado.totalErros > estado.erros.length && (
        <p className="border-t border-line px-5 py-2 text-sm text-muted">
          Mostrando os primeiros {estado.erros.length} de {estado.totalErros} erros.
        </p>
      )}
    </Card>
  );
}
