import test from "node:test";
import assert from "node:assert/strict";
import { descricaoDoSistema, empresa, nomeDoSistema, nomeSistema } from "./empresa.ts";

// No molde (repo da Polozi) os placeholders EXISTEM de propósito — o CI da
// casa roda com TEMPLATE_DEV=1 e pula. No clone do aluno a var não existe:
// placeholder esquecido = teste vermelho acusando instalação incompleta
// (LEIA-ME passo 3).
const ehMolde = process.env.TEMPLATE_DEV === "1";

test("identidade preenchida (sem {{placeholder}})", { skip: ehMolde }, () => {
  for (const [campo, valor] of Object.entries(empresa)) {
    assert.ok(
      !String(valor).includes("{{"),
      `config/empresa.ts: campo "${campo}" ainda tem placeholder (${valor}) — aplicar a marca (LEIA-ME passo 3)`,
    );
  }
  assert.match(
    empresa.slug,
    /^[a-z0-9-]+$/,
    `slug inválido: "${empresa.slug}" (só minúsculas, números e hífen)`,
  );
});

test("nome do sistema = nome da empresa + sufixo OS", () => {
  assert.equal(nomeDoSistema("Clima Sul"), "Clima Sul OS");
  assert.equal(nomeSistema, nomeDoSistema(empresa.nome));
});

test("sem marca aplicada o sistema se chama Empresa OS", () => {
  assert.equal(nomeDoSistema("{{NOME_EMPRESA}}"), "Empresa OS");
  assert.equal(nomeDoSistema("  "), "Empresa OS");
  assert.equal(descricaoDoSistema("{{DESCRICAO_CURTA}}"), "Sistema da empresa com time de IA");
  assert.equal(descricaoDoSistema("Clima e conforto"), "Clima e conforto");
});
