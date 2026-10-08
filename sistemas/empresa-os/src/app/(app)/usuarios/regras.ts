import type { PillTone } from "@/components/ui/Pill";

/**
 * Regras puras do módulo Usuários, compartilhadas pelas server actions
 * (validação de verdade) e pelos componentes (agrupamento, tons de Pill).
 * Sem import de valor de outros módulos: roda também no `node --test`.
 *
 * O contrato do banco (0003/0004): `usuarios` não tem INSERT/DELETE para
 * authenticated (convite é server-side); `usuarios_permissoes` só aceita
 * escrita de quem tem `usuarios.manage` e o gatilho `trg_usuarios_manage_so_dono`
 * reserva o slug `usuarios.manage` ao dono. Aqui só vêm as mensagens e a
 * ordem de exibição, ANTES de bater no banco.
 */

export type PermissaoCatalogo = { slug: string; modulo: string; acao: string; descricao: string | null };
export type ModuloCatalogo = { slug: string; nome: string; ligado: boolean };

const ORDEM_ACAO = ["read", "write", "manage"];

function pesoAcao(acao: string): number {
  const i = ORDEM_ACAO.indexOf(acao);
  return i === -1 ? ORDEM_ACAO.length : i;
}

/** Agrupa o catálogo por módulo LIGADO (nome A-Z); ações em read, write, manage, demais (A-Z). Módulo sem permissão não vira grupo. */
export function agruparPermissoes(
  perms: PermissaoCatalogo[],
  modulos: ModuloCatalogo[],
): { modulo: ModuloCatalogo; permissoes: PermissaoCatalogo[] }[] {
  return modulos
    .filter((m) => m.ligado)
    .map((modulo) => ({
      modulo,
      permissoes: perms
        .filter((p) => p.modulo === modulo.slug)
        .sort((a, b) => pesoAcao(a.acao) - pesoAcao(b.acao) || a.acao.localeCompare(b.acao)),
    }))
    .filter((g) => g.permissoes.length > 0)
    .sort((a, b) => a.modulo.nome.localeCompare(b.modulo.nome, "pt-BR"));
}

/** O dono nunca é editado por outro usuário (ele já tem todas as permissões). */
export function podeEditarUsuario(alvo: { e_dono: boolean }, eu: { eDono: boolean }): boolean {
  return !alvo.e_dono || eu.eDono;
}

/** `usuarios.manage` só o dono concede ou tira (gatilho no banco); qualquer outro slug, quem gerencia usuários. */
export function podeMexerNoSlug(slug: string, eu: { eDono: boolean }): boolean {
  return slug !== "usuarios.manage" || eu.eDono;
}

/** O que mudar para ir das permissões atuais às desejadas (sem duplicar, sem tocar no igual). */
export function diffPermissoes(
  atuais: string[],
  desejadas: string[],
): { conceder: string[]; revogar: string[] } {
  const a = new Set(atuais);
  const d = new Set(desejadas);
  return {
    conceder: [...d].filter((s) => !a.has(s)),
    revogar: [...a].filter((s) => !d.has(s)),
  };
}

/** Mesma régua de e-mail do fluxo de convite do CRM (provado em produção). */
export function emailValido(email: string): boolean {
  return /^[^@\s]+@[^@\s]+\.[^@\s]+$/.test(email);
}

/** Valida os campos do convite. Devolve a mensagem de erro, ou null se ok. */
export function validarConvite(dados: { nome: string; email: string }): string | null {
  if (!dados.nome.trim()) return "Informe o nome de quem você quer convidar.";
  if (!dados.email || !emailValido(dados.email)) return "E-mail inválido.";
  return null;
}

/**
 * Ativar/desativar acesso: ninguém desativa a si mesmo (anti-lockout, só no
 * app) e o dono nunca é desativado. Reativar é sempre permitido.
 */
export function validarAlternarAtivo(dados: {
  alvoId: string;
  alvoEDono: boolean;
  ativoNovo: boolean;
  sessaoUsuarioId: string;
}): string | null {
  if (dados.ativoNovo) return null;
  if (dados.alvoId === dados.sessaoUsuarioId) return "Você não pode desativar o seu próprio acesso.";
  if (dados.alvoEDono) return "O dono não pode ser desativado.";
  return null;
}

export type StatusMembro = { label: string; tone: PillTone };

/**
 * Status exibido na lista: Inativo ganha de tudo. "Aguardando convite" não
 * se deriva só de `usuarios` (o convite já grava auth_user_id): o sinal real
 * (`aceitou_convite`) vem do Auth Admin API na página (last_sign_in_at).
 * auth_user_id NULL também é pendente: sem conta, ninguém entra.
 */
export function statusDoMembro(membro: {
  ativo: boolean;
  auth_user_id: string | null;
  aceitou_convite: boolean;
}): StatusMembro {
  if (!membro.ativo) return { label: "Inativo", tone: "neutral" };
  const podeLogar = membro.auth_user_id !== null && membro.aceitou_convite;
  if (!podeLogar) return { label: "Aguardando convite", tone: "warning" };
  return { label: "Ativo", tone: "success" };
}
