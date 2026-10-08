import type { TimelineNodeType } from "@/components/ui/Timeline";

/**
 * Helpers PUROS da linha do tempo (Início + Atividade). Só import de TIPO
 * aqui em cima — o arquivo roda direto no node --test, onde o alias "@/"
 * não resolve (import type é apagado antes de executar).
 */

/** Shape mínimo de uma linha de atividade — o Row completo do banco satisfaz. */
export type LinhaAtividade = {
  usuario_id: string | null;
  agente_id: string | null;
  quando: string;
  tipo: string;
  descricao: string;
};

export type NomesResolvidos = {
  usuarios: ReadonlyMap<string, string>;
  agentes: ReadonlyMap<string, string>;
};

/**
 * Quem fez: nome do humano > nome do agente > "Sistema". Autor apagado do
 * banco (ON DELETE SET NULL) ou fora do mapa ganha um fallback digno em vez
 * de id cru na tela.
 */
export function nomeDoEvento(
  linha: Pick<LinhaAtividade, "usuario_id" | "agente_id">,
  nomes: NomesResolvidos,
): string {
  if (linha.usuario_id) return nomes.usuarios.get(linha.usuario_id) ?? "Pessoa da equipe";
  if (linha.agente_id) return nomes.agentes.get(linha.agente_id) ?? "Agente de IA";
  return "Sistema";
}

/**
 * Eventos de SISTEMA: o que o próprio banco e os scripts de instalação gravam sozinhos,
 * sem pessoa nem IA como autora (ex.: "Empresa criada", "Proteção de dados ligada
 * automaticamente na área nova do banco (organograma.org_cargo)", "Passo concluído pela
 * instalação", "Segredo guardado no Vault"). Pro dono isso é ruído: a Atividade e o Início
 * escondem por padrão e oferecem "mostrar eventos do sistema".
 *
 * Decide pelo campo `tipo` (lista fechada), nunca por texto da descrição. Cada tipo abaixo só
 * nasce por service_role ou função do banco, então nunca tem autor humano:
 *   - `sistema`: a migration 0007 reserva o tipo ao service_role (seed_empresa na 0008, gates
 *     de proteção de dados na 0001/0012, setup-inicial.mjs);
 *   - `conexao_registrada` e `segredo_guardado`: operações fixas do script da IA (0017),
 *     EXECUTE só para service_role.
 * Tipo novo de máquina entra aqui; tipo de pessoa ou de IA (tarefa_criada, modulo_ligado...)
 * nunca entra, senão some da linha do tempo do dono.
 */
export const TIPOS_DE_SISTEMA: readonly string[] = ["sistema", "conexao_registrada", "segredo_guardado"];

export function eEventoDeSistema(linha: Pick<LinhaAtividade, "tipo">): boolean {
  return TIPOS_DE_SISTEMA.includes(linha.tipo);
}

/** Lista no formato do operador `in` do PostgREST, pra filtrar na consulta (paginação continua certa). */
export const TIPOS_DE_SISTEMA_PARA_FILTRO = `(${TIPOS_DE_SISTEMA.join(",")})`;

/** Tira os eventos de sistema quando o dono não pediu pra vê-los. */
export function filtrarEventosDeSistema<T extends Pick<LinhaAtividade, "tipo">>(
  linhas: readonly T[],
  mostrarSistema: boolean,
): T[] {
  return mostrarSistema ? [...linhas] : linhas.filter((l) => !eEventoDeSistema(l));
}

/** Cor do nó da Timeline: humano = destaque, IA = info, sistema = neutro. */
export function tipoDoNo(
  linha: Pick<LinhaAtividade, "usuario_id" | "agente_id">,
): TimelineNodeType {
  if (linha.usuario_id) return "destaque";
  if (linha.agente_id) return "info";
  return "neutro";
}

/* Formatação própria (mesmas opções do formatarData de lib/format) em vez de
   importar: import de runtime quebraria o node --test, ver topo do arquivo. */
const DIA_BR_SP = new Intl.DateTimeFormat("pt-BR", {
  day: "2-digit",
  month: "2-digit",
  year: "numeric",
  timeZone: "America/Sao_Paulo",
});

/* en-CA formata YYYY-MM-DD — vira a CHAVE do dia no fuso SP, comparável por
   igualdade. Comparar Date direto compararia no fuso do servidor (UTC). */
const CHAVE_DIA_SP = new Intl.DateTimeFormat("en-CA", {
  timeZone: "America/Sao_Paulo",
});

/**
 * Rótulo do grupo de dia: "Hoje", "Ontem" ou "20/08/2026", sempre pelo dia
 * em São Paulo. O parâmetro `agora` existe pra teste determinístico.
 */
export function rotuloDoDia(iso: string, agora: Date = new Date()): string {
  const chave = CHAVE_DIA_SP.format(new Date(iso));
  if (chave === CHAVE_DIA_SP.format(agora)) return "Hoje";
  if (chave === CHAVE_DIA_SP.format(new Date(agora.getTime() - 86_400_000))) return "Ontem";
  return DIA_BR_SP.format(new Date(iso));
}

/**
 * Agrupa linhas JÁ ordenadas (mais recente primeiro) por dia, preservando a
 * ordem. Como a lista vem ordenada por `quando`, linhas do mesmo dia são
 * contíguas — basta abrir grupo novo quando o rótulo muda.
 */
export function agruparPorDia<T extends { quando: string }>(
  linhas: readonly T[],
  agora: Date = new Date(),
): { rotulo: string; linhas: T[] }[] {
  const grupos: { rotulo: string; linhas: T[] }[] = [];
  for (const linha of linhas) {
    const rotulo = rotuloDoDia(linha.quando, agora);
    const ultimo = grupos[grupos.length - 1];
    if (ultimo && ultimo.rotulo === rotulo) {
      ultimo.linhas.push(linha);
    } else {
      grupos.push({ rotulo, linhas: [linha] });
    }
  }
  return grupos;
}
