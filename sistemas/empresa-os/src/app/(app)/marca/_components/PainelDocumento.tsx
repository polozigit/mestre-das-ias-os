import type { ReactNode } from "react";
import Link from "next/link";
import { Palette } from "lucide-react";
import { Empty } from "@/components/ui/Empty";
import { Markdown } from "@/components/ui/Markdown";
import { TempoRelativo } from "@/components/ui/TempoRelativo";
import { ABAS, ETAPA_QUE_PUBLICA, hrefMarca, ROTULO_ABA, type Aba } from "@/lib/marca";

/** O que a tela precisa de cada documento da lista (o texto vem à parte). */
export type DocumentoDaLista = {
  id: string;
  titulo: string;
  caminho_origem: string;
  publicado_em: string;
};

/**
 * O conteúdo de UMA aba da tela Marca: o documento aberto (título, quando foi publicado, de onde veio, a
 * imagem e o texto) ou, sem documento, o estado vazio que diz o que pedir à IA. Roda no servidor; a
 * AbasMarca recebe o painel das três abas prontos e mostra o da aba da URL.
 */
export function PainelDocumento({
  aba,
  docs,
  aberto,
  texto,
  imagemUrl,
  voltarHref = null,
}: {
  aba: Aba;
  /** Todos os documentos da aba, o mais recente primeiro. */
  docs: DocumentoDaLista[];
  aberto: DocumentoDaLista | null;
  texto: string | null;
  imagemUrl: string | null;
  /** Quando a aba tem a identidade em divisões, o caminho de volta pra ela (texto integral aberto por ?doc=). */
  voltarHref?: string | null;
}) {
  if (!aberto || texto === null) {
    return <Empty icon={Palette} title={`${ROTULO_ABA[aba]} ainda não foi publicado`} description={ETAPA_QUE_PUBLICA[aba]} />;
  }
  return (
    <article className="flex flex-col gap-4 rounded-lg border border-borda-suave bg-bg-elevada p-5">
      {voltarHref && (
        <Link href={voltarHref} prefetch={false} className="inline-flex min-h-11 items-center self-start text-sm font-semibold text-acento-texto underline underline-offset-2">
          Voltar à identidade em divisões
        </Link>
      )}
      <div className="flex flex-col gap-1">
        <h2 className="text-base font-semibold text-fg-1">{aberto.titulo}</h2>
        <p className="text-xs text-fg-3">
          Publicado <TempoRelativo iso={aberto.publicado_em} />
        </p>
        <p className="break-all font-mono text-[11px] text-fg-4">{aberto.caminho_origem}</p>
      </div>
      {docs.length > 1 && (
        <ul className="flex flex-wrap gap-2 text-xs">
          {docs.map((d) => (
            <li key={d.id}>
              <Link
                href={hrefMarca(aba, d.id)}
                className={
                  d.id === aberto.id
                    ? "rounded-sm bg-bg-sutil px-2 py-1 font-semibold text-fg-1"
                    : "rounded-sm px-2 py-1 text-fg-3 hover:text-fg-1"
                }
              >
                {d.titulo}
              </Link>
            </li>
          ))}
        </ul>
      )}
      {imagemUrl && (
        // eslint-disable-next-line @next/next/no-img-element
        <img src={imagemUrl} alt={aberto.titulo} className="max-h-96 w-auto max-w-full rounded-md border border-borda-suave object-contain" />
      )}
      <Markdown source={texto} />
    </article>
  );
}

/**
 * O painel das TRÊS abas, prontos. `textos` é o texto de cada documento aberto (pelo id) e `imagens` o
 * endereço assinado da imagem de cada aba, quando houver. Aba sem documento, ou com documento sem texto,
 * sai com o estado vazio dela.
 */
export function montarPaineis<T extends DocumentoDaLista>(
  grupos: Record<Aba, T[]>,
  abertos: Record<Aba, T | null>,
  textos: Map<string, string>,
  imagens: Map<Aba, string>,
  /** Painel pronto da aba Identidade e voz (IdentidadeMarca); sem ele, o documento aberto em texto. */
  painelMarca: ReactNode = null,
  /** Com `painelMarca` disponível mas o texto integral pedido por ?doc=, o caminho de volta. */
  voltarMarcaHref: string | null = null,
): Record<Aba, ReactNode> {
  const paineis = {} as Record<Aba, ReactNode>;
  for (const aba of ABAS) {
    if (aba === "marca" && painelMarca) {
      paineis[aba] = painelMarca;
      continue;
    }
    const aberto = abertos[aba];
    paineis[aba] = (
      <PainelDocumento
        aba={aba}
        docs={grupos[aba]}
        aberto={aberto}
        texto={aberto ? (textos.get(aberto.id) ?? null) : null}
        imagemUrl={imagens.get(aba) ?? null}
        voltarHref={aba === "marca" ? voltarMarcaHref : null}
      />
    );
  }
  return paineis;
}
