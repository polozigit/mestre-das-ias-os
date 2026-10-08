#!/usr/bin/env bash
# testar-migrations-local.sh — prova as migrations num Postgres local que simula
# o ambiente Supabase (roles anon/authenticated/service_role com BYPASSRLS no
# service_role, schema auth com auth.uid(), e os DEFAULT PRIVILEGES da
# plataforma que concedem ALL em tabela nova — exatamente o cenario que a 0001
# precisa fechar). Aplica TODAS as migrations na ordem (rodada 1), o
# seed_exemplo.sql, e DE NOVO as migrations (rodada 2, agora COM dado:
# idempotencia de verdade). Depois roda os testes pgTAP de supabase/tests/
# (permissao e negacao COMO USUARIO, invariantes, guardas de arquitetura) pelo
# fallback TAP do harness: psql arquivo por arquivo, reprova em `not ok`/erro
# (pendencia M9 da spec v2: `supabase test db --local` com Docker remoto).
# KEEP=1 deixa o container vivo no fim (ou na falha) pra iterar nos testes.
# PUBLISH_PORT=55432 publica o Postgres em 127.0.0.1:55432 do host do Docker (usado
# pra gerar src/types/supabase.gen.ts com `supabase gen types --db-url`).
# Precisa de pgTAP na imagem: so a supabase/postgres tem (postgres:16-alpine
# pula essa etapa e avisa).
#
# DUAS FORMAS DE USO:
#   bash scripts/testar-migrations-local.sh
#     Postgres puro (postgres:16-alpine por padrao). Prova os gates 1-3 e o
#     gate 4 SO na estrutura (privilegio de public.segredo) — sem
#     supabase_vault disponivel, o caminho "vault indisponivel" e o que roda.
#   DOCKER_CONTEXT=polozi-vps IMG=supabase/postgres:17.6.1.106 bash scripts/testar-migrations-local.sh
#     Imagem oficial do Supabase — a UNICA com `supabase_vault` em
#     `pg_available_extensions` (medido em 18/09/2026): e nela que o ciclo
#     vault.create_secret -> public.segredo() e provado de verdade. A
#     TENTATIVA de REVOKE da view (bloco GATE 4d da 0001) tambem roda aqui,
#     mas SOB `postgres` promovido a superuser (ver comentario mais abaixo)
#     - isso prova que o REVOKE funciona quando o papel tem privilegio, NAO
#     que o Supabase hospedado vai trancar a view (la nao tem superuser;
#     medido em producao real 18/09/2026: postgres nao e membro de
#     supabase_admin, dono do schema vault, e o REVOKE e no-op silencioso).
#     O caminho que o aluno de verdade percorre e o RAISE WARNING do item
#     6f do smoke da 0001, nao uma tranca ativa. Docker local do Mac fica
#     desligado por padrao da Casa — use DOCKER_CONTEXT=polozi-vps pra rodar
#     no shadow da VPS.
#
# Uso: bash scripts/testar-migrations-local.sh  (precisa de Docker; DOCKER_CONTEXT
# nao precisa de codigo aqui — o CLI do docker ja honra a variavel de ambiente)
set -euo pipefail

DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
NOME="${NOME:-empresa-os-pg-teste}"   # NOME=... evita colidir com outro container de teste no mesmo Docker
IMG="${IMG:-postgres:16-alpine}"

echo "== imagem: $IMG | docker context: $(docker context show 2>/dev/null || echo default) =="

docker rm -f "$NOME" >/dev/null 2>&1 || true
docker run --rm -d --name "$NOME" -e POSTGRES_PASSWORD=pg ${PUBLISH_PORT:+-p 127.0.0.1:$PUBLISH_PORT:5432} "$IMG" >/dev/null

# espera o postgres aceitar conexao DE VERDADE (pg_isready passa cedo demais:
# o initdb do container sobe um servidor temporario e reinicia — a conexao real
# e a unica prova).
for i in $(seq 1 120); do
  docker exec "$NOME" psql -U postgres -qAt -c 'select 1' >/dev/null 2>&1 && break
  sleep 1
done

# A imagem supabase/postgres tem um SEGUNDO restart, depois da primeira
# conexao ja estar de pe: docker-entrypoint-initdb.d/migrate.sh (reseta
# pg_stat_statements/pg_cron) derruba e sobe o servidor de novo - medido em
# 18/09/2026, e o timing desse restart varia (pode chegar so alguns segundos
# DEPOIS do 1o "select 1" ter funcionado). Por isso a espera nao confia num
# unico sucesso: espera o log dessa migration interna aparecer (marcador
# fixo do entrypoint) e SO DEPOIS reconecta - sem essa espera, o script corre
# risco de aplicar migration bem no meio do restart interno e cair com
# "the database system is shutting down".
if echo "$IMG" | grep -q supabase; then
  for i in $(seq 1 60); do
    docker logs "$NOME" 2>&1 | grep -q "ignoring /docker-entrypoint-initdb.d/migrations" && break
    sleep 1
  done
  for i in $(seq 1 60); do
    docker exec "$NOME" psql -U postgres -qAt -c 'select 1' >/dev/null 2>&1 && break
    sleep 1
  done
fi

pronto=0
for i in $(seq 1 30); do
  if docker exec "$NOME" psql -U postgres -qAt -c 'select 1' >/dev/null 2>&1; then
    sleep 1
    if docker exec "$NOME" psql -U postgres -qAt -c 'select 1' >/dev/null 2>&1; then
      pronto=1
      break
    fi
  fi
  sleep 1
done
if [ "$pronto" != "1" ]; then
  echo "ERRO: postgres nao ficou pronto (timeout)"
  docker logs "$NOME" 2>&1 | tail -40
  docker rm -f "$NOME" >/dev/null 2>&1 || true
  exit 1
fi

psql_c() { docker exec -i "$NOME" psql -U postgres -v ON_ERROR_STOP=1 -q "$@"; }

# A imagem supabase/postgres roda `postgres` SEM superuser (rolsuper=false;
# medido em 18/09/2026) — GATE1-3 desta migration criam EVENT TRIGGER, que
# EXIGE superuser (senao a 0001 nem aplica: "permission denied to create
# event trigger"). Esta promocao existe SO PRA ISSO - pra provar GATE1-3 e o
# ciclo create_secret/segredo() de ponta a ponta neste harness local.
#
# ATENCAO: o REVOKE do bloco GATE 4d (tranca da view do Vault) TAMBEM roda
# sob esse superuser, e o resultado NAO representa o Supabase hospedado.
# Medido em producao real (18/09/2026, projeto Supabase hospedado real, sem
# nenhuma promocao): `postgres` NAO e membro de `supabase_admin` (dono do
# schema vault) e o REVOKE e um no-op silencioso - `service_role` continua
# com SELECT em `vault.decrypted_secrets` depois da migration. Isso e o
# ESPERADO no caminho do aluno, nao uma falha: a defesa real e
# `public.segredo()` + MCP read_only sem o schema vault + hook PreToolUse
# (peca a) - nunca a tranca da view. `postgres:16-alpine` ja nasce com
# `postgres` superuser: o bloco abaixo e um no-op ali (a checagem via
# supabase_admin falha e o script segue).
if docker exec -e PGPASSWORD=pg "$NOME" psql -U postgres -d postgres -qAt \
     -c "SELECT 1 FROM pg_roles WHERE rolname = 'supabase_admin'" 2>/dev/null | grep -q '^1$'; then
  echo "== imagem Supabase detectada: promovendo postgres a superuser via supabase_admin =="
  docker exec -e PGPASSWORD=pg "$NOME" psql -U supabase_admin -d postgres -v ON_ERROR_STOP=1 \
    -c "ALTER ROLE postgres SUPERUSER;"
fi

echo "== bootstrap: simulando ambiente Supabase virgem =="
psql_c <<'SQL'
DO $$ BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_roles WHERE rolname = 'anon') THEN
    CREATE ROLE anon NOLOGIN;
  END IF;
END $$;
DO $$ BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_roles WHERE rolname = 'authenticated') THEN
    CREATE ROLE authenticated NOLOGIN;
  END IF;
END $$;
DO $$ BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_roles WHERE rolname = 'service_role') THEN
    CREATE ROLE service_role NOLOGIN BYPASSRLS;
  END IF;
END $$;
GRANT USAGE ON SCHEMA public TO anon, authenticated, service_role;
CREATE SCHEMA IF NOT EXISTS auth;
CREATE TABLE IF NOT EXISTS auth.users (id uuid PRIMARY KEY, email text);
-- na imagem Supabase `auth.uid()` ja existe e pode ser de outro dono
-- (supabase_auth_admin) — OR REPLACE erraria por ownership; sub-bloco tolera.
DO $$ BEGIN
  CREATE OR REPLACE FUNCTION auth.uid() RETURNS uuid LANGUAGE sql STABLE
    AS $inner$ SELECT nullif(current_setting('request.jwt.claim.sub', true), '')::uuid $inner$;
EXCEPTION WHEN insufficient_privilege OR OTHERS THEN
  RAISE NOTICE 'auth.uid() ja existe com outro dono nesta imagem (bootstrap segue): %', SQLERRM;
END $$;
-- Default privileges da plataforma: tabela/funcao nova nasce ABERTA — e o que
-- as migrations do template precisam sobreviver/fechar. Idempotente por
-- natureza (ALTER DEFAULT PRIVILEGES so ADICIONA a regra, nao duplica erro).
ALTER DEFAULT PRIVILEGES FOR ROLE postgres IN SCHEMA public
  GRANT ALL ON TABLES TO anon, authenticated, service_role;
ALTER DEFAULT PRIVILEGES FOR ROLE postgres IN SCHEMA public
  GRANT ALL ON SEQUENCES TO anon, authenticated, service_role;
ALTER DEFAULT PRIVILEGES FOR ROLE postgres IN SCHEMA public
  GRANT EXECUTE ON FUNCTIONS TO anon, authenticated, service_role;
SQL

aplicar() {
  local rodada="$1"
  for f in "$DIR"/supabase/migrations/*.sql; do
    echo "-- [$rodada] $(basename "$f")"
    psql_c < "$f"
  done
}

echo "== rodada 1: apply de todas as migrations =="
aplicar 1
echo "== seed de exemplo (so DML, idempotente) =="
psql_c < "$DIR/supabase/seed_exemplo.sql"
echo "== rodada 2: re-apply completo COM dado (idempotencia) =="
aplicar 2
echo "== seed de exemplo de novo (idempotente) =="
psql_c < "$DIR/supabase/seed_exemplo.sql"

echo "== pgTAP: supabase/tests/*.sql (fallback TAP do harness) =="
TEM_PGTAP="$(docker exec "$NOME" psql -U postgres -qAt -c "SELECT count(*) FROM pg_available_extensions WHERE name='pgtap'")"
if [ "$TEM_PGTAP" = "1" ]; then
  for t in "$DIR"/supabase/tests/*.sql; do
    echo "-- pgTAP $(basename "$t")"
    SAIDA="$(docker exec -i "$NOME" psql -U postgres -v ON_ERROR_STOP=1 -qAt < "$t" 2>&1)" || {
      echo "$SAIDA"; echo "ERRO: $(basename "$t") quebrou"; [ "${KEEP:-0}" = "1" ] || docker rm -f "$NOME" >/dev/null 2>&1 || true; exit 1; }
    echo "$SAIDA" | grep -E '^(ok|not ok|1\.\.|#)' || true
    if echo "$SAIDA" | grep -qE '^not ok|Looks like you failed|Looks like you planned'; then
      echo "ERRO: $(basename "$t") reprovou (linhas 'not ok' acima)"; [ "${KEEP:-0}" = "1" ] || docker rm -f "$NOME" >/dev/null 2>&1 || true; exit 1
    fi
    if ! echo "$SAIDA" | grep -qE '^ok '; then
      echo "ERRO: $(basename "$t") nao produziu nenhum 'ok' (teste vazio nao conta)"; [ "${KEEP:-0}" = "1" ] || docker rm -f "$NOME" >/dev/null 2>&1 || true; exit 1
    fi
  done
else
  echo "== pgTAP indisponivel nesta imagem (rode com IMG=supabase/postgres:17.6.1.106): testes PULADOS =="
fi

echo "== extra: tabela de 'modulo futuro' nasce fechada e com RLS (gate1 + default privs) =="
psql_c <<'SQL'
CREATE TABLE public.modulo_futuro_probe (id int);
DO $$
BEGIN
  IF NOT (SELECT relrowsecurity FROM pg_class WHERE oid = 'public.modulo_futuro_probe'::regclass) THEN
    RAISE EXCEPTION 'probe: tabela futura nasceu SEM RLS';
  END IF;
  IF has_table_privilege('anon', 'public.modulo_futuro_probe', 'SELECT')
     OR has_table_privilege('authenticated', 'public.modulo_futuro_probe', 'INSERT') THEN
    RAISE EXCEPTION 'probe: tabela futura nasceu com grant de anon/authenticated';
  END IF;
END $$;
DROP TABLE public.modulo_futuro_probe;
SQL

echo "== extra: gate 4 (public.segredo - porta unica do Vault) =="
TEM_VAULT="$(docker exec "$NOME" psql -U postgres -qAt -c "SELECT count(*) FROM pg_available_extensions WHERE name='supabase_vault'")"
if [ "$TEM_VAULT" = "1" ]; then
  # O que o gate4 GARANTE de verdade (DURO, falha o probe se quebrar):
  # public.segredo() existe, e SECURITY DEFINER, EXECUTE so de service_role.
  # A tranca da view (has_table_privilege) e so MEDIDA e reportada - neste
  # harness ela tende a aparecer fechada porque postgres foi promovido a
  # superuser acima; isso NAO representa o Supabase hospedado (ver
  # cabecalho do arquivo e supabase/README.md).
  psql_c <<'SQL'
DO $$
BEGIN
  IF NOT has_function_privilege('service_role', 'public.segredo(text)'::regprocedure, 'EXECUTE') THEN
    RAISE EXCEPTION 'gate4 probe: service_role nao executa public.segredo';
  END IF;
  IF has_function_privilege('anon', 'public.segredo(text)'::regprocedure, 'EXECUTE') THEN
    RAISE EXCEPTION 'gate4 probe: anon executa public.segredo';
  END IF;
  IF has_table_privilege('service_role', 'vault.decrypted_secrets', 'SELECT') THEN
    RAISE WARNING 'gate4 probe: service_role ainda le vault.decrypted_secrets direto - ESPERADO neste harness com postgres superuser nao refletir sozinho o Supabase hospedado (la o REVOKE e sempre no-op); a defesa e public.segredo() + MCP read_only + hook PreToolUse, nao a tranca.';
  ELSE
    RAISE NOTICE 'gate4 probe: REVOKE da view teve efeito (superuser promovido neste harness)';
  END IF;
END $$;
SQL
  echo "== gate4: vault real (imagem $IMG) - public.segredo() provado (EXECUTE so service_role); tranca da view e so MEDIDA, nao garantida =="
else
  echo "== gate4: vault indisponivel nesta imagem (rode com IMG=supabase/postgres:17.6.1.106) =="
fi

[ "${KEEP:-0}" = "1" ] || docker rm -f "$NOME" >/dev/null
echo "== OK ($IMG): 2 rodadas completas (com seed) + pgTAP + probe de tabela futura + gate4 =="
