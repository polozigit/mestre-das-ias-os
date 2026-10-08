import { requireAcesso } from "@/lib/auth/guards";

/** Gate do módulo Configurações: o dono ou quem tem a permissão `configuracoes.read` (PERMISSAO_MODULO em permissoes.ts). */
export default async function ConfiguracoesLayout({
  children,
}: Readonly<{ children: React.ReactNode }>) {
  await requireAcesso("configuracoes");
  return <>{children}</>;
}
