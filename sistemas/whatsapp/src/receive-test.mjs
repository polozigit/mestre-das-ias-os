import WebSocket from "ws";

import { extractIncomingTestMessage } from "./incoming-event.mjs";
import {
  engineSocketUrl,
  ensureEngine,
  waitForConnection,
  isConnected,
  ownPhone,
  NOT_CONNECTED_MESSAGE,
} from "./engine-client.mjs";

const TIMEOUT_MS = 10 * 60 * 1000;

const config = await ensureEngine();
const status = await waitForConnection(config);
if (!isConnected(status)) throw new Error(`${NOT_CONNECTED_MESSAGE} O modo de recebimento nao foi iniciado.`);

const ownerPhone = ownPhone(status);
if (!ownerPhone) throw new Error("Nao foi possivel confirmar o numero conectado. O modo de recebimento nao foi iniciado.");

// O motor so repassa eventos enquanto este socket estiver conectado e so do proprio chat.
const socket = new WebSocket(engineSocketUrl(config));
const timeout = setTimeout(() => {
  socket.close();
  console.log("WHATSAPP_RECEIVE_TEST=TIMEOUT");
  process.exit(1);
}, TIMEOUT_MS);

socket.on("open", () => console.log("WHATSAPP_RECEIVE_TEST=LISTENING"));
socket.on("message", (raw) => {
  const message = extractIncomingTestMessage(raw, ownerPhone);
  if (!message) return;

  clearTimeout(timeout);
  socket.close();
  console.log("WHATSAPP_RECEIVE_TEST=RECEIVED");
  console.log(`WHATSAPP_RECEIVE_TEST_FROM_SELF=${message.fromMe ? "sim" : "nao"}`);
  console.log(`WHATSAPP_RECEIVE_TEST_LENGTH=${message.length}`);
});
socket.on("error", (error) => {
  clearTimeout(timeout);
  console.error(`WHATSAPP_RECEIVE_TEST_ERROR=${error.message}`);
  process.exit(1);
});
