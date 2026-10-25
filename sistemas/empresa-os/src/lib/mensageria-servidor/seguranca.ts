export function exigirOrigem(request: Request): void {
  const origin=request.headers.get('origin');
  if(!origin||new URL(origin).origin!==new URL(request.url).origin)throw new Error('Origem não autorizada.');
}
export function nomeSeguro(nome: string): string {
  return nome.replace(/[\\/%?#\u0000-\u001f]/g,'_').trim().slice(0,180)||'arquivo';
}
type ResultadoRpc={data:unknown;error:{message:string}|null};
export async function executarRpc<T>(client:{rpc:unknown},name:string,args:Record<string,unknown>):Promise<T>{
  const rpc=client.rpc as (name:string,args:Record<string,unknown>)=>PromiseLike<ResultadoRpc>;
  const {data,error}=await rpc.call(client,name,args);
  if(error)throw new Error('O banco recusou a operação. Confira sua permissão e a instalação do módulo.');
  return data as T;
}
