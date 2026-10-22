import test from 'node:test';import assert from 'node:assert/strict';
import {fetchIncomingMedia} from '../src/multicanal/incoming-media.mjs';
test('anexo antigo expirado preserva original e permite continuar historico',async()=>{
 let deferred;const value=await fetchIncomingMedia({historico:true,download:async()=>{throw {output:{statusCode:410}};},defer:async status=>{deferred=status;}});
 assert.equal(value,null);assert.equal(deferred,410);
});
test('erro temporario do provedor permite retomar sem arquivar como expirado',async()=>{
 await assert.rejects(fetchIncomingMedia({historico:true,download:async()=>{throw {output:{statusCode:503}};},defer:async()=>assert.fail('nao arquivar temporario')}),error=>error.historyMediaRetry===true);
});
test('mensagem nova e falha do banco continuam sujeitas a recuperacao normal',async()=>{
 await assert.rejects(fetchIncomingMedia({historico:false,download:async()=>{throw new Error('rede');},defer:async()=>assert.fail('nao descartar arquivo novo')}),/rede/);
 await assert.rejects(fetchIncomingMedia({historico:true,download:async()=>{throw Object.assign(new Error('banco'),{status:503});},defer:async()=>assert.fail('nao ignorar persistencia')}),error=>!error.historyMediaRetry);
});
