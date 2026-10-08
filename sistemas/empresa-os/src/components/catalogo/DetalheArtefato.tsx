import Link from "next/link";
import { notFound } from "next/navigation";
import { ArrowLeft, ChevronRight } from "lucide-react";
import { createClient } from "@/lib/supabase/server";
import { Card, CardBody, CardHeader, CardTitle } from "@/components/ui/Card";
import { Markdown } from "@/components/ui/Markdown";
import { Pill } from "@/components/ui/Pill";
import { TempoRelativo } from "@/components/ui/TempoRelativo";
import { ESTADO } from "@/components/painel/CardAgente";
import { CodigoDestacado } from "@/components/catalogo/CodigoDestacado";
import { nomeAmigavel } from "@/lib/agentes/nome";
import {
  ROTULO_TIPO,
  hrefArtefato,
  rotuloOrigem,
  semFrontmatter,
  textoDeclarado,
  tipoDaBusca,
  vizinhosVisiveis,
  type TipoArtefato,
  type VizinhoArtefato,
} from "@/lib/catalogo/catalogo";

const ROTULO_SECAO = "text-[11px] font-bold uppercase tracking-widest text-fg-4";

type Arquivo = { caminho: string; linguagem: string; conteudo: string | null; bytes: number };

function ListaVizinhos({ itens }: { itens: VizinhoArtefato[] }) {
  return (
    <ul className="flex flex-col divide-y divide-borda-suave">
      {itens.map((v) => {
        const tipo = tipoDaBusca(v.tipo);
        return (
          <li key={`${v.tipo}:${v.nome}`} className="py-2.5 first:pt-0 last:pb-0">
            <Link
              href={hrefArtefato(tipo, v.nome)}
              className="group flex min-h-11 flex-col justify-center gap-0.5 md:min-h-0"
            >
              <span className="flex flex-wrap items-center gap-2">
                <span className="break-words text-sm font-semibold text-acento-texto group-hover:underline" title={v.nome}>
                  {nomeAmigavel(v.nome)}
                </span>
                <span className="text-xs text-fg-4">{ROTULO_TIPO[tipo].singular}</span>
              </span>
              {v.resumo && <span className="line-clamp-2 break-words text-xs text-fg-3">{v.resumo}</span>}
            </Link>
          </li>
        );
      })}
    </ul>
  );
}

/** Conteudo do artefato: markdown renderizado + o arquivo cru; outros formatos so o codigo. */
export async function CardConteudo({
  conteudo,
  formato,
  caminho,
}: {
  conteudo: string;
  formato: string;
  caminho: string;
}) {
  return (
    <Card className="min-w-0 max-w-full">
      <CardHeader>
        <CardTitle>Conteúdo</CardTitle>
      </CardHeader>
      <CardBody className="flex min-w-0 flex-col gap-4">
        {formato === "markdown" ? (
          <>
            {/* Bloco de codigo do markdown rola dentro da propria caixa (o Markdown compartilhado nao trata). */}
            <div className="min-w-0 max-w-full [&_pre]:max-w-full [&_pre]:overflow-x-auto">
              <Markdown source={semFrontmatter(conteudo)} />
            </div>
            <details className="group min-w-0 max-w-full">
              <summary className="flex min-h-11 cursor-pointer items-center text-sm font-semibold text-acento-texto md:min-h-0">
                Ver o arquivo como está no repositório
              </summary>
              <div className="mt-3 min-w-0 max-w-full">
                <CodigoDestacado codigo={conteudo} linguagem="markdown" nomeArquivo={caminho} />
              </div>
            </details>
          </>
        ) : (
          <CodigoDestacado codigo={conteudo} linguagem={formato} nomeArquivo={caminho} />
        )}
      </CardBody>
    </Card>
  );
}

/**
 * O texto técnico do agente, da skill ou do workflow (o arquivo como está no repositório e os que
 * acompanham) recolhido num "Ver instruções completas", fechado por padrão: o dono lê o resumo e só
 * abre isto se quiser ver por dentro.
 */
export function InstrucoesCompletas({ children }: { children: React.ReactNode }) {
  return (
    <details className="group min-w-0 max-w-full rounded-lg border border-borda bg-bg-elevada">
      <summary className="flex min-h-11 cursor-pointer list-none items-center gap-2 px-5 py-3 text-sm font-semibold text-acento-texto [&::-webkit-details-marker]:hidden">
        <ChevronRight size={16} aria-hidden="true" className="shrink-0 transition-transform group-open:rotate-90" />
        Ver instruções completas
      </summary>
      <div className="flex min-w-0 flex-col gap-6 border-t border-borda-suave p-4">{children}</div>
    </details>
  );
}

/** Arquivos que acompanham o artefato (scripts, referencias). Some se nao houver nenhum. */
export async function CardArquivos({ arquivos }: { arquivos: Arquivo[] }) {
  if (arquivos.length === 0) return null;
  return (
    <Card className="min-w-0 max-w-full">
      <CardHeader>
        <CardTitle>Arquivos ({arquivos.length})</CardTitle>
      </CardHeader>
      <CardBody className="flex min-w-0 flex-col divide-y divide-borda-suave py-2">
        {arquivos.map((a) => (
          <details key={a.caminho} className="group min-w-0 max-w-full py-1">
            <summary className="flex min-h-11 cursor-pointer list-none items-center gap-2 break-all font-mono text-xs font-semibold text-fg-2 md:min-h-8 [&::-webkit-details-marker]:hidden">
              <ChevronRight
                size={14}
                aria-hidden="true"
                className="shrink-0 text-fg-4 transition-transform group-open:rotate-90"
              />
              {a.caminho}
            </summary>
            <div className="min-w-0 max-w-full pb-3 pt-1">
              {a.conteudo === null ? (
                <p className="break-words text-sm text-fg-3">
                  Arquivo grande demais para mostrar aqui ({a.bytes} bytes). Veja no repositório: {a.caminho}
                </p>
              ) : (
                <CodigoDestacado codigo={a.conteudo} linguagem={a.linguagem} nomeArquivo={a.caminho} />
              )}
            </div>
          </details>
        ))}
      </CardBody>
    </Card>
  );
}

/** Arquivos de um artefato pelo id (RLS decide o que aparece). */
export async function lerArquivos(artefatoId: string): Promise<Arquivo[]> {
  const supabase = await createClient();
  const { data, error } = await supabase
    .from("artefato_arquivos")
    .select("caminho, linguagem, conteudo, bytes")
    .eq("artefato_id", artefatoId)
    .order("caminho");
  if (error) throw error;
  return data ?? [];
}

/** Detalhe de uma skill ou de um workflow. Nome ausente no banco vira 404. */
export async function DetalheArtefato({ tipo, nome }: { tipo: Exclude<TipoArtefato, "agente">; nome: string }) {
  const supabase = await createClient();

  const { data: art, error } = await supabase
    .from("artefatos_ia")
    .select(
      "id, tipo, nome, time, origem, resumo, descricao, quando, gatilho, le, grava, formato, conteudo, caminho, estado, conferido_em",
    )
    .eq("tipo", tipo)
    .eq("nome", nome)
    .maybeSingle();
  // Erro real vira error boundary; 404 e so "esse artefato nao existe".
  if (error) throw error;
  if (!art) notFound();

  const [arquivos, chamadoresRes, usadosRes] = await Promise.all([
    lerArquivos(art.id),
    supabase
      .from("artefato_relacoes")
      .select("origem:artefatos_ia!artefato_relacoes_origem_id_fkey(tipo, nome, resumo, estado)")
      .eq("destino_id", art.id),
    supabase
      .from("artefato_relacoes")
      .select("destino:artefatos_ia!artefato_relacoes_destino_id_fkey(tipo, nome, resumo, estado)")
      .eq("origem_id", art.id),
  ]);
  if (chamadoresRes.error) throw chamadoresRes.error;
  if (usadosRes.error) throw usadosRes.error;
  const chamadores = vizinhosVisiveis((chamadoresRes.data ?? []).map((r) => r.origem));
  const usados = vizinhosVisiveis((usadosRes.data ?? []).map((r) => r.destino));

  const estado = ESTADO[art.estado as keyof typeof ESTADO] ?? { rotulo: art.estado, tom: "neutral" as const };
  const rotulo = ROTULO_TIPO[tipo];
  // Campo que o artefato deixou em branco some da tela.
  const quandoEChamado = textoDeclarado(tipo === "skill" ? art.quando : art.gatilho);
  const le = textoDeclarado(art.le);
  const grava = textoDeclarado(art.grava);

  return (
    <div className="mx-auto flex min-w-0 max-w-4xl flex-col gap-6">
      <div className="flex flex-col gap-3">
        <Link
          href={`/agentes?tipo=${tipo}`}
          className="inline-flex min-h-11 w-fit items-center gap-1.5 text-sm font-semibold text-fg-3 transition-colors hover:text-fg-1 md:min-h-0"
        >
          <ArrowLeft size={14} aria-hidden="true" /> Voltar para {rotulo.plural.toLowerCase()}
        </Link>
        <div className="flex flex-wrap items-start justify-between gap-3">
          <div className="min-w-0">
            <h1 className="break-words font-display text-2xl font-bold text-fg-1">
              {nomeAmigavel(art.nome, art.time)}
            </h1>
            <p className="mt-1 break-all font-mono text-xs text-fg-4">{art.nome}</p>
            {/* Sem descricao propria (ou igual ao resumo) o card "O que faz" ja diz isso: nao repete. */}
            {art.descricao && art.descricao !== art.resumo && (
              <p className="mt-1 break-words text-sm text-fg-3">{art.resumo}</p>
            )}
          </div>
          <Pill tone={estado.tom} dot>
            {estado.rotulo}
          </Pill>
        </div>
        <p className="break-words text-xs text-fg-3">
          Time: {art.time} · Origem: {rotuloOrigem(art.origem)} · Conferido <TempoRelativo iso={art.conferido_em} />
        </p>
      </div>

      <Card>
        <CardHeader>
          <CardTitle>O que faz</CardTitle>
        </CardHeader>
        <CardBody>
          <p className="whitespace-pre-line break-words text-sm text-fg-2">{art.descricao ?? art.resumo}</p>
        </CardBody>
      </Card>

      {quandoEChamado && (
        <Card>
          <CardHeader>
            <CardTitle>Quando é chamado</CardTitle>
          </CardHeader>
          <CardBody>
            <p className="whitespace-pre-line break-words text-sm text-fg-2">
              {tipo === "skill" ? quandoEChamado : `Gatilho: ${quandoEChamado}`}
            </p>
          </CardBody>
        </Card>
      )}

      <Card>
        <CardHeader>
          <CardTitle>Quem chama</CardTitle>
        </CardHeader>
        <CardBody>
          {chamadores.length > 0 ? (
            <ListaVizinhos itens={chamadores} />
          ) : (
            <p className="text-sm text-fg-3">
              {tipo === "workflow"
                ? quandoEChamado
                  ? "Roda sozinho pelo gatilho acima."
                  : "Roda sozinho."
                : "Você chama direto pelo nome da skill no Codex."}
            </p>
          )}
        </CardBody>
      </Card>

      {usados.length > 0 && (
        <Card>
          <CardHeader>
            <CardTitle>O que usa</CardTitle>
          </CardHeader>
          <CardBody>
            <ListaVizinhos itens={usados} />
          </CardBody>
        </Card>
      )}

      {(le || grava) && (
        <Card>
          <CardHeader>
            <CardTitle>O que lê e grava</CardTitle>
          </CardHeader>
          <CardBody className="flex flex-col gap-3">
            {le && (
              <div>
                <h3 className={ROTULO_SECAO}>Lê</h3>
                <p className="mt-1 whitespace-pre-line break-words text-sm text-fg-2">{le}</p>
              </div>
            )}
            {grava && (
              <div>
                <h3 className={ROTULO_SECAO}>Grava</h3>
                <p className="mt-1 whitespace-pre-line break-words text-sm text-fg-2">{grava}</p>
              </div>
            )}
          </CardBody>
        </Card>
      )}

      <InstrucoesCompletas>
        <CardConteudo conteudo={art.conteudo} formato={art.formato} caminho={art.caminho} />
        <CardArquivos arquivos={arquivos} />
      </InstrucoesCompletas>
    </div>
  );
}
