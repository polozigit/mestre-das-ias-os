import test from 'node:test';
import assert from 'node:assert/strict';
import {createSharedClient} from '../src/multicanal/shared-client.mjs';
test('MCP novo propoe rascunho, sem ferramenta de envio nem bypass de aprovacao',async()=>{
 const calls=[];
 const client=createSharedClient({call:async(op,data)=>{calls.push({op,data});return op==='contexto'?{conversa_versao:7,politica_versao:2}:{id:'draft'};}});
 const result=await client.propose({conta_id:'conta',conversa_id:'conversa',texto:'Sugestão',sensivel:false,regra_id:'auto'});
 assert.equal(result.id,'draft');assert.deepEqual(calls.map(c=>c.op),['contexto','propor_rascunho']);
 assert.deepEqual(calls[1].data,{conta_id:'conta',conversa_id:'conversa',texto:'Sugestão',conversa_versao:7,politica_versao:2});
 assert.equal('send' in client,false);
});
test('falha de contexto ou persistencia nao inicia um segundo envio',async()=>{
 let calls=0;const client=createSharedClient({call:async()=>{calls++;throw new Error('offline');}});
 await assert.rejects(client.propose({conta_id:'conta',conversa_id:'conversa',texto:'Sugestão'}),/offline/);assert.equal(calls,1);
});
