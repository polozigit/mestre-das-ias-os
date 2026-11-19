import test from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { join } from "node:path";
import { COMANDO_API_OFICIAL, COMANDO_LIGAR_COMPUTADOR, LIGADO_ATE_MS, computadorLigado, computadorPadrao } from "./guias.ts";

const AGORA = Date.parse("2026-11-17T12:00:00Z");
const iso = (ms: number) => new Date(ms).toISOString();

test("computador ligado = contato no último minuto", () => {
  assert.equal(computadorLigado({ ultima_em: iso(AGORA - 5_000) }, AGORA), true);
  assert.equal(computadorLigado({ ultima_em: iso(AGORA - LIGADO_ATE_MS - 1) }, AGORA), false);
  assert.equal(computadorLigado({ ultima_em: null }, AGORA), false);
  assert.equal(computadorLigado({ ultima_em: "lixo" }, AGORA), false);
});

test("número novo de QR Code vai pro computador que falou por último", () => {
  assert.equal(computadorPadrao([]), null);
  assert.equal(computadorPadrao([{ id: "a", nome: "A", ultima_em: null }]), "a");
  assert.equal(
    computadorPadrao([
      { id: "a", nome: "A", ultima_em: iso(AGORA - 60_000) },
      { id: "b", nome: "B", ultima_em: iso(AGORA - 1_000) },
      { id: "c", nome: "C", ultima_em: null },
    ]),
    "b",
  );
});

test("comando de ligar o computador usa o mensageria:preparar e não pede segredo", () => {
  assert.match(COMANDO_LIGAR_COMPUTADOR, /npm run mensageria:preparar/);
  assert.doesNotMatch(COMANDO_LIGAR_COMPUTADOR, /mensageria:iniciar/);
  assert.match(COMANDO_LIGAR_COMPUTADOR, /Não me peça token, chave nem senha/);
  assert.doesNotMatch(COMANDO_LIGAR_COMPUTADOR, /MENSAGERIA_DEVICE_TOKEN|mensageria:configurar/);
});

test("comando da API oficial guia por etapas e proíbe colar segredo na conversa", () => {
  for (const trecho of [/um passo por vez/, /SMS ou ligação/, /whatsapp_business_messaging/, /\/functions\/v1\/mensageria/, /campo messages/, /nunca me peça para colar token/]) {
    assert.match(COMANDO_API_OFICIAL, trecho);
  }
});

test("a tela de números não mostra token nem pede para escolher instalação", () => {
  const tela = readFileSync(join(import.meta.dirname, "../../components/mensageria/AccountSettings.tsx"), "utf8");
  assert.doesNotMatch(tela, /instalacao_criar/);
  assert.doesNotMatch(tela, /Token da instalação|Escolher instalação|name="instalacao_id"/);
  assert.match(tela, /computadorPadrao\(/);
});
