import test from 'node:test';
import assert from 'node:assert/strict';
import { buildDraftPrompt, probeGenerator, generateDraft } from '../src/multicanal/drafts.mjs';

test('gerador sem ferramentas comprovadas fica indisponível sem chamar geração', async () => {
  let calls = 0;
  const status = await probeGenerator('codex', async () => { calls++; return { stdout: 'codex exec --sandbox read-only' }; });
  assert.equal(status.available, false); assert.equal(calls, 1);
});

test('Claude só é habilitado com ferramentas vazias, configuração MCP estrita e modo seguro comprovados', async () => {
  const status = await probeGenerator('claude', async () => ({ stdout: '--tools --safe-mode --restricted --strict-mcp-config --mcp-config --disable-slash-commands --no-session-persistence --output-format --json-schema --permission-mode --permission-prompts --setting-sources --settings --disallowedTools' }));
  assert.equal(status.available, true);
  assert.equal(status.args[status.args.indexOf('--tools') + 1], '');
  assert.equal(status.args.includes('--strict-mcp-config'), true);
});

test('prompt inclui só instruções aprovadas e mensagens, com saída conservadora', () => {
  const prompt = buildDraftPrompt({ instrucoes: 'Produto custa 100', mensagens: [{ direcao: 'recebida', texto: 'Pode dar desconto?' }], regras: [], token: 'NAO_INCLUIR', conversa_versao: 2, politica_versao: 1 });
  assert.equal(prompt.includes('Produto custa 100'), true); assert.equal(prompt.includes('Pode dar desconto?'), true);
  assert.equal(prompt.includes('NAO_INCLUIR'), false); assert.equal(prompt.includes('sensivel'), true);
});

test('rascunho não chama envio e preserva versões fornecidas pelo banco', async () => {
  const calls = [];
  const result = await generateDraft({ provider: 'claude', contexto: { conversa_versao: 7, politica_versao: 3, instrucoes: 'Responda curto', mensagens: [] },
    run: async (cmd, args) => { calls.push([cmd, args]); return args.includes('--help') ? { stdout: '--tools --safe-mode --restricted --strict-mcp-config --mcp-config --disable-slash-commands --no-session-persistence --output-format --json-schema --permission-mode --permission-prompts --setting-sources --settings --disallowedTools' } : { stdout: JSON.stringify({ structured_output: { texto: 'Olá!', sensivel: true, regra_id: null } }) }; },
  });
  assert.equal(result.texto, 'Olá!'); assert.equal(result.conversa_versao, 7); assert.equal(result.politica_versao, 3);
  assert.equal(calls.length, 2); assert.equal(JSON.stringify(calls).includes('whatsapp_send'), false);
});
