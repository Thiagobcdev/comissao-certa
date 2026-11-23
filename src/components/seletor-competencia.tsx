import Link from "next/link";
import { rotuloCompetencia } from "@/lib/formato";
import { cn } from "@/lib/utils";

export function SeletorCompetencia({ competencias, atual }: { competencias: string[]; atual: string }) {
  return (
    <nav aria-label="Competência" className="flex flex-wrap gap-2">
      {competencias.map((c) => (
        <Link
          key={c}
          href={`?c=${c}`}
          aria-current={c === atual ? "page" : undefined}
          className={cn(
            "rounded-full border px-3 py-1 text-sm",
            c === atual ? "border-brand bg-brand text-brand-fg" : "border-line bg-surface hover:bg-surface-2",
          )}
        >
          {rotuloCompetencia(c)}
        </Link>
      ))}
    </nav>
  );
}
