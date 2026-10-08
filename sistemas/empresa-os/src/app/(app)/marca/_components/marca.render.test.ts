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
