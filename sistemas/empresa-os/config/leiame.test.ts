import test from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { join } from "node:path";
import { fileURLToPath } from "node:url";
import { NOMES_CHAVE_PUBLICA, NOMES_URL } from "./supabase-env.mjs";
import { NOMES_CHAVE_SECRETA } from "./supabase-env-servidor.mjs";

// O LEIA-ME é o roteiro que a IA da empresa segue pra colocar o sistema no ar (etapa 8-sistema do instalador).
// Estes testes travam o que a revisão de 08/10/2026 achou desatualizado: os nomes das variáveis do Supabase,
// a ordem da aula (banco e sistema no ar ANTES da marca) e o Node mínimo.
const RAIZ = fileURLToPath(new URL("..", import.meta.url));
const leiame = readFileSync(join(RAIZ, "LEIA-ME.md"), "utf8");
const plano = leiame.replace(/^> ?/gm, "").split(/\s+/).join(" "); // sem o "> " da citação nem quebra de linha no meio da frase

test("o roteiro cita os DOIS nomes de cada variável do Supabase (a integração com a Vercel grava o novo ou o antigo)", () => {
  for (const nome of [...NOMES_URL, ...NOMES_CHAVE_PUBLICA, ...NOMES_CHAVE_SECRETA]) {
    assert.ok(leiame.includes(`\`${nome}\``), `o LEIA-ME não cita ${nome}`);
  }
  assert.match(plano, /aceita os dois nomes de cada uma/);
});

test("na ordem da aula o sistema entra no ar antes da marca: o roteiro não exige a identidade visual como pré-requisito", () => {
  assert.match(plano, /A identidade visual NÃO é pré-requisito/);
  assert.match(plano, /o banco pronto \(`7-banco`/);
  assert.doesNotMatch(plano, /Pré-requisitos:[^.]*identidade visual em `empresa\/marca\/`/);
  assert.match(plano, /sem `identidade-visual\.md`, pule este passo/);
});

test("o roteiro diz o Node mínimo do sistema, o mesmo que o Next exige no package-lock", () => {
  const lock = JSON.parse(readFileSync(join(RAIZ, "package-lock.json"), "utf8"));
  const exigencia: string = lock.packages["node_modules/next"].engines.node; // ex.: ">=20.9.0"
  const minimo = /^>=\s*(\d+\.\d+)\.\d+$/.exec(exigencia);
  assert.ok(minimo, `engines.node do next em formato novo: ${exigencia}`);
  assert.ok(plano.includes(`Node ${minimo[1]} ou mais novo`), `o LEIA-ME devia dizer Node ${minimo[1]} ou mais novo`);
});
