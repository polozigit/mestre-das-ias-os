import { requireAcesso } from "@/lib/auth/guards";

/** Gate do módulo Time de Agentes — 1 linha, como manda o guia (RLS é a defesa real). */
export default async function LayoutAgentes({
  children,
}: Readonly<{ children: React.ReactNode }>) {
  await requireAcesso("agentes");
  return children;
}
