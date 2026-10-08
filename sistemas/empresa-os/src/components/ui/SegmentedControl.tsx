"use client";

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
  return (
    <div
      role="tablist"
      className={cn(
        "inline-flex max-w-full items-center gap-1 overflow-x-auto overscroll-x-contain rounded-md bg-bg-sutil p-1 [scrollbar-width:none]",
        className,
      )}
    >
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
              "inline-flex items-center gap-1.5 rounded-sm px-3 py-1 text-xs font-semibold transition-colors",
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
