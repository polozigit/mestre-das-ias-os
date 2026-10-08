import { requireAcesso } from "@/lib/auth/guards";

/** Gate do módulo Tarefas: quem não pode, é redirecionado antes de qualquer página. */
export default async function TarefasLayout({
  children,
}: Readonly<{ children: React.ReactNode }>) {
  await requireAcesso("tarefas");
  return children;
}
