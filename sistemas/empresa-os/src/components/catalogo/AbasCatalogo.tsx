import Link from "next/link";
import { cn } from "@/lib/utils";
import { ROTULO_TIPO, type TipoArtefato } from "@/lib/catalogo/catalogo";

const ORDEM: TipoArtefato[] = ["agente", "skill", "workflow"];

/** Abas da tela: links de verdade (a aba vive na URL), com o mesmo visual do SegmentedControl. */
export function AbasCatalogo({ ativo, contagens }: { ativo: TipoArtefato; contagens: Record<TipoArtefato, number> }) {
  return (
    <nav
      aria-label="Tipo"
      className="inline-flex max-w-full items-center gap-1 overflow-x-auto overscroll-x-contain rounded-md bg-bg-sutil p-1 [scrollbar-width:none]"
    >
      {ORDEM.map((tipo) => {
        const on = tipo === ativo;
        return (
          <Link
            key={tipo}
            href={tipo === "agente" ? "/agentes" : `/agentes?tipo=${tipo}`}
            aria-current={on ? "page" : undefined}
            className={cn(
              "inline-flex min-h-11 items-center gap-1.5 rounded-sm px-3 py-1 text-xs font-semibold transition-colors md:min-h-0",
              on ? "bg-bg-elevada text-fg-1 shadow-[var(--sombra-sm)]" : "text-fg-3 hover:text-fg-1",
            )}
          >
            {ROTULO_TIPO[tipo].plural}
            <span className={cn("tabular-nums", on ? "text-acento-texto" : "text-fg-4")}>{contagens[tipo]}</span>
          </Link>
        );
      })}
    </nav>
  );
}
