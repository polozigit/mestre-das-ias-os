import test from 'node:test';
import assert from 'node:assert/strict';
import {EventEmitter} from 'node:events';
import {createBaileysAdapter} from '../src/multicanal/baileys-adapter.mjs';
import {encryptState} from '../src/multicanal/auth-store.mjs';

test('sessao aceita pelo QR retoma pelo JID salvo mesmo com registered false',async()=>{
 const key=Buffer.alloc(32,5),id='conta-teste';let sockets=0,probes=0;
 const saved=encryptState({creds:{registered:false,me:{id:'5511999990001:1@s.whatsapp.net'},account:{details:Buffer.from('teste')}},keys:{}},key,id);
 const adapter=await createBaileysAdapter({account:{id,ia_modo:'desligada'},key,inbox:{drain:async()=>{}},rpc:async op=>op==='auth_ler'?{versao:2,dados:saved}:{},emit:async()=>{},media:async()=>{},authorize:async()=>{},onFailure:async()=>{},probe:async()=>{probes++;return {available:false,reason:null};},loadLogger:async()=>({default:()=>({})}),loadBaileys:async()=>({default:options=>{sockets++;assert.equal(options.auth.creds.me.id,'5511999990001:1@s.whatsapp.net');return {ev:new EventEmitter(),end(){}};},initAuthCreds:()=>({registered:false}),proto:{},DisconnectReason:{loggedOut:401,restartRequired:515}})});
 try{assert.equal(sockets,1,'a sessao pareada precisa reabrir sem outro comando pair');assert.equal(probes,0,'IA desligada nao inicia CLI nem mostra erro de gerador');}finally{await adapter.close();}
});

test('instalacao nova aguarda pair explicito e persiste credenciais antes do socket',async()=>{
 const key=Buffer.alloc(32,6),events=[];let saves=0;
 const adapter=await createBaileysAdapter({account:{id:'nova',ia_modo:'desligada'},key,inbox:{drain:async()=>{}},rpc:async(op,data)=>{events.push(op);if(op==='auth_ler')return {versao:0,dados:null};if(op==='auth_salvar')return {versao:++saves};return {};},emit:async()=>{},media:async()=>{},authorize:async()=>{},onFailure:async()=>{},loadLogger:async()=>({default:()=>({})}),loadBaileys:async()=>({default:()=>{events.push('socket');return {ev:new EventEmitter(),end(){}};},initAuthCreds:()=>({registered:false}),proto:{},DisconnectReason:{loggedOut:401,restartRequired:515}})});
 try{assert.equal(events.includes('socket'),false);await adapter.execute({tipo:'pair'});assert.ok(events.indexOf('auth_salvar')<events.indexOf('socket'));await adapter.execute({tipo:'pair'});assert.equal(events.filter(x=>x==='socket').length,1);}finally{await adapter.close();}
});
