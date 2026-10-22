"use client";

import { useEffect, useRef, useState } from "react";
import { Mic, Square, Trash2 } from "lucide-react";
import { Button } from "@/components/ui/Button";

/** Grava somente após clique. Nunca envia no stop: o usuário ouve e confirma. */
export function VoiceRecorder({ onEscolher, disabled }: { onEscolher: (file: File) => void; disabled?: boolean }) {
  const recorder = useRef<MediaRecorder | null>(null);
  const stream = useRef<MediaStream | null>(null);
  const alive = useRef(true);
  const [gravando, setGravando] = useState(false);
  const [preview, setPreview] = useState<{ url: string; file: File } | null>(null);
  const [erro, setErro] = useState("");
  useEffect(() => { alive.current=true; return () => { alive.current=false; if (recorder.current?.state === "recording") recorder.current.stop(); stream.current?.getTracks().forEach(t=>t.stop()); }; }, []);
  useEffect(() => () => { if (preview) URL.revokeObjectURL(preview.url); }, [preview]);

  async function iniciar() {
    setErro("");
    if (!navigator.mediaDevices?.getUserMedia || typeof MediaRecorder === "undefined") { setErro("Este navegador não permite gravar áudio. Use um arquivo de áudio."); return; }
    try {
      const input = await navigator.mediaDevices.getUserMedia({ audio:true });
      if (!alive.current) { input.getTracks().forEach(t=>t.stop()); return; }
      stream.current=input;
      const mime = ["audio/webm;codecs=opus","audio/ogg;codecs=opus","audio/mp4"].find(t=>MediaRecorder.isTypeSupported(t));
      const rec = new MediaRecorder(input, mime ? {mimeType:mime} : undefined);
      recorder.current=rec;
      const partes: BlobPart[]=[];
      let bytes=0;
      rec.ondataavailable = e => { if (e.data.size) { partes.push(e.data); bytes+=e.data.size; if (bytes > 15*1024*1024 && rec.state === "recording") rec.stop(); } };
      rec.onerror = () => { input.getTracks().forEach(t=>t.stop()); if (alive.current) { setErro("A gravação falhou. Tente novamente."); setGravando(false); } };
      rec.onstop = () => {
        input.getTracks().forEach(t=>t.stop());
        if (!alive.current) return;
        setGravando(false);
        if (!bytes) { setErro("Nenhum áudio foi gravado."); return; }
        if (bytes > 16*1024*1024) { setErro("A gravação ultrapassou o limite de 16 MB."); return; }
        const type=rec.mimeType || mime || "audio/webm";
        const ext=type.includes("ogg")?"ogg":type.includes("mp4")?"m4a":"webm";
        const file = new File(partes, `mensagem-de-voz.${ext}`, {type});
        setPreview({file,url:URL.createObjectURL(file)});
      };
      rec.start(1000); setGravando(true);
    } catch { stream.current?.getTracks().forEach(t=>t.stop()); setErro("Não foi possível acessar o microfone. Confira a permissão do navegador."); }
  }
  return <div className="space-y-2">
    {preview ? <div className="flex flex-wrap items-center gap-2 rounded-md border border-borda bg-bg-sutil p-2">
      <audio controls src={preview.url} className="max-w-full" aria-label="Ouvir gravação antes de anexar" />
      <Button type="button" size="sm" disabled={disabled} onClick={()=>{onEscolher(preview.file);setPreview(null);}}>Usar gravação</Button>
      <Button type="button" size="sm" variant="ghost" onClick={()=>setPreview(null)}><Trash2 size={14}/>Cancelar</Button>
    </div> : gravando ? <Button type="button" variant="danger" onClick={()=>recorder.current?.stop()}><Square size={14}/>Parar gravação</Button> : <Button type="button" size="sm" variant="ghost" disabled={disabled} onClick={()=>void iniciar()}><Mic size={16}/>Gravar voz</Button>}
    {erro && <p role="alert" className="text-xs text-erro">{erro}</p>}
  </div>;
}
