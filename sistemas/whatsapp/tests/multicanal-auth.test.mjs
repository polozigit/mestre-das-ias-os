import test from 'node:test';
import assert from 'node:assert/strict';
import { randomBytes } from 'node:crypto';
import { createAuthStore, encryptState, decryptState } from '../src/multicanal/auth-store.mjs';

function database() {
  const rows = new Map();
  return { rows, async call(operation, data) {
    if (operation === 'auth_ler') return rows.get(data.conta_id) ?? { versao: 0, dados: null };
    const previous = rows.get(data.conta_id) ?? { versao: 0 };
    if (data.versao !== previous.versao) throw new Error('conflito de versão');
    const next = { versao: previous.versao + 1, dados: data.dados };
    rows.set(data.conta_id, next);
    return next;
  } };
}

test('logout descarta identidade e chaves antigas sem recriar a chave de cifra',async()=>{
 const db=database(),key=randomBytes(32);
 const options={accountId:'conta',key,rpc:db.call,initialCreds:()=>({registered:false,identity:'nova'})};
 const store=await createAuthStore(options);
 await store.saveCreds({registered:true,identity:'antiga',me:{id:'numero'}});
 await store.state.keys.set({session:{antiga:{key:1}}});
 await store.reset();
 const restarted=await createAuthStore(options);
 assert.equal(restarted.state.creds.registered,false);assert.equal(restarted.state.creds.me,undefined);
 assert.deepEqual(await restarted.state.keys.get('session',['antiga']),{});
});

test('auth cifra é vinculada à conta e rejeita adulteração ou outra chave', () => {
  const key = randomBytes(32);
  const encrypted = encryptState({ segredo: 'nao-pode-vazar' }, key, 'conta-a');
  assert.equal(JSON.stringify(encrypted).includes('nao-pode-vazar'), false);
  assert.deepEqual(decryptState(encrypted, key, 'conta-a'), { segredo: 'nao-pode-vazar' });
  assert.throws(() => decryptState(encrypted, key, 'conta-b'));
  assert.throws(() => decryptState(encrypted, randomBytes(32), 'conta-a'));
  assert.throws(() => decryptState({ ...encrypted, tag: randomBytes(16).toString('base64') }, key, 'conta-a'));
});

test('Signal keys persistem antes de retornar e sobrevivem a restart sem misturar contas', async () => {
  const db = database(); const key = randomBytes(32);
  const options = (id) => ({ accountId: id, key, rpc: db.call, initialCreds: () => ({ registered: false }) });
  const a = await createAuthStore(options('a'));
  const b = await createAuthStore(options('b'));
  await Promise.all([a.state.keys.set({ session: { one: { n: 1 } } }), a.state.keys.set({ session: { two: { n: 2 } } })]);
  await b.state.keys.set({ session: { one: { n: 9 } } });
  const restarted = await createAuthStore(options('a'));
  assert.deepEqual(await restarted.state.keys.get('session', ['one', 'two']), { one: { n: 1 }, two: { n: 2 } });
  assert.deepEqual(await b.state.keys.get('session', ['one']), { one: { n: 9 } });
  await restarted.state.keys.set({ session: { one: null } });
  assert.deepEqual(await restarted.state.keys.get('session', ['one']), {});
});

test('falha de persistência envenena auth store e aciona pausa, sem aceitar novas chaves', async () => {
  let writes = 0; let paused = false;
  const auth = await createAuthStore({ accountId: 'a', key: randomBytes(32), initialCreds: () => ({}),
    rpc: async (op) => { if (op === 'auth_ler') return { versao: 0, dados: null }; writes++; throw new Error('offline'); },
    onFailure: () => { paused = true; },
  });
  await assert.rejects(auth.state.keys.set({ session: { a: 'key' } }), /offline/);
  await assert.rejects(auth.state.keys.set({ session: { b: 'key' } }), /offline/);
  assert.equal(writes, 1); assert.equal(paused, true);
});

test('CAS recusa dois escritores e não substitui estado gravado pelo primeiro', async () => {
  const db = database(); const key = randomBytes(32);
  const options = { accountId: 'a', key, rpc: db.call, initialCreds: () => ({}) };
  const first = await createAuthStore(options); const stale = await createAuthStore(options);
  await first.state.keys.set({ session: { a: 'primeiro' } });
  await assert.rejects(stale.state.keys.set({ session: { a: 'obsoleto' } }), /versão/);
  const restarted = await createAuthStore(options);
  assert.deepEqual(await restarted.state.keys.get('session', ['a']), { a: 'primeiro' });
});
