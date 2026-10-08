"use client";

import { useEffect, useState } from "react";
import { AlertTriangle, ArrowUpRight, FileText, Loader2, Search } from "lucide-react";
import { cn } from "@/lib/utils";
import { Card } from "@/components/ui/Card";
import { createClient } from "@/lib/supabase/client";
import { buscarOrgDocumentos, getOrgDocumentoTexto } from "@/lib/organograma/consultas";
import {
  agruparPorTipo,
  contarPorTipo,
  deveBuscarDocumentos,
  filtrarDocumentos,
  formatarTamanhoKB,
  rotuloEspecialista,
  TIPO_ORDEM,
  TIPO_ROTULO,
} from "@/lib/organograma/documentos";
import type { OrgDocumento, OrgDocumentoResumo, OrgDocumentoTipo } from "@/lib/organograma/tipos";
import { Markdown } from "@/components/ui/Markdown";
import { TituloSecao } from "./TituloSecao";

const DEBOUNCE_MS = 300;

type EstadoBusca =
  | { status: "ocioso" }
  | { status: "carregando" }
  | { status: "erro"; mensagem: string }
  | { status: "ok"; caminhos: string[] };

/** Loading DERIVADO, mesmo padrão de usePacote() em PacoteCargo.tsx: enquanto
 * o resultado em memória não é deste `termo`, está carregando. */
function useBuscaDocumentos(termo: string): EstadoBusca {
  const ativa = deveBuscarDocumentos(termo);
  const [resultado, setResultado] = useState<{
    termo: string;
    caminhos: string[] | null;
    erro: string | null;
  } | null>(null);

  useEffect(() => {
    if (!ativa) return;
    let cancelado = false;
    const client = createClient();
    buscarOrgDocumentos(client, termo)
      .then((caminhos) => {
        if (!cancelado) setResultado({ termo, caminhos, erro: null });
      })
      .catch((err: unknown) => {
        if (!cancelado) {
          setResultado({
            termo,
            caminhos: null,
            erro: err instanceof Error ? err.message : "Erro ao buscar documentos.",
          });
        }
      });
    return () => {
      cancelado = true;
    };
  }, [termo, ativa]);

  if (!ativa) return { status: "ocioso" };
  if (!resultado || resultado.termo !== termo) return { status: "carregando" };
  if (resultado.erro || !resultado.caminhos) {
    return { status: "erro", mensagem: resultado.erro ?? "Erro ao buscar documentos." };
  }
  return { status: "ok", caminhos: resultado.caminhos };
}

type EstadoTexto =
  | { status: "vazio" }
  | { status: "carregando" }
  | { status: "erro"; mensagem: string }
  | { status: "ok"; documento: OrgDocumento };

function useDocumentoTexto(caminho: string | null): EstadoTexto {
  const [resultado, setResultado] = useState<{
    caminho: string;
    documento: OrgDocumento | null;
    erro: string | null;
  } | null>(null);

  useEffect(() => {
    if (!caminho) return;
    let cancelado = false;
    const client = createClient();
    getOrgDocumentoTexto(client, caminho)
      .then((documento) => {
        if (cancelado) return;
        setResultado({
          caminho,
          documento,
          erro: documento ? null : "Documento listado, mas não achado em v_org_documento.",
        });
      })
      .catch((err: unknown) => {
        if (cancelado) return;
        setResultado({
          caminho,
          documento: null,
          erro: err instanceof Error ? err.message : "Erro ao carregar o documento.",
        });
      });
    return () => {
      cancelado = true;
    };
  }, [caminho]);

  if (!caminho) return { status: "vazio" };
  if (!resultado || resultado.caminho !== caminho) return { status: "carregando" };
  if (resultado.erro || !resultado.documento) {
    return { status: "erro", mensagem: resultado.erro ?? "Erro ao carregar o documento." };
  }
  return { status: "ok", documento: resultado.documento };
}

export function Documentos({
  documentos,
  documentoAlvo,
  onDocumentoAlvoConsumido,
  onFocarCargo,
}: {
  documentos: OrgDocumentoResumo[];
  /** Caminho pra abrir de cara — vem de "Dossiê e auditoria na aba Documentos"
   * do PacoteCargo, quando o usuário troca de vista pra cá. */
  documentoAlvo?: string | null;
  onDocumentoAlvoConsumido?: () => void;
  onFocarCargo?: (cargoSlug: string) => void;
}) {
  const [termo, setTermo] = useState("");
  const [termoDebounced, setTermoDebounced] = useState("");
  const [tipo, setTipo] = useState<OrgDocumentoTipo | null>(null);
  const [caminhoAberto, setCaminhoAberto] = useState<string | null>(null);

  useEffect(() => {
    const t = setTimeout(() => setTermoDebounced(termo), DEBOUNCE_MS);
    return () => clearTimeout(t);
  }, [termo]);

  // Ajuste de estado durante a renderização (padrão oficial do React, igual
  // ao chaveFoco de PacoteCargo.tsx): abre o documento-alvo assim que ele
  // chega via prop, sem reabrir depois que o usuário navegar pra outro.
  const [alvoAnterior, setAlvoAnterior] = useState<string | null>(null);
  if ((documentoAlvo ?? null) !== alvoAnterior) {
    setAlvoAnterior(documentoAlvo ?? null);
    if (documentoAlvo) setCaminhoAberto(documentoAlvo);
  }
  // Notifica o pai (fora da renderização) só depois do estado local já ter
  // aplicado o alvo — mesma separação leitura/efeito do PacoteCargo.
  useEffect(() => {
    if (documentoAlvo && caminhoAberto === documentoAlvo) onDocumentoAlvoConsumido?.();
  }, [documentoAlvo, caminhoAberto, onDocumentoAlvoConsumido]);

  const busca = useBuscaDocumentos(termoDebounced);
  const buscaAtiva = busca.status !== "ocioso";
  const contagens = contarPorTipo(documentos);

  const visiveis =
    buscaAtiva && busca.status !== "ok"
      ? null // busca em curso ou com erro: lista fica escondida, ver mensagem abaixo
      : filtrarDocumentos(documentos, {
          tipo,
          caminhosBusca: busca.status === "ok" ? busca.caminhos : null,
        });
  const grupos = visiveis ? agruparPorTipo(visiveis) : [];

  const textoAberto = useDocumentoTexto(caminhoAberto);
  const resumoAberto = documentos.find((d) => d.caminho === caminhoAberto) ?? null;

  return (
    <div className="grid grid-cols-1 gap-5 lg:grid-cols-[340px_1fr] lg:items-start">
      <div className="flex flex-col gap-3">
        <p className="text-sm text-fg-3">
          Documentos gerados nesta frente, gravados no banco (
          <span className="tabular-nums">{documentos.length}</span> ao todo), inclusive o conhecimento
          destilado dos especialistas. Citação literal só curta, com a referência; livro e transcrição
          integral ficam de fora por direito autoral.
        </p>

        <div className="relative">
          <Search size={16} className="pointer-events-none absolute left-3 top-1/2 -translate-y-1/2 text-fg-3" />
          <input
            type="search"
            value={termo}
            onChange={(e) => setTermo(e.target.value)}
            placeholder="Buscar em título ou texto..."
            aria-label="Buscar documento por título ou texto"
            className="h-11 w-full rounded-md border border-borda bg-bg pl-9 pr-3 text-sm outline-none placeholder:text-fg-4 focus:border-acento"
          />
        </div>

        <div className="flex flex-wrap gap-1.5">
          <button
            type="button"
            onClick={() => setTipo(null)}
            className={cn(
              "rounded-full border px-2.5 py-1 text-xs font-medium",
              tipo === null
                ? "border-acento bg-acento-suave text-acento-texto"
                : "border-borda-suave text-fg-3 hover:text-fg-1",
            )}
          >
            Todos <span className="tabular-nums">{documentos.length}</span>
          </button>
          {TIPO_ORDEM.filter((t) => contagens[t] > 0).map((t) => (
            <button
              key={t}
              type="button"
              onClick={() => setTipo((atual) => (atual === t ? null : t))}
              className={cn(
                "rounded-full border px-2.5 py-1 text-xs font-medium",
                tipo === t
                  ? "border-acento bg-acento-suave text-acento-texto"
                  : "border-borda-suave text-fg-3 hover:text-fg-1",
              )}
            >
              {TIPO_ROTULO[t]} <span className="tabular-nums">{contagens[t]}</span>
            </button>
          ))}
        </div>

        <div aria-live="polite" className="min-h-[1.25rem] text-xs text-fg-3">
          {busca.status === "carregando" && (
            <span className="inline-flex items-center gap-1.5">
              <Loader2 size={12} className="animate-spin" /> Buscando &quot;{termoDebounced}&quot;...
            </span>
          )}
          {busca.status === "erro" && (
            <span className="inline-flex items-center gap-1.5 text-erro">
              <AlertTriangle size={12} /> {busca.mensagem}
            </span>
          )}
          {busca.status === "ok" && visiveis && (
            <span>
              {visiveis.length} documento{visiveis.length === 1 ? "" : "s"} com &quot;{termoDebounced}&quot;
              {tipo && visiveis.length !== busca.caminhos.length && (
                <> neste filtro ({busca.caminhos.length} em todos os tipos)</>
              )}
            </span>
          )}
          {!buscaAtiva && termo.trim().length > 0 && (
            <span>Digite ao menos 3 letras pra buscar.</span>
          )}
        </div>

        <div className="flex flex-col gap-3 lg:max-h-[65vh] lg:overflow-y-auto lg:pr-1">
          {visiveis && visiveis.length === 0 && (
            <p className="rounded-md bg-bg-sutil px-3 py-4 text-center text-xs text-fg-3">
              {buscaAtiva
                ? `Nenhum documento com "${termoDebounced}".`
                : "Nenhum documento neste filtro."}
            </p>
          )}
          {grupos.map((grupo) => (
            <div key={grupo.tipo}>
              <TituloSecao className="!mt-0 !mb-1">
                {grupo.rotulo} · {grupo.documentos.length}
              </TituloSecao>
              <ul className="flex flex-col gap-1">
                {grupo.documentos.map((d) => (
                  <li key={d.caminho}>
                    <button
                      type="button"
                      onClick={() => setCaminhoAberto(d.caminho)}
                      aria-current={d.caminho === caminhoAberto}
                      className={cn(
                        "flex w-full flex-col gap-0.5 rounded-md border px-3 py-2 text-left transition-colors",
                        d.caminho === caminhoAberto
                          ? "border-acento bg-acento-suave"
                          : "border-transparent bg-bg-sutil hover:border-borda-suave",
                      )}
                    >
                      <span className="flex items-start justify-between gap-2">
                        <span className="text-sm font-semibold text-fg-1">
                          {d.especialista && (
                            <span className="mr-1.5 rounded-full bg-bg-sutil px-2 py-0.5 text-[10.5px] font-semibold text-fg-2">
                              {rotuloEspecialista(d.especialista)}
                            </span>
                          )}
                          {d.titulo}
                        </span>
                        <span className="shrink-0 font-mono text-[10.5px] tabular-nums text-fg-3">
                          {formatarTamanhoKB(d.tamanho)}
                        </span>
                      </span>
                      {d.resumo && <span className="text-[11.5px] text-fg-3">{d.resumo}</span>}
                    </button>
                  </li>
                ))}
              </ul>
            </div>
          ))}
        </div>
      </div>

      <Card className="min-h-[16rem] p-4 md:p-5">
        {!resumoAberto ? (
          <div className="flex h-full flex-col items-center justify-center gap-2 py-16 text-center">
            <FileText size={24} className="text-fg-3" />
            <p className="text-sm text-fg-3">Escolha um documento na lista pra ler.</p>
          </div>
        ) : (
          <div className="flex flex-col gap-3">
            <header>
              <p className="text-[11px] font-semibold uppercase tracking-wide text-fg-3">
                {TIPO_ROTULO[resumoAberto.tipo]}
              </p>
              <h2 className="h4 mt-0.5">{resumoAberto.titulo}</h2>
              <div className="mt-1 flex flex-wrap items-center gap-2">
                <code className="font-mono rounded bg-bg-sutil px-1.5 py-0.5 text-[11px] text-fg-3">
                  {resumoAberto.caminho}
                </code>
                {resumoAberto.cargo_slug && (
                  <button
                    type="button"
                    onClick={() => onFocarCargo?.(resumoAberto.cargo_slug as string)}
                    className="inline-flex items-center gap-1 text-[11.5px] font-medium text-acento-texto underline-offset-2 hover:underline"
                  >
                    ver cargo <ArrowUpRight size={12} />
                  </button>
                )}
              </div>
            </header>

            {textoAberto.status === "carregando" && (
              <p className="flex items-center gap-2 text-sm text-fg-3">
                <Loader2 size={14} className="animate-spin" /> Carregando documento...
              </p>
            )}
            {textoAberto.status === "erro" && (
              <p className="flex items-center gap-2 rounded-md bg-erro-suave px-3 py-2 text-sm text-erro">
                <AlertTriangle size={14} /> {textoAberto.mensagem}
              </p>
            )}
            {textoAberto.status === "ok" && <Markdown source={textoAberto.documento.markdown} />}
          </div>
        )}
      </Card>
    </div>
  );
}
