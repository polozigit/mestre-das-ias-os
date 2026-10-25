import {randomUUID} from 'node:crypto';
import {convertVoice} from './media.mjs';

// Só prepara arquivos. A Edge continua responsável pela autorização e pelo envio.
export async function prepareMetaMedia(client,runtimeId,{convert=convertVoice}={}){
 const {comandos=[]}=await client.call('midias_pendentes',{runtime_id:runtimeId});
 for(const command of comandos){
  const identity={conta_id:command.conta_id,runtime_id:runtimeId,comando_id:command.id};
  try{
   const source=command.conteudo.anexo;
   const scope={conta_id:command.conta_id,runtime_id:runtimeId,epoca:0};
   const bytes=await client.media('GET',scope,{path:source.path});
   const voice=await convert(bytes,source.mime);
   const nome=`voz-${command.id}.ogg`,path=`${command.conta_id}/${randomUUID()}/${nome}`;
   const anexo=await client.media('POST',scope,{path,nome,mime:voice.mime,bytes:voice.bytes});
   await client.call('midia_preparada',{...identity,anexo});
  }catch{await client.call('midia_falhou',{...identity,erro:'Não foi possível preparar OGG/Opus. Confira FFmpeg e a conexão; nenhum envio foi realizado.'}).catch(()=>{});}
 }
}
