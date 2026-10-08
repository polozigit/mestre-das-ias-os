import { ClipboardList } from "lucide-react";
import { createClient } from "@/lib/supabase/server";
import { filtrar } from "@/lib/tarefas/kanban";
import { grupoDaBusca, hrefListaTarefas, TEXTOS_DO_GRUPO, trilhasDoGrupo } from "@/lib/tarefas/grupos";
import { ROTULO_STATUS } from "@/lib/tarefas/status";
import { nomeAmigavel } from "@/lib/agentes/nome";
import { Button } from "@/components/ui/Button";
import { Empty } from "@/components/ui/Empty";
import { LinkBotao } from "@/components/painel/LinkBotao";
import { KanbanBoard } from "@/components/tarefas/KanbanBoard";
import { NovaTarefaSheet } from "@/components/tarefas/NovaTarefaSheet";
import { TarefasTable, type TarefaLinha } from "@/components/tarefas/TarefasTable";
import { VisaoToggle, type VisaoTarefas } from "@/components/tarefas/VisaoToggle";
import type { TarefaOrigem, TarefaStatus } from "@/types/database";

export const metadata = { title: "Tarefas" };

type Busca = { [chave: string]: string | string[] | undefined };

/** searchParams pode trazer array (?x=a&x=b) — a tela só considera o primeiro. */
function um(valor: string | string[] | undefined): string | undefined {
  return Array.isArray(valor) ? valor[0] : valor;
}

const SELECT_FILTRO =
  "h-10 min-h-11 rounded-md border border-borda bg-bg-elevada px-3 text-sm text-fg-2 md:min-h-0";

/**
 * Duas listas na mesma página, escolhidas pelo menu lateral:
 *   /tarefas                 as tarefas do dia a dia (trilha `trabalho`), o padrão;
 *   /tarefas?trilha=curso    as tarefas do curso e da trilha de 90 dias (`curso` + `plano90`).
 */
export default async function TarefasPage({
  searchParams,
}: {
  searchParams: Promise<Busca>;
}) {
  const busca = await searchParams;
  const visao: VisaoTarefas = um(busca.visao) === "lista" ? "lista" : "quadro";
  const grupo = grupoDaBusca(busca.trilha);
  const textos = TEXTOS_DO_GRUPO[grupo];

  // Filtros validados contra os conjuntos conhecidos — valor estranho na URL
  // vira "sem filtro", nunca erro.
  // Object.hasOwn, nunca `in`: o operador `in` enxerga a cadeia de protótipo
  // ("toString" passaria) — mesmo cheque das actions deste módulo.
  const brutoStatus = um(busca.status);
  const filtroStatus =
    brutoStatus && Object.hasOwn(ROTULO_STATUS, brutoStatus)
      ? (brutoStatus as TarefaStatus)
      : undefined;
  const brutoOrigem = um(busca.origem);
  const filtroOrigem: TarefaOrigem | undefined =
    brutoOrigem === "humano" || brutoOrigem === "ia" ? brutoOrigem : undefined;
  const filtroDono = um(busca.dono) || undefined;

  const supabase = await createClient();
  // RLS (tarefas.read) já decide o que o usuário vê.
  // A trilha filtra NO BANCO (não em memória): com o teto abaixo, filtrar depois
  // faria as tarefas antigas do curso sumirem atrás de mil tarefas recentes do dia a dia.
  // TETO_TAREFAS explícito: sem .limit() o PostgREST trunca MUDO em max_rows
  // (1000) e tarefas antigas "somem" sem aviso — pedimos teto+1 pra DETECTAR
  // o corte e avisar na tela.
  const TETO_TAREFAS = 1000;
  const doGrupo = supabase
    .from("tarefas")
    .select("id, titulo, status, origem, trilha, dono_id, agente_id, atualizada_em")
    .in("trilha", [...trilhasDoGrupo(grupo)]);
  const [tarefasRes, usuariosRes, agentesRes] = await Promise.all([
    // Dia a dia: o que mexeu por último vem primeiro. Curso: na ordem do plano (curso, depois os 90 dias),
    // a mesma do Cronograma, pra a lista não embaralhar a cada passo concluído.
    (grupo === "curso"
      ? doGrupo.order("trilha", { ascending: true }).order("ordem", { ascending: true })
      : doGrupo.order("atualizada_em", { ascending: false })
    ).limit(TETO_TAREFAS + 1),
    supabase.from("usuarios").select("id, nome, ativo").order("nome"),
    supabase.from("agentes").select("id, name, time, descricao_curta").order("name"),
  ]);
  // Erro de banco ESTOURA (error.tsx segura) — «?? []» esconderia outage
  // como quadro vazio, indistinguível de banco recém-instalado.
  const erroQuery = tarefasRes.error ?? usuariosRes.error ?? agentesRes.error;
  if (erroQuery) throw erroQuery;
  const truncado = (tarefasRes.data ?? []).length > TETO_TAREFAS;
  // status/origem chegam como string no tipo gerado; o CHECK do banco garante o conjunto.
  const tarefas = (tarefasRes.data ?? []).slice(0, TETO_TAREFAS).map((t) => ({
    ...t,
    status: t.status as TarefaStatus,
    origem: t.origem as TarefaOrigem,
  }));
  const usuarios = usuariosRes.data ?? [];
  const agentes = agentesRes.data ?? [];

  const nomeUsuario = new Map(usuarios.map((u) => [u.id, u.nome]));
  const nomeAgente = new Map(agentes.map((a) => [a.id, nomeAmigavel(a.name, a.time)]));
  const notaAgente = new Map(agentes.map((a) => [a.id, a.descricao_curta]));

  /** Subtítulo do responsável: o que o agente faz (agentes.descricao_curta). */
  function notaResponsavel(agenteId: string | null) {
    return (agenteId ? notaAgente.get(agenteId) : null) || null;
  }

  function responsavel(donoId: string | null, agenteId: string | null) {
    const partes = [
      donoId ? nomeUsuario.get(donoId) : undefined,
      agenteId ? nomeAgente.get(agenteId) : undefined,
    ].filter((p): p is string => !!p);
    return partes.length > 0 ? partes.join(" · ") : null;
  }

  // Links do alternador: o quadro é a URL limpa do grupo; a lista preserva os filtros ativos.
  const hrefQuadro = hrefListaTarefas(grupo);
  const hrefLista = hrefListaTarefas(grupo, {
    visao: "lista",
    status: filtroStatus,
    origem: filtroOrigem,
    dono: filtroDono,
  });

  const linhas: TarefaLinha[] = filtrar(tarefas, {
    status: filtroStatus,
    origem: filtroOrigem,
    donoId: filtroDono,
  }).map((t) => ({
    id: t.id,
    titulo: t.titulo,
    status: t.status,
    origem: t.origem,
    trilha: t.trilha,
    responsavel: responsavel(t.dono_id, t.agente_id),
    responsavelNota: notaResponsavel(t.agente_id),
    atualizadaEm: t.atualizada_em,
  }));

  const cards = tarefas.map((t) => ({
    id: t.id,
    titulo: t.titulo,
    status: t.status,
    origem: t.origem,
    trilha: t.trilha,
    responsavel: responsavel(t.dono_id, t.agente_id),
    atualizadaEm: t.atualizada_em,
  }));

  const temFiltro = !!(filtroStatus || filtroOrigem || filtroDono);

  return (
    <div className="space-y-5">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div>
          <h1 className="font-display text-2xl font-bold text-fg-1">{textos.titulo}</h1>
          <p className="text-sm text-fg-3">{textos.subtitulo}</p>
        </div>
        <div className="flex items-center gap-2">
          <VisaoToggle visao={visao} hrefQuadro={hrefQuadro} hrefLista={hrefLista} />
          {/* Tarefa nova da tela é sempre do dia a dia: as do curso nascem do plano. */}
          {grupo === "trabalho" && (
            <NovaTarefaSheet
              usuarios={usuarios.filter((u) => u.ativo).map(({ id, nome }) => ({ id, nome }))}
            />
          )}
        </div>
      </div>

      {truncado && (
        <p className="rounded-md bg-alerta-suave px-3 py-2 text-sm text-alerta">
          Mostrando as {TETO_TAREFAS} tarefas mais recentes. As mais antigas
          existem: use os filtros para encontrá-las.
        </p>
      )}

      {tarefas.length === 0 && !temFiltro ? (
        <Empty
          icon={ClipboardList}
          title={textos.vazioTitulo}
          description={textos.vazioDescricao}
          action={
            grupo === "curso" ? (
              <LinkBotao href={hrefListaTarefas("trabalho")} className="mt-1">
                Ver tarefas do dia a dia
              </LinkBotao>
            ) : undefined
          }
        />
      ) : visao === "lista" ? (
        <>
          {/* Filtros por GET: o estado vive na URL, o server re-renderiza — sem JS. */}
          <form
            method="get"
            action="/tarefas"
            className="flex flex-wrap items-center gap-2"
          >
            <input type="hidden" name="visao" value="lista" />
            {grupo === "curso" && <input type="hidden" name="trilha" value="curso" />}
            <label htmlFor="filtro-status" className="sr-only">
              Filtrar por status
            </label>
            <select
              id="filtro-status"
              name="status"
              defaultValue={filtroStatus ?? ""}
              className={SELECT_FILTRO}
            >
              <option value="">Todos os status</option>
              {(Object.keys(ROTULO_STATUS) as TarefaStatus[]).map((s) => (
                <option key={s} value={s}>
                  {ROTULO_STATUS[s]}
                </option>
              ))}
            </select>
            <label htmlFor="filtro-origem" className="sr-only">
              Filtrar por quem criou a tarefa
            </label>
            <select
              id="filtro-origem"
              name="origem"
              defaultValue={filtroOrigem ?? ""}
              className={SELECT_FILTRO}
            >
              <option value="">Criada por: todos</option>
              <option value="humano">Criada por: você</option>
              <option value="ia">Criada por: IA</option>
            </select>
            <label htmlFor="filtro-dono" className="sr-only">
              Filtrar por dono
            </label>
            <select
              id="filtro-dono"
              name="dono"
              defaultValue={filtroDono ?? ""}
              className={SELECT_FILTRO}
            >
              <option value="">Todos os donos</option>
              {usuarios.map((u) => (
                <option key={u.id} value={u.id}>
                  {u.nome}
                </option>
              ))}
            </select>
            <Button type="submit" size="md" className="min-h-11 md:min-h-0">
              Filtrar
            </Button>
          </form>
          <TarefasTable tarefas={linhas} />
        </>
      ) : (
        <KanbanBoard tarefas={cards} />
      )}
    </div>
  );
}
