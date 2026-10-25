import { requireAcesso } from "@/lib/auth/guards";
import {getSessao} from '@/lib/auth/sessao';
import {pode} from '@/lib/auth/permissoes';

/** Cada página mantém seu próprio guard. Gerir números não concede leitura dos dados gerais da empresa. */
export default async function ConfiguracoesLayout({
  children,
}: Readonly<{ children: React.ReactNode }>) {
  const sessao=await getSessao();
  if(!pode(sessao,'configuracoes')&&!pode(sessao,'whatsapp'))await requireAcesso('configuracoes');
  return <>{children}</>;
}
