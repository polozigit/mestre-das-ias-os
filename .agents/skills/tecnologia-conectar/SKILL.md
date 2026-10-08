---
name: tecnologia-conectar
description: "Liga Vercel, Supabase e cofre do sistema e prova o site no ar. Use ao instalar o sistema. Não use pra publicar nem serviço novo."
metadata:
  origem: polozi
  diretoria: tecnologia
---

# tecnologia-conectar

Liga o sistema da empresa (Vercel) ao banco (Supabase) e prova, por comando, que o site está no ar lendo o banco e que o convite do dono aponta para o endereço certo. O trabalho pesado é de um script só, `scripts/conectar.py`, que prova o próprio resultado. Rodar de novo é seguro: nada se duplica.

## Quando usar

- Chamada pelo `polozi-instalador`, na etapa `8-sistema`, passo (e). Também serve para refazer uma ligação que falhou.
- Não use para publicar uma mudança do sistema: isso é da `tecnologia-publicar`.
- Não use para conectar serviço novo nem guardar a chave de outro serviço: isso é da `tecnologia-acessos`.

## Antes de qualquer comando

- `<PY>` é o `comando_python:` de `operacao/INSTALACAO.md` (no Windows costuma ser `py -3` ou `python`).
- `<CASA>` é a pasta principal aberta, caminho absoluto, entre aspas. Rode os comandos da raiz da Casa.
- No Windows, use o PowerShell: os comandos abaixo rodam nele sem mudar nada.
- Precisa da CLI da Vercel instalada e logada. Sem ela: `npm i -g vercel` (ou `npx vercel`) e `vercel login`. Se travar, siga a seção "CLI da Vercel no Windows" de `referencias/roteiro-cliques.md`.
- `<DOMINIO>` é só o endereço de produção, sem `https://` e sem barra (ex.: `minha-empresa.vercel.app`). `<TIME>` é o apelido do time da Vercel (a parte final dos endereços de prévia).

## Passos

Na ordem do instalador. Cada passo diz o comando, a prova e o que fazer se falhar.

### (e1) Criar o projeto na Vercel

A IA cria o projeto pelo conector da Vercel (detalhes em `## Plataforma e limites`): nome igual ao `slug_os:` de `operacao/INSTALACAO.md`, repositório da Casa, pasta raiz `sistemas/empresa-os`. Crie sem deploy automático (`deploy=false` no conector): o deploy de preview do padrão sai vermelho, porque as variáveis do banco ainda não existem. Anote o `id` do projeto e o endereço de produção `.vercel.app`.

Prova: o conector mostra o projeto com o nome `slug_os`. Sem o conector, ou 2 falhas: seção "Projeto na Vercel a mão" do roteiro.

### (e2) Ligar a Casa ao projeto e instalar as guardas

```
<PY> .agents/skills/tecnologia-publicar/scripts/instalar_guardas.py --casa "<CASA>"
```

Faz o link com `--project <slug_os>`, liga o git, publica o token de QA, copia as guardas e grava os Secrets do GitHub. Saída 0 e o arquivo `sistemas/empresa-os/.vercel/project.json` criado. Saída 2 com `slug_os`: o instalador ainda não gravou o nome do sistema, volte à etapa `3-casa`.

### (e3) Conferir o projeto e gravar as variáveis do banco

```
<PY> .agents/skills/tecnologia-conectar/scripts/conectar.py projeto --casa "<CASA>"
```

Prova: o nome do projeto ligado é o `slug_os`. Se disser que falta o nome no `.vercel/project.json`, passe o `id` que o conector devolveu no (e1):

```
<PY> .agents/skills/tecnologia-conectar/scripts/conectar.py projeto --projeto-id <ID> --casa "<CASA>"
```

Depois as variáveis, ANTES da primeira publicação (o build precisa delas):

```
<PY> .agents/skills/tecnologia-conectar/scripts/conectar.py vercel-env --casa "<CASA>"
```

Prova: `prova production: 3/3 nomes` e `prova preview: 3/3 nomes` (a prova é só por NOME, o valor nunca aparece). Variável que já existia com valor errado fica `[pulado]`: trocar o valor é no painel da Vercel ou com `vercel env rm`, fora desta skill.

### (e4) Primeira publicação

Chame a `tecnologia-publicar`, como sempre, e espere o site publicado em produção. Depois, pergunte à Vercel qual é o endereço de produção de verdade (nome de projeto já usado por outra conta ganha um sufixo) e use esse como `<DOMINIO>`.

### (e5) Login do Supabase e prova ponta a ponta

```
<PY> .agents/skills/tecnologia-conectar/scripts/conectar.py auth-urls --casa "<CASA>" --dominio-prod <DOMINIO> --time-vercel <TIME>
```

Grava o Site URL e as Redirect URLs (o que já existia fica). Prova: o script lê de volta e confere. Token recusado (HTTP 401 ou 403): nada foi gravado; confira o `SUPABASE_ACCESS_TOKEN` da etapa `7-banco`.

```
<PY> .agents/skills/tecnologia-conectar/scripts/conectar.py provar --casa "<CASA>" --dominio <DOMINIO> --time-vercel <TIME>
```

São 3 provas (o site responde 200 em `/login` sem redirecionar, os nomes estão na Vercel, o Supabase tem o endereço certo). Só siga se imprimir `TUDO LIGADO`. A linha `[FALHA]` diz qual prova caiu.

```
<PY> .agents/skills/tecnologia-conectar/scripts/conectar.py vault --casa "<CASA>" --repo <DONO/REPO> --org-supabase <ORG> --time-vercel <TIME> --projeto-vercel <SLUG_OS> --escopo-token pat
```

Guarda cada segredo do `credenciais/.env` no cofre do banco (Vault) e registra onde cada um vive no inventário do banco (`public.conexao`). Depois escreve um espelho em lista em `credenciais/CONEXOES.md`, entre `<!-- BANCO:INICIO -->` e `<!-- BANCO:FIM -->`; o resto do arquivo fica igual. O `credenciais/.env` NÃO é apagado: o script que regrava os Secrets e o `7-banco` ainda leem dele. `<DONO/REPO>` é o repositório da Casa no GitHub; `<ORG>` é o identificador da organização do projeto no Supabase; use `--escopo-token total` se o token da etapa `7-banco` foi criado com acesso total. Prova: a linha `N conexão(ões) lidas de public.conexao` (com N maior que zero) e o bloco `BANCO` atualizado. Se falhar, nada é escrito no `CONEXOES.md`: anote 1 linha em `operacao/PENDENCIAS.md` (o motivo, sem valor de chave) e siga, porque nada no fluxo depende do vault. Nunca cole o valor de uma chave num SQL: o texto do SQL vai para o log do banco.

### (e6) Convite do dono

Quem faz é o instalador, não esta skill: ele roda o `setup-inicial.mjs` de novo com `SITE_URL=https://<DOMINIO>`, e o convite do dono sai apontando para o endereço publicado, não para localhost.

## Regras de segredo

- Nunca chame `buy_pro`, `buy_domain`, `buy_credits` nem `buy_addon`: são compras na hora, sem reembolso.
- Nunca chame `buy_credits_endpoint`: não executa compra, mas é de cobrança e não faz parte desta skill.
- Nunca chame `get_project_env` nem `get_shared_env_var`: devolvem o valor da chave.
- Nunca chame `filter_project_envs` com `decrypt`, nem rode `vercel env pull` ou `vercel env run`: os três trazem o valor da chave.
- O valor de uma chave nunca aparece no chat. Ele anda do `credenciais/.env` para o script, e do script para a Vercel por um arquivo temporário apagado logo depois. A IA não abre o `credenciais/.env`.
- Você não lê o cofre do banco. Isso é disciplina, não tranca.
- O script nunca escreve no `credenciais/.env`.

## Se falhar

- Prova falhou: PARE e explique em palavras simples o que a mensagem disse. Não diga "ligado" sem a prova.
- 2 falhas no mesmo passo: entregue a seção certa de `referencias/roteiro-cliques.md` e PARE.
- Rodar de novo é seguro (cada passo é idempotente).

## Plataforma e limites

Hoje esta skill roda no Codex. Chame pelo nome: `$tecnologia-conectar`. Ela não dispara sozinha (`allow_implicit_invocation: false`), porque escreve na Vercel e no Supabase.

- Conector da Vercel, passo (e1): a ferramenta `create_git_project` cria o projeto (nome `slug_os`, pasta raiz `sistemas/empresa-os`, com `deploy=false`); `get_project` devolve o `id` e o endereço de produção; `list_teams` devolve o apelido do time. Se o conector não tiver essas ferramentas, ou o nome delas mudou, siga o roteiro "Projeto na Vercel a mão". O conector não recebe valor de chave: as variáveis vão pela CLI.
- Rede: o script fala com a CLI da Vercel, com `api.supabase.com` e com o endereço do site. No modo `workspace-write` a rede de saída precisa estar ligada (a Casa liga `network_access = true`).
- Risco aceito (preview): o preview usa o MESMO banco da produção até existir homologação. Um teste no preview mexe em dado real. A pendência está registrada na etapa `7-banco` do instalador ("Fica para depois").
- Ainda não medido: o STDIN pela `vercel.cmd` no Windows real. Se falhar 2 vezes, use o roteiro "CLI da Vercel no Windows".

Outra plataforma: esta seção ganha a parte dela quando o kit tiver o adaptador.
