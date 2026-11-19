import {mkdir,readFile,writeFile,open} from 'node:fs/promises';
import {randomBytes} from 'node:crypto';
import path from 'node:path';
import {getStateDirectory,assertOutsideRepository} from '../local-paths.mjs';
import {createDeviceClient} from './device-client.mjs';
import {DurableSpool} from './spool.mjs';
import {MultiAccountRuntime} from './runtime.mjs';
import {RawInbox} from './raw-inbox.mjs';
import {fileURLToPath} from 'node:url';
import {lerAmbiente,ligarComputador} from './ligar.mjs';
import {servico,servicoInstalado,tokenParou,TOKEN_PAROU} from './servico.mjs';
import {execFileSync} from 'node:child_process';

const root=path.resolve(path.dirname(fileURLToPath(import.meta.url)),'../..');
const repositoryRoot=(()=>{try{return execFileSync('git',['-C',root,'rev-parse','--show-toplevel'],{encoding:'utf8',stdio:['ignore','pipe','ignore']}).trim();}catch{return root;}})();
const directory=path.join(getStateDirectory(),'multicanal');
const configFile=process.env.MENSAGERIA_CONFIG||path.join(directory,'conexao.json');
async function configure(dados){
  const {MENSAGERIA_URL:url,MENSAGERIA_PUBLIC_KEY:publicKey,MENSAGERIA_DEVICE_TOKEN:token}=dados||process.env;
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
// Cria (ou renova) a instalação pelo nome do computador e configura sem mostrar o token.
async function ligar(){
  const {url,servico,publica,nome}=lerAmbiente();
  const {token,numerosLigados}=await ligarComputador({url,servico,nome});
  await configure({MENSAGERIA_URL:url,MENSAGERIA_PUBLIC_KEY:publica,MENSAGERIA_DEVICE_TOKEN:token});
  console.log(`Computador "${nome}" ligado ao Empresa OS.${numerosLigados?` ${numerosLigados} número(s) de QR Code passam por ele.`:''}`);
}
// Instalação da Casa: liga o computador ao Empresa OS e deixa o conector rodando sozinho, agora e a cada login.
async function preparar(){
  await ligar();
  const {kind}=await servico('ligar');
  console.log(`Conector rodando e configurado para abrir sozinho (${kind==='macos'?'macOS':'Windows'}). Os números de QR Code agora se conectam pela tela do Empresa OS.`);
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
  while(!stopped){try{await runtime.tick();}catch{await runtime.stop();
      // 403 no 'contas' = o token deste computador parou (removido na tela ou religado): sai limpo, sem reabrir.
      if(await tokenParou(client)){console.log(TOKEN_PAROU);stopped=true;break;}
      console.error('Supabase indisponível. Contas pausadas; aguardando reconexão.');}
    if(!stopped)await new Promise(resolve=>setTimeout(resolve,3000));
  }
}
try{
  const action=process.argv[2];
  if(action==='preparar')await preparar();
  else if(action==='ligar')await ligar();
  else if(action==='parar'){await servico('desligar');console.log('Início automático do conector desligado. O conector que está rodando para quando o computador reiniciar (no Mac, já parou).');}
  else if(action==='configurar')await configure();
  else if(action==='iniciar')await run();
  else if(action==='status'){
    const config=JSON.parse(await readFile(configFile,'utf8'));const result=await createDeviceClient(config).call('contas');
    console.log(JSON.stringify({inicio_automatico:servicoInstalado(),contas:(result.contas||[]).map(({id,nome,estado})=>({id,nome,estado}))},null,2));
  }else console.log('Uso: npm run mensageria:preparar (liga e deixa rodando sozinho) | mensageria:ligar | mensageria:iniciar | mensageria:parar | mensageria:status (mensageria:configurar = jeito antigo, com token). Consulte MULTIATENDIMENTO.md.');
}catch(error){console.error(error.code==='ENOENT'?'Conector ainda não configurado. Consulte MULTIATENDIMENTO.md.':String(error.message).slice(0,250));process.exitCode=1;}
