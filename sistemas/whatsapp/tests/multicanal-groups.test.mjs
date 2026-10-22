import test from 'node:test';
import assert from 'node:assert/strict';
import {GroupNames} from '../src/multicanal/group-names.mjs';
import {normalizeMessage} from '../src/multicanal/messages.mjs';
test('nome do grupo vem dos metadados e nunca do participante que enviou',async()=>{
 const events=[];const names=new GroupNames({emit:async(op,data)=>events.push({op,data}),fetchMetadata:async id=>({id,subject:'Equipe de atendimento'})});
 const m=normalizeMessage({key:{remoteJid:'1203630000000@g.us',id:'m',participant:'123@lid'},pushName:'Participante',message:{conversation:'Olá'}});
 assert.equal(m.nome,null);assert.equal(await names.resolve(m.jid),'Equipe de atendimento');assert.equal(events[0].op,'grupos_atualizar');
 assert.equal(await names.resolve(m.jid),'Equipe de atendimento');assert.equal(events.length,1);
 await names.update([{id:m.jid,subject:'Nome atualizado'}]);assert.equal(await names.resolve(m.jid),'Nome atualizado');
});
test('falha no nome nao interrompe mensagem e lista publica nao vira grupo',async()=>{
 const names=new GroupNames({emit:async()=>assert.fail('nao deve persistir'),fetchMetadata:async()=>{throw new Error('rede');}});
 assert.equal(await names.resolve('1203630000000@g.us'),null);await names.update([{id:'status@broadcast',subject:'Status'}]);assert.equal(names.names.size,0);
});
