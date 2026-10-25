import {DurableSpool} from './spool.mjs';
import {encryptState,decryptState} from './auth-store.mjs';
import path from 'node:path';

/** Lote recebido é cifrado e sincronizado no disco antes de qualquer download. */
export class RawInbox{
 constructor(directory,key){this.spool=new DurableSpool(directory);this.live=new DurableSpool(path.join(directory,'live'));this.history=new DurableSpool(path.join(directory,'history'));this.deferred=new DurableSpool(path.join(directory,'deferred'));this.historyRetryAt=new Map();this.key=key;}
 defer(account,batch){return this.deferred.push(account,{operacao:'midia_indisponivel',dados:encryptState(batch,this.key,`raw:${account}`)});}
 async save(account,batch){
  const queue=batch.historico?this.history:this.live;
  for(let offset=0;offset<(batch.messages||[]).length;offset+=25)await queue.push(account,{operacao:'recebimento',dados:encryptState({...batch,messages:batch.messages.slice(offset,offset+25)},this.key,`raw:${account}`)});
 }
 async drain(account,process){
  // Lotes legados só são removidos depois de todos os pedaços estarem duráveis.
  await this.spool.flush(account,async(_op,data)=>this.save(account,decryptState(data,this.key,`raw:${account}`)),{maxFiles:1});
  const send=async(_op,data)=>process(decryptState(data,this.key,`raw:${account}`));
  await this.live.flush(account,send,{maxFiles:1});
  if(Date.now()>=(this.historyRetryAt.get(account)||0))try{await this.history.flush(account,send,{maxFiles:1});}catch(error){if(!error.historyMediaRetry)throw error;this.historyRetryAt.set(account,Date.now()+30000);}
 }
}
