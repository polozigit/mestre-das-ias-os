export async function fetchIncomingMedia({download,historico,defer}){
 try{return await download();}catch(error){
  const status=error?.output?.statusCode;
  if(historico&&[401,403,404,410].includes(status)){
   await defer(status);return null;
  }
  if(historico&&([408,429].includes(status)||status>=500||['ECONNRESET','ETIMEDOUT','ENOTFOUND'].includes(error?.cause?.code)))error.historyMediaRetry=true;
  throw error;
 }
}
