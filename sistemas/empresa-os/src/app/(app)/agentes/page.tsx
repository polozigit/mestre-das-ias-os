import Link from "next/link";
import { Bot, Sparkles, Workflow } from "lucide-react";
import { requireAcesso } from "@/lib/auth/guards";
import { pode } from "@/lib/auth/permissoes";
import { createClient } from "@/lib/supabase/server";
import { Empty } from "@/components/ui/Empty";
import { KpiCard } from "@/components/ui/KpiCard";
import type { UltimaExecucao } from "@/components/painel/CardAgente";
import { AbasCatalogo } from "@/components/catalogo/AbasCatalogo";
import { ListaDeAgentes, ListaDeArtefatos } from "@/components/catalogo/ListaFiltravel";
import {
  agruparPorTime,
  contarInstalados,
  execucaoDoAgente,
  ultimaExecucaoPorAgente,
  type AgenteLinha,
} from "@/lib/agentes/agrupar";
import { LEGENDA_DOS_MODELOS } from "@/lib/agentes/nome";
import {
  agruparArtefatos,
  tipoDaBusca,
  type ArtefatoCard,
  type TipoArtefato,
} from "@/lib/catalogo/catalogo";

const ESTADOS = ["instalado", "disponivel", "aposentado"] as const;
const SETE_DIAS_MS = 7 * 24 * 60 * 60 * 1000;

function corteSeteDias(): string {
  return new Date(Date.now() - SETE_DIAS_MS).toISOString();
}

const VAZIO_ARTEFATO = {
  skill: {
    icone: Sparkles,
    titulo: "Nenhuma skill ainda",
    descricao: "Instale os times do kit e rode o sync do catálogo.",
  },
  workflow: {
    icone: Workflow,
    titulo: "Nenhum workflow ainda",
    descricao: "Os workflows do sistema aparecem depois do primeiro sync do catálogo.",
  },
} as const;

type Busca = { [k: string]: string | string[] | undefined };

/**
 * Agentes, skills e workflows: lê do banco; cada bloco opcional some sem a permissão.
 * A busca de cada lista roda no navegador (ListaFiltravel), sobre o que a página já trouxe.
 */
export default async function PaginaAgentes({ searchParams }: { searchParams: Promise<Busca> }) {
  const busca = await searchParams;
  const tipo = tipoDaBusca(busca.tipo);
  const mostrarAposentados = busca.aposentados === "1";
  const sessao = await requireAcesso("agentes");
  const supabase = await createClient();
  const veExecucoes = sessao.eDono || sessao.permissoes.includes("execucoes.read");
  const veCargos = pode(sessao, "organograma");

  // Contagem das abas: só o que está ativo conta (aposentado fica escondido por padrão).
  const { data: contados, error: erroContagem } = await supabase.from("artefatos_ia").select("tipo, estado");
  if (erroContagem) throw erroContagem;
  const contagens: Record<TipoArtefato, number> = { agente: 0, skill: 0, workflow: 0 };
  for (const c of contados ?? []) {
    if (c.estado === "aposentado") continue;
    const t = tipoDaBusca(c.tipo);
    if (t !== "agente") contagens[t] += 1;
  }

  const cabecalho = (
    <div>
      <h1 className="font-display text-2xl font-bold text-fg-1">Agentes, skills e workflows</h1>
      <p className="mt-1 text-sm text-fg-3">
        Tudo o que a IA da sua empresa sabe fazer. Clique para ver como funciona por dentro.
      </p>
    </div>
  );

  if (tipo !== "agente") {
    const { data: artefatos, error: erroArtefatos } = await supabase
      .from("artefatos_ia")
      .select("id, tipo, nome, time, resumo, estado")
      .eq("tipo", tipo)
      .order("nome");
    if (erroArtefatos) throw erroArtefatos;
    const cards: ArtefatoCard[] = (artefatos ?? []).flatMap((a) => {
      const estado = ESTADOS.find((e) => e === a.estado);
      return estado ? [{ ...a, tipo, estado }] : [];
    });
    const gruposArtefato = agruparArtefatos(cards, mostrarAposentados);
    const { count: totalAgentes, error: erroAgentes } = await supabase
      .from("agentes")
      .select("id", { count: "exact", head: true })
      .neq("estado", "aposentado");
    if (erroAgentes) throw erroAgentes;
    const vazio = VAZIO_ARTEFATO[tipo];
    const hrefAposentados = mostrarAposentados ? `/agentes?tipo=${tipo}` : `/agentes?tipo=${tipo}&aposentados=1`;

    return (
      <div className="mx-auto flex max-w-6xl flex-col gap-6">
        {cabecalho}
        <div className="flex flex-wrap items-center justify-between gap-3">
          <AbasCatalogo ativo={tipo} contagens={{ ...contagens, agente: totalAgentes ?? 0 }} />
          <Link
            href={hrefAposentados}
            className="inline-flex min-h-11 items-center text-sm font-semibold text-acento-texto hover:underline md:min-h-0"
          >
            {mostrarAposentados ? "Esconder aposentados" : "Mostrar aposentados"}
          </Link>
        </div>
        {gruposArtefato.length === 0 ? (
          <Empty icon={vazio.icone} title={vazio.titulo} description={vazio.descricao} />
        ) : (
          <ListaDeArtefatos grupos={gruposArtefato} />
        )}
      </div>
    );
  }

  const { data, error } = await supabase
    .from("agentes")
    .select("id, name, time, descricao_curta, estado, tier, esforco")
    .order("name", { ascending: true });
  // Erro real vira error boundary; o Empty abaixo é só o zero-agentes legítimo.
  if (error) throw error;

  const linhas: AgenteLinha[] = (data ?? []).flatMap((a) => {
    const estado = ESTADOS.find((e) => e === a.estado);
    return estado
      ? [{ ...a, estado, tier: a.tier ?? "", esforco: a.esforco ?? "" }]
      : [];
  });
  const grupos = agruparPorTime(linhas);
  // Mesma regra do "Agentes instalados" do Início (ESTADO_INSTALADO): os dois números batem.
  const instalados = contarInstalados(linhas);
  const totalAgentes = linhas.filter((a) => a.estado !== "aposentado").length;

  let ultimas: Map<string, UltimaExecucao> | null = null;
  let execucoes7d = 0;
  if (veExecucoes) {
    const { data: execs, error: erroExecs } = await supabase
      .from("execucoes_agente")
      .select("agente, veredito, resumo, terminado_em")
      .order("terminado_em", { ascending: false })
      .limit(500);
    if (erroExecs) throw erroExecs;
    const lista = execs ?? [];
    ultimas = ultimaExecucaoPorAgente(lista);
    // Contagem exata no banco: o .limit(500) acima so serve a "ultima execucao por agente".
    const { count, error: erroConta } = await supabase
      .from("execucoes_agente")
      .select("agente", { count: "exact", head: true })
      .gte("terminado_em", corteSeteDias());
    if (erroConta) throw erroConta;
    execucoes7d = count ?? 0;
  }

  const cargoPorAgente = new Map<string, string>();
  if (veCargos) {
    const { data: ocupantes, error: erroOcupantes } = await supabase
      .schema("organograma")
      .from("v_posicao_ocupante")
      .select("agente_id, cargo_titulo")
      .not("agente_id", "is", null);
    // Erro de banco estoura (error.tsx segura): sem cargo, a tela mentiria que ninguem ocupa posicao.
    if (erroOcupantes) throw erroOcupantes;
    for (const o of ocupantes ?? []) {
      if (o.agente_id && o.cargo_titulo && !cargoPorAgente.has(o.agente_id)) {
        cargoPorAgente.set(o.agente_id, o.cargo_titulo);
      }
    }
  }

  // A lista com busca vive num componente de navegador: o que atravessa pra lá são objetos simples por id
  // (nada de Map). `null` em `execucoes` = sem permissão pra ver execuções, o card esconde o bloco.
  const execucoes: Record<string, UltimaExecucao | null> | null = ultimas ? {} : null;
  if (ultimas && execucoes) {
    for (const grupo of grupos) {
      for (const agente of grupo.agentes) execucoes[agente.id] = execucaoDoAgente(agente, ultimas);
    }
  }
  const cargos = Object.fromEntries(cargoPorAgente);

  return (
    <div className="mx-auto flex max-w-6xl flex-col gap-6">
      {cabecalho}
      <AbasCatalogo ativo="agente" contagens={{ ...contagens, agente: totalAgentes }} />

      {grupos.length === 0 ? (
        <Empty
          icon={Bot}
          title="Nenhum agente instalado ainda"
          description="Instale os times do kit (Dia 1) e os agentes aparecem aqui."
        />
      ) : (
        <>
          <div className="grid grid-cols-2 gap-3 md:grid-cols-3">
            <KpiCard label="Instalados" value={instalados} />
            <KpiCard label="Times" value={grupos.length} />
            {veExecucoes && <KpiCard label="Execuções (7 dias)" value={execucoes7d} />}
          </div>

          <p className="text-xs text-fg-3">{LEGENDA_DOS_MODELOS}</p>

          <ListaDeAgentes grupos={grupos} execucoes={execucoes} cargos={cargos} />
        </>
      )}
    </div>
  );
}
