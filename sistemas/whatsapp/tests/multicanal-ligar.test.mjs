import test from 'node:test';
import assert from 'node:assert/strict';
import {AVISO_VARIAVEIS,lerAmbiente,ligarComputador} from '../src/multicanal/ligar.mjs';

const TOKEN='a'.repeat(64);
function fetchFalso(status,corpo){
  const chamadas=[];
  const fetchImpl=async(url,init)=>{chamadas.push({url,init});return {ok:status>=200&&status<300,status,json:async()=>corpo};};
  return {fetchImpl,chamadas};
}

test('lerAmbiente exige URL, chave de serviço e chave pública da Casa', ()=>{
  assert.throws(()=>lerAmbiente({NEXT_PUBLIC_SUPABASE_URL:'https://x.supabase.co',SUPABASE_SERVICE_ROLE_KEY:'s'}),{message:AVISO_VARIAVEIS});
  const a=lerAmbiente({NEXT_PUBLIC_SUPABASE_URL:'https://x.supabase.co',SUPABASE_SERVICE_ROLE_KEY:'s',NEXT_PUBLIC_SUPABASE_ANON_KEY:'p',MENSAGERIA_COMPUTADOR:'  Caixa  '});
  assert.deepEqual(a,{url:'https://x.supabase.co',servico:'s',publica:'p',nome:'Caixa'});
});

test('lerAmbiente usa o nome do computador quando não vem nome', ()=>{
  const a=lerAmbiente({NEXT_PUBLIC_SUPABASE_URL:'https://x.supabase.co',SUPABASE_SERVICE_ROLE_KEY:'s',NEXT_PUBLIC_SUPABASE_ANON_KEY:'p'});
  assert.ok(a.nome.length>0&&a.nome.length<=120);
});

test('ligarComputador chama a RPC com a chave de serviço e devolve o token', async()=>{
  const {fetchImpl,chamadas}=fetchFalso(200,{id:'i1',token:TOKEN,numeros_ligados:2});
  const r=await ligarComputador({url:'https://x.supabase.co/',servico:'eyJ.legado.jwt',nome:'Caixa',fetchImpl});
  assert.deepEqual(r,{id:'i1',token:TOKEN,numerosLigados:2});
  assert.equal(chamadas[0].url,'https://x.supabase.co/rest/v1/rpc/mensageria_ligar_computador');
  assert.equal(chamadas[0].init.method,'POST');
  assert.equal(chamadas[0].init.headers.apikey,'eyJ.legado.jwt');
  assert.equal(chamadas[0].init.headers.Authorization,'Bearer eyJ.legado.jwt');
  assert.deepEqual(JSON.parse(chamadas[0].init.body),{p_nome:'Caixa'});
});

test('chave nova sb_secret_ vai só no apikey, sem Authorization', async()=>{
  const {fetchImpl,chamadas}=fetchFalso(200,{id:'i1',token:TOKEN,numeros_ligados:0});
  await ligarComputador({url:'https://x.supabase.co',servico:'sb_secret_.falsa',nome:'Caixa',fetchImpl});
  assert.equal(chamadas[0].init.headers.Authorization,undefined);
});

test('erro do Supabase não vaza a chave e explica a migration faltando', async()=>{
  const {fetchImpl}=fetchFalso(404,{message:'not found'});
  await assert.rejects(ligarComputador({url:'https://x.supabase.co',servico:'segredo-123',nome:'Caixa',fetchImpl}),e=>{
    assert.match(e.message,/HTTP 404/);assert.match(e.message,/20261117120000/);assert.doesNotMatch(e.message,/segredo-123/);return true;
  });
});

test('resposta sem token de 64 caracteres é recusada', async()=>{
  const {fetchImpl}=fetchFalso(200,{id:'i1',token:'curto'});
  await assert.rejects(ligarComputador({url:'https://x.supabase.co',servico:'s',nome:'Caixa',fetchImpl}),/Resposta inesperada/);
});

test('endereço sem https é recusado', async()=>{
  const {fetchImpl}=fetchFalso(200,{token:TOKEN});
  await assert.rejects(ligarComputador({url:'http://x.supabase.co',servico:'s',nome:'Caixa',fetchImpl}),/https/);
});
