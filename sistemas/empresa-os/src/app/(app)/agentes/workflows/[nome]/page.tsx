import { notFound } from "next/navigation";
import { requireAcesso } from "@/lib/auth/guards";
import { nomeArtefatoValido } from "@/lib/catalogo/catalogo";
import { DetalheArtefato } from "@/components/catalogo/DetalheArtefato";

export default async function PaginaWorkflow({ params }: { params: Promise<{ nome: string }> }) {
  const { nome } = await params;
  // decodeURIComponent lanca em % malformado: vira 404, nao 500.
  let decodificado: string;
  try {
    decodificado = decodeURIComponent(nome);
  } catch {
    notFound();
  }
  if (!nomeArtefatoValido(decodificado)) notFound();
  await requireAcesso("agentes");
  return <DetalheArtefato tipo="workflow" nome={decodificado} />;
}
