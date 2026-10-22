import { createHash } from 'node:crypto';

export function messageKey(accountId, key) {
  return createHash('sha256').update(JSON.stringify([accountId, key.remoteJid || '', key.participant || '', key.id || '', Boolean(key.fromMe)])).digest('hex');
}

function unwrap(message) {
  let content = message || {};
  for (let i = 0; i < 8; i++) {
    const next = content.ephemeralMessage?.message || content.documentWithCaptionMessage?.message;
    if (!next) break;
    content = next;
  }
  return content;
}
function numeric(value) {
  if (typeof value?.toNumber === 'function') return value.toNumber();
  return Number(value || 0);
}

export function normalizeMessage(raw) {
  const key = raw?.key;
  if (!key?.remoteJid || !key.id || key.remoteJid === 'status@broadcast' || /@newsletter$/.test(key.remoteJid)) return null;
  let content = unwrap(raw.message);
  let sourceId = key.id;
  let targetKey=key;
  let edited = false;
  let deleted = false;
  if (content.protocolMessage) {
    const protocol = content.protocolMessage;
    targetKey={...key,...protocol.key};
    if (protocol.type === 14 && protocol.editedMessage) { content = unwrap(protocol.editedMessage); sourceId = protocol.key?.id || sourceId; edited = true; }
    else if (protocol.type === 0) { sourceId = protocol.key?.id || sourceId; deleted = true; content = {}; }
    else return null;
  }
  const context = content.extendedTextMessage?.contextInfo || content.imageMessage?.contextInfo || content.videoMessage?.contextInfo || content.documentMessage?.contextInfo || content.audioMessage?.contextInfo;
  let tipo = 'text';
  let texto = content.conversation || content.extendedTextMessage?.text || '';
  let media = null;
  for (const [field, type] of [['imageMessage','image'],['videoMessage','video'],['audioMessage','audio'],['documentMessage','document'],['stickerMessage','sticker']]) {
    if (!content[field]) continue;
    const item = content[field]; tipo = type === 'audio' && item.ptt ? 'voice' : type;
    texto = item.caption || '';
    media = { mime: item.mimetype || 'application/octet-stream', nome: item.fileName || `${type}-${sourceId}`, bytes: numeric(item.fileLength), segundos: numeric(item.seconds) };
    break;
  }
  if (content.reactionMessage) { tipo = 'reaction'; texto = content.reactionMessage.text || ''; }
  if (content.locationMessage) { tipo = 'location'; texto = JSON.stringify({ latitude:content.locationMessage.degreesLatitude, longitude:content.locationMessage.degreesLongitude, nome:content.locationMessage.name || '' }); }
  if (content.contactMessage || content.contactsArrayMessage) { tipo = 'contact'; texto = JSON.stringify(content.contactMessage || content.contactsArrayMessage); }
  const poll = content.pollCreationMessage || content.pollCreationMessageV2 || content.pollCreationMessageV3;
  if (poll) { tipo = 'poll'; texto = JSON.stringify({ nome:poll.name, opcoes:poll.options?.map((item)=>item.optionName) || [] }); }
  if (content.viewOnceMessage || content.viewOnceMessageV2 || content.viewOnceMessageV2Extension) texto = '[Mensagem de visualização única indisponível]';
  if (!texto && !media && !deleted && !Object.keys(content).length) return null;
  if (!texto && !media) texto = '[Mensagem não suportada por esta versão]';
  const timestamp = numeric(raw.messageTimestamp);
  return {
    jid: targetKey.remoteJid, provedor_id: sourceId, participante: targetKey.participant || null,
    direcao: targetKey.fromMe ? 'enviada' : 'recebida', tipo, texto, nome: targetKey.remoteJid.endsWith('@g.us')?null:raw.pushName || null,
    criada_em: timestamp > 0 ? new Date(timestamp * 1000).toISOString() : new Date().toISOString(),
    estado: key.fromMe ? 'enviada' : 'recebida', editada: edited, apagada: deleted,
    citada_provedor_id: context?.stanzaId || content.reactionMessage?.key?.id || null,
    ...(media ? { media } : {}),
  };
}

export function referenceKey(reference, jid) {
  if (!reference?.provedor_id) throw Object.assign(new Error('Mensagem de referência ausente.'), { beforeSend:true });
  return { id:reference.provedor_id, remoteJid:reference.jid || jid, fromMe:reference.direcao === 'enviada', ...(reference.participante ? { participant:reference.participante } : {}) };
}
