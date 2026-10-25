import test from 'node:test';
import assert from 'node:assert/strict';
import {prepareMetaMedia} from '../src/multicanal/meta-media.mjs';
test('voz oficial converte localmente e libera fila sem enviar ao WhatsApp',async()=>{
 const calls=[];const client={
  call:async(op,data)=>{calls.push({op,data});return op==='midias_pendentes'?{comandos:[{id:'cmd',conta_id:'conta',conteudo:{anexo:{path:'conta/obj/voz.webm',mime:'audio/webm'}}}]}:{ok:true};},
  media:async(method,scope,data)=>{calls.push({method,scope});return method==='GET'?Buffer.from('original'):{path:data.path,mime:data.mime,bytes:data.bytes.length,nome:data.nome};},
 };
 await prepareMetaMedia(client,'runtime-test',{convert:async(bytes,mime)=>{assert.equal(bytes.toString(),'original');assert.equal(mime,'audio/webm');return {bytes:Buffer.from('opus'),mime:'audio/ogg'};}});
 assert.equal(calls.at(-1).op,'midia_preparada');assert.equal(calls.at(-1).data.anexo.mime,'audio/ogg');
 assert.deepEqual(calls.filter(c=>c.op).map(c=>c.op),['midias_pendentes','midia_preparada']);
});
test('erro de conversao fica antes do envio e nao libera comando',async()=>{
 const calls=[];const client={call:async(op)=>{calls.push(op);return op==='midias_pendentes'?{comandos:[{id:'cmd',conta_id:'conta',conteudo:{anexo:{path:'conta/obj/voz.webm',mime:'audio/webm'}}}]}:{};},media:async()=>Buffer.from('original')};
 await prepareMetaMedia(client,'runtime-test',{convert:async()=>{throw new Error('ffmpeg indisponível');}});
 assert.deepEqual(calls,['midias_pendentes','midia_falhou']);
});
