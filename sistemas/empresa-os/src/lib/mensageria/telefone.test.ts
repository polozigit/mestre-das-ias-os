import test from 'node:test';
import assert from 'node:assert/strict';
import {readdirSync,readFileSync} from 'node:fs';
import {join} from 'node:path';
import {mascararTelefone,telefoneCompleto} from './telefone.ts';

test('mascara aceita so digitos e para no tamanho do celular',()=>{
  assert.equal(mascararTelefone('abc'),'');
  assert.equal(mascararTelefone('4'),'(4');
  assert.equal(mascararTelefone('479'),'(47) 9');
  assert.equal(mascararTelefone('4799191'),'(47) 9919-1');
  assert.equal(mascararTelefone('11912345678'),'(11) 91234-5678');
  assert.equal(mascararTelefone('119123456789999'),'(11) 91234-5678');
  assert.equal(mascararTelefone('11a91b23-45678'),'(11) 91234-5678');
});

test('telefone fixo usa 8 digitos depois do DDD',()=>{
  assert.equal(mascararTelefone('4733334444'),'(47) 3333-4444');
  assert.equal(telefoneCompleto('(47) 3333-4444'),'554733334444');
});

test('colar com +55 ou 55 tira o DDI e mantem o numero',()=>{
  assert.equal(mascararTelefone('+55 11 91234-5678'),'(11) 91234-5678');
  assert.equal(mascararTelefone('5511912345678'),'(11) 91234-5678');
  assert.equal(telefoneCompleto('+55 (11) 91234-5678'),'5511912345678');
});

test('DDD 55 digitado nao perde digito quando passa do limite',()=>{
  assert.equal(mascararTelefone('559912345678'),'(55) 99123-4567');
  assert.equal(telefoneCompleto('55991234567'),'5555991234567');
});

test('quantidade ou formato errado nao vira numero',()=>{
  for(const raw of ['','(47) 9919-1','(11) 81234-5678','(07) 91234-5678','(47) 1333-4444'])
    assert.equal(telefoneCompleto(raw),null,raw);
});

test('numero de fora do Brasil comeca com + e aceita de 8 a 15 digitos',()=>{
  assert.equal(mascararTelefone('+1 (415) 555-0100'),'+14155550100');
  assert.equal(telefoneCompleto('+14155550100'),'14155550100');
  assert.equal(telefoneCompleto('+1234'),null);
  assert.equal(mascararTelefone('+1234567890123456789'),'+123456789012345');
});

// O exemplo de telefone que o sistema mostra ao aluno (placeholder e aviso) é fictício. Em 19/11/2026 o número de
// teste do curso estava em três telas; nenhum arquivo do sistema pode voltar a trazê-lo.
test('o numero de exemplo e ficticio: nenhum arquivo do sistema traz o numero de teste do curso',()=>{
  const real=new RegExp('9919'+'[ -]?1[ -]?18'+'00');
  const arquivos=(pasta:string):string[]=>readdirSync(pasta,{withFileTypes:true}).flatMap(e=>e.isDirectory()?arquivos(join(pasta,e.name)):/\.(ts|tsx|css|json|md)$/.test(e.name)?[join(pasta,e.name)]:[]);
  const raiz=new URL('../../',import.meta.url).pathname;
  const comNumero=arquivos(raiz).filter(a=>real.test(readFileSync(a,'utf8')));
  assert.deepEqual(comNumero,[]);
  assert.match(mascararTelefone('11912345678'),/^\(11\) 91234-5678$/);
});
