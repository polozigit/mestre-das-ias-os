import { execFile } from 'node:child_process';
import { existsSync, mkdirSync } from 'node:fs';
import { rm, writeFile } from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

import {
  buildLaunchAgentPlist,
  buildWindowsStartupScript,
  collectEnvironment,
  encodeWindowsScript,
  launchctlCommands,
  platformKind,
  stableNodePath,
} from '../autostart.mjs';
import { getStateDirectory } from '../local-paths.mjs';

// Deixa o conector multiatendimento (npm run mensageria:iniciar) rodando sozinho neste computador:
// abre agora e volta a abrir quando a pessoa entra no computador. É o que faz o Empresa OS e o
// computador já nascerem ligados na instalação da Casa: depois disso o QR Code é só pela tela.
// macOS: LaunchAgent do usuário, com KeepAlive só em queda. Windows: .vbs na pasta Inicializar do usuário.
// Separado do início automático do motor antigo (src/autostart.mjs), que tem outro rótulo e outro arquivo.
const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '../..');
export const SERVICO_LABEL = 'com.polozi.empresa-os-whatsapp';
export const SERVICO_WINDOWS = 'Empresa OS WhatsApp.vbs';
export const SEM_SUPORTE = 'Início automático do conector só existe para macOS e Windows. Em Linux, deixe npm run mensageria:iniciar rodando num serviço do sistema.';

export function planoServico({
  acao,
  platform = process.platform,
  homeDirectory = os.homedir(),
  environment = process.env,
  nodePath = process.execPath,
  rootDir = ROOT,
  uid = process.getuid?.(),
}) {
  const kind = platformKind(platform);
  if (!kind) throw new Error(SEM_SUPORTE);
  if (!['ligar', 'desligar'].includes(acao)) throw new Error('Ação do serviço: ligar ou desligar.');
  const caminho = kind === 'windows' ? path.win32 : path.posix;
  const scriptPath = caminho.join(rootDir, 'src', 'multicanal', 'cli.mjs');
  const environmentVariables = collectEnvironment({ environment, nodePath, platform });
  // Quem usa um arquivo de conexão fora do padrão precisa dele também depois de reiniciar.
  if (environment.MENSAGERIA_CONFIG) environmentVariables.MENSAGERIA_CONFIG = environment.MENSAGERIA_CONFIG;
  const pastaEstado = caminho.join(getStateDirectory(environment, platform, homeDirectory), 'multicanal');

  if (kind === 'macos') {
    const file = path.posix.join(homeDirectory, 'Library', 'LaunchAgents', `${SERVICO_LABEL}.plist`);
    const commands = launchctlCommands({ uid, plistPath: file, label: SERVICO_LABEL });
    return {
      kind, file, pastaEstado,
      content: acao === 'ligar'
        ? buildLaunchAgentPlist({
          label: SERVICO_LABEL, nodePath, scriptPath, args: ['iniciar'], keepAlive: true,
          workingDirectory: rootDir, logFile: path.posix.join(pastaEstado, 'servico.log'), environmentVariables,
        })
        : null,
      // bootout antes: bootstrap de um serviço já carregado falha, e o bootout para o conector antigo.
      steps: acao === 'ligar'
        ? [{ argv: commands.unload, tolerate: true }, { argv: commands.load, fallback: commands.loadFallback }]
        : [{ argv: commands.unload, fallback: commands.unloadFallback, tolerate: true }],
    };
  }

  const appData = environment.APPDATA || path.win32.join(homeDirectory, 'AppData', 'Roaming');
  const file = path.win32.join(appData, 'Microsoft', 'Windows', 'Start Menu', 'Programs', 'Startup', SERVICO_WINDOWS);
  return {
    kind, file, pastaEstado,
    content: acao === 'ligar'
      ? buildWindowsStartupScript({
        nodePath, scriptPath, args: ['iniciar'], workingDirectory: rootDir, environmentVariables,
        comment: 'Empresa OS: conector do WhatsApp (QR Code) ao entrar no Windows, sem janela.',
      })
      : null,
    // Roda uma vez agora. Um conector antigo deste computador para sozinho: o token dele já foi trocado.
    steps: acao === 'ligar' ? [{ argv: ['wscript.exe', '//B', '//Nologo', file] }] : [],
  };
}

const rodarPadrao = (argv) => new Promise((resolve) => {
  execFile(argv[0], argv.slice(1), { windowsHide: true }, (error, stdout, stderr) => {
    resolve({ ok: !error, output: `${stdout || ''}${stderr || ''}`.trim() });
  });
});

export async function servico(acao, {
  platform = process.platform,
  homeDirectory = os.homedir(),
  environment = process.env,
  nodePath = stableNodePath(process.execPath, { platform }),
  rootDir = ROOT,
  uid = process.getuid?.(),
  rodar = rodarPadrao,
  gravar = async (file, content, kind) => {
    mkdirSync(path.dirname(file), { recursive: true });
    await writeFile(file, kind === 'windows' ? encodeWindowsScript(content) : content, { mode: 0o644 });
  },
  apagar = (file) => rm(file, { force: true }),
  criarPasta = (pasta) => mkdirSync(pasta, { recursive: true, mode: 0o700 }),
} = {}) {
  const plano = planoServico({ acao, platform, homeDirectory, environment, nodePath, rootDir, uid });
  if (acao === 'ligar') {
    criarPasta(plano.pastaEstado);
    await gravar(plano.file, plano.content, plano.kind);
  }
  for (const step of plano.steps) {
    let resultado = await rodar(step.argv);
    if (!resultado.ok && step.fallback) resultado = await rodar(step.fallback);
    if (!resultado.ok && !step.tolerate) throw new Error(`Não consegui ${acao} o início automático (${step.argv[0]}): ${resultado.output || 'sem detalhe'}`.slice(0, 300));
  }
  if (acao === 'desligar') await apagar(plano.file);
  return { kind: plano.kind, file: plano.file };
}

export function servicoInstalado({ platform = process.platform, homeDirectory = os.homedir(), environment = process.env, exists = existsSync } = {}) {
  if (!platformKind(platform)) return false;
  return exists(planoServico({ acao: 'desligar', platform, homeDirectory, environment }).file);
}

// 403 na operação 'contas' só acontece com token que não vale mais (computador removido na tela ou
// religado com token novo). Aí o conector sai limpo (código 0) e o launchd não reabre.
export const TOKEN_PAROU = 'Este computador foi removido ou religado no Empresa OS. Conector parado; para usar de novo: npm run mensageria:preparar.';
export async function tokenParou(client) {
  try { await client.call('contas'); return false; } catch (error) { return error?.status === 403; }
}
