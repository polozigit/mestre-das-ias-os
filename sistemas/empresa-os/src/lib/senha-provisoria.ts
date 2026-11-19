/**
 * Senha provisória do dono. Só imports relativos: o node:test importa este arquivo
 * direto (não resolve o alias `@/`).
 *
 * Contrato com o `scripts/setup-inicial.mjs`: quem nasce com a senha provisória tem
 * `user_metadata.senha_provisoria === true`; ao trocar a senha dentro do sistema,
 * gravamos `senha_provisoria: false` no mesmo passo.
 */
import { faixaDeTeste } from "./ambiente-teste.ts";

export const SENHA_PROVISORIA = "mudar@123";

/** Mesmo mínimo da tela `/auth/definir-senha` (8); o Supabase do projeto aceita a partir de 6. */
export const SENHA_MINIMA = 8;

type UsuarioComMetadata = { user_metadata?: Record<string, unknown> | null } | null | undefined;

export function precisaTrocarSenha(user: UsuarioComMetadata): boolean {
  return user?.user_metadata?.senha_provisoria === true;
}

/** Aviso só em produção/local: no preview da Vercel já existe a faixa de teste. */
export function deveAvisarSenhaProvisoria(
  user: UsuarioComMetadata,
  env: Record<string, string | undefined>,
): boolean {
  return precisaTrocarSenha(user) && !faixaDeTeste(env).mostrar;
}

/** Devolve a mensagem de erro em português, ou null quando a senha nova está ok. */
export function validarNovaSenha(nova: string, confirmacao: string): string | null {
  if (nova.length < SENHA_MINIMA) {
    return `A senha nova precisa ter pelo menos ${SENHA_MINIMA} caracteres.`;
  }
  if (nova !== confirmacao) return "As duas senhas não são iguais. Digite de novo.";
  if (nova === SENHA_PROVISORIA) {
    return "Essa é a senha provisória. Escolha uma senha só sua.";
  }
  return null;
}
