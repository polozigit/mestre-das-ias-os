"use client";

import Link from "next/link";
import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { ArrowLeft, Bot, Check, ChevronDown, MessageSquare, Plus, RefreshCw, Settings, Users } from "lucide-react";
import { Button } from "@/components/ui/Button";
import { filtrarConversas, estadoLegivel, mensagemErro, permiteAcao, type Filtros } from "@/lib/mensageria/modelo";
import { useMensageria } from "@/lib/mensageria/useMensageria";
import type { ConteudoEnvio, Conversa, Mensagem, Thread } from "@/lib/mensageria/tipos";
import { Composer } from "./Composer";
import { MessageAttachment } from "./MessageAttachment";
import { Drafts } from "./Drafts";
import {aplicarThread,aplicarMudanca,type LeitorState} from "@/lib/mensageria/thread-state";

const selectClass="h-10 min-w-0 rounded-md border border-borda bg-bg-elevada px-2 text-xs text-fg-1";
const hora=(data:string|null)=>data?new Date(data).toLocaleTimeString("pt-BR",{hour:"2-digit",minute:"2-digit"}):"";
export function Inbox({usuarioId,podeEscrever,podeGerir}:{usuarioId:string;podeEscrever:boolean;podeGerir:boolean}) {
  const {painel,erro,carregando,atualizar,executar,api,mudanca}=useMensageria(podeEscrever);
  const [filtros,setFiltros]=useState<Filtros>({});
  const [reader,setReader]=useState<LeitorState>({selected:null,thread:null,error:"",loading:false,following:true});
  const [reloadKey,setReloadKey]=useState(0),[visivel,setVisivel]=useState(true);
  const messageList=useRef<HTMLDivElement>(null);
  const {selected:selecionada,thread,error:threadErro,loading:threadLoading}=reader;
  const [citada,setCitada]=useState<Mensagem|null>(null);const [acaoErro,setAcaoErro]=useState("");const [busy,setBusy]=useState(false);
  const [nova,setNova]=useState(false);const [novoNumero,setNovoNumero]=useState("");const [novaConta,setNovaConta]=useState("");
  const [legado,setLegado]=useState<unknown[]|null>(null);const [maisLegado,setMaisLegado]=useState(false);
  const [encaminhar,setEncaminhar]=useState<Mensagem|null>(null),[destino,setDestino]=useState('');
  const forwardDialog=useRef<HTMLDialogElement>(null);
  useEffect(()=>{if(encaminhar&&!forwardDialog.current?.open)forwardDialog.current?.showModal();else if(!encaminhar)forwardDialog.current?.close();},[encaminhar]);
  const conversa=painel?.conversas.find(c=>c.id===selecionada)||thread?.conversa;
  const conta=painel?.contas.find(c=>c.id===conversa?.conta_id);
  const visiveis=useMemo(()=>filtrarConversas(painel?.conversas||[],filtros,usuarioId),[painel,filtros,usuarioId]);
  const following=reader.following!==false;
  const ultimaVisivel=thread?.mensagens.reduce<Mensagem|null>((last,m)=>!last||(m.ordem||0)>=(last.ordem||0)?m:last,null)?.id;
  useEffect(()=>{if(mudanca)setReader(previous=>aplicarMudanca(previous,mudanca));},[mudanca]);
  useEffect(()=>{const changed=()=>setVisivel(document.visibilityState==='visible');document.addEventListener('visibilitychange',changed);return()=>document.removeEventListener('visibilitychange',changed);},[]);
  useEffect(()=>{if(following&&messageList.current)messageList.current.scrollTop=messageList.current.scrollHeight;},[following,selecionada,thread?.mensagens]);
  useEffect(()=>{
    if(!following||!visivel||!selecionada||!ultimaVisivel||document.visibilityState!=='visible')return;
    void api('ler',{conversa_id:selecionada,ate_mensagem_id:ultimaVisivel}).then(()=>atualizar()).catch(()=>{});
  },[following,visivel,selecionada,ultimaVisivel,api,atualizar]);

  const carregarThread=useCallback(async(id:string,antes?:string)=>{
    try{
      const result=await api<Thread>("conversa",{conversa_id:id,...(antes?{antes}:{})});
      setReader(previous=>aplicarThread(previous,id,result,!!antes));
    }catch(error){setReader(previous=>previous.selected!==id?previous:{...previous,error:mensagemErro(error),loading:false});}
  },[api]);
  function setSelecionada(id:string|null){setReader({selected:id,thread:null,error:'',loading:!!id,following:true});}
  useEffect(()=>{
    if(!selecionada)return;
    let active=true;
    const timer=setTimeout(()=>{if(active)void carregarThread(selecionada);},0);
    return()=>{active=false;clearTimeout(timer);};
  },[selecionada,painel,reloadKey,carregarThread]);

  function abrir(c:Conversa){setSelecionada(c.id);setReloadKey(value=>value+1);setCitada(null);}
  async function despachar(contaId:string){
    if(painel?.contas.find(c=>c.id===contaId)?.provedor!=="meta")return;
    try{await fetch("/api/mensageria/dispatch",{method:"POST",headers:{"Content-Type":"application/json"},body:JSON.stringify({conta_id:contaId})});}catch{/* fila durável permanece pendente */}
  }
  async function comando(tipo:string,conteudo:Record<string,unknown>={},requestId=crypto.randomUUID()){
    if(!conta||!conversa)return;
    await executar("comando",{conta_id:conta.id,conversa_id:conversa.id,tipo,conteudo,request_id:requestId});
    await despachar(conta.id);await carregarThread(conversa.id);
  }
  async function acao(run:()=>Promise<unknown>){setBusy(true);setAcaoErro("");try{await run();}catch(e){setAcaoErro(mensagemErro(e));}finally{setBusy(false);}}
  async function enviar(conteudo:ConteudoEnvio,nota:boolean,requestId:string){
    if(!conversa||!conta)return;
    if(nota)await executar("nota",{conversa_id:conversa.id,texto:conteudo.texto,request_id:requestId});
    else await comando("send",conteudo as unknown as Record<string,unknown>,requestId);
    abrir(conversa);
  }
  async function novaConversa(e:React.FormEvent){e.preventDefault();await acao(async()=>{
    const raw=novoNumero.trim();const grupo=raw.endsWith("@g.us");
    const jid=raw.includes("@")?raw:raw.replace(/\D/g,"")+"@s.whatsapp.net";
    if(!/^[0-9]{8,15}@s\.whatsapp\.net$/.test(jid)&&!/^\d+(?:-\d+)?@g\.us$/.test(jid))throw new Error("Informe telefone com DDI ou o identificador do grupo.");
    const result=await executar<Conversa>("conversa_criar",{conta_id:novaConta||painel?.contas[0]?.id,jid,grupo});
    setNova(false);setNovoNumero("");abrir(result);
  });}
  async function verLegado(mais=false){await acao(async()=>{
    const result=await api<{mensagens?:unknown[];tem_mais?:boolean}|unknown[]>("legado",{...(mais&&legado?.length?{offset:legado.length}:{})});
    const items=Array.isArray(result)?result:result.mensagens||[];
    setLegado(prev=>mais?[...(prev||[]),...items]:items);setMaisLegado(!Array.isArray(result)&&result.tem_mais===true);
  });}

  return <div className="space-y-4">
    <dialog ref={forwardDialog} onClose={()=>setEncaminhar(null)} className="m-auto w-full max-w-md space-y-4 rounded-lg border border-borda bg-bg-elevada p-5 text-fg-1 backdrop:bg-black/40" aria-labelledby="encaminhar-titulo">
      <h2 id="encaminhar-titulo" className="font-semibold">Encaminhar mensagem</h2><p className="line-clamp-4 whitespace-pre-wrap text-sm text-fg-3">{encaminhar?.texto||encaminhar?.anexo?.nome||'Mensagem com mídia'}</p>
      <form className="space-y-3" onSubmit={event=>{event.preventDefault();if(!encaminhar||!destino)return;void acao(async()=>{await executar('comando',{conta_id:encaminhar.conta_id,conversa_id:destino,tipo:'send',conteudo:{tipo:encaminhar.tipo,texto:encaminhar.texto||'',anexo:encaminhar.anexo,encaminhada_id:encaminhar.id},request_id:crypto.randomUUID()});await despachar(encaminhar.conta_id);setEncaminhar(null);});}}>
        <label className="block text-sm">Conversa de destino<select required className={`${selectClass} mt-1 w-full`} value={destino} onChange={event=>setDestino(event.target.value)}><option value="">Selecione um contato ou grupo</option>{painel?.conversas.filter(c=>c.conta_id===encaminhar?.conta_id).map(c=><option key={c.id} value={c.id}>{c.nome||c.jid.split('@')[0]}{c.grupo?' · grupo':''}</option>)}</select></label>
        <p className="text-xs text-fg-3">A mensagem será enviada pelo mesmo número de origem.</p>{acaoErro&&<p role="alert" className="text-sm text-erro">{acaoErro}</p>}<div className="flex justify-end gap-2"><Button type="button" disabled={busy} onClick={()=>setEncaminhar(null)}>Cancelar</Button><Button variant="primary" type="submit" disabled={busy||!destino}>Encaminhar</Button></div>
      </form>
    </dialog>
    <header className="flex flex-wrap items-center justify-between gap-3"><div><h1 className="text-2xl font-semibold text-fg-1">Mensagens</h1><p className="mt-1 text-sm text-fg-3">Atendimento da equipe em todos os seus números.</p></div><div className="flex flex-wrap items-center gap-2"><Button type="button" size="sm" onClick={()=>void atualizar()}><RefreshCw size={15}/>Atualizar</Button>{podeGerir&&<Link href="/configuracoes/whatsapp" className="inline-flex h-8 items-center gap-2 rounded-md border border-borda bg-bg-elevada px-3 text-xs font-semibold"><Settings size={15}/>Números e equipe</Link>}</div></header>
    {erro&&<div role="alert" className="rounded-lg border border-erro bg-erro-suave p-4 text-sm text-erro">{erro}{painel&&<p className="mt-1">Exibindo a última consulta. As informações podem estar desatualizadas.</p>}</div>}
    {acaoErro&&<p role="alert" className="rounded-md bg-erro-suave p-3 text-sm text-erro">{acaoErro}</p>}
    {carregando&&!painel?<div role="status" className="rounded-lg border border-borda bg-bg-elevada p-8 text-sm text-fg-3">Carregando caixa de atendimento…</div>:painel&&<>
      {!painel.contas.length?<div className="space-y-3 rounded-lg border border-borda bg-bg-elevada p-8"><MessageSquare className="text-fg-3"/><h2 className="font-semibold">Nenhum número disponível</h2><p className="text-sm text-fg-3">Conecte um número ou peça ao dono para liberar seu acesso.</p>{podeGerir&&<Link href="/configuracoes/whatsapp" className="text-sm text-acento-texto underline">Configurar primeiro número</Link>}</div>:<div className="grid min-h-[620px] overflow-hidden rounded-lg border border-borda bg-bg-elevada lg:h-[calc(100dvh-12rem)] lg:grid-cols-[300px_minmax(0,1fr)] xl:grid-cols-[320px_minmax(0,1fr)_250px]">
        <aside className={`${selecionada?"hidden lg:flex":"flex"} min-h-0 flex-col border-r border-borda`} aria-label="Conversas">
          <div className="space-y-2 border-b border-borda p-3"><div className="flex items-center gap-2"><select aria-label="Filtrar por número" value={filtros.conta||""} onChange={e=>setFiltros(f=>({...f,conta:e.target.value}))} className={`${selectClass} w-full`}><option value="">Todos os números</option>{painel.contas.map(c=><option key={c.id} value={c.id}>{c.nome}</option>)}</select><Button type="button" size="sm" disabled={!podeEscrever} aria-label="Nova conversa" onClick={()=>setNova(!nova)}><Plus size={16}/></Button></div>
            <input type="search" aria-label="Buscar conversas" placeholder="Buscar nome, número ou mensagem" value={filtros.busca||""} onChange={e=>setFiltros(f=>({...f,busca:e.target.value}))} className="h-10 w-full rounded-md border border-borda bg-bg px-3 text-xs"/>
            <div className="grid grid-cols-2 gap-2"><select aria-label="Estado do atendimento" value={filtros.estado||""} onChange={e=>setFiltros(f=>({...f,estado:e.target.value}))} className={selectClass}><option value="">Todos os estados</option><option value="aberta">Abertas</option><option value="pendente">Pendentes</option><option value="resolvida">Resolvidas</option></select><select aria-label="Responsável" value={filtros.responsavel||""} onChange={e=>setFiltros(f=>({...f,responsavel:e.target.value}))} className={selectClass}><option value="">Toda a equipe</option><option value="minhas">Minhas</option><option value="sem">Sem responsável</option>{painel.usuarios.map(u=><option key={u.id} value={u.id}>{u.nome}</option>)}</select></div>
            <div className="flex gap-3 text-xs"><label className="flex items-center gap-1"><input type="checkbox" checked={!!filtros.naoLidas} onChange={e=>setFiltros(f=>({...f,naoLidas:e.target.checked}))}/>Não lidas</label><label className="flex items-center gap-1"><input type="checkbox" checked={filtros.grupos===true} onChange={e=>setFiltros(f=>({...f,grupos:e.target.checked?true:undefined}))}/>Grupos</label></div>
            {nova&&<form onSubmit={e=>void novaConversa(e)} className="space-y-2 rounded-md border border-borda bg-bg-sutil p-2"><select aria-label="Número para nova conversa" className={`${selectClass} w-full`} value={novaConta||painel.contas[0]?.id} onChange={e=>setNovaConta(e.target.value)}>{painel.contas.map(c=><option key={c.id} value={c.id}>{c.nome}</option>)}</select><input aria-label="Telefone ou grupo" required value={novoNumero} onChange={e=>setNovoNumero(e.target.value)} placeholder="Telefone com DDI ou ID do grupo" className="h-9 w-full rounded-md border border-borda bg-bg px-2 text-xs"/><Button size="sm" type="submit" disabled={busy}>Abrir conversa</Button></form>}
          </div>
          <div className="min-h-0 flex-1 overflow-y-auto">{visiveis.length?visiveis.map(c=><button type="button" key={c.id} onClick={()=>abrir(c)} aria-current={selecionada===c.id?"true":undefined} className={`w-full border-b border-borda-suave p-3 text-left hover:bg-bg-sutil ${selecionada===c.id?"bg-acento-suave":""}`}><div className="flex items-center justify-between gap-2"><span className="flex min-w-0 items-center gap-2 truncate text-sm font-semibold">{c.grupo&&<Users size={14}/>}<span className="truncate">{c.nome||c.jid.split("@")[0]}</span></span><time className="shrink-0 text-xs text-fg-3">{hora(c.ultima_em)}</time></div><div className="mt-1 flex items-center justify-between gap-2"><p className="truncate text-xs text-fg-3">{c.ultima_mensagem||"Sem mensagens"}</p>{c.nao_lidas>0&&<span className="rounded-full bg-acento px-1.5 py-0.5 text-xs text-fg-sobre-acento">{c.nao_lidas}</span>}</div><p className="mt-1 text-[11px] text-fg-3">{painel.contas.find(a=>a.id===c.conta_id)?.nome} · {estadoLegivel(c.estado)}</p></button>):<p className="p-6 text-sm text-fg-3">Nenhuma conversa com estes filtros.</p>}</div>
          <button type="button" onClick={()=>void verLegado()} className="border-t border-borda p-3 text-left text-xs text-fg-3 underline">Ver registros anteriores à caixa</button>
        </aside>
        <main className={`${!selecionada?"hidden lg:flex":"flex"} min-h-0 min-w-0 flex-col`} aria-label="Conversa selecionada">
          {!conversa||!conta?<div className="flex flex-1 flex-col items-center justify-center gap-3 p-8 text-center text-fg-3"><MessageSquare size={34}/><p className="text-sm">Selecione uma conversa para começar.</p></div>:<>
            <header className="flex flex-wrap items-center justify-between gap-3 border-b border-borda p-3"><div className="flex min-w-0 items-center gap-2"><button type="button" className="lg:hidden" aria-label="Voltar para conversas" onClick={()=>setSelecionada(null)}><ArrowLeft size={20}/></button><div className="min-w-0"><h2 className="truncate font-semibold">{conversa.nome||conversa.jid.split("@")[0]}</h2><p className="text-xs text-fg-3">{conta.nome} · {estadoLegivel(conta.estado)}</p></div></div><div className="flex flex-wrap gap-2"><Button type="button" size="sm" disabled={!podeEscrever||busy} onClick={()=>void acao(()=>executar("atendimento",{conversa_id:conversa.id,responsavel_id:usuarioId}))}>Assumir</Button><Button type="button" size="sm" disabled={!podeEscrever||busy} onClick={()=>void acao(()=>executar("atendimento",{conversa_id:conversa.id,estado:conversa.estado==="resolvida"?"aberta":"resolvida"}))}><Check size={14}/>{conversa.estado==="resolvida"?"Reabrir":"Resolver"}</Button></div></header>
            <div className="flex flex-wrap items-center gap-2 border-b border-borda bg-bg-sutil px-3 py-2 text-xs xl:hidden"><span>Responsável</span><select className={selectClass} aria-label="Transferir conversa" disabled={!podeEscrever||busy} value={conversa.responsavel_id||""} onChange={e=>void acao(()=>executar("atendimento",{conversa_id:conversa.id,responsavel_id:e.target.value||null}))}><option value="">Sem responsável</option>{painel.usuarios.filter(u=>conta.membros?.includes(u.id)||u.id===usuarioId).map(u=><option key={u.id} value={u.id}>{u.nome}</option>)}</select></div>
            <div ref={messageList} onScroll={event=>{const element=event.currentTarget;const follow=element.scrollHeight-element.scrollTop-element.clientHeight<80;setReader(previous=>previous.following===follow?previous:{...previous,following:follow});}} className="min-h-[240px] flex-1 space-y-3 overflow-y-auto bg-bg p-4" aria-label="Histórico de mensagens">
              {threadErro&&<p role="alert" className="text-sm text-erro">{threadErro}</p>}{threadLoading&&<p role="status" className="text-xs text-fg-3">Carregando mensagens…</p>}
              {thread?.tem_mais&&<Button size="sm" type="button" onClick={()=>{setReader(previous=>({...previous,following:false}));void carregarThread(conversa.id,thread.mensagens[0]?.id);}}><ChevronDown size={14}/>Carregar mensagens anteriores</Button>}
              {thread?.mensagens.map(m=><article key={m.id} style={{contentVisibility:"auto",containIntrinsicSize:"auto 96px"}} className={`max-w-[92%] space-y-2 rounded-lg border border-borda p-3 sm:max-w-[82%] ${m.direcao==="interna"||m.tipo==="nota"?"mx-auto bg-alerta-suave":m.direcao==="enviada"?"ml-auto bg-acento-suave":"mr-auto bg-bg-elevada"}`}>
                {m.participante&&<p className="text-xs font-medium text-fg-3">{m.participante.split("@")[0]}</p>}{(m.direcao==="interna"||m.tipo==="nota")&&<p className="text-xs font-semibold">Nota interna</p>}
                {m.citada_id&&<p className="border-l-2 border-borda pl-2 text-xs text-fg-3">Em resposta a uma mensagem</p>}
                {m.apagada?<p className="text-sm italic text-fg-3">Mensagem apagada</p>:<>{m.anexo&&<MessageAttachment anexo={m.anexo}/>}<p className="whitespace-pre-wrap break-words text-sm">{m.texto||(!m.anexo?`[${m.tipo}]`:"")}</p></>}
                <div className="flex flex-wrap items-center justify-end gap-2 text-[10px] text-fg-3"><time dateTime={m.criada_em}>{new Date(m.criada_em).toLocaleDateString("pt-BR")} {hora(m.criada_em)}</time>{m.editada&&<span>Editada</span>}<span>{estadoLegivel(m.estado)}</span></div>
                {podeEscrever&&m.provedor_id&&!m.apagada&&m.direcao!=="interna"&&m.tipo!=="nota"&&<details className="text-xs"><summary className="cursor-pointer text-fg-3">Ações</summary><div className="mt-2 flex flex-wrap gap-2">
                  {permiteAcao(conta.capacidades,"reply")&&<button type="button" className="underline" onClick={()=>setCitada(m)}>Responder</button>}
                  {permiteAcao(conta.capacidades,"reaction")&&["👍","❤️","🙏"].map(emoji=><button type="button" key={emoji} aria-label={`Reagir ${emoji}`} disabled={busy} onClick={()=>void acao(()=>comando("reaction",{mensagem_id:m.id,emoji}))}>{emoji}</button>)}
                  {permiteAcao(conta.capacidades,"forward")&&<button type="button" className="underline" onClick={()=>{setDestino('');setEncaminhar(m);}}>Encaminhar</button>}
                  {m.direcao==="enviada"&&permiteAcao(conta.capacidades,"edit")&&m.tipo==="text"&&<button type="button" className="underline" onClick={()=>{const value=window.prompt("Editar mensagem",m.texto||"");if(value?.trim())void acao(()=>comando("edit",{mensagem_id:m.id,texto:value}));}}>Editar</button>}
                  {m.direcao==="enviada"&&permiteAcao(conta.capacidades,"delete")&&<button type="button" className="text-erro underline" onClick={()=>{if(window.confirm("Apagar esta mensagem no WhatsApp?"))void acao(()=>comando("delete",{mensagem_id:m.id}));}}>Apagar</button>}
                </div></details>}
              </article>)}
              {!threadLoading&&thread?.mensagens.length===0&&<p className="p-6 text-center text-sm text-fg-3">Ainda não há mensagens registradas. O histórico depende do que o WhatsApp disponibilizar.</p>}
              {thread&&podeEscrever&&following&&<Drafts rascunhos={thread.rascunhos||[]} versao={conversa.versao} politica={conta.politica_versao} onDecidir={async(id,decisao,texto,feedback)=>{await executar("rascunho_decidir",{rascunho_id:id,decisao,texto,feedback,request_id:crypto.randomUUID()});await despachar(conta.id);await carregarThread(conversa.id);}}/>}
            </div>
            {conta.ia_modo!=="desligada"&&<div className="flex items-center justify-between gap-2 border-t border-borda bg-bg-sutil px-3 py-2 text-xs"><span>IA: {conta.ia_modo==="rascunho"?"aprovação antes do envio":"regras de autonomia"}</span><Button size="sm" type="button" disabled={!podeEscrever||busy||!permiteAcao(conta.capacidades,"draft")} onClick={()=>void acao(()=>comando("draft"))}><Bot size={14}/>Gerar rascunho</Button></div>}
            {!following&&<Button size="sm" onClick={()=>abrir(conversa)}>Voltar às últimas mensagens</Button>}
            <Composer key={conversa.id} conta={conta} conversaId={conversa.id} citada={citada} onCancelarCitacao={()=>setCitada(null)} onEnviar={enviar} disabled={!podeEscrever||!!erro}/>
          </>}
        </main>
        <aside className="hidden space-y-4 overflow-y-auto border-l border-borda p-4 xl:block" aria-label="Detalhes do atendimento">{conversa&&conta?<><h2 className="text-sm font-semibold">Atendimento</h2><label className="block space-y-1 text-xs"><span>Responsável</span><select className={`${selectClass} w-full`} value={conversa.responsavel_id||""} disabled={!podeEscrever||busy} onChange={e=>void acao(()=>executar("atendimento",{conversa_id:conversa.id,responsavel_id:e.target.value||null}))}><option value="">Sem responsável</option>{painel.usuarios.filter(u=>conta.membros?.includes(u.id)||u.id===usuarioId).map(u=><option key={u.id} value={u.id}>{u.nome}</option>)}</select></label><label className="block space-y-1 text-xs"><span>Estado</span><select className={`${selectClass} w-full`} disabled={!podeEscrever||busy} value={conversa.estado} onChange={e=>void acao(()=>executar("atendimento",{conversa_id:conversa.id,estado:e.target.value}))}><option value="aberta">Aberta</option><option value="pendente">Pendente</option><option value="resolvida">Resolvida</option></select></label><dl className="space-y-3 break-words text-xs"><div><dt className="text-fg-3">Número</dt><dd>{conta.nome}</dd></div><div><dt className="text-fg-3">Canal</dt><dd>{conta.provedor==="baileys"?"WhatsApp por QR code":"API oficial Meta"}</dd></div><div><dt className="text-fg-3">Contato</dt><dd>{conversa.jid}</dd></div><div><dt className="text-fg-3">Identificador da conversa</dt><dd className="select-all">{conversa.id}</dd></div></dl><p className="text-xs text-fg-3">A leitura desta caixa é individual. O recibo no WhatsApp é uma ação separada.</p>{permiteAcao(conta.capacidades,"read")&&<Button size="sm" disabled={!podeEscrever||busy} onClick={()=>void acao(()=>comando("read"))}>Enviar recibo de leitura</Button>}{permiteAcao(conta.capacidades,"history")&&<Button size="sm" disabled={!podeEscrever||busy} onClick={()=>void acao(()=>comando("history"))}>Sincronizar histórico disponível</Button>}{conta.erro&&<p role="status" className="text-xs text-alerta">{conta.erro}</p>}</>:<p className="text-xs text-fg-3">Os detalhes aparecerão ao selecionar uma conversa.</p>}</aside>
      </div>}
      {legado&&<section className="space-y-3 rounded-lg border border-borda bg-bg-elevada p-4"><div className="flex items-center justify-between"><h2 className="text-sm font-semibold">Registros anteriores à caixa</h2><Button size="sm" onClick={()=>setLegado(null)}>Fechar</Button></div><p className="text-xs text-fg-3">Registros sem número de origem comprovado não são associados automaticamente às contas atuais.</p>{legado.length?legado.map((item,i)=>{const row=item as Record<string,unknown>;return <div key={String(row.id||i)} className="border-t border-borda-suave py-2 text-xs"><p className="whitespace-pre-wrap break-words">{String(row.texto||"Mensagem sem texto")}</p><p className="mt-1 text-fg-3">{String(row.telefone||"")} · {estadoLegivel(String(row.status||""))}</p></div>;}):<p className="text-sm text-fg-3">Nenhum registro anterior.</p>}{maisLegado&&<Button size="sm" onClick={()=>void verLegado(true)}>Carregar mais</Button>}</section>}
    </>}
  </div>;
}
