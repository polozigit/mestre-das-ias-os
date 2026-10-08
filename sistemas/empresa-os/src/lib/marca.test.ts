import test from "node:test";
import assert from "node:assert/strict";
import {
  abaDaUrl,
  abertoDaAba,
  abertosDasAbas,
  cliqueSimples,
  enderecoDaTroca,
  ETAPA_QUE_PUBLICA,
  hrefMarca,
  hrefsDasAbas,
  porAba,
  ROTULO_ABA,
} from "./marca.ts";

test("abaDaUrl: inválido, vazio e ausente caem em marca; válidos passam", () => {
  assert.equal(abaDaUrl("xyz"), "marca");
  assert.equal(abaDaUrl(""), "marca");
  assert.equal(abaDaUrl(null), "marca");
  assert.equal(abaDaUrl(undefined), "marca");
  assert.equal(abaDaUrl("persona"), "persona");
  assert.equal(abaDaUrl("dossie"), "dossie");
});

test("porAba: lista vazia devolve as 3 chaves vazias", () => {
  assert.deepEqual(porAba([]), { marca: [], persona: [], dossie: [] });
});

test("porAba: ignora extracao e ordena por publicado_em desc", () => {
  const d = (id: string, tipo: string, publicado_em: string) => ({ id, tipo, publicado_em });
  const r = porAba([
    d("a", "dossie", "2026-01-01T00:00:00Z"),
    d("b", "dossie", "2026-03-01T00:00:00Z"),
    d("c", "extracao", "2026-04-01T00:00:00Z"),
    d("d", "persona", "2026-02-01T00:00:00Z"),
  ]);
  assert.deepEqual(r.dossie.map((x) => x.id), ["b", "a"]);
  assert.deepEqual(r.persona.map((x) => x.id), ["d"]);
  assert.deepEqual(r.marca, []);
  assert.equal(JSON.stringify(r).includes('"c"'), false);
});

test("rótulos e etapas existem para as 3 abas", () => {
  for (const a of ["marca", "persona", "dossie"] as const) {
    assert.ok(ROTULO_ABA[a].length > 0);
    assert.ok(ETAPA_QUE_PUBLICA[a].length > 0);
  }
  assert.equal(ROTULO_ABA.marca, "Identidade e voz");
});

test("estado vazio de cada aba diz como pedir à IA, com a frase pronta", () => {
  assert.match(ETAPA_QUE_PUBLICA.marca, /Peça à sua IA: "monta a identidade e a voz da marca"/);
  assert.match(ETAPA_QUE_PUBLICA.persona, /Peça à sua IA: "monta a persona a partir do dossiê"/);
  assert.match(ETAPA_QUE_PUBLICA.dossie, /Peça à sua IA: "registra o dossiê"/);
});

test("nenhum texto cita a etapa antiga 'Gravar o dossiê da empresa' nem usa travessão", () => {
  for (const texto of Object.values(ETAPA_QUE_PUBLICA)) {
    assert.doesNotMatch(texto, /Gravar o dossiê da empresa/);
    assert.doesNotMatch(texto, /—/);
  }
});

/* ---- Documento aberto de cada aba (a tela entrega as três abas de uma vez) ---- */

const doc = (id: string, tipo: string, publicado_em = "2026-01-01T00:00:00Z") => ({ id, tipo, publicado_em });
const GRUPOS = porAba([
  doc("m-novo", "marca", "2026-03-01T00:00:00Z"),
  doc("m-velho", "marca", "2026-02-01T00:00:00Z"),
  doc("p1", "persona", "2026-02-15T00:00:00Z"),
]);

test("abertoDaAba: sem pedido abre o mais recente; com pedido da aba abre o pedido", () => {
  assert.equal(abertoDaAba(GRUPOS.marca, undefined)?.id, "m-novo");
  assert.equal(abertoDaAba(GRUPOS.marca, null)?.id, "m-novo");
  assert.equal(abertoDaAba(GRUPOS.marca, "m-velho")?.id, "m-velho");
});

test("abertoDaAba: pedido que não é da aba cai no mais recente; aba sem documento devolve null", () => {
  assert.equal(abertoDaAba(GRUPOS.marca, "p1")?.id, "m-novo");
  assert.equal(abertoDaAba(GRUPOS.marca, "id-que-nao-existe")?.id, "m-novo");
  assert.equal(abertoDaAba(GRUPOS.dossie, undefined), null);
  assert.equal(abertoDaAba(GRUPOS.dossie, "m-novo"), null);
});

test("abertosDasAbas: a aba Persona abre o documento de persona, não o da marca", () => {
  const a = abertosDasAbas(GRUPOS, undefined);
  assert.equal(a.marca?.id, "m-novo");
  assert.equal(a.persona?.id, "p1");
});

test("abertosDasAbas: a aba Dossiê sem documento fica sem nada aberto (a tela mostra o estado vazio)", () => {
  assert.equal(abertosDasAbas(GRUPOS, undefined).dossie, null);
  assert.equal(abertosDasAbas(porAba([]), undefined).marca, null);
});

test("abertosDasAbas: o documento pedido só vale na aba dele; as outras ficam no mais recente", () => {
  const a = abertosDasAbas(GRUPOS, "m-velho");
  assert.equal(a.marca?.id, "m-velho");
  assert.equal(a.persona?.id, "p1");
  const b = abertosDasAbas(GRUPOS, "p1");
  assert.equal(b.marca?.id, "m-novo");
  assert.equal(b.persona?.id, "p1");
});

test("hrefMarca: endereço da aba, e do documento quando houver", () => {
  assert.equal(hrefMarca("persona"), "/marca?aba=persona");
  assert.equal(hrefMarca("dossie", null), "/marca?aba=dossie");
  assert.equal(hrefMarca("marca", "m-velho"), "/marca?aba=marca&doc=m-velho");
  assert.equal(hrefMarca("marca", "a b&c"), "/marca?aba=marca&doc=a%20b%26c");
});

test("hrefsDasAbas: só leva o documento quando ele NÃO é o mais recente da aba", () => {
  assert.deepEqual(hrefsDasAbas(GRUPOS, abertosDasAbas(GRUPOS, undefined)), {
    marca: "/marca?aba=marca",
    persona: "/marca?aba=persona",
    dossie: "/marca?aba=dossie",
  });
  assert.deepEqual(hrefsDasAbas(GRUPOS, abertosDasAbas(GRUPOS, "m-velho")), {
    marca: "/marca?aba=marca&doc=m-velho",
    persona: "/marca?aba=persona",
    dossie: "/marca?aba=dossie",
  });
});

test("cliqueSimples: só o botão esquerdo sem tecla segurada troca a aba na hora", () => {
  const base = { button: 0, metaKey: false, ctrlKey: false, shiftKey: false, altKey: false };
  assert.equal(cliqueSimples(base), true);
  assert.equal(cliqueSimples({ ...base, button: 1 }), false); // botão do meio
  assert.equal(cliqueSimples({ ...base, button: 2 }), false);
  assert.equal(cliqueSimples({ ...base, metaKey: true }), false);
  assert.equal(cliqueSimples({ ...base, ctrlKey: true }), false);
  assert.equal(cliqueSimples({ ...base, shiftKey: true }), false);
  assert.equal(cliqueSimples({ ...base, altKey: true }), false);
});

test("enderecoDaTroca: clicar na aba que a URL já mostra não cria passo novo no histórico", () => {
  assert.equal(enderecoDaTroca("marca", "/marca?aba=marca", ""), null); // sem ?aba= é a marca
  assert.equal(enderecoDaTroca("marca", "/marca?aba=marca", "?aba=xyz"), null); // valor inválido também
  assert.equal(enderecoDaTroca("persona", "/marca?aba=persona", "?aba=persona&doc=p1"), null);
});

test("enderecoDaTroca: aba diferente da URL devolve o endereço dela", () => {
  assert.equal(enderecoDaTroca("persona", "/marca?aba=persona", ""), "/marca?aba=persona");
  assert.equal(enderecoDaTroca("dossie", "/marca?aba=dossie", "?aba=persona"), "/marca?aba=dossie");
  assert.equal(enderecoDaTroca("marca", "/marca?aba=marca&doc=m0", "?aba=dossie"), "/marca?aba=marca&doc=m0");
});

test("enderecoDaTroca: cliques seguidos, lendo a URL a cada clique, chegam na última aba (nenhum se perde)", () => {
  const hrefs = hrefsDasAbas(GRUPOS, abertosDasAbas(GRUPOS, undefined));
  let busca = ""; // a URL de quem acabou de abrir /marca
  const empurrados: string[] = [];
  for (const aba of ["persona", "dossie", "marca"] as const) {
    const destino = enderecoDaTroca(aba, hrefs[aba], busca);
    if (destino) {
      empurrados.push(destino);
      busca = destino.slice(destino.indexOf("?")); // pushState atualiza a URL na hora
    }
  }
  assert.deepEqual(empurrados, ["/marca?aba=persona", "/marca?aba=dossie", "/marca?aba=marca"]);
  assert.equal(abaDaUrl(new URLSearchParams(busca).get("aba")), "marca");
});
