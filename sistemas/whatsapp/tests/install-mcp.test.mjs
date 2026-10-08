import assert from "node:assert/strict";
import test from "node:test";

import { MCP_NAME, installMcp } from "../src/install-mcp.mjs";

function fakeRun({ exists = false, addFails = false } = {}) {
  const calls = [];
  const runCommand = async (command, args, options = {}) => {
    calls.push({ command, args, options });
    if (args[1] === "get" && !exists) throw new Error("nao encontrado");
    if (args[1] === "add" && addFails) throw new Error("spawn codex ENOENT");
    return { code: 0, stdout: "", stderr: "" };
  };
  return { calls, runCommand };
}

test("claude: instala no escopo do usuario com o caminho absoluto do servidor", async () => {
  const { calls, runCommand } = fakeRun();
  assert.equal(await installMcp("claude", { runCommand, serverPath: "/casa/sistemas/whatsapp/src/mcp-server.mjs", quiet: true }), "instalado");
  const add = calls.find((call) => call.args[1] === "add");
  assert.deepEqual(add.args, ["mcp", "add", "--scope", "user", MCP_NAME, "--", "node", "/casa/sistemas/whatsapp/src/mcp-server.mjs"]);
  assert.equal(add.options.capture, true, "modo quieto captura a saida do cliente");
});

test("codex: faz backup do config antes de instalar", async () => {
  const { calls, runCommand } = fakeRun();
  const backups = [];
  const result = await installMcp("codex", {
    runCommand,
    serverPath: "/s.mjs",
    backup: async () => "/home/.codex/config.toml.bak-1",
    onBackup: (file) => backups.push(file),
  });
  assert.equal(result, "instalado");
  assert.deepEqual(backups, ["/home/.codex/config.toml.bak-1"]);
  assert.deepEqual(calls.at(-1).args, ["mcp", "add", MCP_NAME, "--", "node", "/s.mjs"]);
});

test("ja existe: nao reinstala, nao faz backup e devolve ja_existia", async () => {
  const { calls, runCommand } = fakeRun({ exists: true });
  let backedUp = false;
  assert.equal(await installMcp("codex", { runCommand, backup: async () => { backedUp = true; return ""; } }), "ja_existia");
  assert.equal(calls.some((call) => call.args[1] === "add"), false);
  assert.equal(backedUp, false);
});

test("falha ao registrar sobe o erro; cliente invalido e recusado", async () => {
  const { runCommand } = fakeRun({ addFails: true });
  await assert.rejects(installMcp("codex", { runCommand, backup: async () => "" }), /ENOENT/);
  await assert.rejects(installMcp("vscode", { runCommand }), /Cliente invalido/);
});
