"use client";

import { useEffect, useRef, useState } from "react";
import { LogOut } from "lucide-react";
import { usePermissions } from "@/lib/auth/PermissionsProvider";
import { sair } from "@/app/(public)/login/actions";

/**
 * Avatar com menu: identifica quem está logado e permite sair. A navegação
 * fica toda na sidebar/gaveta.
 */
export function UserMenu() {
  const { sessao } = usePermissions();
  const [aberto, setAberto] = useState(false);
  const ref = useRef<HTMLDivElement>(null);

  useEffect(() => {
    if (!aberto) return;
    function fechar(e: MouseEvent) {
      if (ref.current && !ref.current.contains(e.target as Node)) setAberto(false);
    }
    document.addEventListener("mousedown", fechar);
    return () => document.removeEventListener("mousedown", fechar);
  }, [aberto]);

  const iniciais = sessao.nome
    .split(" ")
    .filter(Boolean)
    .slice(0, 2)
    .map((p) => p[0]?.toUpperCase())
    .join("");

  return (
    <div className="relative" ref={ref}>
      <button
        type="button"
        onClick={() => setAberto((v) => !v)}
        aria-expanded={aberto}
        aria-label="Menu do usuário"
        className="flex size-11 items-center justify-center rounded-full bg-acento-suave text-sm font-semibold text-acento-texto"
      >
        {iniciais || "?"}
      </button>

      {aberto && (
        <div className="absolute right-0 top-12 z-50 w-64 rounded-lg border border-borda bg-bg-elevada p-2 shadow-[var(--sombra-md)]">
          <div className="border-b border-borda-suave px-3 py-2">
            <p className="truncate text-sm font-semibold text-fg-1">{sessao.nome}</p>
            <p className="truncate text-xs text-fg-3">{sessao.email}</p>
            {sessao.eDono && (
              <p className="mt-1 text-xs font-medium text-acento-texto">Dono</p>
            )}
          </div>

          <form action={sair} className="pt-1">
            <button
              type="submit"
              className="flex w-full items-center gap-2 rounded-md px-3 py-2.5 text-sm text-erro hover:bg-erro-suave"
            >
              <LogOut className="size-4" aria-hidden />
              Sair
            </button>
          </form>
        </div>
      )}
    </div>
  );
}
