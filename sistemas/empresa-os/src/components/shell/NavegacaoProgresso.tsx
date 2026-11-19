"use client";

import { useEffect, useRef } from "react";
import { usePathname, useSearchParams } from "next/navigation";
import { iniciaNavegacaoInterna } from "@/lib/navegacao";

/**
 * Fio de luz no topo enquanto a página nova carrega. O servidor monta cada tela na hora, então entre
 * o clique e a tela existe uma espera real: o fio mostra que o clique valeu. Liga no clique em link
 * interno e chega quando o endereço muda. Navegação instantânea nem chega a mostrar o fio (o CSS só
 * o acende depois de 140 ms). O estado vai direto no atributo `data-estado`, sem re-render.
 */
export function NavegacaoProgresso() {
  const fio = useRef<HTMLDivElement>(null);
  const pathname = usePathname();
  const busca = useSearchParams().toString();

  useEffect(() => {
    let seguranca = 0;
    function aoClicar(e: MouseEvent) {
      const el = fio.current;
      const link = e.target instanceof Element ? e.target.closest("a") : null;
      if (!el || !link) return;
      const vai = iniciaNavegacaoInterna({
        href: link.href,
        atual: window.location.href,
        target: link.target,
        download: link.hasAttribute("download"),
        botao: e.button,
        comTecla: e.metaKey || e.ctrlKey || e.shiftKey || e.altKey,
        jaTratado: e.defaultPrevented,
      });
      if (!vai) return;
      el.dataset.estado = "parado";
      // Lê o layout para o navegador registrar o "parado" antes do "indo" (a transição parte do zero).
      void el.offsetWidth;
      el.dataset.estado = "indo";
      // Navegação que não acontece (erro de rede, clique cancelado depois): o fio não fica preso.
      window.clearTimeout(seguranca);
      seguranca = window.setTimeout(() => {
        if (el.dataset.estado === "indo") el.dataset.estado = "chegou";
      }, 12_000);
    }
    // Na fase de captura: o <Link> do Next cancela o clique para navegar sem recarregar, então na
    // fase normal todo link interno já chegaria aqui como "tratado" e o fio nunca ligaria.
    document.addEventListener("click", aoClicar, true);
    return () => {
      document.removeEventListener("click", aoClicar, true);
      window.clearTimeout(seguranca);
    };
  }, []);

  // Endereço mudou: a página nova chegou.
  useEffect(() => {
    const el = fio.current;
    if (!el || el.dataset.estado !== "indo") return;
    el.dataset.estado = "chegou";
  }, [pathname, busca]);

  return <div ref={fio} aria-hidden="true" data-estado="parado" className="fio-nav" />;
}
