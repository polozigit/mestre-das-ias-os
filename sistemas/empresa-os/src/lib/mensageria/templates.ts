export type MetaTemplate={name:string;language:string;status?:string;components:{type:string;text?:string;format?:string;buttons?:{type:string;url?:string}[]}[]};
export function templateDeTexto(template:MetaTemplate):boolean{
 return template.components.every(c=>['BODY','FOOTER'].includes(c.type)||(c.type==='HEADER'&&c.format==='TEXT')||(c.type==='BUTTONS'&&c.buttons?.every(b=>!b.url?.includes('{{')&&['URL','PHONE_NUMBER','QUICK_REPLY'].includes(b.type))));
}
export function camposTemplate(template:MetaTemplate){
 return template.components.filter(c=>['BODY','HEADER'].includes(c.type)).flatMap(component=>{
  const variables=[...new Set(Array.from((component.text||'').matchAll(/\{\{(\w+)\}\}/g),m=>m[1]))].sort((a,b)=>/^\d+$/.test(a)&&/^\d+$/.test(b)?Number(a)-Number(b):a.localeCompare(b));
  return variables.map(name=>({id:component.type+':'+name,nome:name,tipo:component.type}));
 });
}
export function montarTemplate(template:MetaTemplate,values:Record<string,string>){
 if(!templateDeTexto(template))throw new Error('Este template exige uma composição de mídia ou botões específica.');
 const fields=camposTemplate(template);
 if(fields.some(field=>!values[field.id]?.trim()))throw new Error('Preencha todas as variáveis do template.');
 const components=Array.from(new Set(fields.map(f=>f.tipo))).map(type=>({type:type.toLowerCase(),parameters:fields.filter(f=>f.tipo===type).map(field=>({type:'text',...(!/^\d+$/.test(field.nome)?{parameter_name:field.nome}:{}),text:values[field.id].trim()}))}));
 return {name:template.name,language:{code:template.language},...(components.length?{components}:{})};
}
