"use server";

import { revalidatePath } from "next/cache";
import { assertAcesso } from "@/lib/auth/guards";
import type { Sessao } from "@/lib/auth/sessao";
import { podeEscrever } from "@/lib/auth/permissoes";
import { createClient } from "@/lib/supabase/server";
import { actionError, type ActionResult } from "@/lib/action-result";
import { podeMover, ROTULO_STATUS } from "@/lib/tarefas/status";
import type { TarefaStatus } from "@/types/database";

const SEM_PERMISSAO_ESCRITA = "Seu acesso é só de leitura nas tarefas.";

/**
 * Server actions do módulo Tarefas.
 *
 * Tudo aqui usa o client SERVER (sessão do usuário, nunca service role): as
 * policies de RLS são o teste vivo — se uma action tentar algo que a permissão do
 * usuário (`tarefas.write`) não cobre, o BANCO nega, e a gente só traduz o erro pra pt-BR. Cada escrita em
 * `tarefas` registra uma linha em `atividade` (append-only), sempre em nome do
 * próprio usuário — a policy da 0007 exige usuario_id = usuario_atual_id().
 */

const UUID_RE =
  /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

type ClienteServidor = Awaited<ReturnType<typeof createClient>>;

/** Traduz erro de escrita do Postgres pra mensagem de gente. */
function erroEscrita(codigo?: string): ActionResult {
  // 42501 = RLS negou (ex.: acesso só de leitura tentando escrever). A UI
  // esconde os botões, mas esconder é cosmético — a negativa de verdade nasce
  // no banco e chega por aqui.
  if (codigo === "42501") {
    return actionError("Seu acesso não permite essa ação.");
  }
  return actionError("Não foi possível salvar agora. Tente de novo em instantes.");
}

/**
 * Linha na atividade. Falha aqui NÃO desfaz a escrita principal (que já
 * aconteceu): devolvemos um aviso em vez de erro, senão o usuário re-tentaria
 * e duplicaria a tarefa.
 */
async function registrarAtividade(
  supabase: ClienteServidor,
  sessao: Sessao,
  evento: { tipo: string; descricao: string; tarefaId: string },
): Promise<string | undefined> {
  const { error } = await supabase.from("atividade").insert({
    usuario_id: sessao.usuarioId,
    agente_id: null,
    modulo_origem: "tarefas",
    tipo: evento.tipo,
    descricao: evento.descricao,
    tarefa_id: evento.tarefaId,
  });
  return error
    ? "A ação foi salva, mas o registro na linha do tempo falhou."
    : undefined;
}

function revalidarTarefas(tarefaId: string) {
  revalidatePath("/tarefas");
  revalidatePath(`/tarefas/${tarefaId}`);
}

export async function criarTarefa(formData: FormData): Promise<ActionResult> {
  const sessao = await assertAcesso("tarefas");
  if (!podeEscrever(sessao, "tarefas.write")) return actionError(SEM_PERMISSAO_ESCRITA);

  const titulo = String(formData.get("titulo") ?? "").trim();
  if (!titulo) return actionError("Dê um título pra tarefa.");
  const objetivo = String(formData.get("objetivo") ?? "").trim() || null;
  const criterioPronto =
    String(formData.get("criterio_pronto") ?? "").trim() || null;
  const donoId = String(formData.get("dono_id") ?? "").trim() || null;
  if (donoId && !UUID_RE.test(donoId)) return actionError("Dono inválido.");

  const supabase = await createClient();
  const { data: criada, error } = await supabase
    .from("tarefas")
    .insert({
      titulo,
      objetivo,
      criterio_pronto: criterioPronto,
      dono_id: donoId,
      // Trilha fixa: a policy do banco só deixa a tela criar 'trabalho'.
      trilha: "trabalho",
      // Origem fixa: tarefa criada pela tela é sempre de humano. Tarefa de IA
      // nasce por trás (service role), nunca por este formulário.
      origem: "humano",
    })
    .select("id")
    .single();
  if (error || !criada) return erroEscrita(error?.code);

  const info = await registrarAtividade(supabase, sessao, {
    tipo: "tarefa_criada",
    descricao: `Criou a tarefa "${titulo}".`,
    tarefaId: criada.id,
  });

  revalidarTarefas(criada.id);
  return { ok: true, info };
}

export async function moverTarefa(
  tarefaId: string,
  para: TarefaStatus,
): Promise<ActionResult> {
  const sessao = await assertAcesso("tarefas");
  if (!podeEscrever(sessao, "tarefas.write")) return actionError(SEM_PERMISSAO_ESCRITA);
  if (!UUID_RE.test(tarefaId)) return actionError("Tarefa inválida.");
  // `para` vem do client: valida contra o conjunto conhecido antes de usar.
  // Object.hasOwn — o `in` enxergaria a cadeia de protótipo ("toString" passa).
  if (!Object.hasOwn(ROTULO_STATUS, para)) return actionError("Status inválido.");

  const supabase = await createClient();
  const { data: atual } = await supabase
    .from("tarefas")
    .select("id, titulo, status")
    .eq("id", tarefaId)
    .maybeSingle();
  if (!atual) return actionError("Tarefa não encontrada.");
  const statusAtual = atual.status as TarefaStatus;

  if (!podeMover(statusAtual, para)) {
    return actionError(
      `Não dá pra mover de ${ROTULO_STATUS[statusAtual]} pra ${ROTULO_STATUS[para]}.`,
    );
  }

  // O CHECK do banco exige: CONCLUIDA só com concluida_em preenchido — no
  // MESMO update. Saindo de CONCLUIDA (reabrir), limpa o carimbo junto.
  const { data: movidas, error } = await supabase
    .from("tarefas")
    .update({
      status: para,
      concluida_em: para === "CONCLUIDA" ? new Date().toISOString() : null,
    })
    .eq("id", tarefaId)
    // Guarda de corrida: se alguém moveu em outra aba, o status mudou e este
    // update afeta 0 linhas em vez de aplicar uma transição que não validamos.
    .eq("status", statusAtual)
    .select("id");
  if (error) return erroEscrita(error.code);
  if (!movidas || movidas.length === 0) {
    // 0 linhas cobre dois casos indistinguíveis daqui: corrida (status mudou)
    // ou RLS negando o UPDATE via USING (sem tarefas.write).
    return actionError(
      "Não deu pra mover: a tarefa mudou em outra aba ou seu acesso não permite editar.",
    );
  }

  const info = await registrarAtividade(supabase, sessao, {
    tipo: "tarefa_movida",
    descricao: `Moveu "${atual.titulo}" de ${ROTULO_STATUS[statusAtual]} pra ${ROTULO_STATUS[para]}.`,
    tarefaId,
  });

  revalidarTarefas(tarefaId);
  return { ok: true, info };
}
