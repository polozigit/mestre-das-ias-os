import { spawn } from "node:child_process";
import { closeSync } from "node:fs";
import path from "node:path";
import { fileURLToPath, pathToFileURL } from "node:url";

import { runningAssistantPid } from "./assistant-process.mjs";
import {
  ensureEngine,
  isConnected,
  NOT_CONNECTED_MESSAGE,
  openLogForAppend,
  waitForConnection,
} from "./engine-client.mjs";
import { getLiveAssistantLogFile } from "./local-paths.mjs";

const ASSISTANT_PATH = path.join(path.dirname(fileURLToPath(import.meta.url)), "live-assistant.mjs");

function spawnAssistant(environment, spawnImpl = spawn) {
  const logFd = openLogForAppend(getLiveAssistantLogFile(environment));
  try {
    const child = spawnImpl(process.execPath, [ASSISTANT_PATH], {
      detached: true,
      stdio: ["ignore", logFd, logFd],
      windowsHide: true,
      env: environment,
    });
    child.on?.("error", () => {});
    child.unref();
  } finally {
    closeSync(logFd);
  }
}

// Comando de login: garante o motor e sobe o assistente desacoplado, sem duplicar.
// Devolve o codigo de saida (0 = assistente no ar).
export async function startBackground({
  environment = process.env,
  ensure = ensureEngine,
  waitConnected = waitForConnection,
  isRunning = runningAssistantPid,
  spawnAssistantImpl = spawnAssistant,
  sleep = (ms) => new Promise((resolvePromise) => setTimeout(resolvePromise, ms)),
  waitMs = 10000,
  pollMs = 250,
  log = console.log,
} = {}) {
  const config = await ensure();
  log("WHATSAPP_MOTOR=NO_AR");

  const alreadyRunning = await isRunning();
  if (alreadyRunning) {
    log(`WHATSAPP_LIVE_ASSISTANT=JA_RODANDO pid=${alreadyRunning}`);
    return 0;
  }

  if (!isConnected(await waitConnected(config))) {
    log("WHATSAPP_CONNECTION=NOT_CONNECTED");
    log(`WHATSAPP_AVISO=${NOT_CONNECTED_MESSAGE}`);
    log("WHATSAPP_LIVE_ASSISTANT=NAO_INICIADO");
    return 1;
  }

  spawnAssistantImpl(environment);
  const deadline = Date.now() + waitMs;
  while (Date.now() < deadline) {
    await sleep(pollMs);
    const pid = await isRunning();
    if (pid) {
      log(`WHATSAPP_LIVE_ASSISTANT=INICIADO pid=${pid}`);
      return 0;
    }
  }
  log(`WHATSAPP_LIVE_ASSISTANT=NAO_CONFIRMADO log=${getLiveAssistantLogFile(environment)}`);
  return 1;
}

if (process.argv[1] && pathToFileURL(process.argv[1]).href === import.meta.url) {
  try {
    process.exitCode = await startBackground();
  } catch (error) {
    console.error(`START_BACKGROUND_ERROR=${error.message}`);
    process.exitCode = 1;
  }
}
