import test from 'node:test';
import assert from 'node:assert/strict';
import {planoServico,servico,servicoInstalado,tokenParou,SERVICO_LABEL,SERVICO_WINDOWS} from '../src/multicanal/servico.mjs';
import {LAUNCH_AGENT_LABEL,WINDOWS_STARTUP_FILE} from '../src/autostart.mjs';

const MAC={platform:'darwin',homeDirectory:'/Users/ana',environment:{PATH:'/usr/bin'},nodePath:'/opt/homebrew/bin/node',rootDir:'/Users/ana/Casa/sistemas/whatsapp',uid:501};
const WIN={platform:'win32',homeDirectory:'C:\\Users\\Ana',environment:{APPDATA:'C:\\Users\\Ana\\AppData\\Roaming'},nodePath:'C:\\node\\node.exe',rootDir:'C:\\Casa\\sistemas\\whatsapp'};

test('macOS: LaunchAgent próprio roda cli.mjs iniciar e reabre só em queda', ()=>{
  const p=planoServico({acao:'ligar',...MAC});
  assert.equal(p.file,`/Users/ana/Library/LaunchAgents/${SERVICO_LABEL}.plist`);
  assert.notEqual(SERVICO_LABEL,LAUNCH_AGENT_LABEL,'não pisa no início automático do motor antigo');
  assert.match(p.content,/<string>\/Users\/ana\/Casa\/sistemas\/whatsapp\/src\/multicanal\/cli\.mjs<\/string>\n\s*<string>iniciar<\/string>/);
  assert.match(p.content,/<key>KeepAlive<\/key>\s*<dict>\s*<key>SuccessfulExit<\/key>\s*<false\/>/);
  assert.match(p.content,/<key>RunAtLoad<\/key>\s*<true\/>/);
  assert.deepEqual(p.steps[0],{argv:['launchctl','bootout',`gui/501/${SERVICO_LABEL}`],tolerate:true});
  assert.deepEqual(p.steps[1].argv,['launchctl','bootstrap','gui/501',p.file]);
});

test('Windows: .vbs próprio na pasta Inicializar com o argumento iniciar, e roda uma vez agora', ()=>{
  const p=planoServico({acao:'ligar',...WIN});
  assert.ok(p.file.endsWith(`Startup\\${SERVICO_WINDOWS}`));
  assert.notEqual(SERVICO_WINDOWS,WINDOWS_STARTUP_FILE);
  assert.match(p.content,/shell\.Run """C:\\node\\node\.exe"" ""C:\\Casa\\sistemas\\whatsapp\\src\\multicanal\\cli\.mjs"" ""iniciar""", 0, False/);
  assert.deepEqual(p.steps,[{argv:['wscript.exe','//B','//Nologo',p.file]}]);
});

test('MENSAGERIA_CONFIG fora do padrão segue para depois de reiniciar', ()=>{
  const p=planoServico({acao:'ligar',...MAC,environment:{PATH:'/usr/bin',MENSAGERIA_CONFIG:'/x/conexao.json'}});
  assert.match(p.content,/<key>MENSAGERIA_CONFIG<\/key>\s*<string>\/x\/conexao\.json<\/string>/);
});

test('Linux e ação desconhecida são recusados', ()=>{
  assert.throws(()=>planoServico({acao:'ligar',...MAC,platform:'linux'}),/macOS e Windows/);
  assert.throws(()=>planoServico({acao:'status',...MAC}),/ligar ou desligar/);
});

test('servico ligar grava o arquivo e roda os passos; falha do bootstrap e do fallback vira erro', async()=>{
  const gravados=[],rodados=[];
  const r=await servico('ligar',{...MAC,gravar:async(f,c)=>gravados.push([f,c]),criarPasta:()=>{},rodar:async a=>{rodados.push(a);return {ok:true,output:''};}});
  assert.equal(r.kind,'macos');assert.equal(gravados.length,1);assert.equal(rodados.length,2);
  await assert.rejects(servico('ligar',{...MAC,gravar:async()=>{},criarPasta:()=>{},rodar:async a=>({ok:a[1]==='bootout',output:'negado'})}),/Não consegui ligar/);
});

test('servico desligar descarrega e apaga o arquivo', async()=>{
  const apagados=[];
  await servico('desligar',{...MAC,apagar:async f=>apagados.push(f),rodar:async()=>({ok:false,output:''})});
  assert.deepEqual(apagados,[`/Users/ana/Library/LaunchAgents/${SERVICO_LABEL}.plist`]);
});

test('servicoInstalado olha o arquivo do serviço', ()=>{
  assert.equal(servicoInstalado({...MAC,exists:f=>f.endsWith(`${SERVICO_LABEL}.plist`)}),true);
  assert.equal(servicoInstalado({...MAC,exists:()=>false}),false);
  assert.equal(servicoInstalado({...MAC,platform:'linux'}),false);
});

test('tokenParou: só 403 no contas para o conector; rede fora não', async()=>{
  assert.equal(await tokenParou({call:async()=>({contas:[]})}),false);
  assert.equal(await tokenParou({call:async()=>{throw Object.assign(new Error('x'),{status:403});}}),true);
  assert.equal(await tokenParou({call:async()=>{throw Object.assign(new Error('x'),{status:503});}}),false);
  assert.equal(await tokenParou({call:async()=>{throw new Error('fetch failed');}}),false);
});
