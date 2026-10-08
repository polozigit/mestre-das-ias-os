import { extractLiveAssistantCommand } from "./incoming-event.mjs";

const MAX_CONTEXT_ITEMS = 6;

// Trata um evento do motor (so chega mensagem do proprio chat). Responde SO a mensagem que comeca
// com @ia ou @polozi; nao existe etapa de ativacao. As respostas saem em fila, uma por vez.
// Anexo (PDF/imagem): a IA recebe o caminho do arquivo temporario, e `remove` apaga o arquivo
// depois da resposta (ou da falha), aconteca o que acontecer.
export function createAssistantHandler({ ask, send, remove = async () => {}, log = console.log, logError = console.error }) {
  let history = [];
  let queue = Promise.resolve();

  return function handle(raw) {
    const command = extractLiveAssistantCommand(raw);
    if (!command) return queue;
    const anexo = command.anexo;
    queue = queue.then(async () => {
      try {
        if (anexo?.erro) {
          await send(`Nao consegui ler o anexo: ${anexo.erro}.`);
          log("WHATSAPP_LIVE_ASSISTANT=REPLIED");
          return;
        }
        const reply = await ask(history, command.question, anexo ? { anexo } : {});
        if (!reply) throw new Error("A IA da empresa nao retornou uma resposta.");
        await send(reply);
        const asked = anexo ? `${command.question} [anexo: ${anexo.nome || anexo.tipo}]` : command.question;
        history = [...history, { role: "Usuario", text: asked }, { role: "Assistente", text: reply }].slice(-MAX_CONTEXT_ITEMS);
        log("WHATSAPP_LIVE_ASSISTANT=REPLIED");
      } finally {
        if (anexo?.caminho) await Promise.resolve(remove(anexo.caminho)).catch(() => {});
      }
    }).catch((error) => logError(`WHATSAPP_LIVE_ASSISTANT_ERROR=${error.message}`));
    return queue;
  };
}
