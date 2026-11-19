// Comandos que o dono cola na IA dele (Codex) a partir da tela de números do WhatsApp (17/11/2026).
// A tela não mostra token nem "instalação": quem liga o computador e guia a API oficial é a IA.

export type Instalacao = { id: string; nome: string; ultima_em: string | null };

/** O conector consulta o sistema a cada poucos segundos: sem contato há mais de 1 minuto = desligado. */
export const LIGADO_ATE_MS = 60_000;

export function computadorLigado(inst: Pick<Instalacao, "ultima_em">, agora = Date.now()): boolean {
  if (!inst.ultima_em) return false;
  const t = Date.parse(inst.ultima_em);
  return Number.isFinite(t) && agora - t <= LIGADO_ATE_MS;
}

/** Computador para um número novo de QR Code: o que falou com o sistema por último; nenhum = null. */
export function computadorPadrao(instalacoes: Instalacao[]): string | null {
  if (!instalacoes.length) return null;
  const vistos = instalacoes.filter((i) => i.ultima_em).sort((a, b) => Date.parse(b.ultima_em!) - Date.parse(a.ultima_em!));
  return (vistos[0] ?? instalacoes[0]).id;
}

export const COMANDO_LIGAR_COMPUTADOR = `Quero ligar este computador ao WhatsApp do meu Empresa OS, para os números de QR Code.

Trabalhe na pasta da minha empresa, dentro de sistemas/whatsapp:
1. Confira se o Node.js 20 ou mais novo está instalado. Se faltar, me explique em linguagem simples e, se eu aprovar, instale pela fonte oficial do meu sistema.
2. Rode npm install.
3. Carregue as variáveis de credenciais/.env no ambiente do comando, sem mostrar nenhum valor (no Mac ou Linux: set -a && . ../../credenciais/.env && set +a).
4. Rode npm run mensageria:preparar. Ele liga este computador ao Empresa OS, guarda tudo sozinho e deixa o conector rodando, inclusive depois de reiniciar o computador.
5. Me avise quando terminar: eu abro Configurações > Números do WhatsApp e clico em "Conectar ou mostrar QR".

Não me peça token, chave nem senha, e não mostre valores na conversa. Se der erro, me explique o que aconteceu e o que fazer, sem contornar permissões.`;

export const COMANDO_API_OFICIAL = `Quero ligar um número do WhatsApp da minha empresa pela API oficial da Meta (WhatsApp Cloud API) ao meu Empresa OS. Me guie passo a passo, um passo por vez, esperando eu confirmar antes de seguir. Use o navegador comigo quando ajudar e confira cada passo na documentação oficial da Meta (developers.facebook.com/docs/whatsapp), porque as telas mudam.

Antes de começar, confirme comigo:
- O número: precisa receber o código por SMS ou ligação. Se ele já está no WhatsApp ou no WhatsApp Business do celular, precisa ser apagado de lá antes. Se eu não tiver um número livre, me ajude a escolher: chip novo ou número fixo que receba ligação.
- O custo: mostre a tabela de preços atual da Meta e me diga quando vou precisar cadastrar um cartão.

Passos:
1. Portfólio empresarial da Meta (business.facebook.com): usar o que eu já tenho ou criar um.
2. Criar o app em developers.facebook.com com o caso de uso de WhatsApp e ligar à conta do WhatsApp Business.
3. Adicionar e verificar o número, definir o nome de exibição e concluir o registro do número.
4. Criar um usuário do sistema no portfólio, dar a ele acesso ao app e à conta do WhatsApp e gerar um token com as permissões whatsapp_business_messaging e whatsapp_business_management.
5. No Empresa OS, em Configurações > Números do WhatsApp, eu adiciono o número como "API oficial Meta" e abro "Configurar credenciais oficiais". Me diga onde achar cada campo: ID do número, ID da conta do WhatsApp Business, versão da Graph API, token, chave secreta do app (Configurações > Básico do app) e um token de verificação que eu invento.
6. No app da Meta, configurar o webhook: URL = endereço do meu Supabase + /functions/v1/mensageria, o mesmo token de verificação, assinar o campo messages e deixar o app no modo ativo (Live).
7. Testar: eu mando uma mensagem do meu celular para o número e confiro na tela Mensagens.

Regras: nunca me peça para colar token, chave secreta ou senha nesta conversa; quando um valor secreto aparecer, me oriente a copiar direto da Meta para o campo do Empresa OS. Se houver um conector oficial da Meta disponível para você, pergunte antes de ligar qualquer conta.`;
