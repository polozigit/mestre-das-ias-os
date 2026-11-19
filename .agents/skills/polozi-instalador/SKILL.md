---
name: polozi-instalador
description: "Começa ou retoma a instalação da Casa (do zip ou clonada), etapa por etapa. Chame com $polozi-instalador; não cria pasta nova."
---

# Polozi Instalador

Configurar a Casa que já veio pronta (descompactada do zip do curso, o
caminho da aula; ou clonada do repositório-modelo `polozigit/mestre-das-ias-os`,
caminho secundário que continua valendo), nunca criá-la do zero, e
conduzir a jornada de instalação do começo ao fim, ou retomá-la de onde
parou, delegando cada etapa pra skill certa e nunca inventando uma etapa
como concluída.

## Preparar

1. Resolver o caminho absoluto da pasta ABERTA no Codex. O destino é sempre
   essa pasta — esta skill nunca pergunta caminho nem cria pasta nova. Esse
   caminho é `<PASTA_ABERTA>` no resto desta SKILL.md.
2. Não aceitar como concluída nenhuma etapa que a skill responsável não
   confirmou ter entregue. O estado vem só do que foi de fato feito.
3. Resolver `<SKILL_DIR>` e `<SKILL_IRMA>` seguindo o bloco "Resolver
   `<SKILL_DIR>`" abaixo, ANTES de rodar qualquer comando `.py` desta skill.
4. Saber de onde a Casa veio (o preflight conta no item `casa_git`):
   - **Descompactada do zip** (o caminho da aula): pasta sem `.git` e sem `origin`,
     com o `AGENTS.md` logo na raiz. A etapa da Casa inicia o git; só commit
     local até a etapa do GitHub, que cria o repositório do aluno e liga o `origin`.
   - **Clonada do repositório-modelo** (caso secundário): tem `.git` e o `origin`
     termina em `polozigit/mestre-das-ias-os`. Esse `origin` é do MODELO, não do
     aluno: enquanto for, NUNCA `git push` e NUNCA `gh repo rename`. A etapa do
     GitHub troca o `origin` pelo repositório do aluno antes de qualquer push.

### Resolver `<SKILL_DIR>`

Não existe hoje variável oficial que entregue à skill o próprio caminho;
`$CWD` só serve pra descoberta, não é garantia de onde a skill está
instalada [24a:skills/n09]. `PLUGIN_ROOT` só existe pra hook, não pra skill
[24a:plugins/n10]. Por isso o caminho tem que ser ACHADO, com comando
portátil (nunca `ls`/`test -f`/bashismo — o público majoritário é Windows).

Candidato 0 (opcional): se a listagem inicial do Codex mostrar um "file
path" e ele apontar pra um `SKILL.md` que existe, use a pasta desse
`SKILL.md` como primeiro candidato antes da busca abaixo [24a:skills/n09].

Buscar, NESTA ORDEM, do mais perto pro mais longe, um candidato de cada vez:

1. `<PASTA_ABERTA>/.agents/skills/polozi-instalador/scripts/preflight.py`
2. `~/.agents/skills/polozi-instalador/scripts/preflight.py`
3. cache de plugin, por GLOB — NUNCA escreva a versão do plugin fixa no
   meio do caminho (a doc publicada diz que a versão vale "local", o disco
   de hoje mostra "2.0.0" [24a:plugins/n11] — as duas coisas driftam, então
   varrer com glob, nunca hardcodar). Esse padrão de busca é
   `<PADRAO_GLOB_CACHE>`:
   `~/.codex/plugins/cache/*/polozi-fundacao/*/skills/polozi-instalador/scripts/preflight.py`.
   Se o glob achar mais de um caminho, usar o de data de modificação mais
   recente.

Checar cada candidato com comando portátil (Mac/Windows), NUNCA `ls`/`test -f`:

```
<PY> -c "import pathlib,sys; print('OK' if pathlib.Path(sys.argv[1]).expanduser().is_file() else 'MISSING')" "<candidato>"
```

Pro item 3 (glob), resolver primeiro o candidato mais recente, usando o
padrão de busca já dado acima (`<PADRAO_GLOB_CACHE>`):

```
<PY> -c "import glob,os,sys; c=sorted(glob.glob(os.path.expanduser(sys.argv[1])), key=os.path.getmtime, reverse=True); print(c[0] if c else '')" "<PADRAO_GLOB_CACHE>"
```

O primeiro candidato que responder `OK` (ou que o glob devolver não-vazio)
vira `<SKILL_DIR>` — a pasta que contém `scripts/preflight.py` (sem o
`scripts/preflight.py` no final).

Nenhum caminho achou → **PARE**: esta skill está instalada incompleta
(falta `scripts/preflight.py`). Mostre ao aluno e peça pra baixar o zip do
kit de novo, descompactar e abrir no aplicativo a pasta que tem o `AGENTS.md`
dentro, não a de fora. Não improvise caminho, não rode nada relativo, não
copie script pra dentro da Casa.

Depois de achar `<SKILL_DIR>`, procurar `<SKILL_IRMA>` — a skill
`polozi-criar-empresa-ia` — NO MESMO diretório de skills onde `<SKILL_DIR>`
foi achado (achou em `~/.agents/skills/polozi-instalador`? procure em
`~/.agents/skills/polozi-criar-empresa-ia`; achou no cache numa versão
`X`? procure em `.../polozi-fundacao/X/skills/polozi-criar-empresa-ia`, a
MESMA `X` que achou o instalador, nunca fixa). Não existir ali → **PARE**,
com a mesma mensagem acima.

## Comando do Python (faça isto antes de qualquer comando)

Tentar, UM DE CADA VEZ e sem encadear com `||` (cmd/PowerShell do Windows não
garantem o encadeamento):

```
python3 --version
py -3 --version
python --version
```

O PRIMEIRO que imprimir `Python 3.` vira o `<PY>` provisório — todo comando
desta skill, daqui pra frente, escreve `<PY>` no lugar de "python". Pode ser o
3.9 que vem com o Mac: ele roda o preflight e o instalador de requisitos. Depois
que o preflight gravar `comando_python:` em `operacao/INSTALACAO.md` (campo do
frontmatter; o script da ETAPA 0 faz isso sozinho com `--gravar`) com um Python
3.10 ou mais novo, `<PY>` passa a ser ESSE comando (no Mac pode ser o caminho
completo do Python do instalador oficial, em `/Library/Frameworks/Python.framework/`).
Nenhum comando desta skill pode conter `python3` literal fora desta checagem de
versão.

Nenhum dos 3 respondeu (não há Python): no Mac, rode `xcode-select --install`
(traz o git e um Python), espere a janela do sistema terminar e tente de novo.
No Windows, rode direto, sem script (não há Python pra rodar um):

```
winget install --exact --id Python.Python.3.12 --scope user --silent --accept-package-agreements --accept-source-agreements
```

Sem winget: baixe `https://www.python.org/ftp/python/3.13.16/python-3.13.16-amd64.exe`
e rode com `/quiet InstallAllUsers=0 PrependPath=1`. Depois peça ao aluno uma
conversa nova (o Windows só enxerga o programa novo numa conversa nova) e
`$polozi-instalador` de novo.

## ETAPA 0 — `0-preflight` (antes de tudo)

Retomada numa Casa já instalada: rode uma vez
`<PY> .codex/hooks/registro_trabalho.py ligar` (liga o registro de tarefas dos pedidos).

1. ANTES de tudo, a conferência do acesso total e do Computer Use (item 4,
   segunda parte): faltou um dos dois, mostre o passo e PARE ali. Depois rodar,
   com o caminho absoluto localizado em "Preparar":
   ```
   <PY> <SKILL_DIR>/scripts/preflight.py --pasta "<PASTA_ABERTA>" --json
   ```
2. **Faltou programa (`py`, `node`, `git` ou `gh` em `bloqueio`).** Antes de
   parar, rode `<PY> <SKILL_DIR>/scripts/instalar_requisitos.py --plano`,
   diga em 1 linha o que vai instalar e instale, sem perguntar (instalar o
   que o sistema precisa é autorização permanente da Casa): um por um, na ordem (Mac: `git` primeiro,
   que traz as Command Line Tools, depois `py`, `node`, `gh`; Windows: `py`,
   `git`, `node`, `gh`), rode `<PY> <SKILL_DIR>/scripts/instalar_requisitos.py --instalar <id>`
   e repasse ao aluno a linha `ACAO_DO_ALUNO` (a senha do Mac é digitada por ele
   NA JANELA DO SISTEMA; a IA nunca digita senha). Com o Computer Use ligado
   (conferido no item 4), a IA clica sozinha nas janelas comuns do instalador (Continuar);
   a janela de senha e a de permissão do sistema (no Windows, a área protegida)
   ficam com o aluno, porque o Computer Use não aprova permissão do sistema nem
   age como administrador. Se o Codex pedir aprovação pra baixar ou abrir, o
   acesso total não está ligado na tela: volte à conferência do item 4. Terminado cada instalador, mostre o `DEPOIS`:
   no Mac rode o preflight de novo nesta mesma conversa; no Windows peça uma
   conversa nova e `$polozi-instalador` de novo (o PATH novo só vale em processo
   novo). "Não" = PARE com o `como_resolver` de cada item, como no passo
   seguinte.
3. Ler todos os itens (cada um traz `id`, `estado`, `evidencia` e
   `como_resolver`). QUALQUER item `bloqueio` = PARE, mostre o `como_resolver`
   daquele item e não avance — não renderize nada, não rode git. Itens
   `aviso` e `nao_verificavel` seguem, mas entram no registro. Três itens
   merecem atenção:
   - `codex`: o kit pede o Codex 0.160 ou mais novo, porque os agentes de
     veredito usam o modelo `gpt-6.1-sol`, que a 0.146 recusava com conta
     ChatGPT (a 0.160.1 aceitou em 07/10/2026). Versão antiga é `bloqueio` e o
     `como_resolver` já traz os comandos de atualização. Sem o comando `codex`
     no terminal (quem usa só o app) fica `nao_verificavel`: peça pro aluno
     atualizar o app do Codex pra versão mais recente.
   - `node`: o sistema roda no Next.js 16, que exige o Node 20.9 ou mais novo
     (doc do Next e `engines` do `next` no `package-lock.json` do sistema).
     Abaixo disso é `bloqueio` e o `como_resolver` traz a instalação
     (o instalador instala sozinho com o OK do aluno, ou nodejs.org, versão LTS). Do 20.9 ao 21.x é `aviso`: o pacote do Supabase
     do sistema declara o Node 22, então o npm avisa na instalação; recomende o
     Node 22 LTS ou mais novo, sem bloquear.
   - `casa_git`: conta se a Casa é clonada do repositório-modelo ou do zip.
     Nunca bloqueia: `.git` com `origin` do modelo não é erro.
4. **Confiar na pasta e conferir acesso total e Computer Use.** Instruir o aluno a marcar esta pasta como confiada
   no Codex — sem isso o `.codex/config.toml` E o `.codex/rules/` do projeto
   são ignorados EM SILÊNCIO [24a:config/f2, hooks/f05]. Dizer, com todas as
   letras, que NÃO existe hoje comando publicado que prove que o config do
   projeto carregou. Por isso: perguntar ao aluno se ele confirma que
   confiou na pasta. A prova de que o config e os hooks da Casa carregaram
   vem depois: numa conversa nova, depois da `3-casa`, o hook mostra o bloco
   `VERIFICACAO DE ESTADO`. A Casa não fixa modelo nem esforço: o seletor de
   modelo do chat e a permissão escolhida na tela podem valer mais que o
   `.codex/config.toml` [24a:config/n65], e quem escolhe o modelo é o dono,
   no seletor do app. Não confira nem peça um modelo específico.
   **Acesso total e Computer Use NÃO são ligados por este instalador:** são
   a configuração que o professor faz junto com o aluno, no telão, ANTES do
   instalador (atividade "Configurar o Codex" do plano), porque sem o
   Computer Use a IA nem consegue operar o computador. O `.codex/config.toml`
   da Casa já pede `danger-full-access` e `approval_policy = "never"`, mas a
   tela vale mais. Aqui a IA só CONFERE: a permissão desta conversa, que ela
   vê no próprio ambiente, é sem sandbox e sem pedir aprovação (o chat mostra
   o selo "Acesso completo"), e as ferramentas do Computer Use estão
   disponíveis. Faltou um dos dois? Mostre o passo exato e PARE, sem seguir
   a instalação: acesso total = Configurações, Geral, ligar "Acesso total", e
   no seletor de permissão do chat escolher o acesso total ("Full access";
   ligar nas Configurações não troca o chat já aberto); Computer Use =
   Plugins, Computer Use, instalar o plugin, ligar o servidor e a skill, "Try
   now" (no Mac, conceder Gravação de Tela e Acessibilidade). A IA não liga
   nenhum dos dois: o Computer Use não opera o próprio ChatGPT. Não liga
   (conta de empresa, política do administrador)? Chame o professor. As
   guardas da Casa continuam valendo em acesso total: o hook que recusa ação
   perigosa roda igual [24a:hooks/n66]. Só então peça o "sim".
   SÓ com o "sim" dele gravar `projeto_confiado: sim` no frontmatter — nunca
   gravar `sim` por conta própria. Sem comando que prove, o que vale é o bloco
   `VERIFICACAO DE ESTADO` na conversa nova. A confiança dos HOOKS é outra coisa e vem no FIM da
   `3-casa`, depois que o comando gera o `.codex/hooks.json`: nesta etapa a
   pasta só tem o `.codex/hooks.json.modelo` (o Codex não lê esse nome), com
   `{{CASA_ABS}}` nos comandos. NÃO peça pra confiar em hooks aqui: um
   `hooks.json` com o placeholder cru faria o `PreToolUse` sair 2 e NEGAR toda
   ferramenta, e confiar antes do arquivo definitivo derruba a confiança em
   silêncio (a confiança de hook não-gerenciado é rastreada pelo HASH da
   definição: mudou o arquivo, o hash muda, a confiança some).
5. **Chrome.** A IA usa o Chrome do aluno, já logado, pra
   todo site sem CLI nem conector (cadastro, painel, OAuth, copiar chave),
   pelo Computer Use; nunca o navegador embutido do app nem o da nuvem. Toda
   página abre por comando no Chrome, nunca por link clicado no chat (o app
   não tem opção pra mandar link pro navegador externo): no Mac
   `open -a "Google Chrome" "<url>"`, no Windows `start chrome "<url>"`. Chrome
   ainda não é o navegador padrão? A IA faz sozinha: abre o Chrome (sem Chrome, baixa e abre o instalador oficial
   de google.com/chrome; a janela do sistema é do aluno) e, nas
   configurações do Chrome, "Navegador padrão", clica em tornar padrão (a
   confirmação do sistema é do aluno). Senha, código de SMS e 2FA são sempre
   do aluno: a IA nunca digita nem pede.
6. Fechar a ETAPA 0, com o mesmo caminho absoluto:
   ```
   <PY> <SKILL_DIR>/scripts/preflight.py --pasta "<PASTA_ABERTA>" --gravar
   ```
   Isso carimba o resultado item a item em `operacao/INSTALACAO.md`.

## As 3 perguntas (as únicas)

Perguntar, nesta ordem, só isto:

1. "Qual o nome da empresa?"
2. "Qual o nome do dono?"
3. "Qual o e-mail do dono? É com ele que vc entra no sistema."

Tudo o mais (sistema operacional, caminho da pasta, versões de
python/node/git/gh/docker/codex, Chrome, se a pasta sincroniza) é DETECTADO ou
PROVADO POR COMANDO, nunca perguntado.

### O nome do sistema (um nome só)

Do nome da empresa sai UM nome pra tudo: o primeiro nome da empresa, minúsculo,
sem acento, mais `-os` ("Clima Sul Ar" vira `clima-os`; "O Boticário" vira
`boticario-os`). Esse nome vale pra pasta da Casa, pro repositório privado no
GitHub, pro projeto na Vercel e pros 2 projetos no Supabase (`clima-os` e
`clima-os-homolog`; renomear um projeto só muda o nome, o endereço dele fica o
mesmo). O comando da `3-casa` calcula o nome, mostra na prévia e grava em
`slug_os:` no frontmatter de `operacao/INSTALACAO.md`; as etapas 4 a 8 leem o
nome DAÍ e nunca recalculam. Nome já ocupado em algum serviço? Combine outro
com o aluno e troque o `slug_os:` ANTES de usar. No texto pro aluno, o que mora
em `sistemas/empresa-os/` é "o sistema" (só a pasta e o código guardam o nome
antigo).

### 3-casa

A Casa JÁ EXISTE (do zip ou clonada): não delegar criação a ninguém.

**Nome da pasta, ANTES de rodar o comando.** O nome do sistema também é o nome da
pasta da Casa. A pasta aberta tem outro nome (por exemplo `mestre-das-ias-os`)?
Ofereça trocar AGORA, porque o caminho absoluto da Casa só é gravado no
`hooks.json` quando o comando roda: o aluno fecha o Codex, renomeia a pasta pro
nome do sistema, abre a pasta nova, confia nela de novo e retoma daqui (as 3
respostas se repetem, e `projeto_confiado` volta a `pendente` até ele confirmar
de novo). Ele prefere manter o nome da pasta? Siga sem insistir: é o único dos 4
nomes que pode ficar diferente sem quebrar nada.

Rodar primeiro com `--dry-run`, mostrar a prévia ao aluno em 1 bloco (ela traz o
nome do sistema e o que o git vai fazer) e, sem esperar resposta, repetir sem
`--dry-run` (o nome da pasta, acima, é a única coisa que espera o aluno), usando o
caminho absoluto da skill irmã localizado em "Preparar":

```
<PY> <SKILL_IRMA>/scripts/criar_empresa_ia.py --in-place \
  --destino "<PASTA>" --nome "<NOME_EMPRESA>" --dono "<NOME_DONO>" \
  --email "<EMAIL_DONO>" --dry-run
```

Conferir na saída, depois de rodar sem `--dry-run`: a linha `CONFIGURADO:`,
`core.hooksPath=.githooks` ao fim, a linha `Nome do sistema: <nome>` e o git.
Não procure `{{` no resto da Casa pra "provar" que renderizou: os workflows do
GitHub usam `${{ }}` e as skills trazem exemplos com placeholder. Os
placeholders do kit levam chaves duplas em volta do nome: NOME_EMPRESA,
NOME_DONO, EMAIL_DONO e DATA_ATUAL (nos `.md` da empresa, todos renderizados) e
`{{CASA_ABS}}` (só no `.codex/hooks.json.modelo`, de propósito; o
`.codex/hooks.json` gerado não pode tê-lo).
- Casa do zip (sem `.git`): `git init`, branch `main` e o commit inicial
  "casa inicial da <empresa> IA". Esse commit leva a Casa como o kit a
  entregou, com as migrations do modelo, que o pre-commit barraria por não
  terem o veredito do aluno: por isso ele roda com os hooks do git ainda
  desligados e o `core.hooksPath=.githooks` só liga DEPOIS dele (a trava vale
  a partir da primeira mudança do aluno). `.git` sem nenhum commit (a
  configuração parou no meio) não é Casa já configurada: repetir o comando
  continua de onde parou.
- Casa clonada: o `.git` e o histórico do modelo ficam, entra 1 commit novo
  "Casa configurada para <empresa>" e o `origin` CONTINUA sendo o repositório-modelo
  (a `4-github` troca). O comando nunca faz push e nunca mexe no `origin`.
- O comando recusa uma Casa que já foi configurada (tem `.git` com commit e
  `core.hooksPath` ligado, não tem mais placeholder e o `origin` não é o
  modelo): nada a fazer, siga pra etapa pendente.

O comando gera o `.codex/hooks.json` a partir do `.codex/hooks.json.modelo`
(caminho absoluto da Casa nos 2 campos de cada hook; o `.modelo` fica na pasta)
e grava o nome do sistema em `slug_os:` de `operacao/INSTALACAO.md`.
Antes de marcar `3-casa` como `concluida`, mais 3 passos:

1. **Prova por comando, sem depender do Codex:**
   ```
   <PY> "<PASTA>/.codex/hooks/verificar_estado.py" --evento startup
   ```
   Tem que imprimir `VERIFICACAO DE ESTADO`, as 5 linhas e `TRIAGEM:`, e
   sair 0. Falhou? PARE, grave `hook_estado: pendente` e NÃO peça pra
   confiar nos hooks: não adianta confiar num hook que não roda.
2. **Confiar nos hooks, agora que o arquivo definitivo existe.** No app do
   Codex: Configurações (no Mac, ⌘,), seção "Programação", "Hooks". Em "Dos
   projetos" aparece o card com o nome desta pasta; se a página ficar em
   "Carregando hooks...", o aluno clica em "Recarregar hooks". Ele abre o card,
   lê o aviso "Os hooks são executados fora da sandbox e podem não ser
   seguros" (são os scripts desta própria Casa, em `.codex/hooks/`, que ele
   pode abrir) e escolhe "Confiar em tudo" [24a:hooks/n66]. Tem que ser em
   tudo: a abertura da sessão, a guarda das ferramentas e o salvamento ao
   parar são hooks separados, e confiar só no da abertura deixa a guarda e o
   salvamento desligados. O app NÃO tem o comando `/hooks` (só o terminal do
   Codex tem). No Windows o caminho não foi medido: se não achar Hooks nas
   Configurações, peça pro aluno descrever a tela e não invente botão. Em 1
   linha, o efeito de NÃO confiar: a Casa não confere sozinha o estado ao abrir
   a sessão (a IA roda o mesmo script na mão, o fallback do AGENTS.md), e a
   guarda que recusa ação perigosa e o salvamento automático não rodam. SÓ com
   o "sim" dele gravar `hook_estado: ok`; sem o sim,
   `hook_estado: pendente-confianca`. Nunca gravar `ok` por conta própria;
   nunca usar `--dangerously-bypass-hook-trust`.
3. Avise em 1 linha: depois desta etapa a pasta da Casa não pode mudar de lugar
   nem de nome, porque o caminho absoluto gravado no `hooks.json` deixa de
   valer (os hooks param de rodar e a confiança se perde, porque o Codex a
   rastreia pelo hash do arquivo). Mudou mesmo assim? Gere o
   `.codex/hooks.json` de novo trocando o caminho da Casa nos campos `command`
   e `commandWindows` de cada hook (entre aspas duplas; o
   `.codex/hooks.json.modelo` mostra a forma) e peça pro aluno refazer a
   confiança em Configurações, Hooks; o comando `--in-place` não serve pra
   isso, ele recusa uma Casa já configurada.

Só então marcar `3-casa` como `concluida`.

Logo depois, avise o aluno em 1 linha: abra uma conversa nova nesta pasta e chame `$polozi-instalador`
de novo (o `AGENTS.md` e os hooks da Casa só valem numa conversa nova).

### Próxima etapa pendente

Ordem fixa, sem pular, a da aula:
`0-preflight` → `3-casa` → `4-github` → `7-banco` → `8-sistema` → `5-dossie` → `6-marca`.
O número na chave é só o nome da etapa, não a ordem: banco e sistema no ar vêm
ANTES do dossiê, da persona e da marca, porque os três documentos são gravados
no banco e aparecem na tela Marca do sistema. Achar a primeira linha `pendente`
da tabela.

| Etapa | Como executar |
|---|---|
| `0-preflight` | Seção "ETAPA 0 — preflight" acima. |
| `3-casa` | Seção "3-casa" acima. |
| `4-github` | Delegar em `polozi-criar-github`: login do `gh` JÁ com `--scopes workflow`, autor dos commits da Casa = e-mail da conta GitHub do aluno (`identidade_git.py`, A39) e cria o repositório PRIVADO com o nome do sistema (`slug_os:` de `operacao/INSTALACAO.md`). Casa clonada: troca o `origin` do modelo pelo repositório do aluno ANTES do primeiro push (push no modelo nunca). Aluno que já tem um repositório dele com outro nome: `gh repo rename` no repositório DELE, nunca no modelo. |
| `7-banco` | Delegar em `polozi-registrar-conexao` (Supabase do sistema, projeto `<slug_os>`) e fechar o banco como na seção "7-banco" abaixo: Secrets do GitHub gravados e migrations aplicadas pela Action `deploy-db.yml`, disparada à mão, nunca por `supabase db push`. Sem o time Tecnologia na Casa ou sem o repositório do aluno no `origin`: **PARAR**. |
| `8-sistema` | Delegar na skill `tecnologia-publicar` (publica o sistema; o projeto na Vercel se chama como o sistema, `<slug_os>`) e seguir o roteiro `sistemas/empresa-os/LEIA-ME.md` pelos passos abaixo. Exige a `7-banco` `concluida` (banco no ar, migrations aplicadas pela Action, schemas expostos); senão volte à `7-banco`. O sistema já está em `sistemas/empresa-os/`: o passo 1 do roteiro sobre descompactar não vale, o passo 5 (migrations) foi a `7-banco` e o passo 2 (mockup) e o tema e a logo do passo 3 são da `6-marca`. Na ordem: (a) só o pacote do setup dentro de `sistemas/empresa-os` (passo 1): `npm install --prefix scripts --no-save "@supabase/supabase-js@2"`, nunca o `npm install` completo (a Vercel instala tudo na nuvem; ~500 MB por aluno na rede da sala); (b) preencher a identidade em `sistemas/empresa-os/config/empresa.ts` (a parte do passo 3 que o setup exige) com as respostas da `3-casa`, sem perguntar de novo: `nome` é o nome da empresa, `nomeMaster` e `emailMaster` são o nome e o e-mail do dono, `slug` é o `slug_os:` de `operacao/INSTALACAO.md` e `descricao` é uma frase curta que você escreve com o nome da empresa; (c) passo 4 (preview local), só se o dono quiser ver antes: aí sim o `npm install` completo; (d) passo 6: o `scripts/setup-inicial.mjs` do sistema cria a empresa e o dono, carrega o plano e cria o login do dono com a senha provisória `mudar@123` e o e-mail já confirmado, sem e-mail nenhum (as chaves vêm de `credenciais/.env` sem aparecer no chat; na 1ª vez com `SITE_URL=http://localhost:3000`; o jeito que vale igual em Mac e Windows é o próprio Node carregar o arquivo, de dentro de `sistemas/empresa-os`: `node --env-file=../../credenciais/.env scripts/setup-inicial.mjs`, com o `SITE_URL` definido antes, no PowerShell `$env:SITE_URL='http://localhost:3000'`; nunca `cat`, `type` nem `Get-Content` no `.env`) e para sem o pacote do setup instalado e sem o `config/empresa.ts` preenchido; (d2) o mesmo `setup-inicial.mjs` contra o banco de homologação (comando no passo 5 da `7-banco`; homologação `pendente` = pule); (e) passo 7 (Vercel), com a `tecnologia-publicar` e a `tecnologia-conectar`, nesta ordem: (e0) antes de criar: o conector da Vercel é da conta do ChatGPT, então a IA mostra o time dele (`list_teams`) e PARA se não for o do aluno (religar o plugin só vale em CONVERSA NOVA); o app "Vercel" instalado no GitHub do aluno com acesso a TODOS os repositórios (`tecnologia-conectar`, passo e1); (e1) a IA cria o projeto `<slug_os>` pelo conector da Vercel (`create_git_project`, pasta raiz `sistemas/empresa-os`, `deploy=false`; sem o conector, o roteiro "Projeto na Vercel a mão" da `tecnologia-conectar`); (e2) `<PY> "<PASTA_ABERTA>/.agents/skills/tecnologia-publicar/scripts/instalar_guardas.py" --casa "<PASTA_ABERTA>"` (link com `--project <slug_os>`, git, QA, bypass de automação da prévia, guardas, Secrets e Dependabot; a CLI da Vercel a IA instala e loga pelo Chrome antes); (e3) `$tecnologia-conectar` `projeto` (prova o link) e `vercel-env` (as variáveis do banco na Vercel, antes da primeira publicação); (e4) a primeira publicação, pela `tecnologia-publicar`, SEM QA de tela: na instalação não há usuário "Teste de QA", não se pede um 2º e-mail e o `polozi-sistema-qa` não roda (é o sistema do modelo, sem mudança de tela; o QA por preview é das mudanças de tela depois, pela `tecnologia-construir-tela` e a `tecnologia-publicar`); (e5) `$tecnologia-conectar` `auth-urls` e `provar` (só segue com `TUDO LIGADO`); e então o `setup-inicial.mjs` de novo com o `SITE_URL` definitivo: é ele que marca "sistema no ar" no plano (e6); (f) passo 8 (primeiro login): o dono entra no endereço de produção com o e-mail dele e a senha provisória `mudar@123`, de preferência pelo celular; diga a ele, numa frase, que o sistema avisa para trocar a senha e que é só usar Trocar senha no menu do usuário (nada de e-mail: o envio padrão do Supabase só entrega para membro da organização, 2 por hora e em inglês); (g) passo 9 (guardas): as guardas já ligaram no (e2), então só confira o bloco `DEPLOY` de `operacao/INSTALACAO.md` (o `usuario_qa` em `NAO-MEDIDO` é o esperado). Prova da `8-sistema`, e só ela: `/login` do endereço de produção responde 200, as variáveis do banco estão na Vercel (`vercel-env`), as Auth URLs gravadas (`auth-urls`), a linha `[setup] login do dono` do setup e o 1º login do dono feito. O `vault` (segredos no cofre do banco) NÃO faz parte da instalação: é opcional, fica para depois dela, quando o dono pedir (`$tecnologia-conectar` `vault`; nada no fluxo depende dele). Se `.agents/skills/tecnologia-publicar/` ou `.agents/skills/tecnologia-conectar/` não existir (Casa clonada antes da skill nova: atualizar o time Tecnologia): instruir a instalar o time Tecnologia e **PARAR**. |
| `5-dossie` | Delegar em `polozi-registrar-dossie` (só quando o dono tiver o arquivo do dossiê baixado do app do aluno, o `dossie-completo.md`; quem ainda só tem a transcrição do áudio segue o caminho antigo da mesma skill). Vem depois do sistema no ar: o dossiê é gravado no banco e aparece na aba Dossiê da tela Marca. |
| `6-marca` | Exige a `5-dossie` concluída e o time Marketing na Casa (`.agents/skills/marketing-persona/` existe). Presente: delegar, uma por vez e nesta ordem, em `marketing-persona` (cliente ideal e persona a partir do dossiê), `marketing-identidade` (cores, letra e tom de voz) e, só se o dono tem o arquivo do logo, `marketing-logo` (opcional; usa o Pillow, que a skill instala sem perguntar); cada uma pede o "sim" do dono antes de publicar na tela Marca. Conclui quando `empresa/publico/persona.md`, `empresa/marca/identidade-visual.md` e `empresa/marca/tom-de-voz.md` estão `aprovado` no `MAPA-DA-EMPRESA-IA.md`. Publicar na tela Marca NÃO é condição (o banco e o sistema já estão no ar, etapas 7 e 8, e cada skill publica ao ser aprovada): a skill que terminar com `FALTA` deixa o documento aprovado na pasta e a publicação sai depois, quando o dono pedir "publica a persona e a marca" (a `marketing-persona` publica o que ficou pendente) ou pela atividade `dossie-persona-marca` do plano. Dossiê ausente (`contexto/dossie/dossie-completo.md` não existe, ou a `5-dossie` está `pulada`): instruir a `5-dossie` e **PARAR**; se o dono prefere deixar a marca para depois, vale "Pular uma etapa" (a `6-marca` fica `pulada`, com o motivo em `operacao/DECISOES.md`). Time ausente (`.agents/skills/marketing-persona/` ou `.agents/skills/marketing-identidade/` não existe): o time Marketing não está nesta Casa, instruir a instalá-lo com a skill `polozi-instalar-time` (ou clonar de novo o repositório-modelo, que já vem com ele) e **PARAR**: não marcar como `pulada`, não improvisar persona nem identidade visual sozinho. Ao concluir, NÃO aplique a marca no sistema aqui: aponte a atividade seguinte do plano, `sistema-com-marca`, para o dono rodar em conversa nova (skill `tecnologia-aplicar-marca`: mostra primeiro um mockup das telas principais em claro e escuro, ele aprova, e só então aplica, manda o link de teste e publica com o sim dele). |

#### 7-banco

Deixa o banco do sistema pronto antes da `8-sistema`: conexão do Supabase
registrada, Secrets do GitHub gravados e migrations aplicadas pela Action
`deploy-db.yml`, que o instalador dispara à mão (de novo só se ficar vermelha).

**Por que é assim.** Migration só entra no banco pela Action, nunca na mão
(regra do `sistemas/empresa-os/supabase/README.md`): o hook da Casa recusa
`supabase db push` e o `apply_migration` sem veredito. A Action roda sozinha
quando uma migration NOVA chega à `main`. Na Casa clonada as migrations do
modelo já vieram no primeiro envio, antes de os Secrets existirem, e nenhuma
nova chega depois: ninguém aplicaria nada no banco novo do aluno, e o
`setup-inicial.mjs` da `8-sistema` cairia num banco vazio.

Antes de começar, confirme (qualquer falha = **PARAR**, sem improvisar):

- `.agents/skills/tecnologia-publicar/scripts/instalar_guardas.py` e
  `.agents/skills/tecnologia-mudar-banco/SKILL.md` (a skill dona de toda
  migration nova depois desta instalação) existem na Casa (cheque com o
  comando `is_file` do bloco "Resolver `<SKILL_DIR>`"). Faltou: a Casa não tem
  o time Tecnologia; instruir a instalar com a skill `polozi-instalar-time` e
  **PARAR** (mesma regra do `6-marca`).
- A `4-github` está `concluida` e `git remote get-url origin` NÃO termina em
  `polozigit/mestre-das-ias-os`. Os Secrets e a Action moram no repositório do
  aluno: com o `origin` do modelo (ou sem `origin`, ou a `4-github` `pulada`),
  volte à `4-github` e **PARAR**.

Nesta seção, `<SKILL_PUBLICAR>` é `<PASTA_ABERTA>/.agents/skills/tecnologia-publicar`.

1. **Conexão e valores.** O aluno não digita senha de banco: o Chrome só cria o
   token e o script cria o banco. Nesta seção, `<SKILL_CONECTAR>` é
   `<PASTA_ABERTA>/.agents/skills/tecnologia-conectar`.

   (a) **Token (a única coisa pelo Chrome).**
   Delegar em `polozi-registrar-conexao`: registre o Supabase (conector do app, com a prova
   do script dela) e traga para o `credenciais/.env` o `SUPABASE_ACCESS_TOKEN`
   pelo comando de chave de uma linha da própria skill. A IA cria o token no
   painel do Supabase pelo Chrome do dono (Account, Access Tokens; token de
   ACESSO TOTAL, o clássico, sem escolher organização nem permissão, validade
   "Never"; a IA cria sozinha, sem perguntar), clica em Copiar e o comando o cola
   direto no arquivo. Depois de gerar, a IA NÃO lê a página (nem captura de
   tela, nem árvore de acessibilidade: no teste de 08/10 o token vazou assim). O
   valor nunca passa pelo chat e a IA nunca abre o arquivo (o hook recusa).

   (b) **Banco de produção pelo script.** Cria (ou reaproveita) o projeto
   `<slug_os>`, gera a senha do banco, espera ficar no ar, expõe os schemas
   `tarefas` e `organograma` e grava no `.env` os 5 nomes (`SUPABASE_PROJECT_ID`,
   `SUPABASE_DB_PASSWORD`, `NEXT_PUBLIC_SUPABASE_URL`,
   `NEXT_PUBLIC_SUPABASE_ANON_KEY`, `SUPABASE_SERVICE_ROLE_KEY`; os scripts da
   Casa leem esses nomes e a Vercel recebe os dela pela `tecnologia-conectar` na
   `8-sistema`, `sistemas/empresa-os/conexao.md`):

   ```
   <PY> "<SKILL_CONECTAR>/scripts/conectar.py" banco --casa "<PASTA_ABERTA>"
   ```

   Saída 0 e as linhas `[ok] banco` (ou `[pulado] banco`, já existia) = pronto;
   nada aparece na tela. O token abre mais de uma organização: o script lista e
   para; pergunte ao dono qual é a da empresa e rode de novo com `--org <slug>`.
   Limite do plano gratuito (2 projetos ativos): a mensagem diz o que fazer;
   o dono pausa ou apaga um projeto gratuito que não usa e o comando roda de novo.
   Linha `[pendente] banco` sobre a senha (projeto que já existia antes do
   script): a senha vem pelo caminho de reserva abaixo, só ela.

   (c) **Reserva, só se o (b) falhar por outro motivo** (API fora do ar, erro
   que a mensagem não resolve): a IA cria o projeto `<slug_os>` no painel pelo
   Chrome do dono; a senha do banco o dono digita na tela e guarda; os valores
   vão para o `.env` um por vez pelo comando de chave de uma linha da
   `polozi-registrar-conexao` (a IA copia no painel pelo botão de copiar, nunca
   lê a página): `SUPABASE_PROJECT_ID` (o trecho antes de `.supabase.co` na URL
   do projeto), `SUPABASE_DB_PASSWORD` (esqueceu: Database, Reset database
   password), `NEXT_PUBLIC_SUPABASE_URL`, `NEXT_PUBLIC_SUPABASE_ANON_KEY` e
   `SUPABASE_SERVICE_ROLE_KEY`. Depois rode o (b) de novo: ele reaproveita o
   projeto e só expõe os schemas.

   Já estão no `.env`? Confira só os nomes (`--listar-nomes` da skill) e não
   peça de novo.
2. **Secrets do GitHub.** Grave os 3 Secrets da Action no repositório do aluno
   com o passo `gravar_secrets` do script do time Tecnologia (só ele; os outros
   passos do script são da `8-sistema`):

   ```
   <PY> "<SKILL_PUBLICAR>/scripts/instalar_guardas.py" --casa "<PASTA_ABERTA>" --so gravar_secrets
   ```

   Ele roda `gh secret set` com o valor num arquivo temporário (nunca na linha
   de comando nem na tela) e anota o resultado, sem valor, no bloco `DEPLOY` de
   `operacao/INSTALACAO.md`. Saída 0 = gravou. Saída 2 = a mensagem diz o que
   falta (em geral um nome ausente do `credenciais/.env`): volte ao passo 1 só
   para esse nome e rode de novo (regravar é seguro).
3. **Disparar a Action à mão e esperar o verde.** Anote o número da última
   execução manual que já existe (lista vazia = nenhuma), dispare e liste de
   novo: a nova é a de `databaseId` MAIOR que o anotado (a lista pode demorar
   uns segundos; repita a última linha até ela aparecer). Se o disparo já
   imprimir o endereço da execução (`.../actions/runs/<número>`), o número no
   fim dele é o `<id>`:

   ```
   gh run list --workflow deploy-db.yml --event workflow_dispatch --limit 1 --json "databaseId,status,conclusion,url"
   gh workflow run deploy-db.yml --ref main
   gh run list --workflow deploy-db.yml --event workflow_dispatch --limit 1 --json "databaseId,status,conclusion,url"
   ```

   Com o número da nova (`<id>`):

   ```
   gh run watch <id> --exit-status
   ```

   Saída 0 = o banco do sistema recebeu as migrations. Comando interrompido
   por tempo? Rode o mesmo `gh run watch` de novo: numa execução que já
   terminou ele só conta como acabou e sai com 0 (sucesso) ou 1 (falha). O
   envio da `4-github` pode ter disparado esta Action sozinha, antes dos
   Secrets, e ela ficou vermelha: é esperado; vale só a execução que o
   instalador disparou agora.
   Saída diferente de 0: `gh run view <id> --log-failed` mostra o motivo.
   Corrija a CAUSA (em geral um Secret errado: volte ao passo 1 só para esse
   valor, ao passo 2, e dispare de novo). NUNCA `supabase db push`,
   `apply_migration` nem SQL na mão para "ajudar": o hook recusa e o banco
   passaria a divergir do repositório. Se o `gh` disser que não achou o
   workflow, o repositório do aluno não tem `.github/workflows/deploy-db.yml`
   na `main` (Casa mais antiga que o modelo atual): **PARAR**, sem copiar o
   arquivo na mão.
4. **Expor os schemas.** Já feito pelo `conectar.py banco` do passo 1 (linha
   `schemas expostos` ou `schemas já expostos`). Só no caminho de reserva sem o
   (b) rodado: a IA, no painel do projeto `<slug_os>` pelo Chrome do dono,
   Project Settings, Data API, Exposed schemas, acrescenta `tarefas` e
   `organograma` (mantém os que já estão) e salva. Sem isso o
   `setup-inicial.mjs` da `8-sistema` para com `PGRST106`.

5. **Homologação (automática, nenhuma ação do aluno).** O projeto Supabase
   `<slug_os>-homolog` é o banco de teste que o preview da Vercel usa no lugar
   do banco real. Nasce com o mesmo `SUPABASE_ACCESS_TOKEN` do passo 1: sem
   token novo, sem senha nova, sem clique. Na ordem:

   (a) Criar o projeto, esperar ficar no ar, expor os schemas e gravar as 5
   variáveis `_HOMOLOG` em `credenciais/.env` (a senha do banco é gerada pelo
   script e gravada na hora; nada aparece na tela):

   ```
   <PY> "<SKILL_CONECTAR>/scripts/conectar.py" homologacao --casa "<PASTA_ABERTA>"
   ```

   Saída 0 e as linhas `[ok] homologacao` = pronto. Rodar de novo é seguro (acha
   o projeto por nome, despausa se preciso, não cria outro). O Supabase gratuito
   aceita 2 projetos ativos: com os 2 já em uso o script para com uma mensagem em
   português e NÃO grava nada. Nesse caso diga ao aluno, numa frase, que o plano
   gratuito do Supabase só deixa 2 projetos ativos e que a homologação fica para
   quando ele pausar ou apagar um projeto gratuito que não usa; marque o passo
   como `pendente` em `operacao/PENDENCIAS.md` (origem `descoberta-ia`) e siga:
   isso NUNCA bloqueia o D1 (na `8-sistema`, o `vercel-env` e o `provar` rodam
   com `--sem-preview`).

   (b) Secrets do GitHub da homologação: rode de novo o comando do passo 2. Com
   as variáveis do (a) no `.env` ele grava também `SUPABASE_PROJECT_ID_HOMOLOG` e
   `SUPABASE_DB_PASSWORD_HOMOLOG`, que o `deploy-db-homologacao.yml` lê.

   (c) Aplicar as migrations e o dado de exemplo na homologação: dispare e
   espere o workflow `deploy-db-homologacao.yml` exatamente como no passo 3
   (anotar o número da última execução, disparar com
   `gh workflow run deploy-db-homologacao.yml --ref main`, pegar a nova e
   esperar com o mesmo `gh run watch` do passo 3). Vermelho: mesmas regras do
   passo 3, nunca na mão.

   (d) O dono no banco de teste: o login do preview entra como o dono (exige
   `usuarios.e_dono` ativo), então a homologação também roda o
   `scripts/setup-inicial.mjs`, que cria o dono com a mesma senha provisória `mudar@123`, sem e-mail. Ele precisa do pacote do
   setup e do `config/empresa.ts` preenchido, que são do `8-sistema` (passos (a)
   e (b)): rode logo depois do (d) do `8-sistema`, no mesmo terminal da Casa
   (`sistemas/empresa-os`), carregando o `credenciais/.env` como o `8-sistema`
   faz e trocando a URL e a chave de serviço pelas de homologação (os valores
   nunca aparecem no chat):

   ```
   source ../../credenciais/.env && NEXT_PUBLIC_SUPABASE_URL="$NEXT_PUBLIC_SUPABASE_URL_HOMOLOG" SUPABASE_SERVICE_ROLE_KEY="$SUPABASE_SERVICE_ROLE_KEY_HOMOLOG" SITE_URL=http://localhost:3000 node scripts/setup-inicial.mjs
   ```

   No PowerShell, carregue o `.env` como o `8-sistema` e atribua
   `$env:NEXT_PUBLIC_SUPABASE_URL = $env:NEXT_PUBLIC_SUPABASE_URL_HOMOLOG`,
   `$env:SUPABASE_SERVICE_ROLE_KEY = $env:SUPABASE_SERVICE_ROLE_KEY_HOMOLOG`,
   e `$env:SITE_URL = "http://localhost:3000"` antes do
   `node scripts/setup-inicial.mjs`. Prova: a linha
   `[setup] login do dono criado com a senha provisória (sem e-mail).` (ou, rodando de novo, `[setup] login do dono já existe`)

   Depois da instalação, a `tecnologia-mudar-banco` conduz o ensaio de cada
   migration nova na homologação antes da produção.

   **Casa já instalada antes da homologação.** Os mesmos comandos servem (todos
   idempotentes): (a), (b), (c) e (d) acima e, depois, o `vercel-env` da
   `tecnologia-conectar`, que TROCA o preview do banco real para o de teste (para o
   Supabase gratuito não pausar o banco de teste, o keep-alive diário da produção
   também o consulta).

Passo 3 verde e passo 4 feito = `7-banco` entregue (o passo 5, homologação, nunca entra nessa conta; siga "Depois de cada
etapa"). Só então a `8-sistema` roda o `scripts/setup-inicial.mjs` e publica
na Vercel.

#### Espelhar o catálogo de IA (depois do `setup-inicial.mjs`)

Assim que o `scripts/setup-inicial.mjs` do sistema rodar (na
`8-sistema`), espelhe agentes, skills e workflows da Casa na tela
"Agentes, skills e workflows". O script é da skill irmã `polozi-instalar-time`;
`<SKILL_TIME>` é a pasta dela, no MESMO diretório de skills onde `<SKILL_DIR>`
foi achado (mesma regra do `<SKILL_IRMA>`: nunca versão fixa; não existir ali
→ **PARE** com a mensagem de instalação incompleta):

```
<PY> <SKILL_TIME>/scripts/sincronizar_catalogo.py --casa "<PASTA_ABERTA>"
```

Esperado: primeira linha `FEITO`. `FALTA` = o banco ainda não está em
`credenciais/.env`: conecte e rode de novo. `PAREI` com segredo = tirar o
segredo do arquivo citado antes de seguir. Esta etapa não muda o estado de
`operacao/INSTALACAO.md`; só confere que a tela mostra o catálogo.

Nunca executar etapa fora de ordem, mesmo se o usuário pedir uma etapa
posterior direto — explique a dependência e ofereça continuar da etapa
pendente certa. Empacou na `8-sistema` e quer avançar pro dossiê? Vale "Pular
uma etapa" (com o motivo registrado): o dossiê fica salvo na pasta e a
publicação sai quando o sistema estiver no ar.

### Depois de cada etapa

1. Etapa entregue pela skill delegada → atualizar
   `operacao/INSTALACAO.md`: estado `concluida` + data de hoje na linha da
   etapa; mover `etapa_atual` para a próxima pendente (ou manter `6-marca`, a
   última da ordem, quando tudo fechou). Em seguida rodar
   `<PY> .codex/hooks/registro_trabalho.py reconciliar` (conclui no quadro a
   atividade do plano que a etapa provou).
2. Seguir direto pra próxima etapa, avisando em 1 linha o que terminou e o
   que vem; parar só se o dono pedir, ou numa etapa que espera algo que só
   ele faz (senha, código, 2FA, janela do sistema, a transcrição do dossiê).
3. Se todas as etapas estiverem `concluida`/`pulada`, fechar o bloco de
   primeiro acesso do `AGENTS.md` (ele só existe pra retomar a instalação) e
   informar que ela terminou:
   ```
   <PY> "<caminho de aplicar_regra.py>" --casa "<PASTA_ABERTA>" --fechar-primeiro-acesso
   ```
   O caminho de `aplicar_regra.py` se acha pela busca da skill
   `polozi-aplicar-regra` (`.agents/skills/polozi-aplicar-regra/scripts/`).
   Saída `0` = bloco apagado ou já fechado; recusa ou erro, mostre a mensagem
   e não edite o `AGENTS.md` à mão. Salvar é com a `tecnologia-publicar`. Os times do kit já vêm instalados na Casa (conferir
   com `polozi-instalar-time`) e time novo o aluno pede à IA principal, que cria as skills em
   `.agents/skills/<area>-<nome>/`: ficam fora deste fluxo.

### Pular uma etapa (só a pedido explícito do usuário)

Nunca pular silenciosamente. Se o usuário pedir pra deixar uma etapa pra
depois: marcar a linha como `pulada` + data de hoje em
`operacao/INSTALACAO.md`, registrar o motivo em uma linha de
`operacao/DECISOES.md` (decisão do dono, com data), e seguir pra próxima
etapa da ordem fixa normalmente.

## O arquivo de regras do git (`.codex/rules/empresa-ia.rules`)

Ele já vem na Casa — não é gravado por esta skill — e serve pro git ficar
invisível pro aluno (D24-15). SÓ carrega com a pasta confiada
[24a:config/n08]; `rules` é EXPERIMENTAL e pode mudar [24a:config/n08].

**Em ~/.codex/rules/ só acrescente, nunca sobrescreva** — é lá que o TUI grava o allow-list do
próprio aluno; sobrescrever apaga o que é dele.

Interruptor: se o Codex reclamar do arquivo, renomear pra
`empresa-ia.rules.desligado` e seguir — a Casa funciona sem ele, o git só
volta a pedir aprovação [24a:config/n07].

## Verificar

- `operacao/INSTALACAO.md`: nenhuma etapa `concluida` sem entrega confirmada
  pela skill responsável; nenhuma etapa pulada sem estar marcada `pulada`
  com data; `etapa_atual` bate com a primeira linha `pendente` da tabela (ou
  ficou em `6-marca` quando tudo concluiu).
- Etapa que parou por dependência ausente (`6-marca`/`7-banco`/`8-sistema`):
  segue `pendente`, com a instrução de instalação já dada ao usuário.
- `7-banco` só vira `concluida` com a execução da Action disparada pelo
  instalador terminada em sucesso (`gh run watch <id> --exit-status` saiu 0) e
  os schemas expostos; Secrets gravados sozinhos não bastam.
- Depois da `3-casa`, `slug_os:` em `operacao/INSTALACAO.md` tem o nome do
  sistema (não fica `pendente` nem ausente). Casa clonada: o `origin` só deixa
  de ser o repositório-modelo quando a `4-github` termina.
- Nunca gravar `projeto_confiado: sim` sem o aluno confirmar.
- Nunca marcar `0-preflight` concluída com item em bloqueio.
- `instalar_requisitos.py` roda sem perguntar, avisando em 1 linha; nunca com senha digitada pela IA.
- Acesso total e Computer Use conferidos ligados antes do preflight (faltou = a ETAPA 0 parou com o passo exato).

## Limites

- Nunca `git push` nem `gh repo rename` enquanto o `origin` da Casa for o
  repositório-modelo `polozigit/mestre-das-ias-os`: o aluno não é dono dele. Quem
  troca o `origin` pelo repositório do aluno é a `4-github`.
- Nunca recalcular o nome do sistema depois da `3-casa`: vale o `slug_os:`
  de `operacao/INSTALACAO.md` (trocar só junto com o aluno, antes de usar).
- Nunca aplicar migration na mão (`supabase db push`, `apply_migration`, SQL
  no painel ou no chat): o banco do sistema só recebe migration pela Action
  `deploy-db.yml`, disparada na `7-banco`.
- Nunca pular etapa pendente sem registrar `pulada` — silêncio não existe.
- Nunca improvisar o resultado de uma etapa cujo plugin/time necessário não
  está instalado; instrua a instalação e PARE.
- Nunca pedir chave, senha ou token no chat — isso é papel das skills de
  GitHub e conexão, nunca deste instalador.
- Nunca reescrever uma etapa já `concluida` de volta pra `pendente` sozinho;
  regressão só a pedido explícito do usuário.
- Nunca executar etapa fora da ordem fixa, mesmo a pedido — explique a
  dependência.
- Nunca gravar `projeto_confiado: sim` sem o aluno confirmar.
- Nunca marcar `0-preflight` concluída havendo item em bloqueio.
- Nunca digitar senha (a do Mac é do aluno, na janela do sistema). Instalar programa que o sistema precisa não pede "sim": é autorização permanente da Casa.
