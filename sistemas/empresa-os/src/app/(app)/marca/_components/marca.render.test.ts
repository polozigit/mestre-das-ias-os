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

// ---------------------------------------------------------------------------
// Persona em blocos (lida do próprio markdown do documento)
// ---------------------------------------------------------------------------

const { painelDaPersona } = await import("./PersonaMarca.tsx");
const { lerPersona } = await import("../../../../lib/persona-dados.ts");
const { NavDivisoes } = await import("./NavDivisoes.tsx");

/** Molde novo (cópia do de persona-dados.test.ts, com uma fonte sem link a mais). */
const DOC_PERSONA_TEXTO = `# Cliente ideal e persona - Oficina Boa Roda

- Estado: rascunho
- Versão: 1.1 (2026-11-18)
- Origem da persona: proto-persona, montada do dossiê e da pesquisa.
- Fontes usadas: dossiê; pesquisa pública (1 fonte)

## 1. Cliente ideal

- Dono de carro com mais de cinco anos de uso, que mora perto da oficina (dossiê B5a e C7).
- Volta a cada seis meses (dossiê B2) (relato do dono, 2026-11-10).
- Compra pelo WhatsApp (material do dono, apresentação de 2026-11-02).

## 2. Persona: o motorista cuidadoso

- Nome do arquétipo: o motorista cuidadoso (proposta do time: não é uma pessoa real).
- Contexto: usa o carro todo dia para trabalhar (dossiê B5a).
- O que quer alcançar: chegar ao trabalho sem susto; ser visto como quem cuida do que é seu; sentir segurança (dossiê B5b).
- O que empurra (dores): ficar parado na estrada (pesquisa [1]).
- Linguagem do cliente: "meu carro me deixou na mão" e “queria saber o preço antes” (pesquisa [1]).

## 3. Nível de consciência por segmento

| Segmento | Nível | Sinal que mostra | O que a comunicação deve fazer |
|---|---|---|---|
| Motorista de aplicativo | 4 conhece a empresa | Pergunta preço no WhatsApp (dossiê C2) | Mandar o orçamento na hora (hipótese) |
| Frota pequena | sem número | Pede nota fiscal (hipótese) | Mostrar o contrato mensal (hipótese) |

## 4. Quem não é o cliente ideal

- Quem só quer o preço mais baixo da cidade (dossiê C6).

## 5. O que ainda não sabemos

| Lacuna | Pergunta para fechar | Quem responde |
|---|---|---|
| Como resolvia antes | Onde levava o carro antes de vir para cá? | dono |

## 6. Fontes da pesquisa

- [1] Avaliações de oficinas do bairro. https://mapas.exemplo.invalid/oficinas. Acessado em 2026-11-12.
- [2] Conversa no grupo do bairro.

## Anexo: o que o dono disse na montagem

- 2026-11-10 | Pergunta do time: quando volta? | Resposta do dono: "A cada seis meses."
`;

const DOC_PERSONA = { id: "p9", tipo: "persona", titulo: "Cliente ideal e persona - Oficina Boa Roda", caminho_origem: "empresa/marketing/persona.md", publicado_em: "2026-11-18T12:00:00Z" };

/** A aba Persona como a página monta: painelDaPersona decide entre blocos e texto. */
function telaPersona(docs = [DOC_PERSONA], textos = new Map([["p9", DOC_PERSONA_TEXTO]])): string {
  const grupos = porAba(docs);
  const abertos = abertosDasAbas(grupos, undefined);
  const aberto = abertos.persona;
  const painelPersona = painelDaPersona(grupos.persona, aberto, aberto ? (textos.get(aberto.id) ?? null) : null);
  return renderToStaticMarkup(
    createElement(
      SearchParamsContext.Provider,
      { value: new URLSearchParams("aba=persona") as never },
      createElement(AbasMarca, {
        contagem: { marca: grupos.marca.length, persona: grupos.persona.length, dossie: grupos.dossie.length },
        hrefs: hrefsDasAbas(grupos, abertos),
        paineis: montarPaineis(grupos, abertos, textos, new Map(), null, null, painelPersona),
      }),
    ),
  );
}

const ROTULOS_PLACAR = ["Você respondeu", "Pesquisa na internet", "Análise do especialista", "Hipótese", "Ainda não sabemos"];

/** Pares [rótulo, número] do placar, na ordem da tela. */
function placarDaTela(h: string): [string, number][] {
  const placar = h.slice(h.indexOf('aria-label="De onde vem cada item"'));
  return [...placar.slice(0, placar.indexOf("</dl>")).matchAll(/<dt[^>]*>([^<]*)<\/dt><dd[^>]*>(\d+)<\/dd>/g)].map((m) => [m[1], Number(m[2])]);
}

/** Trecho do HTML de uma divisão (section id="persona-<id>"). */
function divisao(h: string, id: string): string {
  const i = h.indexOf(`<section id="persona-${id}"`);
  assert.ok(i >= 0, `divisão ${id} presente`);
  return h.slice(i, h.indexOf("</section>", i));
}

test("aba Persona com documento no molde desenha os blocos com navegação, selos, placar, trilho e fontes", () => {
  const h = telaPersona();
  const v = visivel(h);
  assert.deepEqual(v.map((p) => p.id), ["painel-persona"]);
  const t = v[0].texto;
  // cabeçalho: título, publicado, origem e explicação do selo
  assert.match(t, /Cliente ideal e persona - Oficina Boa Roda/);
  assert.match(t, /Publicado/);
  assert.match(t, /Proto-persona, montada do dossiê e da pesquisa/); // a frase de origem começa com maiúscula
  assert.match(t, /selo/i);
  // placar em 5 números com rótulo
  const pares = placarDaTela(h);
  assert.deepEqual(pares.map((p) => p[0]), ROTULOS_PLACAR);
  // conferido à mão: dossiê/relato/material 7, pesquisa 2, análise 0, hipótese/proposta 4, não consta + lacunas 1
  assert.deepEqual(pares.map((p) => p[1]), [7, 2, 0, 4, 1]);
  // documento sem as partes novas: sem Descobertas, sem plano, sem oferta em foco
  assert.doesNotMatch(h, /id="persona-descobertas"|id="persona-plano"|Oferta em foco/);
  // navegação por divisão com prefixo persona- e alvo de toque
  const nav = h.slice(h.indexOf('aria-label="Divisões da persona"'));
  const ancoras = [...nav.slice(0, nav.indexOf("</nav>")).matchAll(/<a href="#(persona-[a-z-]+)"[^>]*class="([^"]*)"[^>]*>([^<]*)<\/a>/g)];
  assert.deepEqual(ancoras.map((m) => [m[1], m[3]]), [
    ["persona-retrato", "Retrato"],
    ["persona-cliente", "Cliente ideal"],
    ["persona-forcas", "Compra e trava"],
    ["persona-palavras", "Palavras do cliente"],
    ["persona-consciencia", "O quanto já sabe"],
    ["persona-nao-cliente", "Quem não é"],
    ["persona-falta", "O que falta saber"],
    ["persona-fontes", "Fontes"],
  ]);
  for (const m of ancoras) {
    assert.match(m[2], /min-h-11/);
    assert.match(h, new RegExp(`<section id="${m[1]}" aria-labelledby="${m[1]}-titulo"`));
    assert.match(h, new RegExp(`<h3 id="${m[1]}-titulo"`));
  }
  // bloco sem dado não aparece
  assert.doesNotMatch(h, /id="persona-escolha"/);
  // retrato: arquétipo, nota e as 3 partes
  const retrato = texto(divisao(h, "retrato"));
  assert.match(retrato, /O motorista cuidadoso/);
  assert.match(retrato, /Não é uma pessoa real\./);
  assert.match(retrato, /O que quer resolver chegar ao trabalho sem susto/);
  assert.match(retrato, /Como quer ser visto ser visto como quem cuida do que é seu/);
  assert.match(retrato, /Como quer se sentir sentir segurança/);
  // cliente ideal: um cartão por item; item com duas origens mostra os dois selos
  const cliente = divisao(h, "cliente");
  assert.equal([...cliente.matchAll(/<li /g)].length, 3);
  assert.match(texto(cliente), /Volta a cada seis meses Origem: Dossiê Origem: Você contou/);
  assert.match(texto(cliente), /Origem: Material seu/);
  // compra e trava: duas colunas com títulos
  const forcas = texto(divisao(h, "forcas"));
  assert.match(forcas, /Empurra para a compra/);
  assert.match(forcas, /Segura a compra/);
  assert.match(forcas, /ficar parado na estrada Origem: Pesquisa/);
  // palavras: citações em destaque, com selo
  const palavras = divisao(h, "palavras");
  assert.equal([...palavras.matchAll(/<blockquote/g)].length, 2);
  assert.match(texto(palavras), /meu carro me deixou na mão/);
  assert.match(texto(palavras), /queria saber o preço antes/);
  // consciência: o trilho é só desenho (aria-hidden); quem lê a tela ouve o texto "Nível X de 5" uma vez
  const consciencia = divisao(h, "consciencia");
  assert.doesNotMatch(consciencia, /role="img"/);
  assert.match(consciencia, /<div aria-hidden="true" class="relative flex h-6/);
  assert.match(texto(consciencia), /Nível 4 de 5: conhece a empresa, mas ainda não se decidiu/);
  assert.equal([...texto(consciencia).matchAll(/Nível \d de 5/g)].length, 1);
  assert.match(texto(consciencia), /Frota pequena/);
  assert.match(texto(consciencia), /Mandar o orçamento na hora Origem: Hipótese/);
  // não é cliente, o que falta e a dica pra IA
  assert.match(texto(divisao(h, "nao-cliente")), /preço mais baixo da cidade Origem: Dossiê/);
  const falta = texto(divisao(h, "falta"));
  assert.match(falta, /Como resolvia antes/);
  assert.match(falta, /Pergunta para fechar: Onde levava o carro antes de vir para cá\?/);
  assert.match(falta, /Peça à sua IA: "atualiza a persona com o que falta"/);
  // fontes: link só com url, nova guia segura, data dd/mm/aaaa
  const fontes = divisao(h, "fontes");
  const links = [...fontes.matchAll(/<a ([^>]*)>/g)].map((m) => m[1]);
  assert.equal(links.length, 1);
  assert.match(links[0], /href="https:\/\/mapas\.exemplo\.invalid\/oficinas"/);
  assert.match(links[0], /target="_blank"/);
  assert.match(links[0], /rel="noopener noreferrer"/);
  assert.match(texto(fontes), /visto em 12\/11\/2026/);
  assert.match(texto(fontes), /Conversa no grupo do bairro/);
  // texto completo recolhido, com o Markdown do documento (inclusive o anexo)
  const det = h.slice(h.indexOf("<details"));
  assert.doesNotMatch(det.slice(0, det.indexOf(">")), /\sopen/);
  assert.match(texto(det), /Texto completo do documento/);
  assert.match(texto(det), /A cada seis meses/);
  // segurança e texto da interface
  assert.doesNotMatch(h, /dangerouslySetInnerHTML|<script/);
  assert.doesNotMatch(t, /Empresa OS|fábrica|Polozi/);
});

test("campo da persona sem dado, num bloco que aparece, diz 'Ainda não sabemos.'", () => {
  const forcas = texto(divisao(telaPersona(), "forcas"));
  // o documento só tem as dores: resultado, gatilho, objeções e hábito estão vazios
  assert.equal([...forcas.matchAll(/Ainda não sabemos\./g)].length, 4);
  assert.match(forcas, /O que ele espera ganhar Ainda não sabemos\./);
});

test("documento de persona fora do molde cai no texto, como antes", () => {
  const h = telaPersona([DOC_PERSONA], new Map([["p9", "Dona Maria tem uma padaria."]]));
  const v = visivel(h);
  assert.match(v[0].texto, /Dona Maria tem uma padaria\./);
  assert.doesNotMatch(h, /Divisões da persona|id="persona-/);
  assert.equal(painelDaPersona([DOC_PERSONA], DOC_PERSONA, "Dona Maria tem uma padaria."), null);
  assert.equal(painelDaPersona([], null, null), null);
  // reconhecida como persona, mas sem nenhum bloco com conteúdo: texto também (não uma página vazia)
  const semBloco = "# Cliente ideal e persona - X\n\n## 1. Cliente ideal\n\nAinda em montagem.\n";
  assert.notEqual(lerPersona(semBloco), null);
  assert.equal(painelDaPersona([DOC_PERSONA], DOC_PERSONA, semBloco), null);
});

test("com mais de um documento de persona, a lista de troca continua acima dos blocos", () => {
  const velho = { ...DOC_PERSONA, id: "p8", titulo: "Persona antiga", publicado_em: "2026-10-01T12:00:00Z" };
  const h = telaPersona([DOC_PERSONA, velho]);
  const links = [...h.matchAll(/<a ([^>]*)>([^<]*)<\/a>/g)]
    .filter((m) => /doc=/.test(m[1]) && !/role="tab"/.test(m[1]))
    .map((m) => [desescapar(/href="([^"]*)"/.exec(m[1])?.[1] ?? ""), m[2]]);
  assert.deepEqual(links, [
    ["/marca?aba=persona&doc=p9", "Cliente ideal e persona - Oficina Boa Roda"],
    ["/marca?aba=persona&doc=p8", "Persona antiga"],
  ]);
  assert.match(h, /id="persona-retrato"/);
});

test("NavDivisoes: prefixo padrão continua marca- e aceita outro prefixo", () => {
  const padrao = renderToStaticMarkup(createElement(NavDivisoes, { divisoes: [{ id: "cores", rotulo: "Cores" }] }));
  assert.match(padrao, /href="#marca-cores"/);
  const persona = renderToStaticMarkup(createElement(NavDivisoes, { divisoes: [{ id: "retrato", rotulo: "Retrato" }], prefixo: "persona-" }));
  assert.match(persona, /href="#persona-retrato"/);
  assert.doesNotMatch(persona, /marca-/);
});

test("a aba Identidade não muda com a Persona em blocos ao lado", () => {
  const h = telaIdentidade();
  assert.match(h, /aria-label="Divisões da identidade"/);
  assert.match(h, /href="#marca-essencia"/);
  assert.doesNotMatch(h, /persona-retrato/);
});

test("nome do arquétipo: sai sem a sobra 'só para a equipe conversar sobre ele' e com maiúscula", () => {
  const comSobra = DOC_PERSONA_TEXTO.replace(
    "- Nome do arquétipo: o motorista cuidadoso (proposta",
    "- Nome do arquétipo: o motorista cuidadoso, só para a equipe conversar sobre ele (proposta",
  );
  assert.notEqual(comSobra, DOC_PERSONA_TEXTO);
  // com o nome no título da seção e sem ele (documento antigo: "## 2. Persona")
  for (const doc of [comSobra, comSobra.replace("## 2. Persona: o motorista cuidadoso", "## 2. Persona")]) {
    const retrato = texto(divisao(telaPersona([DOC_PERSONA], new Map([["p9", doc]])), "retrato"));
    assert.match(retrato, /O motorista cuidadoso/);
    assert.doesNotMatch(retrato, /o motorista cuidadoso/);
    assert.doesNotMatch(retrato, /conversar sobre ele/);
  }
});

test("persona antiga, só com rótulos que a tela não conhece, não enche o Retrato de 'Ainda não sabemos.'", () => {
  const antiga = [
    "# Cliente ideal e persona - Escola Viva",
    "",
    "## 1. Cliente ideal",
    "",
    "- Empresas de 15 a 100 pessoas (dossiê 2.4).",
    "",
    "## 2. Persona",
    "",
    "- Nome do arquétipo: o dono atento (proposta do time: não é uma pessoa real).",
    "- Quem é: dono de empresa pequena (dossiê 2.4).",
    "- Como compra: pela indicação (dossiê 2.6).",
    "",
  ].join("\n");
  const retrato = texto(divisao(telaPersona([DOC_PERSONA], new Map([["p9", antiga]])), "retrato"));
  assert.match(retrato, /Quem é dono de empresa pequena/);
  assert.match(retrato, /Como compra pela indicação/);
  assert.doesNotMatch(retrato, /Ainda não sabemos\./);
});

// ---------------------------------------------------------------------------
// Molde do especialista: Descobertas, plano de mensagem, selo de análise, oferta em foco
// ---------------------------------------------------------------------------

/** Cópia do PERSONA_ESPECIALISTA de persona-dados.test.ts. */
const DOC_ESPECIALISTA_TEXTO = `# Cliente ideal e persona - Oficina Boa Roda

- Estado: rascunho
- Versão: 2.0 (2026-11-18)
- Oferta em foco: revisão completa com orçamento na hora (dossiê B3)
- Origem da persona: primeira versão, montada do que o dono respondeu e do que é público na internet; nenhum cliente foi ouvido.
- Fontes usadas: dossiê; pesquisa pública (2 fontes)

## 1. Cliente ideal

- Dono de carro com mais de cinco anos de uso (dossiê B5a).
- Escolhe pela confiança, não pelo menor preço (análise: dossiê B5b + pesquisa [2]).

## 2. Persona: o motorista cuidadoso

- Nome do arquétipo: o motorista cuidadoso (proposta do time: não é uma pessoa real).
- Faixa de idade: 35 a 55 anos (dossiê B5a).
- Contexto: usa o carro todo dia para trabalhar (dossiê B5a).
- O que empurra (dores): medo de ficar parado na estrada (pesquisa [1]).

## 3. Nível de consciência por segmento

| Segmento | Nível | Sinal que mostra | O que a comunicação deve fazer |
|---|---|---|---|
| Motorista de aplicativo | 4 conhece a empresa | Pergunta preço no WhatsApp (dossiê C2) | Mandar o orçamento na hora (análise: dossiê C2 + pesquisa [1]) |

## 4. Quem não é o cliente ideal

- Quem só quer o preço mais baixo da cidade (dossiê C6).

## 5. Descobertas

| Descoberta | O que você disse | O que o mercado mostra | O que fazer |
|---|---|---|---|
| O cliente tem medo de ser enganado no orçamento (análise: dossiê B8 + pesquisa [2]) | O cliente pede o preço antes de tudo (dossiê B8) | As avaliações reclamam de orçamento que muda no fim (pesquisa [2]) | Mandar foto da peça e o orçamento por escrito antes do serviço (análise: pesquisa [2]) |
| Quem volta é quem foi bem atendido na primeira vez (Analise: relato 2026-11-10) | Volta a cada seis meses (relato do dono, 2026-11-10) | Nada encontrado sobre isso (não consta) | Ligar seis meses depois para lembrar da revisão (hipótese) |

## 6. Plano de mensagem

- Promessa central: revisão sem surpresa no preço (análise: dossiê B8 + pesquisa [2]).
- Provas: doze anos no mesmo endereço (dossiê D6).
- Onde e quando falar: no WhatsApp, logo depois do primeiro contato (dossiê C1).
- Garantia: três meses em toda peça trocada (dossiê D7).

| Dúvida do cliente | Resposta pronta |
|---|---|
| E se o preço mudar no meio do serviço? (dossiê C7) | Nada muda sem você aprovar por escrito (análise: dossiê C10 + pesquisa [2]) |
| Quanto tempo fico sem o carro? (hipótese) | A revisão sai no mesmo dia, se o carro chegar até as nove (dossiê C10) |

## 7. O que ainda não sabemos

| Lacuna | Pergunta para fechar | Quem responde |
|---|---|---|
| Como resolvia antes | Onde levava o carro antes de vir para cá? | dono |

## 8. Fontes da pesquisa

- [1] Avaliações de oficinas do bairro. https://mapas.exemplo.invalid/oficinas. Acessado em 2026-11-12.
- [2] Reclamações de orçamento em oficinas. https://reclama.exemplo.invalid/oficinas. Acessado em 2026-11-12.

## Anexo: o que o dono disse na montagem

- 2026-11-10 | Pergunta do time: quando volta? | Resposta do dono: "A cada seis meses."
`;

const telaEspecialista = () => telaPersona([DOC_PERSONA], new Map([["p9", DOC_ESPECIALISTA_TEXTO]]));

test("especialista: Descobertas é a primeira divisão, o plano vem depois da consciência, na página e na navegação", () => {
  const h = telaEspecialista();
  const secoes = [...h.matchAll(/<section id="persona-([a-z-]+)" aria-labelledby="persona-\1-titulo"/g)].map((m) => m[1]);
  assert.deepEqual(secoes, ["descobertas", "retrato", "cliente", "forcas", "consciencia", "plano", "nao-cliente", "falta", "fontes"]);
  const nav = h.slice(h.indexOf('aria-label="Divisões da persona"'));
  const ancoras = [...nav.slice(0, nav.indexOf("</nav>")).matchAll(/<a href="#(persona-[a-z-]+)"[^>]*class="([^"]*)"[^>]*>([^<]*)<\/a>/g)];
  assert.deepEqual(ancoras.slice(0, 1).map((m) => [m[1], m[3]]), [["persona-descobertas", "Descobertas"]]);
  assert.deepEqual(ancoras.find((m) => m[1] === "persona-plano")?.[3], "O que fazer");
  for (const m of ancoras) assert.match(m[2], /min-h-11/);
  assert.match(h, /<h3 id="persona-descobertas-titulo"[^>]*>Descobertas<\/h3>/);
  assert.match(h, /<h3 id="persona-plano-titulo"[^>]*>O que fazer com isso<\/h3>/);
});

test("especialista: cada descoberta é um cartão com a frase em fonte de título, o que você disse, o mercado e o que fazer", () => {
  const bloco = divisao(telaEspecialista(), "descobertas");
  const cartoes = [...bloco.matchAll(/<li [\s\S]*?<\/li>/g)].map((m) => m[0]);
  assert.equal(cartoes.length, 2);
  // a frase em destaque, como título do cartão, na fonte de título
  assert.match(cartoes[0], /<h4 class="[^"]*font-display[^"]*">O cliente tem medo de ser enganado no orçamento<\/h4>/);
  const t = texto(cartoes[0]);
  assert.match(t, /^O cliente tem medo de ser enganado no orçamento Origem: Análise do especialista/);
  assert.match(t, /O que você disse O cliente pede o preço antes de tudo Origem: Dossiê/);
  assert.match(t, /O que o mercado mostra As avaliações reclamam de orçamento que muda no fim Origem: Pesquisa/);
  assert.match(t, /O que fazer Mandar foto da peça e o orçamento por escrito antes do serviço Origem: Análise do especialista$/);
  // lado a lado só a partir do computador: empilhado no celular
  assert.match(cartoes[0], /grid-cols-1[^"]*md:grid-cols-2/);
  assert.match(texto(cartoes[1]), /Nada encontrado sobre isso Origem: Não sabemos/);
});

test("especialista: o plano mostra a promessa em destaque, provas, onde e quando, extra e dúvidas com resposta pronta", () => {
  const bloco = divisao(telaEspecialista(), "plano");
  const t = texto(bloco);
  assert.match(bloco, /class="[^"]*font-display[^"]*">revisão sem surpresa no preço</);
  assert.match(t, /Promessa central revisão sem surpresa no preço Origem: Análise do especialista/);
  assert.match(t, /Provas doze anos no mesmo endereço Origem: Dossiê/);
  assert.match(t, /Onde e quando falar no WhatsApp, logo depois do primeiro contato Origem: Dossiê/);
  assert.match(t, /Garantia três meses em toda peça trocada/);
  // dúvidas: par pergunta e resposta, sem tabela
  assert.doesNotMatch(bloco, /<table/);
  assert.match(t, /Dúvida do cliente E se o preço mudar no meio do serviço\? Origem: Dossiê Resposta pronta Nada muda sem você aprovar por escrito Origem: Análise do especialista/);
  assert.match(t, /Dúvida do cliente Quanto tempo fico sem o carro\? Origem: Hipótese Resposta pronta A revisão sai no mesmo dia/);
});

test("especialista: cabeçalho com oferta em foco, explicação do selo de análise e placar de 5", () => {
  const h = telaEspecialista();
  const t = visivel(h)[0].texto;
  assert.match(t, /Oferta em foco: revisão completa com orçamento na hora(?! \()/);
  assert.match(t, /Análise do especialista” é uma conclusão/);
  const pares = placarDaTela(h);
  assert.deepEqual(pares.map((p) => p[0]), ROTULOS_PLACAR);
  assert.deepEqual(pares.map((p) => p[1]), [12, 2, 7, 3, 2]);
  // grade do placar: 2 colunas no celular (o quinto na linha inteira) e 5 no computador
  const dl = /<dl aria-label="De onde vem cada item" class="([^"]*)"/.exec(h)?.[1] ?? "";
  assert.match(dl, /grid-cols-2/);
  assert.match(dl, /md:grid-cols-5/);
  const ultimo = [...h.slice(h.indexOf('aria-label="De onde vem cada item"')).matchAll(/<div class="([^"]*)"><dt/g)][4]?.[1] ?? "";
  assert.match(ultimo, /col-span-2/);
  assert.match(ultimo, /md:col-span-1/);
  // selo novo no tom da marca
  assert.match(h, /bg-acento-suave[^"]*"><span class="sr-only">Origem: <\/span>Análise do especialista/);
  assert.doesNotMatch(h, /dangerouslySetInnerHTML|<script/);
  assert.doesNotMatch(t, /Empresa OS|fábrica|Polozi|—/);
});

test("celular a 375px: texto do documento, título da descoberta e link das fontes podem quebrar palavra longa", () => {
  const longa = "x".repeat(300);
  const texto = [
    "# Cliente ideal e persona - Oficina Boa Roda",
    "",
    "## 1. Cliente ideal",
    "",
    `- ${longa} (dossiê B1)`,
    "",
    "## 2. Descobertas",
    "",
    "| Descoberta | O que você disse | O que o mercado mostra | O que fazer |",
    "|---|---|---|---|",
    `| ${longa} (hipótese) | a (dossiê B1) | b (hipótese) | c (hipótese) |`,
    "",
    "## 8. Fontes da pesquisa",
    "",
    `- [1] https://exemplo.invalid/${longa} - Título`,
  ].join("\n");
  const h = telaPersona([DOC_PERSONA], new Map([["p9", texto]]));
  const classe = (re: RegExp) => /class="([^"]*)"/.exec(re.exec(h)?.[0] ?? "")?.[1] ?? "";
  for (const c of [
    classe(/<p class="[^"]*leading-relaxed[^"]*">x{300}/),
    classe(/<h4 class="[^"]*">x{300}/),
    classe(/<a [^>]*>Título/),
  ]) {
    assert.match(c, /\bmin-w-0\b/);
    assert.match(c, /\bbreak-words\b/);
  }
  assert.doesNotMatch(classe(/<a [^>]*>Título/), /inline-flex/);
});

// ---------------------------------------------------------------------------
// Estudo do cliente ideal (bloco ```persona-dados, lib/persona-estudo.ts)
// ---------------------------------------------------------------------------

/* eslint-disable @typescript-eslint/no-explicit-any -- mutações do JSON de exemplo nos testes abaixo */
const { EXEMPLO_ESTUDO_JSON } = await import("../../../../lib/persona-estudo.exemplo.ts");
const { IDS_CAPITULO, ROTULOS_CURTOS, PARA_ENTENDER } = await import("../../../../lib/persona-estudo.ts");

/** O persona.md como o script grava: markdown legível e, no fim, o bloco compacto. */
function docEstudo(mudar?: (o: Record<string, any>) => void, bloco?: string): string {
  const o = JSON.parse(EXEMPLO_ESTUDO_JSON);
  mudar?.(o);
  return [
    "# Estudo do cliente ideal - Clima Exemplo Ar-Condicionado",
    "",
    "- Estado: rascunho",
    "- Versão: 1.0 (2026-11-18)",
    "",
    "## Em uma frase",
    "",
    "- Arquétipo: A família do apartamento novo que não quer surpresa no preço nem na parede.",
    "- Linha legível do markdown, só no texto completo.",
    "",
    "## Dados para o sistema",
    "",
    "```persona-dados",
    bloco ?? JSON.stringify(o),
    "```",
    "",
  ].join("\n");
}

const DOC_ESTUDO = { id: "p20", tipo: "persona", titulo: "Estudo do cliente ideal - Clima Exemplo", caminho_origem: "empresa/publico/persona.md", publicado_em: "2026-11-19T12:00:00Z" };
const telaEstudo = (doc = docEstudo(), docs = [DOC_ESTUDO]) => telaPersona(docs, new Map([["p20", doc]]));

/** Trecho do HTML de um capítulo do estudo (section id="estudo-<id>"). */
function capitulo(h: string, id: string): string {
  const i = h.indexOf(`<section id="estudo-${id}"`);
  assert.ok(i >= 0, `capítulo ${id} presente`);
  const fim = h.indexOf('<section id="estudo-', i + 10);
  return h.slice(i, fim < 0 ? h.indexOf("<footer", i) : fim);
}

test("estudo: a aba Persona desenha o estudo do exemplo, com abertura, capítulos na ordem e navegação grudada", () => {
  const h = telaEstudo();
  const v = visivel(h);
  assert.deepEqual(v.map((p) => p.id), ["painel-persona"]);
  const t = v[0].texto;
  // nada do leitor antigo, nada do JSON cru
  assert.doesNotMatch(h, /id="persona-|Divisões da persona/);
  assert.doesNotMatch(t, /"versao":1|persona-dados|Dados para o sistema/);
  // abertura: manchete com a ênfase em itálico, retrato, legenda das 4 origens, nota de versão, oferta
  assert.match(h, /<h2[^>]*>A família do apartamento novo que <em[^>]*>não quer surpresa<\/em> no preço nem na parede\.<\/h2>/);
  assert.match(t, /Estudo do cliente ideal/);
  assert.match(t, /Em uma frase Casal que acabou de comprar o aparelho/);
  assert.match(t, /você disse resposta sua no dossiê ou na conversa/);
  assert.match(t, /pesquisa página pública, com link/);
  assert.match(t, /leitura do especialista conclusão tirada das evidências/);
  assert.match(t, /hipótese do especialista aposta, com a razão ao lado/);
  assert.match(t, /Primeira versão, de 18\/11\/2026, feita com as 59 perguntas do seu dossiê, 5 perguntas a você e 7 trechos de 5 páginas públicas\. Nenhum cliente foi ouvido ainda: o que é aposta está marcado/);
  assert.match(t, /Oferta em foco: instalação de ar-condicionado split em apartamento/);
  assert.match(t, /quando cruzadas entre si e com o que o mercado mostra\./);
  // capítulos: section com aria-labelledby, na ordem do contrato
  const secoes = [...h.matchAll(/<section id="estudo-([a-z]+)" aria-labelledby="estudo-\1-titulo"/g)].map((m) => m[1]);
  assert.deepEqual(secoes, [...IDS_CAPITULO]);
  for (const id of IDS_CAPITULO) assert.match(h, new RegExp(`<h2 id="estudo-${id}-titulo"`));
  assert.match(h, /<h2 id="estudo-descobertas-titulo"[^>]*>Três coisas que você ainda não tinha visto<\/h2>/);
  // navegação: um link por capítulo, rótulo curto, alvo de toque
  const nav = h.slice(h.indexOf('aria-label="Capítulos do estudo"'));
  const ancoras = [...nav.slice(0, nav.indexOf("</nav>")).matchAll(/<a href="#(estudo-[a-z]+)"[^>]*class="([^"]*)"[^>]*>([^<]*)<\/a>/g)];
  assert.deepEqual(ancoras.map((m) => [m[1], m[3]]), IDS_CAPITULO.map((id) => [`estudo-${id}`, ROTULOS_CURTOS[id]]));
  for (const m of ancoras) assert.match(m[2], /min-h-11/);
  assert.match(nav, /sticky/);
  // "Para entender" fixo, com o nome técnico quando houver
  const quem = texto(capitulo(h, "quem"));
  assert.ok(quem.includes(`Para entender ${PARA_ENTENDER.quem.texto} ${PARA_ENTENDER.quem.tecnico}`));
  assert.ok(texto(capitulo(h, "semana")).includes(PARA_ENTENDER.semana.texto));
  // texto completo no fim, recolhido, sem o bloco de dados
  assert.match(t, /Texto completo do documento .*Linha legível do markdown, só no texto completo\./);
  assert.doesNotMatch(h, /<details[^>]*open/);
  assert.doesNotMatch(h, /dangerouslySetInnerHTML|<script/);
  assert.doesNotMatch(t, /Empresa OS|fábrica|Polozi|—|–/);
});

test("estudo: evidência sempre recolhida em 'De onde tirei', com código, conversa e link da fonte", () => {
  const h = telaEstudo();
  const desc = capitulo(h, "descobertas");
  const blocos = [...desc.matchAll(/<details[^>]*>[\s\S]*?<\/details>/g)].map((m) => m[0]);
  assert.equal(blocos.length, 3);
  const primeiro = texto(blocos[0]);
  assert.match(primeiro, /^De onde tirei/);
  assert.match(primeiro, /C3 Quem chega pelo Google só quer saber o preço e some\./);
  assert.match(primeiro, /conversa de 18\/11 Depois de dizer que está caro/);
  assert.match(blocos[0], /<a href="https:\/\/forum-exemplo\.invalid\/ar-condicionado\/instalacao-preco" target="_blank" rel="noopener noreferrer nofollow"[^>]*>Fórum: o que a instalação básica inclui<\/a>/);
  // descoberta: por que importa, o que fazer, selo
  const t = texto(desc);
  assert.match(t, /Por que importa Se a resposta ao primeiro contato é só um número/);
  assert.match(t, /O que fazer Mandar orçamento fechado/);
  assert.match(t, /leitura do especialista/);
  // a quarta aponta para o capítulo de destino
  assert.match(t, /E mais uma A limpeza anual é o serviço que mais dá lucro/);
  assert.match(desc, /href="#estudo-decide"/);
});

test("estudo: hipótese vem com a razão ao lado; selos com o nome da origem para leitor de tela", () => {
  const quem = capitulo(telaEstudo(), "quem");
  const t = texto(quem);
  assert.match(t, /A situação Família que acabou de comprar o aparelho/); // tipo_cliente pessoa
  assert.match(t, /A pessoa Quem decide é o casal/);
  assert.match(t, /Já ouviu história de instalação que deixou a casa suja ou a parede furada errado\. Origem: hipótese do especialista Razão: As reclamações públicas são desse tipo/);
  assert.match(quem, /<span class="sr-only">Origem: <\/span>você disse/);
});

test("estudo: diagramas com descrição em texto (anéis, balança, caminho, mapa, zonas, escada)", () => {
  const h = telaEstudo();
  // anéis: do centro para fora, com quem decide no centro
  const quem = capitulo(h, "quem");
  const aneis = /<div role="img" aria-label="([^"]*)"/.exec(quem)?.[1] ?? "";
  assert.match(desescapar(aneis), /Quem pesa na compra: no centro, O casal, que decide; .*O grupo do prédio, que influencia/);
  assert.match(texto(quem), /Quem pesa na compra Quase nenhuma compra é decidida por uma pessoa só/);
  // balança pendendo para o lado que segura; o peso ausente tracejado e com a explicação
  const forcas = capitulo(h, "forcas");
  assert.match(forcas, /<svg[^>]*role="img"[^>]*aria-label="Balança pendendo para o lado que segura"/);
  assert.match(texto(forcas), /Saber o preço inteiro antes de decidir.*peso que existe e não está sendo usado/);
  assert.match(texto(forcas), /Empurra incômodo de hoje e atração pelo novo/);
  assert.match(texto(forcas), /Como virar a balança/);
  // caminho: três estados com legenda e alerta no vazamento
  const decide = capitulo(h, "decide");
  const td = texto(decide);
  assert.match(td, /O caminho até comprar, e depois/);
  assert.match(td, /Orçamento Situação: onde você perde gente Pede o preço e pergunta do material\./);
  assert.match(td, /Quem chega pelo Google pede preço e some/);
  assert.match(td, /onde você atua hoje fora do seu alcance onde você perde gente/);
  // mapa: posição convertida (top = 100 - y), descrição em texto
  assert.match(decide, /style="left:80%;top:15%"/);
  const mapa = desescapar(/<div role="img" aria-label="(Mapa[^"]*)"/.exec(decide)?.[1] ?? "");
  assert.match(mapa, /Horizontal: de Menor preço a Preço fechado\. Vertical: de Quando der a Hora marcada\./);
  assert.match(mapa, /Clima Exemplo, você: 80 de 100 na horizontal e 85 na vertical/);
  assert.match(td, /Com o que o cliente compara você/);
  assert.match(td, /O que o cliente quer dizer quando avalia Cliente usa palavras vagas/);
  // zonas na ordem, da mais perto à mais longe
  const onde = texto(capitulo(h, "onde"));
  assert.ok(onde.indexOf("Já cruza com você") < onde.indexOf("Onde se informa"));
  assert.ok(onde.indexOf("Onde aprende e compara") < onde.indexOf("Quem escuta"));
  assert.match(onde, /O material não alcançou: O material não mostrou/);
  // escada: degrau em foco com o rótulo
  const sabe = capitulo(h, "sabe");
  assert.match(texto(sabe), /3 Conhece saídas, não escolheu maior oportunidade/);
  const foco = [...sabe.matchAll(/<li class="([^"]*)"/g)].filter((m) => /\bbg-acento\b/.test(m[1]));
  assert.equal(foco.length, 1);
});

test("estudo: mensagem, quem não é, apostas, semana e fontes", () => {
  const h = telaEstudo();
  const m = texto(capitulo(h, "mensagem"));
  assert.match(m, /A promessa hoje Instalação com hora marcada e casa limpa no fim\./);
  assert.match(m, /A promessa sugerida Orçamento fechado, hora marcada e casa limpa no fim\./);
  assert.match(m, /Como testar Dizer no orçamento quantos metros entram/);
  assert.match(m, /Provas que você já tem .*Provas que faltam/);
  assert.match(m, /Cada dúvida, com a resposta pronta O preço já inclui o material\?/);
  assert.match(m, /Falta confirmar Dizer quantos metros de tubo entram\./);
  assert.match(texto(capitulo(h, "nao")), /Quem quer instalar no mesmo dia, sem visita/);
  const ap = texto(capitulo(h, "apostas"));
  assert.match(ap, /A aposta Por que acredito Como confirmar Tempo/);
  assert.match(ap, /2 semanas/);
  assert.match(ap, /5 conversas, 5 perguntas Com clientes que instalaram de outubro para cá, de preferência quem chegou pelo Google\. 15 minutos cada, sem vender nada\./);
  const sem = texto(capitulo(h, "semana"));
  assert.match(sem, /Resolve A dúvida que faz o cliente do Google sumir\./);
  // fontes: mesma URL numa linha só
  const rodape = h.slice(h.indexOf("<footer"));
  const tr = texto(rodape.slice(0, rodape.indexOf("</footer>")));
  assert.match(tr, /Fontes da pesquisa/);
  assert.match(tr, /\[3, 4\] Avaliações de instaladores em Campinas/);
  assert.match(tr, /\[5, 6\] Fórum: o que a instalação básica inclui/);
  assert.match(tr, /Páginas acessadas em 18\/11\/2026\. Dossiê respondido em 15\/11\/2026: 59 perguntas, 1 sem resposta\./);
  assert.match(tr, /Não encontrado: Preço médio de instalação em Campinas/);
});

test("estudo: capítulo sem dado some da página e da navegação, e o link da quarta descoberta também", () => {
  const doc = docEstudo((o) => {
    delete o.nao;
    o.semana.acoes = [];
    o.sabe.foco = 9;
    o.descobertas.extra.capitulo = "nao";
    delete o.quem.grupo_compra;
  });
  const h = telaEstudo(doc);
  const secoes = [...h.matchAll(/<section id="estudo-([a-z]+)"/g)].map((m) => m[1]);
  assert.deepEqual(secoes, IDS_CAPITULO.filter((id) => !["nao", "semana", "sabe"].includes(id)));
  assert.doesNotMatch(h, /href="#estudo-(nao|semana|sabe)"/);
  assert.match(texto(capitulo(h, "descobertas")), /E mais uma A limpeza anual é o serviço/);
  assert.doesNotMatch(capitulo(h, "quem"), /Quem pesa na compra/);
});

test("estudo: sem pesquisa, o rodapé diz que não houve pesquisa e a abertura muda o subtítulo", () => {
  const doc = docEstudo((o) => {
    o.fontes = { busca_disponivel: false, itens: [] };
    // tira toda referência a [n] (senão os itens caem por fonte inexistente)
    const limpar = (v: any): any =>
      Array.isArray(v) ? v.map(limpar) : v && typeof v === "object" ? Object.fromEntries(Object.entries(v).map(([k, x]) => [k, k === "refs" && Array.isArray(x) ? (x.filter((r: string) => !r.startsWith("[")).length ? x.filter((r: string) => !r.startsWith("[")) : ["B5a"]) : limpar(x)])) : v;
    Object.assign(o, limpar(o));
    for (const ch of ["descobertas", "pensa", "forcas", "onde", "decide"]) {
      const andar = (v: any) => {
        if (Array.isArray(v)) v.forEach(andar);
        else if (v && typeof v === "object") {
          if (v.tipo === "pesquisa") v.tipo = "disse";
          Object.values(v).forEach(andar);
        }
      };
      andar(o[ch]);
    }
  });
  const h = telaEstudo(doc);
  const t = visivel(h)[0].texto;
  assert.match(t, /quando cruzadas entre si\. /);
  assert.match(t, /Desta vez não houve pesquisa na internet: o estudo usa só o dossiê e as suas respostas\./);
});

test("estudo: bloco inválido cai no texto, sem o JSON; documento antigo continua nos blocos de hoje", () => {
  const invalido = docEstudo((o) => (o.versao = 2));
  const h = telaEstudo(invalido);
  const t = visivel(h)[0].texto;
  assert.doesNotMatch(h, /id="estudo-|id="persona-/);
  assert.match(t, /Linha legível do markdown, só no texto completo\./);
  assert.doesNotMatch(t, /"versao"|persona-dados|Dados para o sistema/);
  // documento antigo, no molde de hoje
  const antigo = telaPersona();
  assert.match(antigo, /id="persona-retrato"/);
  assert.doesNotMatch(antigo, /id="estudo-|Capítulos do estudo/);
  // documento sem molde nenhum: texto, como antes
  const solto = telaPersona([DOC_PERSONA], new Map([["p9", "Dona Maria tem uma padaria."]]));
  assert.match(visivel(solto)[0].texto, /Dona Maria tem uma padaria\./);
  assert.doesNotMatch(solto, /id="estudo-|id="persona-/);
});

test("estudo: com mais de um documento de persona, a lista de troca continua acima do estudo", () => {
  const velho = { ...DOC_PERSONA, id: "p8", titulo: "Persona antiga", publicado_em: "2026-10-01T12:00:00Z" };
  const h = telaPersona([DOC_ESTUDO, velho], new Map([["p20", docEstudo()], ["p8", DOC_PERSONA_TEXTO]]));
  const links = [...h.matchAll(/<a ([^>]*)>([^<]*)<\/a>/g)]
    .filter((m) => /doc=/.test(m[1]) && !/role="tab"/.test(m[1]))
    .map((m) => [desescapar(/href="([^"]*)"/.exec(m[1])?.[1] ?? ""), m[2]]);
  assert.deepEqual(links, [
    ["/marca?aba=persona&doc=p20", "Estudo do cliente ideal - Clima Exemplo"],
    ["/marca?aba=persona&doc=p8", "Persona antiga"],
  ]);
  assert.ok(h.indexOf("doc=p8") < h.indexOf('id="estudo-descobertas"'));
});

test("estudo: só classes do tema; style só com posição ou tamanho calculado", () => {
  const h = telaEstudo();
  const estilos = [...h.matchAll(/style="([^"]*)"/g)].map((m) => m[1]);
  assert.ok(estilos.length > 0);
  for (const s of estilos) assert.match(s, /^(?:(?:left|top|width|height|grid-template-columns):[^;]+;?)+$/, s);
  assert.doesNotMatch(h, /#[0-9a-fA-F]{3,8}\b(?![^<]*<\/a>)|rgb\(|hsl\(/);
});
