import Link from "next/link";
import { cn } from "@/lib/utils";

export type VisaoTarefas = "quadro" | "lista";

/**
 * Alternador quadro/lista com o visual do SegmentedControl do kit, mas feito de
 * LINKS de propósito: a visão vive na URL (?visao=), não em estado client —
 * assim é compartilhável, sobrevive a refresh e o server component re-renderiza
 * a visão certa sem JS. (O SegmentedControl do kit é onChange/client, por isso
 * não serve aqui.)
 */
export function VisaoToggle({
  visao,
  hrefQuadro,
  hrefLista,
}: {
  visao: VisaoTarefas;
  hrefQuadro: string;
  hrefLista: string;
}) {
  const opcoes: { valor: VisaoTarefas; rotulo: string; href: string }[] = [
    { valor: "quadro", rotulo: "Quadro", href: hrefQuadro },
    { valor: "lista", rotulo: "Lista", href: hrefLista },
  ];
  return (
    <nav
      aria-label="Visão das tarefas"
      className="inline-flex items-center gap-1 rounded-md bg-bg-sutil p-1"
    >
      {opcoes.map((opcao) => {
        const ativa = opcao.valor === visao;
        return (
          <Link
            key={opcao.valor}
            href={opcao.href}
            aria-current={ativa ? "page" : undefined}
            className={cn(
              "inline-flex min-h-11 items-center rounded-sm px-3 py-1 text-xs font-semibold transition-colors md:min-h-0",
              ativa
                ? "bg-bg-elevada text-fg-1 shadow-[var(--sombra-sm)]"
                : "text-fg-3 hover:text-fg-1",
            )}
          >
            {opcao.rotulo}
          </Link>
        );
      })}
    </nav>
  );
}
