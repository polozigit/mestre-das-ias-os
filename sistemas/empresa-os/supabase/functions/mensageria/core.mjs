// Protocolo independente do runtime: testado no Node, executado no Supabase Edge.
const encoder = new TextEncoder();
export const META_CAPABILITIES = Object.freeze({ send:true,text:true,image:true,video:true,audio:true,voice:true,document:true,sticker:true,reaction:true,reply:true,forward:true,read:true,groups:false,edit:false,delete:false,poll:false,history:false });
export function privatePath(contaId, path) {
  if (!/^[0-9a-f-]{36}$/i.test(contaId) || typeof path !== 'string' || !path.startsWith(contaId+'/') || path.length>400 || path.split('/').some(p=>!p || p==='.' || p==='..') || /[\\\u0000-\u001f%?#]/.test(path)) throw new Error('Caminho de arquivo inválido.');
  return path;
}
export function validateMedia(mime, bytes,provider='meta') {
  let type=String(mime||'').split(';')[0].trim().toLowerCase();
  if(provider==='baileys')type=({'application/x-zip-compressed':'application/zip','audio/x-m4a':'audio/mp4'})[type]||type;
  const limits = { 'image/jpeg':5,'image/png':5,'image/webp':0.5,'video/mp4':16,'video/3gpp':16,'video/quicktime':16,'audio/ogg':16,'audio/opus':16,'audio/webm':16,'audio/mp4':16,'audio/mpeg':16,'audio/aac':16,'audio/wav':16,'application/pdf':100,'application/zip':100,'application/octet-stream':100,'text/plain':100,'text/csv':100,'application/json':100,'application/msword':100,'application/vnd.ms-excel':100,'application/vnd.ms-powerpoint':100,'application/vnd.openxmlformats-officedocument.wordprocessingml.document':100,'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet':100,'application/vnd.openxmlformats-officedocument.presentationml.presentation':100 };
  const max=provider==='baileys'?100:limits[type];
  if (!max) throw new Error('Formato de arquivo não permitido.');
  if (!Number.isSafeInteger(bytes) || bytes<=0 || bytes>max*1024*1024) throw new Error(`Arquivo excede o limite de ${max} MB.`);
  // Arquivos genericos ficam para download, sem executar HTML/SVG no navegador.
  return provider==='baileys'&&!limits[type]?'application/octet-stream':type;
}
export async function readLimited(response, max) {
  const reader=response.body?.getReader(); if (!reader) return new Uint8Array();
  const chunks=[]; let size=0;
  try { for (;;) { const {done,value}=await reader.read(); if(done)break; size+=value.length; if(size>max)throw new Error('Corpo excede o limite permitido.'); chunks.push(value); } }
  catch(error){await reader.cancel().catch(()=>{});throw error;}
  finally{reader.releaseLock();}
  const all=new Uint8Array(size);let offset=0;for(const c of chunks){all.set(c,offset);offset+=c.length;}return all;
}
export async function verifyMetaSignature(body, signature, secret) {
  if (!secret || !/^sha256=[0-9a-f]{64}$/i.test(signature||'')) return false;
  const key=await crypto.subtle.importKey('raw',encoder.encode(secret),{name:'HMAC',hash:'SHA-256'},false,['verify']);
  const expected=Uint8Array.from(signature.slice(7).match(/../g),x=>parseInt(x,16));
  return crypto.subtle.verify('HMAC',key,expected,body);
}
function instant(value) { const n=Number(value);return Number.isFinite(n)&&n>0?new Date(n*1000).toISOString():new Date().toISOString(); }
export function normalizeWebhook(payload, phoneId) {
  const mensagens=[],recibos=[];
  for(const entry of payload.entry||[]) for(const change of entry.changes||[]) {
    const value=change.value; if(value?.metadata?.phone_number_id!==phoneId)continue;
    for(const message of value.messages||[]) {
      if(!message.id || !/^\d{8,15}$/.test(message.from))continue;
      const media=message[message.type];
      const type=message.type==='audio'&&media?.voice?'voice':message.type;
      const nome=value.contacts?.find(c=>c.wa_id===message.from)?.profile?.name||message.from;
      mensagens.push({provedor_id:message.id,jid:message.from+'@s.whatsapp.net',nome,grupo:false,participante:message.from,direcao:'recebida',tipo:type,texto:message.text?.body||media?.caption||(type==='reaction'?message.reaction?.emoji:'')||'',estado:'recebida',criada_em:instant(message.timestamp),citada_provedor_id:message.context?.id||null,media:media?.id?{id:media.id,mime:media.mime_type,nome:media.filename||`${message.id.replace(/[^a-z0-9]/gi,'_')}.${type==='voice'?'ogg':'bin'}`} : null,conteudo:message.type==='location'?message.location:message.type==='contacts'?message.contacts:message.type==='reaction'?message.reaction:null});
    }
    for(const status of value.statuses||[]) {
      const estado={sent:'enviada',delivered:'entregue',read:'lida',failed:'falhou'}[status.status];
      if(estado&&status.id)recibos.push({provedor_id:status.id,jid:status.recipient_id+'@s.whatsapp.net',estado});
    }
  }
  return {mensagens,recibos};
}
export function buildMetaPayload(command, mediaId=null, now=Date.now()) {
  const content=command.conteudo||{};
  if(String(command.jid).endsWith('@g.us'))throw new Error('A conta Meta não oferece grupos nesta integração.');
  const to=String(command.jid||'').replace(/@s\.whatsapp\.net$/,'');
  if(!/^\d{8,15}$/.test(to))throw new Error('Destinatário Meta inválido.');
  const base={messaging_product:'whatsapp',recipient_type:'individual',to};
  if(command.tipo==='read') return {messaging_product:'whatsapp',status:'read',message_id:content.provedor_id};
  if(command.tipo==='reaction')return {...base,type:'reaction',reaction:{message_id:content.provedor_id,emoji:content.emoji||''}};
  if(command.tipo!=='send')throw new Error('Operação indisponível na API oficial.');
  if(content.template){if(!content.template.name||!content.template.language?.code)throw new Error('Template inválido.');return {...base,type:'template',template:content.template};}
  const last=new Date(command.ultima_recebida_em||0).getTime();
  if(!Number.isFinite(last)||last<=0||now-last>=24*60*60*1000)throw new Error('Fora da janela de atendimento: selecione um template aprovado.');
  const quoted=command.citada_provedor_id||(content.citada_id?command.referencia?.provedor_id:null);
  const context=quoted?{message_id:quoted}:undefined;
  if(content.tipo==='text') { if(!content.texto?.trim()||content.texto.length>4096)throw new Error('Texto vazio ou longo demais.');return {...base,type:'text',context,text:{body:content.texto}}; }
  const type=content.tipo==='voice'?'audio':content.tipo;
  if(!['image','video','audio','document','sticker'].includes(type)||!mediaId)throw new Error('Mídia não preparada para o envio.');
  const media={id:mediaId};
  if(content.tipo==='voice'){if(!/^audio\/(ogg|opus)/.test(content.anexo?.mime||''))throw new Error('Nota de voz precisa ser OGG/Opus.');media.voice=true;}
  if(['image','video','document'].includes(type)&&content.texto)media.caption=content.texto;
  if(type==='document')media.filename=content.anexo?.nome||'documento';
  return {...base,type,context,[type]:media};
}
export async function dispatchMeta(command, account, {fetchImpl=fetch,loadMedia,authorize}={}) {
  let dispatched=false;
  try {
    if(!/^v\d+\.0$/.test(account.graph_version)||!/^\d+$/.test(account.phone_id))throw new Error('Configuração Meta inválida.');
    // Valida janela e tipo ANTES de transferir arquivo; ID provisório só para validação.
    buildMetaPayload(command,command.conteudo?.anexo?'validation':null);
    let mediaId=null;
    if(command.conteudo?.anexo){
      const anexo=command.conteudo.anexo;
      privatePath(account.id,anexo.path);validateMedia(anexo.mime,anexo.bytes);
      if(!loadMedia)throw new Error('Processamento de mídia indisponível.');
      const bytes=await loadMedia(anexo);validateMedia(anexo.mime,bytes.length);
      const form=new FormData();form.append('messaging_product','whatsapp');form.append('type',anexo.mime);form.append('file',new Blob([bytes],{type:anexo.mime}),anexo.nome);
      const up=await fetchImpl(`https://graph.facebook.com/${account.graph_version}/${account.phone_id}/media`,{method:'POST',headers:{Authorization:`Bearer ${account.access_token}`},body:form,signal:AbortSignal.timeout(60000)});
      const result=await up.json();if(!up.ok||!result.id)throw new Error('Meta recusou o arquivo.');mediaId=result.id;
    }
    // Upload pode demorar: a mesma revisao, permissao e lease precisam continuar validos.
    if(authorize)await authorize(command);
    const body=buildMetaPayload(command,mediaId);
    dispatched=true;
    const response=await fetchImpl(`https://graph.facebook.com/${account.graph_version}/${account.phone_id}/messages`,{method:'POST',headers:{Authorization:`Bearer ${account.access_token}`,'Content-Type':'application/json'},body:JSON.stringify(body),signal:AbortSignal.timeout(30000)});
    const result=await response.json();
    if(!response.ok)return {estado:response.status>=500?'incerto':'falhou',erro:`Meta respondeu HTTP ${response.status}.`};
    const id=result.messages?.[0]?.id;
    if(command.tipo==='read'||command.tipo==='reaction')return {estado:'enviado',provedor_id:id||command.conteudo?.provedor_id};
    return id?{estado:'enviado',provedor_id:id}:{estado:'incerto',erro:'Meta respondeu sem identificador da mensagem.'};
  }catch(error){return {estado:dispatched?'incerto':'falhou',erro:dispatched?'Confirmação Meta indisponível; reconcilie antes de reenviar.':String(error.message).slice(0,180)};}
}
