/**
 * Tipos do banco do Empresa OS: re-export do `supabase.gen.ts` (gerado do
 * banco). Não escrever tipo de tabela à mão aqui.
 */
import type { Database } from "./supabase.gen";

export type { Database, Json } from "./supabase.gen";

type Linha<T extends keyof Database["public"]["Tables"]> = Database["public"]["Tables"][T]["Row"];

export type TarefaStatus = "BACKLOG" | "EM_ANDAMENTO" | "REVISAO" | "CONCLUIDA" | "CANCELADA";
export type TarefaOrigem = "humano" | "ia";

export type Tarefa = Linha<"tarefas">;
export type Agente = Linha<"agentes">;
export type Atividade = Linha<"atividade">;
export type Usuario = Linha<"usuarios">;
export type Empresa = Linha<"empresa">;
export type DocumentoPublicado = Linha<"documentos_publicados">;
export type ExecucaoAgente = Linha<"execucoes_agente">;
export type ArtefatoIa = Linha<"artefatos_ia">;
export type ArtefatoArquivo = Linha<"artefato_arquivos">;
