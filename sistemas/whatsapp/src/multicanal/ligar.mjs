// Liga este computador ao Empresa OS sem ninguém copiar token (17/11/2026).
// A IA roda `npm run mensageria:ligar` com as variáveis da Casa carregadas (credenciais/.env). Este módulo
// chama public.mensageria_ligar_computador com a chave de serviço SÓ nesta chamada e devolve o token da
// instalação, que o cli grava direto na configuração privada. A chave de serviço não é guardada.
import os from 'node:os';

export const AVISO_VARIAVEIS='Faltam variáveis da Casa. Carregue credenciais/.env antes (set -a && . ../../credenciais/.env && set +a) e rode de novo. Não coloque valores no comando.';

export function lerAmbiente(env=process.env){
  const url=env.SUPABASE_URL||env.NEXT_PUBLIC_SUPABASE_URL;
  const servico=env.SUPABASE_SERVICE_ROLE_KEY;
  const publica=env.NEXT_PUBLIC_SUPABASE_ANON_KEY||env.SUPABASE_ANON_KEY;
  if(!url||!servico||!publica)throw new Error(AVISO_VARIAVEIS);
  const nome=String(env.MENSAGERIA_COMPUTADOR||os.hostname()||'Computador da empresa').trim().slice(0,120)||'Computador da empresa';
  return {url,servico,publica,nome};
}

export async function ligarComputador({url,servico,nome,fetchImpl=fetch}){
  const base=new URL(url);
  if(base.protocol!=='https:'&&base.hostname!=='localhost'&&base.hostname!=='127.0.0.1')throw new Error('Endereço do Supabase precisa ser https.');
  const headers={'Content-Type':'application/json',apikey:servico,...(/^(sb_publishable_|sb_secret_)/.test(servico)?{}:{Authorization:`Bearer ${servico}`})};
  const resposta=await fetchImpl(`${base.origin}/rest/v1/rpc/mensageria_ligar_computador`,{method:'POST',headers,body:JSON.stringify({p_nome:nome})});
  if(!resposta.ok){
    const motivo=resposta.status===404?' A migration 20261117120000_mensageria_ligar_computador ainda não está no banco: publique o sistema e rode de novo.':'';
    throw new Error(`O Supabase recusou ligar o computador (HTTP ${resposta.status}).${motivo}`);
  }
  const dados=await resposta.json();
  if(typeof dados?.token!=='string'||dados.token.length!==64)throw new Error('Resposta inesperada do Supabase ao ligar o computador.');
  return {id:dados.id,token:dados.token,numerosLigados:Number(dados.numeros_ligados)||0};
}
