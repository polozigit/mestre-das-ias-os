import test from 'node:test';
import assert from 'node:assert/strict';
import { createHandler } from './handler.mjs';
const base='https://local.test/functions/v1/mensageria';
test('arquivo Baileys usa o canal autorizado e HTML fica como download generico',async()=>{
 const id='11111111-1111-4111-8111-111111111111';let stored;
 const handle=createHandler({serviceKey:'service',rpc:async(_name,args)=>{if(args.p_operacao==='contas')return {contas:[{id,provedor:'baileys'}]};if(args.p_operacao==='media_upload')return args.p_dados;return {ok:true};},storage:{upload:async(_path,bytes,mime)=>{stored={bytes:bytes.length,mime};}}});
 const response=await handle(new Request(base+'/media?conta_id='+id+'&path='+id+'/obj/documento.html&runtime_id=x&epoca=1',{method:'POST',headers:{'x-device-token':'valid','Content-Type':'text/html'},body:'<html>teste</html>'}));
 assert.equal(response.status,200);assert.equal(stored.mime,'application/octet-stream');assert.equal((await response.json()).mime,'application/octet-stream');
});
test('webhook sem assinatura nao persiste nem envia nada',async()=>{
  let calls=0;
  const handle=createHandler({rpc:async()=>{calls++;return {contas:[]};},storage:{},serviceKey:'service'});
  const res=await handle(new Request(base,{method:'POST',body:'{}'}));
  assert.equal(res.status,401);assert.equal(calls,0);
});
test('verificacao Meta aceita somente verify token configurado',async()=>{
  const handle=createHandler({rpc:async()=>({contas:[{verify_token:'verify'}]}),storage:{},serviceKey:'service'});
  assert.equal((await handle(new Request(base+'?hub.mode=subscribe&hub.verify_token=bad&hub.challenge=abc'))).status,403);
  const good=await handle(new Request(base+'?hub.mode=subscribe&hub.verify_token=verify&hub.challenge=abc'));
  assert.equal(await good.text(),'abc');
});
test('dispatch recusa solicitacao publica antes de consultar segredos',async()=>{
  let calls=0;const handle=createHandler({rpc:async()=>{calls++;return {};},storage:{},serviceKey:'service'});
  assert.equal((await handle(new Request(base+'/dispatch',{method:'POST',body:'{}'}))).status,401);assert.equal(calls,0);
});
test('media recusa token de instalacao invalido antes de escrever no Storage',async()=>{
  let uploads=0;const handle=createHandler({rpc:async()=>{throw new Error('unauthorized');},storage:{upload:async()=>{uploads++;}},serviceKey:'service'});
  const res=await handle(new Request(base+'/media?conta_id=11111111-1111-4111-8111-111111111111&path=11111111-1111-4111-8111-111111111111/obj/a.txt&runtime_id=x&epoca=1',{method:'POST',headers:{'x-device-token':'wrong','Content-Type':'text/plain'},body:'abc'}));
  assert.equal(res.status,403);assert.equal(uploads,0);
});
test('endpoint desconhecido nao vira webhook nem despacha fila',async()=>{
  const handle=createHandler({rpc:async()=>{throw new Error('nao deve chamar');},storage:{},serviceKey:'service'});
  assert.equal((await handle(new Request(base+'/outro'))).status,404);
});

test('dispatcher aceita chave de servico rotacionada somente apos verificacao no banco',async()=>{
 const calls=[];
 const handle=createHandler({serviceKey:'legacy-key',storage:{},rpc:async(_name,args,credential)=>{calls.push({op:args.p_operacao,credential});if(args.p_operacao==='autorizar_dispatch'){if(credential!=='rotated-service-fixture')throw new Error('negado');return {ok:true};}return {contas:[]};}});
 const response=await handle(new Request(base+'/dispatch',{method:'POST',headers:{apikey:'rotated-service-fixture'},body:'{}'}));
 assert.equal(response.status,200);assert.equal(calls[0].op,'autorizar_dispatch');assert.equal(calls[0].credential,'rotated-service-fixture');
});

test('relay do dispositivo nao executa RPC escolhida pelo cliente e exige token',async()=>{
 const calls=[];const handle=createHandler({serviceKey:'service',storage:{},rpc:async(name,args)=>{calls.push({name,args});if(args.p_token!=='token-inst')throw new Error('negado');return {contas:[]};}});
 const response=await handle(new Request(base+'/device',{method:'POST',body:JSON.stringify({p_token:'token-inst',p_operacao:'contas',p_dados:{},name:'admin_desconhecido'})}));
 assert.equal(response.status,200);assert.equal(calls[0].name,'mensageria_dispositivo');
 const denied=await handle(new Request(base+'/device',{method:'POST',body:JSON.stringify({p_token:'errado',p_operacao:'contas',p_dados:{}})}));
 assert.equal(denied.status,403);
});

test('reentrega assinada ja persistida nao baixa nem grava a midia outra vez',async()=>{
 const payload={object:'whatsapp_business_account',entry:[{changes:[{value:{metadata:{phone_number_id:'123'},messages:[{id:'wamid.existente',from:'5511999990001',type:'document',document:{id:'midia',mime_type:'application/pdf'}}]}}]}]};
 const body=JSON.stringify(payload),secret='teste';
 const key=await crypto.subtle.importKey('raw',new TextEncoder().encode(secret),{name:'HMAC',hash:'SHA-256'},false,['sign']);
 const signature='sha256='+Array.from(new Uint8Array(await crypto.subtle.sign('HMAC',key,new TextEncoder().encode(body))),b=>b.toString(16).padStart(2,'0')).join('');
 let downloads=0;
 const handle=createHandler({serviceKey:'service',storage:{upload:async()=>assert.fail('nao deve gravar duplicata')},fetchImpl:async()=>{downloads++;throw new Error('nao deve baixar duplicata');},rpc:async(_name,args)=>{
  if(args.p_operacao==='meta_contas')return {contas:[{id:'11111111-1111-4111-8111-111111111111',phone_id:'123',app_secret:secret}]};
  if(args.p_operacao==='evento_existente')return {existe:true};throw new Error('operacao inesperada');
 }});
 const response=await handle(new Request(base,{method:'POST',headers:{'x-hub-signature-256':signature},body}));
 assert.equal(response.status,200);assert.equal(downloads,0);
});
