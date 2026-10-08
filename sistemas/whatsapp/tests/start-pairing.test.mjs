import assert from "node:assert/strict";
import test from "node:test";

import { PAIRING_TIMEOUT_MESSAGE, pairUntilConnected } from "../src/start-pairing.mjs";

const config = { apiKey: "k", baseUrl: "http://127.0.0.1:1" };
const CONNECTED = { connected: true, loggedIn: true };
const DOWN = { connected: false, loggedIn: false };

function setup({ statuses = [DOWN, CONNECTED], qrs = ["qr-1"], pairFails = false } = {}) {
  const events = [];
  let clock = 0;
  const statusQueue = [...statuses];
  const qrQueue = [...qrs];
  const page = {
    setQr: async (qr) => { events.push(`qr:${qr}`); },
    setConnected: () => events.push("conectado"),
    setMessage: (message) => events.push(`msg:${message}`),
    close: async () => { events.push("fechou"); },
  };
  return {
    events,
    options: {
      startPage: async () => { events.push("pagina"); return page; },
      startPairingImpl: async () => { events.push("pareamento"); if (pairFails) throw new Error("motor recusou"); },
      getStatus: async () => (statusQueue.length > 1 ? statusQueue.shift() : statusQueue[0]),
      getQr: async () => (qrQueue.length > 1 ? qrQueue.shift() : qrQueue[0]),
      onStarted: () => events.push("iniciou"),
      onQr: () => events.push("onQr"),
      sleep: async (ms) => { clock += ms; },
      now: () => clock,
      timeoutMs: 100000,
      pollMs: 1000,
      renewalCooldownMs: 30000,
      closeDelayMs: 1,
    },
  };
}

test("abre a pagina, inicia o pareamento, mostra o QR e volta quando conecta", async () => {
  const { events, options } = setup();
  await pairUntilConnected(config, options);
  assert.deepEqual(events.slice(0, 5), ["pagina", "pareamento", "iniciou", "qr:qr-1", "onQr"]);
  assert.ok(events.includes("conectado"));
});

test("ja conectado na primeira checagem: nao mostra QR e fecha a pagina", async () => {
  const { events, options } = setup({ statuses: [CONNECTED] });
  await pairUntilConnected(config, options);
  assert.equal(events.some((event) => event.startsWith("qr:")), false);
  assert.ok(events.includes("conectado"));
});

test("QR repetido nao e reenviado a pagina; QR novo e", async () => {
  const { events, options } = setup({ statuses: [DOWN, DOWN, DOWN, CONNECTED], qrs: ["a", "a", "b"] });
  await pairUntilConnected(config, options);
  assert.deepEqual(events.filter((event) => event.startsWith("qr:")), ["qr:a", "qr:b"]);
});

test("sem QR por mais que o intervalo de renovacao, pede um pareamento novo", async () => {
  const statuses = Array(40).fill(DOWN).concat([CONNECTED]);
  const { events, options } = setup({ statuses, qrs: [null] });
  await pairUntilConnected(config, options);
  assert.ok(events.filter((event) => event === "pareamento").length >= 2);
  assert.ok(events.some((event) => event.startsWith("msg:Gerando um QR novo")));
});

test("tempo esgotado: fecha a pagina e levanta o erro padrao", async () => {
  const { events, options } = setup({ statuses: [DOWN], qrs: ["x"] });
  await assert.rejects(pairUntilConnected(config, { ...options, timeoutMs: 5000 }), { message: PAIRING_TIMEOUT_MESSAGE });
  assert.equal(events.at(-1), "fechou");
});

test("motor recusa o pareamento: fecha a pagina e repassa o erro", async () => {
  const { events, options } = setup({ pairFails: true });
  await assert.rejects(pairUntilConnected(config, options), { message: "motor recusou" });
  assert.equal(events.at(-1), "fechou");
  assert.equal(events.includes("iniciou"), false);
});
