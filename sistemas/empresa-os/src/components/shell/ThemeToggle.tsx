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

/**
 * Aplica a preferência com o tema novo abrindo em círculo a partir do botão (View Transitions; o CSS
 * está em globals.css, `revelar-tema`). Cai na troca seca quando o tema resolvido não muda (escuro ->
 * sistema num aparelho escuro), com movimento reduzido ou em navegador sem o recurso.
 */
function revelar(botao: HTMLElement, p: Preferencia) {
  const el = document.documentElement;
  const depois = resolverTema(p, window.matchMedia(CONSULTA_ESCURO).matches);
  const semMovimento = window.matchMedia("(prefers-reduced-motion: reduce)").matches;
  if (el.dataset.theme === depois || semMovimento || typeof document.startViewTransition !== "function") {
    aplicar(p);
    return;
  }
  const r = botao.getBoundingClientRect();
  const x = r.left + r.width / 2;
  const y = r.top + r.height / 2;
  const raio = Math.hypot(Math.max(x, window.innerWidth - x), Math.max(y, window.innerHeight - y));
  el.style.setProperty("--vt-x", `${x}px`);
  el.style.setProperty("--vt-y", `${y}px`);
  el.style.setProperty("--vt-r", `${raio}px`);
  el.dataset.vt = "tema";
  const limpar = () => {
    delete el.dataset.vt;
  };
  const transicao = document.startViewTransition(() => aplicar(p));
  // Aba em segundo plano: o navegador pula a animação (o tema troca do mesmo jeito) e rejeita o
  // `ready`. Sem este catch isso vira erro solto no console.
  transicao.ready.catch(() => {});
  transicao.finished.then(limpar, limpar);
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

  function alternar(e: React.MouseEvent<HTMLButtonElement>) {
    const proxima = proximaPreferencia(pref);
    try {
      localStorage.setItem(CHAVE_TEMA, proxima);
    } catch {
      /* localStorage indisponível: vale só nesta sessão */
    }
    revelar(e.currentTarget, proxima);
  }

  const Icone = pref === "claro" ? Sun : pref === "escuro" ? Moon : Monitor;
  return (
    <button
      type="button"
      onClick={alternar}
      aria-label={`Tema: ${ROTULO[pref]}`}
      title={`Tema: ${ROTULO[pref]}`}
      className="grid size-11 place-items-center rounded-md text-fg-2 transition-colors hover:bg-bg-sutil hover:text-fg-1"
    >
      {/* key: o ícone novo entra girando a cada troca (`.icone-troca`). */}
      <span key={pref} className="icone-troca grid place-items-center">
        <Icone size={18} aria-hidden />
      </span>
    </button>
  );
}
