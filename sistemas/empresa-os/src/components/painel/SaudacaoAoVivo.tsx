"use client";

import { useSyncExternalStore } from "react";
import { saudacao } from "./saudacao";

/**
 * Saudação por hora como client component: "agora" é fonte externa mutável,
 * e useSyncExternalStore é o jeito sancionado de lê-la sem violar a pureza
 * do render (regra react-hooks/purity — padrão da casa, sem eslint-disable).
 * No servidor não existe "hora do usuário": getServerSnapshot devolve null
 * e o SSR pinta o fallback neutro "Olá"; o client corrige logo após montar.
 */

/* A saudação só muda na virada de hora; sem re-render agendado, o texto
   pintado no mount já vale pelo pageview inteiro. */
function assinar(): () => void {
  return () => {};
}

function lerSaudacaoAgora(): string {
  return saudacao();
}

function noServidor(): null {
  return null;
}

export function SaudacaoAoVivo() {
  const texto = useSyncExternalStore(assinar, lerSaudacaoAgora, noServidor);
  return <>{texto ?? "Olá"}</>;
}
