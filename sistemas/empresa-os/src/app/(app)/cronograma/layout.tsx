import { requireAcesso } from "@/lib/auth/guards";

/** Gate do módulo Cronograma (RLS é a defesa real). */
export default async function LayoutCronograma({
  children,
}: Readonly<{ children: React.ReactNode }>) {
  await requireAcesso("cronograma");
  return children;
}
