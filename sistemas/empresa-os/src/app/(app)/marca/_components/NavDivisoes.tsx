"use client";

import { useEffect, useRef, useState } from "react";
import { cn } from "@/lib/utils";

/**
 * Navegação fixa das divisões da identidade. Marca a divisão que está na tela (aria-current) e, no celular,
 * rola a própria barra até ela: quem desce a página sabe onde está. Sem JavaScript, os links de âncora
 * continuam funcionando (só não há destaque).
 */
export function NavDivisoes({ divisoes }: { divisoes: { id: string; rotulo: string }[] }) {
  const [ativa, setAtiva] = useState<string | null>(divisoes[0]?.id ?? null);
  const lista = useRef<HTMLUListElement>(null);

  useEffect(() => {
    const alvos = divisoes
      .map((d) => document.getElementById(`marca-${d.id}`))
      .filter((el): el is HTMLElement => el !== null);
    if (alvos.length === 0 || typeof IntersectionObserver === "undefined") return;
    const visiveis = new Map<string, number>();
    const obs = new IntersectionObserver(
      (entradas) => {
        for (const e of entradas) {
          const id = e.target.id.replace(/^marca-/, "");
          if (e.isIntersecting) visiveis.set(id, e.boundingClientRect.top);
          else visiveis.delete(id);
        }
        // A primeira divisão (na ordem da página) que ainda aparece na faixa de cima é a atual.
        const atual = divisoes.find((d) => visiveis.has(d.id));
        if (atual) setAtiva(atual.id);
      },
      { rootMargin: "-130px 0px -55% 0px" },
    );
    for (const el of alvos) obs.observe(el);
    return () => obs.disconnect();
  }, [divisoes]);

  useEffect(() => {
    const item = lista.current?.querySelector<HTMLElement>(`[data-divisao="${ativa}"]`);
    item?.scrollIntoView({ block: "nearest", inline: "nearest" });
  }, [ativa]);

  return (
    <ul ref={lista} className="flex gap-1 overflow-x-auto overscroll-x-contain py-1 [scrollbar-width:none]">
      {divisoes.map((d) => {
        const on = d.id === ativa;
        return (
          <li key={d.id} className="shrink-0">
            <a
              href={`#marca-${d.id}`}
              data-divisao={d.id}
              aria-current={on ? "location" : undefined}
              onClick={() => setAtiva(d.id)}
              className={cn(
                "inline-flex min-h-11 items-center rounded-md px-3 text-sm font-semibold transition-colors",
                on ? "bg-bg-sutil text-fg-1" : "text-fg-3 hover:bg-bg-sutil hover:text-fg-1",
              )}
            >
              {d.rotulo}
            </a>
          </li>
        );
      })}
    </ul>
  );
}
