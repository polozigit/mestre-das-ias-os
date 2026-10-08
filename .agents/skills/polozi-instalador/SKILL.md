---
name: polozi-instalador
description: "Começa ou retoma a instalação da Casa (clonada ou do zip), etapa por etapa. Chame com $polozi-instalador; não cria pasta nova."
---

# Polozi Instalador

Configurar a Casa que já veio pronta (clonada do repositório-modelo
`polozigit/mestre-das-ias-os`, o caminho da aula, ou descompactada do zip, o
caminho antigo que continua valendo), nunca criá-la do zero, e
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
   - **Clonada do repositório-modelo**: tem `.git` e o `origin` termina em
     `polozigit/mestre-das-ias-os`. Esse `origin` é do MODELO, não do aluno:
     enquanto for, NUNCA `git push` e NUNCA `gh repo rename`. A etapa do GitHub
     troca o `origin` pelo repositório do aluno antes de qualquer push.
   - **Descompactada do zip**: sem `.git`. É o fluxo antigo; a etapa da Casa
     inicia o git.

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
(falta `scripts/preflight.py`). Mostre ao aluno e peça pra reinstalar o
`polozi-fundacao.zip` e reiniciar o app. Não improvise caminho, não rode
nada relativo, não copie script pra dentro da Casa.

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

O PRIMEIRO que imprimir `Python 3.` vira `<PY>` — todo comando desta skill,
daqui pra frente, escreve `<PY>` no lugar de "python". Gravar o comando
escolhido no frontmatter de `operacao/INSTALACAO.md`, campo `comando_python:`
(o script da ETAPA 0 já faz isso sozinho com `--gravar`). Nenhum comando
desta skill pode conter `python3` literal fora desta checagem de versão.

Se os 3 falharem: a ETAPA 0 bloqueia e instrui a instalar o Python oficial
(python.org) [24a:windows/f10].

## ETAPA 0 — `0-preflight` (antes de tudo)

1. Rodar, com o caminho absoluto localizado em "Preparar":
   ```
   <PY> <SKILL_DIR>/scripts/preflight.py --pasta "<PASTA_ABERTA>" --json
   ```
2. Ler todos os itens (cada um traz `id`, `estado`, `evidencia` e
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
     (nodejs.org, versão LTS). Do 20.9 ao 21.x é `aviso`: o pacote do Supabase
     do sistema declara o Node 22, então o npm avisa na instalação; recomende o
     Node 22 LTS ou mais novo, sem bloquear.
   - `casa_git`: conta se a Casa é clonada do repositório-modelo ou do zip.
     Nunca bloqueia: `.git` com `origin` do modelo não é erro.
3. **Confiar na pasta.** Instruir o aluno a marcar esta pasta como confiada
   no Codex — sem isso o `.codex/config.toml` E o `.codex/rules/` do projeto
   são ignorados EM SILÊNCIO [24a:config/f2, hooks/f05]. Dizer, com todas as
   letras, que NÃO existe hoje comando publicado que prove que o config do
   projeto carregou. Por isso: perguntar ao aluno se ele confirma que
   confiou na pasta e se o rodapé do Codex mostra o modelo `gpt-5.6-terra`.
   No app, o seletor de modelo do chat e a permissão escolhida na tela podem
   valer mais que o `.codex/config.toml` [24a:config/n65]: rodapé com outro
   modelo, ou "Acesso total" ligado? Peça pra escolher o GPT-5.6 Terra no
   seletor do chat e pra conferir em Configurações, Geral, que o "Acesso
   total" está desligado; só então peça o "sim".
   SÓ com o "sim" dele gravar `projeto_confiado: sim` no frontmatter — nunca
   gravar `sim` por conta própria. Sem comando que prove, o que vale é o que
   ele vê no rodapé. A confiança dos HOOKS é outra coisa e vem no FIM da
   `3-casa`, depois que o comando gera o `.codex/hooks.json`: nesta etapa a
   pasta só tem o `.codex/hooks.json.modelo` (o Codex não lê esse nome), com
   `{{CASA_ABS}}` nos comandos. NÃO peça pra confiar em hooks aqui: um
   `hooks.json` com o placeholder cru faria o `PreToolUse` sair 2 e NEGAR toda
   ferramenta, e confiar antes do arquivo definitivo derruba a confiança em
   silêncio (a confiança de hook não-gerenciado é rastreada pelo HASH da
   definição: mudou o arquivo, o hash muda, a confiança some).
4. Fechar a ETAPA 0, com o mesmo caminho absoluto:
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

A Casa JÁ EXISTE (clonada ou do zip): não delegar criação a ninguém.

**Nome da pasta, ANTES de rodar o comando.** O nome do sistema também é o nome da
pasta da Casa. A pasta aberta tem outro nome (por exemplo `mestre-das-ias-os`)?
Ofereça trocar AGORA, porque o caminho absoluto da Casa só é gravado no
`hooks.json` quando o comando roda: o aluno fecha o Codex, renomeia a pasta pro
nome do sistema, abre a pasta nova, confia nela de novo e retoma daqui (as 3
respostas se repetem, e `projeto_confiado` volta a `pendente` até ele confirmar
de novo). Ele prefere manter o nome da pasta? Siga sem insistir: é o único dos 4
nomes que pode ficar diferente sem quebrar nada.

Rodar primeiro com `--dry-run`, mostrar a prévia ao aluno (ela traz o nome do
sistema e o que o git vai fazer), e só então repetir sem `--dry-run`, usando o
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
| `4-github` | Delegar em `polozi-criar-github`: cria o repositório PRIVADO com o nome do sistema (`slug_os:` de `operacao/INSTALACAO.md`). Casa clonada: troca o `origin` do modelo pelo repositório do aluno ANTES do primeiro push (push no modelo nunca). Aluno que já tem um repositório dele com outro nome: `gh repo rename` no repositório DELE, nunca no modelo. |
| `7-banco` | Delegar em `polozi-registrar-conexao` (Supabase do sistema, projeto `<slug_os>`) e fechar o banco como na seção "7-banco" abaixo: Secrets do GitHub gravados e migrations aplicadas pela Action `deploy-db.yml`, disparada à mão, nunca por `supabase db push`. Sem o time Tecnologia na Casa ou sem o repositório do aluno no `origin`: **PARAR**. |
| `8-sistema` | Delegar na skill `tecnologia-publicar` (publica o sistema; o projeto na Vercel se chama como o sistema, `<slug_os>`) e seguir o roteiro `sistemas/empresa-os/LEIA-ME.md` pelos passos abaixo. Exige a `7-banco` `concluida` (banco no ar, migrations aplicadas pela Action, schemas expostos); senão volte à `7-banco`. O sistema já está em `sistemas/empresa-os/`: o passo 1 do roteiro sobre descompactar não vale, o passo 5 (migrations) foi a `7-banco` e o passo 2 (mockup) e o tema e a logo do passo 3 são da `6-marca`. Na ordem: (a) `npm install` dentro de `sistemas/empresa-os` (passo 1); (b) preencher a identidade em `sistemas/empresa-os/config/empresa.ts` (a parte do passo 3 que o setup exige) com as respostas da `3-casa`, sem perguntar de novo: `nome` é o nome da empresa, `nomeMaster` e `emailMaster` são o nome e o e-mail do dono, `slug` é o `slug_os:` de `operacao/INSTALACAO.md` e `descricao` é uma frase curta que você escreve com o nome da empresa; (c) passo 4 (preview local), só se o dono quiser ver antes; (d) passo 6: o `scripts/setup-inicial.mjs` do sistema cria a empresa e o dono, carrega o plano e manda o e-mail de convite (as chaves vêm de `credenciais/.env` sem aparecer no chat; na 1ª vez com `SITE_URL=http://localhost:3000`) e para sem o `npm install` e sem o `config/empresa.ts` preenchido; (e) passo 7 (Vercel), com a `tecnologia-publicar`, e então o `setup-inicial.mjs` de novo com o `SITE_URL` definitivo: é ele que marca "sistema no ar" no plano; (f) passo 8 (primeiro login): o dono abre o e-mail de convite, define a senha e entra, de preferência pelo celular; (g) passo 9 (guardas), pela seção "Primeira vez neste sistema" da `tecnologia-publicar`. Se `.agents/skills/tecnologia-publicar/` não existir: instruir a instalar o time Tecnologia e **PARAR**. |
| `5-dossie` | Delegar em `polozi-registrar-dossie` (só quando o usuário tiver a transcrição pronta). Vem depois do sistema no ar: o dossiê é gravado no banco e aparece na aba Dossiê da tela Marca. |
| `6-marca` | Exige a `5-dossie` concluída e o time Marketing na Casa (`.agents/skills/marketing-persona/` existe). Presente: delegar, uma por vez e nesta ordem, em `marketing-persona` (cliente ideal e persona a partir do dossiê), `marketing-identidade` (cores, letra e tom de voz) e, só se o dono tem o arquivo do logo, `marketing-logo` (opcional; usa o Pillow, e a skill pede o "sim" do dono antes de instalá-lo); cada uma pede o "sim" do dono antes de publicar na tela Marca. Conclui quando `empresa/publico/persona.md`, `empresa/marca/identidade-visual.md` e `empresa/marca/tom-de-voz.md` estão `aprovado` no `MAPA-DA-EMPRESA-IA.md`. Publicar na tela Marca NÃO é condição (o banco e o sistema já estão no ar, etapas 7 e 8, e cada skill publica ao ser aprovada): a skill que terminar com `FALTA` deixa o documento aprovado na pasta e a publicação sai depois, quando o dono pedir "publica a persona e a marca" (a `marketing-persona` publica o que ficou pendente) ou pela atividade `dossie-persona-marca` do plano. Dossiê ausente (`contexto/dossie/dossie-completo.md` não existe, ou a `5-dossie` está `pulada`): instruir a `5-dossie` e **PARAR**; se o dono prefere deixar a marca para depois, vale "Pular uma etapa" (a `6-marca` fica `pulada`, com o motivo em `operacao/DECISOES.md`). Time ausente (`.agents/skills/marketing-persona/` ou `.agents/skills/marketing-identidade/` não existe): o time Marketing não está nesta Casa, instruir a instalá-lo com a skill `polozi-instalar-time` (ou clonar de novo o repositório-modelo, que já vem com ele) e **PARAR**: não marcar como `pulada`, não improvisar persona nem identidade visual sozinho. |

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

1. **Conexão e valores.** O projeto `<slug_os>` ainda não existe no Supabase?
   O dono o cria no painel, com esse nome, e guarda a senha do banco que
   definir (ela vai para o `.env` pelo mesmo caminho, nunca pelo chat).
   Delegar em `polozi-registrar-conexao`: registre o
   Supabase (conector do app, com a prova do script dela) e traga para o
   `credenciais/.env` os valores do projeto `<slug_os>`, um por vez, pelo
   comando de chave de uma linha da própria skill: o dono copia o valor no
   painel do Supabase e o comando o cola direto no arquivo. O valor nunca
   passa pelo chat e a IA nunca abre o arquivo (o hook recusa). Nomes:
   - para a Action: `SUPABASE_PROJECT_ID` (o ref: o trecho antes de
     `.supabase.co` na URL do projeto), `SUPABASE_ACCESS_TOKEN` (Account,
     Access Tokens; validade "Never", escopo mínimo) e `SUPABASE_DB_PASSWORD`
     (a senha do banco; esqueceu, o dono troca em Database, Reset database
     password);
   - para o sistema: `NEXT_PUBLIC_SUPABASE_URL`,
     `NEXT_PUBLIC_SUPABASE_ANON_KEY` e `SUPABASE_SERVICE_ROLE_KEY`. São os
     nomes que os scripts da Casa leem do `.env` (`setup-inicial.mjs`,
     `sincronizar_catalogo.py`, o WhatsApp local); a Vercel recebe os dela
     pela integração e o sistema aceita os dois (`sistemas/empresa-os/conexao.md`).

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
4. **Expor os schemas.** O dono, no painel do Supabase do projeto `<slug_os>`:
   Project Settings, Data API, Exposed schemas; acrescentar `tarefas` e
   `organograma` à lista (manter os que já estão) e salvar. Sem isso o
   `setup-inicial.mjs` da `8-sistema` para com `PGRST106` (e repete esta
   instrução).

**Fica para depois (não bloqueia o D1).** O projeto de homologação
(`<slug_os>-homolog`) e o `deploy-db-homologacao.yml`, que ensaia migration
com dado de exemplo antes da produção. Ele lê mais dois Secrets,
`SUPABASE_PROJECT_ID_HOMOLOG` e `SUPABASE_DB_PASSWORD_HOMOLOG`, que o
`instalar_guardas.py` não grava. Anote uma linha em `operacao/PENDENCIAS.md`
(origem `descoberta-ia`) e siga: a `tecnologia-mudar-banco` conduz o ensaio
quando o dono quiser.

Passo 3 verde e passo 4 feito = `7-banco` entregue (siga "Depois de cada
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
   última da ordem, quando tudo fechou).
2. Perguntar ao usuário se segue pra próxima etapa ou para por aqui. Só
   avançar depois de um "sim" explícito — nunca encadear etapas sozinho.
3. Se todas as etapas estiverem `concluida`/`pulada`, informar que a
   instalação terminou. Os times do kit já vêm instalados na Casa (conferir
   com `polozi-instalar-time`) e time novo é com o time Native AI: ficam fora
   deste fluxo.

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

**NUNCA escreva em ~/.codex/rules/** — é lá que o TUI grava o allow-list do
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
- Nunca avançar pra etapa seguinte sem o "sim" do usuário ao fim da etapa
  anterior.
- Nunca executar etapa fora da ordem fixa, mesmo a pedido — explique a
  dependência.
- Nunca gravar `projeto_confiado: sim` sem o aluno confirmar.
- Nunca marcar `0-preflight` concluída havendo item em bloqueio.
