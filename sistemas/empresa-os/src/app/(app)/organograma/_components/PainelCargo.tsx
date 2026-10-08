"use client";

import { useEffect, useState } from "react";
import { AlertTriangle, ArrowUpRight, ChevronDown } from "lucide-react";
import { Card } from "@/components/ui/Card";
import { Pill } from "@/components/ui/Pill";
import { Skeleton } from "@/components/ui/Skeleton";
import { rotuloOcupacao } from "@/lib/organograma/ocupacao";
import type { Ocupante } from "@/lib/organograma/ocupacao";
import { createClient } from "@/lib/supabase/client";
import { getOrgPlaybooksPorCargo } from "@/lib/organograma/consultas";
import { rotuloApqc } from "@/lib/organograma/arvore";
import { apqcSemNotas, documentosDoCargo, fatosCargo, ondaDoCargo } from "@/lib/organograma/cargo";
import { TIPO_ROTULO } from "@/lib/organograma/documentos";
import type { OrgCargoPlaybook, OrgDocumentoResumo, OrgNo, OrgOnda, OrgSalario } from "@/lib/organograma/tipos";
import { TituloSecao } from "./TituloSecao";

const brl = (v: number | null) => (v == null ? "—" : Math.round(v).toLocaleString("pt-BR"));

/** Regra da memória de trabalho (Miller/Cowan): até 4 itens abertos de cara,
 * resto atrás de 1 clique — evita parede de texto no telão de Workshop pra
 * cargo com muito documento ou muito playbook (ex. CHRO atua em 18). */
const LIMITE_ABERTO = 4;

function faixaSalario(s: OrgSalario): string {
  const cur = s.moeda === "USD" ? "US$" : "R$";
  if (s.minimo != null || s.maximo != null) {
    const base = `${cur} ${brl(s.minimo)} a ${brl(s.maximo)}`;
    return s.mediana != null ? `${base} · mediana ${brl(s.mediana)}` : base;
  }
  return `${cur} ${brl(s.mediana)} (mediana)`;
}

function SecaoSalario({ no }: { no: OrgNo }) {
  if (no.tipo === "area") return null;
  if (no.salarios.length === 0 && !no.salario_nota) {
    return (
      <div id="cargo-salario" className="scroll-mt-28">
        <TituloSecao className="!mt-0">Salário de mercado</TituloSecao>
        <p className="text-sm text-fg-3">Sem pesquisa de salário pra este cargo ainda.</p>
      </div>
    );
  }
  return (
    <div id="cargo-salario" className="scroll-mt-28">
      <TituloSecao className="!mt-0">Salário de mercado (mensal)</TituloSecao>
      {no.salario_proxy && (
        <p className="mb-1.5 text-xs text-fg-3">
          Proxy: pesquisa de &quot;{no.salario_proxy}&quot;, não o cargo exato.
        </p>
      )}
      {no.salarios.length === 0 ? (
        <p className="text-sm text-fg-3">{no.salario_nota}</p>
      ) : (
        <>
          <ul className="flex flex-col gap-1.5">
            {no.salarios.map((s, i) => (
              <li key={i} className="rounded-md bg-bg-sutil px-3 py-2">
                <p className="text-sm font-semibold text-fg-1">{faixaSalario(s)}</p>
                <p className="text-xs text-fg-3">
                  {s.cargo_pesquisado}
                  {s.nivel ? ` · nível ${s.nivel}` : ""}
                  {s.auditoria === "secundaria" && " · fonte secundária (blog ou agregador sem metodologia)"}
                  {" · "}
                  <a
                    href={s.url}
                    target="_blank"
                    rel="noopener noreferrer"
                    className="text-acento-texto underline underline-offset-2"
                  >
                    {s.fonte}
                  </a>
                </p>
              </li>
            ))}
          </ul>
          <p className="mt-1.5 text-[12px] text-fg-3">
            salario.com.br e Catho misturam todos os portes (mediana baixa); o sênior de uma empresa de 200
            tende ao teto da faixa. Robert Half mostra do percentil 25 ao 75, não mínimo e máximo. Valor em
            US$ é mercado dos EUA, sem equivalente BR.
          </p>
        </>
      )}
    </div>
  );
}

function BlocoFatos({ no }: { no: OrgNo }) {
  const fatos = fatosCargo(no);
  if (fatos.length === 0) return null;
  return (
    <div className="flex flex-wrap gap-1.5">
      {fatos.map((f) => (
        <span key={f.rotulo} className="rounded-full bg-bg-sutil px-2.5 py-1 text-xs text-fg-2">
          <span className="font-semibold text-fg-1">{f.rotulo}:</span> {f.valor}
        </span>
      ))}
    </div>
  );
}

function SecaoOnda({ ondas, no, onIrParaFluxo }: { ondas: OrgOnda[]; no: OrgNo; onIrParaFluxo?: () => void }) {
  if (no.tipo === "area") return null;
  const onda = ondaDoCargo(ondas, no.slug);
  if (!onda) return null;
  return (
    <p className="text-sm text-fg-2">
      Formado na onda <span className="font-mono text-acento-texto">{onda.codigo}</span>: {onda.time}
      {onIrParaFluxo && (
        <button
          type="button"
          onClick={onIrParaFluxo}
          className="ml-1.5 inline-flex items-center gap-1 text-[12px] font-medium text-acento-texto underline-offset-2 hover:underline"
        >
          ver no fluxo e ondas <ArrowUpRight size={12} />
        </button>
      )}
    </p>
  );
}

function SecaoDocumentosCargo({
  no,
  documentos,
  onAbrirDocumento,
}: {
  no: OrgNo;
  documentos: OrgDocumentoResumo[];
  onAbrirDocumento?: (caminho: string) => void;
}) {
  if (no.tipo === "area") return null;
  const docs = documentosDoCargo(documentos, no.slug);
  if (docs.length === 0) return null;
  // Fechado por padrão quando passa do limite de memória de trabalho (regra
  // da casa: ≤4 itens visíveis de cara, resto atrás de 1 clique) — telão de
  // Workshop não pode virar parede de texto pra cargo com muito documento.
  return (
    <details open={docs.length <= LIMITE_ABERTO} className="group rounded-md border border-borda-suave">
      <summary className="flex cursor-pointer list-none items-center justify-between gap-3 px-3 py-2 text-[12px] font-semibold uppercase tracking-wide text-fg-3">
        <span>Documentos deste cargo · {docs.length}</span>
        <ChevronDown size={16} className="shrink-0 text-fg-3 transition-transform group-open:rotate-180" />
      </summary>
      <ul className="flex flex-col gap-1.5 border-t border-borda-suave p-3">
        {docs.map((d) => (
          <li key={d.caminho}>
            <button
              type="button"
              onClick={() => onAbrirDocumento?.(d.caminho)}
              className="flex w-full items-baseline justify-between gap-2 rounded-md bg-bg-sutil px-3 py-1.5 text-left hover:bg-acento-suave"
            >
              <span className="text-sm text-fg-1">{d.titulo}</span>
              <span className="shrink-0 text-[12px] text-fg-3">{TIPO_ROTULO[d.tipo]}</span>
            </button>
          </li>
        ))}
      </ul>
    </details>
  );
}

type EstadoPlaybooksCargo =
  | { status: "vazio" }
  | { status: "carregando" }
  | { status: "erro"; mensagem: string }
  | { status: "ok"; playbooks: OrgCargoPlaybook[] };

/** Loading DERIVADO, mesmo padrão de usePacote() em PacoteCargo.tsx: enquanto
 * o resultado em memória não for deste cargoSlug, está carregando. `ativo`
 * fica falso pro dono do pacote (o próprio pacote já mostra os playbooks
 * embaixo) e pra área (não tem cargo_slug). */
function usePlaybooksDoCargo(cargoSlug: string, ativo: boolean): EstadoPlaybooksCargo {
  const [resultado, setResultado] = useState<{
    slug: string;
    playbooks: OrgCargoPlaybook[] | null;
    erro: string | null;
  } | null>(null);

  useEffect(() => {
    if (!ativo) return;
    let cancelado = false;
    const client = createClient();
    getOrgPlaybooksPorCargo(client, cargoSlug)
      .then((playbooks) => {
        if (!cancelado) setResultado({ slug: cargoSlug, playbooks, erro: null });
      })
      .catch((err: unknown) => {
        if (!cancelado) {
          setResultado({
            slug: cargoSlug,
            playbooks: null,
            erro: err instanceof Error ? err.message : "Erro ao carregar os playbooks.",
          });
        }
      });
    return () => {
      cancelado = true;
    };
  }, [cargoSlug, ativo]);

  if (!ativo) return { status: "vazio" };
  if (!resultado || resultado.slug !== cargoSlug) return { status: "carregando" };
  if (resultado.erro || !resultado.playbooks) {
    return { status: "erro", mensagem: resultado.erro ?? "Erro ao carregar os playbooks." };
  }
  return { status: "ok", playbooks: resultado.playbooks };
}

function SecaoPlaybooksDoCargo({
  no,
  onAbrirPlaybook,
}: {
  no: OrgNo;
  onAbrirPlaybook?: (pacoteSlug: string, slug: string) => void;
}) {
  // Dono de pacote: os playbooks já aparecem no pacote logo abaixo — evita
  // buscar e repetir a mesma lista aqui (pedido explícito da spec).
  const ativo = no.tipo !== "area" && !no.pacote;
  const estado = usePlaybooksDoCargo(no.slug, ativo);

  if (!ativo) return null;
  if (estado.status === "vazio") return null;
  // Nada modelado ainda pra este cargo: omite a seção (mesmo padrão de
  // "esconde se vazio" da SecaoDocumentosCargo) em vez de ocupar espaço com
  // "0 playbooks" — o painel já tem seção de sobra pra cargo cheio.
  if (estado.status === "ok" && estado.playbooks.length === 0) return null;
  const aberto = estado.status !== "ok" || estado.playbooks.length <= LIMITE_ABERTO;

  return (
    <details open={aberto} className="group rounded-md border border-borda-suave">
      <summary className="flex cursor-pointer list-none items-center justify-between gap-3 px-3 py-2 text-[12px] font-semibold uppercase tracking-wide text-fg-3">
        <span>Playbooks em que atua{estado.status === "ok" ? ` · ${estado.playbooks.length}` : ""}</span>
        <ChevronDown size={16} className="shrink-0 text-fg-3 transition-transform group-open:rotate-180" />
      </summary>
      <div className="border-t border-borda-suave p-3">
        {estado.status === "carregando" && (
          <div aria-busy="true" aria-label="Carregando playbooks..." className="flex flex-col gap-2">
            {Array.from({ length: 3 }).map((_, i) => (
              <Skeleton key={i} className="h-8 w-full" />
            ))}
          </div>
        )}
        {estado.status === "erro" && (
          <p className="flex items-center gap-2 rounded-md bg-erro-suave px-3 py-2 text-sm text-erro">
            <AlertTriangle size={14} /> {estado.mensagem}
          </p>
        )}
        {estado.status === "ok" && (
          <ul className="flex flex-col gap-1.5">
            {estado.playbooks.map((pb) => (
              <li key={pb.playbook_slug} className="rounded-md bg-bg-sutil px-3 py-1.5">
                <button
                  type="button"
                  onClick={() => onAbrirPlaybook?.(pb.pacote_slug, pb.playbook_slug)}
                  className="text-left text-sm font-semibold text-acento-texto underline-offset-2 hover:underline"
                >
                  {pb.processo}
                </button>
                <span className="block text-[12px] text-fg-3">
                  {pb.papel} · do pacote de {pb.pacote_cargo_titulo}
                </span>
              </li>
            ))}
          </ul>
        )}
      </div>
    </details>
  );
}

function tomOcupacao(o: Ocupante[] | undefined): "brand" | "success" | "neutral" {
  if (!o || o.length === 0) return "neutral";
  if (o.some((x) => x.ocupante_tipo === "agente")) return "brand";
  if (o.some((x) => x.ocupante_tipo === "pessoa")) return "success";
  return "neutral";
}

export function PainelCargo({
  no,
  apqc,
  documentos,
  ondas,
  ocupacao,
  onAbrirDocumento,
  onAbrirPlaybook,
  onIrParaFluxo,
}: {
  no: OrgNo;
  apqc: Map<string, string>;
  documentos?: OrgDocumentoResumo[];
  ondas?: OrgOnda[];
  ocupacao?: Ocupante[];
  onAbrirDocumento?: (caminho: string) => void;
  onAbrirPlaybook?: (pacoteSlug: string, slug: string) => void;
  onIrParaFluxo?: () => void;
}) {
  const horasMes = no.processos.reduce((s, p) => s + (p.horas_mes ?? 0), 0);

  return (
    <Card id="cargo-resumo" className="scroll-mt-28 grid grid-cols-1 gap-5 p-4 md:grid-cols-2 md:p-5">
      <div className="flex flex-col gap-1">
        <h2 className="h4">{no.titulo}</h2>
        {no.tipo !== "area" && (
          <div>
            <Pill tone={tomOcupacao(ocupacao)}>{rotuloOcupacao(ocupacao)}</Pill>
          </div>
        )}

        {no.especialidade && (
          <p className="mt-1 max-w-[70ch] text-[15px] font-medium text-fg-1">
            {rotuloApqc(no.especialidade, apqc)}
          </p>
        )}

        <div className="mt-1.5 empty:mt-0 empty:hidden">
          <BlocoFatos no={no} />
        </div>

        {no.reporta_a_texto && (
          <>
            <TituloSecao>Responde a</TituloSecao>
            <p className="max-w-[70ch] text-sm text-fg-2">{no.reporta_a_texto}</p>
          </>
        )}

        <SecaoOnda ondas={ondas ?? []} no={no} onIrParaFluxo={onIrParaFluxo} />

        {no.missao && (
          <>
            <TituloSecao>Descrição do cargo</TituloSecao>
            <p className="max-w-[70ch] text-sm text-fg-2">{no.missao}</p>
          </>
        )}

        {no.antes && (
          <>
            <TituloSecao>Quem faz isso numa empresa menor</TituloSecao>
            <p className="max-w-[70ch] text-sm text-fg-2">{no.antes}</p>
          </>
        )}

        {no.referencias.length > 0 && (
          <div id="cargo-referencias" className="scroll-mt-28">
            <TituloSecao>Referências de excelência</TituloSecao>
            <ul className="flex flex-col gap-1.5">
              {no.referencias.map((r, i) => (
                <li key={i} className="relative pl-3 text-sm text-fg-2 before:absolute before:left-0 before:top-[0.55em] before:size-1.5 before:rounded-full before:bg-acento">
                  {rotuloApqc(r, apqc)}
                </li>
              ))}
            </ul>
          </div>
        )}

        {no.interfaces.length > 0 && (
          <>
            <TituloSecao>Conversa com outras áreas</TituloSecao>
            <ul className="flex flex-col gap-1.5">
              {no.interfaces.map((iface, i) => (
                <li key={i} className="rounded-md bg-info-suave px-3 py-2 text-sm text-info">
                  {iface.titulo}
                  {iface.nota && <span className="block text-xs opacity-85">{iface.nota}</span>}
                </li>
              ))}
            </ul>
          </>
        )}
      </div>

      <div>
        <div id="cargo-processos" className="scroll-mt-28">
          {no.processos.length > 0 ? (
            <>
              <TituloSecao className="!mt-0">
                Processos que responde · {no.processos.length} · {horasMes.toLocaleString("pt-BR")} h/mês
              </TituloSecao>
              <ul className="flex flex-col gap-1.5">
                {no.processos.map((p, i) => {
                  const apqcRestante = apqcSemNotas(p);
                  return (
                    <li key={i} className="rounded-md bg-bg-sutil px-3 py-1.5">
                      {p.horas_mes != null && (
                        <span className="float-right ml-2 font-mono text-[12px] text-fg-3">
                          {p.horas_mes} h/mês
                        </span>
                      )}
                      <span className="font-semibold text-fg-1">{p.titulo}</span>
                      {p.notas && (
                        <span className="block text-[12px] text-fg-3">{rotuloApqc(p.notas, apqc)}</span>
                      )}
                      {apqcRestante.length > 0 && (
                        <span className="block text-[12px] text-fg-3">
                          {apqcRestante.map((c) => rotuloApqc(`APQC ${c}`, apqc)).join(" · ")}
                        </span>
                      )}
                    </li>
                  );
                })}
              </ul>
              <p className="mt-1.5 text-[12px] text-fg-3">
                Entre parênteses: o código do processo no catálogo padrão de processos da APQC (nota no
                rodapé da página).
              </p>
            </>
          ) : (
            <>
              <TituloSecao className="!mt-0">Processos</TituloSecao>
              <p className="text-sm text-fg-3">
                {no.tipo === "area"
                  ? "Os processos ficam dentro de cada cargo. Clique num cargo acima."
                  : "Sem processo próprio listado."}
              </p>
            </>
          )}
        </div>

        <div className="mt-4">
          <SecaoSalario no={no} />
        </div>

        <div className="mt-4 flex flex-col gap-4 empty:mt-0 empty:hidden">
          <SecaoDocumentosCargo no={no} documentos={documentos ?? []} onAbrirDocumento={onAbrirDocumento} />
          <SecaoPlaybooksDoCargo no={no} onAbrirPlaybook={onAbrirPlaybook} />
        </div>
      </div>
    </Card>
  );
}
