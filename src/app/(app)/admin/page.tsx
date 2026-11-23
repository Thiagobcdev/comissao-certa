import { Card } from "@/components/ui";

export default function AdminPage() {
  return (
    <div className="mx-auto max-w-5xl space-y-4">
      <h1 className="text-2xl font-semibold">Visão geral</h1>
      <Card className="p-6 text-sm text-muted">Regras, importação de vendas e fechamento: etapa do roadmap.</Card>
    </div>
  );
}
