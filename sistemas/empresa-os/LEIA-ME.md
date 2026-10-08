# Roteiro de instalação do sistema

> **Pra IA da empresa** (Codex): este é o passo a passo completo pra
> colocar o sistema no ar. Siga NA ORDEM: cada passo depende do anterior.
> O dono não é programador: explique cada etapa em 1 linha antes de executar
> e mostre o resultado quando der. Pré-requisitos: a Casa configurada (etapa
> `3-casa` do instalador), o repositório do dono no GitHub (`4-github`) e o
> banco pronto (`7-banco`: projeto Supabase, Secrets e migrations aplicadas pela
> Action). A identidade visual NÃO é pré-requisito: na ordem da aula o sistema
> entra no ar antes da marca (`6-marca`, tela Marca).

## Os 9 passos

**1. Dependências.** O sistema já está em `sistemas/empresa-os/` da Casa (vem
no repositório-modelo; no zip antigo, descompacte aí). Pasta FIXA: skills e
instruções do curso apontam pra esse caminho; nunca renomear. O setup do
passo 6 só precisa de um pacote (Node 20.9 ou mais novo; o preflight confere).
Dentro de `sistemas/empresa-os`, rode
`npm install --prefix scripts --no-save "@supabase/supabase-js@2"`: baixa uns
9 MB em `scripts/node_modules` (git-ignored) e não mexe no `package.json` do
sistema. As aspas são obrigatórias (no PowerShell o `@` sem aspas quebra).
Prove com
`node -p "require.resolve('@supabase/supabase-js', {paths: ['./scripts']})"`
(imprime um caminho dentro de `scripts/node_modules`) e com
`git status --porcelain` (nada novo). A Vercel instala as dependências
completas na nuvem, no build. O `npm install` completo (centenas de MB) só vale
para a prévia local do passo 4 ou para mexer no código (lint, tsc, test).

**2. Mockup (opcional, só com marca pronta).** Se `empresa/marca/identidade-visual.md`
já existe, pergunte ao dono: *"quer ver 2-3 conceitos visuais do seu sistema
antes de montar?"* Gere os conceitos com a identidade visual de `empresa/marca/`
e deixe ele aprovar UM. O mockup é descartável: ele dita a CARA, nunca a
estrutura das telas. Na ordem da aula a marca vem DEPOIS do sistema no ar: sem
`identidade-visual.md`, pule este passo.

**3. Aplicar a marca.** Edite SÓ estes 3 arquivos (o `DESIGN.md` explica cada
token):
- `config/empresa.ts` — nome, slug, descrição, nome/email do dono (substitua
  todos os `{{PLACEHOLDERS}}`; o slug é `minusculas-numeros-hifen`)
- `src/app/theme.css` — cores/tipografia/arredondamento traduzidos do mockup
  aprovado (ou direto da `identidade-visual.md`, se o dono pulou o passo 2).
  Sem marca ainda, fica o tema padrão do molde; a marca entra depois, como
  mudança normal do sistema (pedido, prévia, QA, produção)
- `public/marca/logo.svg` (+ `favicon.svg`) — a logo real da empresa
  (sem logo ainda, fica a do molde)
O nome exibido do sistema é sempre `<Nome da Empresa> OS` — vem pronto do
`config/empresa.ts`, não montar na mão.

**4. Preview local.** Gere `.env.local` a partir do `credenciais/.env` da Casa
(só as variáveis do `conexao.md`; o arquivo é git-ignored). Rode `npm install` (o completo, uma vez; o passo 1 baixou só o pacote do setup)
e depois `npm run dev`
e abra no navegador: *"olha como ficou"*. Ajuste o tema até o dono aprovar.

**5. Migrations no banco.** Aplique TODOS os arquivos de `supabase/migrations/`
no projeto Supabase do dono, NA ORDEM, da primeira à última. Quem conduz é a
skill `tecnologia-mudar-banco` (classifica, tira cópia, grava o veredito): a
migration entra em produção pela Action `deploy-db.yml`, ao entrar na `main`, e
o ensaio vai pela homologação (`deploy-db-homologacao.yml`). Nunca pelo
conector MCP nem por `supabase db push` na máquina (regra do
`supabase/README.md`; o hook da Casa recusa o `db push` e o `apply_migration`
sem veredito). O `supabase/README.md` explica cada uma e o que fazer se falhar.
Cada migration termina num teste automático: erro ali é sinal de problema real,
não siga adiante com erro.

Repositório recém-clonado do modelo: as migrations JÁ estão na `main`, então
não há push que dispare a Action. Nesse caso (primeira instalação): grave os
Secrets do GitHub primeiro (`instalar_guardas.py` da skill `tecnologia-publicar`,
só a etapa de secrets; os workflows já vêm em `.github/` da raiz) e dispare a
Action à mão: `gh workflow run deploy-db.yml --ref main`, acompanhando com
`gh run watch` até ficar verde. Vermelho: `gh run view --log-failed`, corrija a
causa e rode de novo; nunca aplique na mão.

Depois das migrations, e ANTES do passo 6, libere os módulos novos na API do
Supabase: no painel do projeto, **Project Settings > Data API > Exposed
schemas**, acrescente `tarefas` e `organograma` à lista (mantenha os que já
estão) e salve. Sem isso o setup para com o erro `PGRST106`, que repete essa
instrução.

**6. Seed + convite do dono.** `source credenciais/.env && SITE_URL=<url do
passo 7, ou http://localhost:3000 por enquanto> node scripts/setup-inicial.mjs`.
Isso cria a empresa e o dono, carrega o organograma de referência
e o plano do curso (já com o cronograma de tarefas), registra os agentes do núcleo na tela Time de Agentes, coloca os agentes instalados nas
posições do Time de IA do organograma e manda o e-mail de convite
pro dono definir a senha. O cronograma começa em `CURSO_INICIO`
(`AAAA-MM-DD`, o Dia 1 do curso); sem essa variável, começa hoje. Idempotente:
rodar de novo não duplica nada; se o cronograma já existe, mantém o início
gravado (e para com aviso se `CURSO_INICIO` for outra data). Se o plano
ganhou versão nova, o setup só acrescenta as tarefas que faltam e reordena o
cronograma. Como rodar o setup prova que o banco está de pé, ele
também marca como concluídos os passos de contas até banco (uma vez só:
o que o aluno reabrir depois não é concluído de novo). O passo "sistema no ar"
só é concluído com prova real: `SITE_URL` em https (sem localhost) e o
`/login` respondendo 200. Rodando antes da Vercel, ele fica aberto e o setup
avisa; rode de novo depois do deploy, com a URL da Vercel, pra concluir.

**7. Vercel.** O projeto na Vercel se chama `<slug>` (o `slug_os` da Casa) e a raiz dele é `sistemas/empresa-os/`. Na instalação a IA o cria pelo conector da Vercel; sem o conector, você importa o repositório da Casa à mão, com esse nome.
As variáveis do banco, em produção e preview, quem grava é a skill `tecnologia-conectar` (subcomando `vercel-env`): a URL (`NEXT_PUBLIC_SUPABASE_URL` ou `SUPABASE_URL`), a
chave pública (`NEXT_PUBLIC_SUPABASE_ANON_KEY` ou `SUPABASE_PUBLISHABLE_KEY`) e a
chave de serviço (`SUPABASE_SERVICE_ROLE_KEY` ou `SUPABASE_SECRET_KEY`). O sistema
aceita os dois nomes de cada uma (leitura única em `config/supabase-env.mjs` e
`config/supabase-env-servidor.mjs`; ver `conexao.md`) e a skill grava o primeiro nome
de cada par. Não ligue também a integração do Marketplace Supabase → Vercel: ela grava os
outros nomes e duplica as variáveis. A IA só PROVA por `vercel env ls` que os nomes
apareceram, nunca cadastra isso na mão no painel. O preview usa o MESMO banco da
produção até existir homologação: um teste no preview mexe em dado real (risco aceito,
anotado como pendência na etapa `7-banco` do instalador).
O token de QA (`PREVIEW_TEST_TOKEN`, e o par `PREVIEW_QA_EMAIL`/
`PREVIEW_QA_PASSWORD`) entra por CLI (`vercel env add PREVIEW_TEST_TOKEN
preview`, valor vindo de arquivo, nunca do chat): quem faz isso é o
`instalar_guardas.py` da skill `tecnologia-publicar` (passo 9). O par é de um
membro só de leitura que o dono cria na tela Usuários; o script só o publica
depois que o dono o guardou em `credenciais/.env`. Depois da primeira publicação,
a `tecnologia-conectar` (subcomando `auth-urls`) grava no Supabase o Site URL e as
Redirect URLs `https://<dominio>/**` e `https://*-<time-da-vercel>.vercel.app/**`
(previews; `<time-da-vercel>` é o apelido do time da Vercel, não o nome do projeto),
sem apagar as que já existem. Deploy de preview → QA exercita como usuário (regra no AGENTS.md)
→ aprovado → produção. Com o sistema publicado, rode o setup do passo 6 de novo com o
`SITE_URL` definitivo: é ele que conclui o passo "sistema no ar". Convite já
enviado só sai de novo com `REENVIAR_CONVITE=1`.

**8. Primeiro login.** O dono abre o e-mail de convite, define a senha (2x) e
entra — de preferência pelo CELULAR, pra sentir o "eu tenho um sistema". Mostre:
Início, Cronograma, Tarefas, Organograma, Time de Agentes (clique num agente
pra ver o que ele faz), Marca, Usuários (convidar sócio/esposa), Atividade e Configurações. No topo há o botão de tema
(claro, escuro ou o do aparelho); no desktop o menu lateral recolhe, e no
celular ele abre como gaveta pelo botão do canto.

**9. Guardas.** O sistema ganha arquivos de vigilância automática: PR
checado antes de mergear, com o veredito de cada migration conferido
(`ci.yml`), migration só chega em produção pela Action (`deploy-db.yml`, com
ensaio antes em `deploy-db-homologacao.yml`), segredo vazado vira alarme
(`gitleaks.yml`), o banco é tocado todo dia para o projeto Free não pausar
(`keep-alive.yml`) e a cópia semanal do banco (`backup-db.yml`). Eles nascem
dentro de `sistemas/empresa-os/.github/`: nesse lugar são arquivo morto,
porque o GitHub só lê `.github/` da RAIZ do repositório da Casa. A única forma
suportada de ligá-los é a seção "Primeira vez neste sistema" da skill
`tecnologia-publicar`, que roda (da pasta principal da Casa, com o Python de
`operacao/INSTALACAO.md`):

```
python3 .agents/skills/tecnologia-publicar/scripts/instalar_guardas.py --casa "<pasta principal da Casa>"
```

Na instalação pelo instalador, ele já roda no passo 7; aqui só confira o bloco `DEPLOY` de `operacao/INSTALACAO.md`.

**Token da Supabase (`SUPABASE_ACCESS_TOKEN`).** O `instalar_guardas.py` grava
esse token nos Secrets do GitHub (`deploy-db.yml`, `backup-db.yml` e
`keep-alive.yml` dependem dele). Se ele
ainda não estiver em `credenciais/.env`, o dono cria no painel da Supabase
(Account > Access Tokens) e a IA captura por `$polozi-registrar-conexao`. Na
criação: validade **"Never"** (nunca expira), senão a automação para sozinha no
dia do vencimento; escopo mínimo (é um token pessoal da Supabase, então crie com
a conta que só tem os projetos da empresa); risco: quem pegar o token usa até
ser revogado, e se vazar o dono revoga e cria outro. (A Vercel não entra aqui: o
kit usa o login da CLI, não pede token dela. Se um dia pedir, vale a mesma
regra: "No Expiration", escopo só no time da empresa.)

## Ordem importa

Migrations e liberação dos schemas na Data API (5) ANTES do seed (6); seed ANTES do primeiro login (8) — se o dono
abrir a URL antes do convite, ele cai na tela de login sem conta, e está tudo
bem: é só seguir os passos.

## Depois da instalação

Evolução do sistema = ciclo normal da Casa: pedido vira task → branch → preview
→ QA → produção (regras técnicas no `AGENTS.md` desta pasta). Módulo novo
(CRM, eventos, financeiro) é trabalho do time Tecnologia (`tecnologia-construir-tela`
e `tecnologia-mudar-banco`), encaixando no menu.
