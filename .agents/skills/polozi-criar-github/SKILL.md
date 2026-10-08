---
name: polozi-criar-github
description: "Cria o GitHub da empresa: repositório privado com auditoria de segredos. Use uma vez, na etapa do GitHub."
---

# Polozi Criar GitHub

Criar, uma única vez, o repositório PRIVADO no GitHub da Empresa
IA — backup fora do computador, com auditoria de segredos antes de qualquer
push. Público leigo: cada passo diz o que a pessoa deve VER na tela.

## Antes de qualquer comando

### Comando do Python

Ler `comando_python:` do frontmatter de `operacao/INSTALACAO.md` (gravado
pelo `polozi-instalador` na ETAPA 0). Valor diferente de `pendente` → use-o
como `<PY>`. Ainda `pendente`? Tentar, UM DE CADA VEZ e sem encadear com
`||` (cmd/PowerShell do Windows não garantem o encadeamento):

```
python3 --version
py -3 --version
python --version
```

O PRIMEIRO que imprimir `Python 3.` vira `<PY>` — todo comando `.py` desta
skill, daqui pra frente, escreve `<PY>` no lugar de "python". Nenhum
comando desta skill pode conter `python3` literal fora desta checagem.

### Resolver `<SKILL_IRMA>` (polozi-registrar-conexao)

Registrar a linha do GitHub em `credenciais/CONEXOES.md` é papel exclusivo
do script da skill irmã `polozi-registrar-conexao`, nunca desta skill à
mão. Não existe hoje variável oficial que entregue à skill o próprio
caminho; `$CWD` só serve pra descoberta [24a:skills/n09]; `PLUGIN_ROOT` só
existe pra hook, não pra skill [24a:plugins/n10]. Por isso o caminho da
skill irmã tem que ser ACHADO, com comando portátil (nunca
`ls`/`test -f`/bashismo — o público majoritário é Windows).

Buscar, NESTA ORDEM, do mais perto pro mais longe, um candidato de cada vez:

1. `<PASTA_ABERTA>/.agents/skills/polozi-registrar-conexao/scripts/provar_conexao.py`
2. `~/.agents/skills/polozi-registrar-conexao/scripts/provar_conexao.py`
3. cache de plugin, por GLOB — NUNCA escreva a versão do plugin fixa no
   meio do caminho [24a:plugins/n11]. Esse padrão de busca é
   `<PADRAO_GLOB_CACHE>`:
   `~/.codex/plugins/cache/*/polozi-fundacao/*/skills/polozi-registrar-conexao/scripts/provar_conexao.py`.
   Se o glob achar mais de um caminho, usar o de data de modificação mais
   recente.

Checar cada candidato com comando portátil (Mac/Windows), NUNCA `ls`/`test -f`:

```
<PY> -c "import pathlib,sys; print('OK' if pathlib.Path(sys.argv[1]).expanduser().is_file() else 'MISSING')" "<candidato>"
```

Pro item 3 (glob), resolver primeiro o candidato mais recente:

```
<PY> -c "import glob,os,sys; c=sorted(glob.glob(os.path.expanduser(sys.argv[1])), key=os.path.getmtime, reverse=True); print(c[0] if c else '')" "<PADRAO_GLOB_CACHE>"
```

O primeiro candidato que responder `OK` (ou que o glob devolver não-vazio)
vira `<SKILL_IRMA>` — a pasta que contém `scripts/provar_conexao.py` (sem o
`scripts/provar_conexao.py` no final).

Nenhum caminho achou → **PARE**: `polozi-registrar-conexao` está ausente ou
instalada incompleta. Mostre ao aluno e peça pra reinstalar o
`polozi-fundacao.zip` e reiniciar o app. Não improvise caminho, não rode
nada relativo, não copie script pra dentro da Casa.

## Preparar

1. Confirmar que a pasta aberta é a Empresa IA (`EMPRESA-IA.md` existe).
2. Confirmar que a Casa já veio pronta (instalada por `polozi-criar-empresa-ia`)
   — não recriar nada disto: `git rev-parse --is-inside-work-tree` (repositório
   já iniciado), `.gitignore` já protegendo `credenciais/.env`, e
   `git config core.hooksPath` apontando para `.githooks`. Faltar qualquer um
   → parar e orientar a rodar `polozi-criar-empresa-ia` primeiro; esta skill
   não é o lugar de consertar isso.
3. Checar ferramentas: `git --version` (no Mac, a primeira chamada pode abrir
   o pop-up nativo de instalação das Command Line Tools — deixar o dono
   confirmar) e `gh --version` (Mac: `brew install gh`; Windows:
   `winget install Git.Git GitHub.CLI`), reabrindo o terminal depois. Sem
   conseguir instalar → fallback no fim.
4. Conta GitHub: perguntar se o dono já tem uma. Não tem → abrir
   `github.com/signup` no Chrome dele e guiar campo a campo — quem digita
   usuário, senha e e-mail é sempre o dono, você só aponta o próximo campo.
   Assim que a conta nascer, oriente a ativar 2FA por app autenticador (não
   SMS).
5. Login do CLI: `gh auth status`. Não logado → `gh auth login` escolhendo
   **GitHub.com → HTTPS → Login with a web browser**. O navegador abre com um
   código de 8 letras; o dono digita o código e clica em Authorize — **você
   nunca vê nem pede senha ou token**.
6. Nome do repositório: ler `slug_os:` no frontmatter de `operacao/INSTALACAO.md`
   (o nome do sistema, ex.: `clima-os`, gravado pela etapa da Casa). Ausente ou
   `pendente` → parar e mandar rodar a etapa da Casa no `polozi-instalador`;
   nunca inventar o nome aqui.
7. De onde a Casa veio: `git remote get-url origin`. Sem `origin` (o comando
   responde `No such remote 'origin'`) é a Casa do zip: siga. Termina em
   `polozigit/mestre-das-ias-os`? Então a Casa foi CLONADA do repositório-modelo, e
   esse `origin` é do modelo, não do dono: **NUNCA `git push` nem `gh repo rename`
   nele** (o dono não tem permissão, e o histórico do modelo não é dele).

## Executar

1. **Varredura pré-subida**: o hook `.githooks/pre-push` da Casa varre todo
   push, inclusive o primeiro (falha fechada: na dúvida, bloqueia). Hook
   bloqueou = corrigir o que ele apontou antes de continuar — push que
   "passou mesmo assim" não existe.
2. Criar o repositório PRIVADO com o nome do sistema (`<slug_os>`, lido no passo 6
   de Preparar: minúsculo, sem espaço, sem acento, sem dado sensível). Três casos:
   - **Casa clonada do repositório-modelo** (`origin` do modelo): troca o `origin`
     pelo repositório do dono ANTES do primeiro push. `git remote remove origin` só
     desfaz a ligação local com o modelo (não apaga nem empurra nada); o repositório
     novo nasce já com o histórico da Casa, e o hook `.githooks/pre-push` varre esse
     histórico inteiro no primeiro push, então ele demora um pouco mais:
     ```
     git remote remove origin
     gh repo create <slug_os> --private --source=. --push
     ```
   - **Casa do zip, sem `origin`**: só o segundo comando:
     `gh repo create <slug_os> --private --source=. --push`.
   - **O dono já tem um repositório DELE (o `origin` não é o modelo) com outro nome**:
     não criar um segundo. `gh repo rename <slug_os>` renomeia o repositório dele; depois
     confira com `git remote get-url origin` que o `origin` aponta pro nome novo (se não,
     `git remote set-url origin <url nova>`).

   Nome já ocupado na conta do dono? Combine outro com ele (por exemplo as duas
   primeiras palavras da empresa, `climasul-os`), troque o `slug_os:` em
   `operacao/INSTALACAO.md` (vale pra GitHub, Vercel e Supabase) e tente de novo.
   Confirmar na tela: o link termina no nome do repositório e a página mostra
   o cadeado "Private".
3. Proteção de segredo no GitHub: ler a visibilidade com
   `gh repo view --json visibility --jq .visibility`.
   - `PUBLIC`: ativar a varredura de segredo e o bloqueio de push com
     `gh api -X PATCH repos/{owner}/{repo} -f 'security_and_analysis[secret_scanning][status]=enabled' -f 'security_and_analysis[secret_scanning_push_protection][status]=enabled'`
     e dizer ao dono que isso foi ativado.
   - `PRIVATE` (o que esta skill cria): dizer numa linha que o GitHub só
     oferece essa proteção de graça em repositório público, então aqui a
     proteção fica nos hooks da Casa e na Action gitleaks. Nunca prometer a
     proteção do GitHub em repositório privado.
4. Teste de fogo: abrir o link no navegador do dono e ver o `EMPRESA-IA.md`
   lá.
5. Registrar chamando o script da skill irmã `polozi-registrar-conexao`
   (caminho resolvido em "Antes de qualquer comando"), que só grava a linha
   depois que `gh auth status` provar:

   ```
   <PY> "<SKILL_IRMA>/scripts/provar_conexao.py" --servico github --para "GitHub da empresa"
   ```

   **Não** entra em `capacidades/` — capacidades é só automação e MCP,
   GitHub aqui é login de dono, sem variável de ambiente.
6. Fechar avisando: "daqui pra frente eu salvo sozinho nos momentos certos,
   sempre com varredura de segredo antes de subir."

## Verificar

1. `gh repo view --json visibility` retorna `PRIVATE`.
2. `git remote -v` aponta pro repositório do dono, com o nome do sistema, e NÃO
   pra `polozigit/mestre-das-ias-os`.
3. `.gitignore` está no GitHub e `credenciais/.env` NÃO aparece no site.
4. A linha do GitHub em `credenciais/CONEXOES.md` foi gravada pelo script
   (coluna Prova = `gh auth status`).

## Fallback sem gh

Criar o repositório em github.com (New repository → Private, com o nome do
sistema), copiar a URL e: `git remote add origin <url>` (se já houver um `origin`
do modelo, `git remote set-url origin <url>`) + `git push -u origin main`. A senha do push é
gerenciada pelo Git Credential Manager (janela do navegador) — nunca colada
no chat. A varredura pré-subida (passo 1 de Executar) acontece do mesmo jeito,
antes desse push: o hook `.githooks/pre-push` da Casa roda em todo push.

## Limites

- NUNCA repositório público.
- NUNCA pedir ou colar senha, token ou código de autorização no chat — nem da
  conta GitHub, nem do `gh auth login`.
- Nome do repositório sem dado sensível (CNPJ, telefone, endereço).
- NUNCA `git push` nem `gh repo rename` com o `origin` apontando pro repositório-modelo
  `polozigit/mestre-das-ias-os`: o `origin` do modelo não é do dono. Primeiro troca o
  `origin` (passo 2 de Executar), depois empurra.
- Já existe repositório DO DONO no GitHub (remote `origin` configurado e que não é o
  modelo)? Não criar um segundo (no máximo `gh repo rename` pro nome do sistema): o
  dia a dia de commit e push é a skill `tecnologia-publicar`, fora do escopo desta
  skill.
- Push que o hook `.githooks/pre-push` bloqueou não é contornado: corrige-se o
  que ele apontou.
