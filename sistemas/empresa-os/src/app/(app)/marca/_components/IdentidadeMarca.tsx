import type { ReactNode } from "react";
import Link from "next/link";
import { Markdown } from "@/components/ui/Markdown";
import { TempoRelativo } from "@/components/ui/TempoRelativo";
import { hrefMarca } from "@/lib/marca";
import { NavDivisoes } from "./NavDivisoes";
import {
  divisoesComConteudo,
  linkDoMaterial,
  ROTULO_DIVISAO,
  secaoDaDivisao,
  secaoFontesDeVoz,
  secoesDeVoz,
  urlGoogleFonts,
  type IdDivisao,
  type MarcaCompleta,
  type MaterialMarca,
  type Secao,
} from "@/lib/marca-dados";
import {
  AmostrasTipografia,
  GradeCores,
  GradeLogos,
  PalavrasDeTom,
  ParesDeContraste,
  Personalidade,
  TrilhosDeVoz,
  type LogoParaTela,
} from "./BlocosVisuais";

const ROTULO_MATERIAL: Record<MaterialMarca["tipo"], string> = {
  site: "Site",
  instagram: "Instagram",
  apresentacao: "Apresentação",
  logo: "Logo",
  pesquisa: "Pesquisa",
};

const dataBr = (iso: string) => iso.split("-").reverse().join("/");

/** Texto da seção num cartão, com o Markdown da casa. */
function CartaoTexto({ secao, titulo }: { secao: Secao; titulo?: string }) {
  return (
    <article className="flex flex-col gap-2 rounded-lg border border-borda-suave bg-bg-elevada p-5">
      <h4 className="text-sm font-semibold text-fg-1">{titulo ?? secao.titulo}</h4>
      <Markdown source={secao.corpo} />
    </article>
  );
}

/** Texto de apoio de uma divisão que já tem a parte visual: recolhido, pra não repetir a tabela de cima. */
function TextoRecolhido({ secao }: { secao: Secao }) {
  return (
    <details className="group rounded-lg border border-borda-suave bg-bg-elevada">
      <summary className="flex min-h-11 cursor-pointer list-none items-center justify-between gap-2 px-5 py-2 text-sm font-semibold text-fg-1 [&::-webkit-details-marker]:hidden">
        Texto completo da seção
        <span aria-hidden className="text-fg-3 transition-transform group-open:rotate-90">
          ›
        </span>
      </summary>
      <div className="border-t border-borda-suave p-5">
        <Markdown source={secao.corpo} />
      </div>
    </details>
  );
}

function Divisao({ id, children }: { id: IdDivisao; children: ReactNode }) {
  return (
    <section id={`marca-${id}`} aria-labelledby={`marca-${id}-titulo`} className="flex scroll-mt-[calc(var(--topbar-h)+4.5rem)] flex-col gap-4">
      <h3 id={`marca-${id}-titulo`} className="h3">
        {ROTULO_DIVISAO[id]}
      </h3>
      {children}
    </section>
  );
}

/**
 * A identidade da marca, por divisão, a partir dos blocos `marca-dados` dos documentos publicados
 * (identidade-visual, tom-de-voz e logo). Só aparecem as divisões que têm conteúdo. Servidor: recebe os
 * endereços assinados dos logos já prontos (`logos`); os textos longos seguem no Markdown da casa.
 */
export function IdentidadeMarca({ marca, logos }: { marca: MarcaCompleta; logos: LogoParaTela[] }) {
  const divisoes = divisoesComConteudo(marca, logos.length > 0);
  const dI = marca.identidade?.dados;
  const dV = marca.voz?.dados;
  const urlFontes = dI ? urlGoogleFonts(dI.tipografia) : null;
  const titulo = marca.identidade?.doc.titulo ?? marca.voz?.doc.titulo ?? "Identidade da marca";
  const publicado = (marca.identidade?.doc ?? marca.voz?.doc ?? marca.logo?.doc)?.publicado_em;

  const sec = (id: IdDivisao) => secaoDaDivisao(marca, id);

  return (
    <div className="flex flex-col gap-8">
      {urlFontes && <link rel="stylesheet" href={urlFontes} precedence="default" />}

      <header className="flex flex-col gap-2">
        <h2 className="font-display text-2xl font-bold text-fg-1">{titulo}</h2>
        {publicado && (
          <p className="text-xs text-fg-3">
            Publicado <TempoRelativo iso={publicado} />
          </p>
        )}
        <p className="max-w-2xl text-xs text-fg-3">
          O selo em cada item diz de onde ele veio: do dossiê, da persona, de um material seu (site, Instagram, apresentação,
          logo) ou de pesquisa. “Proposta do time” e “Hipótese” ainda não vêm de um material seu.
        </p>
      </header>

      <nav
        aria-label="Divisões da identidade"
        className="sticky top-[var(--topbar-h)] z-20 -mx-4 border-b border-borda-suave bg-bg px-4 lg:-mx-8 lg:px-8"
      >
        <NavDivisoes divisoes={divisoes.map((d) => ({ id: d, rotulo: ROTULO_DIVISAO[d] }))} />
      </nav>

      {divisoes.includes("essencia") && (
        <Divisao id="essencia">
          <CartaoTexto secao={sec("essencia")!} titulo="Plataforma da marca" />
        </Divisao>
      )}

      {divisoes.includes("personalidade") && (
        <Divisao id="personalidade">
          {dI?.personalidade && <Personalidade dados={dI.personalidade} />}
          {sec("personalidade") && <CartaoTexto secao={sec("personalidade")!} titulo="Por que essa personalidade" />}
        </Divisao>
      )}

      {divisoes.includes("logo") && (
        <Divisao id="logo">
          {logos.length > 0 && <GradeLogos logos={logos} />}
          {sec("logo") && <CartaoTexto secao={sec("logo")!} titulo="Como usar o logo" />}
        </Divisao>
      )}

      {divisoes.includes("cores") && (
        <Divisao id="cores">
          {dI && dI.cores.length > 0 && <GradeCores cores={dI.cores} />}
          {dI && dI.pares.length > 0 && <ParesDeContraste pares={dI.pares} cores={dI.cores} />}
          {sec("cores") && (dI && dI.cores.length > 0 ? <TextoRecolhido secao={sec("cores")!} /> : <CartaoTexto secao={sec("cores")!} />)}
        </Divisao>
      )}

      {divisoes.includes("tipografia") && (
        <Divisao id="tipografia">
          {dI && dI.tipografia.length > 0 && <AmostrasTipografia fontes={dI.tipografia} />}
          {sec("tipografia") && (dI && dI.tipografia.length > 0 ? <TextoRecolhido secao={sec("tipografia")!} /> : <CartaoTexto secao={sec("tipografia")!} />)}
        </Divisao>
      )}

      {divisoes.includes("imagem") && (
        <Divisao id="imagem">
          <CartaoTexto secao={sec("imagem")!} titulo="Estilo de imagem e elementos" />
        </Divisao>
      )}

      {divisoes.includes("aplicacoes") && (
        <Divisao id="aplicacoes">
          <CartaoTexto secao={sec("aplicacoes")!} titulo="Onde a identidade aparece" />
        </Divisao>
      )}

      {divisoes.includes("voz") && (
        <Divisao id="voz">
          {dV && dV.escalas.length > 0 && <TrilhosDeVoz escalas={dV.escalas} />}
          {dV && (dV.palavras.length > 0 || dV.anti.length > 0) && <PalavrasDeTom palavras={dV.palavras} anti={dV.anti} />}
          <div className="flex flex-col gap-4">
            {secoesDeVoz(marca).map((s) => (
              <CartaoTexto key={s.chave} secao={s} />
            ))}
          </div>
        </Divisao>
      )}

      {divisoes.includes("regras") && (
        <Divisao id="regras">
          <CartaoTexto secao={sec("regras")!} titulo="Regras de ouro" />
        </Divisao>
      )}

      {divisoes.includes("fontes") && (
        <Divisao id="fontes">
          {dI && dI.materiais.length > 0 ? (
            <ul className="flex flex-col divide-y divide-borda-suave rounded-lg border border-borda-suave bg-bg-elevada">
              {dI.materiais.map((m) => (
                <li key={m.n} className="flex flex-col gap-0.5 px-5 py-3 text-sm sm:flex-row sm:items-baseline sm:gap-3">
                  <span className="tabular-nums text-fg-3">[{m.n}]</span>
                  <span className="font-semibold text-fg-1">{ROTULO_MATERIAL[m.tipo]}</span>
                  {linkDoMaterial(m.alvo) ? (
                    <a href={linkDoMaterial(m.alvo)!} target="_blank" rel="noopener noreferrer" className="inline-flex min-h-11 items-center break-all text-acento-texto underline underline-offset-2 sm:min-h-0">
                      {m.alvo}
                    </a>
                  ) : (
                    <span className="break-all text-fg-2">{m.alvo}</span>
                  )}
                  <span className="text-xs text-fg-3 sm:ml-auto">visto em {dataBr(m.visto_em)}</span>
                </li>
              ))}
            </ul>
          ) : (
            sec("fontes") && <CartaoTexto secao={sec("fontes")!} />
          )}
          {secaoFontesDeVoz(marca) && <CartaoTexto secao={secaoFontesDeVoz(marca)!} titulo="Fontes da voz" />}
        </Divisao>
      )}

      <footer className="flex flex-col gap-3 border-t border-borda-suave pt-6">
        <h3 className="text-sm font-semibold text-fg-1">Documentos publicados</h3>
        <ul className="flex flex-col gap-1">
          {marca.documentos.map((d) => (
            <li key={d.id} className="flex flex-col gap-0.5 sm:flex-row sm:items-center sm:gap-3">
              <Link
                href={hrefMarca("marca", d.id)}
                prefetch={false}
                className="inline-flex min-h-11 items-center text-sm font-semibold text-acento-texto underline underline-offset-2"
              >
                {d.titulo}
              </Link>
              <span className="text-xs text-fg-3">
                publicado <TempoRelativo iso={d.publicado_em} />
              </span>
              {d.caminho_origem && <span className="break-all font-mono text-[11px] text-fg-4">{d.caminho_origem}</span>}
            </li>
          ))}
        </ul>
        <p className="text-xs text-fg-3">Abra um documento para ler o texto integral, com tudo o que a IA registrou.</p>
      </footer>
    </div>
  );
}
