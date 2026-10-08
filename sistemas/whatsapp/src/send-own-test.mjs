import { ensureEngine, waitForConnection, isConnected, ownPhone, sendText, NOT_CONNECTED_MESSAGE } from "./engine-client.mjs";

const config = await ensureEngine();
const status = await waitForConnection(config);
if (!isConnected(status)) {
  throw new Error(`${NOT_CONNECTED_MESSAGE} O teste nao foi enviado.`);
}

const ownerPhone = ownPhone(status);
if (!ownerPhone) {
  throw new Error("Nao foi possivel confirmar o numero conectado. O teste nao foi enviado.");
}

const payload = await sendText(config, ownerPhone, "Teste local autorizado", "teste");
console.log(`WHATSAPP_SEND_ACCEPTED=${payload?.id || "aceito"}`);
