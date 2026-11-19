"use client";

import { useLayoutEffect, useRef } from "react";
import { cn } from "@/lib/utils";

export type SegmentOption<T extends string> = {
  value: T;
  label: string;
  count?: number;
};

export function SegmentedControl<T extends string>({
  options,
  value,
  onChange,
  className,
  size = "sm",
}: {
  options: SegmentOption<T>[];
  value: T;
  onChange: (v: T) => void;
  className?: string;
  /**
   * "touch" dá 44px de alvo no mobile (`min-h-11 md:min-h-0`) — alvo mínimo de
   * toque recomendado. Opt-in pra não mudar a altura de todos os consumidores.
   */
  size?: "sm" | "touch";
}) {
  // Fundo da aba ativa: um elemento só, que desliza até a aba escolhida (`.aba-marca` em globals.css).
  // Direto no estilo, sem re-render; sem JavaScript a aba ativa mantém o próprio fundo.
  const listaRef = useRef<HTMLDivElement>(null);
  const marcaRef = useRef<HTMLSpanElement>(null);
  useLayoutEffect(() => {
    const lista = listaRef.current;
    const marca = marcaRef.current;
    if (!lista || !marca) return;
    function posicionar() {
      if (!lista || !marca) return;
      const ativa = lista.querySelector<HTMLElement>('[role="tab"][aria-selected="true"]');
      if (!ativa) {
        marca.style.opacity = "0";
        delete lista.dataset.marca;
        return;
      }
      const primeira = lista.dataset.marca !== "on";
      if (primeira) marca.style.transitionProperty = "opacity";
      marca.style.width = `${ativa.offsetWidth}px`;
      marca.style.transform = `translateX(${ativa.offsetLeft}px)`;
      marca.style.opacity = "1";
      lista.dataset.marca = "on";
      if (primeira) {
        void marca.offsetWidth;
        marca.style.transitionProperty = "";
      }
    }
    posicionar();
    if (typeof ResizeObserver === "undefined") return;
    const observador = new ResizeObserver(posicionar);
    observador.observe(lista);
    return () => observador.disconnect();
  }, [value, options.length]);

  return (
    <div
      ref={listaRef}
      role="tablist"
      className={cn(
        "relative inline-flex max-w-full items-center gap-1 overflow-x-auto overscroll-x-contain rounded-md bg-bg-sutil p-1 [scrollbar-width:none]",
        className,
      )}
    >
      <span ref={marcaRef} aria-hidden="true" className="aba-marca" />
      {options.map((opt) => {
        const active = opt.value === value;
        return (
          <button
            key={opt.value}
            type="button"
            role="tab"
            aria-selected={active}
            onClick={() => onChange(opt.value)}
            className={cn(
              "relative inline-flex items-center gap-1.5 rounded-sm px-3 py-1 text-xs font-semibold transition-colors duration-200",
              size === "touch" && "min-h-11 md:min-h-0",
              active
                ? "bg-bg-elevada text-fg-1 shadow-[var(--sombra-sm)]"
                : "text-fg-3 hover:text-fg-1",
            )}
          >
            {opt.label}
            {typeof opt.count === "number" && (
              <span
                className={cn(
                  "tabular-nums",
                  active ? "text-acento-texto" : "text-fg-4",
                )}
              >
                {opt.count}
              </span>
            )}
          </button>
        );
      })}
    </div>
  );
}
