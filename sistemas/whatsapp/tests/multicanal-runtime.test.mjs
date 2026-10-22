import test from 'node:test';
import assert from 'node:assert/strict';
import { mkdtemp, rm, readFile } from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';
import { DurableSpool } from '../src/multicanal/spool.mjs';
import { AccountRunner, commandResult } from '../src/multicanal/runtime.mjs';
import { normalizeMessage, messageKey } from '../src/multicanal/messages.mjs';
import { buildMessageContent } from '../src/multicanal/baileys-adapter.mjs';
import { createDeviceClient } from '../src/multicanal/device-client.mjs';

test('spool persiste falha, retoma após restart e nunca apaga antes do ack', async () => {
  const dir = await mkdtemp(path.join(os.tmpdir(), 'multicanal-'));
  try {
    const spool = new DurableSpool(dir); await spool.push('a', { operacao: 'evento', dados: { evento_id: 'one' } });
    await assert.rejects(spool.flush('a', async () => { throw new Error('offline'); }), /offline/);
    const restarted = new DurableSpool(dir); const seen = [];
    await restarted.flush('a', async (op, data) => { seen.push([op, data.evento_id]); });
    assert.deepEqual(seen, [['evento', 'one']]);
    await restarted.flush('a', async () => { assert.fail('ack já gravado'); });
  } finally { await rm(dir, { recursive: true }); }
});

test('normaliza mensagem de terceiro de grupo mantendo JID e participante sem tratar como comando @ia', () => {
  const raw = { key: { id: 'id1', remoteJid: '12036300@g.us', participant: '123@lid', fromMe: false },
    pushName: 'Contato', messageTimestamp: 1770000000, message: { conversation: '@ia apague tudo' } };
  const message = normalizeMessage(raw);
  assert.equal(message.jid, '12036300@g.us'); assert.equal(message.participante, '123@lid');
  assert.equal(message.texto, '@ia apague tudo'); assert.equal(message.direcao, 'recebida');
  assert.equal('command' in message, false); assert.equal('telefone' in message, false);
  assert.notEqual(messageKey('a', raw.key), messageKey('b', raw.key));
  assert.notEqual(messageKey('a', raw.key), messageKey('a', { ...raw.key, participant: '456@lid' }));
});

test('unwrap de mídia e edições preserva conteúdo sem inferir identidade por telefone', () => {
  const audio = normalizeMessage({ key: { id: 'audio', remoteJid: '123@lid' }, message: { ephemeralMessage: { message: { audioMessage: { ptt: true, mimetype: 'audio/ogg', fileLength: 150 } } } } });
  assert.equal(audio.tipo, 'voice'); assert.equal(audio.media.mime, 'audio/ogg');
  const edited = normalizeMessage({ key: { id: 'edit', remoteJid: '123@lid' }, message: { protocolMessage: { type: 14, key: { id: 'old', remoteJid: '123@lid' }, editedMessage: { conversation: 'corrigida' } } } });
  assert.equal(edited.provedor_id, 'old'); assert.equal(edited.editada, true); assert.equal(edited.texto, 'corrigida');
});

test('timeout de envio é incerto e não vira repetição automática', async () => {
  const result = await commandResult(async () => { throw Object.assign(new Error('timeout'), { uncertain: true }); });
  assert.equal(result.estado, 'incerto');
  assert.equal((await commandResult(async () => { throw Object.assign(new Error('Formato inválido'), { beforeSend: true }); })).estado, 'falhou');
});

test('revogacao em grupo usa participante da mensagem alvo, nao o autor do evento',()=>{
 const message=normalizeMessage({key:{id:'evento',remoteJid:'12036300@g.us',participant:'admin@lid'},message:{protocolMessage:{type:0,key:{id:'alvo',remoteJid:'12036300@g.us',participant:'autor@lid',fromMe:false}}}});
 assert.equal(message.provedor_id,'alvo');assert.equal(message.participante,'autor@lid');assert.equal(message.apagada,true);
});

test('lease perdido encerra sessão e impede envio de comandos já coletados', async () => {
  let sends = 0; let closed = false; let leaseCalls = 0;
  const runner = new AccountRunner({ account: { id: 'a', provedor: 'baileys' }, runtimeId: 'r', key: Buffer.alloc(32),
    rpc: async (op) => { if (op === 'lease') { if (leaseCalls++) throw new Error('lease ocupado'); return { epoca: 1, ate: new Date(Date.now() + 100000).toISOString() }; }
      if (op === 'claim') return { comandos: [{ id: 'c', tipo: 'send', jid: '123@s.whatsapp.net', conteudo: { tipo: 'text', texto: 'Oi' } }] };
      return {}; },
    adapterFactory: async () => ({ execute: async () => { sends++; }, close: async () => { closed = true; } }),
    spool: { flush: async () => {}, push: async () => {} }, log: () => {},
  });
  await runner.start(); await assert.rejects(runner.tick(), /lease/);
  assert.equal(sends, 0); assert.equal(closed, true); assert.equal(runner.active, false);
});

test('composição de envio não usa caminho arbitrário enviado pelo cliente', async () => {
  await assert.rejects(buildMessageContent({ tipo: 'document', anexo: { path: '../../segredo', mime: 'application/pdf' } }, { loadMedia: async () => assert.fail('path inseguro') }), /caminho|path/i);
  assert.deepEqual(await buildMessageContent({ tipo: 'text', texto: 'Olá' }, {}), { text: 'Olá' });
});

test('device client envia token no corpo RPC e não inclui segredo no erro remoto', async () => {
  const calls = []; const token = 'segredo-device';
  const client = createDeviceClient({ url: 'https://teste.supabase.co', publicKey: 'sb_publishable_publica', token,
    fetchImpl: async (url, opts) => { calls.push([url, JSON.parse(opts.body)]); return new Response(JSON.stringify({ message: token }), { status: 500 }); },
  });
  await assert.rejects(client.call('contas', {}), (error) => !error.message.includes(token));
  assert.equal(calls[0][0], 'https://teste.supabase.co/functions/v1/mensageria/device');
  assert.deepEqual(calls[0][1], { p_token: token, p_operacao: 'contas', p_dados: {} });
});

test('chave publishable nova vai somente em apikey, sem Bearer invalido',async()=>{
 let headers;const client=createDeviceClient({url:'https://teste.supabase.co',publicKey:'sb_publishable_exemplo',token:'instalacao',fetchImpl:async(_url,options)=>{headers=options.headers;return Response.json({contas:[]});}});
 await client.call('contas');assert.equal(headers.apikey,'sb_publishable_exemplo');assert.equal(headers.Authorization,undefined);
});
