"use client";

import Link from "next/link";
import { useSearchParams } from "next/navigation";
import type { MouseEvent, ReactNode } from "react";
import { cn } from "@/lib/utils";
import { ABAS, abaDaUrl, cliqueSimples, enderecoDaTroca, ROTULO_ABA, type Aba } from "@/lib/marca";

/**
 * As três abas da tela Marca (identidade e voz, persona e dossiê) e o documento aberto de cada uma.
 *
 * O servidor entrega o painel das TRÊS abas de uma vez; aqui só se escolhe qual aparece, pelo `?aba=` da
 * URL. Trocar de aba não espera o servidor: a tela muda no mesmo instante e o endereço é atualizado pelo
 * histórico do navegador, que o Next acompanha em `useSearchParams`. Antes cada clique pedia a página
 * inteira ao servidor e, até a resposta chegar, ficavam a aba e o documento antigos na tela, sem aviso
 * nenhum: quem olhava logo depois do clique via Persona e Dossiê mostrando o documento da Identidade.
 *
 * As abas são links de verdade: sem JavaScript, ou antes de a página terminar de carregar, o clique abre
 * o endereço e o servidor desenha a aba certa. Com Ctrl, Cmd, Shift ou botão do meio, abre em outra guia.
 */
export function AbasMarca({
  contagem,
  hrefs,
  paineis,
}: {
  /** Quantos documentos cada aba tem. */
  contagem: Record<Aba, number>;
  /** Endereço de cada aba (hrefsDasAbas). */
  hrefs: Record<Aba, string>;
  /** O conteúdo pronto de cada aba, já desenhado no servidor. */
  paineis: Record<Aba, ReactNode>;
}) {
  const ativa = abaDaUrl(useSearchParams().get("aba"));

  function trocar(e: MouseEvent<HTMLAnchorElement>, aba: Aba) {
    if (!cliqueSimples(e)) return;
    e.preventDefault();
    // A URL é lida AGORA, não a aba desenhada por último: cliques seguidos valem todos.
    const destino = enderecoDaTroca(aba, hrefs[aba], window.location.search);
    if (destino) window.history.pushState(null, "", destino);
  }

  return (
    <div className="flex flex-col gap-6">
      <div
        role="tablist"
        aria-label="Documentos da marca"
        className="inline-flex max-w-full items-center gap-1 overflow-x-auto overscroll-x-contain rounded-md bg-bg-sutil p-1 [scrollbar-width:none]"
      >
        {ABAS.map((aba) => {
          const on = aba === ativa;
          return (
            <Link
              key={aba}
              id={`aba-${aba}`}
              role="tab"
              aria-selected={on}
              aria-controls={`painel-${aba}`}
              href={hrefs[aba]}
              prefetch={false}
              onClick={(e) => trocar(e, aba)}
              className={cn(
                "inline-flex min-h-11 items-center gap-1.5 rounded-sm px-3 py-1 text-xs font-semibold transition-colors md:min-h-0",
                on ? "bg-bg-elevada text-fg-1 shadow-[var(--sombra-sm)]" : "text-fg-3 hover:text-fg-1",
              )}
            >
              {ROTULO_ABA[aba]}
              <span className={cn("tabular-nums", on ? "text-acento-texto" : "text-fg-4")}>{contagem[aba]}</span>
            </Link>
          );
        })}
      </div>
      {ABAS.map((aba) => (
        <div key={aba} id={`painel-${aba}`} role="tabpanel" aria-labelledby={`aba-${aba}`} hidden={aba !== ativa}>
          {paineis[aba]}
        </div>
      ))}
    </div>
  );
}
