import Image from "next/image";
import { FileDown } from "lucide-react";
import type { Anexo } from "@/lib/mensageria/tipos";

export function MessageAttachment({ anexo }: { anexo: Anexo }) {
  const src=`/api/mensageria/media?path=${encodeURIComponent(anexo.path)}`;
  return <div className="space-y-2">
    {anexo.mime.startsWith("image/")&&<a href={src} target="_blank" rel="noreferrer"><Image unoptimized src={src} width={320} height={240} alt={anexo.nome||"Imagem recebida"} className="max-h-72 max-w-full rounded-md object-contain"/></a>}
    {anexo.mime.startsWith("video/")&&<video src={src} controls preload="none" className="max-h-80 max-w-full rounded-md" aria-label={anexo.nome}/>}
    {anexo.mime.startsWith("audio/")&&<audio src={src} controls preload="none" className="max-w-full" aria-label={anexo.nome}/>}
    <a href={src} target="_blank" rel="noreferrer" className="inline-flex max-w-full items-center gap-2 text-xs underline"><FileDown size={14}/><span className="truncate">{anexo.nome}</span><span className="shrink-0 text-fg-3">{(anexo.bytes/1024).toFixed(0)} KB</span></a>
  </div>;
}
