"use client";
import Link from 'next/link';
import Image from 'next/image';
import {useEffect,useState} from 'react';
import {Button} from '@/components/ui/Button';
import {useMensageria} from '@/lib/mensageria/useMensageria';
import {estadoLegivel,mensagemErro} from '@/lib/mensageria/modelo';
import type {Conta} from '@/lib/mensageria/tipos';
import {estadoQR,type PedidoQR} from '@/lib/mensageria/qr-state';
import {AVISO_TELEFONE,mascararTelefone,telefoneCompleto} from '@/lib/mensageria/telefone';
import {AISetupGuide} from './AISetupGuide';
import {GuiaCodexDialog} from './GuiaCodexDialog';
import {createClient} from '@/lib/supabase/client';
import {COMANDO_API_OFICIAL,COMANDO_LIGAR_COMPUTADOR,computadorLigado,computadorPadrao,type Instalacao} from '@/lib/mensageria/guias';

const input='w-full rounded-md border border-borda bg-bg px-3 py-2 text-sm text-fg-1';
type Guia='computador'|'meta'|null;
// Mesma ponte do useMensageria: as RPCs da mensageria não estão nos tipos gerados do banco.
type RpcSolta=(nome:string,parametros:Record<string,unknown>)=>PromiseLike<{error:{message:string}|null}>;

const GUIAS={
 computador:{titulo:'Ligar o computador do WhatsApp',intro:'Números de QR Code passam por um computador da empresa que fica ligado. Normalmente ele já fica pronto na instalação da Casa. Use este passo para ligar outro computador ou religar este: a sua IA faz tudo, você não copia código nenhum.',
  passos:['Abra o Codex na pasta da sua empresa, no computador que vai ficar ligado.','Copie o comando abaixo e cole no Codex.','Quando o Codex avisar que terminou, volte aqui e clique em "Conectar ou mostrar QR".'],comando:COMANDO_LIGAR_COMPUTADOR},
 meta:{titulo:'API oficial da Meta, com a sua IA',intro:'A API oficial não precisa de computador ligado, mas pede conta empresarial na Meta, um número livre e alguns cadastros. O Codex te guia em cada etapa.',
  passos:['Abra o Codex na pasta da sua empresa.','Copie o comando abaixo e cole no Codex. Ele vai te guiar um passo por vez.','Quando chegar a hora, preencha aqui em "Configurar credenciais oficiais", no número que você adicionar.'],comando:COMANDO_API_OFICIAL},
} as const;

export function AccountSettings({dono}:{dono:boolean}){
 const {painel,erro,carregando,atualizar,executar}=useMensageria();
 const [busy,setBusy]=useState(false),[notice,setNotice]=useState(''),[failure,setFailure]=useState('');
 const [telefone,setTelefone]=useState('');
 const [guia,setGuia]=useState<Guia>(null);
 async function action(work:()=>Promise<unknown>){setBusy(true);setFailure('');setNotice('');try{await work();setNotice('Alteração registrada.');}catch(error){setFailure(mensagemErro(error));}finally{setBusy(false);}}
 async function createAccount(event:React.FormEvent<HTMLFormElement>){event.preventDefault();const form=event.currentTarget,values=new FormData(form);await action(async()=>{
  const numero=telefoneCompleto(telefone);if(!numero)throw new Error(AVISO_TELEFONE);
  const provedor=values.get('provedor');
  // QR Code entra no computador que falou por último (ligado na instalação da Casa, `mensageria:preparar`).
  const instalacao_id=provedor==='baileys'?computadorPadrao(painel?.instalacoes??[]):null;
  await executar('conta_salvar',{nome:values.get('nome'),telefone:numero,provedor,instalacao_id});form.reset();setTelefone('');
 });}
 const temQR=!!painel?.contas.some(c=>c.provedor==='baileys');
 return <div className="space-y-5"><header className="flex flex-wrap items-center justify-between gap-3"><div><h1 className="text-2xl font-semibold">Números do WhatsApp</h1><p className="mt-1 text-sm text-fg-3">Conexões e acesso da equipe por número.</p></div><Link href="/mensagens" className="text-sm underline">Abrir mensagens</Link></header>
  {erro&&<p role="alert" className="rounded-md bg-erro-suave p-3 text-sm text-erro">{erro}</p>}{failure&&<p role="alert" className="rounded-md bg-erro-suave p-3 text-sm text-erro">{failure}</p>}{notice&&<p role="status" className="text-sm text-fg-2">{notice}</p>}
  {carregando&&!painel&&<p role="status">Carregando conexões…</p>}
  {painel&&<><section className="space-y-3 rounded-lg border border-borda bg-bg-elevada p-4"><h2 className="font-semibold">Adicionar número</h2>
   <form onSubmit={event=>void createAccount(event)} className="grid gap-3 md:grid-cols-4"><input name="nome" className={input} required maxLength={120} placeholder="Nome do número" aria-label="Nome do número"/><input name="telefone" className={input} required type="tel" inputMode="tel" autoComplete="off" placeholder="(11) 91234-5678" aria-label="Número com DDD" title={AVISO_TELEFONE} value={telefone} onChange={event=>setTelefone(mascararTelefone(event.target.value))}/><select name="provedor" className={input} aria-label="Tipo de conexão" onChange={event=>{if(event.target.value==='meta')setGuia('meta');}}><option value="baileys">QR Code</option><option value="meta">API oficial da Meta</option></select><Button variant="primary" disabled={busy} type="submit">Adicionar número</Button></form>
   <p className="text-xs text-fg-3">QR Code: você lê um código com o celular, como no WhatsApp Web, e um computador da empresa fica ligado. API oficial: cadastro na Meta, sem computador ligado. <button type="button" className="underline" onClick={()=>setGuia('meta')}>Como funciona a API oficial</button></p>
  </section>
  {(temQR||painel.instalacoes.length>0)&&<Computadores instalacoes={painel.instalacoes} busy={busy} onLigar={()=>setGuia('computador')} onRemover={item=>{if(window.confirm(`Remover o computador "${item.nome}"? Ele para de segurar os números de QR Code na hora. Para usar de novo, é só ligar outra vez.`))void action(async()=>{const cliente=createClient();const rpc=cliente.rpc.bind(cliente) as unknown as RpcSolta;const {error}=await rpc('mensageria_remover_computador',{p_id:item.id});if(error)throw new Error(error.message);await atualizar();});}}/>}
  {painel.contas.map(conta=><Account key={conta.id} conta={conta} dono={dono} usuarios={painel.usuarios} instalacoes={painel.instalacoes} busy={busy} action={action} executar={executar} atualizar={atualizar} onGuia={setGuia}/>)}
  </>}
  {guia&&<GuiaCodexDialog aberto titulo={GUIAS[guia].titulo} intro={GUIAS[guia].intro} passos={[...GUIAS[guia].passos]} comando={GUIAS[guia].comando} onFechar={()=>setGuia(null)}/>}
 </div>;
}

/** Só leitura: qual computador segura os números de QR Code e se ele está ligado. Ligar é com a IA. */
function Computadores({instalacoes,busy,onLigar,onRemover}:{instalacoes:Instalacao[];busy:boolean;onLigar:()=>void;onRemover:(item:Instalacao)=>void}){
 const [agora,setAgora]=useState(()=>Date.now());
 useEffect(()=>{const timer=setInterval(()=>setAgora(Date.now()),30_000);return()=>clearInterval(timer);},[]);
 return <section className="space-y-3 rounded-lg border border-borda bg-bg-elevada p-4"><div className="flex flex-wrap items-center justify-between gap-3"><div><h2 className="font-semibold">Computador do WhatsApp</h2><p className="mt-1 text-sm text-fg-3">Os números de QR Code funcionam enquanto este computador estiver ligado.</p></div><Button size="sm" onClick={onLigar}>{instalacoes.length?'Ligar outro computador':'Ligar o computador'}</Button></div>
  {instalacoes.length===0?<p className="rounded-md border border-borda bg-bg-sutil p-3 text-sm">Nenhum computador ligado. Ele fica ligado na instalação da Casa; se não ficou, clique em <strong>Ligar o computador</strong> e a sua IA prepara tudo.</p>:
   <ul className="divide-y divide-borda-suave">{instalacoes.map(item=>{const ligado=computadorLigado(item,agora);return <li key={item.id} className="flex flex-wrap items-center justify-between gap-x-3 gap-y-1 py-2 text-sm"><span className="font-medium">{item.nome}</span><span className="ml-auto flex items-center gap-3"><span className={ligado?'text-ok':'text-fg-3'}>{ligado?'Ligado':item.ultima_em?`Desligado · último contato ${new Date(item.ultima_em).toLocaleString('pt-BR')}`:'Ainda não conectou'}</span><Button size="sm" disabled={busy} onClick={()=>onRemover(item)} aria-label={`Remover o computador ${item.nome}`}>Remover</Button></span></li>;})}</ul>}
 </section>;
}
type Execute=<T,>(operation:string,data?:Record<string,unknown>)=>Promise<T>;
function Account({conta,dono,usuarios,instalacoes,busy,action,executar,atualizar,onGuia}:{conta:Conta;dono:boolean;usuarios:{id:string;nome:string}[];instalacoes:Instalacao[];busy:boolean;action:(work:()=>Promise<unknown>)=>Promise<void>;executar:Execute;atualizar:()=>Promise<void>;onGuia:(g:Guia)=>void}){
 const computador=instalacoes.find(i=>i.id===conta.instalacao_id);
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
 return <section className="space-y-4 rounded-lg border border-borda bg-bg-elevada p-4"><div className="flex flex-wrap items-center justify-between gap-3"><div><h2 className="font-semibold">{conta.nome}</h2><p className="text-xs text-fg-3">{conta.provedor==='baileys'?'QR Code':'API oficial da Meta'} · {estadoLegivel(conta.estado)} {conta.telefone&&`· ${conta.telefone}`}{computador&&` · no computador ${computador.nome}`}</p></div>{conta.provedor==='baileys'&&!conta.instalacao_id&&<Button size="sm" onClick={()=>onGuia('computador')}>Ligar o computador</Button>}{conta.provedor==='baileys'&&conta.instalacao_id&&<div className="flex gap-2"><Button size="sm" disabled={busy||preparandoQR||!conta.instalacao_id} aria-busy={preparandoQR} onClick={()=>void conectar()}>{preparandoQR?'Preparando QR Code…':'Conectar ou mostrar QR'}</Button><Button size="sm" disabled={busy} onClick={()=>{if(window.confirm('Desconectar este número?'))void action(()=>command('logout'));}}>Desconectar</Button></div>}</div>
  {conta.provedor==='baileys'&&preparandoQR&&<div role="status" aria-live="polite" className="flex items-center gap-3 rounded-md border border-borda bg-bg-sutil p-4 text-sm"><span aria-hidden="true" className="h-5 w-5 shrink-0 rounded-full border-2 border-acento border-r-transparent motion-safe:animate-spin"/><div><p className="font-medium">Preparando QR Code…</p><p className="mt-1 text-xs text-fg-3">Aguarde alguns segundos. O código aparecerá aqui assim que estiver pronto.</p></div></div>}
  {conta.provedor==='baileys'&&faseQR==='demorado'&&<p role="status" className="rounded-md border border-borda bg-bg-sutil p-3 text-sm text-fg-3">O QR Code ainda não ficou pronto. Confira se o computador ou servidor do conector está ligado e com internet, e tente novamente.</p>}
  {conta.erro&&<p role="status" className="text-sm text-alerta">{conta.erro}</p>}{conta.qr&&conta.provedor==='baileys'&&conta.qr.startsWith('data:image/png;base64,')&&<figure className="space-y-2"><Image unoptimized src={conta.qr} width={240} height={240} alt={`QR code para conectar ${conta.nome}`} className="rounded-md bg-white p-2"/><figcaption className="text-xs text-fg-3">No WhatsApp do celular, abra Aparelhos conectados e leia este código. Ele expira automaticamente.</figcaption></figure>}
  {conta.provedor==='baileys'&&!conta.instalacao_id&&<p role="status" className="rounded-md border border-borda bg-bg-sutil p-3 text-sm text-fg-2">Este número ainda não tem computador. Ele vem ligado da instalação da Casa; se faltar, use <strong>Ligar o computador</strong> acima. Depois disso aparece o botão do QR Code.</p>}
  {conta.provedor==='meta'&&<details><summary className="cursor-pointer text-sm font-semibold">Configurar credenciais oficiais</summary><p className="my-2 text-xs text-fg-3">Os valores vêm do seu app na Meta e ficam guardados no cofre do Supabase. Não sabe onde achar? <button type="button" className="underline" onClick={()=>onGuia('meta')}>Passo a passo com o Codex</button></p><form onSubmit={event=>void meta(event)} className="grid gap-2 md:grid-cols-2">{[['phone_id','ID do número'],['waba_id','ID da conta empresarial'],['graph_version','Versão Graph, ex.: v24.0'],['access_token','Token de acesso'],['app_secret','Segredo do aplicativo'],['verify_token','Token de verificação do webhook']].map(([name,label])=><label key={name} className="space-y-1 text-xs"><span>{label}</span><input name={name} className={input} required type={name.includes('token')||name==='app_secret'?'password':'text'} autoComplete="off" defaultValue={name==='graph_version'?'v24.0':undefined}/></label>)}<Button disabled={busy} type="submit">Validar e guardar no Vault</Button></form></details>}
  <details><summary className="cursor-pointer text-sm font-semibold">Atendentes deste número</summary><div className="my-3 grid gap-2 sm:grid-cols-2">{usuarios.map(usuario=><label className="flex gap-2 text-sm" key={usuario.id}><input type="checkbox" checked={members.includes(usuario.id)} onChange={event=>setMembers(list=>event.target.checked?[...list,usuario.id]:list.filter(id=>id!==usuario.id))}/>{usuario.nome}</label>)}</div><Button size="sm" disabled={busy} onClick={()=>void action(()=>executar('membros',{conta_id:conta.id,usuarios:members}))}>Salvar acesso</Button></details>
  {dono&&<AISetupGuide modo={conta.ia_modo} ocupado={busy} onDesligar={()=>action(()=>executar('ia_configurar',{conta_id:conta.id,modo:'desligada',instrucoes:conta.instrucoes||'',regras:conta.regras||[]}))}/>}
 </section>;
}
