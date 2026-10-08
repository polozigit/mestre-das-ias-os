import { writeFile, unlink } from "node:fs/promises";

import WebSocket from "ws";

import { runningAssistantPid } from "./assistant-process.mjs";
import { createAssistantHandler } from "./assistant-core.mjs";
import { askCompanyAI } from "./ia-empresa.mjs";
import { removeTemporaryMedia } from "./midia-temp.mjs";
import {
  engineSocketUrl,
  ensureEngine,
  waitForConnection,
  isConnected,
  ownPhone,
  sendText,
  NOT_CONNECTED_MESSAGE,
} from "./engine-client.mjs";
import { getLiveAssistantPidFile } from "./local-paths.mjs";

// Dois assistentes ao mesmo tempo responderiam em dobro: se ja ha um, nao sobe outro.
const runningPid = await runningAssistantPid();
if (runningPid) {
  console.log(`WHATSAPP_LIVE_ASSISTANT=JA_RODANDO pid=${runningPid}`);
  process.exit(0);
}

const config = await ensureEngine();
const status = await waitForConnection(config);
if (!isConnected(status)) throw new Error(`${NOT_CONNECTED_MESSAGE} O assistente nao foi iniciado.`);
const ownerPhone = ownPhone(status);
if (!ownerPhone) throw new Error("Nao foi possivel confirmar o numero conectado. O assistente nao foi iniciado.");

const pidFile = getLiveAssistantPidFile();
await writeFile(pidFile, `${process.pid}\n`, { mode: 0o600 });

let socket;
let stopping = false;

async function stop() {
  if (stopping) return;
  stopping = true;
  socket?.close();
  await unlink(pidFile).catch(() => {});
}

for (const signal of ["SIGINT", "SIGTERM"]) {
  process.once(signal, () => void stop().finally(() => process.exit(0)));
}

const handle = createAssistantHandler({
  ask: askCompanyAI,
  remove: (file) => removeTemporaryMedia(file),
  send: (text) => sendText(config, ownerPhone, text, "assistente"),
});

// O motor so repassa eventos do proprio chat enquanto este socket estiver conectado.
socket = new WebSocket(engineSocketUrl(config));
socket.on("open", () => console.log("WHATSAPP_LIVE_ASSISTANT=LISTENING"));
socket.on("message", handle);
socket.on("error", (error) => console.error(`WHATSAPP_LIVE_ASSISTANT_SOCKET_ERROR=${error.message}`));
socket.on("close", () => {
  if (stopping) return;
  console.error("WHATSAPP_LIVE_ASSISTANT_SOCKET_CLOSED=o motor local encerrou a conexao; execute npm run start:background de novo.");
  unlink(pidFile).catch(() => {}).finally(() => process.exit(1));
});
