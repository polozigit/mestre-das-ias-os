/** Contrato de domínio da RPC v1. Não substitui os tipos gerados do banco. */
export type Capacidades = Record<string, boolean>;
export type Anexo = { path: string; nome: string; mime: string; bytes: number };
export type RegraIA = { id: string; habilitada: boolean; automatica: boolean; padrao?: string; resposta_aprovada?: string; [chave: string]: unknown };
export type Conta = {
  id: string; nome: string; provedor: "baileys" | "meta"; telefone: string | null;
  estado: string; capacidades: Capacidades; ia_modo: "desligada" | "rascunho" | "automatica";
  politica_versao: number; instalacao_id: string | null; qr: string | null; erro: string | null;
  membros?: string[]; instrucoes?: string; regras?: RegraIA[];
};
export type Conversa = {
  id: string; conta_id: string; jid: string; nome: string | null; grupo: boolean;
  estado: string; responsavel_id: string | null; versao: number; ultima_em: string | null;
  ultima_mensagem: string | null; nao_lidas: number;
};
export type Mensagem = {
  id: string; conversa_id: string; conta_id: string; provedor_id: string | null;
  direcao: string; tipo: string; texto: string | null; estado: string;
  participante: string | null; anexo: Anexo | null; citada_id: string | null;
  criada_em: string; autor_id: string | null; editada: boolean; apagada: boolean;
  ordem?:number;historica?:boolean;duplicada_de?:string|null;
};
export type Rascunho = {
  id: string; texto: string; estado: string; conversa_versao: number;
  politica_versao: number; criada_em?: string; feedback?: string | null;
};
export type Painel = {
  contas: Conta[]; conversas: Conversa[]; usuarios: { id: string; nome: string }[];
  instalacoes: { id: string; nome: string; ultima_em: string | null }[];
};
export type Thread = { conversa: Conversa; mensagens: Mensagem[]; rascunhos: Rascunho[]; tem_mais: boolean };
export type ConteudoEnvio = { tipo: string; texto?: string; anexo?: Anexo; citada_id?: string; encaminhada_id?: string; template?: unknown };
