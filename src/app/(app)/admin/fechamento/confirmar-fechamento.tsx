"use client";

import { useActionState, useState } from "react";
import { Button } from "@/components/ui";
import { rotuloCompetencia } from "@/lib/formato";
import { fecharMes, type EstadoFechamento } from "./actions";

export function ConfirmarFechamento({ competencia, totalTexto }: { competencia: string; totalTexto: string }) {
  const [estado, acao, pendente] = useActionState<EstadoFechamento, FormData>(fecharMes, {});
  const [texto, setTexto] = useState("");
  const rotulo = rotuloCompetencia(competencia);
  const confere = texto.trim().toLowerCase() === rotulo;

  return (
    <form action={acao} className="space-y-3">
      <input type="hidden" name="competencia" value={competencia} />
      <p className="text-sm">
        Fechar grava <strong>{totalTexto}</strong> em comissões e <strong>não pode ser desfeito</strong> (R8). Correções
        posteriores entram no fechamento seguinte.
      </p>
      <div className="flex flex-wrap items-end gap-3">
        <div className="space-y-1.5">
          <label htmlFor="confirmacao" className="block text-sm font-medium">
            Para confirmar, digite <span className="font-mono">{rotulo}</span>
          </label>
          <input
            id="confirmacao"
            name="confirmacao"
            value={texto}
            onChange={(e) => setTexto(e.target.value)}
            autoComplete="off"
            className="h-10 w-48 rounded-lg border border-line bg-surface px-3 font-mono text-sm"
            aria-describedby={estado.erro ? "erro-fechamento" : undefined}
          />
        </div>
        <Button type="submit" disabled={!confere || pendente} className="bg-neg hover:bg-neg/90">
          {pendente ? "Fechando…" : `Fechar ${rotulo}`}
        </Button>
      </div>
      {estado.erro && (
        <p id="erro-fechamento" role="alert" className="rounded-lg bg-neg-bg px-3 py-2 text-sm text-neg">
          {estado.erro}
        </p>
      )}
    </form>
  );
}
