import {createClient} from '@/lib/supabase/server';
import {createServiceClient} from '@/lib/supabase/service';
import {exigirOrigem,executarRpc} from '@/lib/mensageria-servidor/seguranca';
import {lerConfigServico} from '../../../../../config/supabase-env-servidor.mjs';
export async function POST(request:Request){
  try{
    exigirOrigem(request);
    const client=await createClient();const {data:{user}}=await client.auth.getUser();if(!user)return Response.json({error:'Entre no sistema.'},{status:401});
    if(Number(request.headers.get('content-length')||0)>16384)throw new Error('Configuração longa demais.');
    const body=await request.json();
    await executarRpc(client,'mensageria_api',{p_operacao:'autorizar_conta',p_dados:{conta_id:body.conta_id,acao:'manage'}});
    if(!/^\d+$/.test(body.phone_id)||!/^\d+$/.test(body.waba_id)||!/^v\d+\.0$/.test(body.graph_version)||![body.access_token,body.app_secret,body.verify_token].every(x=>typeof x==='string'&&x.length>=8&&x.length<=4096))throw new Error('Preencha os identificadores, a versão e as credenciais Meta.');
    // Confere a identidade do número no provedor sem enviar nenhuma mensagem.
    const response=await fetch(`https://graph.facebook.com/${body.graph_version}/${body.waba_id}/phone_numbers`,{headers:{Authorization:`Bearer ${body.access_token}`},signal:AbortSignal.timeout(15000),cache:'no-store'});
    const verified=await response.json();if(!response.ok||!verified.data?.some((phone:{id:string})=>phone.id===body.phone_id))throw new Error('Meta não confirmou o número nesta conta empresarial.');
    await executarRpc(createServiceClient(),'mensageria_servico',{p_operacao:'meta_configurar',p_dados:{conta_id:body.conta_id,phone_id:body.phone_id,waba_id:body.waba_id,access_token:body.access_token,app_secret:body.app_secret,verify_token:body.verify_token,graph_version:body.graph_version}});
    const {url,chaveSecreta}=lerConfigServico(process.env);
    let warning:string|undefined;
    try{await executarRpc(createServiceClient(),'mensageria_servico',{p_operacao:'agendar_meta',p_dados:{url,service_key:chaveSecreta}});}
    catch{warning='Credenciais salvas. O agendamento oficial precisa ser ativado no Supabase; enquanto isso o envio depende da caixa aberta.';}
    return Response.json({ok:true,warning},{headers:{'Cache-Control':'no-store'}});
  }catch(error){return Response.json({error:error instanceof Error?error.message:'Configuração indisponível.'},{status:400,headers:{'Cache-Control':'no-store'}});}
}
