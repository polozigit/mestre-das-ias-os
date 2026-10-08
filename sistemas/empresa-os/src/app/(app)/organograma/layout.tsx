import { requireAcesso } from "@/lib/auth/guards";

/** Gate do módulo Organograma (RLS é a defesa real). */
export default async function LayoutOrganograma({
  children,
}: Readonly<{ children: React.ReactNode }>) {
  await requireAcesso("organograma");
  return children;
}
