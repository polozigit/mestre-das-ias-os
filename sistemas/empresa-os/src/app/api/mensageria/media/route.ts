import {createClient} from '@/lib/supabase/server';
import {createServiceClient} from '@/lib/supabase/service';
import {exigirOrigem,executarRpc,nomeSeguro} from '@/lib/mensageria-servidor/seguranca';
import {privatePath,validateMedia,readLimited} from '../../../../../supabase/functions/mensageria/core.mjs';

export const runtime='nodejs';
const failure=(message:string,status=400)=>Response.json({error:message},{status,headers:{'Cache-Control':'no-store'}});
export async function POST(request:Request){
  try{
    exigirOrigem(request);
    const client=await createClient();const {data:{user}}=await client.auth.getUser();if(!user)return failure('Entre no sistema.',401);
    if(request.headers.get('content-type')?.startsWith('application/json')){
      const bytes=await readLimited(request,16384);const body=JSON.parse(new TextDecoder().decode(bytes));
      const conta_id=String(body.conta_id||''),nome=nomeSeguro(String(body.nome||''));
      const authorized=await executarRpc<{conta:{provedor:string}}>(client,'mensageria_api',{p_operacao:'autorizar_conta',p_dados:{conta_id,acao:'write'}});
      const mime=validateMedia(body.mime,body.bytes,authorized.conta.provedor);
      const path=privatePath(conta_id,body.modo==='preparar'?`${conta_id}/${crypto.randomUUID()}/${nome}`:body.path);
      await executarRpc(client,'mensageria_api',{p_operacao:'autorizar_media',p_dados:{conta_id,path,acao:'write'}});
      const bucket=createServiceClient().storage.from('mensageria');
      if(body.modo==='preparar'){
        const {data,error}=await bucket.createSignedUploadUrl(path,{upsert:false});
        if(error||!data)return failure('Não foi possível autorizar o upload.',503);
        return Response.json({path,token:data.token,mime},{headers:{'Cache-Control':'no-store'}});
      }
      if(body.modo!=='confirmar')return failure('Operação de arquivo inválida.');
      const {data:info,error}=await bucket.info(path);
      if(error||!info||info.size!==body.bytes||info.contentType?.split(';')[0]!==mime)return failure('O arquivo não foi confirmado no armazenamento.',409);
      const anexo={conta_id,conversa_id:body.conversa_id||null,path,nome,mime,bytes:info.size};
      await executarRpc(client,'mensageria_api',{p_operacao:'upload_registrar',p_dados:anexo});
      return Response.json({path,nome,mime,bytes:info.size},{headers:{'Cache-Control':'no-store'}});
    }
    const size=Number(request.headers.get('content-length')||0);if(size>101*1024*1024)return failure('Arquivo acima do limite.',413);
    const payload=await readLimited(request,101*1024*1024);
    const form=await new Response(payload,{headers:{'Content-Type':request.headers.get('content-type')||''}}).formData(),file=form.get('file'),conta_id=String(form.get('conta_id')||'');
    if(!(file instanceof File))return failure('Selecione um arquivo.');
    const authorized=await executarRpc<{conta:{provedor:string}}>(client,'mensageria_api',{p_operacao:'autorizar_conta',p_dados:{conta_id,acao:'write'}});
    const nome=nomeSeguro(file.name),mime=validateMedia(file.type||'application/octet-stream',file.size,authorized.conta.provedor);
    const path=privatePath(conta_id,`${conta_id}/${crypto.randomUUID()}/${nome}`);
    await executarRpc(client,'mensageria_api',{p_operacao:'autorizar_media',p_dados:{conta_id,path,acao:'write'}});
    const service=createServiceClient();
    const {error}=await service.storage.from('mensageria').upload(path,file,{contentType:mime,upsert:false});
    if(error)return failure('Não foi possível guardar o arquivo. Tente novamente.',503);
    const anexo={conta_id,conversa_id:form.get('conversa_id')||null,path,nome,mime,bytes:file.size};
    try{await executarRpc(client,'mensageria_api',{p_operacao:'upload_registrar',p_dados:anexo});}
    catch{await service.storage.from('mensageria').remove([path]);return failure('O arquivo não foi autorizado.',403);}
    return Response.json({path,nome,mime,bytes:file.size},{headers:{'Cache-Control':'no-store'}});
  }catch(error){return failure(error instanceof Error?error.message:'Upload indisponível.');}
}
export async function GET(request:Request){
  try{
    const client=await createClient();const {data:{user}}=await client.auth.getUser();if(!user)return failure('Entre no sistema.',401);
    const path=new URL(request.url).searchParams.get('path')||'',conta_id=path.split('/')[0];privatePath(conta_id,path);
    await executarRpc(client,'mensageria_api',{p_operacao:'autorizar_media',p_dados:{path,acao:'read'}});
    const {data,error}=await createServiceClient().storage.from('mensageria').createSignedUrl(path,60,{download:new URL(request.url).searchParams.get('download')==='1'});
    if(error||!data?.signedUrl)return failure('Arquivo indisponível.',404);
    return new Response(null,{status:307,headers:{Location:data.signedUrl,'Cache-Control':'private, no-store'}});
  }catch{return failure('Você não tem acesso a este arquivo.',403);}
}
