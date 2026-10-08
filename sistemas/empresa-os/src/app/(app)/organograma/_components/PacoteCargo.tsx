"use client";

import { useEffect, useRef, useState } from "react";
import { AlertTriangle, ArrowUpRight, ChevronDown } from "lucide-react";
import { cn } from "@/lib/utils";
import { createClient } from "@/lib/supabase/client";
import { getOrgPacotePorCargo } from "@/lib/organograma/consultas";
import { Skeleton } from "@/components/ui/Skeleton";
import { Markdown } from "@/components/ui/Markdown";
import { TituloSecao } from "./TituloSecao";
import type { OrgDocumentoResumo, OrgNo, OrgPacote } from "@/lib/organograma/tipos";

/** Dossiê e auditoria do pacote (mesmo `pacote_slug`) — o dossiê, se tiver,
 * vem antes da auditoria; entre pares do mesmo tipo, o de menor `ordem`. */
function documentoDoPacote(
  documentos: OrgDocumentoResumo[],
  pacoteSlug: string,
): OrgDocumentoResumo | null {
  const candidatos = documentos
    .filter((d) => d.pacote_slug === pacoteSlug && (d.tipo === "dossie" || d.tipo === "auditoria"))
    .sort((a, b) => (a.tipo === b.tipo ? a.ordem - b.ordem : a.tipo === "dossie" ? -1 : 1));
  return candidatos[0] ?? null;
}

const NIVEL_LABEL: Record<string, string> = {
  junior: "júnior",
  pleno: "pleno",
  senior: "sênior",
  especialista: "especialista",
};

const NIVEL_CLASSE: Record<string, string> = {
  junior: "bg-info-suave text-info",
  pleno: "bg-acento-suave text-acento-texto",
  senior: "bg-acento text-fg-sobre-acento",
  especialista: "bg-fg-1 text-bg",
};

type Estado =
  | { status: "vazio" }
  | { status: "carregando" }
  | { status: "erro"; mensagem: string }
  | { status: "ok"; pacote: OrgPacote };

type Resultado = { slug: string; pacote: OrgPacote | null; erro: string | null };

/** Loading DERIVADO (nunca setState direto no corpo do efeito — só dentro do
 * .then()/.catch(), igual ao padrão de useDoc() em time-agentes/EntityDrawer.tsx):
 * enquanto o resultado em memória não for desta cargoSlug, está carregando. */
function usePacote(cargoSlug: string, temPacote: boolean): Estado {
  const [resultado, setResultado] = useState<Resultado | null>(null);

  useEffect(() => {
    if (!temPacote) return;
    let cancelado = false;
    const client = createClient();
    getOrgPacotePorCargo(client, cargoSlug)
      .then((pacote) => {
        if (cancelado) return;
        setResultado({
          slug: cargoSlug,
          pacote,
          erro: pacote ? null : "Pacote listado no cargo, mas não achado em v_org_pacote.",
        });
      })
      .catch((err: unknown) => {
        if (cancelado) return;
        setResultado({
          slug: cargoSlug,
          pacote: null,
          erro: err instanceof Error ? err.message : "Erro ao carregar o pacote.",
        });
      });
    return () => {
      cancelado = true;
    };
  }, [cargoSlug, temPacote]);

  if (!temPacote) return { status: "vazio" };
  if (!resultado || resultado.slug !== cargoSlug) return { status: "carregando" };
  if (resultado.erro || !resultado.pacote) return { status: "erro", mensagem: resultado.erro ?? "Erro ao carregar o pacote." };
  return { status: "ok", pacote: resultado.pacote };
}

export function PacoteCargo({
  no,
  apqc,
  focarPlaybookSlug,
  onFocado,
  documentos,
  onAbrirDocumento,
  onFocarCargo,
}: {
  no: OrgNo;
  apqc: Map<string, string>;
  focarPlaybookSlug?: string | null;
  onFocado?: () => void;
  documentos?: OrgDocumentoResumo[];
  onAbrirDocumento?: (caminho: string) => void;
  onFocarCargo?: (cargoSlug: string) => void;
}) {
  const estado = usePacote(no.slug, !!no.pacote);
  const documentoPacote = no.pacote
    ? documentoDoPacote(documentos ?? [], no.pacote.slug)
    : null;
  const [abertos, setAbertos] = useState<Set<string>>(new Set());
  const containerRef = useRef<HTMLDivElement>(null);

  // Ajuste de estado durante a renderização (padrão oficial do React —
  // "Adjusting state when a prop changes" — comparação com estado, nunca
  // ref, pra reagir à mudança de prop sem efeito extra nem setState-in-effect).
  // Abre o playbook-alvo assim que ele aparece no pacote carregado; não reabre
  // depois que o usuário fechar o <details> na mão.
  // A chave só existe com o pacote JÁ carregado: o alvo chega no mesmo clique que troca o cargo,
  // quando o pacote ainda está "carregando"; comparar só o slug consumiria o alvo cedo demais.
  const chaveFoco = focarPlaybookSlug && estado.status === "ok" ? focarPlaybookSlug : null;
  const [focarAnterior, setFocarAnterior] = useState<string | null | undefined>(undefined);
  if (chaveFoco !== focarAnterior) {
    setFocarAnterior(chaveFoco);
    if (chaveFoco && estado.status === "ok" && estado.pacote.playbooks.some((pb) => pb.slug === chaveFoco)) {
      const slug = chaveFoco;
      setAbertos((prev) => {
        if (prev.has(slug)) return prev;
        const novo = new Set(prev);
        novo.add(slug);
        return novo;
      });
    }
  }

  // Efeito só de sistema externo (rolar o DOM até o playbook) — nenhum
  // setState local aqui, só a notificação pro pai (onFocado) consumir o comando.
  useEffect(() => {
    if (!focarPlaybookSlug || !abertos.has(focarPlaybookSlug)) return;
    // onFocado DEPOIS de rolar: chamado antes, o pai zera o alvo, o efeito limpa e cancela o frame.
    const id = requestAnimationFrame(() => {
      containerRef.current
        ?.querySelector<HTMLElement>(`[data-playbook="${focarPlaybookSlug}"]`)
        ?.scrollIntoView({ behavior: "smooth", block: "start" });
      onFocado?.();
    });
    return () => cancelAnimationFrame(id);
  }, [focarPlaybookSlug, abertos, onFocado]);

  if (!no.pacote) return null;

  return (
    <div
      ref={containerRef}
      className="flex flex-col gap-3 rounded-lg border border-borda border-t-[3px] border-t-ok bg-bg-elevada p-4 shadow-[var(--sombra-sm)] md:p-5"
    >
      <header className="flex flex-wrap items-start justify-between gap-3">
        <div>
          <p className="text-[11px] font-semibold uppercase tracking-wide text-ok">
            Pacote do cargo · v{no.pacote.versao}
            {no.pacote.data && ` · ${no.pacote.data.split("-").reverse().join("/")}`}
          </p>
          <h2 className="h4 mt-0.5">{no.titulo}: o que a pessoa precisa saber</h2>
        </div>
        {documentoPacote && (
          <button
            type="button"
            onClick={() => onAbrirDocumento?.(documentoPacote.caminho)}
            className="inline-flex shrink-0 items-center gap-1 text-[12px] font-medium text-acento-texto underline-offset-2 hover:underline"
          >
            Dossiê e auditoria na aba Documentos <ArrowUpRight size={12} />
          </button>
        )}
      </header>

      {estado.status === "carregando" && (
        <div aria-busy="true" aria-label="Carregando pacote..." className="flex flex-col gap-3">
          <Skeleton className="h-4 w-2/3" />
          <div className="flex flex-wrap gap-1.5">
            {Array.from({ length: 6 }).map((_, i) => (
              <Skeleton key={i} className="h-6 w-24 rounded-full" />
            ))}
          </div>
          {Array.from({ length: 8 }).map((_, i) => (
            <Skeleton key={i} className="h-10 w-full" />
          ))}
        </div>
      )}

      {estado.status === "erro" && (
        <p className="flex items-center gap-2 rounded-md bg-erro-suave px-3 py-2 text-sm text-erro">
          <AlertTriangle size={14} /> {estado.mensagem}
        </p>
      )}

      {estado.status === "ok" && (
        <PacoteConteudo
          pacote={estado.pacote}
          apqc={apqc}
          abertos={abertos}
          onToggle={(slug, aberto) =>
            setAbertos((prev) => {
              const novo = new Set(prev);
              if (aberto) novo.add(slug);
              else novo.delete(slug);
              return novo;
            })
          }
          onFocarCargo={onFocarCargo}
        />
      )}
    </div>
  );
}

function PacoteConteudo({
  pacote,
  apqc,
  abertos,
  onToggle,
  onFocarCargo,
}: {
  pacote: OrgPacote;
  apqc: Map<string, string>;
  abertos: Set<string>;
  onToggle: (slug: string, aberto: boolean) => void;
  onFocarCargo?: (cargoSlug: string) => void;
}) {
  const m = pacote.marcas;
  const auditoriaOk = /^APPROVED/i.test(pacote.auditoria ?? "");

  return (
    <>
      <p className="max-w-[80ch] text-sm text-fg-3">
        Aprovação do dono: {pacote.aprovou ?? "pendente"}.
        {pacote.modelou && <> Modelou: {pacote.modelou}.</>}
        {pacote.validade && <> Validade: {pacote.validade}.</>}
        {pacote.pasta && <> Hoje o pacote mora em <code className="font-mono">{pacote.pasta}</code>.</>}
      </p>

      <div className="flex flex-wrap gap-1.5">
        <span className="rounded-full bg-bg-sutil px-2.5 py-0.5 text-xs tabular-nums text-fg-2">
          {pacote.playbooks.length} playbooks
        </span>
        <span className="rounded-full bg-ok-suave px-2.5 py-0.5 text-xs font-semibold text-ok">
          {m.VERIFIED} lidos na fonte
        </span>
        <span className="rounded-full bg-alerta-suave px-2.5 py-0.5 text-xs font-semibold text-alerta">
          {m.SNIPPET} secundários
        </span>
        <span className="rounded-full bg-info-suave px-2.5 py-0.5 text-xs font-semibold text-info">
          {m.premissa} premissas
        </span>
        <span className="rounded-full border border-dashed border-alerta px-2.5 py-0.5 text-xs font-semibold text-alerta">
          {m.a_modelar} a modelar
        </span>
        {pacote.auditoria && (
          <span
            className={cn(
              "rounded-full px-2.5 py-0.5 text-xs font-semibold",
              auditoriaOk ? "bg-ok-suave text-ok" : "bg-alerta-suave text-alerta",
            )}
          >
            auditoria: {pacote.auditoria.replace(/^#+\s*/, "")}
          </span>
        )}
      </div>

      <div id="pacote-playbooks" className="scroll-mt-28">
        <h3 className="h5 !mt-6 !mb-2">
          Playbooks ({pacote.playbooks.length}): 1 por processo, do júnior ao especialista
        </h3>
        <div className="flex flex-col gap-1.5">
          {pacote.playbooks.map((pb) => {
            const meta = [
              pb.frequencia,
              pb.horas_texto && pb.horas_texto !== "a_modelar" ? `${pb.horas_texto} h/mês` : null,
              pb.apqc ? `APQC ${pb.apqc}` : null,
            ]
              .filter(Boolean)
              .join(" · ");
            return (
              <details
                key={pb.slug}
                data-playbook={pb.slug}
                open={abertos.has(pb.slug)}
                onToggle={(e) => onToggle(pb.slug, e.currentTarget.open)}
                className="group rounded-md border border-borda-suave"
              >
                <summary className="grid cursor-pointer list-none grid-cols-[7.5rem_1fr_auto] items-center gap-3 px-3 py-2 text-sm font-semibold text-fg-1">
                  <span className="justify-self-start">
                    {pb.nivel_minimo && (
                      <span
                        className={cn(
                          "rounded-full px-2 py-0.5 text-[11px] font-semibold uppercase tracking-wide",
                          NIVEL_CLASSE[pb.nivel_minimo] ?? "bg-bg-sutil text-fg-3",
                        )}
                      >
                        {NIVEL_LABEL[pb.nivel_minimo] ?? pb.nivel_minimo}
                      </span>
                    )}
                  </span>
                  <span className="min-w-0">{pb.processo}</span>
                  <span className="flex items-center gap-2">
                    <span
                      className="max-w-[28rem] truncate text-right font-mono text-[12px] font-normal text-fg-3"
                      title={meta}
                    >
                      {meta}
                    </span>
                    <ChevronDown
                      size={16}
                      className="shrink-0 text-fg-3 transition-transform group-open:rotate-180"
                    />
                  </span>
                </summary>
                <div className="border-t border-borda-suave p-3">
                  {pb.papeis.length > 0 && (
                    <div className="mb-3">
                      <TituloSecao as="h4" className="!mt-0">
                        Quem atua neste playbook
                      </TituloSecao>
                      <ul className="flex flex-col gap-1">
                        {pb.papeis.map((papel, i) => (
                          <li key={i} className="flex flex-wrap items-baseline gap-1.5 text-sm">
                            <button
                              type="button"
                              onClick={() => onFocarCargo?.(papel.cargo_slug)}
                              className="font-semibold text-acento-texto underline-offset-2 hover:underline"
                            >
                              {papel.cargo_titulo}
                            </button>
                            <span className="text-fg-3">· {papel.papel}</span>
                          </li>
                        ))}
                      </ul>
                    </div>
                  )}
                  <Markdown source={pb.markdown} apqc={apqc} />
                </div>
              </details>
            );
          })}
        </div>
      </div>

      <div id="pacote-partes" className="scroll-mt-28">
        <h3 className="h5 !mt-6 !mb-2">As partes do pacote</h3>
        <div className="flex flex-col gap-1.5">
          {pacote.secoes.map((s) => (
            <details key={s.titulo} className="group rounded-md border border-borda-suave">
              <summary className="flex cursor-pointer list-none items-center justify-between gap-3 px-3 py-2 text-sm font-semibold text-fg-1">
                <span>
                  {/* crase do markdown vira <code>, sem mudar o texto */}
                  {s.titulo.split(/`([^`]+)`/).map((parte, i) =>
                    i % 2 === 1 ? (
                      <code key={i} className="rounded bg-bg-sutil px-1 font-mono text-[12.5px] font-normal">
                        {parte}
                      </code>
                    ) : (
                      parte
                    ),
                  )}
                </span>
                <ChevronDown size={16} className="shrink-0 text-fg-3 transition-transform group-open:rotate-180" />
              </summary>
              <div className="border-t border-borda-suave p-3">
                <Markdown source={s.markdown} apqc={apqc} />
              </div>
            </details>
          ))}
          {pacote.casos_md && (
            <details className="group rounded-md border border-borda-suave">
              <summary className="flex cursor-pointer list-none items-center justify-between gap-3 px-3 py-2 text-sm font-semibold text-fg-1">
                <span>Roteiro de entrevista e casos reais</span>
                <ChevronDown size={16} className="shrink-0 text-fg-3 transition-transform group-open:rotate-180" />
              </summary>
              <div className="border-t border-borda-suave p-3">
                <Markdown source={pacote.casos_md} apqc={apqc} />
              </div>
            </details>
          )}
        </div>
      </div>
    </>
  );
}
