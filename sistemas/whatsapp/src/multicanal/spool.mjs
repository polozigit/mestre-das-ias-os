import { mkdir, open, readdir, readFile, rename, unlink } from 'node:fs/promises';
import path from 'node:path';
import { randomUUID } from 'node:crypto';

function accountPath(root, account) {
  if (!/^[a-zA-Z0-9_-]{1,128}$/.test(account)) throw new Error('Conta inválida para spool.');
  return path.join(root, account);
}

export class DurableSpool {
  constructor(directory) { this.directory = path.resolve(directory); this.locks = new Map(); this.sequence=0; }
  async push(account, event) {
    const dir = accountPath(this.directory, account);
    await mkdir(dir, { recursive: true, mode: 0o700 });
    const name = `${String(Date.now()).padStart(16, '0')}-${String(this.sequence++).padStart(8,'0')}-${randomUUID()}`;
    const temp = path.join(dir, `${name}.tmp`);
    const file = await open(temp, 'wx', 0o600);
    try { await file.writeFile(JSON.stringify(event)); await file.sync(); } finally { await file.close(); }
    await rename(temp, path.join(dir, `${name}.json`));
  }
  async flush(account, send, {maxFiles=Infinity}={}) {
    const previous = this.locks.get(account) || Promise.resolve();
    const operation = previous.catch(() => {}).then(async () => {
      const dir = accountPath(this.directory, account);
      const files = await readdir(dir).catch((error) => { if (error.code === 'ENOENT') return []; throw error; });
      for (const name of files.filter((file) => file.endsWith('.json')).sort().slice(0,maxFiles)) {
        const file = path.join(dir, name);
        const event = JSON.parse(await readFile(file, 'utf8'));
        await send(event.operacao, event.dados);
        await unlink(file);
      }
    });
    this.locks.set(account, operation);
    try { await operation; } finally { if (this.locks.get(account) === operation) this.locks.delete(account); }
  }
}
