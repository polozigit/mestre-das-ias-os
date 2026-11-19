// Login do dono SEM e-mail (decisão do Polozi, 17/11): o dono nasce com a senha
// provisória, nos dois bancos (produção e homologação), e o sistema avisa para trocar.
// O e-mail padrão do Supabase só entrega para membro da organização, 2 por hora e em
// inglês: o convite se perdia. Contrato com src/lib/senha-provisoria.ts (mesma senha e
// a marca `user_metadata.senha_provisoria`, que a tela de trocar senha grava false).
export const SENHA_PROVISORIA = "mudar@123";

/**
 * O que o setup faz com o login do dono.
 * - "criar": não existe no Auth; nasce com a senha provisória e o e-mail confirmado.
 * - "provisoria": existe e recebe a senha provisória. Só quando o dono pediu para zerar
 *   (ZERAR_SENHA=1) ou quando ele NUNCA entrou e não trocou a senha (convite antigo não
 *   usado): nada se perde.
 * - "manter": já trocou (marca false), já está na provisória (marca true) ou já entrou
 *   alguma vez: a senha não muda.
 */
export function decidirSenhaDono(usuario, { zerar = false } = {}) {
  if (!usuario) return "criar";
  if (zerar) return "provisoria";
  const marca = usuario.user_metadata?.senha_provisoria;
  if (marca === true || marca === false) return "manter";
  return usuario.last_sign_in_at ? "manter" : "provisoria";
}
