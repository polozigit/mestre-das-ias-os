import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import path from "node:path";
import test from "node:test";
import { fileURLToPath } from "node:url";

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const read = (file) => readFileSync(path.join(ROOT, file), "utf8");
const guia = read("GUIA-AGENTE-CODEX-CLAUDE.md");

test("package.json expoe npm run conectar", () => {
  assert.equal(JSON.parse(read("package.json")).scripts.conectar, "node src/conectar.mjs");
});

test("o guia abre com o Caminho rapido e as 3 linhas apontam para npm run conectar", () => {
  const titulos = [...guia.matchAll(/^## .+$/gm)].map((match) => match[0]);
  assert.match(titulos[0], /^## Caminho rápido/);
  assert.match(titulos[1], /^## Erros do `npm run conectar`/);
  const bloco = guia.slice(guia.indexOf(titulos[0]), guia.indexOf(titulos[1]));
  const itens = bloco.split("\n").filter((linha) => /^\d\. /.test(linha));
  assert.equal(itens.length, 3);
  assert.match(itens[0], /npm run conectar/);
  assert.match(itens[0], /--reconectar/);
  assert.match(itens[1], /CONECTAR=ESCANEIE_O_QR/);
  assert.match(itens[2], /CONECTAR=ERRO/);
});

test("toda etapa que o conectar pode reportar tem linha na tabela de erros do guia", () => {
  const fonte = read("src/conectar.mjs");
  const etapas = new Set();
  for (const match of fonte.matchAll(/(?:step|fail)\(\s*"([a-z]+)"|StepError\(\s*"([a-z]+)"/g)) etapas.add(match[1] || match[2]);
  etapas.delete("inesperado");
  assert.ok(etapas.size >= 7, `etapas achadas: ${[...etapas].join(",")}`);
  const inicio = guia.indexOf("## Erros do `npm run conectar`");
  const tabela = guia.slice(inicio, guia.indexOf("\n## ", inicio + 5));
  for (const etapa of etapas) assert.ok(tabela.includes(`\`etapa=${etapa}\``), `guia sem a etapa ${etapa}`);
  assert.ok(tabela.includes("CONECTAR=FALTA_NODE"));
});

test("instrucao do aluno, LEIA-ME e guia citam o comando unico", () => {
  const instrucao = read("INSTRUCAO-UNICA-PARA-O-ALUNO.md");
  assert.match(instrucao.slice(0, instrucao.indexOf("## Alternativa")), /npm run conectar/, "o texto principal (nao so o prompt da Casa antiga) cita o comando");
  assert.match(instrucao, /npm run conectar -- --reconectar/);
  assert.match(read("LEIA-ME.md"), /npm run conectar/);
  assert.match(read("LEIA-ME.md"), /--reconectar/);
});
