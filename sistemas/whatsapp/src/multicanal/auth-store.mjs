import { createCipheriv, createDecipheriv, randomBytes } from 'node:crypto';

function replacer(_name, value) {
  if (value instanceof Uint8Array) return { type: 'Buffer', data: Array.from(value) };
  return value;
}
function reviver(_name, value) {
  if (value?.type === 'Buffer' && Array.isArray(value.data)) return Buffer.from(value.data);
  return value;
}
function clone(value) { return JSON.parse(JSON.stringify(value, replacer), reviver); }
function checkKey(key) { if (!(key instanceof Uint8Array) || key.length !== 32) throw new Error('Chave de cifra precisa ter 32 bytes.'); }

export function encryptState(value, key, accountId) {
  checkKey(key);
  const iv = randomBytes(12);
  const cipher = createCipheriv('aes-256-gcm', key, iv);
  cipher.setAAD(Buffer.from(`mensageria-auth-v1:${accountId}`));
  const data = Buffer.concat([cipher.update(JSON.stringify(value, replacer), 'utf8'), cipher.final()]);
  return { v: 1, iv: iv.toString('base64'), tag: cipher.getAuthTag().toString('base64'), data: data.toString('base64') };
}

export function decryptState(envelope, key, accountId) {
  checkKey(key);
  if (envelope?.v !== 1 || typeof envelope.data !== 'string') throw new Error('Estado de autenticação inválido.');
  const decipher = createDecipheriv('aes-256-gcm', key, Buffer.from(envelope.iv, 'base64'));
  decipher.setAAD(Buffer.from(`mensageria-auth-v1:${accountId}`));
  decipher.setAuthTag(Buffer.from(envelope.tag, 'base64'));
  const plain = Buffer.concat([decipher.update(Buffer.from(envelope.data, 'base64')), decipher.final()]);
  return JSON.parse(plain.toString('utf8'), reviver);
}

// Cada keys.set é uma transação CAS durável. Uma falha torna a instância inutilizável:
// continuar com chaves que só existem em memória corromperia a sessão Signal.
export async function createAuthStore({ accountId, key, rpc, initialCreds, onFailure = () => {}, reviveSignal = (_type, value) => value }) {
  const saved = await rpc('auth_ler', { conta_id: accountId });
  let version = Number(saved.versao || 0);
  let data = saved.dados ? decryptState(saved.dados, key, accountId) : { creds: initialCreds(), keys: {} };
  let fatal = null;
  let pending = Promise.resolve();
  const state = {
    creds: data.creds,
    keys: {
      async get(type, ids) {
        await pending;
        if (fatal) throw fatal;
        const found = {};
        for (const id of ids) if (data.keys[type]?.[id] != null) found[id] = reviveSignal(type, clone(data.keys[type][id]));
        return found;
      },
      set(changes) {
        return transaction((next) => {
          for (const [type, values] of Object.entries(changes)) {
            next.keys[type] ??= {};
            for (const [id, value] of Object.entries(values || {})) {
              if (value == null) delete next.keys[type][id];
              else next.keys[type][id] = clone(value);
            }
          }
        });
      },
      clear() { return transaction((next) => { next.keys = {}; }); },
    },
  };
  function transaction(change) {
    const operation = pending.then(async () => {
      if (fatal) throw fatal;
      const next = clone(data);
      next.creds = clone(state.creds);
      change(next);
      const result = await rpc('auth_salvar', { conta_id: accountId, versao: version, dados: encryptState(next, key, accountId) });
      if (!Number.isSafeInteger(result?.versao) || result.versao !== version + 1) throw new Error('Versão de autenticação não confirmada.');
      data = next; version = result.versao;
    }).catch(async (error) => {
      if (!fatal) { fatal = error; await onFailure(error); }
      throw fatal;
    });
    pending = operation.catch(() => {});
    return operation;
  }
  return {
    state,
    async reset(){
      await pending;if(fatal)throw fatal;
      for(const name of Object.keys(state.creds))delete state.creds[name];
      Object.assign(state.creds,initialCreds());
      return transaction(next=>{next.keys={};});
    },
    saveCreds(update = {}) { Object.assign(state.creds, update); return transaction(() => {}); },
    assertHealthy() { if (fatal) throw fatal; },
    get version() { return version; },
  };
}
