import test from 'node:test';
import assert from 'node:assert/strict';
import {mkdtemp,readFile,readdir,rm} from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';
import {RawInbox} from '../src/multicanal/raw-inbox.mjs';
import {DurableSpool} from '../src/multicanal/spool.mjs';
import {encryptState} from '../src/multicanal/auth-store.mjs';
test('recebimento duravel e cifrado sobrevive a falha de download sem perder lote',async()=>{
 const root=await mkdtemp(path.join(os.tmpdir(),'wa-inbox-test-')),key=Buffer.alloc(32,5);
 try{
  const inbox=new RawInbox(root,key);const batch={messages:[{key:{id:'a'},message:{conversation:'CONTEUDO_PRIVADO'}},{key:{id:'b'},mediaKey:Buffer.from('chave-midia')}],historico:false};
  await inbox.save('conta',batch);
  const files=await readdir(path.join(root,'live','conta'));
  assert.equal(files.length,1);assert.equal((await readFile(path.join(root,'live','conta',files[0]),'utf8')).includes('CONTEUDO_PRIVADO'),false);
  await assert.rejects(inbox.drain('conta',async()=>{throw new Error('rede caiu');}),/rede/);
  const restored=[];await new RawInbox(root,key).drain('conta',async value=>restored.push(value));
  assert.equal(restored[0].messages.length,2);assert.equal(restored[0].messages[0].message.conversation,'CONTEUDO_PRIVADO');
  assert.deepEqual(restored[0].messages[1].mediaKey,Buffer.from('chave-midia'));
  assert.deepEqual(await readdir(path.join(root,'live','conta')),[]);
 }finally{await rm(root,{recursive:true,force:true});}
});
test('mensagem nova tem prioridade e historico progride em lotes pequenos',async()=>{
 const root=await mkdtemp(path.join(os.tmpdir(),'wa-priority-')),key=Buffer.alloc(32,7);
 try{
  const inbox=new RawInbox(root,key),seen=[];
  await inbox.save('conta',{historico:true,messages:Array.from({length:60},(_,id)=>({id}))});
  await inbox.save('conta',{historico:false,messages:[{id:'nova'}]});
  const process=async batch=>seen.push(...batch.messages.map(m=>m.id));
  await inbox.drain('conta',process);assert.equal(seen[0],'nova');assert.equal(seen.length,26);
  await inbox.drain('conta',process);await inbox.drain('conta',process);assert.equal(seen.length,61);assert.equal(new Set(seen).size,61);
 }finally{await rm(root,{recursive:true,force:true});}
});
test('lote legado so sai do disco depois da migracao duravel para a fila nova',async()=>{
 const root=await mkdtemp(path.join(os.tmpdir(),'wa-legacy-')),key=Buffer.alloc(32,8);
 try{
  await new DurableSpool(root).push('conta',{operacao:'recebimento',dados:encryptState({historico:true,messages:[{id:'preservada'}]},key,'raw:conta')});
  const broken=new RawInbox(root,key);broken.save=async()=>{throw new Error('disco indisponivel');};
  await assert.rejects(broken.drain('conta',async()=>{}),/disco/);assert.equal((await readdir(path.join(root,'conta'))).length,1);
  const seen=[];await new RawInbox(root,key).drain('conta',async batch=>seen.push(...batch.messages));assert.deepEqual(seen,[{id:'preservada'}]);assert.deepEqual(await readdir(path.join(root,'conta')),[]);
 }finally{await rm(root,{recursive:true,force:true});}
});
