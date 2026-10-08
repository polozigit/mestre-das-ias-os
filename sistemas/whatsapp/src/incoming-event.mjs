// Formato do evento do motor local (WebSocket /ws):
//   {"event":"message","data":{"id":"...","remoteJid":"...","fromMe":false,"text":"..."}}
// Anexo do proprio chat (so PDF/imagem com @ia na legenda; audio e ignorado em silencio, o motor nem emite):
//   "anexo":{"tipo":"pdf|imagem|outro","caminho":"<arquivo temporario>","nome":"...","erro":"..."}
// O motor so emite mensagens do proprio chat; os extratores abaixo ainda
// validam o formato e nao devolvem nada alem do necessario.

function phoneFromJid(jid) {
  return String(jid || "").split("@")[0].split(":")[0].replace(/\D/g, "");
}

export function parseEngineEvent(raw) {
  let envelope;
  try {
    envelope = JSON.parse(Buffer.isBuffer(raw) ? raw.toString("utf8") : String(raw));
  } catch {
    return null;
  }
  if (envelope?.event !== "message" || !envelope.data || typeof envelope.data !== "object") return null;
  const { id, remoteJid, fromMe, text } = envelope.data;
  const anexo = parseAnexo(envelope.data.anexo);
  if (typeof text !== "string" || (!text && !anexo)) return null;
  return {
    id: String(id || ""),
    remoteJid: String(remoteJid || ""),
    fromMe: fromMe === true,
    text,
    ...(anexo ? { anexo } : {}),
  };
}

function parseAnexo(value) {
  if (!value || typeof value !== "object" || typeof value.tipo !== "string") return null;
  const anexo = { tipo: value.tipo };
  for (const key of ["caminho", "nome", "erro"]) if (typeof value[key] === "string" && value[key]) anexo[key] = value[key];
  return anexo;
}

// Comando do assistente: texto que comeca com @ia (ou @polozi) seguido de pergunta.
export function commandFromText(rawText) {
  const text = String(rawText || "").trim();
  const lower = text.toLowerCase();
  const commandPrefix = lower.startsWith("@ia") ? "@ia" : lower.startsWith("@polozi") ? "@polozi" : "";
  if (!commandPrefix) return null;
  const question = text.slice(commandPrefix.length).trim();
  return question ? question : null;
}

export function extractIncomingTestMessage(raw, ownPhone) {
  const event = parseEngineEvent(raw);
  if (!event || event.anexo || !event.text) return null;
  if (!event.fromMe && phoneFromJid(event.remoteJid) !== ownPhone) return null;
  return { id: event.id, text: event.text, length: event.text.length, fromMe: event.fromMe };
}

export function extractLiveAssistantCommand(raw) {
  const event = parseEngineEvent(raw);
  if (!event) return null;
  const question = commandFromText(event.text);
  return question ? { id: event.id, conversationId: event.remoteJid, question, ...(event.anexo ? { anexo: event.anexo } : {}) } : null;
}
