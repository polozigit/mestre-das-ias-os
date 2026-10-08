import test from "node:test";
import assert from "node:assert/strict";
import { fraseCriadaPor, linkDaOrigem, rotuloCriadaPor, rotuloVeioDe } from "./rotulos.ts";

test('"Criada por": humano é "Você" e IA é "IA" (nunca "Humano" nem "Origem")', () => {
  assert.equal(rotuloCriadaPor("humano"), "Você");
  assert.equal(rotuloCriadaPor("ia"), "IA");
});

test("frase inteira pro card do quadro e pro topo do detalhe", () => {
  assert.equal(fraseCriadaPor("humano"), "Criada por você");
  assert.equal(fraseCriadaPor("ia"), "Criada por IA");
});

test('"Veio de": o plano depende da trilha (90 dias, curso ou plano de trabalho)', () => {
  assert.equal(rotuloVeioDe("plano", "plano90"), "plano de 90 dias");
  assert.equal(rotuloVeioDe("plano", "curso"), "curso de 3 dias");
  assert.equal(rotuloVeioDe("plano", "trabalho"), "plano de trabalho");
  assert.equal(rotuloVeioDe("plano"), "plano de trabalho");
});

test('"Veio de": a palavra solta "plano" nunca chega à tela, seja qual for a trilha', () => {
  for (const trilha of ["plano90", "curso", "trabalho", "", "trilha_nova", null, undefined]) {
    assert.notEqual(rotuloVeioDe("plano", trilha), "plano", `trilha ${String(trilha)}`);
  }
});

test('"Veio de": conversa e curso aparecem como o dono lê, e o tipo que ninguém conhece fica como está', () => {
  assert.equal(rotuloVeioDe("chat"), "conversa");
  assert.equal(rotuloVeioDe("conversa"), "conversa");
  assert.equal(rotuloVeioDe("curso"), "curso");
  assert.equal(rotuloVeioDe("Origem Nova"), "Origem Nova");
});

test('"Veio de": os tipos de origem da migration 0014 viram palavras do dono', () => {
  assert.equal(rotuloVeioDe("chat"), "conversa");
  assert.equal(rotuloVeioDe("ideia"), "ideia");
  assert.equal(rotuloVeioDe("especificacao"), "especificação");
  assert.equal(rotuloVeioDe("roadmap_item"), "planejamento");
  assert.equal(rotuloVeioDe("reuniao_item"), "reunião");
});

test('"Veio de": tipo desconhecido é legível, vazio some, prototype não vaza', () => {
  assert.equal(rotuloVeioDe("minha_origem"), "minha origem");
  assert.equal(rotuloVeioDe("toString"), "toString");
  assert.equal(rotuloVeioDe(null), null);
  assert.equal(rotuloVeioDe(undefined), null);
  assert.equal(rotuloVeioDe("   "), null);
});

test("linkDaOrigem: só endereço http(s) vira link; id interno e esquema perigoso não", () => {
  assert.equal(linkDaOrigem("https://chatgpt.com/c/abc"), "https://chatgpt.com/c/abc");
  assert.equal(linkDaOrigem("  http://exemplo.com/x  "), "http://exemplo.com/x");
  assert.equal(linkDaOrigem("3f2b8c1e-aaaa-bbbb-cccc-1234567890ab"), null);
  assert.equal(linkDaOrigem("javascript:alert(1)"), null);
  assert.equal(linkDaOrigem("data:text/html,<b>x</b>"), null);
  assert.equal(linkDaOrigem("https://"), null);
  assert.equal(linkDaOrigem(null), null);
  assert.equal(linkDaOrigem(""), null);
});
