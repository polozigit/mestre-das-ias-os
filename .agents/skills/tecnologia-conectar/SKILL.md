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
- Precisa da CLI da Vercel instalada e logada. Sem ela, a IA instala sem perguntar (`npm i -g vercel`) e roda `vercel login`, que abre a página de login no navegador: a IA a conduz no Chrome do dono e só a senha, o código e o 2FA são do dono. `vercel whoami` tem que mostrar a conta do aluno. Se travar, siga a seção "CLI da Vercel no Windows" de `referencias/roteiro-cliques.md`.
- Sem perguntar "posso?": cada passo abaixo a IA executa direto, pelo terminal ou pelo Chrome do dono. Para só em senha, código do celular, 2FA, janela de permissão do sistema, gasto de dinheiro e apagar dados.
- `<DOMINIO>` é só o endereço de produção, sem `https://` e sem barra (ex.: `minha-empresa.vercel.app`). `<TIME>` é o apelido do time da Vercel (a parte final dos endereços de prévia).

## Passos

Na ordem do instalador. Cada passo diz o comando, a prova e o que fazer se falhar.

### (e1) Criar o projeto na Vercel

Antes de criar, nesta ordem (cada item confere antes se já está feito):

1. **Conector na conta do aluno.** O conector (plugin) da Vercel é da conta do app, não do usuário do computador: no teste de 08/10/2026 ele estava ligado na Vercel de outra pessoa e o projeto não foi criado (403). Rode `list_teams` e mostre ao dono o nome do time. Não é a conta dele? PARE e ensine a religar o plugin com a conta dele; plugin religado só vale em CONVERSA NOVA (as ferramentas somem na conversa aberta), então peça para abrir uma conversa nova e chamar `$polozi-instalador` de novo.
2. **Conta da Vercel verificada.** Conta nova pede o número do celular por SMS (um número só serve para uma conta): o código é do dono, com o celular na mão.
3. **App "Vercel" no GitHub do aluno, com acesso a TODOS os repositórios** (decisão do Polozi, 08/10/2026). Sem ele a Vercel não enxerga o repositório privado (`repo_not_found`). A IA abre `https://github.com/apps/vercel` no Chrome do dono, clica em instalar (ou "Configure", se já existir) na conta do aluno, escolhe "All repositories" e salva; a senha ou o 2FA do GitHub, se pedirem, são do dono. A instalação se confere pela Vercel (o repositório aparece na importação), não pelo `gh api`, que não lista instalação de app com token de usuário (403).

A IA cria o projeto pelo conector da Vercel (detalhes em `## Plataforma e limites`): nome igual ao `slug_os:` de `operacao/INSTALACAO.md`, repositório da Casa, pasta raiz `sistemas/empresa-os`. Crie sem deploy automático (`deploy=false` no conector): o deploy de preview do padrão sai vermelho, porque as variáveis do banco ainda não existem. Anote o `id` do projeto e o endereço de produção `.vercel.app`. A branch de produção é a `main` (no teste, sem isso a Vercel publicou uma branch do Dependabot como produção). Deploy de branch errada em produção se resolve publicando a `main` por cima (passo e4); nunca remova o domínio de produção na instalação.

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

Antes, o banco de teste do preview precisa existir: rode a seção "Homologação" abaixo (o instalador faz isso na etapa `7-banco`). Sem os valores `_HOMOLOG` no `credenciais/.env`, o `vercel-env` PARA e manda rodar o `homologacao`: nunca cai para o banco de produção.

A produção lê o banco real; o preview lê o banco de homologação. Na produção ainda vão duas variáveis públicas de homologação (`NEXT_PUBLIC_SUPABASE_URL_HOMOLOG` e `NEXT_PUBLIC_SUPABASE_ANON_KEY_HOMOLOG`), que o keep-alive usa para manter o banco de teste acordado. No preview o script remove a variável antes de gravar, então rodar de novo numa Casa instalada antes da homologação TROCA o preview do banco real para o de teste.

Prova: `prova production: 5/5 nomes` e `prova preview: 3/3 nomes` (a prova é só por NOME, o valor nunca aparece). Variável de produção que já existia fica `[pulado]`.

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
<PY> .agents/skills/tecnologia-conectar/scripts/conectar.py vault --casa "<CASA>" --repo <DONO/REPO> --org-supabase <ORG> --time-vercel <TIME> --projeto-vercel <SLUG_OS> --escopo-token total
```

Guarda cada segredo do `credenciais/.env` no cofre do banco (Vault) e registra onde cada um vive no inventário do banco (`public.conexao`). Depois escreve um espelho em lista em `credenciais/CONEXOES.md`, entre `<!-- BANCO:INICIO -->` e `<!-- BANCO:FIM -->`; o resto do arquivo fica igual. O `credenciais/.env` NÃO é apagado: o script que regrava os Secrets e o `7-banco` ainda leem dele. `<DONO/REPO>` é o repositório da Casa no GitHub; `<ORG>` é o identificador da organização do projeto no Supabase; o token da etapa `7-banco` é sempre de acesso total (decisão de 08/10/2026), por isso `--escopo-token total`; `pat` só para uma Casa antiga que ainda use token escopado. Prova: a linha `N conexão(ões) lidas de public.conexao` (com N maior que zero) e o bloco `BANCO` atualizado. Se falhar, nada é escrito no `CONEXOES.md`: anote 1 linha em `operacao/PENDENCIAS.md` (o motivo, sem valor de chave) e siga, porque nada no fluxo depende do vault. Nunca cole o valor de uma chave num SQL: o texto do SQL vai para o log do banco.

### (e6) Convite do dono

Quem faz é o instalador, não esta skill: ele roda o `setup-inicial.mjs` de novo com `SITE_URL=https://<DOMINIO>`, e o convite do dono sai apontando para o endereço publicado, não para localhost.

## Banco de produção (antes da homologação)

```
<PY> .agents/skills/tecnologia-conectar/scripts/conectar.py banco --casa "<CASA>"
```

Cria o projeto Supabase de produção `<slug_os>` só com o `SUPABASE_ACCESS_TOKEN` que o aluno pôs no `credenciais/.env`: o aluno não digita senha de banco e o Chrome só cria o token. Gera a senha do banco, grava no `.env` na hora, espera o projeto ficar no ar (até 10 minutos), expõe os schemas `tarefas` e `organograma` e grava as 5 variáveis (`SUPABASE_PROJECT_ID`, `SUPABASE_DB_PASSWORD`, `NEXT_PUBLIC_SUPABASE_URL`, `NEXT_PUBLIC_SUPABASE_ANON_KEY`, `SUPABASE_SERVICE_ROLE_KEY`). Região padrão `sa-east-1` (São Paulo; outra com `--regiao`). O token abre mais de uma organização? O script para e lista as organizações; rode de novo com `--org <slug>` da organização da empresa. Projeto já anotado no `.env` (`SUPABASE_PROJECT_ID`) é reaproveitado e nunca ganha um segundo por cima; se o token não abrir esse projeto, o script para sem criar nada. Recusa se a produção for igual à homologação.

Prova: linhas `[ok] banco` com o projeto no ar e as variáveis gravadas (só nomes). Limite do plano gratuito (2 projetos ativos): para com uma mensagem em português e não grava nada. Se a API falhar por outro motivo, o instalador cai no caminho de reserva pelo Chrome (etapa `7-banco`, passo 1).

## Homologação (banco de teste do preview)

```
<PY> .agents/skills/tecnologia-conectar/scripts/conectar.py homologacao --casa "<CASA>"
```

Cria o projeto Supabase `<slug_os>-homolog` na mesma organização e região da produção, com o `SUPABASE_ACCESS_TOKEN` que o aluno já pôs no `credenciais/.env` (zero clique, zero chave nova). Gera a senha do banco sozinho, grava no `.env` na hora, espera o projeto ficar no ar (até 10 minutos), expõe os schemas `tarefas` e `organograma` e grava as 5 variáveis `_HOMOLOG` (`SUPABASE_PROJECT_ID_HOMOLOG`, `SUPABASE_DB_PASSWORD_HOMOLOG`, `NEXT_PUBLIC_SUPABASE_URL_HOMOLOG`, `NEXT_PUBLIC_SUPABASE_ANON_KEY_HOMOLOG`, `SUPABASE_SERVICE_ROLE_KEY_HOMOLOG`). Rodar de novo é seguro: acha o projeto por nome e organização, despausa se estiver pausado e não cria outro. Recusa se o código de homologação for igual ao de produção.

Prova: linhas `[ok] homologacao` com o projeto no ar e as variáveis gravadas (só nomes). Limite do plano gratuito do Supabase (2 projetos ativos): o script para com uma mensagem em português e não grava nada; o aluno pausa ou apaga um projeto gratuito que não usa no painel do Supabase e o passo é rodado de novo. Esse passo nunca trava a instalação do sistema: com a homologação pendente, rode `vercel-env` e `provar` com `--sem-preview` (só a produção; o script avisa `[pendente]` e o preview fica sem banco até a homologação existir) e, quando houver vaga, repita o `homologacao` e o `vercel-env` sem a opção.

## Regras de segredo

- Nunca chame `buy_pro`, `buy_domain`, `buy_credits` nem `buy_addon`: são compras na hora, sem reembolso.
- Nunca chame `buy_credits_endpoint`: não executa compra, mas é de cobrança e não faz parte desta skill.
- Nunca chame `get_project_env` nem `get_shared_env_var`: devolvem o valor da chave.
- Nunca chame `filter_project_envs` com `decrypt`, nem rode `vercel env pull` ou `vercel env run`: os três trazem o valor da chave.
- O valor de uma chave nunca aparece no chat. Ele anda do `credenciais/.env` para o script, e do script para a Vercel por um arquivo temporário apagado logo depois. A IA não abre o `credenciais/.env`.
- Você não lê o cofre do banco. Isso é disciplina, não tranca.
- Só os subcomandos `banco` e `homologacao` escrevem no `credenciais/.env`, e só os 5 nomes do seu banco (`banco`: os de produção; `homologacao`: os terminados em `_HOMOLOG`). Os outros subcomandos nunca tocam nele.

## Se falhar

- Prova falhou: PARE e explique em palavras simples o que a mensagem disse. Não diga "ligado" sem a prova.
- 2 falhas no mesmo passo: entregue a seção certa de `referencias/roteiro-cliques.md` e PARE.
- Rodar de novo é seguro (cada passo é idempotente).

## Plataforma e limites

Hoje esta skill roda no Codex. Chame pelo nome: `$tecnologia-conectar`. Ela não dispara sozinha (`allow_implicit_invocation: false`), porque escreve na Vercel e no Supabase.

- Conector da Vercel, passo (e1): a ferramenta `create_git_project` cria o projeto (nome `slug_os`, pasta raiz `sistemas/empresa-os`, com `deploy=false`); `get_project` devolve o `id` e o endereço de produção; `list_teams` devolve o apelido do time. Se o conector não tiver essas ferramentas, ou o nome delas mudou, siga o roteiro "Projeto na Vercel a mão". O conector não recebe valor de chave: as variáveis vão pela CLI.
- Rede: o script fala com a CLI da Vercel, com `api.supabase.com` e com o endereço do site. No modo `workspace-write` a rede de saída precisa estar ligada (a Casa liga `network_access = true`).
- Preview: usa o banco de homologação (`<slug_os>-homolog`, criado pelo subcomando `homologacao`), nunca o de produção. Um teste no preview não mexe em dado real. O plano gratuito do Supabase pausa projeto parado por cerca de 7 dias; o keep-alive do sistema também consulta o banco de teste para evitar isso.
- Ainda não medido: o STDIN pela `vercel.cmd` no Windows real. Se falhar 2 vezes, use o roteiro "CLI da Vercel no Windows".

Outra plataforma: esta seção ganha a parte dela quando o kit tiver o adaptador.
