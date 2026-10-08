import assert from "node:assert/strict";
import test from "node:test";

import { startBackground } from "../src/start-background.mjs";

const config = { apiKey: "k", baseUrl: "http://127.0.0.1:1" };

function setup({ connected = true, running = [0], spawnFlipsTo } = {}) {
  const calls = { ensure: 0, spawn: 0, logs: [] };
  const queue = [...running];
  let pid = queue.shift();
  return {
    calls,
    options: {
      environment: {},
      ensure: async () => { calls.ensure += 1; return config; },
      waitConnected: async () => ({ connected, loggedIn: connected }),
      isRunning: async () => { const current = pid; if (queue.length) pid = queue.shift(); return current; },
      spawnAssistantImpl: () => { calls.spawn += 1; if (spawnFlipsTo) pid = spawnFlipsTo; },
      sleep: async () => {},
      waitMs: 50,
      pollMs: 1,
      log: (line) => calls.logs.push(line),
    },
  };
}

test("sobe o motor e o assistente desacoplado quando nao ha assistente rodando", async () => {
  const { calls, options } = setup({ running: [0], spawnFlipsTo: 777 });
  assert.equal(await startBackground(options), 0);
  assert.equal(calls.ensure, 1);
  assert.equal(calls.spawn, 1);
  assert.match(calls.logs.join("\n"), /WHATSAPP_LIVE_ASSISTANT=INICIADO pid=777/);
});

test("nao duplica o assistente quando ja esta rodando", async () => {
  const { calls, options } = setup({ running: [321] });
  assert.equal(await startBackground(options), 0);
  assert.equal(calls.ensure, 1);
  assert.equal(calls.spawn, 0);
  assert.match(calls.logs.join("\n"), /WHATSAPP_LIVE_ASSISTANT=JA_RODANDO pid=321/);
});

test("desconectado: nao sobe o assistente e manda reconectar", async () => {
  const { calls, options } = setup({ connected: false });
  assert.equal(await startBackground(options), 1);
  assert.equal(calls.spawn, 0);
  const out = calls.logs.join("\n");
  assert.match(out, /WHATSAPP_CONNECTION=NOT_CONNECTED/);
  assert.match(out, /reconecta meu WhatsApp/);
});

test("avisa quando o assistente nao confirma que subiu", async () => {
  const { calls, options } = setup({ running: [0] });
  assert.equal(await startBackground(options), 1);
  assert.equal(calls.spawn, 1);
  assert.match(calls.logs.join("\n"), /WHATSAPP_LIVE_ASSISTANT=NAO_CONFIRMADO/);
});
