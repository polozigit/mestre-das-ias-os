import {createClient} from '@/lib/supabase/server';
import {createServiceClient} from '@/lib/supabase/service';
import {executarRpc} from '@/lib/mensageria-servidor/seguranca';
import type {MetaTemplate} from '@/lib/mensageria/templates';
export async function GET(request:Request){
 try{
  const conta_id=new URL(request.url).searchParams.get('conta_id');
  const client=await createClient();const {data:{user}}=await client.auth.getUser();if(!user)return Response.json({error:'Entre no sistema.'},{status:401});
  await executarRpc(client,'mensageria_api',{p_operacao:'autorizar_conta',p_dados:{conta_id,acao:'write'}});
  const {contas}=await executarRpc<{contas:{id:string;waba_id:string;graph_version:string;access_token:string}[]}>(createServiceClient(),'mensageria_servico',{p_operacao:'meta_contas',p_dados:{conta_id}});
  const config=contas.find(c=>c.id===conta_id);if(!config)throw new Error('Conexão oficial ainda não configurada.');
  let cursor='';const templates:MetaTemplate[]=[];
  for(let page=0;page<10;page++){
   const params=new URLSearchParams({limit:'100',...(cursor?{after:cursor}:{})});
   const response=await fetch(`https://graph.facebook.com/${config.graph_version}/${config.waba_id}/message_templates?${params}`,{headers:{Authorization:`Bearer ${config.access_token}`},signal:AbortSignal.timeout(15000),cache:'no-store'});
   if(!response.ok)throw new Error('Meta não disponibilizou os templates. Confira a conexão e as permissões.');
   const result=await response.json();for(const item of result.data||[])if(item.status==='APPROVED')templates.push({name:item.name,language:item.language,status:item.status,components:item.components||[]});
   if(!result.paging?.next)break;cursor=result.paging.cursors?.after;if(!cursor)break;
  }
  return Response.json({templates},{headers:{'Cache-Control':'private, no-store'}});
 }catch(error){return Response.json({error:error instanceof Error?error.message:'Templates indisponíveis.'},{status:400,headers:{'Cache-Control':'no-store'}});}
}
