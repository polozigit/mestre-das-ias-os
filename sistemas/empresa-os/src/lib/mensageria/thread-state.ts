import type {Thread,Mensagem} from './tipos.ts';
export type LeitorState={selected:string|null;thread:Thread|null;error:string;loading:boolean;following?:boolean};
export type MudancaMensagem={tipo:'DELETE';id:string}|{tipo:'INSERT'|'UPDATE';mensagem:Mensagem};
const ordenar=(messages:Mensagem[])=>messages.sort((a,b)=>a.criada_em.localeCompare(b.criada_em)||(a.ordem||0)-(b.ordem||0)||a.id.localeCompare(b.id));
export function aplicarThread(state:LeitorState,id:string,result:Thread,antes=false):LeitorState{
 if(state.selected!==id)return state;
 const previous=state.thread?.conversa.id===id?state.thread.mensagens:[];
 const incoming=!antes&&state.following===false&&previous.length?result.mensagens.filter(m=>previous.some(old=>old.id===m.id)):result.mensagens;
 const messages=antes?[...incoming,...previous]:[...previous,...incoming];
 const unique=ordenar([...new Map(messages.map(message=>[message.id,message])).values()].filter(m=>!m.duplicada_de));
 const clipped=unique.length>2000?(antes?unique.slice(0,2000):unique.slice(-2000)):unique;
 return {...state,thread:{...result,mensagens:clipped,tem_mais:result.tem_mais||unique.length>2000},error:'',loading:false};
}
export function aplicarMudanca(state:LeitorState,change:MudancaMensagem):LeitorState{
 if(!state.thread)return state;
 if(change.tipo==='DELETE')return {...state,thread:{...state.thread,mensagens:state.thread.mensagens.filter(m=>m.id!==change.id)}};
 const row=change.mensagem;if(row.conversa_id!==state.selected)return state;
 if(row.duplicada_de)return {...state,thread:{...state.thread,mensagens:state.thread.mensagens.filter(m=>m.id!==row.id)}};
 const exists=state.thread.mensagens.some(m=>m.id===row.id);
 if(!exists&&(row.historica||state.following===false||change.tipo==='UPDATE'))return state;
 const messages=ordenar([...new Map([...state.thread.mensagens,row].map(m=>[m.id,m])).values()]);
 return {...state,thread:{...state.thread,mensagens:messages.slice(-2000),tem_mais:state.thread.tem_mais||messages.length>2000}};
}
