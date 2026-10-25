import test from 'node:test';
import assert from 'node:assert/strict';
import { verifyMetaSignature, normalizeWebhook, buildMetaPayload, validateMedia, privatePath, readLimited, dispatchMeta } from './core.mjs';

test('assinatura cobre os bytes exatos e recusa corpo alterado', async () => {
  const body = new TextEncoder().encode('{"entry":[]}');
  const key = await crypto.subtle.importKey('raw', new TextEncoder().encode('teste'), {name:'HMAC',hash:'SHA-256'}, false, ['sign']);
  const bytes = new Uint8Array(await crypto.subtle.sign('HMAC',key,body));
  const signature = 'sha256='+Array.from(bytes,b=>b.toString(16).padStart(2,'0')).join('');
  assert.equal(await verifyMetaSignature(body,signature,'teste'),true);
  assert.equal(await verifyMetaSignature(new TextEncoder().encode('{}'),signature,'teste'),false);
  assert.equal(await verifyMetaSignature(body,'','teste'),false);
});
test('webhook ignora outros numeros e separa recibos de mensagens', () => {
  const body={entry:[{changes:[{value:{metadata:{phone_number_id:'123'},contacts:[{wa_id:'5511999990001',profile:{name:'Teste'}}],messages:[{id:'wamid.a',from:'5511999990001',timestamp:'1700000000',type:'text',text:{body:'Olá'}}],statuses:[{id:'wamid.b',recipient_id:'5511999990001',status:'read'}]}},{value:{metadata:{phone_number_id:'outro'},messages:[{id:'ignorar'}]}}]}]};
  const result=normalizeWebhook(body,'123');
  assert.equal(result.mensagens.length,1); assert.equal(result.recibos.length,1);
  assert.equal(result.mensagens[0].texto,'Olá'); assert.equal(result.mensagens[0].nome,'Teste');
  assert.equal(result.recibos[0].estado,'lida');
});
test('Meta exige template fora da janela e nao inventa grupos', () => {
  const command={tipo:'send',jid:'5511999990001@s.whatsapp.net',ultima_recebida_em:'2020-01-01',conteudo:{tipo:'text',texto:'Oi'}};
  assert.throws(()=>buildMetaPayload(command),/template/);
  assert.throws(()=>buildMetaPayload({...command,jid:'123@g.us'}),/grupo/);
  assert.equal(buildMetaPayload({...command,conteudo:{template:{name:'teste',language:{code:'pt_BR'}}}}).type,'template');
});
test('mensagem com mídia usa ID Meta e voz apenas em OGG', () => {
  const command={tipo:'send',jid:'5511999990001@s.whatsapp.net',ultima_recebida_em:new Date().toISOString(),conteudo:{tipo:'voice',anexo:{mime:'audio/ogg'}}};
  assert.equal(buildMetaPayload(command,'media-id').audio.voice,true);
  assert.throws(()=>buildMetaPayload({...command,conteudo:{...command.conteudo,anexo:{mime:'audio/webm'}}},'id'),/Opus/);
});
test('caminho privado nao atravessa contas nem diretorios', () => {
  const id='11111111-1111-4111-8111-111111111111';
  assert.equal(privatePath(id,`${id}/objeto/arquivo.pdf`),`${id}/objeto/arquivo.pdf`);
  assert.throws(()=>privatePath(id,'outra/arquivo.pdf'));
  assert.throws(()=>privatePath(id,`${id}/../arquivo.pdf`));
});
test('limites de mídia e stream sao impostos pelos bytes recebidos', async () => {
  assert.throws(()=>validateMedia('image/png',6*1024*1024),/limite/);
  assert.throws(()=>validateMedia('text/html',10),/permitido/);
  await assert.rejects(readLimited(new Response('12345'),4),/limite/);
  assert.equal((await readLimited(new Response('1234'),4)).length,4);
});
test('limites Meta nao interrompem arquivos Baileys e formatos ativos viram download',()=>{
 assert.equal(validateMedia('video/mp4',20*1024*1024,'baileys'),'video/mp4');
 assert.equal(validateMedia('image/webp',1024*1024,'baileys'),'image/webp');
 assert.equal(validateMedia('text/html',100,'baileys'),'application/octet-stream');
 assert.equal(validateMedia('application/x-zip-compressed',100,'baileys'),'application/zip');
 assert.throws(()=>validateMedia('video/mp4',20*1024*1024,'meta'),/limite/);
 assert.throws(()=>validateMedia('text/html',100,'meta'),/permitido/);
 assert.throws(()=>validateMedia('application/octet-stream',101*1024*1024,'baileys'),/limite/);
});
test('timeout depois do despacho Meta vira incerto sem segunda chamada', async () => {
  let calls=0;
  const result=await dispatchMeta({id:'c',tipo:'send',jid:'5511999990001@s.whatsapp.net',ultima_recebida_em:new Date().toISOString(),conteudo:{tipo:'text',texto:'Oi'}},{id:'a',phone_id:'123',graph_version:'v24.0',access_token:'local-test'}, {fetchImpl:async()=>{calls++;throw new Error('timeout');}});
  assert.equal(result.estado,'incerto'); assert.equal(calls,1);
});
test('revogacao durante upload impede o envio final Meta', async () => {
  const id='11111111-1111-4111-8111-111111111111';const calls=[];
  const command={id:'c',tipo:'send',jid:'5511999990001@s.whatsapp.net',ultima_recebida_em:new Date().toISOString(),conteudo:{tipo:'image',anexo:{path:`${id}/objeto/foto.png`,nome:'foto.png',mime:'image/png',bytes:4}}};
  const result=await dispatchMeta(command,{id,phone_id:'123',graph_version:'v24.0',access_token:'local-test'},{loadMedia:async()=>new Uint8Array(4),fetchImpl:async url=>{calls.push(url);return Response.json({id:'media'});},authorize:async()=>{throw new Error('Permissao revogada.');}});
  assert.equal(result.estado,'falhou');assert.equal(calls.length,1);assert.ok(calls[0].endsWith('/media'));
});
