import type { Metadata } from "next";
import { Suspense } from "react";
import { Card, CardHeader, Skeleton } from "@/components/ui";
import { formatarBRL } from "@/domain/commission";
import { COLUNAS } from "@/domain/vendas/importacao";
import { exigirPapel } from "@/server/auth";
import { FormularioImportacao } from "./formulario-importacao";

export const metadata: Metadata = { title: "Importar vendas" };

const DESCRICAO: Record<(typeof COLUNAS)[number], string> = {
  pedido: "Número do pedido (único). Itens do mesmo pedido repetem o número.",
  data: "Data da venda, dd/mm/aaaa. Só meses ainda não fechados.",
  vendedor: "E-mail do vendedor. Ele precisa ter meta no mês da venda.",
  cliente: "Nome do cliente.",
  vencimento: "Vencimento da cobrança, dd/mm/aaaa.",
  categoria: "Alimentos, Bebidas, Limpeza ou Higiene.",
  valor: "Valor do item em reais, ex.: 1.250,00.",
};

export default function ImportarPage({ searchParams }: PageProps<"/admin/importar">) {
  return (
    <div className="mx-auto max-w-5xl space-y-6">
      <div>
        <h1 className="text-2xl font-semibold">Importar vendas</h1>
        <p className="text-sm text-muted">
          O arquivo é validado linha a linha. Se houver qualquer erro, nada é gravado.
        </p>
      </div>
      <Suspense fallback={<Skeleton className="h-64 w-full" />}>
        <Conteudo searchParams={searchParams} />
      </Suspense>
      <Card>
        <CardHeader
          title="Formato do arquivo"
          description="Uma linha por item do pedido, separada por ponto e vírgula, com cabeçalho."
          action={
            <a href="/modelo-vendas.csv" download className="text-sm font-medium text-brand underline-offset-4 hover:underline">
              Baixar modelo
            </a>
          }
        />
        <dl className="divide-y divide-line text-sm">
          {Object.entries(DESCRICAO).map(([coluna, texto]) => (
            <div key={coluna} className="grid gap-1 px-5 py-2 sm:grid-cols-[9rem_1fr]">
              <dt className="font-mono text-xs leading-5">{coluna}</dt>
              <dd className="text-muted">{texto}</dd>
            </div>
          ))}
        </dl>
      </Card>
    </div>
  );
}

async function Conteudo({ searchParams }: { searchParams: PageProps<"/admin/importar">["searchParams"] }) {
  await exigirPapel("ADMIN");
  const { importados, total } = await searchParams;
  return (
    <>
      {typeof importados === "string" && (
        <p role="status" className="rounded-lg bg-pos-bg px-4 py-3 text-sm text-pos">
          {importados} pedido(s) importado(s)
          {typeof total === "string" && /^\d+$/.test(total) ? `, somando ${formatarBRL(Number(total))}` : ""}. Eles já
          aparecem na prévia do mês.
        </p>
      )}
      <FormularioImportacao />
    </>
  );
}
