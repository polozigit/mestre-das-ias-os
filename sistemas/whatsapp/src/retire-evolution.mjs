import { access } from "node:fs/promises";
import { pathToFileURL } from "node:url";

import { backupCodexConfig } from "./codex-config-backup.mjs";
import { getStateDirectory } from "./local-paths.mjs";
import { commandExists, run } from "./process.mjs";

// Desmonta a pilha antiga (Docker + Evolution Go) e remove o MCP antigo. Tolera ausencia de tudo.
export const PROJECT = "polozi-evolution-go-local";
export const OLD_MCP = "polozi-whatsapp-evolution-go-local";

// A pilha antiga esta de pe? (container do projeto compose antigo rodando; ela ocupa a porta 8082).
// Leitura pura: sem Docker, ou Docker parado, devolve false.
export async function oldStackRunning({ runCommand = run, hasCommand = commandExists } = {}) {
  if (!(await hasCommand("docker"))) return false;
  try {
    const { stdout } = await runCommand("docker", [
      "ps", "--quiet", "--filter", `label=com.docker.compose.project=${PROJECT}`,
    ], { capture: true });
    return String(stdout).trim().length > 0;
  } catch {
    return false;
  }
}

export async function retireEvolution({
  eraseVolumes = false,
  runCommand = run,
  hasCommand = commandExists,
  backup = backupCodexConfig,
  log = console.log,
} = {}) {
  if (await hasCommand("docker")) {
    try {
      await runCommand("docker", ["compose", "-p", PROJECT, "down", ...(eraseVolumes ? ["--volumes"] : [])], { capture: true });
      log("EVOLUTION_DOCKER=DERRUBADO");
      log(`EVOLUTION_VOLUMES=${eraseVolumes ? "APAGADOS" : "MANTIDOS"}`);
    } catch (error) {
      log(`EVOLUTION_DOCKER=NAO_FOI_POSSIVEL (${String(error.message).split("\n")[0].slice(0, 160)})`);
    }
  } else {
    log("EVOLUTION_DOCKER=DOCKER_AUSENTE");
  }

  for (const [client, args] of [
    ["codex", ["mcp", "remove", OLD_MCP]],
    ["claude", ["mcp", "remove", OLD_MCP, "-s", "user"]],
  ]) {
    if (!(await hasCommand(client))) {
      log(`EVOLUTION_MCP_NOT_PRESENT=${client}`);
      continue;
    }
    if (client === "codex") {
      const backupPath = await backup();
      if (backupPath) log(`CODEX_CONFIG_BACKUP=${backupPath}`);
    }
    try {
      await runCommand(client, args, { capture: true });
      log(`EVOLUTION_MCP_REMOVED=${client}`);
    } catch {
      log(`EVOLUTION_MCP_NOT_PRESENT=${client}`);
    }
  }

  // A pasta antiga guarda a chave e a sessao do Evolution: so avisa, nunca apaga sozinho.
  const oldState = getStateDirectory({ ...process.env, WHATSAPP_LOCAL_STATE_DIR: "" }).replace(/whatsapp-local$/, "evolution-go-local");
  if (await access(oldState).then(() => true, () => false)) {
    log(`EVOLUTION_ESTADO_ANTIGO=${oldState}`);
    log("Apague essa pasta quando nao precisar mais voltar a versao com Docker.");
  }
}

if (process.argv[1] && pathToFileURL(process.argv[1]).href === import.meta.url) {
  await retireEvolution({ eraseVolumes: process.argv.includes("--apagar-volumes") });
}
