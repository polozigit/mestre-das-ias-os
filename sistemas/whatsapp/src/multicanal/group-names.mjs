export class GroupNames {
 constructor({emit,fetchMetadata}){this.emit=emit;this.fetchMetadata=fetchMetadata;this.names=new Map();}
 async update(groups){
  const changed=[];
  for(const group of groups||[]){
   if(!/^\d+(?:-\d+)?@g\.us$/.test(group.id||'')||typeof group.subject!=='string'||!group.subject.trim())continue;
   const nome=Array.from(group.subject.trim()).slice(0,180).join('');
   if(this.names.get(group.id)===nome)continue;
   this.names.set(group.id,nome);changed.push({jid:group.id,nome});
  }
  for(let offset=0;offset<changed.length;offset+=500)await this.emit('grupos_atualizar',{grupos:changed.slice(offset,offset+500)});
 }
 async resolve(jid){
  if(!jid.endsWith('@g.us'))return null;
  if(!this.names.has(jid))try{await this.update([await this.fetchMetadata(jid)]);}catch{/* nome indisponivel nao impede receber a mensagem */}
  return this.names.get(jid)||null;
 }
}
