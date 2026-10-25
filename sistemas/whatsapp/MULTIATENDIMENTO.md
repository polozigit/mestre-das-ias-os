# Caixa WhatsApp da empresa

Esta opção conecta os números à tela **Mensagens** do Empresa OS. O assistente
pessoal do comando `Conecta meu WhatsApp` continua separado.

## Preparar

1. A IA da empresa instala a migration de mensageria no Supabase e a função
   Edge `mensageria`. Confere permissões e abre o preview para aprovação do dono.
2. Em **Configurações → Números do WhatsApp**, crie uma instalação e guarde seu
   token privado. Adicione os números e libere quais usuários podem atendê-los.
3. A IA guarda, no ambiente privado, `MENSAGERIA_URL`, `MENSAGERIA_PUBLIC_KEY` e
   `MENSAGERIA_DEVICE_TOKEN`. Nenhum valor vai para o Git ou para o chat.
4. Nesta pasta, rode `npm run mensageria:configurar`, depois
   `npm run mensageria:iniciar`. O processo precisa permanecer ativo.
5. Na tela de números, clique para conectar e leia o QR no WhatsApp do celular.

`npm run mensageria:status` consulta somente os estados. A conexão usa saídas de
rede para Supabase e WhatsApp: não abra portas do computador à internet. Node 24
é a versão validada no desenvolvimento. FFmpeg com libopus prepara notas de voz.

## Canal oficial

Configure WABA, ID do número, versão Graph, token de acesso e segredos do app na
tela. Eles ficam no Vault do Supabase. A Meta deve apontar o webhook para a URL
do projeto seguida de `/functions/v1/mensageria`, usando o token de verificação
configurado. Validar credenciais não envia mensagens.

O serviço agenda o dispatcher oficial no Supabase. Caso o agendamento ainda não
esteja disponível, a tela informa a pendência; a caixa aberta também pode acordar
a fila. Fora da janela de atendimento, selecione um template aprovado. Templates
de texto suportam variáveis; composições especiais são identificadas na lista.

Para gravar voz no canal oficial, associe uma instalação à conta Meta. O conector
prepara OGG/Opus, mas a Edge revalida e envia. Se o computador estiver desligado,
o preparo aguarda; mensagens oficiais que já estejam prontas não dependem dele.

## IA e aprovação

A preparação é feita em conversa com o Codex, sem preencher instruções ou regras
técnicas no painel. Use o botão **Copiar comando para o Codex** na seção do número.
Veja o passo a passo e exemplos em [Preparar a IA de atendimento](GUIA-IA-ATENDIMENTO.md).

Tudo começa desligado. Ative rascunhos quando quiser. O gerador em segundo plano
exige cliente local instalado, autenticado e com restrições de ferramentas
comprovadas. Se ele não estiver disponível, o atendimento manual continua.

O Codex ou Claude também pode consultar contexto e propor rascunhos pelo MCP
**empresa-mensageria**, iniciado com `npm run mensageria:mcp`. As ferramentas são
`mensageria_contas`, `mensageria_contexto` e `mensageria_propor_rascunho`. Este MCP
nunca envia mensagens: a aprovação acontece na caixa, com a permissão do usuário.
Conecte-o pelo procedimento de MCP do seu cliente, apontando para este script;
nenhuma configuração global é alterada automaticamente pelo pacote.

Prepare as instruções aprovadas no Codex/Claude e salve a versão na configuração
da conta. Reprovar um rascunho com feedback registra o aprendizado para análise;
isso não muda sozinho as regras nem treina o modelo automaticamente.

Autonomia só vale para regras liberadas pelo dono. O padrão e a resposta aprovada
devem corresponder exatamente; vendas, temas sensíveis e incerteza mantêm gate.
Alteração de mensagem, responsável ou instrução invalida uma aprovação antiga.

## Servidor próprio

A IA pode configurar um servidor contratado por você usando o acesso que você
fornecer. Pare primeiro o processo local; transfira por canal privado o arquivo de
configuração, a chave de cifra e o spool; instale Node/FFmpeg e inicie o runtime.
Nunca recrie a chave AES nem copie sessões para o repositório. Configure o serviço
de inicialização do sistema do servidor com ambiente privado. A assinatura/login
da IA deve ser verificada separadamente no destino.

Depois de uma queda, mensagens sem confirmação aparecem como **Envio não
confirmado**. Confira a conversa antes de repetir: o sistema não reenvia às cegas.
O histórico é o que o WhatsApp disponibilizar, sem promessa de recuperação total.


## Grupos e importação do histórico

O nome do grupo vem dos metadados do WhatsApp, separado do nome do participante.
Mudanças de nome atualizam conversas existentes; a lista de grupos não cria conversas
vazias. A importação antiga é processada em lotes pequenos, com prioridade para
mensagens novas e sem bloquear a coleta de comandos de envio.

No canal por QR, anexos têm limite de100MB nesta versão. Os limites da Meta ficam
restritos ao canal oficial. Arquivos de formato ativo, como HTML, são guardados
como download genérico. Anexos antigos que o provedor declara expirados deixam
um aviso na conversa; o registro original fica cifrado na pasta deferred da inbox
local para revisão. Isso não garante recuperação do arquivo ausente no WhatsApp.
Preserve toda a inbox, incluindo live/history/deferred, ao mudar de computador.
