import assert from "node:assert/strict";
import { mkdirSync, mkdtempSync, rmSync, writeFileSync } from "node:fs";
import os from "node:os";
import path from "node:path";
import test from "node:test";

import {
  availableClients,
  detectClient,
  findInPath,
  isMissingCommand,
  otherClient,
  preferenceFile,
  readPreference,
  resolveClient,
  runningClient,
  writePreference,
} from "../src/cliente-ia.mjs";

// PATH falso: so existem os executaveis listados, em /bin-falso.
const onlyIn = (...names) => (candidate) => names.some((name) => candidate === path.posix.join("/bin-falso", name));
const noPreference = () => { throw new Error("sem arquivo"); };
const resolve = (environment, exists, read = noPreference) => resolveClient({ environment: { PATH: "/bin-falso", ...environment }, platform: "darwin", exists, read });

test("so o Codex no PATH: codex, mesmo com a Casa cheia de CLAUDE.md (o caso do teste de 09/10)", () => {
  assert.deepEqual(resolve({}, onlyIn("codex")), { client: "codex", origem: "path" });
  // Rodando DENTRO do Codex, com CLAUDE.md e .claude/ na Casa: nunca "claude".
  assert.deepEqual(resolve({ CODEX_THREAD_ID: "t1" }, onlyIn("codex")), { client: "codex", origem: "path" });
});

test("so o Claude Code no PATH: claude", () => {
  assert.deepEqual(resolve({}, onlyIn("claude")), { client: "claude", origem: "path" });
});

test("os dois no PATH: vale quem esta rodando agora; ninguem rodando = codex", () => {
  const both = onlyIn("codex", "claude");
  assert.deepEqual(resolve({ CODEX_THREAD_ID: "t1" }, both), { client: "codex", origem: "rodando_agora" });
  assert.deepEqual(resolve({ CODEX_SESSION_ID: "s1" }, both), { client: "codex", origem: "rodando_agora" });
  assert.deepEqual(resolve({ CLAUDECODE: "1" }, both), { client: "claude", origem: "rodando_agora" });
  assert.deepEqual(resolve({}, both), { client: "codex", origem: "padrao_os_dois" });
  // Sessao aninhada (os dois sinais): ninguem, cai no padrao.
  assert.deepEqual(resolve({ CLAUDECODE: "1", CODEX_THREAD_ID: "t1" }, both), { client: "codex", origem: "padrao_os_dois" });
});

test("nenhum no PATH (ex.: PATH curto): quem roda agora, senao codex", () => {
  assert.deepEqual(resolve({ CLAUDECODE: "1" }, onlyIn()), { client: "claude", origem: "rodando_agora" });
  assert.deepEqual(resolve({}, onlyIn()), { client: "codex", origem: "padrao_nenhum_no_path" });
});

test("ordem: POLOZI_IA_CLIENTE > escolha gravada > PATH", () => {
  const savedClaude = () => "claude\n";
  assert.deepEqual(resolve({ POLOZI_IA_CLIENTE: "Codex" }, onlyIn("claude"), savedClaude), { client: "codex", origem: "variavel" });
  assert.deepEqual(resolve({}, onlyIn("codex"), savedClaude), { client: "claude", origem: "escolha_gravada" });
  assert.deepEqual(resolve({ POLOZI_IA_CLIENTE: "vscode" }, onlyIn("claude")), { client: "claude", origem: "path" }, "valor invalido e ignorado");
  assert.deepEqual(resolve({}, onlyIn("claude"), () => "lixo"), { client: "claude", origem: "path" }, "arquivo invalido e ignorado");
  assert.equal(detectClient({ POLOZI_IA_CLIENTE: "claude" }), "claude");
});

test("findInPath: separador e PATHEXT do Windows", () => {
  // Disco do Windows nao diferencia maiuscula: PATHEXT traz .CMD e o arquivo e codex.cmd.
  const exists = (candidate) => candidate.toLowerCase() === "c:\\npm\\codex.cmd";
  assert.equal(findInPath("codex", { environment: { Path: "C:\\x;C:\\npm" }, platform: "win32", exists }), true);
  assert.equal(findInPath("claude", { environment: { Path: "C:\\x;C:\\npm" }, platform: "win32", exists }), false);
  assert.deepEqual(availableClients({ environment: { PATH: "/a:/bin-falso" }, platform: "linux", exists: onlyIn("claude", "codex") }), ["codex", "claude"]);
  assert.equal(findInPath("codex", { environment: {}, platform: "darwin", exists: () => true }), false, "PATH vazio nao acha nada");
});

test("runningClient le so as variaveis dos clientes", () => {
  assert.equal(runningClient({}), null);
  assert.equal(runningClient({ CLAUDECODE: "1" }), "claude");
  assert.equal(runningClient({ CODEX_THREAD_ID: "x" }), "codex");
  assert.equal(runningClient({ CODEX_HOME: "/x" }), null, "CODEX_HOME existe sem o Codex rodando");
});

test("escolha gravada vai para a pasta de estado (fora da Casa) e volta", () => {
  const dir = mkdtempSync(path.join(os.tmpdir(), "cliente-ia-"));
  try {
    const environment = { WHATSAPP_LOCAL_STATE_DIR: path.join(dir, "estado") };
    assert.equal(readPreference(environment), null);
    assert.equal(writePreference("CLAUDE", environment), "claude");
    assert.equal(preferenceFile(environment), path.join(dir, "estado", "cliente-ia"));
    assert.equal(readPreference(environment), "claude");
    assert.throws(() => writePreference("vscode", environment), /Cliente invalido/);
    mkdirSync(path.join(dir, "outro"), { recursive: true });
    writeFileSync(path.join(dir, "outro", "cliente-ia"), "codex");
    assert.equal(readPreference({ WHATSAPP_LOCAL_STATE_DIR: path.join(dir, "outro") }), "codex");
  } finally {
    rmSync(dir, { recursive: true, force: true });
  }
});

test("isMissingCommand reconhece so executavel ausente", () => {
  assert.equal(isMissingCommand(Object.assign(new Error("spawn claude ENOENT"), { code: "ENOENT" })), true);
  assert.equal(isMissingCommand(new Error("spawn codex ENOENT")), true);
  assert.equal(isMissingCommand(new Error("limite de uso")), false);
  assert.equal(otherClient("claude"), "codex");
  assert.equal(otherClient("codex"), "claude");
});
