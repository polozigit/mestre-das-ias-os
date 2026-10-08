import assert from "node:assert/strict";
import path from "node:path";
import test from "node:test";

import { setupEngine } from "../src/setup.mjs";

test("setupEngine cria a config local e garante o motor, nessa ordem", async () => {
  const chamadas = [];
  const config = { apiKey: "k" };
  const result = await setupEngine({
    root: "/casa/sistemas/whatsapp",
    environment: { WHATSAPP_LOCAL_STATE_DIR: "/estado/fora" },
    ensureConfig: async () => { chamadas.push("config"); },
    ensure: async ({ environment }) => { chamadas.push(`motor:${environment.WHATSAPP_LOCAL_STATE_DIR}`); return config; },
  });
  assert.equal(result, config);
  assert.deepEqual(chamadas, ["config", "motor:/estado/fora"]);
});

test("setupEngine recusa estado dentro do repositorio", async () => {
  const root = path.resolve("/casa/sistemas/whatsapp");
  await assert.rejects(
    setupEngine({
      root,
      environment: { WHATSAPP_LOCAL_STATE_DIR: path.join(root, "estado") },
      ensureConfig: async () => assert.fail("nao deveria criar config"),
      ensure: async () => assert.fail("nao deveria subir o motor"),
    }),
    /nao pode ficar dentro do repositorio/,
  );
});
