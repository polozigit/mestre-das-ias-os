import type { ReactNode } from "react";
import { Markdown } from "@/components/ui/Markdown";
import { TempoRelativo } from "@/components/ui/TempoRelativo";
import { DIVISOES_PERSONA, ROTULOS_CAMPOS, divisoesDaPersona, lerPersona, type IdDivisao, type PersonaCompleta } from "@/lib/persona-dados";
import { lerEstudo, textoSemDados } from "@/lib/persona-estudo";
import { EstudoPersona } from "./EstudoPersona";
import { NavDivisoes } from "./NavDivisoes";
import { ListaDeDocumentos, PainelDocumento, type DocumentoDaLista } from "./PainelDocumento";
import {
  CartaoCampo,
  CartaoDescoberta,
  CartaoLacuna,
  CartaoSegmento,
  Citacoes,
  ColunaForcas,
  Grade,
  ListaDuvidas,
  ListaFontes,
  Placar,
  Promessa,
  Selos,
  SemDado,
  TextoComSelos,
} from "./BlocosPersona";

/** Título de cada divisão na página (a navegação usa o rótulo curto de DIVISOES_PERSONA). */
const TITULO_DIVISAO: Record<IdDivisao, string> = {
  descobertas: "Descobertas",
  retrato: "Retrato",
  cliente: "Cliente ideal",
  forcas: "O que faz comprar e o que faz travar",
  escolha: "Como escolhe",
  palavras: "Nas palavras do cliente",
  consciencia: "O quanto o cliente já sabe",
  plano: "O que fazer com isso",
  "nao-cliente": "Quem não é o cliente ideal",
  falta: "O que ainda não sabemos",
  fontes: "Fontes",
};

const ROTULOS_OBJETIVO = ["O que quer resolver", "Como quer ser visto", "Como quer se sentir"] as const;

const comMaiuscula = (t: string) => t.charAt(0).toUpperCase() + t.slice(1);

/** "a vizinha do pão fresco, só para a equipe conversar sobre ela" vira "A vizinha do pão fresco". Vazio: null. */
function nomeLimpo(bruto: string | null | undefined): string | null {
  const nome = (bruto ?? "").replace(/[,;]?\s*s[oó] para a equipe conversar sobre el[ae]\.?\s*$/i, "").trim();
  return nome ? comMaiuscula(nome) : null;
}

/** Os campos do molde atual, fora o nome do arquétipo. */
const CAMPOS_DO_MOLDE = (Object.keys(ROTULOS_CAMPOS) as (keyof typeof ROTULOS_CAMPOS)[]).filter((k) => k !== "arquetipo");

function Divisao({ id, children }: { id: IdDivisao; children: ReactNode }) {
  return (
    <section id={`persona-${id}`} aria-labelledby={`persona-${id}-titulo`} className="flex scroll-mt-[calc(var(--topbar-h)+4.5rem)] flex-col gap-4">
      <h3 id={`persona-${id}-titulo`} className="h3">
        {TITULO_DIVISAO[id]}
      </h3>
      {children}
    </section>
  );
}

/**
 * A persona em blocos, lida do próprio markdown do documento (lib/persona-dados.ts). Uma página só, com
 * navegação por divisões; só aparecem as divisões que têm conteúdo. O texto integral fica recolhido no
 * fim, porque a leitura é tolerante e pode deixar de fora o que fugiu do molde.
 */
export function PersonaMarca({
  persona: p,
  aberto,
  docs,
  texto,
}: {
  persona: PersonaCompleta;
  aberto: DocumentoDaLista;
  docs: DocumentoDaLista[];
  texto: string;
}) {
  const divisoes = divisoesDaPersona(p);
  const c = p.persona?.campos;
  const tem = (id: IdDivisao) => divisoes.includes(id);
  // O nome do título da seção ("Persona: ...") vale primeiro; a linha do arquétipo costuma trazer a sobra do molde.
  const nomeArquetipo = nomeLimpo(p.persona?.nome) ?? nomeLimpo(c?.arquetipo?.texto);
  // Documento antigo: nenhum dos campos que a tela conhece (só o nome e rótulos livres). Aí o Retrato mostra
  // o que existe, sem dizer "Ainda não sabemos." para campos que aquele molde nem tinha.
  const soRotulosLivres = !c || CAMPOS_DO_MOLDE.every((k) => c[k] === null);

  return (
    <div className="flex flex-col gap-8">
      <header className="flex flex-col gap-4">
        <div className="flex flex-col gap-2">
          <h2 className="font-display text-2xl font-bold text-balance text-fg-1">{aberto.titulo}</h2>
          <p className="text-xs text-fg-3">
            Publicado <TempoRelativo iso={aberto.publicado_em} />
          </p>
          {p.cabecalho.ofertaEmFoco && (
            <p className="max-w-2xl break-words text-sm text-fg-2">
              <span className="font-semibold text-fg-1">Oferta em foco:</span> {p.cabecalho.ofertaEmFoco}
            </p>
          )}
          {p.cabecalho.origemPersona && <p className="max-w-2xl break-words text-sm text-fg-2">{comMaiuscula(p.cabecalho.origemPersona)}</p>}
          <p className="max-w-2xl text-xs text-fg-3">
            O selo em cada item diz de onde ele veio: do dossiê, do que você contou, de um material seu ou de pesquisa na internet.
            “Análise do especialista” é uma conclusão tirada dessas fontes. “Hipótese” e “Proposta do time” são ideias do time que
            ainda precisam de confirmação.
          </p>
        </div>
        <Placar placar={p.placar} />
        {docs.length > 1 && <ListaDeDocumentos aba="persona" docs={docs} abertoId={aberto.id} />}
      </header>

      <nav
        aria-label="Divisões da persona"
        className="sticky top-[var(--topbar-h)] z-20 -mx-4 border-b border-borda-suave bg-bg px-4 lg:-mx-8 lg:px-8"
      >
        <NavDivisoes prefixo="persona-" divisoes={DIVISOES_PERSONA.filter((d) => divisoes.includes(d.id)).map((d) => ({ id: d.id, rotulo: d.rotulo }))} />
      </nav>

      {tem("descobertas") && (
        <Divisao id="descobertas">
          <p className="-mt-2 max-w-2xl text-sm text-fg-2">
            O que o especialista concluiu juntando o que você contou com o que o mercado mostra, e o que fazer com cada coisa.
          </p>
          <ul className="flex flex-col gap-4">
            {p.descobertas.map((d, i) => (
              <CartaoDescoberta key={`${i}-${d.descoberta.texto}`} d={d} />
            ))}
          </ul>
        </Divisao>
      )}

      {tem("retrato") && (
        <Divisao id="retrato">
          <div className="flex flex-col gap-2 rounded-lg border border-borda-suave bg-bg-elevada p-5">
            <span className="eyebrow">{ROTULOS_CAMPOS.arquetipo}</span>
            {nomeArquetipo ? (
              <p className="min-w-0 break-words font-display text-2xl font-bold text-balance text-fg-1">{nomeArquetipo}</p>
            ) : (
              <SemDado />
            )}
            <p className="text-xs text-fg-3">Um nome só para a equipe conversar sobre esse cliente. Não é uma pessoa real.</p>
            {c?.arquetipo && <Selos origens={c.arquetipo.origens} />}
          </div>
          {!soRotulosLivres && <CartaoCampo rotulo={ROTULOS_CAMPOS.contexto} item={c?.contexto ?? null} />}
          {!soRotulosLivres && (
          <div className="flex flex-col gap-3">
            <h4 className="text-sm font-semibold text-fg-1">{ROTULOS_CAMPOS.objetivo}</h4>
            {c?.objetivo?.partes ? (
              <>
                <Grade colunas={3}>
                  {c.objetivo.partes.map((parte, i) => (
                    <li key={ROTULOS_OBJETIVO[i]} className="flex flex-col gap-1.5 rounded-lg border border-borda-suave bg-bg-elevada p-4">
                      <span className="eyebrow">{ROTULOS_OBJETIVO[i]}</span>
                      <p className="min-w-0 break-words text-sm leading-relaxed text-fg-1">{parte}</p>
                    </li>
                  ))}
                </Grade>
                <Selos origens={c.objetivo.origens} />
              </>
            ) : (
              <TextoComSelos item={c?.objetivo ?? null} />
            )}
          </div>
          )}
          {p.persona && p.persona.extras.length > 0 && (
            <Grade>
              {p.persona.extras.map((e, i) => (
                <li key={`${i}-${e.rotulo}`} className="grid min-w-0">
                  <CartaoCampo rotulo={e.rotulo} item={e.item} />
                </li>
              ))}
            </Grade>
          )}
        </Divisao>
      )}

      {tem("cliente") && (
        <Divisao id="cliente">
          <Grade>
            {p.clienteIdeal.map((item, i) => (
              <li key={`${i}-${item.texto}`} className="rounded-lg border border-borda-suave bg-bg-elevada p-5">
                <TextoComSelos item={item} />
              </li>
            ))}
          </Grade>
        </Divisao>
      )}

      {tem("forcas") && (
        <Divisao id="forcas">
          <div className="grid grid-cols-1 gap-4 md:grid-cols-2">
            <ColunaForcas
              titulo="Empurra para a compra"
              tom="ok"
              campos={[
                { rotulo: ROTULOS_CAMPOS.dores, item: c?.dores ?? null },
                { rotulo: ROTULOS_CAMPOS.resultado, item: c?.resultado ?? null },
                { rotulo: ROTULOS_CAMPOS.gatilho, item: c?.gatilho ?? null },
              ]}
            />
            <ColunaForcas
              titulo="Segura a compra"
              tom="erro"
              campos={[
                { rotulo: ROTULOS_CAMPOS.objecoes, item: c?.objecoes ?? null },
                { rotulo: ROTULOS_CAMPOS.habito, item: c?.habito ?? null },
              ]}
            />
          </div>
        </Divisao>
      )}

      {tem("escolha") && (
        <Divisao id="escolha">
          <div className="grid grid-cols-1 gap-4 md:grid-cols-3">
            <CartaoCampo rotulo={ROTULOS_CAMPOS.alternativas} item={c?.alternativas ?? null} />
            <CartaoCampo rotulo={ROTULOS_CAMPOS.criterios} item={c?.criterios ?? null} />
            <CartaoCampo rotulo={ROTULOS_CAMPOS.jornada} item={c?.jornada ?? null} />
          </div>
        </Divisao>
      )}

      {tem("palavras") && c?.linguagem && (
        <Divisao id="palavras">
          {c.linguagem.citacoes.length > 0 ? (
            <Citacoes citacoes={c.linguagem.citacoes} origens={c.linguagem.origens} />
          ) : (
            <CartaoCampo rotulo={ROTULOS_CAMPOS.linguagem} item={c.linguagem} />
          )}
        </Divisao>
      )}

      {tem("consciencia") && (
        <Divisao id="consciencia">
          <Grade>
            {p.consciencia.map((s, i) => (
              <CartaoSegmento key={`${i}-${s.segmento}`} s={s} />
            ))}
          </Grade>
        </Divisao>
      )}

      {tem("plano") && p.plano && (
        <Divisao id="plano">
          {p.plano.promessa && <Promessa item={p.plano.promessa} />}
          {(p.plano.provas || p.plano.ondeQuando || p.plano.extras.length > 0) && (
            <Grade>
              {p.plano.provas && (
                <li className="grid min-w-0">
                  <CartaoCampo rotulo="Provas" item={p.plano.provas} />
                </li>
              )}
              {p.plano.ondeQuando && (
                <li className="grid min-w-0">
                  <CartaoCampo rotulo="Onde e quando falar" item={p.plano.ondeQuando} />
                </li>
              )}
              {p.plano.extras.map((e, i) => (
                <li key={`${i}-${e.rotulo}`} className="grid min-w-0">
                  <CartaoCampo rotulo={e.rotulo} item={e.item} />
                </li>
              ))}
            </Grade>
          )}
          {p.plano.duvidas.length > 0 && <ListaDuvidas duvidas={p.plano.duvidas} />}
        </Divisao>
      )}

      {tem("nao-cliente") && (
        <Divisao id="nao-cliente">
          <ul className="flex flex-col divide-y divide-borda-suave rounded-lg border border-borda-suave bg-bg-elevada">
            {p.naoECliente.map((item, i) => (
              <li key={`${i}-${item.texto}`} className="px-5 py-4">
                <TextoComSelos item={item} />
              </li>
            ))}
          </ul>
        </Divisao>
      )}

      {tem("falta") && (
        <Divisao id="falta">
          <Grade>
            {p.lacunas.map((l, i) => (
              <CartaoLacuna key={`${i}-${l.lacuna}`} l={l} />
            ))}
          </Grade>
          <p className="rounded-lg bg-bg-sutil px-5 py-4 text-sm text-fg-2">
            Peça à sua IA: <span className="font-semibold text-fg-1">&quot;atualiza a persona com o que falta&quot;</span>. Ela pergunta só o que ainda não
            foi respondido.
          </p>
        </Divisao>
      )}

      {tem("fontes") && (
        <Divisao id="fontes">
          <ListaFontes fontes={p.fontes} />
        </Divisao>
      )}

      <details className="group rounded-lg border border-borda-suave bg-bg-elevada">
        <summary className="flex min-h-11 cursor-pointer list-none items-center justify-between gap-2 px-5 py-2 text-sm font-semibold text-fg-1 [&::-webkit-details-marker]:hidden">
          Texto completo do documento
          <span aria-hidden className="text-fg-3 transition-transform group-open:rotate-90">
            ›
          </span>
        </summary>
        <div className="border-t border-borda-suave p-5">
          <Markdown source={texto} />
        </div>
      </details>
    </div>
  );
}

/** O documento novo traz a seção com o bloco de dados (JSON): ela nunca aparece em texto. */
const RE_SECAO_DADOS = /^##\s+Dados para o sistema\s*$/m;

/**
 * O painel pronto da aba Persona, na ordem de preferência:
 * 1. o estudo do cliente ideal, quando o documento traz o bloco ```persona-dados válido (lib/persona-estudo.ts);
 * 2. a persona em blocos, lida do markdown no molde de antes (lib/persona-dados.ts);
 * 3. null, e a página mostra o documento em texto, como antes.
 * Documento novo com o bloco inválido cai em 2 ou 3 sem a seção de dados, para o JSON cru não aparecer.
 */
export function painelDaPersona(docs: DocumentoDaLista[], aberto: DocumentoDaLista | null, texto: string | null, imagemUrl: string | null = null): ReactNode {
  if (!aberto || texto === null) return null;
  const estudo = lerEstudo(texto);
  if (estudo) return <EstudoPersona estudo={estudo} aberto={aberto} docs={docs} texto={texto} />;
  const comDados = RE_SECAO_DADOS.test(texto);
  const legivel = comDados ? textoSemDados(texto) : texto;
  const persona = lerPersona(legivel);
  if (persona && divisoesDaPersona(persona).length > 0) return <PersonaMarca persona={persona} aberto={aberto} docs={docs} texto={legivel} />;
  if (comDados) return <PainelDocumento aba="persona" docs={docs} aberto={aberto} texto={legivel} imagemUrl={imagemUrl} />;
  return null;
}
