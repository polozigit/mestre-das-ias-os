import { codeToHtml, createCssVariablesTheme } from "shiki";
import { linguagemShiki } from "@/lib/catalogo/catalogo";

// Tema por variaveis CSS: as cores vem dos tokens do theme.css (DESIGN.md), claro e escuro de graca.
const tema = createCssVariablesTheme({ name: "empresa-os", variablePrefix: "--shiki-", fontStyle: true });

const VARIAVEIS: Record<string, string> = {
  "--shiki-foreground": "var(--fg-1)",
  "--shiki-background": "transparent",
  "--shiki-token-comment": "var(--fg-3)",
  "--shiki-token-keyword": "var(--acento-texto)",
  "--shiki-token-string": "color-mix(in srgb, var(--ok) 70%, var(--fg-1))",
  "--shiki-token-string-expression": "color-mix(in srgb, var(--ok) 70%, var(--fg-1))",
  "--shiki-token-constant": "color-mix(in srgb, var(--info) 70%, var(--fg-1))",
  "--shiki-token-function": "color-mix(in srgb, var(--info) 70%, var(--fg-1))",
  "--shiki-token-parameter": "var(--fg-2)",
  "--shiki-token-punctuation": "var(--fg-3)",
  "--shiki-token-link": "var(--acento-texto)",
};

/** Codigo com destaque, renderizado no servidor. O HTML vem do shiki, que escapa o conteudo. */
export async function CodigoDestacado({
  codigo,
  linguagem,
  nomeArquivo,
}: {
  codigo: string;
  linguagem: string;
  nomeArquivo?: string;
}) {
  let html: string;
  try {
    html = await codeToHtml(codigo, { lang: linguagemShiki(linguagem), theme: tema });
  } catch {
    // Linguagem que o shiki nao conhece: texto puro, sem cor (nunca quebra a pagina).
    html = await codeToHtml(codigo, { lang: "text", theme: tema });
  }
  return (
    <figure className="min-w-0 max-w-full overflow-hidden rounded-md border border-borda bg-bg-sutil">
      {nomeArquivo && (
        <figcaption className="break-all border-b border-borda px-3 py-2 font-mono text-xs text-fg-3">
          {nomeArquivo}
        </figcaption>
      )}
      <div
        className="max-w-full overflow-x-auto p-3 font-mono text-xs leading-relaxed [&_pre]:!bg-transparent"
        style={VARIAVEIS as React.CSSProperties}
        dangerouslySetInnerHTML={{ __html: html }}
      />
    </figure>
  );
}
