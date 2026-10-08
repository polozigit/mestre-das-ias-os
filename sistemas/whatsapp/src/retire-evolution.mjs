import { access } from "node:fs/promises";

import { backupCodexConfig } from "./codex-config-backup.mjs";
import { getStateDirectory } from "./local-paths.mjs";
import { commandExists, run } from "./process.mjs";

// Desmonta a pilha antiga (Docker + Evolution Go) e remove o MCP antigo. Tolera ausencia de tudo.
const PROJECT = "polozi-evolution-go-local";
const OLD_MCP = "polozi-whatsapp-evolution-go-local";
const eraseVolumes = process.argv.includes("--apagar-volumes");

if (await commandExists("docker")) {
  try {
    await run("docker", ["compose", "-p", PROJECT, "down", ...(eraseVolumes ? ["--volumes"] : [])], { capture: true });
    console.log("EVOLUTION_DOCKER=DERRUBADO");
    console.log(`EVOLUTION_VOLUMES=${eraseVolumes ? "APAGADOS" : "MANTIDOS"}`);
  } catch (error) {
    console.log(`EVOLUTION_DOCKER=NAO_FOI_POSSIVEL (${String(error.message).split("\n")[0].slice(0, 160)})`);
  }
} else {
  console.log("EVOLUTION_DOCKER=DOCKER_AUSENTE");
}

for (const [client, args] of [
  ["codex", ["mcp", "remove", OLD_MCP]],
  ["claude", ["mcp", "remove", OLD_MCP, "-s", "user"]],
]) {
  if (!(await commandExists(client))) {
    console.log(`EVOLUTION_MCP_NOT_PRESENT=${client}`);
    continue;
  }
  if (client === "codex") {
    const backupPath = await backupCodexConfig();
    if (backupPath) console.log(`CODEX_CONFIG_BACKUP=${backupPath}`);
  }
  try {
    await run(client, args, { capture: true });
    console.log(`EVOLUTION_MCP_REMOVED=${client}`);
  } catch {
    console.log(`EVOLUTION_MCP_NOT_PRESENT=${client}`);
  }
}

// A pasta antiga guarda a chave e a sessao do Evolution: so avisa, nunca apaga sozinho.
const oldState = getStateDirectory({ ...process.env, WHATSAPP_LOCAL_STATE_DIR: "" }).replace(/whatsapp-local$/, "evolution-go-local");
if (await access(oldState).then(() => true, () => false)) {
  console.log(`EVOLUTION_ESTADO_ANTIGO=${oldState}`);
  console.log("Apague essa pasta quando nao precisar mais voltar a versao com Docker.");
}
