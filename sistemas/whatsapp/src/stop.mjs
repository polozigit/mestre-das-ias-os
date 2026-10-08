import { execFile } from "node:child_process";
import { readFile, unlink } from "node:fs/promises";
import { promisify } from "node:util";

import { probeEngine, readLocalConfig, requestEngine } from "./engine-client.mjs";
import { getEnginePidFile } from "./local-paths.mjs";

const sleep = (ms) => new Promise((resolvePromise) => setTimeout(resolvePromise, ms));

async function waitUntilDown(config, attempts = 20) {
  for (let i = 0; i < attempts; i += 1) {
    if (await probeEngine(config) === "down") return true;
    await sleep(250);
  }
  return false;
}

function alive(pid) {
  try {
    process.kill(pid, 0);
    return true;
  } catch {
    return false;
  }
}

// Em macOS/Linux confere que o pid e mesmo o motor antes de matar (pid pode ter sido reaproveitado).
async function pidIsEngine(pid) {
  if (process.platform === "win32") return false;
  try {
    const { stdout } = await promisify(execFile)("ps", ["-p", String(pid), "-o", "command="]);
    return stdout.includes("engine.mjs");
  } catch {
    return false;
  }
}

const pidFile = getEnginePidFile();
const pid = Number((await readFile(pidFile, "utf8").catch(() => "")).trim());
let config = null;
try { config = await readLocalConfig(); } catch {}

let wasRunning = false;
let stopped = true;
if (config && await probeEngine(config) === "up") {
  wasRunning = true;
  await requestEngine(config, "/shutdown", { method: "POST", body: {}, timeoutMs: 5000 }).catch(() => {});
  stopped = await waitUntilDown(config);
  // Fallback: o motor respondeu ao HTTP mas nao saiu; encerra pelo pid que ele mesmo gravou.
  if (!stopped && Number.isInteger(pid) && pid > 1) {
    try { process.kill(pid, "SIGTERM"); } catch {}
    stopped = await waitUntilDown(config);
  }
} else if (Number.isInteger(pid) && pid > 1 && alive(pid) && await pidIsEngine(pid)) {
  // Motor travado (nao responde ao HTTP) mas o processo existe.
  wasRunning = true;
  try { process.kill(pid, "SIGTERM"); } catch {}
  await sleep(1500);
  stopped = !alive(pid);
}

if (stopped) await unlink(pidFile).catch(() => {});
console.log(`WHATSAPP_MOTOR_WAS_RUNNING=${wasRunning ? "sim" : "nao"}`);
console.log(`WHATSAPP_MOTOR_STOPPED=${stopped ? "sim" : "nao"}`);
if (!stopped) process.exit(1);
