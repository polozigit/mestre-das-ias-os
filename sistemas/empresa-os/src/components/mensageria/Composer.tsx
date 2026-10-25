"use client";

import { useRef, useState } from "react";
import { Paperclip, Send, Smile, X } from "lucide-react";
import { Button } from "@/components/ui/Button";
import { VoiceRecorder } from "./VoiceRecorder";
import { permiteAcao, tipoDoArquivo } from "@/lib/mensageria/modelo";
import {createClient} from '@/lib/supabase/client';
import type { Anexo, Conta, ConteudoEnvio, Mensagem } from "@/lib/mensageria/tipos";
import {camposTemplate,montarTemplate,templateDeTexto,type MetaTemplate} from '@/lib/mensageria/templates';

export function Composer({ conta, conversaId, citada, onCancelarCitacao, onEnviar, disabled }: { conta: Conta; conversaId: string; citada: Mensagem | null; onCancelarCitacao: () => void; onEnviar: (conteudo: ConteudoEnvio, nota: boolean, requestId: string) => Promise<void>; disabled: boolean }) {
  const [texto,setTexto]=useState(""); const [nota,setNota]=useState(false);
  const [arquivo,setArquivo]=useState<File|null>(null); const [voz,setVoz]=useState(false);
  const [figurinha,setFigurinha]=useState(false); const [emojis,setEmojis]=useState(false);
  const [ocupado,setOcupado]=useState(false); const [erro,setErro]=useState("");
  const [templates,setTemplates]=useState<MetaTemplate[]>([]),[template,setTemplate]=useState<MetaTemplate|null>(null),[templateValues,setTemplateValues]=useState<Record<string,string>>({});
  const requestId=useRef<string|null>(null); const enviadoConteudo=useRef<string|null>(null);
  const fileInput=useRef<HTMLInputElement>(null);
  const cachedAnexo=useRef<{file:File;anexo:Anexo}|null>(null);
  function escolher(file: File, voice=false) {cachedAnexo.current=null;requestId.current=null;enviadoConteudo.current=null;setArquivo(file);setVoz(voice);setFigurinha(false);setErro("");}
  const canSend = !disabled && (nota || permiteAcao(conta.capacidades,"send"));
  async function carregarTemplates(){setErro('');try{const response=await fetch(`/api/mensageria/templates?conta_id=${encodeURIComponent(conta.id)}`);const result=await response.json();if(!response.ok)throw new Error(result.error);setTemplates(result.templates||[]);if(!result.templates?.length)setErro('Nenhum template aprovado disponível.');}catch(error){setErro(error instanceof Error?error.message:'Templates indisponíveis.');}}
  async function enviar() {
    if ((!texto.trim()&&!arquivo&&!template)||ocupado) return;
    setOcupado(true);setErro("");
    const identidade=JSON.stringify([texto,nota,arquivo?.name,arquivo?.size,voz,figurinha,citada?.id,template?.name,template?.language,templateValues]);
    if (enviadoConteudo.current!==identidade) { requestId.current=crypto.randomUUID();enviadoConteudo.current=identidade; }
    try {
      if(template&&!nota){await onEnviar({tipo:'text',template:montarTemplate(template,templateValues)},false,requestId.current!);setTemplate(null);setTemplateValues({});requestId.current=null;enviadoConteudo.current=null;return;}
      let anexo;
      const tipo=voz?"voice":figurinha?"sticker":arquivo?tipoDoArquivo(arquivo.type):"text";
      if (!nota && !permiteAcao(conta.capacidades,tipo)) throw new Error("Este tipo de mensagem não está disponível neste número.");
      if (arquivo&&!nota) {
        if(cachedAnexo.current?.file===arquivo)anexo=cachedAnexo.current.anexo;
        else{
          const metadata={conta_id:conta.id,conversa_id:conversaId,nome:arquivo.name,mime:arquivo.type||'application/octet-stream',bytes:arquivo.size};
          const prepare=await fetch('/api/mensageria/media',{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify({...metadata,modo:'preparar'})});
          const allowed=await prepare.json();if(!prepare.ok)throw new Error(allowed.error||'Upload não autorizado.');
          if(typeof allowed.mime==='string')metadata.mime=allowed.mime;
          // Arquivo vai direto ao Storage, sem atravessar o limite de corpo da Vercel.
          const {error}=await createClient().storage.from('mensageria').uploadToSignedUrl(allowed.path,allowed.token,arquivo,{contentType:metadata.mime});
          if(error)throw new Error('Não foi possível transferir o arquivo. Confira tamanho e conexão.');
          const confirm=await fetch('/api/mensageria/media',{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify({...metadata,path:allowed.path,modo:'confirmar'})});
          const result=await confirm.json();if(!confirm.ok)throw new Error(result.error||'Arquivo não confirmado.');
          anexo=result as Anexo;cachedAnexo.current={file:arquivo,anexo};
        }
      }
      await onEnviar({tipo,texto:texto.trim(),...(anexo?{anexo}:{}),...(citada&&!nota?{citada_id:citada.id}:{})},nota,requestId.current!);
      setTexto("");setArquivo(null);setVoz(false);setFigurinha(false);cachedAnexo.current=null;requestId.current=null;enviadoConteudo.current=null;onCancelarCitacao();
    } catch(e) {setErro(e instanceof Error?e.message:"Não foi possível confirmar o envio. Consulte a conversa antes de tentar novamente.");}
    finally {setOcupado(false);}
  }
  return <section className="space-y-2 border-t border-borda bg-bg-elevada p-3" aria-label="Compor mensagem">
    {citada&&!nota&&<div className="flex items-center justify-between rounded-md border-l-2 border-acento bg-bg-sutil p-2 text-xs"><span className="truncate">Respondendo: {citada.texto||citada.anexo?.nome||citada.tipo}</span><button type="button" aria-label="Cancelar resposta citada" onClick={onCancelarCitacao}><X size={16}/></button></div>}
    <div className="flex gap-3 text-xs"><label className="flex items-center gap-2"><input type="checkbox" checked={nota} disabled={ocupado||disabled} onChange={e=>setNota(e.target.checked)}/>Nota interna</label>{nota&&<span className="text-fg-3">Visível somente para a equipe deste número.</span>}</div>
    <textarea aria-label={nota?"Escrever nota interna":"Escrever mensagem"} placeholder={nota?"Escreva uma nota para a equipe…":"Escreva uma mensagem…"} rows={3} value={texto} maxLength={10000} disabled={!canSend||ocupado} onChange={e=>setTexto(e.target.value)} className="w-full resize-y rounded-md border border-borda bg-bg px-3 py-2 text-sm text-fg-1 placeholder:text-fg-3 focus:outline-acento"/>
    {arquivo&&!nota&&<div className="flex items-center justify-between gap-2 rounded-md bg-bg-sutil p-2 text-xs"><span className="truncate">{voz?"Mensagem de voz: ":""}{arquivo.name} · {(arquivo.size/1024/1024).toFixed(1)} MB</span><button type="button" aria-label="Remover anexo" onClick={()=>{setArquivo(null);setVoz(false);setFigurinha(false);}}><X size={16}/></button>{arquivo.type==="image/webp"&&permiteAcao(conta.capacidades,"sticker")&&<label className="flex shrink-0 gap-1"><input type="checkbox" checked={figurinha} onChange={e=>setFigurinha(e.target.checked)}/>Figurinha</label>}</div>}
    {emojis&&<div className="flex flex-wrap gap-1 rounded-md border border-borda p-2" aria-label="Selecionar emoji">{["😀","😊","👍","🙏","❤️","✅","🎉","👋","🤝","📎","📍","⏰"].map(emoji=><button type="button" key={emoji} className="rounded-md p-2 text-lg hover:bg-bg-sutil" aria-label={`Adicionar ${emoji}`} onClick={()=>{setTexto(t=>t+emoji);setEmojis(false);}}>{emoji}</button>)}</div>}
    <div className="flex flex-wrap items-center justify-between gap-2">
      <div className="flex flex-wrap items-center gap-1">
        <Button type="button" variant="ghost" size="sm" disabled={!canSend||ocupado} onClick={()=>setEmojis(!emojis)} aria-label="Selecionar emoji"><Smile size={16}/></Button>
        {!nota&&<><input ref={fileInput} type="file" className="hidden" aria-label="Escolher arquivo" onChange={e=>{if(e.target.files?.[0])escolher(e.target.files[0]);e.target.value="";}}/>
          <Button type="button" variant="ghost" size="sm" disabled={!canSend||ocupado} onClick={()=>fileInput.current?.click()}><Paperclip size={16}/>Anexar</Button>
          {permiteAcao(conta.capacidades,"voice")&&<VoiceRecorder disabled={!canSend||ocupado} onEscolher={file=>escolher(file,true)}/>}</>}
      </div>
      <Button type="button" variant="primary" disabled={!canSend||ocupado||(!texto.trim()&&!arquivo&&!template)} onClick={()=>void enviar()}><Send size={16}/>{ocupado?"Registrando…":nota?"Salvar nota":"Enviar"}</Button>
    </div>
    {conta.provedor==="meta"&&!nota&&<div className="space-y-2"><p className="text-xs text-fg-3">Fora da janela de atendimento, use um template aprovado pela Meta.</p><Button size="sm" type="button" disabled={!canSend||ocupado} onClick={()=>void carregarTemplates()}>Carregar templates aprovados</Button>{templates.length>0&&<select aria-label="Template aprovado" className="w-full rounded-md border border-borda bg-bg px-2 py-2 text-sm" value={template?`${template.name}:${template.language}`:''} onChange={event=>{setTemplate(templates.find(t=>`${t.name}:${t.language}`===event.target.value)||null);setTemplateValues({});}}><option value="">Mensagem livre</option>{templates.map(t=><option key={`${t.name}:${t.language}`} disabled={!templateDeTexto(t)} value={`${t.name}:${t.language}`}>{t.name} · {t.language}{!templateDeTexto(t)?' · exige composição específica':''}</option>)}</select>}{template&&<div className="space-y-2 rounded-md border border-borda p-3"><p className="whitespace-pre-wrap text-xs text-fg-3">{template.components.find(c=>c.type==='BODY')?.text}</p>{camposTemplate(template).map(field=><label key={field.id} className="block text-xs">Variável {field.nome}<input className="mt-1 w-full rounded-md border border-borda bg-bg px-2 py-2" value={templateValues[field.id]||''} maxLength={4096} onChange={event=>setTemplateValues(values=>({...values,[field.id]:event.target.value}))}/></label>)}</div>}</div>}
    {erro&&<p role="alert" className="text-sm text-erro">{erro}</p>}
  </section>;
}
