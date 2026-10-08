import { getSessao } from "@/lib/auth/sessao";
import { pode } from "@/lib/auth/permissoes";
import { createClient } from "@/lib/supabase/server";
import { createServiceClient } from "@/lib/supabase/service";
import { ABAS, abertosDasAbas, hrefsDasAbas, porAba, type Aba } from "@/lib/marca";
import { AbasMarca } from "./_components/AbasMarca";
import { montarPaineis } from "./_components/PainelDocumento";

export const dynamic = "force-dynamic";

// O `?aba=` quem lê é a AbasMarca, no navegador (é ela que troca de aba sem esperar o servidor); aqui só o `?doc=`.
type SearchParams = Promise<{ doc?: string }>;

export default async function MarcaPage({ searchParams }: { searchParams: SearchParams }) {
  const sp = await searchParams;
  const supabase = await createClient();

  // Lista sem `texto` (documentos podem ser grandes).
  const { data: lista, error: erroLista } = await supabase
    .from("documentos_publicados")
    .select("id, tipo, titulo, resumo, caminho_origem, imagem_caminho, publicado_em")
    .order("publicado_em", { ascending: false });
  // Erro de banco estoura (error.tsx segura): estado vazio seria indistinguivel de "nada publicado".
  if (erroLista) throw erroLista;
  const grupos = porAba(lista ?? []);
  const contagem = { marca: grupos.marca.length, persona: grupos.persona.length, dossie: grupos.dossie.length };
  const abertos = abertosDasAbas(grupos, sp.doc);
  const hrefs = hrefsDasAbas(grupos, abertos);

  // O texto do documento aberto de cada aba (no máximo 3) vem numa consulta só. As três abas chegam
  // desenhadas de uma vez, então trocar de aba não volta ao servidor.
  const ids = ABAS.flatMap((a) => abertos[a]?.id ?? []);
  const textos = new Map<string, string>();
  if (ids.length > 0) {
    const { data, error: erroTexto } = await supabase.from("documentos_publicados").select("id, texto").in("id", ids);
    if (erroTexto) throw erroTexto;
    for (const linha of data ?? []) textos.set(linha.id, linha.texto);
  }

  const imagens = new Map<Aba, string>();
  const comImagem = ABAS.flatMap((a) => {
    const caminho = abertos[a]?.imagem_caminho;
    return caminho ? [[a, caminho] as const] : [];
  });
  if (comImagem.length > 0 && pode(await getSessao(), "marca")) {
    const publicados = createServiceClient().storage.from("publicados");
    await Promise.all(
      comImagem.map(async ([aba, caminho]) => {
        const { data: url } = await publicados.createSignedUrl(caminho, 300);
        if (url?.signedUrl) imagens.set(aba, url.signedUrl);
      }),
    );
  }

  return (
    <div className="flex flex-col gap-6 pb-24">
      <header>
        <p className="eyebrow mb-2">Empresa</p>
        <h1 className="h2 mb-2">Marca</h1>
        <p className="max-w-2xl text-sm text-fg-3">
          Identidade e voz, persona e dossiê da empresa, como foram publicados pela sua IA. Para mudar um
          documento, peça à IA e republique.
        </p>
      </header>

      <AbasMarca contagem={contagem} hrefs={hrefs} paineis={montarPaineis(grupos, abertos, textos, imagens)} />
    </div>
  );
}
