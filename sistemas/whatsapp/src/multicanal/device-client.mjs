export function createDeviceClient({ url, publicKey, token, fetchImpl = fetch, timeoutMs = 20000 }) {
  const base = new URL(url);
  if ((base.protocol !== 'https:' && base.hostname !== '127.0.0.1' && base.hostname !== 'localhost') || base.username || base.password || base.search) throw new Error('URL Supabase inválida.');
  const root = base.href.replace(/\/$/, '');
  const headers = { apikey: publicKey, ...(/^(sb_publishable_|sb_secret_)/.test(publicKey)?{}:{Authorization:`Bearer ${publicKey}`}) };
  function safeError(message) {
    let clean = String(message);
    for (const secret of [token, publicKey]) if (secret) clean = clean.split(secret).join('[oculto]');
    return clean.slice(0, 300);
  }
  async function checked(response,stage) {
    if (response.ok) return response;
    let detail = {};
    try { detail = await response.json(); } catch { /* erro sem JSON */ }
    throw Object.assign(new Error(`[${stage} HTTP ${response.status}] ${safeError(detail.message || detail.error || 'Serviço indisponível.')}`), { status: response.status });
  }
  return {
    async call(operation, data = {}) {
      const response = await checked(await fetchImpl(`${root}/functions/v1/mensageria/device`, {
        method: 'POST', headers: { ...headers, 'Content-Type': 'application/json' },
        body: JSON.stringify({ p_token: token, p_operacao: operation, p_dados: data }), signal: AbortSignal.timeout(timeoutMs),
      }),`dispositivo:${operation.replace(/[^a-z_]/g,'').slice(0,40)}`);
      return response.json();
    },
    async media(method, scope, { path, nome = 'arquivo', mime = 'application/octet-stream', bytes } = {}) {
      const params = new URLSearchParams({ ...Object.fromEntries(Object.entries(scope).map(([k,v]) => [k,String(v)])), path, nome });
      const response = await checked(await fetchImpl(`${root}/functions/v1/mensageria/media?${params}`, {
        method, headers: { ...headers, 'x-device-token': token, ...(method === 'POST' ? { 'Content-Type': mime } : {}) },
        ...(method === 'POST' ? { body: bytes } : {}), signal: AbortSignal.timeout(120000),
      }),`arquivo:${method}`);
      if (method === 'POST') return response.json();
      const length = Number(response.headers.get('content-length') || 0);
      if (length > 100 * 1024 * 1024) throw new Error('Mídia excede 100 MB.');
      let total = 0; const chunks = [];
      for await (const chunk of response.body || []) { total += chunk.length; if (total > 100 * 1024 * 1024) throw new Error('Mídia excede 100 MB.'); chunks.push(chunk); }
      return Buffer.concat(chunks);
    },
  };
}
