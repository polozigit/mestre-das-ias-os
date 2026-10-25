import test from 'node:test';
import assert from 'node:assert/strict';
import {estadoQR} from './qr-state.ts';
const conta={estado:'desconectada',qr:null,erro:null};
const pedido={inicio:1000,erroInicial:null};
test('fila aceita continua carregando enquanto o conector ainda nao publicou o QR',()=>{
 assert.equal(estadoQR(conta,pedido,2000),'preparando');
 assert.equal(estadoQR({...conta,estado:'conectando'},pedido,5000),'preparando');
 assert.equal(estadoQR({...conta,estado:'qr',qr:'data:image/png;base64,teste'},pedido,6000),'qr');
 assert.equal(estadoQR({...conta,estado:'conectada'},pedido,7000),'conectada');
});
test('espera longa libera nova tentativa e nao fica carregando para sempre',()=>{
 assert.equal(estadoQR(conta,pedido,91000),'demorado');
 assert.equal(estadoQR(conta,{inicio:91000,erroInicial:null},91000),'preparando');
});
test('falha nova encerra espera, mas erro anterior nao impede tentar novamente',()=>{
 assert.equal(estadoQR({...conta,erro:'Sem rede'},pedido,5000),'falha');
 assert.equal(estadoQR({...conta,erro:'Sem rede'},{inicio:1000,erroInicial:'Sem rede'},5000),'preparando');
});
