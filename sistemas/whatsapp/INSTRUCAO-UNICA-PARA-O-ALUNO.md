# Conecte seu WhatsApp

> No chat do projeto da SUA empresa (a Casa, aberta no Codex ou no Claude Code), escreva:

~~~text
Conecta meu WhatsApp.
~~~

Só isso. O pacote já veio dentro da sua empresa, em `sistemas/whatsapp/`: você não baixa nem extrai nada. A IA roda um único comando (`npm run conectar`): ele confere o Node.js, instala o que falta, abre o QR para você escanear no celular, liga o início automático e conecta o WhatsApp ao seu chat. Depois, se você quiser, ela faz um teste de envio para o seu próprio número (só depois do seu `ENVIAR`). Em caso de erro, ela consulta o `GUIA-AGENTE-CODEX-CLAUDE.md`.

Se o WhatsApp desconectar depois, escreva no mesmo chat: `Reconecta meu WhatsApp.`

Não use um chat web comum, pois ele não controla o computador, e não abra um projeto novo: o WhatsApp vive dentro da sua empresa.

## Alternativa: sua Casa é antiga (sem a pasta `sistemas/whatsapp/`)

Se a IA avisar que não existe `sistemas/whatsapp/package.json` na sua Casa, arraste o arquivo `whatsapp-local.zip` no chat e cole o texto abaixo.

~~~text
Leia GUIA-AGENTE-CODEX-CLAUDE.md dentro do zip que acabei de anexar e conduza a conexão do WhatsApp local nesta empresa.

Confirme que estamos dentro da Casa (AGENTS.md e MAPA-DA-EMPRESA-IA.md na raiz). Extraia o zip para sistemas/whatsapp/ dentro da Casa, ou reaproveite se já estiver lá. Rode todos os comandos técnicos a partir dessa pasta.

Depois rode npm run conectar: ele confere o Node, instala, sobe o motor, abre o QR, liga o início automático e instala o MCP no cliente que eu estou usando (Codex ou Claude Code, ele detecta). Se o Node.js não estiver instalado ou o comando disser FALTA_NODE, explique em linguagem simples e, se eu aprovar, instale pela fonte oficial adequada ao meu sistema e rode de novo. Não instale Docker: este pacote não usa. Não procure nem peça chaves, tokens ou senhas.

Pare somente quando eu precisar escanear o QR ou confirmar o envio de teste. Envie um teste apenas para o meu próprio número, depois que eu disser ENVIAR. Não ative leitura de histórico, contatos ou CRM, e não faça envio em massa sem antes ler e me explicar DISPARO-EM-MASSA.md. Se o WhatsApp desconectar depois, eu vou pedir "reconecta meu WhatsApp": rode npm run conectar -- --reconectar. Ao terminar, registre a conexão em credenciais/CONEXOES.md e uma linha em operacao/CHANGELOG.md da Casa, e me diga o resultado do comando.
~~~
