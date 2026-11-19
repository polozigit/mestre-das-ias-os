import type { ReactNode } from "react";
import { BookOpen, ChevronRight } from "lucide-react";
import { cn } from "@/lib/utils";
import {
  PARA_ENTENDER,
  ROTULOS_ORIGEM,
  numeroDaRef,
  rotuloDasRefs,
  type Evidencia,
  type Fonte,
  type IdCapitulo,
  type Origem,
  type TipoOrigem,
} from "@/lib/persona-estudo";

/*
 * Peças do estudo do cliente ideal. Tudo roda no servidor e todo texto do documento entra como texto do React.
 * Só classes semânticas do tema: o claro e o escuro vêm do theme.css.
 */

/** Rótulo pequeno em caixa alta (Por que importa, O que fazer...). */
export const ROTULO = "text-xs font-semibold uppercase tracking-wider text-fg-3";
/** Título de sub-bloco dentro de um capítulo. */
export const SUBTITULO = "font-display text-[clamp(1.375rem,3cqi,1.875rem)] font-normal leading-tight tracking-[-0.015em] text-balance text-fg-1";
/** Frase de destaque (leitura do especialista, momento, retrato). */
export const DESTAQUE = "font-display text-[clamp(1.25rem,3cqi,1.75rem)] leading-snug tracking-[-0.012em] text-fg-1";
/** Atributos de todo link de fonte externa. */
export const LINK_EXTERNO = { target: "_blank", rel: "noopener noreferrer nofollow" } as const;
export const CLASSE_LINK = "min-w-0 break-words underline decoration-fg-4 underline-offset-[3px] hover:decoration-fg-1";

const ESTILO_SELO: Record<TipoOrigem, { chip: string; ponto: string }> = {
  disse: { chip: "border border-borda text-fg-2", ponto: "bg-fg-3" },
  pesquisa: { chip: "bg-info-suave text-fg-1", ponto: "bg-info" },
  leitura: { chip: "bg-acento text-fg-sobre-acento", ponto: "bg-fg-sobre-acento" },
  hipotese: { chip: "bg-alerta-suave text-fg-1", ponto: "bg-alerta" },
};

/** Sobre fundo de acento, os selos que dependem do acento se invertem. */
const ESTILO_SELO_SOBRE_ACENTO: Partial<Record<TipoOrigem, { chip: string; ponto: string }>> = {
  disse: { chip: "border border-fg-sobre-acento/40 text-fg-sobre-acento", ponto: "bg-fg-sobre-acento" },
  leitura: { chip: "bg-fg-sobre-acento text-acento", ponto: "bg-acento" },
};

/** O selo de uma origem. `semPrefixo` tira o "Origem:" do leitor de tela (na legenda e em "De onde tirei"). */
export function Selo({ tipo, sobreAcento = false, semPrefixo = false, children }: { tipo: TipoOrigem; sobreAcento?: boolean; semPrefixo?: boolean; children?: ReactNode }) {
  const e = (sobreAcento && ESTILO_SELO_SOBRE_ACENTO[tipo]) || ESTILO_SELO[tipo];
  return (
    <span className={cn("inline-flex max-w-full items-center gap-1.5 rounded-pill px-2 py-1 text-[11.5px] font-medium leading-tight", e.chip)}>
      <span aria-hidden className={cn("size-1.5 shrink-0 rounded-full", e.ponto)} />
      <span className="min-w-0">
        {!semPrefixo && <span className="sr-only">Origem: </span>}
        {children ?? ROTULOS_ORIGEM[tipo]}
      </span>
    </span>
  );
}

/** O selo e, na hipótese, a razão ao lado. */
export function Marca({ origem, sobreAcento = false, className }: { origem: Origem; sobreAcento?: boolean; className?: string }) {
  return (
    <div className={cn("mt-2 flex flex-wrap items-center gap-x-2 gap-y-1", className)}>
      <Selo tipo={origem.tipo} sobreAcento={sobreAcento} />
      {origem.tipo === "hipotese" && (
        <span className={cn("basis-full text-[13px] leading-snug", sobreAcento ? "text-fg-sobre-acento/80" : "text-fg-3")}>Razão: {origem.razao}</span>
      )}
    </div>
  );
}

/** "De onde tirei": a evidência sempre recolhida. Código do dossiê, conversa do dia ou link da página. */
export function DeOndeTirei({
  evidencias,
  fontes,
  sobreAcento = false,
  fundo = "sutil",
}: {
  evidencias: Evidencia[];
  fontes: Map<number, Fonte>;
  sobreAcento?: boolean;
  /** Dentro de um bloco já colorido, a lista vai no fundo da página. */
  fundo?: "sutil" | "pagina";
}) {
  if (evidencias.length === 0) return null;
  return (
    <details className="group/ev mt-3 text-sm">
      <summary
        className={cn(
          "inline-flex min-h-11 cursor-pointer list-none items-center gap-1.5 text-[13px] font-medium [&::-webkit-details-marker]:hidden",
          sobreAcento ? "text-fg-sobre-acento/75 hover:text-fg-sobre-acento" : "text-fg-3 hover:text-fg-1",
        )}
      >
        <ChevronRight aria-hidden className="size-3.5 transition-transform group-open/ev:rotate-90 motion-reduce:transition-none" />
        De onde tirei
      </summary>
      <ul
        className={cn(
          "grid gap-2.5 rounded-md p-4",
          sobreAcento ? "bg-fg-sobre-acento/10 text-fg-sobre-acento" : fundo === "pagina" ? "bg-bg text-fg-2" : "bg-bg-sutil text-fg-2",
        )}
      >
        {evidencias.map((ev, i) => (
          <li key={i} className="grid min-w-0 grid-cols-[auto_minmax(0,1fr)] items-baseline gap-2.5 leading-normal">
            <Selo tipo={ev.tipo} sobreAcento={sobreAcento} semPrefixo>
              {ev.tipo === "disse" ? rotuloDasRefs(ev.refs) : "pesquisa"}
            </Selo>
            <span className="min-w-0 break-words">
              {ev.texto}
              {ev.tipo === "pesquisa" && <LinksDasFontes refs={ev.refs} fontes={fontes} />}
            </span>
          </li>
        ))}
      </ul>
    </details>
  );
}

/** Os links das fontes de uma evidência de pesquisa (uma linha por URL, com o título da fonte). */
function LinksDasFontes({ refs, fontes }: { refs: string[]; fontes: Map<number, Fonte> }) {
  const vistos = new Set<string>();
  const lista: Fonte[] = [];
  for (const r of refs) {
    const n = numeroDaRef(r);
    const f = n === null ? undefined : fontes.get(n);
    if (f && !vistos.has(f.url)) {
      vistos.add(f.url);
      lista.push(f);
    }
  }
  if (lista.length === 0) return null;
  return (
    <span className="mt-1 block text-[13px]">
      {lista.map((f, i) => (
        <span key={f.url}>
          {i > 0 && (i === lista.length - 1 ? " e " : ", ")}
          <a href={f.url} {...LINK_EXTERNO} className={CLASSE_LINK}>
            {f.titulo}
          </a>
        </span>
      ))}
    </span>
  );
}

/** A coluna fixa "Para entender" de cada capítulo. */
export function ParaEntender({ id }: { id: IdCapitulo }) {
  const { texto, tecnico } = PARA_ENTENDER[id];
  return (
    <aside className="text-[15px] leading-relaxed text-fg-2 @4xl:sticky @4xl:top-[calc(var(--topbar-h)+5rem)] @4xl:self-start">
      <p className="mb-2 flex items-center gap-2 text-xs font-semibold uppercase tracking-wider text-fg-1">
        <BookOpen aria-hidden className="size-4" />
        Para entender
      </p>
      <p className="max-w-[60ch]">{texto}</p>
      {tecnico && <p className="mt-2.5 max-w-[60ch] text-sm text-fg-3">{tecnico}</p>}
    </aside>
  );
}

/** Um capítulo: section com título e, ao lado, o "Para entender". */
export function Capitulo({ id, titulo, children, comConceito = true }: { id: IdCapitulo; titulo: string; children: ReactNode; comConceito?: boolean }) {
  return (
    <section
      id={`estudo-${id}`}
      aria-labelledby={`estudo-${id}-titulo`}
      className="scroll-mt-[calc(var(--topbar-h)+4rem)] border-b border-borda py-16 @4xl:py-24"
    >
      <h2
        id={`estudo-${id}-titulo`}
        className="max-w-[18ch] font-display text-[clamp(1.875rem,5cqi,3.25rem)] font-normal leading-[1.08] tracking-[-0.025em] text-balance text-fg-1"
      >
        {titulo}
      </h2>
      {comConceito ? (
        <div className="mt-7 grid gap-8 @4xl:mt-12 @4xl:grid-cols-[15rem_minmax(0,1fr)] @4xl:gap-14">
          <ParaEntender id={id} />
          <div className="@container min-w-0">{children}</div>
        </div>
      ) : (
        <div className="@container min-w-0">{children}</div>
      )}
    </section>
  );
}

/** Rótulo e texto em bloco (O que fazer, Como chegar, O que dizer...). */
export function Rotulado({ rotulo, children, className }: { rotulo: string; children: ReactNode; className?: string }) {
  return (
    <div className={cn("min-w-0", className)}>
      <span className={cn(ROTULO, "mb-1 block")}>{rotulo}</span>
      <p className="break-words">{children}</p>
    </div>
  );
}

/** Lista de afirmações com o selo de cada uma, separadas por linha. */
export function ListaDeFatos({ itens }: { itens: { texto: string; origem: Origem }[] }) {
  return (
    <ul className="mt-3 grid">
      {itens.map((a, i) => (
        <li key={i} className="border-t border-borda py-3.5 last:border-b">
          <p className="break-words text-fg-1">{a.texto}</p>
          <Marca origem={a.origem} />
        </li>
      ))}
    </ul>
  );
}
