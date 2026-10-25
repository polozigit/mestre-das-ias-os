import type { Capacidades } from "./tipos.ts";

export type Filtros = { conta?: string; busca?: string; estado?: string; responsavel?: string; naoLidas?: boolean; grupos?: boolean };
type ConversaFiltravel = { id: string; conta_id: string; nome: string | null; jid: string; grupo: boolean; estado: string; responsavel_id: string | null; nao_lidas: number; ultima_em: string | null; ultima_mensagem: string | null };
const normalizar = (valor: string) => valor.normalize("NFD").replace(/[\u0300-\u036f]/g, "").toLocaleLowerCase("pt-BR");

export function filtrarConversas<T extends ConversaFiltravel>(conversas: T[], filtros: Filtros, usuarioId: string): T[] {
  const busca = normalizar(filtros.busca?.trim() || "");
  return conversas.filter(c =>
    (!filtros.conta || c.conta_id === filtros.conta) &&
    (!filtros.estado || c.estado === filtros.estado) &&
    (!filtros.naoLidas || c.nao_lidas > 0) &&
    (filtros.grupos === undefined || c.grupo === filtros.grupos) &&
    (!filtros.responsavel || (filtros.responsavel === "minhas" ? c.responsavel_id === usuarioId : filtros.responsavel === "sem" ? !c.responsavel_id : c.responsavel_id === filtros.responsavel)) &&
    (!busca || normalizar([c.nome, c.jid, c.ultima_mensagem].filter(Boolean).join(" ")).includes(busca)))
    .sort((a,b) => (b.ultima_em || "").localeCompare(a.ultima_em || ""));
}

export function permiteAcao(capacidades: Capacidades | null | undefined, acao: string): boolean {
  return capacidades?.[acao] === true;
}
export function rascunhoValido(rascunho: { estado: string; conversa_versao: number; politica_versao: number }, conversaVersao: number, politicaVersao: number): boolean {
  return rascunho.estado === "pendente" && rascunho.conversa_versao === conversaVersao && rascunho.politica_versao === politicaVersao;
}
export function tipoDoArquivo(mime: string): string {
  if (mime.startsWith("image/")) return "image";
  if (mime.startsWith("video/")) return "video";
  if (mime.startsWith("audio/")) return "audio";
  return "document";
}
const ESTADOS: Record<string, string> = { pendente: "Na fila", processando: "Processando", enviada: "Enviada", entregue: "Entregue", lida: "Lida", recebida: "Recebida", falhou: "Falhou", incerto: "Envio não confirmado", conectada: "Conectado", conectado: "Conectado", desconectada: "Desconectado", desconectado: "Desconectado", aguardando_qr: "Aguardando QR", offline: "Computador desconectado", aberta: "Aberta", resolvida: "Resolvida" };
export function estadoLegivel(estado: string): string { return ESTADOS[estado] || estado.replaceAll("_", " "); }
export function mensagemErro(erro: unknown): string {
  const texto = erro instanceof Error ? erro.message : "Não foi possível concluir a operação.";
  if (/PGRST202|mensageria_api.*(not found|schema cache|does not exist)|function.*mensageria_api/i.test(texto)) return "A caixa de atendimento ainda não foi instalada neste banco. Aplique a migration de mensageria e tente novamente.";
  return texto;
}
