# WhatsApp local com IA (sem Docker)

> Se voce usa Codex ou Claude Code, comece por [GUIA-AGENTE-CODEX-CLAUDE.md](GUIA-AGENTE-CODEX-CLAUDE.md). Ele deixa os comandos e verificacoes com o agente e reserva ao aluno somente o QR e as confirmacoes de seguranca.

Esta trilha permite que Codex ou Claude Code chamem um conector local para enviar uma mensagem que voce revisou e confirmou. Ela roda no seu computador, de graca, sem Docker e sem servidor contratado. Nao e API oficial do WhatsApp e nao e uma promessa de que o WhatsApp aceitara todos os pareamentos.

## Antes de comecar

- Use o seu proprio WhatsApp e envie o primeiro teste para voce mesmo.
- Instale Node.js 20+ (site oficial nodejs.org). Nao precisa de Docker.
- Funciona em Windows (inclusive Home) e Mac, com 4 GB de RAM: o motor usa cerca de 100 a 150 MB.
- O WhatsApp so manda mensagem pelo motor enquanto o computador estiver ligado.

## Instalar

No Terminal do macOS ou PowerShell do Windows, dentro desta pasta:

~~~sh
npm ci
npm run setup
~~~

## Conectar

~~~sh
npm run start:qr
~~~

O comando abre uma pagina local com o QR. Abra o WhatsApp no celular, entre em **Aparelhos conectados** > **Conectar aparelho** e escaneie o QR dessa pagina. Nao gere varios QRs seguidos.

## Testar e usar com IA

Confirme a conexao:

~~~sh
npm run status
~~~

Envie o primeiro teste somente para o proprio numero:

~~~sh
npm run send:test -- 55SEUNUMERO "Teste local autorizado"
~~~

Confirme o recebimento no celular. Repita esse teste tres vezes antes de considerar a sessao aprovada.

Para testar o recebimento sem abrir a caixa de entrada:

~~~sh
npm run start:receive-test
~~~

Envie uma unica mensagem nova para o proprio chat. O modo confirma apenas o recebimento e encerra sem salvar o conteudo.

Para usar com IA:

~~~sh
npm run install:codex
~~~

ou:

~~~sh
npm run install:claude
~~~

No chat, primeiro peca um rascunho. Confirme telefone e texto. Somente entao autorize o envio com a palavra **ENVIAR**.

## Ligar sozinho com o computador

Para o WhatsApp e o assistente `@ia` subirem sozinhos quando voce liga o computador (sem janela aberta):

~~~sh
npm run autostart:ligar
~~~

Para ver como esta: `npm run autostart:status`. Para desligar: `npm run autostart:desligar`. Com o assistente no ar, toda mensagem que voce mandar para si mesmo comecando com `@ia` e respondida pela IA da sua empresa (so leitura). Mensagem sem `@ia` e so uma nota sua.

## Se o WhatsApp desconectar

Nao ha aviso automatico: a queda aparece quando voce usa. Se aparecer `WhatsApp desconectado. Peca para a IA: "reconecta meu WhatsApp"`, diga isso para a IA do projeto. Ela gera um QR novo para voce escanear e volta tudo ao normal.

## Envio de rotina e disparo em massa

`npm run enviar -- 55DDDNUMERO --texto "Mensagem"` manda uma mensagem sem pedir confirmacao, para rotinas que voce montar com a IA (por exemplo um relatorio diario). Ele nao tem trava de destino nem de volume. Se voce quer mandar para muita gente, peca para a IA ler `DISPARO-EM-MASSA.md` e explicar os riscos antes: numero que dispara em massa pode ser banido.

## Grupos, arquivos e enquetes

Depois de conectado, voce pode pedir para a IA, em portugues normal:

- "Manda esse PDF para o grupo da equipe." / "Manda essa imagem para a Maria." / "Manda esse audio." (nota de voz so funciona com arquivo `.ogg` ou `.opus`; um MP3 vai como arquivo de audio comum).
- "Faz uma enquete no grupo: almoco sexta? Opcoes: sim, nao."
- "Quais sao os meus grupos?" / "Quem esta no grupo da equipe?"
- "Cria um grupo chamado Clientes VIP com estes numeros." / "Muda o nome do grupo." / "Deixa so os administradores enviarem."
- "Adiciona a Joana no grupo." / "Tira o Pedro do grupo." / "Me da o link do grupo."

A IA sempre mostra o que vai fazer e so faz depois que voce escrever **ENVIAR**. Ver a lista de grupos ou conferir se um numero tem WhatsApp ela faz sem perguntar.

Cuidados:

- Mudar o grupo (nome, regras, adicionar e tirar gente) so funciona se **voce** for administrador dele.
- O WhatsApp nao tem "excluir grupo". Quando voce pedir isso, a IA **tira todo mundo e depois sai do grupo**. Nao da para desfazer, por isso ela vai pedir sua confirmacao.
- Criar grupo ja com muita gente, ou adicionar muita gente de uma vez, pode fazer o WhatsApp bloquear seu numero. Peca para a IA ler `DISPARO-EM-MASSA.md` e te explicar antes.
- Voce tambem pode mandar um **PDF ou imagem para voce mesmo** com a legenda `@ia` (por exemplo, `@ia resume este contrato`): a IA da sua empresa le o arquivo e responde, e depois o arquivo temporario e apagado. So vale para a conversa com voce mesmo; arquivos que outras pessoas mandam nunca sao lidos. Audio ainda nao e entendido: o assistente o ignora, sem resposta.

## Registro no banco da sua empresa

Se o sistema da sua empresa ja tem o Supabase conectado, cada mensagem enviada pelo motor (e se ela foi entregue e lida) fica registrada no banco da empresa, pronta para relatorio. `npm run status` mostra `WHATSAPP_REGISTRO_BANCO=configurado`. Sem banco conectado, o envio funciona igual. Mensagens que outras pessoas mandam para voce nao sao registradas. Para mensagens de grupo tambem serem registradas, o banco precisa da migration `0021_whatsapp_grupo` (a IA da empresa aplica; sem ela o envio funciona igual).

## Se algo falhar

- Sessao desconectada: rode npm run status, depois gere um QR novo (`npm run start:qr`) somente quando puder escanear. Em seguida `npm run start:background` para o assistente voltar.
- Sessao aparece no celular, mas o motor diz desconectado: rode npm run reset:session e depois npm run start:qr.
- Voce usava a versao antiga com Docker: rode npm run retire:evolution antes de tudo.
- Para parar: npm run stop. Isso preserva a sessao local.

Nao use este conector para disparos, respostas automaticas ou contatos sem autorizacao: numero que dispara em massa pode ser banido pelo WhatsApp.
