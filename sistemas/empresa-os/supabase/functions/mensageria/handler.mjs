import {verifyMetaSignature,normalizeWebhook,dispatchMeta,privatePath,validateMedia,readLimited,META_CAPABILITIES} from './core.mjs';
const json=(body,status=200)=>Response.json(body,{status,headers:{'Cache-Control':'no-store','X-Content-Type-Options':'nosniff'}});
const safeFailure=(status=503)=>json({error:status===403?'Acesso negado.':'Operação indisponível. Tente novamente ou consulte o estado da conexão.'},status);
export function createHandler({rpc,storage,serviceKey,fetchImpl=fetch}) {
  const service=(op,data={})=>rpc('mensageria_servico',{p_operacao:op,p_dados:data});
  return async function handler(request){
    const url=new URL(request.url),suffix=url.pathname.split('/mensageria')[1]||'';
    try {
      if(suffix==='/device'){
        if(request.method!=='POST')return json({error:'Método inválido.'},405);
        const payload=JSON.parse(new TextDecoder().decode(await readLimited(request,12*1024*1024)));
        if(typeof payload.p_token!=='string'||typeof payload.p_operacao!=='string')return safeFailure(403);
        try{return json(await rpc('mensageria_dispositivo',{p_token:payload.p_token,p_operacao:payload.p_operacao,p_dados:payload.p_dados||{}}));}
        catch{return safeFailure(403);}
      }
      if(suffix==='/media'){
        if(!['GET','POST'].includes(request.method))return json({error:'Método inválido.'},405);
        const token=request.headers.get('x-device-token');if(!token)return safeFailure(403);
        const data={conta_id:url.searchParams.get('conta_id'),runtime_id:url.searchParams.get('runtime_id'),epoca:Number(url.searchParams.get('epoca')),path:url.searchParams.get('path'),acao:request.method==='GET'?'read':'write'};
        privatePath(data.conta_id,data.path);
        const device=(op,d)=>rpc('mensageria_dispositivo',{p_token:token,p_operacao:op,p_dados:d});
        try{await device('autorizar_media',data);}catch{return safeFailure(403);}
        if(request.method==='GET'){
          const response=await storage.download(data.path);if(!response.ok)return safeFailure(404);
          return new Response(response.body,{headers:{'Content-Type':response.headers.get('Content-Type')||'application/octet-stream','Cache-Control':'private, no-store','X-Content-Type-Options':'nosniff'}});
        }
        const {contas=[]}=await device('contas',{});const account=contas.find(c=>c.id===data.conta_id);
        if(!account)return safeFailure(403);
        const bytes=await readLimited(request,100*1024*1024);
        const mime=validateMedia(request.headers.get('Content-Type')||'application/octet-stream',bytes.length,account.provedor);
        await storage.upload(data.path,bytes,mime);
        const result=await device('media_upload',{...data,nome:url.searchParams.get('nome')||data.path.split('/').at(-1),mime,bytes:bytes.length});
        return json(result);
      }
      if(suffix==='/dispatch'){
        if(request.method!=='POST')return json({error:'Método inválido.'},405);
        const credential=request.headers.get('apikey')||request.headers.get('Authorization')?.replace(/^Bearer /,'');
        if(!serviceKey||!credential)return json({error:'unauthorized'},401);
        if(credential!==serviceKey){
          try{await rpc('mensageria_servico',{p_operacao:'autorizar_dispatch',p_dados:{}},credential);}
          catch{return json({error:'unauthorized'},401);}
        }
        const payload=JSON.parse(new TextDecoder().decode(await readLimited(request,4096))||'{}');
        const {contas=[]}=await service('meta_contas');const results=[];
        for(const account of contas.filter(a=>!payload.conta_id||a.id===payload.conta_id)){
          const runtime_id=crypto.randomUUID();let lease,heartbeat,renewing=null,leaseFailure=null;
          try{
            lease=await service('lease',{conta_id:account.id,runtime_id});
            const identity={conta_id:account.id,runtime_id,epoca:lease.epoca};
            heartbeat=setInterval(()=>{
              if(renewing||leaseFailure)return;
              renewing=service('lease',{conta_id:account.id,runtime_id}).then(next=>{
                if(next.epoca!==identity.epoca)throw new Error('Lease transferido.');
              }).catch(error=>{leaseFailure=error;}).finally(()=>{renewing=null;});
            },15000);
            const {comandos=[]}=await service('claim',identity);
            for(const cmd of comandos){
              let result;
              try{
                const checked=await service('validar_comando',{...identity,comando_id:cmd.id});
                result=await dispatchMeta(checked.comando||checked,account,{fetchImpl,authorize:async()=>{
                  if(renewing)await renewing;if(leaseFailure)throw leaseFailure;
                  const latest=await service('validar_comando',{...identity,comando_id:cmd.id});
                  if(!(latest.comando||latest)?.id)throw new Error('Comando revogado.');
                },loadMedia:async anexo=>{
                  const response=await storage.download(privatePath(account.id,anexo.path));if(!response.ok)throw new Error('Arquivo indisponível.');
                  return readLimited(response,100*1024*1024);
                }});
              }catch{result={estado:'falhou',erro:'Comando não autorizado ou contexto alterado.'};}
              await service('resultado',{...identity,comando_id:cmd.id,...result});results.push({id:cmd.id,estado:result.estado});
            }
          }catch{/* Lease ocupado ou banco indisponível: fila permanece durável. */}
          finally{clearInterval(heartbeat);if(renewing)await renewing;if(lease)await service('liberar_lease',{conta_id:account.id,runtime_id,epoca:lease.epoca}).catch(()=>{});}
        }
        return json({resultados:results});
      }
      if(suffix!==''&&suffix!=='/'&&suffix!=='/webhook')return json({error:'not_found'},404);
      if(request.method==='GET'){
        if(url.searchParams.get('hub.mode')!=='subscribe')return json({error:'invalid_challenge'},400);
        const {contas=[]}=await service('meta_contas');
        const token=url.searchParams.get('hub.verify_token');
        if(!token||!contas.some(c=>c.verify_token===token))return safeFailure(403);
        return new Response(url.searchParams.get('hub.challenge')||'',{headers:{'Content-Type':'text/plain','Cache-Control':'no-store'}});
      }
      if(request.method!=='POST')return json({error:'Método inválido.'},405);
      const signature=request.headers.get('x-hub-signature-256');if(!signature)return json({error:'invalid_signature'},401);
      const bytes=await readLimited(request,2*1024*1024);
      const {contas=[]}=await service('meta_contas');const accounts=[];
      for(const account of contas)if(await verifyMetaSignature(bytes,signature,account.app_secret))accounts.push(account);
      if(!accounts.length)return json({error:'invalid_signature'},401);
      const payload=JSON.parse(new TextDecoder().decode(bytes));
      if(payload.object!=='whatsapp_business_account')return json({ok:true});
      for(const account of accounts){
        const {mensagens,recibos}=normalizeWebhook(payload,account.phone_id);
        for(const message of mensagens){
          const prior=await service('evento_existente',{conta_id:account.id,evento_id:message.provedor_id});
          if(prior.existe)continue;
          const {media,...entry}=message;
          if(media){
            const meta=await fetchImpl(`https://graph.facebook.com/${account.graph_version}/${encodeURIComponent(media.id)}`,{headers:{Authorization:`Bearer ${account.access_token}`},signal:AbortSignal.timeout(15000)});
            if(!meta.ok)throw new Error('Meta media indisponível.');
            const info=await meta.json();const remote=new URL(info.url);
            if(remote.protocol!=='https:'||!/(^|\.)(facebook\.com|fbcdn\.net|fbsbx\.com|whatsapp\.net)$/.test(remote.hostname))throw new Error('Origem de mídia inválida.');
            const response=await fetchImpl(remote,{headers:{Authorization:`Bearer ${account.access_token}`},redirect:'error',signal:AbortSignal.timeout(60000)});
            if(!response.ok)throw new Error('Download Meta indisponível.');
            const content=await readLimited(response,100*1024*1024),mime=media.mime||info.mime_type||'application/octet-stream';validateMedia(mime,content.length);
            const nome=String(media.nome).replace(/[^\p{L}\p{N}._ -]/gu,'_').slice(0,180);
            const digest=Array.from(new Uint8Array(await crypto.subtle.digest('SHA-256',new TextEncoder().encode(message.provedor_id))),b=>b.toString(16).padStart(2,'0')).join('');
            const path=`${account.id}/${digest}/${nome}`;
            await storage.upload(path,content,mime);entry.anexo={path,nome,mime,bytes:content.length};
            await service('media_upload',{conta_id:account.id,...entry.anexo});
          }
          await service('evento',{conta_id:account.id,evento_id:message.provedor_id,jid:message.jid,nome:message.nome,grupo:false,mensagens:[entry]});
        }
        for(const receipt of recibos)await service('recibo',{conta_id:account.id,...receipt});
      }
      return json({ok:true});
    }catch(error){
      const validation=/Caminho|limite|Formato|JSON/.test(String(error.message));
      return safeFailure(validation?400:503);
    }
  };
}

// Adaptador REST evita SDK dinâmico e conserva o JWT só no lado servidor.
export function createRestDependencies({url,serviceKey,fetchImpl=fetch}){
  const authHeaders=key=>({apikey:key,...(/^(sb_publishable_|sb_secret_)/.test(key)?{}:{Authorization:`Bearer ${key}`})});
  const headers=authHeaders(serviceKey);
  const object=path=>`${url}/storage/v1/object/mensageria/${path.split('/').map(encodeURIComponent).join('/')}`;
  return {serviceKey,fetchImpl,rpc:async(name,args,credential=serviceKey)=>{
    const response=await fetchImpl(`${url}/rest/v1/rpc/${name}`,{method:'POST',headers:{...authHeaders(credential),'Content-Type':'application/json'},body:JSON.stringify(args),signal:AbortSignal.timeout(20000)});
    if(!response.ok)throw new Error('Banco recusou a operação.');return response.json();
  },storage:{upload:async(path,bytes,mime)=>{
    const response=await fetchImpl(object(path),{method:'POST',headers:{...headers,'Content-Type':mime,'x-upsert':'false'},body:bytes,signal:AbortSignal.timeout(60000)});
    if(!response.ok){const detail=await response.json().catch(()=>({}));if(response.status===409||detail.statusCode==='409'||detail.error==='Duplicate')return;throw new Error('Armazenamento indisponível.');}
  },download:async path=>fetchImpl(object(path),{headers,signal:AbortSignal.timeout(30000)})}};
}
export {META_CAPABILITIES};
