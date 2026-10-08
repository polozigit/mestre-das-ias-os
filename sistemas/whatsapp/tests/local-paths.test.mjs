import assert from "node:assert/strict";
import test from "node:test";

import {
  assertOutsideRepository,
  getAuthDirectory,
  getBaseUrl,
  getEngineConfigFile,
  getLocalPort,
  getStateDirectory,
} from "../src/local-paths.mjs";

test("guarda o estado fora do repositorio em macOS, Windows e Linux", () => {
  assert.equal(
    getStateDirectory({}, "darwin", "/Users/aluna"),
    "/Users/aluna/Library/Application Support/Polozi/whatsapp-local",
  );
  assert.equal(
    getStateDirectory({ APPDATA: "C:\\Users\\aluna\\AppData\\Roaming" }, "win32", "C:\\Users\\aluna"),
    "C:\\Users\\aluna\\AppData\\Roaming\\Polozi\\whatsapp-local",
  );
  assert.equal(getStateDirectory({}, "linux", "/home/aluna"), "/home/aluna/.local/state/polozi/whatsapp-local");
});

test("WHATSAPP_LOCAL_STATE_DIR sobrescreve o estado e deriva auth e motor.json", () => {
  const environment = { WHATSAPP_LOCAL_STATE_DIR: "/tmp/estado" };
  assert.equal(getStateDirectory(environment, "darwin", "/Users/aluna"), "/tmp/estado");
  assert.equal(getAuthDirectory(environment, "darwin", "/Users/aluna"), "/tmp/estado/auth");
  assert.equal(getEngineConfigFile(environment, "darwin", "/Users/aluna"), "/tmp/estado/motor.json");
});

test("rejeita segredo dentro do repositorio", () => {
  assert.throws(() => assertOutsideRepository("/curso", "/curso/sistemas/whatsapp/motor.json"));
  assert.doesNotThrow(() => assertOutsideRepository("/curso", "/Users/aluna/Library/Application Support/Polozi/whatsapp-local/motor.json"));
});

test("porta padrao 8082 em 127.0.0.1, com override so por variavel valida", () => {
  assert.equal(getLocalPort({}), 8082);
  assert.equal(getBaseUrl({}), "http://127.0.0.1:8082");
  assert.equal(getLocalPort({ WHATSAPP_LOCAL_PORT: "18082" }), 18082);
  assert.equal(getLocalPort({ WHATSAPP_LOCAL_PORT: "abc" }), 8082);
});
