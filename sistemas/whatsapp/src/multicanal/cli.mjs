import {mkdir,readFile,writeFile,open} from 'node:fs/promises';
import {randomBytes} from 'node:crypto';
import path from 'node:path';
import {getStateDirectory,assertOutsideRepository} from '../local-paths.mjs';
import {createDeviceClient} from './device-client.mjs';
import {DurableSpool} from './spool.mjs';
import {MultiAccountRuntime} from './runtime.mjs';
import {RawInbox} from './raw-inbox.mjs';
import {fileURLToPath} from 'node:url';
import {execFileSync} from 'node:child_process';

const root=path.resolve(path.dirname(fileURLToPath(import.meta.url)),'../..');
const repositoryRoot=(()=>{try{return execFileSync('git',['-C',root,'rev-parse','--show-toplevel'],{encoding:'utf8',stdio:['ignore','pipe','ignore']}).trim();}catch{return root;}})();
const directory=path.join(getStateDirectory(),'multicanal');
const configFile=process.env.MENSAGERIA_CONFIG||path.join(directory,'conexao.json');
async function configure(){
  const {MENSAGERIA_URL:url,MENSAGERIA_PUBLIC_KEY:publicKey,MENSAGERIA_DEVICE_TOKEN:token}=process.env;
  if(!url||!publicKey||!token)throw new Error('Informe MENSAGERIA_URL, MENSAGERIA_PUBLIC_KEY e MENSAGERIA_DEVICE_TOKEN no ambiente. Não coloque valores no comando ou no repositório.');
  assertOutsideRepository(repositoryRoot,configFile);
  const client=createDeviceClient({url,publicKey,token});await client.call('contas');
  await mkdir(path.dirname(configFile),{recursive:true,mode:0o700});
  const stateDir=path.join(directory,new URL(url).hostname.replace(/[^a-z0-9.-]/gi,'_'));assertOutsideRepository(repositoryRoot,stateDir);await mkdir(stateDir,{recursive:true,mode:0o700});
  const keyFile=path.join(stateDir,'auth.key');
  try{const file=await open(keyFile,'wx',0o600);try{await file.writeFile(randomBytes(32));await file.sync();}finally{await file.close();}}
  catch(error){if(error.code!=='EEXIST')throw error;}
  await writeFile(configFile,JSON.stringify({url,publicKey,token,keyFile,stateDir,draftProvider:process.env.MENSAGERIA_IA||'codex'},null,2),{mode:0o600});
  console.log('Instalação validada. Configuração e chave guardadas fora do repositório. Execute npm run mensageria:iniciar.');
}
async function run(){
  assertOutsideRepository(repositoryRoot,configFile);const config=JSON.parse(await readFile(configFile,'utf8'));assertOutsideRepository(repositoryRoot,config.keyFile);assertOutsideRepository(repositoryRoot,config.stateDir);
  const key=await readFile(config.keyFile);if(key.length!==32)throw new Error('Chave de autenticação inválida.');
  const client=createDeviceClient(config),spool=new DurableSpool(path.join(config.stateDir,'spool'));
  const inbox=new RawInbox(path.join(config.stateDir,'inbox'),key);
  const runtime=new MultiAccountRuntime({client,key,spool,inbox,draftProvider:config.draftProvider,log:message=>console.error(message)});
  let stopped=false;const stop=async()=>{stopped=true;await runtime.stop();};
  process.once('SIGINT',()=>void stop());process.once('SIGTERM',()=>void stop());
  console.log('Conector multiatendimento ativo. As contas autorizadas serão carregadas do Supabase.');
  while(!stopped){try{await runtime.tick();}catch{console.error('Supabase indisponível. Contas pausadas; aguardando reconexão.');await runtime.stop();}
    if(!stopped)await new Promise(resolve=>setTimeout(resolve,3000));
  }
}
try{
  const action=process.argv[2];
  if(action==='configurar')await configure();
  else if(action==='iniciar')await run();
  else if(action==='status'){
    const config=JSON.parse(await readFile(configFile,'utf8'));const result=await createDeviceClient(config).call('contas');
    console.log(JSON.stringify({contas:(result.contas||[]).map(({id,nome,estado})=>({id,nome,estado}))},null,2));
  }else console.log('Uso: npm run mensageria:configurar | mensageria:iniciar | mensageria:status. Consulte MULTIATENDIMENTO.md.');
}catch(error){console.error(error.code==='ENOENT'?'Conector ainda não configurado. Consulte MULTIATENDIMENTO.md.':String(error.message).slice(0,250));process.exitCode=1;}
