import { spawn } from 'node:child_process';
import { mkdtemp, writeFile, readFile, rm } from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';

export function validatePrivatePath(value, accountId) {
  if (typeof value !== 'string' || value.length > 500 || /[\\%?#\u0000-\u001f]/.test(value) || value.split('/').length!==3 || value.split('/').some((part)=>!part || part === '.' || part === '..')) throw Object.assign(new Error('Caminho de mídia inválido.'),{beforeSend:true});
  if (accountId && value.split('/')[0] !== accountId) throw Object.assign(new Error('Caminho pertence a outra conta.'),{beforeSend:true});
  return value;
}

export async function convertVoice(bytes, mime, { command = 'ffmpeg', signal } = {}) {
  if (mime === 'audio/ogg' || mime === 'audio/ogg; codecs=opus') return { bytes, mime:'audio/ogg' };
  const dir = await mkdtemp(path.join(os.tmpdir(), 'polozi-voice-'));
  try {
    const input = path.join(dir, 'input'); const output = path.join(dir, 'voice.ogg');
    await writeFile(input, bytes, {mode:0o600});
    await new Promise((resolve,reject)=> {
      const child = spawn(command,['-nostdin','-hide_banner','-loglevel','error','-i',input,'-vn','-ac','1','-ar','48000','-c:a','libopus','-application','voip','-f','ogg',output],{stdio:['ignore','ignore','pipe'],signal,timeout:90000});
      let errorText=''; child.stderr.on('data',(chunk)=>{if(errorText.length<1000) errorText+=chunk;});
      child.once('error',()=>reject(Object.assign(new Error('Conversão de voz indisponível. Instale FFmpeg com libopus.'),{beforeSend:true})));
      child.once('close',(code)=> code === 0 ? resolve() : reject(Object.assign(new Error('Não foi possível converter a gravação para OGG/Opus.'),{beforeSend:true})));
    });
    return {bytes:await readFile(output),mime:'audio/ogg'};
  } finally { await rm(dir,{recursive:true,force:true}); }
}
