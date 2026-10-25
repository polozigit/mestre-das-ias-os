"use client";
import Link from 'next/link';
import Image from 'next/image';
import {useEffect,useState} from 'react';
import {Button} from '@/components/ui/Button';
import {useMensageria} from '@/lib/mensageria/useMensageria';
import {estadoLegivel,mensagemErro} from '@/lib/mensageria/modelo';
import type {Conta} from '@/lib/mensageria/tipos';
import {estadoQR,type PedidoQR} from '@/lib/mensageria/qr-state';
import {AISetupGuide} from './AISetupGuide';

const input='w-full rounded-md border border-borda bg-bg px-3 py-2 text-sm text-fg-1';
export function AccountSettings({dono}:{dono:boolean}){
 const {painel,erro,carregando,atualizar,executar}=useMensageria();
 const [busy,setBusy]=useState(false),[notice,setNotice]=useState(''),[failure,setFailure]=useState('');
 const [token,setToken]=useState<{id:string;token:string}|null>(null);
 async function action(work:()=>Promise<unknown>){setBusy(true);setFailure('');setNotice('');try{await work();setNotice('Alteração registrada.');}catch(error){setFailure(mensagemErro(error));}finally{setBusy(false);}}
 async function createAccount(event:React.FormEvent<HTMLFormElement>){event.preventDefault();const form=event.currentTarget,values=new FormData(form);await action(async()=>{
  await executar('conta_salvar',{nome:values.get('nome'),provedor:values.get('provedor'),instalacao_id:values.get('instalacao_id')||null});form.reset();
 });}
 return <div className="space-y-5"><header className="flex flex-wrap items-center justify-between gap-3"><div><h1 className="text-2xl font-semibold">Números do WhatsApp</h1><p className="mt-1 text-sm text-fg-3">Conexões e acesso da equipe por número.</p></div><Link href="/mensagens" className="text-sm underline">Abrir mensagens</Link></header>
  {erro&&<p role="alert" className="rounded-md bg-erro-suave p-3 text-sm text-erro">{erro}</p>}{failure&&<p role="alert" className="rounded-md bg-erro-suave p-3 text-sm text-erro">{failure}</p>}{notice&&<p role="status" className="text-sm text-fg-2">{notice}</p>}
  {carregando&&!painel&&<p role="status">Carregando conexões…</p>}
  {painel&&<><section className="space-y-3 rounded-lg border border-borda bg-bg-elevada p-4"><h2 className="font-semibold">Conector no computador ou servidor</h2><p className="text-sm text-fg-3">Crie uma instalação e configure o pacote WhatsApp da empresa. O computador deve permanecer ligado para os números por QR code.</p>
   <form className="flex flex-wrap gap-2" onSubmit={event=>{event.preventDefault();const form=event.currentTarget;const nome=String(new FormData(form).get('nome')||'');void action(async()=>{const result=await executar<{id:string;token:string}>('instalacao_criar',{nome});setToken(result);form.reset();});}}><input className={`${input} max-w-sm`} name="nome" placeholder="Ex.: Computador do atendimento" aria-label="Nome da instalação" required maxLength={120}/><Button disabled={busy} type="submit">Criar instalação</Button></form>
   {token&&<div className="space-y-2 rounded-md border border-alerta bg-alerta-suave p-3 text-sm"><p>Guarde este token na configuração privada do conector. Ele será mostrado somente agora.</p><p className="text-xs">Instalação: {token.id}</p><textarea readOnly aria-label="Token da instalação" className={input} value={token.token}/><Button size="sm" onClick={()=>setToken(null)}>Já guardei</Button></div>}
   {painel.instalacoes.map(item=><p className="text-xs text-fg-3" key={item.id}>{item.nome} · {item.ultima_em?`Último contato: ${new Date(item.ultima_em).toLocaleString('pt-BR')}`:'Ainda não conectou'}</p>)}
  </section><section className="space-y-3 rounded-lg border border-borda bg-bg-elevada p-4"><h2 className="font-semibold">Adicionar número</h2><form onSubmit={event=>void createAccount(event)} className="grid gap-3 md:grid-cols-4"><input name="nome" className={input} required maxLength={120} placeholder="Nome do número" aria-label="Nome do número"/><select name="provedor" className={input} aria-label="Tipo de conexão"><option value="baileys">Não oficial, QR Code</option><option value="meta">API oficial Meta</option></select><select name="instalacao_id" className={input} aria-label="Instalação do número"><option value="">Escolher instalação</option>{painel.instalacoes.map(item=><option key={item.id} value={item.id}>{item.nome}</option>)}</select><Button variant="primary" disabled={busy} type="submit">Adicionar número</Button></form></section>
  {painel.contas.map(conta=><Account key={conta.id} conta={conta} dono={dono} usuarios={painel.usuarios} busy={busy} action={action} executar={executar} atualizar={atualizar}/>)}
  </>}
 </div>;
}
type Execute=<T,>(operation:string,data?:Record<string,unknown>)=>Promise<T>;
function Account({conta,dono,usuarios,busy,action,executar,atualizar}:{conta:Conta;dono:boolean;usuarios:{id:string;nome:string}[];busy:boolean;action:(work:()=>Promise<unknown>)=>Promise<void>;executar:Execute;atualizar:()=>Promise<void>}){
 const [members,setMembers]=useState(conta.membros||[]);
 const [pedidoQR,setPedidoQR]=useState<PedidoQR|null>(null),[agora,setAgora]=useState(0);
 const faseQR=estadoQR(conta,pedidoQR,agora),preparandoQR=faseQR==='preparando';
 useEffect(()=>{if(!preparandoQR||!pedidoQR)return;const timer=setInterval(()=>setAgora(Date.now()),1000);return()=>clearInterval(timer);},[preparandoQR,pedidoQR]);
 useEffect(()=>{if(!pedidoQR||!['qr','conectada','falha'].includes(faseQR))return;const timer=setTimeout(()=>setPedidoQR(null),0);return()=>clearTimeout(timer);},[faseQR,pedidoQR]);
 async function conectar(){const inicio=Date.now();setAgora(inicio);setPedidoQR({inicio,erroInicial:conta.erro});await action(async()=>{try{await command('pair');}catch(error){setPedidoQR(null);throw error;}});}
 async function command(tipo:string){await executar('comando',{conta_id:conta.id,tipo,conteudo:{},request_id:crypto.randomUUID()});}
 async function meta(event:React.FormEvent<HTMLFormElement>){event.preventDefault();const form=event.currentTarget,values=Object.fromEntries(new FormData(form));await action(async()=>{
  const response=await fetch('/api/mensageria/meta',{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify({...values,conta_id:conta.id})});const result=await response.json();if(!response.ok)throw new Error(result.error||'Meta não confirmou a conexão.');form.reset();await atualizar();if(result.warning)throw new Error(result.warning);
 });}
 return <section className="space-y-4 rounded-lg border border-borda bg-bg-elevada p-4"><div className="flex flex-wrap items-center justify-between gap-3"><div><h2 className="font-semibold">{conta.nome}</h2><p className="text-xs text-fg-3">{conta.provedor==='baileys'?'Não oficial, QR Code':'API oficial Meta'} · {estadoLegivel(conta.estado)} {conta.telefone&&`· ${conta.telefone}`}</p></div>{conta.provedor==='baileys'&&<div className="flex gap-2"><Button size="sm" disabled={busy||preparandoQR||!conta.instalacao_id} aria-busy={preparandoQR} onClick={()=>void conectar()}>{preparandoQR?'Preparando QR Code…':'Conectar ou mostrar QR'}</Button><Button size="sm" disabled={busy} onClick={()=>{if(window.confirm('Desconectar este número?'))void action(()=>command('logout'));}}>Desconectar</Button></div>}</div>
  {conta.provedor==='baileys'&&preparandoQR&&<div role="status" aria-live="polite" className="flex items-center gap-3 rounded-md border border-borda bg-bg-sutil p-4 text-sm"><span aria-hidden="true" className="h-5 w-5 shrink-0 rounded-full border-2 border-acento border-r-transparent motion-safe:animate-spin"/><div><p className="font-medium">Preparando QR Code…</p><p className="mt-1 text-xs text-fg-3">Aguarde alguns segundos. O código aparecerá aqui assim que estiver pronto.</p></div></div>}
  {conta.provedor==='baileys'&&faseQR==='demorado'&&<p role="status" className="rounded-md border border-borda bg-bg-sutil p-3 text-sm text-fg-3">O QR Code ainda não ficou pronto. Confira se o computador ou servidor do conector está ligado e com internet, e tente novamente.</p>}
  {conta.erro&&<p role="status" className="text-sm text-alerta">{conta.erro}</p>}{conta.qr&&conta.provedor==='baileys'&&conta.qr.startsWith('data:image/png;base64,')&&<figure className="space-y-2"><Image unoptimized src={conta.qr} width={240} height={240} alt={`QR code para conectar ${conta.nome}`} className="rounded-md bg-white p-2"/><figcaption className="text-xs text-fg-3">No WhatsApp do celular, abra Aparelhos conectados e leia este código. Ele expira automaticamente.</figcaption></figure>}
  {conta.provedor==='meta'&&<details><summary className="cursor-pointer text-sm font-semibold">Configurar credenciais oficiais</summary><p className="my-2 text-xs text-fg-3">Valores serão guardados no Vault do Supabase. Webhook: URL do seu Supabase + /functions/v1/mensageria.</p><form onSubmit={event=>void meta(event)} className="grid gap-2 md:grid-cols-2">{[['phone_id','ID do número'],['waba_id','ID da conta empresarial'],['graph_version','Versão Graph, ex.: v24.0'],['access_token','Token de acesso'],['app_secret','Segredo do aplicativo'],['verify_token','Token de verificação do webhook']].map(([name,label])=><label key={name} className="space-y-1 text-xs"><span>{label}</span><input name={name} className={input} required type={name.includes('token')||name==='app_secret'?'password':'text'} autoComplete="off" defaultValue={name==='graph_version'?'v24.0':undefined}/></label>)}<Button disabled={busy} type="submit">Validar e guardar no Vault</Button></form></details>}
  <details><summary className="cursor-pointer text-sm font-semibold">Atendentes deste número</summary><div className="my-3 grid gap-2 sm:grid-cols-2">{usuarios.map(usuario=><label className="flex gap-2 text-sm" key={usuario.id}><input type="checkbox" checked={members.includes(usuario.id)} onChange={event=>setMembers(list=>event.target.checked?[...list,usuario.id]:list.filter(id=>id!==usuario.id))}/>{usuario.nome}</label>)}</div><Button size="sm" disabled={busy} onClick={()=>void action(()=>executar('membros',{conta_id:conta.id,usuarios:members}))}>Salvar acesso</Button></details>
  {dono&&<AISetupGuide modo={conta.ia_modo} ocupado={busy} onDesligar={()=>action(()=>executar('ia_configurar',{conta_id:conta.id,modo:'desligada',instrucoes:conta.instrucoes||'',regras:conta.regras||[]}))}/>}
 </section>;
}
