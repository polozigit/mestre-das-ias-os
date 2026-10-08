import { ensureEngine, waitForConnection, isConnected, ownPhone, sendText, NOT_CONNECTED_MESSAGE } from "./engine-client.mjs";

const [phone, text] = process.argv.slice(2);
if (!phone || !text) {
  console.error("Uso: npm run send:test -- <seu-numero-com-DDI> <mensagem>");
  process.exit(1);
}

const config = await ensureEngine();
const status = await waitForConnection(config);
if (!isConnected(status)) {
  console.error(`SEND_TEST_ERROR=${NOT_CONNECTED_MESSAGE}`);
  process.exit(1);
}
const ownerPhone = ownPhone(status);
if (!ownerPhone) {
  console.error("SEND_TEST_ERROR=Nao foi possivel confirmar o numero conectado. Reconecte o WhatsApp e tente de novo.");
  process.exit(1);
}
if (phone !== ownerPhone) {
  console.error("SEND_TEST_ERROR=O primeiro teste deve ser enviado somente para o proprio numero conectado.");
  process.exit(1);
}

const payload = await sendText(config, phone, text, "teste");
console.log(`WHATSAPP_SEND_ACCEPTED=${payload?.id || "aceito"}`);
