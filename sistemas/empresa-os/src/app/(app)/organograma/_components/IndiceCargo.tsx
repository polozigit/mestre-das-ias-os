"use client";

import { itensIndiceCargo } from "@/lib/organograma/cargo";
import type { OrgNo } from "@/lib/organograma/tipos";

/**
 * Índice fixo do cargo (C3): fica grudado abaixo da TopBar ao rolar e leva
 * qualquer bloco do painel/pacote a 1 clique. Scroll do navegador via
 * `<a href="#...">` — sem scroll-spy nesta rodada (P1-1).
 */
export function IndiceCargo({ no }: { no: OrgNo }) {
  const itens = itensIndiceCargo(no);

  return (
    <nav
      aria-label="Seções do cargo"
      className="sticky top-[var(--topbar-h)] z-20 -mx-1 flex flex-wrap gap-1 border-b border-borda-suave bg-bg/90 px-1 py-2 backdrop-blur"
    >
      {itens.map((item) => (
        <a
          key={item.href}
          href={item.href}
          className="inline-flex items-center gap-1.5 rounded-sm px-3 py-1 text-xs font-semibold text-fg-3 transition-colors hover:bg-bg-sutil hover:text-fg-1"
        >
          {item.rotulo}
        </a>
      ))}
      <a
        href="#organograma-trilha"
        className="ml-auto inline-flex items-center gap-1 rounded-sm px-3 py-1 text-xs font-semibold text-acento-texto hover:bg-acento-suave"
      >
        ↑ Organograma
      </a>
    </nav>
  );
}
