"use client";

import { Menu } from "lucide-react";
import { ThemeToggle } from "./ThemeToggle";
import { UserMenu } from "./UserMenu";
import { useMobileNav } from "./MobileNavProvider";

/** Barra do topo: hambúrguer (só celular, abre a gaveta), tema e menu do usuário. */
export function TopBar() {
  const { toggle } = useMobileNav();
  return (
    <header className="sticky top-0 z-30 flex h-[var(--topbar-h)] items-center gap-2 border-b border-borda bg-bg-elevada px-4 lg:px-6">
      <button
        type="button"
        onClick={toggle}
        aria-label="Abrir menu"
        className="-ml-2 grid size-11 place-items-center rounded-md text-fg-2 hover:bg-bg-sutil lg:hidden"
      >
        <Menu size={20} aria-hidden />
      </button>
      {/* Sem título aqui: cada página tem o seu próprio h1 (nunca um h1 vazio no shell). */}
      <div className="flex-1" />
      <ThemeToggle />
      <UserMenu />
    </header>
  );
}
