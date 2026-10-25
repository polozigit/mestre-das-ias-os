import { requireAcesso } from "@/lib/auth/guards";
import { AccountSettings } from "@/components/mensageria/AccountSettings";

export const metadata = { title: "Números do WhatsApp" };
export default async function WhatsappPage() {
  const sessao = await requireAcesso("whatsapp");
  return <AccountSettings dono={sessao.eDono} />;
}
