"use client";

import { Fragment, isValidElement, cloneElement, type ReactNode } from "react";
import ReactMarkdown from "react-markdown";
import remarkGfm from "remark-gfm";
import { cn } from "@/lib/utils";
import { rotuloApqc } from "@/lib/organograma/arvore";
import { devePularRealce } from "@/lib/organograma/markdown";

/**
 * Markdown do pacote/playbook. react-markdown + remark-gfm fazem TODO o
 * parsing (negrito, itálico, link, código, tabela) — nunca dangerouslySetInnerHTML,
 * nunca rehype-raw. Por cima disso só pós-processamos os nós de texto folha
 * pra: (1) trocar menção a "APQC <codigo>" pelo nome + código, (2) colorir as
 * marcas de proveniência (VERIFIED, SNIPPET, premissa, NÃO ACHADO, [a modelar])
 * como chips. Tabela ganha scroll horizontal próprio (nunca a página).
 */

const RE_MARCA = /(\[a modelar\]|\bVERIFIED\b|\bSNIPPET\b|NÃO ACHADO|\bpremissa\b)/g;

const MARCA_CLASSE: Record<string, string> = {
  VERIFIED: "bg-ok-suave text-ok",
  SNIPPET: "bg-alerta-suave text-alerta",
  premissa: "bg-info-suave text-info",
  "NÃO ACHADO": "bg-erro-suave text-erro",
  "[a modelar]": "border border-dashed border-alerta text-alerta",
};

function chipsDeTexto(texto: string, apqc: Map<string, string> | undefined, keyBase: string): ReactNode[] {
  const rotulado = apqc && apqc.size > 0 ? rotuloApqc(texto, apqc) : texto;
  const partes = rotulado.split(RE_MARCA);
  return partes
    .filter((p) => p !== "")
    .map((parte, i) => {
      const classe = MARCA_CLASSE[parte];
      if (!classe) return <Fragment key={`${keyBase}-${i}`}>{parte}</Fragment>;
      return (
        <span
          key={`${keyBase}-${i}`}
          data-marca=""
          className={cn("mx-0.5 whitespace-nowrap rounded-full px-2 py-0.5 text-[11px] font-semibold", classe)}
        >
          {parte}
        </span>
      );
    });
}

/** Aplica chipsDeTexto recursivamente em toda folha de texto de uma árvore de
 * children já renderizada pelo react-markdown — exceto dentro de `<code>`,
 * onde o texto é literal (não deve virar chip nem trocar código APQC). */
function realce(children: ReactNode, apqc: Map<string, string> | undefined, key = "n"): ReactNode {
  if (Array.isArray(children)) {
    return children.map((c, i) => (
      <Fragment key={`${key}-${i}`}>{realce(c, apqc, `${key}-${i}`)}</Fragment>
    ));
  }
  if (typeof children === "string") return chipsDeTexto(children, apqc, key);
  if (isValidElement(children)) {
    if (children.type === "code") return children; // literal — não mexe
    if (devePularRealce(children.type, children.props as Record<string, unknown> | null | undefined)) {
      return children; // Renderer de componente ou chip já processado — evita chip dentro de chip
    }
    const props = children.props as { children?: ReactNode };
    return cloneElement(children, undefined, realce(props.children, apqc, key));
  }
  return children;
}

export function Markdown({ source, apqc }: { source: string; apqc?: Map<string, string> }) {
  const R = (tag: string, className?: string) =>
    // react-markdown tipa `components[x]` pelos atributos HTML nativos do
    // elemento (+ `node` da árvore mdast) — props soltas aqui só repassam
    // pro elemento real, então tipar por `any` é seguro (widening deliberado,
    // não perda de tipo em código próprio).
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    function Renderer({ children, ...rest }: any) {
      const Tag = tag as keyof React.JSX.IntrinsicElements;
      return (
        <Tag {...rest} className={cn(className, rest.className)}>
          {realce(children as ReactNode, apqc)}
        </Tag>
      );
    };

  return (
    <div className="flex flex-col gap-2 text-sm text-fg-2 [&_h4]:mt-1 [&_h4]:text-sm [&_h4]:font-semibold [&_h4]:text-fg-1 [&_li]:max-w-[80ch] [&_li:has(table)]:max-w-none [&_ol]:list-decimal [&_ol]:pl-5 [&_p]:max-w-[80ch] [&_p]:leading-relaxed [&_ul]:list-disc [&_ul]:pl-5">
      <ReactMarkdown
        remarkPlugins={[remarkGfm]}
        components={{
          p: R("p"),
          li: R("li"),
          h1: R("h4"),
          h2: R("h4"),
          h3: R("h4"),
          h4: R("h4"),
          strong: R("strong"),
          em: R("em"),
          th: R("th", "px-2.5 py-2 text-left align-bottom font-semibold text-fg-1 whitespace-nowrap"),
          td: R("td", "px-2.5 py-1.5 align-top text-fg-2"),
          a: ({ children, href }) => (
            <a
              href={href}
              target="_blank"
              rel="noopener noreferrer"
              className="text-acento-texto underline underline-offset-2"
            >
              {children}
            </a>
          ),
          table: ({ children }) => (
            <div className="overflow-x-auto rounded-md border border-borda-suave">
              <table className="w-full min-w-[420px] border-collapse text-[13px] [&_td:first-child]:tabular-nums [&_td:first-child]:text-fg-3">
                {children}
              </table>
            </div>
          ),
          thead: ({ children }) => <thead className="bg-bg-sutil">{children}</thead>,
          tbody: ({ children }) => <tbody className="[&>tr:nth-child(even)]:bg-bg-sutil">{children}</tbody>,
          tr: ({ children }) => <tr className="border-t border-borda-suave">{children}</tr>,
          code: ({ children }) => (
            <code className="rounded bg-bg-sutil px-1 py-0.5 font-mono text-[0.85em]">
              {children}
            </code>
          ),
        }}
      >
        {source}
      </ReactMarkdown>
    </div>
  );
}
