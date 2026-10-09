import type { ReactNode } from "react";
import { getSessao } from "@/lib/auth/sessao";
import { pode } from "@/lib/auth/permissoes";
import { createClient } from "@/lib/supabase/server";
import { createServiceClient } from "@/lib/supabase/service";
import { ABAS, abertosDasAbas, hrefMarca, hrefsDasAbas, porAba, type Aba } from "@/lib/marca";
import { arquivosDeLogo, juntarMarca, type DocMarca } from "@/lib/marca-dados";
import { AbasMarca } from "./_components/AbasMarca";
import { IdentidadeMarca } from "./_components/IdentidadeMarca";
import type { LogoParaTela } from "./_components/BlocosVisuais";
import { montarPaineis } from "./_components/PainelDocumento";

export const dynamic = "force-dynamic";

const MAX_DOCS_MARCA = 8;

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
  // A identidade em divisões junta os documentos de tipo marca (poucos: identidade, voz, logo), então o
  // texto dos mais recentes (até 8) vem junto.
  const docsMarca = grupos.marca.slice(0, MAX_DOCS_MARCA);
  const ids = [...new Set([...ABAS.flatMap((a) => abertos[a]?.id ?? []), ...docsMarca.map((d) => d.id)])];
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

  // `?doc=` de um documento da aba Identidade e voz pede o texto integral dele: aí vale o documento em texto.
  const textoIntegralPedido = !!sp.doc && grupos.marca.some((d) => d.id === sp.doc);
  const completa = juntarMarca(
    docsMarca.flatMap((d): DocMarca[] => {
      const texto = textos.get(d.id);
      return texto === undefined ? [] : [{ id: d.id, titulo: d.titulo, texto, publicado_em: d.publicado_em, caminho_origem: d.caminho_origem }];
    }),
  );
  const marcaCompleta = textoIntegralPedido ? null : completa;
  const temIdentidade = completa !== null; // define o link de volta no texto integral

  let painelMarca: ReactNode = null;
  if (marcaCompleta) {
    // Logos: o caminho no bucket é o próprio `arquivo` (ASCII seguro pela regex). Só com permissão da marca.
    const logos: LogoParaTela[] = [];
    const arquivos = arquivosDeLogo(marcaCompleta);
    if (arquivos.length > 0 && pode(await getSessao(), "marca")) {
      const publicados = createServiceClient().storage.from("publicados");
      const assinados = await Promise.all(
        arquivos.map(async (a) => {
          const { data: url } = await publicados.createSignedUrl(a.arquivo, 300);
          return url?.signedUrl ? ({ papel: a.papel, url: url.signedUrl } satisfies LogoParaTela) : null;
        }),
      );
      for (const l of assinados) if (l) logos.push(l);
    }
    // Logo publicado sem bloco válido: a imagem única do documento aberto continua aparecendo.
    const unica = imagens.get("marca");
    if (logos.length === 0 && unica) logos.push({ papel: "principal", url: unica });
    painelMarca = <IdentidadeMarca marca={marcaCompleta} logos={logos} />;
  }

  const paineis = montarPaineis(grupos, abertos, textos, imagens, painelMarca, textoIntegralPedido && temIdentidade ? hrefMarca("marca") : null);

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

      <AbasMarca contagem={contagem} hrefs={hrefs} paineis={paineis} />
    </div>
  );
}
