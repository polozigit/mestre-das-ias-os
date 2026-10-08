import { createServer } from "node:http";
import { spawn } from "node:child_process";

import QRCode from "qrcode";

export const PAIRING_PAGE_URL = "http://127.0.0.1:8787";

function openBrowser(url) {
  if (process.platform === "darwin") {
    spawn("open", [url], { detached: true, stdio: "ignore" }).unref();
  } else if (process.platform === "win32") {
    spawn("cmd", ["/c", "start", "", url], { detached: true, stdio: "ignore" }).unref();
  }
}

function pageHtml() {
  return `<!doctype html>
<html lang="pt-BR"><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1">
<title>Conectar WhatsApp local</title>
<style>body{margin:0;min-height:100vh;display:grid;place-items:center;background:#101513;color:#f4f7f5;font:16px system-ui,sans-serif}.card{width:min(92vw,520px);padding:32px;border-radius:18px;background:#1a211e;text-align:center}h1{margin-top:0;color:#25d366}img{width:min(72vw,360px);min-height:220px;margin:16px 0;background:#fff;border-radius:12px}.muted{color:#b6c1ba}</style>
<main class="card"><h1>Conectar WhatsApp</h1><p>Abra no celular: WhatsApp &gt; Configurações &gt; Aparelhos conectados &gt; Conectar aparelho.</p><img id="qr" alt="Aguardando QR Code"><p id="status" class="muted">Preparando QR Code...</p><p class="muted">Esta página existe apenas neste computador e não salva o QR.</p></main>
<script>const qr=document.getElementById('qr'),status=document.getElementById('status');async function update(){try{const r=await fetch('/state',{cache:'no-store'}),s=await r.json();if(s.connected){status.textContent='Conectado com sucesso. Esta janela pode ser fechada.';qr.removeAttribute('src');return}if(s.qrSrc){qr.src=s.qrSrc;status.textContent='Escaneie este QR agora.'}else status.textContent=s.message||'Aguardando QR Code...'}catch{status.textContent='Reconectando à página local...'}}update();setInterval(update,2500)</script>
</html>`;
}

export async function startPairingPage() {
  let state = { qrSrc: "", connected: false, message: "Aguardando QR Code..." };
  const server = createServer((request, response) => {
    if (request.url?.startsWith("/state")) {
      response.writeHead(200, { "Content-Type": "application/json", "Cache-Control": "no-store" });
      response.end(JSON.stringify({ qrSrc: state.qrSrc, connected: state.connected, message: state.message }));
      return;
    }
    response.writeHead(200, { "Content-Type": "text/html; charset=utf-8", "Cache-Control": "no-store" });
    response.end(pageHtml());
  });

  await new Promise((resolvePromise, reject) => {
    server.once("error", reject);
    server.listen(8787, "127.0.0.1", () => {
      server.off("error", reject);
      resolvePromise();
    });
  });

  openBrowser(PAIRING_PAGE_URL);
  return {
    // Aceita o QR cru do motor (string) e gera a imagem aqui; data URL pronta tambem serve.
    async setQr(qr) {
      const qrSrc = typeof qr === "string" && qr.startsWith("data:image/")
        ? qr
        : await QRCode.toDataURL(qr, { margin: 1, errorCorrectionLevel: "M" });
      state = { ...state, qrSrc, message: "Escaneie este QR agora." };
    },
    setConnected() {
      state = { ...state, qrSrc: "", connected: true, message: "Conectado com sucesso." };
    },
    setMessage(message) {
      state = { ...state, message };
    },
    close() {
      return new Promise((resolvePromise) => server.close(resolvePromise));
    },
  };
}
