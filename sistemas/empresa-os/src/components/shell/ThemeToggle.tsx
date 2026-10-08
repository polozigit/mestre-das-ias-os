"use client";

import { useEffect, useSyncExternalStore } from "react";
import { Monitor, Moon, Sun } from "lucide-react";
import {
  CHAVE_TEMA,
  lerPreferencia,
  proximaPreferencia,
  resolverTema,
  type Preferencia,
} from "@/lib/tema";

const ROTULO: Record<Preferencia, string> = { claro: "claro", escuro: "escuro", sistema: "sistema" };
const CONSULTA_ESCURO = "(prefers-color-scheme: dark)";

const EVENTO_TEMA = "empresa-os-tema-change";

function aplicar(p: Preferencia) {
  const el = document.documentElement;
  el.dataset.temaPref = p;
  el.dataset.theme = resolverTema(p, window.matchMedia(CONSULTA_ESCURO).matches);
  window.dispatchEvent(new Event(EVENTO_TEMA));
}

// Fonte única: <html data-tema-pref>, já aplicado pelo script do head antes do paint.
function assinar(cb: () => void) {
  window.addEventListener(EVENTO_TEMA, cb);
  return () => window.removeEventListener(EVENTO_TEMA, cb);
}
function foto(): Preferencia {
  return lerPreferencia(document.documentElement.dataset.temaPref);
}
function fotoServidor(): Preferencia {
  return "sistema";
}

/** Cicla claro, escuro, sistema. O estado inicial vem do atributo que o script do head já aplicou. */
export function ThemeToggle() {
  const pref = useSyncExternalStore(assinar, foto, fotoServidor);

  useEffect(() => {
    if (pref !== "sistema") return;
    const mq = window.matchMedia(CONSULTA_ESCURO);
    const aoMudar = () => aplicar("sistema");
    mq.addEventListener("change", aoMudar);
    return () => mq.removeEventListener("change", aoMudar);
  }, [pref]);

  function alternar() {
    const proxima = proximaPreferencia(pref);
    try {
      localStorage.setItem(CHAVE_TEMA, proxima);
    } catch {
      /* localStorage indisponível: vale só nesta sessão */
    }
    aplicar(proxima);
  }

  const Icone = pref === "claro" ? Sun : pref === "escuro" ? Moon : Monitor;
  return (
    <button
      type="button"
      onClick={alternar}
      aria-label={`Tema: ${ROTULO[pref]}`}
      title={`Tema: ${ROTULO[pref]}`}
      className="grid size-11 place-items-center rounded-md text-fg-2 hover:bg-bg-sutil"
    >
      <Icone size={18} aria-hidden />
    </button>
  );
}
