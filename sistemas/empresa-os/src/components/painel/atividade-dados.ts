import type { createClient } from "@/lib/supabase/server";
import { nomeAmigavel } from "@/lib/agentes/nome";
import type { NomesResolvidos } from "./atividade-helpers";

type ClienteServidor = Awaited<ReturnType<typeof createClient>>;

/**
 * Resolve os nomes de quem aparece na linha do tempo com DOIS selects e Maps
 * — nunca embed do PostgREST: atividade tem mais de uma FK pros mesmos pares
 * (usuario/agente/tarefa) e FK dupla quebra o embed com PGRST201.
 * A RLS já filtra o que a sessão pode ver (inclusive por `modulo_origem`).
 */
export async function buscarNomesDosAutores(
  supabase: ClienteServidor,
  linhas: ReadonlyArray<{ usuario_id: string | null; agente_id: string | null }>,
): Promise<NomesResolvidos> {
  const usuarioIds = [
    ...new Set(linhas.flatMap((l) => (l.usuario_id ? [l.usuario_id] : []))),
  ];
  const agenteIds = [
    ...new Set(linhas.flatMap((l) => (l.agente_id ? [l.agente_id] : []))),
  ];

  const vazio = { data: [] as { id: string; nome: string }[] };
  const semAgente = { data: [] as { id: string; name: string; time: string }[] };
  const [usuarios, agentes] = await Promise.all([
    usuarioIds.length > 0
      ? supabase.from("usuarios").select("id, nome").in("id", usuarioIds)
      : Promise.resolve(vazio),
    agenteIds.length > 0
      ? supabase.from("agentes").select("id, name, time").in("id", agenteIds)
      : Promise.resolve(semAgente),
  ]);

  return {
    usuarios: new Map((usuarios.data ?? []).map((u) => [u.id, u.nome])),
    // Nome amigável do agente (sem "polozi-" nem o prefixo do time), igual ao que a tela de Agentes mostra.
    agentes: new Map((agentes.data ?? []).map((a) => [a.id, nomeAmigavel(a.name, a.time)])),
  };
}
