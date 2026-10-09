# Regras do sistema da empresa (fatos do repositório modelo)

Só fato lido no arquivo. Cada item traz `arquivo:linha`. Não confie em número de linha de memória: se o arquivo mudou, leia de novo.

## Convenção dos caminhos

- Sem prefixo especial = relativo a `sistemas/empresa-os/` (a pasta do sistema no repositório do aluno; no Polozi-Stack ela é `10-mestre-das-ias/chatgpt-work-codex/empresa-os-template/`). Exemplo: `AGENTS.md:14` é `sistemas/empresa-os/AGENTS.md`, linha 14.
- `Casa:` = relativo à raiz da Casa do aluno (modelo em `plugins/polozi-fundacao/skills/polozi-criar-empresa-ia/assets/modelo-empresa-ia-v3/`). Exemplo: `Casa:.codex/hooks/guarda.py:185`.
- `.github/workflows/...` e `.github/dependabot.yml`: nascem em `sistemas/empresa-os/.github/` e a instalação os copia para `.github/` na raiz da Casa (`.github/workflows/ci.yml:2-4`). Os números de linha citados são os do template.
- `Fontes:` = o arquivo de fontes oficiais do Polozi-Stack, citado na seção 11.
- O LEIA-ME do template diz "0001 → 0020" (`LEIA-ME.md:36`), mas existe a `0021_whatsapp_grupo.sql` e `supabase/README.md:33,35` já a lista. Para contar migrations, use o mapa gerado, não o LEIA-ME.

## 1. Segurança em 3 camadas

- RLS no banco, guards no servidor, e a tela escondendo link. A tela é cosmética, nunca a defesa. `AGENTS.md:14-15`.
- Permissão por slug `<modulo>.<acao>`, o dono tem todas; `tem_permissao(slug)` decide no banco e `sessao_atual()` entrega a sessão. `AGENTS.md:10-13`.

## 2. Gates do banco (`supabase/migrations/0001_gates_seguranca.sql`)

- Gate 1: tabela nova do schema `public` nasce com RLS ligado. `0001_gates_seguranca.sql:17-20`.
- Gate 2: função nova do `public` perde EXECUTE de PUBLIC e de anon no ato do CREATE. `0001_gates_seguranca.sql:22-28`.
- Gate 3: função nova do `public` sem search_path declarado ganha um fixo (`public, pg_temp`). `0001_gates_seguranca.sql:30-33` e `:219`.
- Gate 4: segredo de integração só sai do Vault por `public.segredo(text)`, com EXECUTE só para `service_role`. `0001_gates_seguranca.sql:35-44` e `:317-318`. Resumo na tabela de migrations: `supabase/README.md:13`.
- Os gates 1 a 3 são event triggers e têm kill-switch; o gate 4 não tem. `supabase/README.md:102-116`.
- Limite medido: no Supabase hospedado o REVOKE da view do Vault roda sem efeito; a porta auditável é `public.segredo()`. `supabase/README.md:89-100`.
- Proibido ler `vault.decrypted_secrets` em migration, em código do app ou no chat. `supabase/README.md:84-86`.

## 3. Tabela nova nasce sem GRANT

- Os default privileges de tabela do `public` são fechados para anon e authenticated. `0001_gates_seguranca.sql:259-268`.
- Consequência: a migration do módulo precisa trazer GRANT explícito, a policy e um smoke que prova o GRANT; sem isso a tela renderiza VAZIA, sem erro. `supabase/README.md:57-59`; molde em `AGENTS.md:26-28`.
- O pgTAP de permissão e negação COMO usuário é o que pega "tela vazia sem erro". `supabase/README.md:41` (`002_rls_como_usuario`) e `:51` (todo módulo novo traz o seu).
- Função nova: nasce sem EXECUTE de anon; conceda a `authenticated` só quando o front chamar por RPC. `supabase/README.md:60-61`.

## 4. anon, policy e escrita

- `anon` é a chave PÚBLICA do projeto; ela só é segura porque toda tabela tem RLS. `conexao.md:9`. Os testes provam que anon não lê nada e não executa nada. `supabase/tests/004_anon.sql:1-2`.
- Nenhuma função de helper tem EXECUTE para anon. `supabase/migrations/0004_rbac_helpers.sql:9` e `:132-136`.
- Policy nunca faz subconsulta direta em `usuarios` (recursão de RLS); usa os helpers da 0004: `usuario_atual()`, `e_dono()`, `tem_permissao()`. `supabase/README.md:62-63`; explicação em `supabase/migrations/0004_rbac_helpers.sql:2-7`.
- Escrita pelo caminho do servidor: INSERT de usuário só server-side (`supabase/README.md:15`), e as RPCs de seed, sync, conexões, whatsapp e organograma são só `service_role` (`supabase/README.md:20,29,30,31`). A chave de serviço ignora RLS e é server-only. `conexao.md:10`.

## 5. Migration: idempotente, rollback, tipos

- Todo arquivo é idempotente (rodar 2 vezes não quebra nem duplica) e o rollback fica comentado no rodapé do próprio arquivo. `supabase/README.md:127-130`.
- Cada migration termina num smoke `DO $$`; exceção ali = migration FALHOU. `supabase/README.md:3-7`.
- Schema mudou: regerar `src/types/supabase.gen.ts` no MESMO commit; `src/types/database.ts` só re-exporta. `AGENTS.md:36-38`. O CI confere que o arquivo está em dia. `.github/workflows/ci.yml:104-106`.
- Migration só entra com veredito `APPROVED` (mesmo sha256 do arquivo) em `operacao/vereditos/<nome>.json`. `supabase/README.md:118-125`; o pre-commit bloqueia sem ele ou com sha diferente. `Casa:.githooks/pre-commit:14-43`.
- Crescer o banco = um módulo por PR, só acrescentando; nada de renomear ou apagar coluna de contrato. `supabase/README.md:45-52`.

## 6. Schemas expostos

- `schemas = ["public", "graphql_public", "tarefas", "organograma"]` no `supabase/config.toml:13` (config do Supabase local).
- Schema de módulo novo precisa ser exposto no painel do projeto (Project Settings > Data API > Exposed schemas), senão a consulta falha com `PGRST106`. `AGENTS.md:39-41`; passo a passo em `LEIA-ME.md:41-45`.

## 7. CI e automação (GitHub Actions)

- `ci.yml`: lint (`:48`), tsc (`:49`), testes (`:50`), Postgres local com as migrations em duas rodadas (`:70`, `:81`), pgTAP (`:95`), guardas estáticas (`:98`), tipos em dia (`:104-106`).
- `deploy-db.yml`: aplica migration em produção ao entrar na `main` (`:6-10`, `supabase db push` em `:46`). "Quem aplica migration em produção é este arquivo, nunca a IA e nunca você na mão." `deploy-db.yml:1-3`.
- `deploy-db-homologacao.yml`: ensaio por PR que toca migration ou seed, `db push --include-seed` na homologação (`:12-16`, `:61`). O seed nunca vai para produção. `supabase/README.md:39`.
- `gitleaks.yml`: varredura por PR e diária (`:10-13`), sem gatilho de push (`:4-7`).
- `keep-alive.yml`: toca o banco 1 vez por dia para o projeto Free não pausar (`:1-4`, `:21`); há um job também para a homologação (`:53`). Se isso evita mesmo a pausa não está provado (`keep-alive.yml:12-16`).
- `dependabot.yml`: npm semanal e actions mensal (`:6-11`, `:19-21`).

## 8. Variáveis e segredos (só nomes)

- Variáveis do sistema (catálogo sem valores): `NEXT_PUBLIC_SUPABASE_URL`, `NEXT_PUBLIC_SUPABASE_ANON_KEY`, `SUPABASE_SERVICE_ROLE_KEY`, `SITE_URL`, `CURSO_INICIO`, `PREVIEW_TEST_TOKEN`, `PREVIEW_OWNER_EMAIL` (e-mail do dono, só preview). `conexao.md:8-14`. Variável nova de módulo = linha nova no `conexao.md` no mesmo commit. `conexao.md:18`.
- Segredos de Action no GitHub: `SUPABASE_ACCESS_TOKEN`, `SUPABASE_DB_PASSWORD`, `SUPABASE_PROJECT_ID`. `conexao.md:26-28`.
- Homologação usa o par `SUPABASE_DB_PASSWORD_HOMOLOG` e `SUPABASE_PROJECT_ID_HOMOLOG` (não estão no `conexao.md`, só nos workflows). `.github/workflows/deploy-db-homologacao.yml:8,41-42` e `.github/workflows/keep-alive.yml:60-61`.
- Valores moram em `credenciais/.env` da Casa; produção mora no painel da Vercel; nunca no repo nem no chat. `AGENTS.md:34-35`.

## 9. Next.js 16, testes e preview

- `params` e `searchParams` são Promise e `cookies()` é async: use `await`. `AGENTS.md:44-45`.
- Testes: `npm test` roda `node --test` (`package.json:11`); lint `npm run lint` (`package.json:10`); tipos `npx tsc --noEmit`; os três verdes antes de todo push. `AGENTS.md:21-22`.
- Preview da Vercel: `?preview_token=`, válido só no ambiente de preview (`VERCEL_ENV`), nunca em produção; a IA entra como o dono (link de entrada gerado no servidor para `PREVIEW_OWNER_EMAIL`), sem usuário extra e sem senha. O preview usa o banco de produção: a conferência pela IA (opcional, só da tela alterada) só navega e olha. Quem libera mudança de tela é o "aprovado" do dono depois de abrir o link. `AGENTS.md:29-31`; `src/lib/supabase/proxy.ts`; `conexao.md:13,16`. A senha do dono nunca é digitada pela IA. `AGENTS.md:31`.
- Deploy: branch gera preview, merge gera produção. `AGENTS.md:49-50`.

## 10. Hook da Casa (`Casa:.codex/hooks/guarda.py`)

- r02: bloqueia push para `main` ou `master` SÓ quando o sistema já está publicado em produção (existe `sistemas/empresa-os/.vercel/project.json`); sem esse marcador a `main` aceita push e a Casa salva direto nela. Confira os números de linha no `guarda.py` atual (`r02_push_main`, `_producao_publicada`); os números antigos (`:68-71`, `:185-198`) não valem mais.
- r03: bloqueia `supabase db push` (e `db reset` ou `migration up` com `--linked`). `guarda.py:72-75`, `:201-211`.
- r04: bloqueia `vercel` com `--prod`, `promote` ou `rollback`. `guarda.py:76-79`, `:214-224`.
- r06: bloqueia `DROP TABLE`, `DROP SCHEMA`, `DROP DATABASE` e `TRUNCATE` sem veredito aprovado da migration; ignora texto com `_smoke` ou `_probe`. Não cobre `DELETE` nem `UPDATE`. `guarda.py:84-88`, `:241-253`.
- r07: bloqueia ler arquivo dentro de `credenciais/` (exceto `.md`). `guarda.py:89-92`, `:256-274`.
- r09: bloqueia consulta que cite `decrypted_secrets` ou `vault.secrets`. `guarda.py:97-100`, `:283-287`.
- r10: bloqueia `apply_migration` sem veredito e DDL (`CREATE`, `ALTER`, `DROP`, `TRUNCATE`, `GRANT`, `REVOKE`) em `execute_sql` por MCP. `guarda.py:101-104`, `:290-307`.
- r11: bloqueia editar `sistemas/` na branch principal com produção já publicada. `guarda.py:105-108`, `:310-320`.

## 11. Limites dos planos grátis

Fonte: `Fontes:` = `10-mestre-das-ias/visao-niveis/onda-tecnologia/time2-01-fontes-oficiais.md` (no Polozi-Stack, coletado em 2026-10-07). Marca [S] = só em resultado de busca, reconfirmar antes de afirmar ao dono.

- GitHub, repositório privado no Free: sem ruleset nem branch protection que obrigue check. Marcado [S] na fonte; confirmar no repo real com `gh api`. `Fontes:9,111`; https://docs.github.com/en/repositories/configuring-branches-and-merges-in-your-repository/managing-rulesets/about-rulesets
- Supabase Free: sem backup diário (a doc recomenda `db dump` e cópia fora do Supabase) e sem branching (Pro ou acima). `Fontes:23-24,112`; https://supabase.com/docs/guides/platform/backups e https://supabase.com/pricing
- Vercel Hobby: o rollback só volta para o deploy de produção imediatamente anterior, e depois dele o auto-deploy de produção fica desligado até um `vercel promote`. `Fontes:34-36,113`; https://vercel.com/docs/instant-rollback
