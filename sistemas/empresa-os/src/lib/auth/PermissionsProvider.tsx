"use client";

import { createContext, useContext, useMemo } from "react";
import { pode, type Modulo, type Sessao } from "./permissoes";

type Ctx = {
  sessao: Sessao;
  /** O usuário enxerga este módulo? (camada de UI — esconder link) */
  pode: (modulo: Modulo) => boolean;
};

const PermissionsContext = createContext<Ctx | null>(null);

export function PermissionsProvider({
  sessao,
  children,
}: {
  sessao: Sessao;
  children: React.ReactNode;
}) {
  const value = useMemo<Ctx>(
    () => ({
      sessao,
      pode: (modulo) => pode(sessao, modulo),
    }),
    [sessao],
  );
  return (
    <PermissionsContext.Provider value={value}>
      {children}
    </PermissionsContext.Provider>
  );
}

export function usePermissions(): Ctx {
  const ctx = useContext(PermissionsContext);
  if (!ctx)
    throw new Error("usePermissions precisa estar dentro de PermissionsProvider");
  return ctx;
}
