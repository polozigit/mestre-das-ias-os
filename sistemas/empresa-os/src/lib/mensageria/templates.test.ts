import test from 'node:test';
import assert from 'node:assert/strict';
import {camposTemplate,montarTemplate,templateDeTexto} from './templates.ts';
test('template usa variaveis numericas em ordem e nao aceita valor vazio',()=>{
 const template={name:'lembrete',language:'pt_BR',components:[{type:'BODY',text:'Olá {{2}}, pedido {{1}}'}]};
 assert.deepEqual(camposTemplate(template).map(x=>x.id),['BODY:1','BODY:2']);
 assert.throws(()=>montarTemplate(template,{}),/Preencha/);
 assert.deepEqual(montarTemplate(template,{'BODY:1':'123','BODY:2':'Ana'}).components?.[0].parameters,[{type:'text',text:'123'},{type:'text',text:'Ana'}]);
});
test('variaveis nomeadas incluem parameter_name e mantem o texto como dados',()=>{
 const template={name:'aviso',language:'pt_BR',components:[{type:'BODY',text:'Olá {{nome}}'}]};
 assert.deepEqual(montarTemplate(template,{'BODY:nome':'<script>'}).components?.[0].parameters,[{type:'text',parameter_name:'nome',text:'<script>'}]);
});
test('template de midia ou botao dinamico nao e apresentado como texto simples',()=>{
 assert.equal(templateDeTexto({name:'x',language:'pt_BR',components:[{type:'HEADER',format:'IMAGE'}]}),false);
 assert.equal(templateDeTexto({name:'x',language:'pt_BR',components:[{type:'BUTTONS',buttons:[{type:'URL',url:'https://exemplo.com/{{1}}'}]}]}),false);
});
