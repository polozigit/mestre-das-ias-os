import { ArrowRight, Check, CircleDashed } from "lucide-react";
import { Markdown } from "@/components/ui/Markdown";
import { TempoRelativo } from "@/components/ui/TempoRelativo";
import { cn } from "@/lib/utils";
import {
  LEGENDA_ORIGEM,
  PARA_ENTENDER,
  ROTULOS_CURTOS,
  ROTULOS_PERFIL,
  ROTULOS_TEMPO,
  ROTULOS_TRABALHO,
  TIPOS_ORIGEM,
  TITULOS_CAPITULO,
  baseDasFontes,
  capitulosDoEstudo,
  comPesquisa,
  fontesAgrupadas,
  formatarNumerosFonte,
  notaDeVersao,
  subtituloDaAbertura,
  textoSemDados,
  tituloDoCapitulo,
  type EstudoPersona as Estudo,
  type Fonte,
  type IdCapitulo,
} from "@/lib/persona-estudo";
import { NavDivisoes } from "./NavDivisoes";
import { ListaDeDocumentos, type DocumentoDaLista } from "./PainelDocumento";
import { Aneis, Balanca, Caminho, Escada, LegendaDosAneis, Mapa, Zonas } from "./estudo/diagramas";
import { CLASSE_LINK, Capitulo, DESTAQUE, DeOndeTirei, LINK_EXTERNO, ListaDeFatos, Marca, ROTULO, Rotulado, SUBTITULO, Selo } from "./estudo/pecas";

/*
 * O estudo do cliente ideal: a página da aba Persona quando o documento traz o bloco ```persona-dados válido
 * (lib/persona-estudo.ts). Abertura, navegação grudada por capítulo, cada capítulo com o "Para entender" ao
 * lado, as fontes no rodapé e o texto completo recolhido no fim. Só aparece o capítulo que tem dado.
 */

type Props = { estudo: Estudo; aberto: DocumentoDaLista; docs: DocumentoDaLista[]; texto: string };

/** Ponto final só quando o título não termina em pontuação. */
const comPonto = (t: string) => (/[.!?:]$/.test(t) ? t : `${t}.`);

export function EstudoPersona({ estudo: e, aberto, docs, texto }: Props) {
  const capitulos = capitulosDoEstudo(e);
  const fontes = new Map<number, Fonte>(e.fontes.itens.map((f) => [f.n, f]));
  const titulo = (id: IdCapitulo) => tituloDoCapitulo(e, id);

  return (
    <div className="@container">
      <div className="flex flex-col gap-3">
        <p className="text-xs text-fg-3">
          <span className="font-semibold text-fg-2">{aberto.titulo}</span> · Publicado <TempoRelativo iso={aberto.publicado_em} />
        </p>
        {docs.length > 1 && <ListaDeDocumentos aba="persona" docs={docs} abertoId={aberto.id} />}
      </div>

      <Abertura e={e} />

      <nav
        aria-label="Capítulos do estudo"
        className="sticky top-[var(--topbar-h)] z-20 -mx-4 flex items-center gap-4 border-b border-borda bg-bg px-4 lg:-mx-8 lg:px-8"
      >
        <span className="hidden shrink-0 font-display text-[17px] text-fg-1 @5xl:block">Estudo do cliente ideal</span>
        <div className="min-w-0 flex-1">
          <NavDivisoes prefixo="estudo-" divisoes={capitulos.map((id) => ({ id, rotulo: ROTULOS_CURTOS[id] }))} />
        </div>
      </nav>

      {e.descobertas && (
        <Capitulo id="descobertas" titulo={titulo("descobertas")} comConceito={false}>
          <p className="mt-5 max-w-[60ch] text-[clamp(1.0625rem,2cqi,1.1875rem)] leading-relaxed text-fg-2">{PARA_ENTENDER.descobertas.texto}</p>
          <ol className="mt-10 grid">
            {e.descobertas.itens.map((d, i) => (
              <li key={i} className="grid gap-5 border-t border-borda py-9 @4xl:grid-cols-[7rem_minmax(0,1fr)] @4xl:gap-10">
                <span aria-hidden className="font-display text-[clamp(3rem,8cqi,5.5rem)] leading-[0.8] text-fg-4">
                  {i + 1}
                </span>
                <article className="min-w-0">
                  <h3
                    className={cn(
                      "max-w-[24ch] break-words font-display font-normal leading-[1.1] tracking-[-0.022em] text-balance text-fg-1",
                      i === 0 ? "text-[clamp(1.75rem,4.6cqi,3.1rem)]" : "text-[clamp(1.5rem,3.8cqi,2.5rem)]",
                    )}
                  >
                    {d.titulo}
                  </h3>
                  <p className="mt-4 max-w-[66ch] break-words leading-relaxed text-fg-2">{d.corpo}</p>
                  <div className="mt-6 grid gap-5 @2xl:grid-cols-2 @2xl:gap-8">
                    <Rotulado rotulo="Por que importa" className="border-t border-borda pt-3 text-fg-1">
                      {d.por_que_importa}
                    </Rotulado>
                    <Rotulado rotulo="O que fazer" className="border-t border-borda pt-3 text-fg-1">
                      {d.o_que_fazer}
                    </Rotulado>
                  </div>
                  <Marca origem={d.origem} className="mt-4" />
                  <DeOndeTirei evidencias={d.evidencias} fontes={fontes} />
                </article>
              </li>
            ))}
          </ol>
          {e.descobertas.extra && (
            <div className="grid gap-2 border-t border-borda pt-6 @4xl:grid-cols-[7rem_minmax(0,1fr)] @4xl:gap-10">
              <span className={ROTULO}>E mais uma</span>
              <div className="min-w-0">
                <p className="max-w-[52ch] break-words font-display text-[clamp(1.125rem,2.4cqi,1.375rem)] leading-snug text-fg-1">{e.descobertas.extra.texto}</p>
                <Marca origem={e.descobertas.extra.origem} />
                {e[e.descobertas.extra.capitulo] !== null && (
                  <a
                    href={`#estudo-${e.descobertas.extra.capitulo}`}
                    className="mt-1 inline-flex min-h-11 items-center gap-1.5 text-sm font-semibold text-fg-1 underline decoration-fg-4 underline-offset-[3px] hover:decoration-fg-1"
                  >
                    Ver o capítulo {TITULOS_CAPITULO[e.descobertas.extra.capitulo]}
                    <ArrowRight aria-hidden className="size-4" />
                  </a>
                )}
              </div>
            </div>
          )}
        </Capitulo>
      )}

      {e.quem && (
        <Capitulo id="quem" titulo={titulo("quem")}>
          {e.quem.momento && (
            <div className="mb-8">
              <p className={cn(DESTAQUE, "max-w-[34ch] break-words")}>{e.quem.momento.texto}</p>
              <Marca origem={e.quem.momento.origem} />
            </div>
          )}
          <div className={cn("grid gap-9", e.quem.perfil.length > 0 && e.quem.pessoa.length > 0 && "@2xl:grid-cols-2 @2xl:gap-12")}>
            {e.quem.perfil.length > 0 && (
              <div className="min-w-0">
                <span className={ROTULO}>{ROTULOS_PERFIL[e.tipo_cliente]}</span>
                <ListaDeFatos itens={e.quem.perfil} />
              </div>
            )}
            {e.quem.pessoa.length > 0 && (
              <div className="min-w-0">
                <span className={ROTULO}>A pessoa</span>
                <ListaDeFatos itens={e.quem.pessoa} />
              </div>
            )}
          </div>
          <DeOndeTirei evidencias={e.quem.evidencias} fontes={fontes} />
          {e.quem.grupo_compra && (
            <div className="mt-14 grid items-center gap-8 @3xl:grid-cols-[minmax(0,22rem)_minmax(0,1fr)] @3xl:gap-12">
              <Aneis papeis={e.quem.grupo_compra.papeis} />
              <div className="min-w-0">
                <h3 className={SUBTITULO}>Quem pesa na compra</h3>
                <p className="mt-3 max-w-[60ch] text-fg-2">Quase nenhuma compra é decidida por uma pessoa só: alguém decide, alguém influencia e alguém usa.</p>
                {e.quem.grupo_compra.nota && (
                  <div className="mt-4">
                    <p className="break-words text-fg-1">{e.quem.grupo_compra.nota.texto}</p>
                    <Marca origem={e.quem.grupo_compra.nota.origem} />
                  </div>
                )}
                <LegendaDosAneis papeis={e.quem.grupo_compra.papeis} />
              </div>
            </div>
          )}
        </Capitulo>
      )}

      {e.pensa && (
        <Capitulo id="pensa" titulo={titulo("pensa")}>
          <div className="grid gap-10 @3xl:grid-cols-3 @3xl:gap-8">
            {(
              [
                ["Acredita", e.pensa.acredita],
                ["Teme", e.pensa.teme],
                ["Deseja", e.pensa.deseja],
              ] as const
            )
              .filter(([, itens]) => itens.length > 0)
              .map(([rotulo, itens]) => (
                <div key={rotulo} className="min-w-0">
                  <h3 className="border-b-2 border-fg-1 pb-3 font-display text-[clamp(1.5rem,3cqi,2rem)] font-normal italic leading-none text-fg-1">{rotulo}</h3>
                  <ul className="grid">
                    {itens.map((a, i) => (
                      <li key={i} className="border-b border-borda py-4">
                        <p className="break-words text-fg-1">{a.texto}</p>
                        <Marca origem={a.origem} />
                      </li>
                    ))}
                  </ul>
                </div>
              ))}
          </div>
          <DeOndeTirei evidencias={e.pensa.evidencias} fontes={fontes} />
          {e.pensa.espelho && (
            <div className="mt-14 grid gap-5 rounded-lg bg-alerta-suave p-6 @3xl:grid-cols-[12rem_minmax(0,1fr)] @3xl:gap-9 @3xl:p-10">
              <h3 className={SUBTITULO}>Cuidado com o espelho</h3>
              <div className="min-w-0">
                {e.pensa.espelho.paragrafos.map((p, i) => (
                  <p key={i} className="max-w-[62ch] break-words text-fg-1 [&+p]:mt-2.5">
                    {p}
                  </p>
                ))}
                <Marca origem={e.pensa.espelho.origem} className="mt-3.5" />
                <DeOndeTirei evidencias={e.pensa.espelho.evidencias} fontes={fontes} fundo="pagina" />
              </div>
            </div>
          )}
        </Capitulo>
      )}

      {e.quer && (
        <Capitulo id="quer" titulo={titulo("quer")}>
          <ul className="grid">
            {(["pratico", "ser_visto", "sentir"] as const).map((k) => {
              const t = e.quer?.[k];
              if (!t) return null;
              return (
                <li key={k} className="grid gap-3 border-t border-borda py-8 last:border-b @3xl:grid-cols-[9rem_minmax(0,1fr)_15rem] @3xl:items-start @3xl:gap-9">
                  <span className="font-display text-xl italic text-fg-3">{ROTULOS_TRABALHO[k]}</span>
                  <div className="min-w-0">
                    <p className="break-words font-display text-[clamp(1.25rem,3cqi,1.75rem)] leading-tight tracking-[-0.012em] text-fg-1">{t.enunciado}</p>
                    <Marca origem={t.origem} className="mt-2.5" />
                  </div>
                  <Rotulado rotulo="O que isso pede de você" className="text-[14.5px] text-fg-2">
                    {t.o_que_pede}
                  </Rotulado>
                </li>
              );
            })}
          </ul>
          <DeOndeTirei evidencias={e.quer.evidencias} fontes={fontes} />
        </Capitulo>
      )}

      {e.forcas && (
        <Capitulo id="forcas" titulo={titulo("forcas")}>
          <Balanca forcas={e.forcas} />
          {e.forcas.leitura && (
            <div className="mt-10">
              <p className={cn(DESTAQUE, "max-w-[34ch] break-words")}>{e.forcas.leitura.texto}</p>
              <Marca origem={e.forcas.leitura.origem} />
            </div>
          )}
          {e.forcas.como_virar.length > 0 && (
            <div className="mt-12">
              <h3 className={ROTULO}>Como virar a balança</h3>
              <ol className="mt-3 grid">
                {e.forcas.como_virar.map((c, i) => (
                  <li key={i} className="grid grid-cols-[2.75rem_minmax(0,1fr)] gap-2 border-t border-borda py-4">
                    <span aria-hidden className="font-display text-2xl leading-none text-fg-3">
                      {i + 1}
                    </span>
                    <p className="break-words text-fg-1">
                      <span className="font-semibold">{comPonto(c.titulo)}</span> {c.texto}
                    </p>
                  </li>
                ))}
              </ol>
            </div>
          )}
          <DeOndeTirei evidencias={e.forcas.evidencias} fontes={fontes} />
        </Capitulo>
      )}

      {e.decide && (
        <Capitulo id="decide" titulo={titulo("decide")}>
          {e.decide.caminho && (
            <div>
              <h3 className={ROTULO}>O caminho até comprar, e depois</h3>
              <Caminho pontos={e.decide.caminho.pontos} />
            </div>
          )}
          {e.decide.posicao && (
            <div className="mt-16 grid items-start gap-8 @3xl:grid-cols-[minmax(0,26rem)_minmax(0,1fr)] @3xl:gap-12">
              <Mapa posicao={e.decide.posicao} />
              <div className="min-w-0">
                <h3 className={SUBTITULO}>Com o que o cliente compara você</h3>
                <p className="mt-3 max-w-[66ch] break-words text-fg-2">{e.decide.posicao.leitura.texto}</p>
                <Marca origem={e.decide.posicao.leitura.origem} />
                {e.decide.posicao.ressalva && <p className="mt-3 max-w-[66ch] break-words text-[13.5px] text-fg-3">{e.decide.posicao.ressalva}</p>}
                <DeOndeTirei evidencias={e.decide.posicao.evidencias} fontes={fontes} />
              </div>
            </div>
          )}
          {e.decide.criterios.length > 0 && (
            <div className="mt-16">
              <h3 className={SUBTITULO}>O que o cliente quer dizer quando avalia</h3>
              <p className="mt-2.5 max-w-[60ch] text-fg-2">Cliente usa palavras vagas. A venda depende de saber o que cada uma quer dizer para ele.</p>
              <dl className="mt-3 grid">
                {e.decide.criterios.map((c, i) => (
                  <div key={i} className="grid gap-1.5 border-t border-borda py-4 last:border-b @2xl:grid-cols-[12rem_minmax(0,1fr)] @2xl:gap-8">
                    <dt className="break-words font-display text-2xl italic leading-tight text-fg-1">{c.termo}</dt>
                    <dd className="min-w-0">
                      <p className="break-words text-fg-1">{c.significado}</p>
                      <Marca origem={c.origem} />
                    </dd>
                  </div>
                ))}
              </dl>
            </div>
          )}
          <DeOndeTirei evidencias={e.decide.evidencias} fontes={fontes} />
        </Capitulo>
      )}

      {e.onde && (
        <Capitulo id="onde" titulo={titulo("onde")}>
          <Zonas zonas={e.onde.zonas} />
          {e.onde.nao_alcancado && (
            <p className="mt-8 max-w-[70ch] break-words text-[14.5px] text-fg-2">
              <span className="font-semibold text-fg-1">O material não alcançou:</span> {e.onde.nao_alcancado}
            </p>
          )}
          <DeOndeTirei evidencias={e.onde.evidencias} fontes={fontes} />
        </Capitulo>
      )}

      {e.sabe && (
        <Capitulo id="sabe" titulo={titulo("sabe")}>
          <Escada sabe={e.sabe} />
          {e.sabe.leitura && (
            <div className="mt-9 grid max-w-[70ch] gap-3">
              {e.sabe.leitura.paragrafos.map((p, i) => (
                <p key={i} className={cn(DESTAQUE, "break-words")}>
                  {p}
                </p>
              ))}
              <Marca origem={e.sabe.leitura.origem} className="mt-0" />
            </div>
          )}
          <DeOndeTirei evidencias={e.sabe.evidencias} fontes={fontes} />
        </Capitulo>
      )}

      {e.mensagem && <CapituloMensagem e={e} fontes={fontes} />}

      {e.nao && (
        <Capitulo id="nao" titulo={titulo("nao")}>
          <ul className="grid">
            {e.nao.perfis.map((p, i) => (
              <li key={i} className="grid gap-2 border-t border-borda py-6 last:border-b @3xl:grid-cols-[minmax(0,1.1fr)_minmax(0,1fr)] @3xl:gap-10">
                <p className="break-words font-display text-[clamp(1.25rem,3cqi,1.75rem)] leading-tight text-fg-1 line-through decoration-erro decoration-1">{p.perfil}</p>
                <div className="min-w-0">
                  <p className="break-words text-[15px] text-fg-2">{p.porque}</p>
                  <Marca origem={p.origem} />
                </div>
              </li>
            ))}
          </ul>
        </Capitulo>
      )}

      {e.apostas && (
        <Capitulo id="apostas" titulo={titulo("apostas")}>
          <div aria-hidden className={cn("hidden gap-7 pb-2.5 @3xl:grid", COLUNAS_APOSTA, ROTULO)}>
            <span>A aposta</span>
            <span>Por que acredito</span>
            <span>Como confirmar</span>
            <span>Tempo</span>
          </div>
          <ul className="grid">
            {e.apostas.itens.map((a, i) => (
              <li key={i} className={cn("grid gap-2.5 border-t border-borda py-5 last:border-b @3xl:gap-7", COLUNAS_APOSTA)}>
                <p className="break-words font-display text-xl leading-snug text-fg-1">{a.aposta}</p>
                <CelulaAposta rotulo="Por que acredito">{a.por_que}</CelulaAposta>
                <CelulaAposta rotulo="Como confirmar">{a.como_confirmar}</CelulaAposta>
                <CelulaAposta rotulo="Tempo" forte>
                  {ROTULOS_TEMPO[a.tempo]}
                </CelulaAposta>
              </li>
            ))}
          </ul>
          {e.apostas.roteiro && (
            <div className="mt-14 grid gap-6 rounded-lg bg-bg-sutil p-6 @3xl:grid-cols-[15rem_minmax(0,1fr)] @3xl:gap-10 @3xl:p-10">
              <div className="min-w-0">
                <h3 className={SUBTITULO}>
                  {e.apostas.roteiro.conversas} conversas, {e.apostas.roteiro.perguntas.length} perguntas
                </h3>
                <p className="mt-2.5 break-words text-[14.5px] text-fg-2">
                  {e.apostas.roteiro.com_quem} {e.apostas.roteiro.minutos} minutos cada, sem vender nada. Anote as palavras exatas: elas viram a sua próxima mensagem.
                </p>
              </div>
              <ol className="grid gap-3.5">
                {e.apostas.roteiro.perguntas.map((p, i) => (
                  <li key={i} className="grid grid-cols-[1.75rem_minmax(0,1fr)] gap-2">
                    <span aria-hidden className="pt-1 text-[13px] font-semibold tabular-nums text-fg-3">
                      {i + 1}
                    </span>
                    <span className="break-words font-display text-lg leading-snug text-fg-1">{p}</span>
                  </li>
                ))}
              </ol>
            </div>
          )}
        </Capitulo>
      )}

      {e.semana && (
        <Capitulo id="semana" titulo={titulo("semana")}>
          <ol className="grid">
            {e.semana.acoes.map((a, i) => (
              <li key={i} className="grid grid-cols-[3.25rem_minmax(0,1fr)] gap-3 border-t border-borda py-6 last:border-b @3xl:grid-cols-[5rem_minmax(0,1fr)_17rem] @3xl:gap-8">
                <span aria-hidden className="font-display text-[clamp(2.25rem,5cqi,3.25rem)] leading-[0.9] text-fg-1">
                  {i + 1}
                </span>
                <p className="min-w-0 break-words font-display text-[clamp(1.25rem,3cqi,1.625rem)] leading-tight text-fg-1">{a.acao}</p>
                <div className="col-start-2 min-w-0 text-sm text-fg-2 @3xl:col-start-auto">
                  <span className={cn(ROTULO, "mb-1 block")}>Resolve</span>
                  <p className="break-words">{a.resolve}</p>
                  {a.origem && <Marca origem={a.origem} />}
                </div>
              </li>
            ))}
          </ol>
        </Capitulo>
      )}

      <RodapeFontes e={e} />

      <details className="group mt-4 rounded-lg border border-borda-suave bg-bg-elevada">
        <summary className="flex min-h-11 cursor-pointer list-none items-center justify-between gap-2 px-5 py-2 text-sm font-semibold text-fg-1 [&::-webkit-details-marker]:hidden">
          Texto completo do documento
          <span aria-hidden className="text-fg-3 transition-transform group-open:rotate-90">
            ›
          </span>
        </summary>
        <div className="border-t border-borda-suave p-5">
          <Markdown source={textoSemDados(texto)} />
        </div>
      </details>
    </div>
  );
}

const COLUNAS_APOSTA = "@3xl:grid-cols-[minmax(0,1.3fr)_minmax(0,1fr)_minmax(0,1fr)_6.5rem]";

function CelulaAposta({ rotulo, forte = false, children }: { rotulo: string; forte?: boolean; children: string }) {
  return (
    <div className={cn("min-w-0 text-sm", forte ? "font-semibold text-fg-1" : "text-fg-2")}>
      <span className={cn(ROTULO, "mb-0.5 block @3xl:hidden")}>{rotulo}</span>
      <p className="break-words">{children}</p>
    </div>
  );
}

function Abertura({ e }: { e: Estudo }) {
  const { texto: arq, enfase } = e.abertura.arquetipo;
  const i = enfase ? arq.indexOf(enfase) : -1;
  return (
    <section aria-labelledby="estudo-abertura" className="grid gap-10 border-b border-borda pb-12 pt-10 @4xl:pb-16 @4xl:pt-16 @5xl:grid-cols-[1.55fr_1fr] @5xl:items-end @5xl:gap-16">
      <div className="min-w-0">
        <h2
          id="estudo-abertura"
          className="break-words font-display text-[clamp(2.25rem,8cqi,5rem)] font-normal leading-[1.02] tracking-[-0.03em] text-balance text-fg-1"
        >
          {i >= 0 && enfase ? (
            <>
              {arq.slice(0, i)}
              <em className="italic">{enfase}</em>
              {arq.slice(i + enfase.length)}
            </>
          ) : (
            arq
          )}
        </h2>
        <p className="mt-6 max-w-[56ch] text-[clamp(1.0625rem,2cqi,1.1875rem)] leading-relaxed text-fg-2">{subtituloDaAbertura(e)}</p>
        {e.oferta && (
          <p className="mt-4 max-w-[56ch] break-words text-sm text-fg-2">
            <span className="font-semibold text-fg-1">Oferta em foco:</span> {e.oferta.texto}
          </p>
        )}
      </div>
      <div className="min-w-0 border-t-2 border-fg-1 pt-4">
        <p className={ROTULO}>Em uma frase</p>
        <p className="mt-2.5 break-words font-display text-[clamp(1.25rem,2.6cqi,1.5rem)] leading-snug tracking-[-0.01em] text-fg-1">{e.abertura.retrato.texto}</p>
        <Marca origem={e.abertura.retrato.origem} />
        <ul aria-label="Como ler as marcas" className="mt-6 grid gap-2 text-[13.5px] text-fg-3">
          {TIPOS_ORIGEM.map((t) => (
            <li key={t} className="flex flex-wrap items-center gap-x-2.5 gap-y-1">
              <Selo tipo={t} semPrefixo />
              {LEGENDA_ORIGEM[t]}
            </li>
          ))}
        </ul>
        <p className="mt-6 rounded-md bg-bg-sutil px-4 py-3.5 text-sm leading-relaxed text-fg-2">{notaDeVersao(e)}</p>
      </div>
    </section>
  );
}

function CapituloMensagem({ e, fontes }: { e: Estudo; fontes: Map<number, Fonte> }) {
  const m = e.mensagem;
  if (!m) return null;
  const duas = m.promessa_hoje && m.promessa_sugerida;
  return (
    <Capitulo id="mensagem" titulo={tituloDoCapitulo(e, "mensagem")}>
      {(m.promessa_hoje || m.promessa_sugerida) && (
        <div className={cn("grid overflow-hidden rounded-lg border border-borda", duas && "@3xl:grid-cols-[1fr_1.25fr]")}>
          {m.promessa_hoje && (
            <div className="min-w-0 bg-bg-sutil p-6 @3xl:p-10">
              <h3 className={ROTULO}>A promessa hoje</h3>
              <p className="mt-3 break-words font-display text-xl leading-snug text-fg-2">{m.promessa_hoje.texto}</p>
              <Marca origem={m.promessa_hoje.origem} className="mt-3.5" />
            </div>
          )}
          {m.promessa_sugerida && (
            <div className="min-w-0 bg-acento p-6 text-fg-sobre-acento @3xl:p-10">
              <h3 className={cn(ROTULO, "text-fg-sobre-acento/70")}>A promessa sugerida</h3>
              <p className="mt-3 break-words font-display text-[clamp(1.5rem,3.4cqi,2.125rem)] leading-tight tracking-[-0.015em]">{m.promessa_sugerida.texto}</p>
              {m.promessa_sugerida.motivos.length > 0 && (
                <ul className="mt-5 grid gap-2 text-[14.5px] text-fg-sobre-acento/90">
                  {m.promessa_sugerida.motivos.map((mo, i) => (
                    <li key={i} className="grid grid-cols-[1.125rem_minmax(0,1fr)] gap-2">
                      <Check aria-hidden className="mt-0.5 size-4" />
                      <span className="break-words">{mo}</span>
                    </li>
                  ))}
                </ul>
              )}
              <Marca origem={m.promessa_sugerida.origem} sobreAcento className="mt-4" />
              <DeOndeTirei evidencias={m.promessa_sugerida.evidencias} fontes={fontes} sobreAcento />
            </div>
          )}
        </div>
      )}

      {m.risco && (
        <div className="mt-12 grid gap-3.5 border-t border-borda pt-7 @3xl:grid-cols-2 @3xl:gap-12">
          <h3 className={SUBTITULO}>{m.risco.titulo}</h3>
          <div className="min-w-0">
            <p className="max-w-[66ch] break-words text-fg-2">{m.risco.texto}</p>
            <Marca origem={m.risco.origem} />
            {m.risco.teste && (
              <Rotulado rotulo="Como testar" className="mt-4 text-fg-1">
                {m.risco.teste}
              </Rotulado>
            )}
          </div>
        </div>
      )}

      {m.onde_quando && (
        <div className="mt-12">
          <h3 className={ROTULO}>Onde e quando falar</h3>
          <p className="mt-1.5 max-w-[66ch] break-words text-fg-1">{m.onde_quando.texto}</p>
          <Marca origem={m.onde_quando.origem} />
        </div>
      )}

      {(m.provas_tem.length > 0 || m.provas_faltam.length > 0) && (
        <div className="mt-14 grid gap-8 @2xl:grid-cols-2 @2xl:gap-12">
          {m.provas_tem.length > 0 && (
            <div className="min-w-0">
              <h3 className={ROTULO}>Provas que você já tem</h3>
              <ul className="mt-3 grid">
                {m.provas_tem.map((p, i) => (
                  <li key={i} className="grid grid-cols-[1.375rem_minmax(0,1fr)] gap-2.5 border-t border-borda py-3">
                    <Check aria-hidden className="mt-0.5 size-[18px] text-ok" />
                    <div className="min-w-0">
                      <p className="break-words text-fg-1">{p.texto}</p>
                      <Marca origem={p.origem} />
                    </div>
                  </li>
                ))}
              </ul>
            </div>
          )}
          {m.provas_faltam.length > 0 && (
            <div className="min-w-0">
              <h3 className={ROTULO}>Provas que faltam</h3>
              <ul className="mt-3 grid">
                {m.provas_faltam.map((p, i) => (
                  <li key={i} className="grid grid-cols-[1.375rem_minmax(0,1fr)] gap-2.5 border-t border-borda py-3">
                    <CircleDashed aria-hidden className="mt-0.5 size-[18px] text-erro" />
                    <div className="min-w-0">
                      <p className="break-words text-fg-1">{p.texto}</p>
                      {p.origem && <Marca origem={p.origem} />}
                    </div>
                  </li>
                ))}
              </ul>
            </div>
          )}
        </div>
      )}

      {m.duvidas.length > 0 && (
        <div className="mt-16">
          <h3 className={SUBTITULO}>Cada dúvida, com a resposta pronta</h3>
          <dl className="mt-3 grid">
            {m.duvidas.map((d, i) => (
              <div key={i} className="grid gap-2.5 border-t border-borda py-5 last:border-b @3xl:grid-cols-[minmax(0,1fr)_minmax(0,1.5fr)] @3xl:gap-10">
                <dt className="min-w-0">
                  <p className="break-words font-display text-xl leading-snug text-fg-1">{d.duvida}</p>
                  <Marca origem={d.origem_duvida} />
                </dt>
                <dd className="min-w-0">
                  <p className="break-words text-fg-1">{d.resposta}</p>
                  <Marca origem={d.origem_resposta} />
                  {d.pendencia && (
                    <Rotulado rotulo="Falta confirmar" className="mt-3 text-sm text-fg-2">
                      {d.pendencia}
                    </Rotulado>
                  )}
                </dd>
              </div>
            ))}
          </dl>
        </div>
      )}
      <DeOndeTirei evidencias={m.evidencias} fontes={fontes} />
    </Capitulo>
  );
}

function RodapeFontes({ e }: { e: Estudo }) {
  const grupos = comPesquisa(e) ? fontesAgrupadas(e.fontes) : [];
  return (
    <footer className="pb-6 pt-14 text-sm text-fg-2">
      <h2 className="font-display text-2xl font-normal text-fg-1">Fontes da pesquisa</h2>
      {grupos.length > 0 && (
        <ul className="mt-4 grid max-w-[80ch] gap-2.5">
          {grupos.map((g) => (
            <li key={g.url} className="grid grid-cols-[4rem_minmax(0,1fr)] gap-2">
              <span className="tabular-nums text-fg-3">{formatarNumerosFonte(g.numeros)}</span>
              <a href={g.url} {...LINK_EXTERNO} className={CLASSE_LINK}>
                {g.titulo}
              </a>
            </li>
          ))}
        </ul>
      )}
      <p className="mt-6 max-w-[70ch] text-fg-3">{baseDasFontes(e)}</p>
      {e.fontes.nao_achado.map((n, i) => (
        <p key={i} className="mt-2 max-w-[70ch] break-words text-fg-3">
          Não encontrado: {n}
        </p>
      ))}
    </footer>
  );
}
