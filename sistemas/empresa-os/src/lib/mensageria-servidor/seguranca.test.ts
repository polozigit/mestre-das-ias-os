import test from 'node:test';
import assert from 'node:assert/strict';
import { exigirOrigem, nomeSeguro } from './seguranca.ts';
test('mutacoes aceitam somente a mesma origem do sistema',()=>{
  assert.throws(()=>exigirOrigem(new Request('https://empresa.test/api/mensageria/meta',{method:'POST',headers:{origin:'https://terceiro.test'}})),/Origem/);
  assert.throws(()=>exigirOrigem(new Request('https://empresa.test/api/mensageria/meta',{method:'POST'})),/Origem/);
  assert.doesNotThrow(()=>exigirOrigem(new Request('https://empresa.test/api/mensageria/meta',{method:'POST',headers:{origin:'https://empresa.test'}})));
});
test('nome de anexo remove caminhos e controles preservando extensao',()=>{
  assert.equal(nomeSeguro('../../relatório.pdf'),'.._.._relatório.pdf');
  assert.equal(nomeSeguro('a\nb.txt'),'a_b.txt');
  assert.equal(nomeSeguro(''),'arquivo');
});
