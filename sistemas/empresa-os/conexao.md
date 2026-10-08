# conexao.md — variáveis que este sistema usa

> Catálogo SEM valores (padrão da Casa: valores moram em `credenciais/.env`,
> produção mora no painel da Vercel — segredo nunca no repo nem no chat).

| Variável | O que é | Onde vive | Ambientes |
|---|---|---|---|
| `NEXT_PUBLIC_SUPABASE_URL` ou `SUPABASE_URL` | URL do projeto Supabase da empresa. Os dois nomes valem; com os dois preenchidos, vale o primeiro | credenciais/.env + integração Supabase → Vercel | todos |
| `NEXT_PUBLIC_SUPABASE_ANON_KEY` ou `SUPABASE_PUBLISHABLE_KEY` | chave PÚBLICA (anon / publishable), segura no browser porque TODA tabela tem RLS. A integração grava o segundo nome, sem `NEXT_PUBLIC_`; o `next.config.ts` copia o valor pro primeiro nome na hora do build, e é assim que ele chega ao navegador | credenciais/.env + integração Supabase → Vercel | todos |
| `SUPABASE_SERVICE_ROLE_KEY` ou `SUPABASE_SECRET_KEY` | chave de MÁQUINA (ignora RLS). A integração grava o segundo nome; com os dois preenchidos, vale o primeiro. Server-only: convite de usuário, scripts/setup-inicial.mjs, `/marca` (URL assinada da imagem) e `/usuarios` (`listUsers`), sempre no servidor, depois de checar a permissão da rota. NUNCA em `NEXT_PUBLIC_*` | credenciais/.env + integração Supabase → Vercel | todos (server) |
| `SITE_URL` | URL pública do sistema (redirectTo dos e-mails) | credenciais/.env (uso no setup) | setup |
| `CURSO_INICIO` | data do Dia 1 do curso (AAAA-MM-DD, opcional; padrão = hoje). Ancora o cronograma instanciado por `scripts/setup-inicial.mjs` | credenciais/.env (uso no setup) | setup |
| `PREVIEW_TEST_TOKEN` | token de QA: `?preview_token=` abre sessão de teste no PREVIEW | CLI (`vercel env add`, só preview) | SÓ preview |
| `PREVIEW_QA_EMAIL` / `PREVIEW_QA_PASSWORD` | credencial do usuário de QA (crie um membro visualizador dedicado) | CLI (`vercel env add`, só preview) | SÓ preview |

Regras: produção IGNORA o trio de preview por construção (`VERCEL_ENV`);
rotacione `PREVIEW_TEST_TOKEN` quando quiser (é só trocar no painel);
variável nova de módulo futuro = linha nova AQUI no mesmo commit; segredo de
integração (chave de serviço de terceiro) vai pro Vault do banco por
`vault.create_secret`, nunca pro `.env` nem pro chat.

Quem sabe os nomes aceitos das variáveis do Supabase: `config/supabase-env.mjs` (URL e chave pública) e
`config/supabase-env-servidor.mjs` (chave de serviço, só servidor). Código novo chama `src/lib/supabase/env.ts`
ou `createServiceClient()`, nunca `process.env.SUPABASE_...` direto; faltou variável, o erro lista os nomes
aceitos. O teste `config/supabase-env.test.ts` reprova leitura direta e `NEXT_PUBLIC_` com nome de segredo.

## Segredos da automação (GitHub)

| Secret | O que é | Onde vive | Quem usa |
|---|---|---|---|
| `SUPABASE_ACCESS_TOKEN` | token pessoal de acesso à CLI/API da Supabase. Ao criar: validade "Never" (nunca expira; senão a automação para sozinha), escopo mínimo; quem pegar usa até ser revogado, vazou = revoga e cria outro | Secrets do repositório no GitHub, gravados por `gh secret set` a partir de arquivo | `deploy-db.yml` e `keep-alive.yml` |
| `SUPABASE_DB_PASSWORD` | senha do Postgres do projeto (usada pelo `supabase link`/`db push`) | Secrets do repositório no GitHub, gravados por `gh secret set` a partir de arquivo | `deploy-db.yml` e `keep-alive.yml` |
| `SUPABASE_PROJECT_ID` | ref do projeto Supabase (`--project-ref`) | Secrets do repositório no GitHub, gravados por `gh secret set` a partir de arquivo | `deploy-db.yml` e `keep-alive.yml` |
