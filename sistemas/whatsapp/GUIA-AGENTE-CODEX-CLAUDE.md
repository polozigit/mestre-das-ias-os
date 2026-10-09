# Instalação guiada por Codex ou Claude Code

## Caminho rápido (use este; o resto do guia é referência e erros)

1. Dentro de `sistemas/whatsapp/` da Casa, rode `npm run conectar` (para "reconecta": `npm run conectar -- --reconectar`; para fixar a IA: `-- --cliente codex|claude`). Um comando faz tudo (Node, dependências, motor, QR, início automático, MCP, assistente `@ia`), é idempotente e imprime só linhas `CHAVE=valor`.
2. `CONECTAR=ESCANEIE_O_QR`: a página do QR já abriu, peça ao aluno para escanear (o comando espera até 15 min; se o terminal estourar o tempo antes, rode de novo). `CONECTAR=OK`: repasse ao aluno só o resultado (WhatsApp, número final, início automático, MCP, banco) e a linha `PROXIMO`.
3. `CONECTAR=ERRO etapa=<x>` ou `CONECTAR=FALTA_NODE`: use só a seção "Erros do `npm run conectar`" logo abaixo (leia até o próximo `##`). Teste de envio só se o aluno pedir, e só depois do `ENVIAR` dele (`npm run send:own-test`).

## Erros do `npm run conectar`

A saída de erro tem 2 linhas: `CONECTAR=ERRO etapa=<x> motivo=<curto>` e `SUGESTAO=<o que rodar>`. Repasse ao aluno em linguagem simples e aja pela etapa (o WhatsApp já pode estar conectado: o comando é seguro de rodar de novo).

| Saída | O que fazer |
|---|---|
| `CONECTAR=FALTA_NODE` | Node.js 20+ ausente. Explique e, se o aluno aprovar, instale pela fonte oficial do sistema dele; reabra o terminal e rode de novo. Comando `node` ou `npm` não encontrado é o mesmo caso. |
| `etapa=dependencias` | `npm ci` falhou (internet, disco). Leia o fim de `conectar-npm.log` na pasta de estado (caminho no `motivo`), corrija e rode de novo. |
| `etapa=motor` | Motor não subiu ou a porta 8082 responde outra coisa. Leia `motor.log` na pasta de estado. A pilha Docker antiga (Evolution) o comando desmonta sozinho (`EVOLUTION_ANTIGA=DESMONTADA`). Outro programa na porta: defina `WHATSAPP_LOCAL_PORT` com outra porta. |
| `etapa=whatsapp` | Sessão salva sem conexão (celular sem internet ou aparelho removido). Confira a internet do celular e rode de novo; se persistir, `npm run conectar -- --reconectar` (apaga a sessão local e pede QR novo). |
| `etapa=qr` | QR não escaneado em 15 min, ou porta 8787 ocupada por outro `start:qr`/`conectar`. Rode de novo com o celular em mãos. |
| `etapa=autostart` | `launchctl` ou a pasta Inicializar falhou. Rode `npm run autostart:ligar` e leia o erro; ou use `--sem-autostart`. |
| `etapa=cliente` | Não conseguiu gravar a escolha de IA na pasta de estado. Rode `npm run conectar -- --cliente codex` (ou `claude`) e leia o erro. |
| `etapa=mcp` | Nenhum cliente aceitou o MCP (`codex`/`claude` fora do PATH ou recusou). Rode `npm run conectar -- --cliente codex` (ou `claude`), ou `npm run install:codex`/`install:claude`, e leia o erro; ou use `--sem-mcp`. |
| `etapa=assistente` | Assistente `@ia` não subiu. Rode `npm run start:background`; log em `live-assistant.log` na pasta de estado. |
| `etapa=argumentos` | Opção inválida. Aceitas: `--reconectar`, `--sem-autostart`, `--sem-mcp`, `--dry-run`. |

## Objetivo

O aluno não baixa nem extrai nada. O pacote do WhatsApp já vem dentro da Casa (o projeto da empresa dele, criado pelo Kit `polozi-fundacao`), em `sistemas/whatsapp/`. Ele abre o chat do projeto e diz **"Conecta meu WhatsApp."** (o `AGENTS.md` da Casa manda a IA para este guia). O agente sobe o motor local e conduz a conexão até o QR e o primeiro envio de teste. Não há Docker nem licença: o motor é um processo Node leve (cerca de 100 a 150 MB de RAM).

Este pacote **nunca vira um projeto novo** e **nunca fica em Downloads**. Ele vive dentro da Casa do aluno, em `sistemas/whatsapp/`. Quem tem uma Casa antiga (criada antes de o pacote vir junto) usa o caminho alternativo: anexa `whatsapp-local.zip` (Passo 1, item 2, e seção "Caminho alternativo: Casa antiga").

## O que não pode ser automatizado

São confirmações da pessoa, não falhas do agente:

1. aprovar a instalação do Node.js, se ele faltar;
2. escanear o QR com o WhatsApp do próprio aluno;
3. confirmar o primeiro envio de teste ao próprio número.

Fora esses três pontos, o agente executa os comandos e confere os resultados.

## Passo 0 — Detectar a Casa

Antes de qualquer comando, confirme que o chat está aberto dentro de uma Casa (o projeto da empresa do aluno, criado pelo Kit `polozi-fundacao`), não numa pasta vazia:

1. Procure `AGENTS.md` e `MAPA-DA-EMPRESA-IA.md` na raiz do projeto aberto.
2. Achou os dois? Essa raiz é a Casa. Siga para o Passo 1.
3. Não achou? **Pare.** Não crie projeto novo, não extraia nada em Downloads nem em pasta solta. Explique ao aluno que o laboratório WhatsApp faz parte da empresa dele e precisa ser aberto de dentro do chat do projeto da empresa (o mesmo onde ele já conversa com a IA sobre a empresa). Se ele ainda não tem uma Casa, isso é outra etapa (fora deste guia) — não improvise uma.

## Passo 1 — Conferir o pacote em `sistemas/whatsapp/`

1. Se `sistemas/whatsapp/package.json` existir dentro da Casa, o pacote está lá: é o caso normal, porque ele vem junto com a Casa. **Não extraia nem baixe nada**, apenas siga para o Passo 2.
2. Se não existir (Casa antiga, criada antes de o pacote vir junto), é preciso o `whatsapp-local.zip` anexado no chat. Crie `sistemas/whatsapp/` (se não existir) e extraia todo o conteúdo do zip ali dentro: os arquivos do pacote (`GUIA-AGENTE-CODEX-CLAUDE.md`, `package.json`, `src/`, `tests/` etc.) ficam soltos direto em `sistemas/whatsapp/`, sem uma subpasta `whatsapp-local/` no meio. Sem zip anexado, pare e peça ao aluno para anexar `whatsapp-local.zip`.
3. A partir daqui, todo comando `npm run ...` deste guia roda com `cwd` (diretório de trabalho) igual a `sistemas/whatsapp/` dentro da Casa, nunca na raiz da Casa, nunca em Downloads.

## Passo 2 — Qual IA está rodando (Codex ou Claude Code)

**Nunca decida por arquivo da Casa:** a Casa do kit tem `AGENTS.md`/`.codex/` E `CLAUDE.md`/`.claude/`, então arquivo não diz quem está executando (teste real de 09/10: no Codex, a regra antiga escolheu `claude` e deu `spawn claude ENOENT`).

O `npm run conectar` decide sozinho, nesta ordem: `--cliente codex|claude` > `POLOZI_IA_CLIENTE` > escolha já gravada (arquivo `cliente-ia` na pasta de estado) > o que existe no PATH (só um = esse) > os dois: quem está executando agora (`CLAUDECODE=1` = Claude Code, `CODEX_THREAD_ID`/`CODEX_SESSION_ID` = Codex) > `codex`. A linha `MCP=` mostra onde registrou; o MCP vai para o escolhido e para o outro cliente se ele estiver instalado.

Para forçar: `npm run conectar -- --cliente codex` (ou `claude`). Isso grava a escolha, regrava o início automático com ela e reinicia o `@ia`. Se o cliente escolhido sumir do PATH, o `@ia` tenta o outro antes de errar.

## Roteiro de "Conecta meu WhatsApp" (o que o `npm run conectar` faz, para fazer na mão se uma etapa falhar)

O `npm run conectar` já executa as etapas abaixo, nesta ordem, pulando o que está pronto. Use os comandos soltos só quando uma etapa falhar (seção "Erros do `npm run conectar`"). Pare somente onde o aluno precisa agir (QR e `ENVIAR`):

1. Passos 0 a 2 acima.
2. `npm run preflight`. Se o Node.js não estiver pronto, explique em linguagem simples e, se ele aprovar, instale pela fonte oficial adequada ao sistema dele; refaça o preflight. Não instale Docker: este pacote não usa. Não procure nem peça chaves, tokens ou senhas.
3. `npm run bootstrap:agent` e depois `npm run start:qr`. Pare para ele escanear o QR.
4. Confirme o estado conectado (`npm run status`). Envie um teste apenas para o número dele, só depois de ele dizer `ENVIAR`.
5. Instale o MCP somente no cliente que ele usa (`npm run install:codex` ou `npm run install:claude`, conforme o Passo 2) e rode `npm run autostart:ligar` para o WhatsApp e o assistente `@ia` subirem sozinhos quando ele ligar o computador.
6. Não ative leitura de histórico, contatos ou CRM. Grupos e mídia só quando o aluno pedir (seção "Grupos e mídia"). Não faça envio em massa sem antes ler e explicar `DISPARO-EM-MASSA.md`.
7. Registre a conexão na Casa (seção "Integração com a Casa") e entregue uma checklist com Node, QR, conexão, envio, MCP, início automático e se o registro no banco está ativo.

## Caminho alternativo: Casa antiga

Só para a Casa criada antes de o pacote vir junto (sem `sistemas/whatsapp/package.json`). O aluno abre o chat do projeto da SUA empresa (a Casa), arrasta o arquivo `whatsapp-local.zip` e cola o texto abaixo.

~~~text
Leia GUIA-AGENTE-CODEX-CLAUDE.md dentro do zip que acabei de anexar e conduza a conexão do WhatsApp local nesta empresa.

Confirme que estamos dentro da Casa (AGENTS.md e MAPA-DA-EMPRESA-IA.md na raiz). Extraia o zip para sistemas/whatsapp/ dentro da Casa, ou reaproveite se já estiver lá. Rode todos os comandos técnicos a partir dessa pasta.

Depois rode npm run conectar: ele confere o Node, instala, sobe o motor, abre o QR, liga o início automático e instala o MCP no cliente que eu estou usando (Codex ou Claude Code, ele detecta). Se o Node.js não estiver instalado ou o comando disser FALTA_NODE, explique em linguagem simples e, se eu aprovar, instale pela fonte oficial adequada ao meu sistema e rode de novo. Não instale Docker: este pacote não usa. Não procure nem peça chaves, tokens ou senhas.

Pare somente quando eu precisar escanear o QR ou confirmar o envio de teste. Envie um teste apenas para o meu próprio número, depois que eu disser ENVIAR. Não ative leitura de histórico, contatos ou CRM, e não faça envio em massa sem antes ler e me explicar DISPARO-EM-MASSA.md. Ao terminar, registre a conexão em credenciais/CONEXOES.md e uma linha em operacao/CHANGELOG.md da Casa, como descrito na seção "Integração com a Casa" do guia, e me diga o resultado do comando.
~~~

## O que o agente executa (a partir de `sistemas/whatsapp/`)

~~~text
npm run conectar            # tudo de uma vez (caminho rápido); opções: --reconectar --sem-autostart --sem-mcp --dry-run
npm run send:own-test       # só depois do ENVIAR do aluno
~~~

Comandos soltos (referência, para quando uma etapa do `conectar` falhar):

~~~text
npm run preflight
npm run bootstrap:agent
npm run start:qr
npm run status
npm run install:codex
ou
npm run install:claude
npm run autostart:ligar
npm run autostart:status
~~~

`npm run conectar -- --dry-run` só lista as etapas, sem executar nada. A saída do `npm ci` vai para `conectar-npm.log` na pasta de estado, não para o terminal.

`npm run bootstrap:agent` executa `npm ci`, cria a configuração externa e sobe o motor local. Ele não executa QR nem envio por conta própria. `npm run status` mostra a conexão e `WHATSAPP_REGISTRO_BANCO` (`configurado` quando a Casa tem o Supabase em `credenciais/.env`, `sem_banco` quando não tem; o envio funciona nos dois casos).

## Início automático e assistente `@ia`

Depois do primeiro QR e do teste de envio, rode `npm run autostart:ligar`. Ele faz o motor e o assistente `@ia` subirem sozinhos toda vez que o aluno entra no computador, sem janela aberta, e também liga os dois na hora. O comando usa o caminho do Node que o está executando e a pasta onde este pacote está, então rode sempre de dentro de `sistemas/whatsapp/` da Casa. Para ver o que seria feito sem alterar nada, use `npm run autostart:ligar -- --dry-run`.

- macOS: cria o LaunchAgent `~/Library/LaunchAgents/com.polozi.whatsapp-local.plist` (o macOS pode mostrar um aviso de "item em segundo plano": avise o aluno que é esperado).
- Windows: grava `Polozi WhatsApp local.vbs` na pasta Inicializar do usuário (`%APPDATA%\Microsoft\Windows\Start Menu\Programs\Startup`). Não precisa de administrador.
- `npm run autostart:status` mostra se está ligado e se o assistente está rodando; `npm run autostart:desligar` remove.
- `npm run start:background` faz o mesmo que o login faz (garante o motor e sobe o assistente sem duplicar). É o comando para subir o assistente de novo depois de reconectar.

O assistente responde, na conversa do aluno consigo mesmo, toda mensagem que começa com `@ia` ou `@polozi`. Não existe etapa de ativação (`@ia ativar` não é mais usado). Mensagem sem `@ia` é ignorada. A IA que responde é somente leitura (veja o `LEIA-ME.md`). O assistente só roda com o computador ligado e o WhatsApp conectado.

## Reconectar

O WhatsApp pode desconectar sozinho (celular sem internet por muito tempo, aparelho removido em "Aparelhos conectados", sessão encerrada). Não há rotina de checagem: a queda aparece quando algo é usado. Se qualquer comando, o MCP ou o assistente disser `WhatsApp desconectado. Peca para a IA: "reconecta meu WhatsApp"` (sem acento, exatamente assim), ou se o aluno disser "reconecta meu WhatsApp", rode `npm run conectar -- --reconectar`: se a sessão estiver conectada ele só confirma; se estiver salva mas sem conexão, apaga a sessão local e abre o QR novo; no fim sobe o assistente `@ia` de novo. O passo a passo manual equivalente:

1. Rode `npm run status`. Se mostrar `WHATSAPP_CONNECTION=CONNECTED`, não há o que reconectar (confirme se o problema era outro).
2. Se mostrar `NOT_CONNECTED`, rode `npm run start:qr`.
3. Peça ao aluno para escanear o QR da página local (WhatsApp no celular > Aparelhos conectados > Conectar aparelho).
4. Rode `npm run status` de novo e confirme `CONNECTED`.
5. Rode `npm run start:background` para o assistente `@ia` voltar (ele não sobe sozinho enquanto o WhatsApp está desconectado).

Se o celular ainda mostra o aparelho conectado mas o status continua `NOT_CONNECTED`, rode `npm run reset:session` antes do passo 2.

## Envio de rotina (`npm run enviar`)

Para rotinas que o aluno montar (relatório diário, lembrete): `npm run enviar -- 55DDDNUMERO --texto "mensagem"` ou `--arquivo caminho.txt`. Origem padrão `relatorio` (`--origem` aceita mcp, assistente, teste, relatorio, outro). Não pede `ENVIAR` e não tem trava de destino ou volume: quem decide é o aluno, então confirme com ele o destino e o texto ao montar a rotina. Saída: `WHATSAPP_SEND_ACCEPTED=<id>` ou `WHATSAPP_SEND_ERROR=...`. O número é validado como no envio normal (DDI 55, DDD e número, só dígitos; texto de até 2000 caracteres). A rotina só roda com o computador ligado.

**Quando o aluno pedir disparo em massa** (mandar para uma lista, para muita gente), **leia `DISPARO-EM-MASSA.md` e explique os riscos e as boas práticas antes de montar**.

## Grupos e mídia

Quando o aluno pedir para mandar arquivo, áudio, enquete ou mexer em grupo, use as ferramentas do MCP `polozi-whatsapp`. Regra de ouro: **toda ferramenta que envia ou altera exige a palavra `ENVIAR` do aluno, dada DEPOIS de você mostrar o que vai acontecer** (destino, arquivo, texto, números). Não passe `confirmation` por conta própria. Ferramenta de leitura roda sem pedir nada.

| O aluno pede | Ferramenta | Antes de usar |
|---|---|---|
| "manda esse PDF / imagem / vídeo para fulano ou para o grupo X" | `whatsapp_send_media` (`tipo`: `document`, `image`, `video`, `audio` ou `voice`) | Mostre o destino, o nome do arquivo e a legenda. Confirme o caminho completo do arquivo. |
| "manda um áudio" | `whatsapp_send_media` com `audio` (arquivo comum) ou `voice` (nota de voz) | `voice` só aceita OGG com Opus (`.ogg`/`.opus`). O motor não converte: se o arquivo for MP3/M4A, ofereça enviar como `audio` ou peça para converter. |
| "faz uma enquete" | `whatsapp_send_poll` | Mostre pergunta e opções (2 a 12). |
| "reage com 👍 àquela mensagem" | `whatsapp_react` | Precisa do id da mensagem; em grupo, do número de quem enviou. |
| "esse número tem WhatsApp?" | `whatsapp_check_number` | Nada (leitura). |
| "quais são meus grupos?", "quem está no grupo X?" | `whatsapp_group_list`, `whatsapp_group_info` | Nada (leitura). O id do grupo (`...@g.us`) vem da lista. Descubra o id pelo nome com `whatsapp_group_list`; nunca invente. |
| "cria o grupo X com fulano e ciclano" | `whatsapp_group_create` | Mostre nome e números. Grupo grande: veja o aviso abaixo. |
| "muda o nome / a descrição / só admin envia" | `whatsapp_group_update` | Precisa ser administrador. |
| "adiciona / remove / promove fulano" | `whatsapp_group_participants` (`add`, `remove`, `promote`, `demote`) | Precisa ser administrador. Aviso abaixo. |
| "me dá o link do grupo" / "invalida o link" | `whatsapp_group_invite` | Obter não pede confirmação. Revogar (`revogar: true`) pede `ENVIAR`: o link antigo para de funcionar. |
| "sai do grupo X" | `whatsapp_group_leave` | O grupo continua existindo para os outros. |
| "exclui o grupo X" | `whatsapp_group_delete` | Veja abaixo. |

**"Excluir grupo" não existe no WhatsApp.** A ferramenta `whatsapp_group_delete` **remove todos os outros participantes e depois sai do grupo**. Não dá para desfazer. Antes de usar: mostre o nome do grupo e quantas pessoas serão removidas (`whatsapp_group_info`), diga com essas palavras o que vai acontecer e só use depois do `ENVIAR`. Precisa ser administrador. Se alguém não puder ser removido (por exemplo o criador), a ferramenta não sai do grupo e informa `restantes`; explique isso ao aluno. Se ele só quer deixar de participar, use `whatsapp_group_leave`.

**Risco de adicionar muita gente de uma vez.** Criar grupo já com dezenas de números, ou adicionar muita gente em sequência, pode ser tratado pelo WhatsApp como abuso e levar a bloqueio do número. Antes de qualquer lote grande, **leia `DISPARO-EM-MASSA.md` e explique os riscos** (só quem conhece e pediu para entrar, aos poucos, com intervalo, parar se reclamarem). Adicionar alguém que não tem o número salvo ou não quer ser adicionado também falha ou gera denúncia: a ferramenta devolve o status por número (`403` = a pessoa não aceita ser adicionada por quem não tem o contato; mande o link de convite).

Por linha de comando (rotinas que o aluno montar): `npm run enviar -- <número ou id do grupo> --midia caminho --tipo document --legenda "texto"` (sem `ENVIAR`, sem trava; o mesmo cuidado do disparo em massa vale). O motor nunca envia arquivo da pasta de estado dele nem de `credenciais/` ou `.env*`.

**`@ia` com PDF ou imagem.** O aluno pode mandar um PDF ou imagem na conversa com ele mesmo, com a legenda `@ia ...`; o assistente baixa o arquivo para uma pasta temporária, a IA da empresa lê e responde, e o arquivo é apagado. Só vale para a conversa dele consigo mesmo. Áudio não é transcrito: o assistente ignora o áudio, sem resposta. Se o aluno perguntar por que a IA não leu o arquivo de outra pessoa ou de um grupo: por privacidade, mídia de terceiros nunca é baixada.

Se o registro no banco estiver ativo, mensagens de grupo, mídia e enquete entram em `whatsapp_mensagem` só como texto (legenda ou `[documento: nome.pdf]`, `[imagem]`, `[audio]`, `[enquete: pergunta]`). Isso precisa da migration `0021_whatsapp_grupo` do template; sem ela o envio funciona e o registro daquela mensagem é pulado (aviso no log do motor).

## Diferenças por sistema

| Tema | macOS | Windows |
|---|---|---|
| Terminal que o agente usa | Terminal | PowerShell ou terminal do editor |
| Requisito | Node.js 20+ | Node.js 20+ (Windows Home serve) |
| Estado local | `~/Library/Application Support/Polozi/whatsapp-local` | `%APPDATA%\Polozi\whatsapp-local` |
| Comandos | iguais | iguais |

## Limites da automação no Windows

O agente pode baixar e iniciar a instalação do Node.js quando a pessoa aprovar; o Windows pode pedir senha de administrador. Não há WSL, virtualização na BIOS nem reinício: o motor é um programa Node comum. O motor sobe sozinho quando o MCP precisa dele e, com `npm run autostart:ligar`, também ao entrar no Windows (pasta Inicializar, sem janela). Só funciona com o computador ligado.

## Aluno que já tinha a versão com Docker (Evolution Go)

Rode `npm run retire:evolution` antes do `bootstrap:agent`: ele para a pilha Docker antiga e remove o MCP antigo `polozi-whatsapp-evolution-go-local`. Depois instale o MCP novo (`polozi-whatsapp`) e gere um QR novo. Não apague volumes nem desinstale o Docker sem a pessoa pedir.

## Integração com a Casa

Depois que o MCP estiver instalado e o teste de envio confirmado, feche o trabalho registrando a conexão nos arquivos vivos da Casa (nunca crie arquivo novo pra isso, edite os dois existentes):

1. Abra `credenciais/CONEXOES.md` na raiz da Casa e acrescente uma linha na tabela existente, seguindo as colunas já usadas (`Serviço | Para quê | Tipo | Variável | Conectado em`):

   ~~~text
   | WhatsApp local (motor Baileys) | Enviar mensagem via MCP a partir do chat e registrar no banco da empresa | local, estado fora do repositório | — | AAAA-MM-DD |
   ~~~

   Nunca escreva a chave, o token ou o conteúdo do `.env` local nessa linha — o padrão da Casa é catalogar a conexão, não o segredo. O estado deste pacote (chave e sessão) vive fora do repositório (`~/Library/Application Support/Polozi/whatsapp-local` ou `%APPDATA%\Polozi\whatsapp-local`). O registro de mensagens usa as credenciais do Supabase que a Casa já tem em `credenciais/.env`; não crie variável nova.

2. Abra `operacao/CHANGELOG.md` na raiz da Casa e acrescente uma linha ao final:

   ~~~text
   - AAAA-MM-DD: WhatsApp local (motor Baileys, sem Docker) instalado em sistemas/whatsapp/, MCP polozi-whatsapp conectado no <Codex ou Claude Code>, início automático ligado (npm run autostart:ligar).
   ~~~

3. Use a data real do dia da instalação nos dois arquivos.

## Critério de aprovação do roteiro

O roteiro só entra no curso depois de uma execução limpa em Mac e outra em Windows, por uma pessoa que não participou da criação. Cada execução deve registrar apenas:

~~~text
Sistema e versão
Node detectado
RAM total do computador
QR exibido
WhatsApp conectado
Mensagem de teste recebida
MCP do cliente escolhido confirmado
Início automático ligado (npm run autostart:status)
Registro no banco: configurado ou sem_banco
Falha encontrada e solução, se houver
~~~

Não registrar QR, token, chave, sessão ou conteúdo de mensagens.
