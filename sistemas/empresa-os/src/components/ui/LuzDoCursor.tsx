"use client";

import { useEffect } from "react";

/**
 * Diz ao CSS onde o cursor está dentro do que acende (`.luz`, `.palco-luz` em globals.css): grava
 * `--mx`/`--my` no elemento sob o cursor. Um ouvinte só, no documento, no ritmo da tela; não
 * renderiza nada. Sem cursor de verdade (celular) ou com movimento reduzido, não liga.
 */
export function LuzDoCursor() {
  useEffect(() => {
    if (!window.matchMedia("(hover: hover) and (pointer: fine)").matches) return;
    let quadro = 0;
    let ultimo: PointerEvent | null = null;

    function pintar() {
      quadro = 0;
      const e = ultimo;
      if (!e || !(e.target instanceof Element)) return;
      const alvo = e.target.closest<HTMLElement>(".luz, .palco-luz");
      if (!alvo) return;
      const r = alvo.getBoundingClientRect();
      alvo.style.setProperty("--mx", `${e.clientX - r.left}px`);
      alvo.style.setProperty("--my", `${e.clientY - r.top}px`);
    }
    function aoMover(e: PointerEvent) {
      ultimo = e;
      if (!quadro) quadro = requestAnimationFrame(pintar);
    }

    document.addEventListener("pointermove", aoMover, { passive: true });
    return () => {
      document.removeEventListener("pointermove", aoMover);
      if (quadro) cancelAnimationFrame(quadro);
    };
  }, []);

  return null;
}
