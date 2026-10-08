import type { ReactNode } from "react";
import { cn } from "@/lib/utils";

/**
 * Rótulo de seção do painel do cargo — 13px, caixa alta, fg-3, espaçado
 * acima. O `!` é obrigatório: `globals.css:286-288` declara `h3, h4 { ... }`
 * FORA de `@layer` (Tailwind v4), então essa regra vence qualquer utility
 * sem `!`, mesmo com classe de tamanho — por isso "O QUE DOMINA" e afins
 * saíam em 24px/20px em vez de 13px (ver
 * docs/superpowers/specs/2026-09-28-organograma-painel-design-criterios.md,
 * C1/P0-1). Não mexe em globals.css: isso afetaria o CRM inteiro.
 */
export function TituloSecao({
  children,
  className,
  as: Tag = "h3",
}: {
  children: ReactNode;
  className?: string;
  as?: "h2" | "h3" | "h4";
}) {
  return (
    <Tag
      className={cn(
        "!font-sans !text-[13px] !font-semibold uppercase !tracking-wide !text-fg-3 !leading-snug !mt-5 !mb-2",
        className,
      )}
    >
      {children}
    </Tag>
  );
}
