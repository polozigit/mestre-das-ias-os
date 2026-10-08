import Link from "next/link";
import { notFound } from "next/navigation";
import { ArrowLeft, Network } from "lucide-react";
import { requireAcesso } from "@/lib/auth/guards";
import { pode } from "@/lib/auth/permissoes";
import { createClient } from "@/lib/supabase/server";
import { formatarDataHora } from "@/lib/format";
import {
  nomeAgenteValido,
  normalizarSkills,
  resumirExecucoes,
  rotuloTokens,
  tomVeredito,
} from "@/lib/agentes/detalhe";
import { LEGENDA_DOS_MODELOS, nomeAmigavel, rotuloEsforco, rotuloModelo } from "@/lib/agentes/nome";
import { Card, CardBody, CardHeader, CardTitle } from "@/components/ui/Card";
import { Empty } from "@/components/ui/Empty";
import { Pill } from "@/components/ui/Pill";
import { TempoRelativo } from "@/components/ui/TempoRelativo";
import { ESTADO } from "@/components/painel/CardAgente";
import {
  CardArquivos,
  CardConteudo,
  InstrucoesCompletas,
  lerArquivos,
} from "@/components/catalogo/DetalheArtefato";
import { hrefArtefato } from "@/lib/catalogo/catalogo";

const ROTULO_SANDBOX: Record<string, string> = {
  "read-only": "Só lê",
  "workspace-write": "Lê e escreve",
};

/**
 * Página de um agente: o que ele é e o que faz. Cada bloco opcional some sem a permissão, e campo
 * vazio (sem skill, sem regra de acionamento) some também. O texto técnico (o arquivo do agente)
 * fica recolhido em "Ver instruções completas".
 */
export default async function PaginaAgente({
  params,
}: {
  params: Promise<{ name: string }>;
}) {
  const { name } = await params;
  // Nome fora de [a-z0-9-] nunca existe (CHECK da 0005): 404 sem ir ao banco.
  if (!nomeAgenteValido(name)) notFound();

  const sessao = await requireAcesso("agentes");
  const supabase = await createClient();
  const veExecucoes = sessao.eDono || sessao.permissoes.includes("execucoes.read");
  const veCargos = pode(sessao, "organograma");

  const { data: agente, error: erroAgente } = await supabase
    .from("agentes")
    .select(
      "id, name, time, descricao_curta, descricao, quando, estado, tier, modelo, esforco, sandbox, skills",
    )
    .eq("name", name)
    .maybeSingle();
  // Erro real vira error boundary; 404 é só "esse agente não existe".
  if (erroAgente) throw erroAgente;
  if (!agente) notFound();

  const skills = normalizarSkills(agente.skills);

  // Conteúdo do catálogo: o agente pode existir antes do primeiro sync, então ausente não é 404.
  const { data: artefato, error: erroArtefato } = await supabase
    .from("artefatos_ia")
    .select("id, caminho, formato, conteudo")
    .eq("tipo", "agente")
    .eq("nome", agente.name)
    .maybeSingle();
  if (erroArtefato) throw erroArtefato;
  const arquivos = artefato ? await lerArquivos(artefato.id) : [];

  // Só vira link a skill que existe no catálogo; o resto fica como texto (link levaria a um 404).
  let skillsNoCatalogo = new Set<string>();
  if (skills.length > 0) {
    const { data: existentes, error: erroSkills } = await supabase
      .from("artefatos_ia")
      .select("nome")
      .eq("tipo", "skill")
      .in("nome", skills);
    if (erroSkills) throw erroSkills;
    skillsNoCatalogo = new Set((existentes ?? []).map((s) => s.nome));
  }
  const estado = ESTADO[agente.estado as keyof typeof ESTADO] ?? {
    rotulo: agente.estado,
    tom: "neutral" as const,
  };

  let cargos: { slug: string; titulo: string }[] | null = null;
  if (veCargos) {
    const { data, error: erroCargos } = await supabase
      .schema("organograma")
      .from("v_posicao_ocupante")
      .select("cargo_slug, cargo_titulo")
      .eq("agente_id", agente.id);
    // Sem isso a página diria "sem cargo" para um agente que ocupa posição.
    if (erroCargos) throw erroCargos;
    const vistos = new Map<string, string>();
    for (const c of data ?? []) {
      if (c.cargo_slug && c.cargo_titulo && !vistos.has(c.cargo_slug)) {
        vistos.set(c.cargo_slug, c.cargo_titulo);
      }
    }
    cargos = [...vistos.entries()].map(([slug, titulo]) => ({ slug, titulo }));
  }

  let execucoes: {
    id: number;
    veredito: string;
    resumo: string | null;
    terminado_em: string;
    custo_estimado_tokens: number | null;
  }[] | null = null;
  if (veExecucoes) {
    const { data, error: erroExecs } = await supabase
      .from("execucoes_agente")
      .select("id, veredito, resumo, terminado_em, custo_estimado_tokens")
      .eq("agente", agente.name)
      .order("terminado_em", { ascending: false })
      .limit(20);
    if (erroExecs) throw erroExecs;
    execucoes = data ?? [];
  }
  const resumo = execucoes ? resumirExecucoes(execucoes) : null;

  return (
    <div className="mx-auto flex min-w-0 max-w-4xl flex-col gap-6">
      <div className="flex flex-col gap-3">
        <Link
          href="/agentes"
          className="inline-flex min-h-11 w-fit items-center gap-1.5 text-sm font-semibold text-fg-3 transition-colors hover:text-fg-1 md:min-h-0"
        >
          <ArrowLeft size={14} aria-hidden="true" /> Voltar para agentes
        </Link>
        <div className="flex flex-wrap items-start justify-between gap-3">
          <div className="min-w-0">
            <h1 className="break-words font-display text-2xl font-bold text-fg-1">
              {nomeAmigavel(agente.name, agente.time)}
            </h1>
            <p className="mt-1 break-all font-mono text-xs text-fg-4">{agente.name}</p>
            <p className="mt-2 break-words text-sm text-fg-3">{agente.descricao_curta}</p>
          </div>
          <Pill tone={estado.tom} dot>
            {estado.rotulo}
          </Pill>
        </div>
        <div className="flex flex-wrap items-center gap-1.5">
          <Pill tone="neutral">Time: {agente.time}</Pill>
          {agente.tier && <Pill tone="brand">{rotuloModelo(agente.tier)}</Pill>}
          {agente.modelo && <Pill tone="neutral">{agente.modelo}</Pill>}
          {agente.esforco && <Pill tone="neutral">Esforço: {rotuloEsforco(agente.esforco)}</Pill>}
          <Pill tone="neutral">{ROTULO_SANDBOX[agente.sandbox] ?? agente.sandbox}</Pill>
        </div>
        {agente.tier && <p className="text-xs text-fg-3">{LEGENDA_DOS_MODELOS}</p>}
      </div>

      <Card>
        <CardHeader>
          <CardTitle>O que faz</CardTitle>
        </CardHeader>
        <CardBody className="flex flex-col gap-4">
          <p className="whitespace-pre-line break-words text-sm text-fg-2">{agente.descricao}</p>
          {agente.quando?.trim() && (
            <div>
              <h3 className="text-[11px] font-bold uppercase tracking-widest text-fg-4">
                Quando chamar
              </h3>
              <p className="mt-1 whitespace-pre-line break-words text-sm text-fg-2">
                {agente.quando.trim()}
              </p>
            </div>
          )}
        </CardBody>
      </Card>

      {skills.length > 0 && (
        <Card>
          <CardHeader>
            <CardTitle>Skills que usa</CardTitle>
          </CardHeader>
          <CardBody className="flex flex-wrap gap-2">
            {skills.map((skill) =>
              skillsNoCatalogo.has(skill) ? (
                <Link
                  key={skill}
                  href={hrefArtefato("skill", skill)}
                  title={skill}
                  className="inline-flex min-h-11 items-center rounded-md border border-borda px-3 py-1.5 text-sm font-semibold text-acento-texto transition-colors hover:bg-bg-sutil md:min-h-0"
                >
                  {nomeAmigavel(skill)}
                </Link>
              ) : (
                <span key={skill} title={skill}>
                  <Pill tone="neutral">{nomeAmigavel(skill)}</Pill>
                </span>
              ),
            )}
          </CardBody>
        </Card>
      )}

      {cargos && (
        <Card>
          <CardHeader>
            <CardTitle>Cargo no organograma</CardTitle>
          </CardHeader>
          {cargos.length === 0 ? (
            <Empty
              icon={Network}
              title="Este agente ainda não ocupa nenhum cargo"
              description="No Organograma você escolhe qual cargo da empresa cada agente ocupa."
              action={
                <Link href="/organograma" className="text-sm font-semibold text-acento-texto hover:underline">
                  Abrir o Organograma
                </Link>
              }
            />
          ) : (
            <CardBody className="flex flex-wrap gap-2">
              {cargos.map((cargo) => (
                <Link
                  key={cargo.slug}
                  href="/organograma"
                  className="rounded-md border border-borda px-3 py-1.5 text-sm font-semibold text-acento-texto transition-colors hover:bg-bg-sutil"
                >
                  {cargo.titulo}
                </Link>
              ))}
            </CardBody>
          )}
        </Card>
      )}

      {execucoes && resumo && (
        <Card>
          <CardHeader>
            <CardTitle>Execuções recentes</CardTitle>
            {resumo.total > 0 && (
              <span className="text-xs text-fg-3">últimas {resumo.total}</span>
            )}
          </CardHeader>
          {execucoes.length === 0 ? (
            <Empty
              title="Este agente ainda não trabalhou"
              description="Cada vez que ele termina uma execução, o resultado fica registrado aqui."
            />
          ) : (
            <CardBody className="flex flex-col gap-4">
              <div className="flex flex-wrap gap-1.5">
                {resumo.porVeredito.map((v) => (
                  <Pill key={v.veredito} tone={tomVeredito(v.veredito)}>
                    {v.qtd} {v.veredito}
                  </Pill>
                ))}
              </div>
              <ul className="flex flex-col divide-y divide-borda-suave">
                {execucoes.map((e) => (
                  <li key={e.id} className="flex flex-col gap-1 py-3 first:pt-0 last:pb-0">
                    <div className="flex flex-wrap items-center gap-2">
                      <Pill tone={tomVeredito(e.veredito)}>{e.veredito}</Pill>
                      <span
                        title={formatarDataHora(e.terminado_em)}
                        className="whitespace-nowrap text-xs text-fg-4"
                      >
                        <TempoRelativo iso={e.terminado_em} />
                      </span>
                      <span className="text-xs text-fg-4">
                        · {rotuloTokens(e.custo_estimado_tokens)}
                      </span>
                    </div>
                    {e.resumo && <p className="break-words text-sm text-fg-2">{e.resumo}</p>}
                  </li>
                ))}
              </ul>
            </CardBody>
          )}
        </Card>
      )}

      {(artefato || arquivos.length > 0) && (
        <InstrucoesCompletas>
          {artefato && (
            <CardConteudo conteudo={artefato.conteudo} formato={artefato.formato} caminho={artefato.caminho} />
          )}
          <CardArquivos arquivos={arquivos} />
        </InstrucoesCompletas>
      )}
    </div>
  );
}
