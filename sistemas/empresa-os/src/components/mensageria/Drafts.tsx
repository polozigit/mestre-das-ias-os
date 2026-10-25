"use client";

import { useState } from "react";
import { Button } from "@/components/ui/Button";
import { rascunhoValido } from "@/lib/mensageria/modelo";
import type { Rascunho } from "@/lib/mensageria/tipos";

function Draft({ rascunho, versao, politica, onDecidir }: { rascunho: Rascunho; versao:number; politica:number; onDecidir:(id:string,decisao:string,texto:string,feedback:string)=>Promise<void> }) {
  const [texto,setTexto]=useState(rascunho.texto);const [feedback,setFeedback]=useState("");const [busy,setBusy]=useState(false);const [erro,setErro]=useState("");
  const valido=rascunhoValido(rascunho,versao,politica);
  async function decidir(decisao:string) {
    setErro("");
    if(decisao==="reprovar"&&!feedback.trim()){setErro("Informe o que a IA deve melhorar.");return;}
    setBusy(true);
    try{await onDecidir(rascunho.id,decisao,texto,feedback);}catch(e){setErro(e instanceof Error?e.message:"Não foi possível registrar a decisão.");}finally{setBusy(false);}
  }
  return <article className="space-y-2 rounded-lg border border-borda bg-bg-elevada p-3">
    <div className="flex items-center justify-between gap-2 text-xs"><strong>Rascunho da IA</strong><span className="text-fg-3">Instruções v{rascunho.politica_versao}</span></div>
    {!valido&&<p className="text-xs text-alerta">O contexto mudou ou este rascunho já foi decidido. Gere um novo antes de enviar.</p>}
    <textarea aria-label="Editar rascunho da IA" value={texto} disabled={!valido||busy} onChange={e=>setTexto(e.target.value)} rows={4} className="w-full rounded-md border border-borda bg-bg px-2 py-2 text-sm"/>
    <textarea aria-label="Feedback para a IA" placeholder="O que melhorar? O feedback ficará salvo para revisão." value={feedback} onChange={e=>setFeedback(e.target.value)} rows={2} disabled={!valido||busy} className="w-full rounded-md border border-borda bg-bg px-2 py-2 text-xs"/>
    <div className="flex flex-wrap gap-2"><Button type="button" variant="primary" size="sm" disabled={!valido||busy||!texto.trim()} onClick={()=>void decidir("aprovar")}>Aprovar e enviar</Button><Button type="button" size="sm" disabled={!valido||busy} onClick={()=>void decidir("reprovar")}>Reprovar com feedback</Button></div>
    {erro&&<p role="alert" className="text-xs text-erro">{erro}</p>}
  </article>;
}
export function Drafts({ rascunhos, versao, politica, onDecidir }: {rascunhos:Rascunho[];versao:number;politica:number;onDecidir:(id:string,decisao:string,texto:string,feedback:string)=>Promise<void>}) {
  return <div className="space-y-3">{rascunhos.map(r=><Draft key={r.id} rascunho={r} versao={versao} politica={politica} onDecidir={onDecidir}/>)}</div>;
}
