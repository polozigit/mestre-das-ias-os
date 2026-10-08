import { requireAcesso } from "@/lib/auth/guards";

/** Gate do módulo Usuários: quem tem `usuarios.manage` (ou é o dono). */
export default async function UsuariosLayout({
  children,
}: Readonly<{ children: React.ReactNode }>) {
  await requireAcesso("usuarios");
  return <>{children}</>;
}
