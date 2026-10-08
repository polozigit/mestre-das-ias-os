import os from "node:os";
import path from "node:path";
import { relative, resolve } from "node:path";

export const SERVICE_NAME = "polozi-whatsapp-local";
export const DEFAULT_PORT = 8082;

// Porta do motor local. Override so para teste/desenvolvimento.
export function getLocalPort(environment = process.env) {
  const port = Number(environment.WHATSAPP_LOCAL_PORT);
  return Number.isInteger(port) && port > 0 && port < 65536 ? port : DEFAULT_PORT;
}

export function getBaseUrl(environment = process.env) {
  return `http://127.0.0.1:${getLocalPort(environment)}`;
}

export function getStateDirectory(environment = process.env, platform = process.platform, homeDirectory = os.homedir()) {
  if (environment.WHATSAPP_LOCAL_STATE_DIR) return environment.WHATSAPP_LOCAL_STATE_DIR;

  if (platform === "win32") {
    return path.win32.join(
      environment.APPDATA || path.win32.join(homeDirectory, "AppData", "Roaming"),
      "Polozi",
      "whatsapp-local",
    );
  }

  if (platform === "darwin") {
    return path.join(homeDirectory, "Library", "Application Support", "Polozi", "whatsapp-local");
  }

  return path.join(
    environment.XDG_STATE_HOME || path.join(homeDirectory, ".local", "state"),
    "polozi",
    "whatsapp-local",
  );
}

export function getAuthDirectory(environment = process.env, platform = process.platform, homeDirectory = os.homedir()) {
  return path.join(getStateDirectory(environment, platform, homeDirectory), "auth");
}

export function getEngineConfigFile(environment = process.env, platform = process.platform, homeDirectory = os.homedir()) {
  return path.join(getStateDirectory(environment, platform, homeDirectory), "motor.json");
}

export function getEnginePidFile(environment = process.env, platform = process.platform, homeDirectory = os.homedir()) {
  return path.join(getStateDirectory(environment, platform, homeDirectory), "motor.pid");
}

export function getEngineLogFile(environment = process.env, platform = process.platform, homeDirectory = os.homedir()) {
  return path.join(getStateDirectory(environment, platform, homeDirectory), "motor.log");
}

export function getLiveAssistantPidFile(environment = process.env, platform = process.platform, homeDirectory = os.homedir()) {
  return path.join(getStateDirectory(environment, platform, homeDirectory), "live-assistant.pid");
}

export function getLiveAssistantLogFile(environment = process.env, platform = process.platform, homeDirectory = os.homedir()) {
  return path.join(getStateDirectory(environment, platform, homeDirectory), "live-assistant.log");
}

export function getAutostartLogFile(environment = process.env, platform = process.platform, homeDirectory = os.homedir()) {
  return path.join(getStateDirectory(environment, platform, homeDirectory), "autostart.log");
}

// Arquivos temporarios de midia recebida (@ia com PDF/imagem). Fora do repositorio, apagados apos a resposta.
export function getMediaTempDirectory(environment = process.env, platform = process.platform, homeDirectory = os.homedir()) {
  return path.join(getStateDirectory(environment, platform, homeDirectory), "midia-temp");
}

export function isInsideDirectory(directory, candidate) {
  const relation = relative(resolve(directory), resolve(candidate));
  return relation !== "" && !relation.startsWith("..") && !path.isAbsolute(relation);
}

export function assertOutsideRepository(repositoryRoot, candidatePath) {
  const relation = relative(resolve(repositoryRoot), resolve(candidatePath));
  if (relation === "" || (!relation.startsWith("..") && !path.isAbsolute(relation))) {
    throw new Error("O estado local nao pode ficar dentro do repositorio.");
  }
}
