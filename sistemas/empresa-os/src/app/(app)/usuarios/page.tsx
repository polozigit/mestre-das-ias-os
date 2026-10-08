import { requireAcesso } from "@/lib/auth/guards";
import { createClient } from "@/lib/supabase/server";
import { createServiceClient } from "@/lib/supabase/service";
import { Card } from "@/components/ui/Card";
import { MembrosTable } from "@/components/admin/MembrosTable";
import { agruparPermissoes, podeMexerNoSlug } from "./regras";

/**
 * Usuários — quem tem acesso ao sistema e o que cada pessoa pode fazer.
 * Server Component: a RLS libera a lista e as permissões a quem tem
 * `usuarios.manage`.
 */

/**
 * Sinal REAL de "aceitou o convite": o fluxo de convite grava auth_user_id já
 * no INSERT, então a tabela usuarios sozinha não distingue convidado pendente de
 * membro ativo. A fonte é o Auth Admin API: last_sign_in_at preenchido = a
 * pessoa já logou ao menos uma vez. Página master-only e server-side — a
 * service key nunca encosta no client. Devolve null quando o Auth não
 * respondeu (aí a página não inventa pendência).
 */
async function conviteAceitoPorAuthId(): Promise<Map<string, boolean> | null> {
  try {
    const service = createServiceClient();
    // perPage 1000 cobre o template com folga (empresas pequenas); acima disso os
    // usuários fora da 1ª página caem no default "já logou" (ver abaixo).
    const { data, error } = await service.auth.admin.listUsers({ perPage: 1000 });
    if (error) return null;
    return new Map(data.users.map((u) => [u.id, u.last_sign_in_at != null]));
  } catch {
    return null; // service key ausente/ambiente sem Admin API: segue sem o sinal
  }
}

export default async function UsuariosPage() {
  const sessao = await requireAcesso("usuarios");
  const supabase = await createClient();

  const [usuariosRes, permsRes, modulosRes, concedidasRes] = await Promise.all([
    supabase
      .from("usuarios")
      .select("id, nome, email, e_dono, ativo, auth_user_id, criado_em")
      .order("criado_em", { ascending: true }),
    supabase.from("permissoes").select("slug, modulo, acao, descricao"),
    supabase.from("modulo").select("slug, nome, ligado"),
    supabase.from("usuarios_permissoes").select("usuario_id, permissao"),
  ]);
  const error = usuariosRes.error ?? permsRes.error ?? modulosRes.error ?? concedidasRes.error;

  const aceitos = await conviteAceitoPorAuthId();
  const concedidas = new Map<string, string[]>();
  for (const c of concedidasRes.data ?? []) {
    concedidas.set(c.usuario_id, [...(concedidas.get(c.usuario_id) ?? []), c.permissao]);
  }
  const membros = (usuariosRes.data ?? []).map((m) => ({
    ...m,
    permissoes: concedidas.get(m.id) ?? [],
    // Sem o sinal do Auth (aceitos null) ou conta fora da 1ª página, assume
    // "já logou": "Ativo" a mais é melhor que pendência falsa. auth_user_id
    // NULL é pendente sempre: sem conta, ninguém loga.
    aceitou_convite:
      m.auth_user_id !== null && (aceitos ? (aceitos.get(m.auth_user_id) ?? true) : true),
  }));
  // `usuarios.manage` só o dono concede: quem não é dono nem vê a opção.
  const grupos = agruparPermissoes(
    (permsRes.data ?? []).filter((p) => podeMexerNoSlug(p.slug, sessao)),
    modulosRes.data ?? [],
  );

  return (
    <div className="mx-auto max-w-4xl space-y-6">
      <div>
        <h1 className="font-display text-2xl font-bold text-fg-1">Usuários</h1>
        <p className="mt-1 text-sm text-fg-3">
          Quem entra no sistema e o que cada pessoa pode ver e fazer. Convites chegam por e-mail.
        </p>
      </div>

      {error ? (
        <Card className="px-5 py-4">
          <p className="text-sm text-erro">
            Não deu pra carregar as pessoas agora: {error.message}
          </p>
        </Card>
      ) : (
        <MembrosTable
          membros={membros}
          grupos={grupos}
          sessaoUsuarioId={sessao.usuarioId}
          sessaoEDono={sessao.eDono}
        />
      )}
    </div>
  );
}
