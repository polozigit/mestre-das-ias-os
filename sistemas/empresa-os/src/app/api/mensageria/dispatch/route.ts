import {createClient} from '@/lib/supabase/server';
import {exigirOrigem,executarRpc} from '@/lib/mensageria-servidor/seguranca';
import {lerConfigServico} from '../../../../../config/supabase-env-servidor.mjs';
export async function POST(request:Request){
  try{
    exigirOrigem(request);
    const client=await createClient();const {data:{user}}=await client.auth.getUser();if(!user)return Response.json({error:'Entre no sistema.'},{status:401});
    const body=await request.json();
    await executarRpc(client,'mensageria_api',{p_operacao:'autorizar_conta',p_dados:{conta_id:body.conta_id,acao:'write'}});
    const {url,chaveSecreta}=lerConfigServico(process.env);
    const response=await fetch(`${url}/functions/v1/mensageria/dispatch`,{method:'POST',headers:{...(/^sb_secret_/.test(chaveSecreta)?{}:{Authorization:`Bearer ${chaveSecreta}`}),apikey:chaveSecreta,'Content-Type':'application/json'},body:JSON.stringify({conta_id:body.conta_id}),signal:AbortSignal.timeout(25000)});
    if(!response.ok)throw new Error('Conector oficial aguardando disponibilidade.');
    return Response.json(await response.json(),{headers:{'Cache-Control':'no-store'}});
  }catch{return Response.json({error:'O comando continua na fila. Consulte o estado da conexão.'},{status:503,headers:{'Cache-Control':'no-store'}});}
}
