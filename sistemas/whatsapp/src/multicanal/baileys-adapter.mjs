import {createHash} from 'node:crypto';
import {createAuthStore} from './auth-store.mjs';
import {normalizeMessage,messageKey,referenceKey} from './messages.mjs';
import {validatePrivatePath,convertVoice} from './media.mjs';
import {probeGenerator} from './drafts.mjs';
import {GroupNames} from './group-names.mjs';
import {fetchIncomingMedia} from './incoming-media.mjs';

const invalid=message=>Object.assign(new Error(message),{beforeSend:true});
export async function buildMessageContent(content,{loadMedia,accountId,reference}={}){
  if(content.encaminhada_id){
    if(!reference||reference.direcao==='interna')throw invalid('Mensagem para encaminhar indisponível.');
    content={tipo:reference.tipo,texto:reference.texto,anexo:reference.anexo};
  }
  if(content.tipo==='text'){
    if(!content.texto?.trim()||content.texto.length>4096)throw invalid('Texto vazio ou longo demais.');
    return {text:content.texto};
  }
  if(content.tipo==='poll'){
    if(!content.pergunta||!Array.isArray(content.opcoes)||content.opcoes.length<2||content.opcoes.length>12)throw invalid('Enquete inválida.');
    return {poll:{name:content.pergunta,values:content.opcoes,selectableCount:content.multipla?0:1}};
  }
  if(content.tipo==='location')return {location:{degreesLatitude:Number(content.latitude),degreesLongitude:Number(content.longitude),name:content.nome||''}};
  if(content.tipo==='contact')return {contacts:{displayName:content.nome||'Contato',contacts:[{displayName:content.nome||'Contato',vcard:content.vcard}]}};
  if(!['image','video','audio','voice','document','sticker'].includes(content.tipo))throw invalid('Tipo de mensagem indisponível.');
  validatePrivatePath(content.anexo?.path,accountId);
  if(!loadMedia)throw invalid('Arquivo indisponível.');
  let bytes=await loadMedia(content.anexo),mime=content.anexo.mime;
  if(!bytes.length||bytes.length>100*1024*1024)throw invalid('Arquivo fora do limite.');
  if(content.tipo==='voice')({bytes,mime}=await convertVoice(bytes,mime));
  const type=content.tipo==='voice'?'audio':content.tipo;
  return {[type]:bytes,mimetype:mime,...(content.tipo==='voice'?{ptt:true}:{}),...(type==='document'?{fileName:content.anexo.nome}:{}),...(['image','video','document'].includes(type)&&content.texto?{caption:content.texto}:{})};
}

export async function createBaileysAdapter({account,key,inbox,rpc,emit,media,authorize,onFailure,draftProvider='codex',loadBaileys=()=>import('baileys'),loadLogger=()=>import('pino'),probe=probeGenerator}){
  if(!inbox)throw invalid('Fila local de recebimento não configurada. Inicie pelo CLI multiatendimento.');
  // Import tardio: testes sem rede e modo de configuração não carregam sockets.
  const baileys=await loadBaileys();
  const {default:makeWASocket,initAuthCreds,proto,downloadMediaMessage,DisconnectReason}=baileys;
  const {default:pino}=await loadLogger();
  const logger=pino({level:'silent'});
  let sock=null,closed=false,connected=false,connecting=false,historyDone=false,resetPromise=null,draining=null;
  const groupNames=new GroupNames({emit,fetchMetadata:jid=>sock.groupMetadata(jid)});
  const auth=await createAuthStore({accountId:account.id,key,rpc,initialCreds:initAuthCreds,onFailure,reviveSignal:(type,value)=>type==='app-state-sync-key'?proto.Message.AppStateSyncKeyData.fromObject(value):value});
  const generator=account.ia_modo==='desligada'?{available:false,reason:null}:await probe(draftProvider);
  const capabilities={send:true,text:true,image:true,video:true,audio:true,voice:true,document:true,sticker:true,reaction:true,reply:true,forward:true,edit:true,delete:true,read:true,history:true,draft:generator.available,poll:true,location:true,contact:true,groups:true};
  const state=(estado,extra={})=>rpc('estado',{estado,capacidades:capabilities,...extra});
  const failure=async error=>{if(closed)return;connected=false;await onFailure(error);};
  const reset=()=>resetPromise||(resetPromise=auth.reset());
  async function ingest(raw,historico=false){
    const normalized=normalizeMessage(raw);if(!normalized)return;
    const {media:attachment,...message}=normalized;
    if(message.jid.endsWith('@g.us'))message.nome=await groupNames.resolve(message.jid);
    if(attachment){
      if(attachment.bytes>100*1024*1024)message.texto='[Arquivo acima do limite; consulte o WhatsApp]';
      else{
        const bytes=await fetchIncomingMedia({historico,download:async()=>{
          const stream=await downloadMediaMessage(raw,'stream',{}, {logger,reuploadRequest:sock.updateMediaMessage});
          let size=0;const chunks=[];
          for await(const chunk of stream){size+=chunk.length;if(size>100*1024*1024)throw invalid('Arquivo acima do limite.');chunks.push(chunk);}
          return Buffer.concat(chunks);
        },defer:status=>inbox.defer(account.id,{messages:[raw],historico:true,status})});
        if(bytes){
          const nome=String(attachment.nome||'arquivo').replace(/[^a-zA-Z0-9._-]/g,'_').slice(-150)||'arquivo';
          const path=`${account.id}/${messageKey(account.id,raw.key)}/${nome}`;
          const saved=await media('POST',{path,nome,mime:attachment.mime,bytes});message.anexo=saved;
        }else message.texto=[message.texto,'[Anexo antigo indisponível no WhatsApp; registro preservado para revisão]'].filter(Boolean).join('\n');
      }
    }
    const revision=message.editada||message.apagada?':'+createHash('sha256').update(JSON.stringify([message.texto,message.apagada])).digest('hex'):'';
    await emit('evento',{evento_id:messageKey(account.id,raw.key)+revision,jid:message.jid,nome:message.nome,grupo:message.jid.endsWith('@g.us'),historico,mensagens:[message]});
  }
  async function drain(){
    if(draining)return draining;
    const operation=inbox.drain(account.id,async batch=>{
      for(const raw of batch.messages||[]){
        if(closed||!connected)throw invalid('Recebimento preservado para reconexão.');
        await ingest(proto.WebMessageInfo.fromObject(raw),batch.historico===true);
      }
    });
    draining=operation;
    try{return await operation;}finally{if(draining===operation)draining=null;}
  }
  async function receiveBatch(messages,historico=false){
    if(!messages?.length)return;
    await inbox.save(account.id,{messages,historico});
    if(!closed&&connected)await drain();
  }
  function watch(operation){return (...args)=>{void Promise.resolve().then(()=>operation(...args)).catch(failure);};}
  async function connect(){
    if(closed)throw invalid('Runtime encerrado.');if(sock||connecting)return;connecting=true;
    try{
      await state('conectando');
      // Persistir credenciais antes de abrir a sessão, inclusive no primeiro QR.
      if(!auth.version)await auth.saveCreds();auth.assertHealthy();
      sock=makeWASocket({auth:auth.state,logger,markOnlineOnConnect:false,syncFullHistory:false,getMessage:async()=>undefined});
      sock.ev.on('creds.update',watch(update=>auth.saveCreds(update)));
      sock.ev.on('connection.update',watch(async update=>{
        if(update.qr){const {default:QRCode}=await import('qrcode');await state('qr',{qr:await QRCode.toDataURL(update.qr)});}
        if(update.connection==='open'){
          connected=true;await state('conectada',{telefone:sock.user?.id?.split(':')[0]?.split('@')[0],qr:null,erro:generator.available?null:generator.reason});
          try{const groups=await sock.groupFetchAllParticipating();await groupNames.update(Object.values(groups));}catch{/* lista de grupos sera atualizada no proximo evento disponivel */}
          await drain();
        }
        if(update.connection==='close'){
          connected=false;const code=update.lastDisconnect?.error?.output?.statusCode;
          if(code===DisconnectReason.loggedOut)await reset();
          await state(code===DisconnectReason.loggedOut?'desconectada':'pausada',{qr:null,erro:code===DisconnectReason.loggedOut?'Sessão encerrada no WhatsApp. Reconecte por QR code.':'Conexão interrompida; o runtime tentará reconectar.'});
          await failure(new Error(`Conexão WhatsApp interrompida (código ${Number.isInteger(code)?code:'indisponível'}).`));
        }
      }));
      sock.ev.on('messages.upsert',watch(event=>receiveBatch(event.messages,event.type!=='notify')));
      sock.ev.on('groups.update',watch(groups=>groupNames.update(groups)));
      sock.ev.on('messaging-history.set',watch(async event=>{await receiveBatch(event.messages,true);historyDone=Boolean(event.isLatest);}));
      sock.ev.on('messages.update',watch(async updates=>{
        for(const {key:messageKey,update} of updates){
          if(update.message)await receiveBatch([{key:messageKey,message:update.message}]);
          const status=update.status;if(messageKey.fromMe&&messageKey.id&&[2,3,4,5].includes(status))await emit('recibo',{jid:messageKey.remoteJid,provedor_id:messageKey.id,estado:status>=4?'lida':status>=3?'entregue':'enviada'});
        }
      }));
    }finally{connecting=false;}
  }
  // QR salva me/account e exige reabrir o socket, sem marcar registered=true.
  // A mesma identidade usada pelo Baileys para login deve decidir a retomada.
  if(auth.state.creds.me?.id)await connect();
  else await state('desconectada',{erro:generator.available?null:generator.reason});
  return {
    async recover(){if(connected&&!closed)void drain().catch(failure);},
    async execute(command){
      auth.assertHealthy();if(closed)throw invalid('Runtime encerrado.');
      if(command.tipo==='pair'){await connect();return {};}
      if(command.tipo==='logout'){if(sock)await sock.logout();await reset();await state('desconectada',{qr:null});return {};}
      if(!connected||!sock)throw invalid('Número desconectado. Leia o QR code.');
      const content=command.conteudo||{},reference=command.referencia;
      if(command.tipo==='history'){
        if(!reference)throw invalid(historyDone?'Histórico disponível já sincronizado.':'Aguardando o histórico disponibilizado pelo WhatsApp.');
        await sock.fetchMessageHistory(50,referenceKey(reference,command.jid),Math.floor(Date.now()/1000));return {};
      }
      const loadMedia=anexo=>media('GET',{path:validatePrivatePath(anexo.path,account.id)});
      let message,options;
      if(command.tipo==='send'){
        message=await buildMessageContent(content,{accountId:account.id,loadMedia,reference});
        if(content.citada_id&&reference)options={quoted:{key:referenceKey(reference,command.jid),message:{conversation:reference.texto||'[mídia]'}}};
      }else if(command.tipo==='reaction')message={react:{text:content.emoji||'',key:referenceKey(reference,command.jid)}};
      else if(command.tipo==='edit')message={text:content.texto,edit:referenceKey(reference,command.jid)};
      else if(command.tipo==='delete')message={delete:referenceKey(reference,command.jid)};
      else if(command.tipo==='read'){await authorize(command);await sock.readMessages([referenceKey(reference,command.jid)]);return {};}
      else throw invalid('Comando indisponível.');
      // Download/transcodificação pode levar tempo. Revalide depois e imediatamente antes da rede.
      await authorize(command);auth.assertHealthy();
      const sent=await sock.sendMessage(command.jid,message,options);
      if(!sent?.key?.id)throw new Error('WhatsApp não confirmou o identificador.');
      return {provedor_id:sent.key.id};
    },
    async close(){closed=true;connected=false;if(sock){sock.ev.removeAllListeners('connection.update');sock.end(new Error('Runtime parado.'));sock=null;}},
  };
}
