import { execFile } from "node:child_process";
import { readFile } from "node:fs/promises";
import { promisify } from "node:util";

import { getLiveAssistantPidFile } from "./local-paths.mjs";

export function isAlive(pid) {
  try {
    process.kill(pid, 0);
    return true;
  } catch {
    return false;
  }
}

// O pid do arquivo pode ter sido reaproveitado por outro programa: confere que ainda e o assistente.
export async function commandLineMatches(pid, needle, { platform = process.platform, exec = promisify(execFile) } = {}) {
  try {
    if (platform === "win32") {
      // Sem ps no Windows: basta ser um node.exe.
      const { stdout } = await exec("tasklist", ["/FI", `PID eq ${pid}`, "/FO", "CSV", "/NH"]);
      return /node\.exe/i.test(stdout);
    }
    const { stdout } = await exec("ps", ["-p", String(pid), "-o", "command="]);
    return stdout.includes(needle);
  } catch {
    return false;
  }
}

// Devolve o pid do assistente em execucao ou 0.
export async function runningAssistantPid({
  environment = process.env,
  readPid = async () => readFile(getLiveAssistantPidFile(environment), "utf8"),
  alive = isAlive,
  matches = commandLineMatches,
} = {}) {
  const pid = Number(String(await readPid().catch(() => "")).trim());
  if (!Number.isInteger(pid) || pid <= 1 || !alive(pid)) return 0;
  return await matches(pid, "live-assistant.mjs") ? pid : 0;
}
