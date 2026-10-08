import { readFile, unlink } from "node:fs/promises";

import { getLiveAssistantPidFile } from "./local-paths.mjs";

// O motor so repassa eventos a quem esta conectado: basta encerrar o processo do assistente.
const pidFile = getLiveAssistantPidFile();
const pid = Number((await readFile(pidFile, "utf8").catch(() => "")).trim());
if (Number.isInteger(pid) && pid > 1) {
  try { process.kill(pid, "SIGTERM"); } catch {}
}
await unlink(pidFile).catch(() => {});
console.log("WHATSAPP_LIVE_ASSISTANT=STOPPED");
