import { requireAcesso } from "@/lib/auth/guards";

/** Gate do módulo Marca (RLS é a defesa real). */
export default async function LayoutMarca({
  children,
}: Readonly<{ children: React.ReactNode }>) {
  await requireAcesso("marca");
  return children;
}
