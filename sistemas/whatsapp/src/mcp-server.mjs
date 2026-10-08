import { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import { StdioServerTransport } from "@modelcontextprotocol/sdk/server/stdio.js";
import { pathToFileURL } from "node:url";
import { z } from "zod/v4";

import * as engineClient from "./engine-client.mjs";
import { ensureEngine, isConnected, NOT_CONNECTED_MESSAGE, waitForConnection } from "./engine-client.mjs";
import { TIPOS } from "./midia.mjs";
import { GROUP_PATTERN, PHONE_PATTERN } from "./validation.mjs";

const MCP_ORIGEM = "mcp";

// O motor sobe sozinho quando nao esta no ar (ensureEngine), entao o MCP funciona apos reiniciar o PC.
// `api` troca as chamadas ao motor nos testes; por padrao sao as funcoes do engine-client.
export function createEngineClient({ ensure = ensureEngine, status = waitForConnection, send = engineClient.sendText, api = {} } = {}) {
  const calls = { ...engineClient, ...api };
  const withConfig = (name) => async (...args) => calls[name](await ensure(), ...args);
  return {
    getStatus: async () => status(await ensure()),
    send: async (phone, text) => send(await ensure(), phone, text, MCP_ORIGEM),
    sendMedia: async (options) => calls.sendMedia(await ensure(), { ...options, origem: MCP_ORIGEM }),
    sendPoll: async (options) => calls.sendPoll(await ensure(), { ...options, origem: MCP_ORIGEM }),
    sendReaction: withConfig("sendReaction"),
    checkNumber: withConfig("checkNumber"),
    listGroups: withConfig("listGroups"),
    getGroup: withConfig("getGroup"),
    createGroup: withConfig("createGroup"),
    updateGroupSubject: withConfig("updateGroupSubject"),
    updateGroupDescription: withConfig("updateGroupDescription"),
    updateGroupSettings: withConfig("updateGroupSettings"),
    updateGroupParticipants: withConfig("updateGroupParticipants"),
    getGroupInvite: withConfig("getGroupInvite"),
    revokeGroupInvite: withConfig("revokeGroupInvite"),
    leaveGroup: withConfig("leaveGroup"),
    deleteGroup: withConfig("deleteGroup"),
  };
}

const phoneField = z.string().regex(PHONE_PATTERN, "Use DDI 55, DDD e telefone, somente digitos.");
const groupField = z.string().regex(GROUP_PATTERN, "Use o id do grupo, que termina em @g.us (veja whatsapp_group_list).");
const destinoField = z.string().regex(new RegExp(`${PHONE_PATTERN.source}|${GROUP_PATTERN.source}`), "Use telefone (55 + DDD + numero, so digitos) ou o id de um grupo terminado em @g.us.");
const confirmation = z.literal("ENVIAR").describe("Informe ENVIAR somente apos confirmacao explicita do usuario.");

const WRITE = { readOnlyHint: false, destructiveHint: true, idempotentHint: false, openWorldHint: true };
const READ = { readOnlyHint: true, destructiveHint: false, idempotentHint: true, openWorldHint: true };

const text = (value) => ({ content: [{ type: "text", text: value }] });
const failure = (key, error) => ({ content: [{ type: "text", text: `${key}=${error.message}` }], isError: true });

export function createServer(client = createEngineClient()) {
  const server = new McpServer({ name: "polozi-whatsapp", version: "0.3.0" });

  // Registra uma ferramenta que fala com o motor: erro vira texto com a chave `errorKey`.
  function tool(name, definition, errorKey, run) {
    server.registerTool(name, definition, async (args) => {
      try {
        return text(await run(args));
      } catch (error) {
        return failure(errorKey, error);
      }
    });
  }

  server.registerTool("whatsapp_connection_status", {
    title: "Status do WhatsApp local",
    description: "Consulta somente o estado da sessao local. Nao le conversas, contatos ou mensagens.",
    annotations: { readOnlyHint: true, destructiveHint: false, idempotentHint: true, openWorldHint: false },
  }, async () => {
    try {
      const status = await client.getStatus();
      const body = isConnected(status)
        ? "WHATSAPP_CONNECTION=CONNECTED"
        : `WHATSAPP_CONNECTION=NOT_CONNECTED\n${NOT_CONNECTED_MESSAGE}`;
      return text(body);
    } catch (error) {
      return failure("WHATSAPP_STATUS_ERROR", error);
    }
  });

  tool("whatsapp_send_text", {
    title: "Enviar texto pelo WhatsApp local",
    description: "Envia um unico texto a um numero ou a um grupo por uma sessao ja conectada. Use somente apos o usuario confirmar o destino e o texto final. Nao use para disparos, respostas automaticas ou mensagens nao solicitadas.",
    inputSchema: {
      phone: destinoField.describe("Telefone (55 + DDD + numero, so digitos) ou id de grupo terminado em @g.us."),
      text: z.string().min(1).max(2000),
      confirmation,
    },
    annotations: WRITE,
  }, "WHATSAPP_SEND_ERROR", async ({ phone, text: body }) => {
    const payload = await client.send(phone, body);
    return `WHATSAPP_SEND_ACCEPTED=${payload?.id || "aceito"}`;
  });

  tool("whatsapp_send_media", {
    title: "Enviar imagem, video, audio ou documento",
    description: `Envia um arquivo do computador (tipos: ${TIPOS.join(", ")}) a um numero ou grupo. Use somente apos o usuario confirmar o destino e o arquivo. "voice" e nota de voz e exige arquivo OGG/Opus (.ogg ou .opus); audio e video aceitam os formatos comuns. Legenda so em image, video e document.`,
    inputSchema: {
      destino: destinoField,
      caminho: z.string().min(1).max(1024).describe("Caminho completo do arquivo neste computador."),
      tipo: z.enum(TIPOS),
      legenda: z.string().max(1024).optional(),
      nome_arquivo: z.string().max(200).optional().describe("Nome que aparece para quem recebe o documento."),
      confirmation,
    },
    annotations: WRITE,
  }, "WHATSAPP_SEND_ERROR", async ({ destino, caminho, tipo, legenda, nome_arquivo: nomeArquivo }) => {
    const payload = await client.sendMedia({ destino, caminho, tipo, legenda, nomeArquivo });
    return `WHATSAPP_SEND_ACCEPTED=${payload?.id || "aceito"}`;
  });

  tool("whatsapp_send_poll", {
    title: "Enviar enquete",
    description: "Envia uma enquete (2 a 12 opcoes) a um numero ou grupo. Use somente apos o usuario confirmar o destino, a pergunta e as opcoes.",
    inputSchema: {
      destino: destinoField,
      pergunta: z.string().min(1).max(255),
      opcoes: z.array(z.string().min(1).max(100)).min(2).max(12),
      multipla: z.boolean().optional().describe("true deixa escolher mais de uma opcao."),
      confirmation,
    },
    annotations: WRITE,
  }, "WHATSAPP_SEND_ERROR", async ({ destino, pergunta, opcoes, multipla }) => {
    const payload = await client.sendPoll({ destino, pergunta, opcoes, multipla: multipla === true });
    return `WHATSAPP_SEND_ACCEPTED=${payload?.id || "aceito"}`;
  });

  tool("whatsapp_react", {
    title: "Reagir a uma mensagem",
    description: "Reage com um emoji a uma mensagem pelo id dela (texto vazio remove a reacao). Use somente apos o usuario confirmar a mensagem e o emoji. Em grupo, para mensagem de outra pessoa, informe o numero dela em participante.",
    inputSchema: {
      destino: destinoField,
      id: z.string().min(4).max(128).describe("Id da mensagem que recebe a reacao."),
      emoji: z.string().max(16),
      de_mim: z.boolean().optional().describe("true quando a mensagem foi enviada pelo proprio usuario."),
      participante: phoneField.optional(),
      confirmation,
    },
    annotations: WRITE,
  }, "WHATSAPP_REACT_ERROR", async ({ destino, id, emoji, de_mim: deMim, participante }) => {
    const payload = await client.sendReaction({ destino, id, emoji, deMim, participante });
    return `WHATSAPP_REACT_ACCEPTED=${payload?.id || "aceito"}`;
  });

  tool("whatsapp_check_number", {
    title: "Conferir se um numero tem WhatsApp",
    description: "Pergunta ao WhatsApp se um numero existe, sem enviar mensagem nenhuma.",
    inputSchema: { numero: phoneField },
    annotations: READ,
  }, "WHATSAPP_CHECK_ERROR", async ({ numero }) => {
    const payload = await client.checkNumber(numero);
    return `WHATSAPP_NUMBER=${payload.numero}\nWHATSAPP_EXISTS=${payload.existe ? "sim" : "nao"}`;
  });

  tool("whatsapp_group_list", {
    title: "Listar os grupos",
    description: "Lista os grupos de que o usuario participa: id, nome, quantidade de participantes e se ele e administrador. Nao le mensagens.",
    annotations: READ,
  }, "WHATSAPP_GROUP_ERROR", async () => {
    const { grupos = [] } = await client.listGroups();
    return [`WHATSAPP_GROUPS=${grupos.length}`, ...grupos.map((group) => `${group.id} | ${group.nome} | participantes=${group.participantes} | admin=${group.souAdmin ? "sim" : "nao"}`)].join("\n");
  });

  tool("whatsapp_group_info", {
    title: "Ver os dados de um grupo",
    description: "Mostra nome, descricao, regras e participantes (com quem e administrador) de um grupo.",
    inputSchema: { grupo: groupField },
    annotations: READ,
  }, "WHATSAPP_GROUP_ERROR", async ({ grupo }) => {
    const info = await client.getGroup(grupo);
    return [
      `WHATSAPP_GROUP=${info.id}`,
      `nome=${info.nome}`,
      `descricao=${info.descricao || "(sem descricao)"}`,
      `participantes=${info.participantes}`,
      `souAdmin=${info.souAdmin ? "sim" : "nao"}`,
      `soAdminEnvia=${info.soAdminEnvia ? "sim" : "nao"}`,
      `soAdminEdita=${info.soAdminEdita ? "sim" : "nao"}`,
      ...(info.membros || []).map((member) => `${member.numero || member.id}${member.admin ? ` (${member.admin})` : ""}`),
    ].join("\n");
  });

  tool("whatsapp_group_create", {
    title: "Criar grupo",
    description: "Cria um grupo com os participantes informados. Use somente apos o usuario confirmar o nome e os numeros. Adicionar muita gente de uma vez pode ser visto como abuso pelo WhatsApp: consulte o guia de disparo em massa antes.",
    inputSchema: {
      nome: z.string().min(1).max(100),
      participantes: z.array(phoneField).min(1).max(256),
      confirmation,
    },
    annotations: { ...WRITE, destructiveHint: false },
  }, "WHATSAPP_GROUP_ERROR", async ({ nome, participantes }) => {
    const created = await client.createGroup({ nome, participantes });
    return `WHATSAPP_GROUP_CREATED=${created.id}\nparticipantes=${created.participantes}`;
  });

  tool("whatsapp_group_update", {
    title: "Mudar nome, descricao ou regras do grupo",
    description: "Muda o nome, a descricao (texto vazio apaga) e/ou as regras do grupo (so_admin_envia: so administradores enviam; so_admin_edita: so administradores editam os dados do grupo). Precisa ser administrador. Use somente apos o usuario confirmar a mudanca.",
    inputSchema: {
      grupo: groupField,
      nome: z.string().min(1).max(100).optional(),
      descricao: z.string().max(2048).optional(),
      so_admin_envia: z.boolean().optional(),
      so_admin_edita: z.boolean().optional(),
      confirmation,
    },
    annotations: WRITE,
  }, "WHATSAPP_GROUP_ERROR", async ({ grupo, nome, descricao, so_admin_envia: soAdminEnvia, so_admin_edita: soAdminEdita }) => {
    const changed = [];
    if (nome !== undefined) { await client.updateGroupSubject(grupo, nome); changed.push("nome"); }
    if (descricao !== undefined) { await client.updateGroupDescription(grupo, descricao); changed.push("descricao"); }
    if (soAdminEnvia !== undefined || soAdminEdita !== undefined) {
      await client.updateGroupSettings(grupo, { soAdminEnvia, soAdminEdita });
      changed.push("regras");
    }
    if (!changed.length) throw new Error("Informe o que mudar: nome, descricao, so_admin_envia ou so_admin_edita.");
    return `WHATSAPP_GROUP_UPDATED=${changed.join(",")}`;
  });

  tool("whatsapp_group_participants", {
    title: "Adicionar, remover ou promover participantes",
    description: "Adiciona (add), remove (remove), promove a administrador (promote) ou rebaixa (demote) participantes de um grupo. Precisa ser administrador. Use somente apos o usuario confirmar a acao e os numeros. Adicionar muita gente de uma vez pode ser visto como abuso pelo WhatsApp: consulte o guia de disparo em massa antes.",
    inputSchema: {
      grupo: groupField,
      acao: z.enum(["add", "remove", "promote", "demote"]),
      participantes: z.array(phoneField).min(1).max(256),
      confirmation,
    },
    annotations: WRITE,
  }, "WHATSAPP_GROUP_ERROR", async ({ grupo, acao, participantes }) => {
    const result = await client.updateGroupParticipants(grupo, { acao, participantes });
    return [`WHATSAPP_GROUP_PARTICIPANTS=${result.acao}`, `ok=${result.ok}`, `falhas=${result.falhas}`, ...(result.resultados || []).filter((item) => item.status !== "200").map((item) => `${item.participante} status=${item.status}`)].join("\n");
  });

  tool("whatsapp_group_invite", {
    title: "Link de convite do grupo",
    description: "Sem revogar, mostra o link de convite atual do grupo (nao precisa de confirmacao). Com revogar=true, invalida o link atual e gera outro: nesse caso use somente apos o usuario confirmar e informe confirmation=ENVIAR. Precisa ser administrador.",
    inputSchema: {
      grupo: groupField,
      revogar: z.boolean().optional(),
      confirmation: confirmation.optional(),
    },
    annotations: WRITE,
  }, "WHATSAPP_GROUP_ERROR", async ({ grupo, revogar, confirmation: given }) => {
    if (revogar === true) {
      if (given !== "ENVIAR") throw new Error("Revogar o link exige confirmation=ENVIAR, depois que o usuario confirmar.");
      const invite = await client.revokeGroupInvite(grupo);
      return `WHATSAPP_GROUP_INVITE_REVOKED=${invite.link}`;
    }
    const invite = await client.getGroupInvite(grupo);
    return `WHATSAPP_GROUP_INVITE=${invite.link}`;
  });

  tool("whatsapp_group_leave", {
    title: "Sair de um grupo",
    description: "Faz o usuario sair do grupo (o grupo continua existindo para os outros). Use somente apos o usuario confirmar.",
    inputSchema: { grupo: groupField, confirmation },
    annotations: WRITE,
  }, "WHATSAPP_GROUP_ERROR", async ({ grupo }) => {
    await client.leaveGroup(grupo);
    return "WHATSAPP_GROUP_LEFT=sim";
  });

  tool("whatsapp_group_delete", {
    title: "Excluir um grupo",
    description: "O WhatsApp nao tem 'excluir grupo': isto REMOVE TODOS os outros participantes e depois sai do grupo. Precisa ser administrador. Nao da para desfazer. Use somente apos o usuario confirmar o nome do grupo e entender isso.",
    inputSchema: { grupo: groupField, confirmation },
    annotations: WRITE,
  }, "WHATSAPP_GROUP_ERROR", async ({ grupo }) => {
    const result = await client.deleteGroup(grupo);
    return [`WHATSAPP_GROUP_DELETED=${result.saiu ? "sim" : "nao"}`, `removidos=${result.removidos}`, `restantes=${result.restantes}`, ...(result.aviso ? [result.aviso] : [])].join("\n");
  });

  return server;
}

if (process.argv[1] && pathToFileURL(process.argv[1]).href === import.meta.url) {
  const server = createServer();
  await server.connect(new StdioServerTransport());
}
