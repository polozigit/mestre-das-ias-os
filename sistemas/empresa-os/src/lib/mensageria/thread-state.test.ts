import test from 'node:test';
import assert from 'node:assert/strict';
import {aplicarThread,aplicarMudanca,type LeitorState} from './thread-state.ts';
import type {Thread,Mensagem} from './tipos.ts';
const pagina=(id:string):Thread=>({conversa:{id,conta_id:'conta',jid:'5511999990001@s.whatsapp.net',nome:'Teste',grupo:false,estado:'aberta',responsavel_id:null,versao:1,ultima_em:null,ultima_mensagem:null,nao_lidas:0},mensagens:[],rascunhos:[],tem_mais:false});
test('resposta atrasada da conversa anterior nao substitui a conversa atual',()=>{
 const state:LeitorState={selected:'nova',thread:pagina('nova'),error:'',loading:false};
 assert.equal(aplicarThread(state,'antiga',pagina('antiga')),state);
});
test('resposta da conversa selecionada encerra carregamento e limpa erro',()=>{
 const state:LeitorState={selected:'nova',thread:null,error:'rede',loading:true};
 const result=aplicarThread(state,'nova',pagina('nova'));
 assert.equal(result.thread?.conversa.id,'nova');assert.equal(result.loading,false);assert.equal(result.error,'');
});

const message=(id:string,ordem:number):Mensagem=>({id,ordem,conversa_id:'nova',conta_id:'conta',provedor_id:id,direcao:'recebida',tipo:'text',texto:id,estado:'recebida',participante:null,anexo:null,citada_id:null,criada_em:'2026-10-21T12:00:00Z',autor_id:null,editada:false,apagada:false});
test('mensagens no mesmo segundo usam ordem de recebimento, nao UUID',()=>{
 const state:LeitorState={selected:'nova',thread:null,error:'',loading:true};
 const page=pagina('nova');page.mensagens=[message('a',2),message('z',1)];
 assert.deepEqual(aplicarThread(state,'nova',page).thread?.mensagens.map(m=>m.id),['z','a']);
});
test('atualizacao realtime remove eco duplicado mesmo fora da primeira pagina',()=>{
 const page=pagina('nova');page.mensagens=[message('eco',3),message('original',2)];
 const state:LeitorState={selected:'nova',thread:page,error:'',loading:false};
 const result=aplicarMudanca(state,{tipo:'UPDATE',mensagem:{...message('eco',3),duplicada_de:'original'}});
 assert.deepEqual(result.thread?.mensagens.map(m=>m.id),['original']);
});
test('ao ler historico, nova mensagem aguarda retorno ao fim da conversa',()=>{
 const state:LeitorState={selected:'nova',thread:pagina('nova'),following:false,error:'',loading:false};
 assert.equal(aplicarMudanca(state,{tipo:'INSERT',mensagem:message('nova',4)}),state);
});
