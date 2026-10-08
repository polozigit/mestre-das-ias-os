export const MAX_TEXT_LENGTH = 2000;

// Numero brasileiro (DDI 55 + DDD + numero) ou id de grupo do WhatsApp:
// grupo novo = 16 a 30 digitos @g.us; grupo antigo = <numero do criador>-<carimbo> @g.us.
export const PHONE_PATTERN = /^55\d{10,11}$/;
export const GROUP_PATTERN = /^(\d{16,30}|\d{8,15}-\d{5,12})@g\.us$/;

export const DESTINO_MESSAGE = "Use telefone brasileiro com DDI 55, DDD e numero, somente digitos, ou o id de um grupo (termina em @g.us).";

export function isPhone(value) {
  return PHONE_PATTERN.test(value || "");
}

export function isGroupId(value) {
  return GROUP_PATTERN.test(value || "");
}

export function validateDestino(destino) {
  if (!isPhone(destino) && !isGroupId(destino)) throw new Error(DESTINO_MESSAGE);
}

export function validateTextMessage(destino, text) {
  validateDestino(destino);
  if (typeof text !== "string" || !text.trim()) {
    throw new Error("A mensagem nao pode estar vazia.");
  }
  if (text.length > MAX_TEXT_LENGTH) {
    throw new Error("A mensagem ultrapassa o limite local de 2000 caracteres.");
  }
}
