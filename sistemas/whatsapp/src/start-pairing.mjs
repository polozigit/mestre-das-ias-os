import { pathToFileURL } from "node:url";

import { PAIRING_PAGE_URL, startPairingPage } from "./pairing-page.mjs";

import {
  ensureEngine,
  getConnectionStatus,
  getLiveQr,
  isConnected,
  startPairing,
} from "./engine-client.mjs";

const POLL_INTERVAL_MS = 2000;
const TIMEOUT_MS = 15 * 60 * 1000;
const QR_RENEWAL_COOLDOWN_MS = 30 * 1000;
const PAGE_CLOSE_DELAY_MS = 3000;

export const PAIRING_TIMEOUT_MESSAGE = "Tempo de pareamento esgotado. Nenhum QR foi salvo; gere um novo somente quando estiver pronto para escanear.";

// Abre a pagina local do QR, inicia o pareamento e espera a pessoa escanear.
// Devolve quando o WhatsApp conecta; lanca erro se o tempo esgotar.
// `onStarted` roda logo depois que a pagina abriu e o pareamento comecou.
export async function pairUntilConnected(config, {
  startPage = startPairingPage,
  startPairingImpl = startPairing,
  getStatus = getConnectionStatus,
  getQr = getLiveQr,
  onStarted = () => {},
  onQr = () => {},
  sleep = (ms) => new Promise((resolvePromise) => setTimeout(resolvePromise, ms)),
  now = () => Date.now(),
  timeoutMs = TIMEOUT_MS,
  pollMs = POLL_INTERVAL_MS,
  renewalCooldownMs = QR_RENEWAL_COOLDOWN_MS,
  closeDelayMs = PAGE_CLOSE_DELAY_MS,
} = {}) {
  const pairingPage = await startPage();
  try {
    await startPairingImpl(config);
  } catch (error) {
    await pairingPage.close();
    throw error;
  }
  onStarted();

  const deadline = now() + timeoutMs;
  let lastQr = "";
  let lastRenewal = now();
  while (now() < deadline) {
    if (isConnected(await getStatus(config))) {
      pairingPage.setConnected();
      setTimeout(() => pairingPage.close(), closeDelayMs);
      return;
    }

    const qr = await getQr(config);
    if (!qr) {
      pairingPage.setMessage("Gerando um QR novo. Aguarde alguns segundos.");
      if (now() - lastRenewal >= renewalCooldownMs) {
        await startPairingImpl(config);
        lastRenewal = now();
      }
    } else if (qr !== lastQr) {
      lastQr = qr;
      await pairingPage.setQr(qr);
      onQr();
    }

    await sleep(pollMs);
  }

  await pairingPage.close();
  throw new Error(PAIRING_TIMEOUT_MESSAGE);
}

async function main() {
  const config = await ensureEngine();
  if (isConnected(await getConnectionStatus(config))) {
    console.log("WHATSAPP_CONNECTION=CONNECTED");
    console.log("Ja existe uma sessao conectada. Para trocar de numero, execute npm run reset:session antes.");
    return;
  }

  await pairUntilConnected(config, {
    onStarted: () => {
      console.log("PAIRING_STARTED=sim");
      console.log(`QR_PAGE_OPENED=${PAIRING_PAGE_URL}`);
      console.log("Escaneie somente o QR exibido na pagina local.");
    },
    onQr: () => console.log("QR_ATUALIZADO_NA_PAGINA_LOCAL=sim"),
  });
  console.log("WHATSAPP_CONNECTION=CONNECTED");
}

if (process.argv[1] && pathToFileURL(process.argv[1]).href === import.meta.url) {
  main().catch((error) => {
    console.error(`PAIRING_ERROR=${error.message}`);
    process.exit(1);
  });
}
