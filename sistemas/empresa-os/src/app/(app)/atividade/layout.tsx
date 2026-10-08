import { requireAcesso } from "@/lib/auth/guards";

/** Gate do módulo Atividade — 1 linha, como manda o guia (RLS é a defesa real). */
export default async function LayoutAtividade({
  children,
}: Readonly<{ children: React.ReactNode }>) {
  await requireAcesso("atividade");
  return children;
}
