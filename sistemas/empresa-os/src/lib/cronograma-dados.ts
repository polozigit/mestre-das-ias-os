import type { createClient } from "@/lib/supabase/server";
import { montarItens, type ItemCronograma } from "@/lib/cronograma";

type ClienteServidor = Awaited<ReturnType<typeof createClient>>;

/**
 * Itens do cronograma (curso e 90 dias) pra tela e pro Início. A view do contrato traz status, prazo e
 * instrução, mas não a posição nem a chave da tarefa no plano; elas vêm de public.tarefas (mesma permissão
 * de leitura). Erro de banco estoura (error boundary): lista vazia fingiria "cronograma não carregado".
 *
 * `comTextos`: traz também instrução, comando e prova (só o Cronograma pede; o Início só precisa de título,
 * status e prazo). Os textos que não moram no banco (por_que, passos) entram depois, de config/planos
 * (ver lib/plano-textos.ts).
 */
export async function buscarItensCronograma(
  supabase: ClienteServidor,
  opcoes: { comTextos?: boolean } = {},
): Promise<ItemCronograma[]> {
  const doPlano = supabase.schema("tarefas").from("v_tarefa_com_instrucao");
  const [view, tarefas] = await Promise.all([
    opcoes.comTextos
      ? doPlano
          .select("tarefa_id, titulo, status, trilha, fase, prazo_previsto_em, instrucao, comando, prova")
          .order("prazo_previsto_em", { ascending: true, nullsFirst: false })
      : doPlano
          .select("tarefa_id, titulo, status, trilha, fase, prazo_previsto_em")
          .order("prazo_previsto_em", { ascending: true, nullsFirst: false }),
    supabase.from("tarefas").select("id, ordem, chave").in("trilha", ["curso", "plano90"]),
  ]);
  if (view.error) throw view.error;
  if (tarefas.error) throw tarefas.error;
  return montarItens(
    view.data ?? [],
    new Map((tarefas.data ?? []).map((t) => [t.id, t.ordem])),
    new Map((tarefas.data ?? []).map((t) => [t.id, t.chave])),
  );
}
