import test from "node:test";
import assert from "node:assert/strict";
import { semComentarios } from "./fonte-para-teste.ts";

test("tira comentário de bloco, de linha e de JSX, e deixa o código", () => {
  const fonte = [
    "/** Texto X no comentário de bloco */",
    "const a = 1; // texto X no fim da linha",
    "// texto X numa linha só de comentário",
    "const b = (<p>{/* texto X no JSX */}oi</p>);",
  ].join("\n");
  const limpo = semComentarios(fonte);
  assert.doesNotMatch(limpo, /texto X/);
  assert.match(limpo, /const a = 1;/);
  assert.match(limpo, /<p>\{\}oi<\/p>/);
});

test("não come o // de um endereço dentro do código", () => {
  const limpo = semComentarios('const link = "https://exemplo.com/x"; // comentário');
  assert.match(limpo, /https:\/\/exemplo\.com\/x/);
  assert.doesNotMatch(limpo, /comentário/);
});

test("texto que só aparece em comentário NÃO conta como regra no código", () => {
  const fonte = '/** diz "Ver instruções completas" */\nexport const x = "Ver detalhes";';
  assert.doesNotMatch(semComentarios(fonte), /Ver instruções completas/);
  assert.match(semComentarios(fonte), /Ver detalhes/);
});
