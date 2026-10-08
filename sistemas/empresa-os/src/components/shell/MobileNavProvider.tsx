"use client";

import { createContext, useCallback, useContext, useMemo, useState, type ReactNode } from "react";

type MobileNavCtx = {
  open: boolean;
  setOpen: (value: boolean) => void;
  toggle: () => void;
};

const Ctx = createContext<MobileNavCtx | null>(null);

const NOOP: MobileNavCtx = { open: false, setOpen: () => {}, toggle: () => {} };

export function MobileNavProvider({ children }: { children: ReactNode }) {
  const [open, setOpen] = useState(false);
  const toggle = useCallback(() => setOpen((v) => !v), []);
  const value = useMemo(() => ({ open, setOpen, toggle }), [open, toggle]);
  return <Ctx.Provider value={value}>{children}</Ctx.Provider>;
}

/**
 * Estado do drawer de navegacao no mobile. Compartilhado entre o hamburguer
 * (TopBar, renderizado por pagina) e a Sidebar (renderizada no layout do (app)).
 * Fora de um provider devolve no-op — TopBar pode aparecer em contextos sem shell.
 */
export function useMobileNav(): MobileNavCtx {
  return useContext(Ctx) ?? NOOP;
}
