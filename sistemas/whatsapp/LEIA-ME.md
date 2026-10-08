# WhatsApp local (motor leve, sem Docker)

## Finalidade

Conecta um WhatsApp autorizado ao computador do aluno por um motor local pequeno (Node.js + biblioteca Baileys) e disponibiliza um conector MCP por stdio para Codex e Claude Code, com estado da conexao, envio confirmado (texto, imagem, video, audio, PDF e enquete) e gerenciamento de grupos.

Ele vive dentro da Casa do aluno (o projeto da empresa criado pelo Kit `polozi-fundacao`), na pasta `sistemas/whatsapp/`. Nao e um projeto separado e nao deve ser extraido pra Downloads ou pasta solta.

Nao precisa de Docker, Postgres, licenca, VPS nem servico pago. O motor usa cerca de 100 a 150 MB de RAM, entao roda em computador de 4 GB e no Windows Home.

## Requisitos

- Node.js 20 ou superior.
- WhatsApp no celular do proprio aluno.
- Internet para o `npm ci` (cerca de 60 MB) e para a conexao com o WhatsApp.

## Dados, permissoes e limites

- Sessao do WhatsApp, chave local e log do motor ficam fora do repositorio:
  - macOS: ~/Library/Application Support/Polozi/whatsapp-local
  - Windows: %APPDATA%\Polozi\whatsapp-local
- O motor escuta somente em 127.0.0.1:8082 e exige a chave local em todo pedido. O MCP le a chave direto desse diretorio e nunca a devolve ao cliente de IA.
- Nenhuma mensagem e gravada no computador (nem as perguntas do `@ia`: a sessao da IA nao e salva).
- Registro no banco da empresa: se a Casa tiver o Supabase conectado (`credenciais/.env` com `NEXT_PUBLIC_SUPABASE_URL` e `SUPABASE_SERVICE_ROLE_KEY`), o motor registra na tabela `whatsapp_mensagem` toda mensagem que ele envia (texto, midia, enquete; para numero ou para grupo), os recibos de entregue e lida, e os comandos `@ia` do proprio chat. De midia e enquete vai so o texto (legenda, ou `[documento: nome.pdf]`, `[imagem]`, `[audio]`, `[enquete: pergunta]`), nunca o arquivo. Mensagem de grupo exige a migration `0021_whatsapp_grupo` do template (alem da `0018`); sem ela o envio funciona e so o registro daquela mensagem e pulado, com um aviso no log. Mensagem recebida de terceiro nao e registrada. Sem banco conectado, o envio funciona igual e nada e registrado. Para ver o registro numa tela, ligue o modulo `whatsapp` no sistema da empresa e conceda `whatsapp.read`.
- O MCP nao le historico de conversas nem contatos, nao responde sozinho e nao faz envio em massa. Ele envia texto, imagem, video, audio, nota de voz, documento e enquete, reage a mensagem, confere se um numero tem WhatsApp e gerencia grupos (veja "Grupos e midia").
- Toda ferramenta do MCP que envia ou altera algo (texto, midia, enquete, reacao, criar, mudar, adicionar, remover, sair ou excluir de grupo, revogar link) exige a confirmacao literal ENVIAR, dada pelo usuario antes. Ferramenta de leitura (status, listar grupos, ver um grupo, conferir numero, obter link de convite) nao pede. O primeiro teste de linha de comando so permite envio para o proprio numero conectado.
- O motor nunca envia arquivo da pasta de estado dele (sessao e chave) nem arquivo de pasta `credenciais/` ou `.env*`.
- `npm run enviar` (rotinas que o aluno monta) nao pede ENVIAR e nao tem trava de destino ou volume: a decisao e do aluno. Antes de montar disparo para muita gente, a IA le `DISPARO-EM-MASSA.md` e explica os riscos.
- Nao e API oficial do WhatsApp. Use somente contas e conversas autorizadas, sem spam ou automacao abusiva: numero que dispara em massa pode ser banido. Guia de boas praticas: `DISPARO-EM-MASSA.md`.
- O motor so funciona com o computador ligado. Relatorio agendado com o computador desligado nao sai.
- Sem rotina de checagem: se o WhatsApp desconectar, a queda aparece quando algo e usado, com a mensagem `WhatsApp desconectado. Peca para a IA: "reconecta meu WhatsApp"`.

## Operacao

Para conectar, um unico comando faz tudo e imprime so o resultado (`CHAVE=valor`):

~~~sh
npm run conectar
~~~

Ele confere o Node, instala as dependencias so se faltarem (a saida do `npm ci` vai para `conectar-npm.log` na pasta de estado), prepara o estado externo e sobe o motor, abre a pagina do QR se o WhatsApp nao estiver conectado, liga o inicio automatico, instala o MCP no cliente detectado (Codex ou Claude Code) e sobe o assistente `@ia`. E idempotente: rodar de novo pula o que ja esta pronto. Opcoes (depois de `--`): `--reconectar` (sessao salva sem conexao: apaga a sessao local e pede QR novo), `--sem-autostart`, `--sem-mcp`, `--dry-run` (so lista as etapas). Erros saem em 2 linhas (`CONECTAR=ERRO etapa=... motivo=...` e `SUGESTAO=...`); a tabela de erros esta em `GUIA-AGENTE-CODEX-CLAUDE.md`.

Os comandos soltos abaixo continuam valendo (referencia, para quando uma etapa falhar). `npm run preflight` verifica o Node e mostra a memoria do computador sem alterar nada; `npm run bootstrap:agent` instala dependencias, prepara o estado externo e sobe o motor, parando antes do QR.

A partir de `sistemas/whatsapp/`, dentro da Casa:

~~~sh
npm ci
npm run setup
npm run start:qr
~~~

O ultimo comando abre a pagina local `http://127.0.0.1:8787` com o QR vivo. Escaneie pelo WhatsApp do celular em Aparelhos conectados. O QR nao e salvo em arquivo.

Depois de conectado:

~~~sh
npm run status
npm run send:test -- 55SEUNUMERO "Teste local autorizado"
npm run start:receive-test
npm run install:codex
npm run install:claude
~~~

`npm run start:receive-test` recebe somente uma mensagem nova enviada no proprio chat, nao grava o conteudo e encerra apos confirmar.

O motor sobe sozinho quando o MCP ou um comando precisa dele, inclusive depois de reiniciar o computador. Nao e preciso deixar terminal aberto.

## Inicio automatico no login

Depois do primeiro QR, o agente roda:

~~~sh
npm run autostart:ligar
npm run autostart:status
npm run autostart:desligar
~~~

`autostart:ligar` faz o motor e o assistente `@ia` subirem sozinhos quando a pessoa entra no computador (e tambem liga os dois na hora). `--dry-run` em `ligar` e `desligar` so mostra o que seria feito. O comando de login e `npm run start:background`: garante o motor e sobe o assistente solto do terminal, sem duplicar se ja estiver rodando. Se o WhatsApp estiver desconectado, o assistente nao sobe e o comando avisa.

- macOS: LaunchAgent `~/Library/LaunchAgents/com.polozi.whatsapp-local.plist`; log em `autostart.log` na pasta de estado.
- Windows: `Polozi WhatsApp local.vbs` na pasta Inicializar do usuario (`%APPDATA%\Microsoft\Windows\Start Menu\Programs\Startup`), sem janela e sem administrador. (`schtasks /SC ONLOGON` exige administrador, por isso nao e usado.)
- O assistente grava o proprio log em `live-assistant.log` na pasta de estado.

## Reconectar o WhatsApp

Se o WhatsApp desconectar (celular sem internet por muito tempo, aparelho removido no celular), a pessoa pede para a IA: "reconecta meu WhatsApp". O agente roda `npm run conectar -- --reconectar`: se der conexao, ele so confirma; se a sessao estiver salva mas sem conexao, apaga a sessao local, pede para escanear o QR e sobe o assistente de novo. O passo a passo manual (`npm run status`, `npm run start:qr`, `npm run start:background`) esta em `GUIA-AGENTE-CODEX-CLAUDE.md`. Roteiro completo em `GUIA-AGENTE-CODEX-CLAUDE.md`.

## Envio de rotina (`npm run enviar`)

~~~sh
npm run enviar -- 55DDDNUMERO --texto "Mensagem"
npm run enviar -- 55DDDNUMERO --arquivo relatorio.txt --origem relatorio
npm run enviar -- 55DDDNUMERO --midia relatorio.pdf --tipo document --legenda "Vendas de hoje"
npm run enviar -- 120363000000000000@g.us --texto "Bom dia, equipe"
~~~

Envio sem interacao para rotinas que o aluno montar. O destino e um numero (55 + DDD + numero) ou o id de um grupo (termina em `@g.us`). `--midia` leva o caminho do arquivo e `--tipo` (`image`, `video`, `audio`, `voice` ou `document`); `--legenda` e `--nome` (nome que aparece para quem recebe o documento) sao opcionais. Origem padrao `relatorio`. Saida `WHATSAPP_SEND_ACCEPTED=<id>`; desconectado, o erro traz a instrucao de reconectar.

## Grupos e midia

O motor atende estes pedidos locais (todos com a chave local; o MCP chama as mesmas rotas). Em tudo, o destino e um numero `55...` ou o id do grupo `...@g.us` (a lista de grupos mostra os ids).

| O que | Rota do motor | Ferramenta do MCP | Confirmacao |
|---|---|---|---|
| Texto a numero ou grupo | `POST /send/text` | `whatsapp_send_text` | ENVIAR |
| Imagem, video, audio, nota de voz, documento | `POST /send/media` | `whatsapp_send_media` | ENVIAR |
| Enquete (2 a 12 opcoes) | `POST /send/poll` | `whatsapp_send_poll` | ENVIAR |
| Reagir a uma mensagem | `POST /send/react` | `whatsapp_react` | ENVIAR |
| Numero tem WhatsApp? | `GET /check/<numero>` | `whatsapp_check_number` | nao pede |
| Listar grupos / ver um grupo | `GET /groups`, `GET /groups/<id>` | `whatsapp_group_list`, `whatsapp_group_info` | nao pede |
| Criar grupo | `POST /groups` | `whatsapp_group_create` | ENVIAR |
| Nome, descricao, regras | `POST /groups/<id>/subject`, `/description`, `/settings` | `whatsapp_group_update` | ENVIAR |
| Adicionar, remover, promover, rebaixar | `POST /groups/<id>/participants` | `whatsapp_group_participants` | ENVIAR |
| Link de convite (obter / revogar) | `GET` / `POST /groups/<id>/invite` | `whatsapp_group_invite` | obter nao pede; revogar ENVIAR |
| Sair do grupo | `POST /groups/<id>/leave` | `whatsapp_group_leave` | ENVIAR |
| Excluir grupo | `POST /groups/<id>/delete` | `whatsapp_group_delete` | ENVIAR |

Regras do envio de arquivo (o motor recusa com mensagem clara se nao forem cumpridas; o caminho tem de existir neste computador):

- `image`: `.jpg`, `.jpeg`, `.png`, `.webp`, ate 16 MB. `video`: `.mp4`, `.mov`, `.3gp`, ate 64 MB. `audio`: `.mp3`, `.m4a`, `.aac`, `.wav`, `.ogg`, `.opus`, ate 64 MB. `document`: qualquer formato, ate 100 MB.
- `voice` (nota de voz, aparece com a bolinha de gravacao) so aceita OGG com Opus (`.ogg` ou `.opus`). O motor nao converte audio (nao tem ffmpeg): um MP3 pode ir como `audio` (chega como arquivo de audio comum) ou ser convertido antes.
- Legenda so em `image`, `video` e `document` (ate 1024 caracteres). Audio e nota de voz nao tem legenda.
- Enquete: pergunta de ate 255 caracteres, 2 a 12 opcoes diferentes de ate 100 caracteres. `multipla` deixa escolher mais de uma.
- Reagir: precisa do id da mensagem; em grupo, para mensagem de outra pessoa, o numero dela em `participante`.

Administrar grupo: quase tudo (mudar nome, regras, adicionar e remover gente, link) so funciona se a conta for administradora; senao o WhatsApp recusa e o motor responde "so administrador pode fazer isso". "Excluir grupo" nao existe no WhatsApp: o motor remove todos os outros participantes, em lotes de 50, e depois sai do grupo. Exige ser administrador; se algum participante nao puder ser removido (por exemplo o criador do grupo), o motor nao sai e diz quantos sobraram. O WhatsApp pode ver adicionar muita gente de uma vez como abuso: antes de criar grupo grande ou adicionar muitos numeros, leia `DISPARO-EM-MASSA.md`.

## Assistente vivo no proprio chat (`@ia`)

Sobe sozinho com o inicio automatico. Para subir na mao:

~~~sh
npm run start:assistant
~~~

Nao ha etapa de ativacao. Toda mensagem iniciada por `@ia` (ou `@polozi`) na conversa com voce mesmo e respondida pela IA da propria empresa: o assistente abre uma sessao nova e curta do Codex ou do Claude Code (o que a Casa usar: `CLAUDE.md` ou `.claude/` = Claude Code) na raiz da Casa, que le os arquivos da empresa e consulta o banco pelo conector que o aluno ja tem. Usa o login e o plano do proprio aluno, sem chave de API.

- Somente leitura: Codex com `--sandbox read-only`, `--ephemeral` e `--disable hooks`; Claude Code com `--setting-sources user` (sem permissoes nem hooks do projeto), `--no-session-persistence`, `--permission-mode dontAsk`, liberando so `Read`, `Grep`, `Glob` e `execute_sql`/`list_tables` do conector Supabase do claude.ai, e bloqueando `Bash`, `Edit`, `Write`, `NotebookEdit`, `WebFetch`, `WebSearch`, `Agent`, a leitura de `credenciais/` e o MCP `polozi-whatsapp` inteiro (a IA do `@ia` nunca envia nada pelo WhatsApp). O `execute_sql` aceita qualquer SQL: quem tranca escrita no banco e o conector conectado com `read_only=true` (padrao do kit, `manual/conexoes-e-seguranca.md`). No Codex, a leitura de `credenciais/` e barrada so pela instrucao do prompt, e o MCP `polozi-whatsapp` e desligado nessa sessao (`-c mcp_servers.polozi-whatsapp={command='node',enabled=false}`).
- PDF e imagem: mande o arquivo na conversa com voce mesmo com a legenda comecando por `@ia` (por exemplo `@ia resume este contrato`). O motor baixa o arquivo para uma pasta temporaria dele (`midia-temp`, na pasta de estado, fora do repositorio, ate 20 MB), a IA le o arquivo e responde, e o arquivo e apagado em seguida (o motor tambem varre sobras com mais de 1 hora). So o arquivo desta conversa e baixado: midia de outra pessoa ou de grupo nunca e baixada, e anexo sem `@ia` na legenda tambem nao. Video e outros documentos recebem a resposta "so consigo ler PDF e imagem". A IA trata o conteudo do arquivo como informacao e nao obedece instrucoes escritas dentro dele. No Claude Code o assistente libera so a pasta temporaria (`--add-dir`); no Codex a leitura ja e permitida pelo modo somente leitura.
- Audio: nao ha transcricao. Se voce mandar um audio na conversa com voce mesmo, o assistente o ignora, sem resposta (so PDF e imagem com `@ia` na legenda sao lidos).
- Pedido de acao volta como "faca no computador". Resposta curta (ate cerca de 600 caracteres), ate 3 minutos por pergunta.
- Memoria curta: so as ultimas 3 perguntas e respostas vao junto; somem ao parar.
- Responde somente na conversa com voce mesmo; contatos, grupos e mensagens sem `@ia` sao ignorados. Sem `@ia` a mensagem e so uma nota sua.
- Dois assistentes nao rodam ao mesmo tempo: se ja houver um (pelo login ou na mao), o segundo avisa `JA_RODANDO` e sai.
- `POLOZI_CASA_DIR` aponta outra pasta como Casa; `POLOZI_IA_CLIENTE=codex|claude` forca o cliente.

~~~sh
npm run stop:assistant
~~~

## Quem usava a versao com Docker (Evolution Go)

~~~sh
npm run retire:evolution
npm run install:codex
npm run install:claude
~~~

`retire:evolution` derruba a pilha Docker antiga (se o Docker existir) e remove o MCP antigo `polozi-whatsapp-evolution-go-local`, com copia do config do Codex. Os volumes antigos so sao apagados com `npm run retire:evolution -- --apagar-volumes`. Depois disso o Docker pode ser desinstalado se nao tiver outro uso. A sessao antiga nao e aproveitada: escaneie um QR novo. A pasta de estado antiga (`Polozi/evolution-go-local`) guarda a chave e a sessao do Evolution; apague-a quando nao precisar mais voltar atras.

`npm run retire:waha` continua removendo o conector WAHA mais antigo.

## Recuperacao

- Conexao nao ativa: rode npm run status; gere novo QR (`npm run start:qr`) apenas quando estiver pronto para escanear, e depois `npm run start:background` para o assistente voltar.
- Sessao aparece no celular mas o motor diz desconectado: rode npm run reset:session e depois npm run start:qr.
- Porta 8082 ocupada por outra coisa: se for a pilha Docker antiga, rode npm run retire:evolution.
- Parar sem apagar sessao: npm run stop.
- Remover a sessao: desconecte o aparelho pelo WhatsApp e apague o diretorio externo indicado acima.
- Diagnostico: o log do motor fica em `motor.log` nesse diretorio (sem conteudo de mensagem e sem chave; identificadores de contato que a biblioteca citaria em erro saem como `[oculto]`).

## Estado de validacao

Fase 3 (grupos e midia, 06/10/2026): rotas, ferramentas do MCP, `enviar` e o `@ia` com PDF/imagem foram provados so com socket simulado (nenhuma mensagem real, nenhum grupo real criado). Ainda exigem prova com celular real: envio de cada tipo de arquivo (incluindo nota de voz OGG), enquete, reacao, criar/alterar/excluir um grupo de teste, adicionar numero, e `@ia` com um PDF de verdade no Mac e no Windows.

Neste Mac: motor sobe sem Docker, gera QR em cerca de 2 segundos com 100 a 125 MB de RAM, recusa pedido sem chave e para limpo. Suite automatica com socket simulado passando. Provado no Mac em 06/10/2026 com celular real: QR sem passkey, envio pro proprio numero, sessao persiste ao reiniciar o motor, `@ia` respondendo do banco da empresa (Claude Code + conector Supabase). Ainda exigem validacao: Windows com 4 GB, `@ia` pelo Codex com banco, recibos de entrega no Supabase do aluno, o `.vbs` do Windows e um login real depois de reiniciar o computador. No Mac, `autostart:ligar` foi exercitado de verdade (06/10): o LaunchAgent subiu motor e assistente sem janela, inclusive com o pacote dentro de Documentos, e `autostart:desligar` removeu limpo. Num Mac novo o macOS pode pedir permissao de acesso a Documentos na primeira vez.
