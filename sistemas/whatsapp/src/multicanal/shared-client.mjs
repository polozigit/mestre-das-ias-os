export function createSharedClient(client){
 return {
  async accounts(){const {contas=[]}=await client.call('contas');return contas.map(({id,nome,provedor,estado,ia_modo})=>({id,nome,provedor,estado,ia_modo}));},
  context({conta_id,conversa_id}){return client.call('contexto',{conta_id,conversa_id});},
  async propose({conta_id,conversa_id,texto}){
   const context=await client.call('contexto',{conta_id,conversa_id});
   return client.call('propor_rascunho',{conta_id,conversa_id,texto,conversa_versao:context.conversa_versao,politica_versao:context.politica_versao});
  },
 };
}
