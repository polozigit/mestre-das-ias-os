// Máscara do telefone digitado na mensageria. Padrão: número do Brasil com DDD,
// mostrado como (11) 91234-5678 e gravado como 5511912345678 (DDI 55 + DDD + número).
// Número de fora começa com "+" e o DDI do país: aceita só dígitos, de 8 a 15.

const BR_LOCAL=/^[1-9]{2}(?:9\d{8}|[2-5]\d{7})$/; // DDD + celular (9 + 8) ou fixo (2-5 + 7)

function internacional(raw:string){
  const d=raw.replace(/\D/g,'');
  return raw.trim().startsWith('+')&&d.length>0&&!d.startsWith('55');
}

/** Dígitos locais (DDD + número), no máximo 11. Tira o 55 colado só quando o resto é um número válido. */
export function digitosLocais(raw:string){
  const d=raw.replace(/\D/g,'');
  if(d.length>11&&d.startsWith('55')&&BR_LOCAL.test(d.slice(2,13)))return d.slice(2,13);
  return d.slice(0,11);
}

/** Valor a mostrar no campo enquanto a pessoa digita ou cola. */
export function mascararTelefone(raw:string){
  if(internacional(raw))return '+'+raw.replace(/\D/g,'').slice(0,15);
  const d=digitosLocais(raw);
  if(!d)return '';
  if(d.length<=2)return `(${d}`;
  const ddd=d.slice(0,2),resto=d.slice(2);
  if(resto.length<=4)return `(${ddd}) ${resto}`;
  const corte=resto.length>8?5:4;
  return `(${ddd}) ${resto.slice(0,corte)}-${resto.slice(corte)}`;
}

/** Número completo só com dígitos (com DDI), ou null quando a quantidade ou o formato não fecham. */
export function telefoneCompleto(raw:string):string|null{
  if(internacional(raw)){
    const d=raw.replace(/\D/g,'');
    return d.length>=8&&d.length<=15?d:null;
  }
  const d=digitosLocais(raw);
  return BR_LOCAL.test(d)?`55${d}`:null;
}

export const AVISO_TELEFONE='Informe DDD e número, ex.: (11) 91234-5678. Número de fora do Brasil: comece com + e o código do país.';
