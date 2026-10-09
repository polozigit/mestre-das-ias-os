import test from "node:test";
import assert from "node:assert/strict";
import { register } from "node:module";
import { createElement } from "react";
import { renderToStaticMarkup } from "react-dom/server";
import { abertosDasAbas, hrefsDasAbas, porAba, type Aba } from "../../../../lib/marca.ts";

/*
 * Render DE VERDADE da tela Marca: as três abas e o documento de cada uma, como o navegador recebe do servidor
 * com cada endereço (?aba=). A página monta os painéis com as mesmas funções que este teste usa
 * (porAba, abertosDasAbas, hrefsDasAbas, montarPaineis); o que escolhe a aba é a URL, lida pela AbasMarca.
 *
 * O defeito que isto guarda (QA do preview, 07/10/2026): clicar em Persona ou Dossiê continuava mostrando o
 * documento da Identidade. A aba nova só aparecia depois de o servidor responder, sem aviso nenhum na tela.
 * Agora o servidor entrega as três abas já desenhadas, e trocar de aba é só escolher qual aparece.
 */
register("../../../../lib/carregador-tsx-para-teste.mjs", import.meta.url);
const { AbasMarca } = await import("./AbasMarca.tsx");
const { montarPaineis } = await import("./PainelDocumento.tsx");
const { IdentidadeMarca } = await import("./IdentidadeMarca.tsx");
const { juntarMarca } = await import("../../../../lib/marca-dados.ts");
const { SearchParamsContext } = await import("next/dist/shared/lib/hooks-client-context.shared-runtime.js");

const MARCA = { id: "m1", tipo: "marca", titulo: "Exemplo: manual da marca", caminho_origem: "exemplo/marca.md", publicado_em: "2026-10-07T12:00:00Z" };
const MARCA_VELHA = { id: "m0", tipo: "marca", titulo: "Tom de voz", caminho_origem: "exemplo/voz.md", publicado_em: "2026-10-01T12:00:00Z" };
const PERSONA = { id: "p1", tipo: "persona", titulo: "Exemplo: persona do cliente", caminho_origem: "exemplo/persona.md", publicado_em: "2026-10-06T12:00:00Z" };
const TEXTOS = new Map([
  ["m1", "Tom de voz: simples, direto e gentil."],
  ["m0", "Fale como quem conversa no balcão."],
  ["p1", "Dona Maria tem uma padaria."],
]);

/** A tela como a página monta: `busca` é a query da URL; `docPedido` o `?doc=` que a página recebe. */
function tela(busca: string, docs = [MARCA, PERSONA], docPedido?: string, imagens = new Map<Aba, string>()): string {
  const grupos = porAba(docs);
  const abertos = abertosDasAbas(grupos, docPedido);
  return renderToStaticMarkup(
    createElement(
      SearchParamsContext.Provider,
      { value: new URLSearchParams(busca) as never },
      createElement(AbasMarca, {
        contagem: { marca: grupos.marca.length, persona: grupos.persona.length, dossie: grupos.dossie.length },
        hrefs: hrefsDasAbas(grupos, abertos),
        paineis: montarPaineis(grupos, abertos, TEXTOS, imagens),
      }),
    ),
  );
}

const desescapar = (t: string) => t.replace(/&quot;/g, '"').replace(/&#x27;/g, "'").replace(/&amp;/g, "&").replace(/&lt;/g, "<").replace(/&gt;/g, ">");
const texto = (html: string) => desescapar(html.replace(/<[^>]*>/g, " ")).replace(/\s+/g, " ").trim();

/** As abas (links com role="tab"): id, endereço, se está selecionada e o texto (rótulo e contagem). */
function abas(html: string) {
  return [...html.matchAll(/<a ([^>]*role="tab"[^>]*)>([\s\S]*?)<\/a>/g)].map((m) => ({
    id: /\sid="([^"]*)"|^id="([^"]*)"/.exec(m[1])?.slice(1).find(Boolean) ?? "",
    href: desescapar(/href="([^"]*)"/.exec(m[1])?.[1] ?? ""),
    selecionada: /aria-selected="true"/.test(m[1]),
    texto: texto(m[2]),
  }));
}

/** Os painéis (role="tabpanel"), um por aba: id, se está escondido e o texto de dentro. Os painéis são irmãos. */
function paineis(html: string) {
  const aberturas = [...html.matchAll(/<div ([^>]*role="tabpanel"[^>]*)>/g)];
  return aberturas.map((m, i) => ({
    id: /(?:^|\s)id="([^"]*)"/.exec(m[1])?.[1] ?? "",
    oculto: /(?:^|\s)hidden(?:=|\s|$)/.test(m[1]),
    texto: texto(html.slice(m.index! + m[0].length, aberturas[i + 1]?.index ?? html.length)),
  }));
}
const visivel = (html: string) => paineis(html).filter((p) => !p.oculto);

test("?aba=persona abre o documento de persona, e o da marca fica escondido", () => {
  const h = tela("aba=persona");
  const v = visivel(h);
  assert.deepEqual(v.map((p) => p.id), ["painel-persona"]);
  assert.match(v[0].texto, /Exemplo: persona do cliente/);
  assert.match(v[0].texto, /Dona Maria tem uma padaria\./);
  assert.doesNotMatch(v[0].texto, /manual da marca|Tom de voz: simples/);
  assert.deepEqual(abas(h).filter((a) => a.selecionada).map((a) => a.id), ["aba-persona"]);
});

test("?aba=dossie sem documento mostra o estado vazio com a frase pra pedir à IA", () => {
  const h = tela("aba=dossie");
  const v = visivel(h);
  assert.deepEqual(v.map((p) => p.id), ["painel-dossie"]);
  assert.match(v[0].texto, /Dossiê ainda não foi publicado/);
  assert.match(v[0].texto, /Peça à sua IA: "registra o dossiê"\. Ele aparece aqui quando estiver pronto\./);
  assert.doesNotMatch(v[0].texto, /manual da marca|persona do cliente/);
  assert.deepEqual(abas(h).filter((a) => a.selecionada).map((a) => a.id), ["aba-dossie"]);
});

test("sem ?aba=, ou com valor inválido, abre a Identidade e voz", () => {
  for (const busca of ["", "aba=", "aba=xyz", "doc=m1", "aba=PERSONA"]) {
    const h = tela(busca);
    assert.deepEqual(visivel(h).map((p) => p.id), ["painel-marca"], `busca "${busca}"`);
    assert.match(visivel(h)[0].texto, /Exemplo: manual da marca/);
    assert.deepEqual(abas(h).filter((a) => a.selecionada).map((a) => a.id), ["aba-marca"], `busca "${busca}"`);
  }
});

test("as três abas já vêm na página: trocar de aba não depende de uma nova ida ao servidor", () => {
  const todos = paineis(tela("aba=marca"));
  assert.deepEqual(todos.map((p) => p.id), ["painel-marca", "painel-persona", "painel-dossie"]);
  assert.deepEqual(todos.map((p) => p.oculto), [false, true, true]);
  assert.match(todos[0].texto, /Tom de voz: simples, direto e gentil\./);
  assert.match(todos[1].texto, /Dona Maria tem uma padaria\./);
  assert.match(todos[2].texto, /Dossiê ainda não foi publicado/);
});

test("cada aba é um link de verdade pro seu endereço (funciona sem JavaScript) e mostra quantos documentos tem", () => {
  const a = abas(tela("", [MARCA, MARCA_VELHA, PERSONA]));
  assert.deepEqual(a.map((x) => x.href), ["/marca?aba=marca", "/marca?aba=persona", "/marca?aba=dossie"]);
  assert.deepEqual(a.map((x) => x.texto), ["Identidade e voz 2", "Persona 1", "Dossiê 0"]);
});

test("com 2 documentos na aba, a lista de documentos aparece e o aberto é o pedido", () => {
  const h = tela("aba=marca&doc=m0", [MARCA, MARCA_VELHA, PERSONA], "m0");
  const marca = paineis(h)[0];
  assert.match(marca.texto, /Tom de voz Publicado/); // título do aberto
  assert.match(marca.texto, /Fale como quem conversa no balcão\./);
  assert.doesNotMatch(marca.texto, /simples, direto e gentil/);
  const links = [...h.matchAll(/<a ([^>]*)>([\s\S]*?)<\/a>/g)]
    .filter((m) => !/role="tab"/.test(m[1]))
    .map((m) => [desescapar(/href="([^"]*)"/.exec(m[1])?.[1] ?? ""), texto(m[2])]);
  assert.deepEqual(links, [
    ["/marca?aba=marca&doc=m1", "Exemplo: manual da marca"],
    ["/marca?aba=marca&doc=m0", "Tom de voz"],
  ]);
});

test("a aba aberta num documento que não é o mais recente leva o documento no endereço", () => {
  const a = abas(tela("aba=marca&doc=m0", [MARCA, MARCA_VELHA, PERSONA], "m0"));
  assert.equal(a[0].href, "/marca?aba=marca&doc=m0");
  assert.equal(a[1].href, "/marca?aba=persona");
});

test("com um documento só na aba, não aparece lista de documentos", () => {
  assert.doesNotMatch(tela("aba=persona"), /doc=/);
});

test("a imagem do documento aparece só na aba dele", () => {
  const h = tela("aba=marca", [MARCA, PERSONA], undefined, new Map<Aba, string>([["marca", "https://exemplo.test/logo.png"]]));
  const [marca, persona] = [h.slice(h.indexOf('id="painel-marca"'), h.indexOf('id="painel-persona"')), h.slice(h.indexOf('id="painel-persona"'))];
  assert.match(marca, /<img src="https:\/\/exemplo\.test\/logo\.png" alt="Exemplo: manual da marca"/);
  assert.doesNotMatch(persona, /<img/);
});

test("documento aberto sem texto (some entre as duas consultas) cai no estado vazio da aba", () => {
  const grupos = porAba([MARCA]);
  const abertos = abertosDasAbas(grupos, undefined);
  const painel = renderToStaticMarkup(montarPaineis(grupos, abertos, new Map(), new Map()).marca as never);
  assert.match(texto(painel), /Identidade e voz ainda não foi publicado/);
  assert.doesNotMatch(painel, /manual da marca/);
});

test("os painéis ficam ligados às abas (acessibilidade): aria-controls aponta pro painel, aria-labelledby pra aba", () => {
  const h = tela("aba=persona");
  for (const aba of ["marca", "persona", "dossie"]) {
    assert.match(h, new RegExp(`id="aba-${aba}"`));
    assert.match(h, new RegExp(`aria-controls="painel-${aba}"`));
    assert.match(h, new RegExp(`id="painel-${aba}"[^>]*aria-labelledby="aba-${aba}"|aria-labelledby="aba-${aba}"[^>]*id="painel-${aba}"`));
  }
});

// ---------------------------------------------------------------------------
// Identidade em divisões (blocos marca-dados)
// ---------------------------------------------------------------------------

const BLOCO_IDENTIDADE = {
  documento: "identidade",
  versao: 1,
  personalidade: { palavras: ["acolhedora", "direta"], arquetipo: { principal: "Prestativo", secundario: "Inocente" } },
  cores: [
    { nome: "Azul Mar", hex: "#1F4E79", funcao: "principal", origem: "logo" },
    { nome: "Areia", hex: "#F4EBD9", funcao: "fundo", origem: "proposta" },
  ],
  pares: [
    { texto: "Azul Mar", fundo: "Areia", razao: 8.1, uso: "texto" },
    { texto: "Areia", fundo: "Azul Mar", razao: 8.1, uso: "destaque" },
    { texto: "Fantasma", fundo: "Areia", razao: 3, uso: "texto" },
  ],
  tipografia: [{ uso: "titulos", familia: "Montserrat", pesos: [600, 700], fonte: "google", licenca: "OFL", origem: "site" }],
  materiais: [{ n: 1, tipo: "site", alvo: "https://exemplo.com.br", visto_em: "2026-10-08" }],
};
const BLOCO_VOZ = {
  documento: "voz",
  versao: 1,
  escalas: [
    { eixo: "formal-casual", posicao: 4, origem: "dossie" },
    { eixo: "serio-engracado", posicao: 2, origem: "persona" },
    { eixo: "respeitoso-irreverente", posicao: 1, origem: "proposta" },
    { eixo: "factual-entusiasmado", posicao: 3, origem: "dossie" },
  ],
  palavras: ["próxima", "clara"],
  anti: ["fria"],
};
const cerca = (o: unknown) => "## Dados para o sistema\n\n```marca-dados\n" + JSON.stringify(o) + "\n```\n";
const DOC_ID = {
  id: "m1",
  titulo: "Identidade da marca - Padaria",
  publicado_em: "2026-10-08T12:00:00Z",
  caminho_origem: "empresa/marca/identidade-visual.md",
  texto: "# Identidade\n\n## 1. Plataforma da marca\nPropósito: pão de verdade.\n\n## 4. Cores\nProporção 60-30-10.\n\n## 9. Fontes\n- [1] site\n\n" + cerca(BLOCO_IDENTIDADE),
};
const DOC_VOZ = {
  id: "m2",
  titulo: "Tom de voz - Padaria",
  publicado_em: "2026-10-08T11:00:00Z",
  caminho_origem: "empresa/marca/tom-de-voz.md",
  texto: "# Voz\n\n## 1. Como a marca soa\nFalamos como no balcão.\n\n" + cerca(BLOCO_VOZ),
};

function telaIdentidade(logos: { papel: "principal"; url: string }[] = []): string {
  const marca = juntarMarca([DOC_ID, DOC_VOZ])!;
  const docs = [DOC_ID, DOC_VOZ].map((d) => ({ id: d.id, tipo: "marca", titulo: d.titulo, caminho_origem: d.caminho_origem, publicado_em: d.publicado_em }));
  const grupos = porAba(docs);
  const abertos = abertosDasAbas(grupos, undefined);
  const painel = createElement(IdentidadeMarca, { marca, logos });
  return renderToStaticMarkup(
    createElement(
      SearchParamsContext.Provider,
      { value: new URLSearchParams("aba=marca") as never },
      createElement(AbasMarca, {
        contagem: { marca: 2, persona: 0, dossie: 0 },
        hrefs: hrefsDasAbas(grupos, abertos),
        paineis: montarPaineis(grupos, abertos, new Map(), new Map(), painel),
      }),
    ),
  );
}

test("aba com bloco válido mostra cores, tipografia e voz em divisões (não o texto do documento)", () => {
  const h = telaIdentidade();
  const marca = paineis(h)[0];
  assert.equal(marca.oculto, false);
  // navegação por divisão, só das que têm conteúdo, com âncora e alvo de toque >= 44px
  const nav = h.slice(h.indexOf('aria-label="Divisões da identidade"'));
  const ancoras = [...nav.slice(0, nav.indexOf("</nav>")).matchAll(/<a href="#(marca-[a-z]+)"[^>]*class="([^"]*)"[^>]*>([^<]*)<\/a>/g)];
  assert.deepEqual(ancoras.map((m) => [m[1], m[3]]), [
    ["marca-essencia", "Essência"],
    ["marca-personalidade", "Personalidade"],
    ["marca-cores", "Cores"],
    ["marca-tipografia", "Tipografia"],
    ["marca-voz", "Voz"],
    ["marca-fontes", "Fontes"],
  ]);
  for (const m of ancoras) assert.match(m[2], /min-h-11/);
  for (const [id] of ancoras.map((m) => [m[1]])) assert.match(h, new RegExp(`id="${id}"`));
  // cores: nome, HEX, função, origem; amostra pelo HEX validado
  assert.match(marca.texto, /Azul Mar/);
  assert.match(marca.texto, /#1F4E79/);
  assert.match(marca.texto, /Principal/);
  assert.match(marca.texto, /Origem: Logo/);
  assert.match(h, /style="background-color:#1F4E79"/);
  // pares de contraste: "Aa" no fundo real, razão e uso; par com cor inexistente é ignorado
  assert.match(h, /style="background-color:#F4EBD9;color:#1F4E79"/);
  assert.match(marca.texto, /8,10:1/);
  assert.match(marca.texto, /só destaque/);
  assert.doesNotMatch(marca.texto, /Fantasma/);
  // tipografia na própria família + link do Google Fonts montado só com a família validada
  assert.match(h, /font-family:&quot;Montserrat&quot;, ui-sans-serif/);
  assert.match(h, /<link rel="stylesheet" href="https:\/\/fonts\.googleapis\.com\/css2\?family=Montserrat:wght@600;700&amp;display=swap"/);
  // voz: 4 trilhos, palavras de tom e anti-tom, seção de texto no cartão
  assert.equal([...h.matchAll(/aria-label="[^"]*posição \d de 5/g)].length, 4);
  assert.match(marca.texto, /Soamos/);
  assert.match(marca.texto, /próxima/);
  assert.match(marca.texto, /Nunca soamos/);
  assert.match(marca.texto, /Falamos como no balcão\./);
  // seção de texto da plataforma via Markdown
  assert.match(marca.texto, /Propósito: pão de verdade\./);
  // o JSON do bloco não vaza pra tela
  assert.doesNotMatch(marca.texto, /marca-dados|"documento"/);
  // segurança: nada de HTML cru
  assert.doesNotMatch(h, /dangerouslySetInnerHTML|<script/);
});

test("rodapé lista os documentos publicados com o link ?doc= pro texto integral", () => {
  const h = telaIdentidade();
  const rodape = h.slice(h.indexOf("<footer"));
  const links = [...rodape.matchAll(/<a ([^>]*)>([^<]*)<\/a>/g)].map((m) => [desescapar(/href="([^"]*)"/.exec(m[1])?.[1] ?? ""), m[2]]);
  assert.deepEqual(links, [
    ["/marca?aba=marca&doc=m1", "Identidade da marca - Padaria"],
    ["/marca?aba=marca&doc=m2", "Tom de voz - Padaria"],
  ]);
});

test("logos assinados aparecem em quadro claro e escuro", () => {
  const h = telaIdentidade([{ papel: "principal", url: "https://exemplo.test/logo.png?token=abc" }]);
  assert.match(h, /id="marca-logo"/);
  assert.equal([...h.matchAll(/<img /g)].length, 2, "uma imagem em cada quadro");
  assert.match(h, /sobre claro/);
  assert.match(h, /sobre escuro/);
});

test("sem bloco válido a aba mostra o documento em texto, como antes (sem navegação de divisões)", () => {
  const h = tela("aba=marca");
  assert.doesNotMatch(h, /Divisões da identidade/);
  assert.match(paineis(h)[0].texto, /Exemplo: manual da marca/);
  assert.match(paineis(h)[0].texto, /Tom de voz: simples, direto e gentil\./);
  assert.equal(juntarMarca([{ id: "m1", titulo: "x", texto: TEXTOS.get("m1")!, publicado_em: "2026-10-07T12:00:00Z" }]), null);
});

test("texto integral pedido: documento em texto com o caminho de volta pra identidade", () => {
  const grupos = porAba([MARCA]);
  const abertos = abertosDasAbas(grupos, "m1");
  const painel = renderToStaticMarkup(montarPaineis(grupos, abertos, TEXTOS, new Map(), null, "/marca?aba=marca").marca as never);
  assert.match(texto(painel), /Voltar à identidade em divisões/);
  assert.match(desescapar(painel), /href="\/marca\?aba=marca"/);
  assert.match(texto(painel), /Tom de voz: simples, direto e gentil\./);
});
