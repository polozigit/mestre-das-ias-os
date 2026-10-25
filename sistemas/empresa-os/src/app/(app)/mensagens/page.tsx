import { requireAcesso } from "@/lib/auth/guards";
import { Inbox } from "@/components/mensageria/Inbox";

export const metadata = { title: "Mensagens" };
export default async function MensagensPage() {
  const sessao = await requireAcesso("mensagens");
  return <Inbox usuarioId={sessao.usuarioId} podeEscrever={sessao.eDono || sessao.permissoes.includes("mensageria.write")} podeGerir={sessao.eDono || sessao.permissoes.includes("mensageria.manage")} />;
}
