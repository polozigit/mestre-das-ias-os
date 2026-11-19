/**
 * Senha da equipe sem e-mail: cadastro de funcionário com a senha provisória e
 * "Redefinir senha" na lista de usuários. Só imports relativos: o node:test
 * importa este arquivo direto (não resolve o alias `@/`).
 *
 * Por que sem e-mail: o envio padrão do Supabase só entrega pra membros da conta
 * do Supabase do projeto e limita a 2 e-mails por hora. A senha provisória é a
 * mesma do kit (SENHA_PROVISORIA) e a marca `user_metadata.senha_provisoria`
 * faz o sistema pedir a troca (aviso no topo e tela /conta/senha).
 */

/** Quem está pedindo a redefinição (vem da sessão do servidor, nunca do formulário). */
export type AtorSenha = { usuarioId: string; eDono: boolean };

/**
 * A pessoa escolhida, como o SERVIDOR leu do banco. `null` = o id veio do
 * formulário mas não existe na lista de usuários desta empresa (1 empresa por
 * banco: achar a linha em `usuarios` pelo client da sessão é o que prova que
 * ela é da mesma empresa).
 */
export type AlvoSenha = {
  id: string;
  e_dono: boolean;
  ativo: boolean;
  auth_user_id: string | null;
} | null;

export type DecisaoSenha = { pode: true } | { pode: false; motivo: string };

export function podeRedefinirSenha(ator: AtorSenha, alvo: AlvoSenha): DecisaoSenha {
  if (!alvo) return { pode: false, motivo: "Pessoa não encontrada." };
  if (alvo.id === ator.usuarioId) {
    return { pode: false, motivo: "Pra trocar a sua própria senha, use Trocar senha no seu menu." };
  }
  if (alvo.e_dono && !ator.eDono) {
    return { pode: false, motivo: "Só o dono redefine a senha do dono." };
  }
  if (!alvo.ativo) {
    return { pode: false, motivo: "O acesso desta pessoa está desativado. Reative antes de redefinir a senha." };
  }
  if (!alvo.auth_user_id) {
    return { pode: false, motivo: "Esta pessoa ainda não tem login no sistema." };
  }
  return { pode: true };
}

/** `user_metadata` novo ao voltar pra provisória: mantém o que já existe e liga a marca. */
export function metadataComSenhaProvisoria(existente: Record<string, unknown> | null | undefined): Record<string, unknown> {
  return { ...(existente ?? {}), senha_provisoria: true };
}

/**
 * Texto pronto pra quem cadastrou (ou redefiniu) copiar e mandar pra pessoa,
 * por WhatsApp por exemplo. Sem emoji e sem travessão.
 */
export function mensagemDeAcesso(dados: { nome: string; endereco: string; email: string; senha: string }): string {
  const primeiroNome = dados.nome.trim().split(/\s+/)[0] || dados.nome.trim();
  return [
    `Oi, ${primeiroNome}. Seu acesso ao nosso sistema está pronto.`,
    "",
    `Endereço: ${dados.endereco}`,
    `E-mail: ${dados.email}`,
    `Senha provisória: ${dados.senha}`,
    "",
    "Quando você entrar, o sistema vai pedir pra você trocar essa senha por uma só sua.",
  ].join("\n");
}
