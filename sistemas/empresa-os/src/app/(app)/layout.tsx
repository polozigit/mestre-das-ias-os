import { redirect } from "next/navigation";
import { getSessao } from "@/lib/auth/sessao";
import { createClient } from "@/lib/supabase/server";
import { deveAvisarSenhaProvisoria } from "@/lib/senha-provisoria";
import { AvisoSenhaProvisoria } from "@/components/layout/AvisoSenhaProvisoria";
import { PermissionsProvider } from "@/lib/auth/PermissionsProvider";
import { MobileNavProvider } from "@/components/shell/MobileNavProvider";
import { Sidebar } from "@/components/shell/Sidebar";
import { TopBar } from "@/components/shell/TopBar";
import { NavegacaoProgresso } from "@/components/shell/NavegacaoProgresso";

/**
 * Shell autenticado (igual ao do Polozi OS): Sidebar recolhível no desktop,
 * gaveta aberta pelo hambúrguer da TopBar no celular. Sem barra de baixo.
 * O middleware já barra quem não tem sessão; este redirect é defesa em profundidade.
 */
export default async function AppLayout({
  children,
}: Readonly<{ children: React.ReactNode }>) {
  const sessao = await getSessao();
  if (!sessao) redirect("/login");

  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  const avisarSenha = deveAvisarSenhaProvisoria(user, process.env);

  return (
    <PermissionsProvider sessao={sessao}>
      <MobileNavProvider>
        <NavegacaoProgresso />
        <div className="flex min-h-screen bg-bg">
          <Sidebar />
          <div className="flex min-w-0 flex-1 flex-col">
            {avisarSenha && <AvisoSenhaProvisoria />}
            <TopBar />
            <main className="p-4 lg:p-8">{children}</main>
          </div>
        </div>
      </MobileNavProvider>
    </PermissionsProvider>
  );
}
