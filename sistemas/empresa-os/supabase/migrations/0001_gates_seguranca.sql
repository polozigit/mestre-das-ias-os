-- 0001_gates_seguranca.sql
-- Os 3 gates deterministicos de banco do Empresa OS. Rodam ANTES de qualquer
-- tabela existir porque o erro que eles previnem nasce junto com o objeto:
-- tabela sem RLS = dado da empresa inteira legivel pela API publica; funcao nova
-- nasce executavel por qualquer visitante e com search_path mutavel.
-- Dependencias: nenhuma (primeira migration; projeto Supabase virgem).
-- Rollback ao fim do arquivo.
--
-- ============================================================
-- POR QUE GATES (event triggers) E NAO CONVENCAO EM DOC
-- ============================================================
-- Este template e aplicado pela IA do aluno, que erra e esquece. Convencao em
-- markdown drifta; event trigger e deterministico: o proprio banco corrige o
-- objeto no ato do CREATE. Os gates AGEM (corrigem), nunca julgam nem derrubam
-- DDL legitimo - falha interna vira RAISE WARNING e o comando segue.
--
-- GATE 1 (trg_gate1_rls_auto): toda tabela nova de `public` nasce com
--   ROW LEVEL SECURITY habilitado. Sem policy nenhuma, RLS ligado = tudo
--   negado por default para anon/authenticated - seguro por omissao. As
--   policies chegam nas migrations seguintes.
--
-- GATE 2 (trg_gate2_revoke_execute): funcao/procedure nova de `public` perde
--   EXECUTE de PUBLIC e de anon no ato do CREATE. Necessario porque o Postgres
--   tem um `=X` (PUBLIC=EXECUTE) HARDWIRED no acldefault() de funcoes, e
--   `ALTER DEFAULT PRIVILEGES ... REVOKE ... FROM PUBLIC` NAO remove esse
--   hardwired: o default ACL so ADICIONA grants por cima do acldefault(),
--   nunca subtrai. Ou seja: nao existe configuracao declarativa que impeca
--   funcao nova de nascer executavel por anon - so enforcement pos-CREATE.
--
-- GATE 3 (trg_gate3_search_path): funcao/procedure nova de `public` que nao
--   declarou o proprio search_path ganha `SET search_path = public` + WARNING
--   ensinando o autor. Fecha o lint `function_search_path_mutable` na raiz e
--   evita shadowing de objeto pelo path do chamador.
--
-- GATE 4 (public.segredo - porta unica e auditavel do Vault): segredo de
--   integracao (chave de API, token) vive no Vault (`vault.create_secret`),
--   nunca em `.env` nem colado em SQL - `.env` do sistema e lido por
--   qualquer processo local, e SQL colado num chat ou commitado no repo
--   vaza pra sempre. A view `vault.decrypted_secrets` decifra o segredo pra
--   QUALQUER papel que alcance ela ('anyone that has access to the view has
--   access to decrypted secrets', doc oficial) - o caminho CERTO de leitura
--   e sempre `public.segredo(text)`, SECURITY DEFINER, executavel so por
--   `service_role` (funcao/trigger/edge/servidor do Empresa OS). O agente
--   le e escreve o NOME do segredo, nunca o valor.
--   VERDADE MEDIDA em producao (18/09/2026): esta migration TENTA revogar o
--   acesso direto a view/tabela do Vault (bloco GATE 4d), mas no Supabase
--   HOSPEDADO o schema `vault` e de `supabase_admin`, e o papel `postgres`
--   usado pra aplicar migrations NAO e membro dele - o REVOKE roda sem
--   erro e SEM efeito (no-op silencioso), e `service_role` continua
--   enxergando a view por construcao da plataforma. Ou seja: a tranca do
--   Vault NAO tranca no plano hospedado - quem segura a IA longe do Vault
--   sao as OUTRAS camadas: o MCP roda `read_only` sem o schema `vault`, e o
--   hook `PreToolUse` (peca a) nega qualquer comando que cite
--   `decrypted_secrets`. `public.segredo()` continua sendo a UNICA porta
--   auditavel (funciona porque a funcao e do dono `postgres`, nao do
--   schema `vault`) - e o que o smoke desta migration PROVA com excecao.
--   GATE 4 NAO e event trigger (nao tem kill-switch `ALTER EVENT TRIGGER`):
--   e estrutura + privilegio, criado uma vez e mantido pelos proprios
--   REVOKE/GRANT desta migration.
--
-- Carve-outs (os 3 gates de event trigger, GATE1-3): objeto de extensao (pg_depend.deptype = 'e') e
-- objeto cujo dono nao e `postgres` passam batido - nao se mexe no que e da
-- extensao nem no que outro dono criou.
--
-- Kill-switch individual (sem drop, reversivel):
--   ALTER EVENT TRIGGER trg_gate1_rls_auto        DISABLE;
--   ALTER EVENT TRIGGER trg_gate2_revoke_execute  DISABLE;
--   ALTER EVENT TRIGGER trg_gate3_search_path     DISABLE;

-- ============================================================
-- GATE 1: tabela nova de public nasce com RLS ligado
-- ============================================================
CREATE OR REPLACE FUNCTION public.fn_gate1_rls_auto()
RETURNS event_trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = pg_catalog, public
AS $$
DECLARE
  r record;
BEGIN
  FOR r IN
    SELECT c.objid
    FROM pg_event_trigger_ddl_commands() c
    WHERE c.schema_name = 'public'
      AND c.object_type = 'table'
  LOOP
    -- so age em tabela de postgres, fora de extensao, que AINDA esta sem RLS.
    -- O gate AGE (liga o RLS), nao julga: checar-e-reclamar daria falso
    -- positivo de timing quando a migration liga o RLS logo depois do CREATE.
    CONTINUE WHEN NOT EXISTS (
      SELECT 1 FROM pg_class t
      WHERE t.oid = r.objid
        AND t.relrowsecurity = false
        AND t.relowner = 'postgres'::regrole
        AND NOT EXISTS (
          SELECT 1 FROM pg_depend d WHERE d.objid = t.oid AND d.deptype = 'e'
        )
    );

    EXECUTE format('ALTER TABLE %s ENABLE ROW LEVEL SECURITY', r.objid::regclass);

    -- registro em public.atividade (tipo 'sistema', sem usuario nem agente).
    -- Sub-bloco proprio: enquanto atividade nao existir (ela nasce numa
    -- migration posterior a esta), o log e pulado em silencio e o gate segue.
    BEGIN
      -- Texto pra DONO não-programador (aparece no feed de atividade), não
      -- jargão de banco — o nome técnico da tabela vai no fim, entre parênteses.
      INSERT INTO public.atividade (tipo, descricao)
      VALUES ('sistema',
              format('Proteção de dados ligada automaticamente na área nova do banco (%s)',
                     r.objid::regclass));
    EXCEPTION WHEN OTHERS THEN
      NULL;
    END;
  END LOOP;
EXCEPTION WHEN OTHERS THEN
  -- gate NUNCA derruba um DDL legitimo; falha interna vira aviso
  RAISE WARNING 'fn_gate1_rls_auto falhou (DDL segue): %', SQLERRM;
END $$;

COMMENT ON FUNCTION public.fn_gate1_rls_auto() IS
  'GATE1 (0001): liga ROW LEVEL SECURITY em toda tabela nova de public. '
  'Tabela sem RLS = dado legivel pela API publica do Supabase. '
  'Kill-switch: ALTER EVENT TRIGGER trg_gate1_rls_auto DISABLE;';

DROP EVENT TRIGGER IF EXISTS trg_gate1_rls_auto;
-- 'SELECT INTO' tem command tag proprio e cria tabela igual ao CTAS - sem ele
-- na lista, `SELECT ... INTO public.x` nasceria sem RLS por fora do gate.
CREATE EVENT TRIGGER trg_gate1_rls_auto
  ON ddl_command_end
  WHEN TAG IN ('CREATE TABLE', 'CREATE TABLE AS', 'SELECT INTO')
  EXECUTE FUNCTION public.fn_gate1_rls_auto();

-- ============================================================
-- GATE 2: funcao nova de public perde EXECUTE de PUBLIC e anon
-- ============================================================
CREATE OR REPLACE FUNCTION public.fn_gate2_revoke_execute()
RETURNS event_trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = pg_catalog, public
AS $$
DECLARE
  r record;
BEGIN
  FOR r IN
    SELECT c.objid
    FROM pg_event_trigger_ddl_commands() c
    WHERE c.schema_name = 'public'
      AND c.object_type IN ('function', 'procedure')
  LOOP
    -- so mexe no que postgres criou; extensao e objeto de outro dono passam batido
    CONTINUE WHEN NOT EXISTS (
      SELECT 1 FROM pg_proc p
      WHERE p.oid = r.objid
        AND p.proowner = 'postgres'::regrole
        AND NOT EXISTS (
          SELECT 1 FROM pg_depend d WHERE d.objid = p.oid AND d.deptype = 'e'
        )
    );

    -- ON ROUTINE cobre funcao E procedure (ON FUNCTION erraria em procedure)
    EXECUTE format('REVOKE EXECUTE ON ROUTINE %s FROM PUBLIC', r.objid::regprocedure);
    EXECUTE format('REVOKE EXECUTE ON ROUTINE %s FROM anon',   r.objid::regprocedure);
  END LOOP;
EXCEPTION WHEN OTHERS THEN
  -- gate NUNCA derruba um DDL legitimo; falha interna vira aviso
  RAISE WARNING 'fn_gate2_revoke_execute falhou (DDL segue): %', SQLERRM;
END $$;

COMMENT ON FUNCTION public.fn_gate2_revoke_execute() IS
  'GATE2 (0001): fecha EXECUTE de PUBLIC/anon em funcao nova de public. '
  'Necessario porque ALTER DEFAULT PRIVILEGES nao remove o PUBLIC=X hardwired '
  'do acldefault() do Postgres. '
  'Kill-switch: ALTER EVENT TRIGGER trg_gate2_revoke_execute DISABLE;';

DROP EVENT TRIGGER IF EXISTS trg_gate2_revoke_execute;
CREATE EVENT TRIGGER trg_gate2_revoke_execute
  ON ddl_command_end
  WHEN TAG IN ('CREATE FUNCTION', 'CREATE PROCEDURE')
  EXECUTE FUNCTION public.fn_gate2_revoke_execute();

-- ============================================================
-- GATE 3: funcao nova sem search_path declarado ganha um fixo
-- ============================================================
CREATE OR REPLACE FUNCTION public.fn_gate3_search_path()
RETURNS event_trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = pg_catalog, public
AS $$
DECLARE
  r record;
BEGIN
  FOR r IN
    SELECT c.objid
    FROM pg_event_trigger_ddl_commands() c
    WHERE c.schema_name = 'public'
      AND c.object_type IN ('function', 'procedure')
  LOOP
    -- so mexe no que postgres criou e que ainda NAO declarou search_path
    -- (respeita a escolha do autor); extensao e outro dono passam batido
    CONTINUE WHEN NOT EXISTS (
      SELECT 1 FROM pg_proc p
      WHERE p.oid = r.objid
        AND p.proowner = 'postgres'::regrole
        AND NOT EXISTS (
          SELECT 1 FROM unnest(coalesce(p.proconfig, '{}')) x
          WHERE x LIKE 'search_path=%'
        )
        AND NOT EXISTS (
          SELECT 1 FROM pg_depend d WHERE d.objid = p.oid AND d.deptype = 'e'
        )
    );

    -- ALTER ROUTINE cobre funcao E procedure. pg_temp por ULTIMO: sem isso,
    -- tabela temporaria do chamador poderia sombrear objeto de public.
    EXECUTE format('ALTER ROUTINE %s SET search_path = public, pg_temp', r.objid::regprocedure);
    RAISE WARNING
      'gate3: % nasceu sem search_path; apliquei SET search_path = public, pg_temp. '
      'Se ela precisa de outro schema, declare no CREATE (ex.: SET search_path = public, outro_schema).',
      r.objid::regprocedure;
  END LOOP;
EXCEPTION WHEN OTHERS THEN
  -- gate NUNCA derruba um DDL legitimo; falha interna vira aviso
  RAISE WARNING 'fn_gate3_search_path falhou (DDL segue): %', SQLERRM;
END $$;

COMMENT ON FUNCTION public.fn_gate3_search_path() IS
  'GATE3 (0001): aplica SET search_path = public em funcao nova de public que '
  'nao declarou o proprio. Fecha o lint function_search_path_mutable na raiz. '
  'Kill-switch: ALTER EVENT TRIGGER trg_gate3_search_path DISABLE;';

DROP EVENT TRIGGER IF EXISTS trg_gate3_search_path;
CREATE EVENT TRIGGER trg_gate3_search_path
  ON ddl_command_end
  WHEN TAG IN ('CREATE FUNCTION', 'CREATE PROCEDURE')
  EXECUTE FUNCTION public.fn_gate3_search_path();

-- ============================================================
-- Seguranca das proprias funcoes de gate
-- ============================================================
-- Funcao que retorna event_trigger nao e invocavel direto - quem dispara e a
-- maquinaria de DDL, que nao checa privilegio. Ninguem precisa de EXECUTE.
-- (fn_gate1 e fn_gate2 nasceram ANTES dos triggers existirem, entao o gate2
-- nao as pegou; fecha as tres na mao, incluindo authenticated/service_role.)
REVOKE ALL ON FUNCTION public.fn_gate1_rls_auto()
  FROM PUBLIC, anon, authenticated, service_role;
REVOKE ALL ON FUNCTION public.fn_gate2_revoke_execute()
  FROM PUBLIC, anon, authenticated, service_role;
REVOKE ALL ON FUNCTION public.fn_gate3_search_path()
  FROM PUBLIC, anon, authenticated, service_role;

-- ============================================================
-- Default privileges de TABELA: fecha anon/authenticated na origem
-- ============================================================
-- Projeto Supabase virgem concede ALL (incl. TRUNCATE, que NAO passa por RLS)
-- a anon/authenticated/service_role em toda tabela nova de public, via
-- ALTER DEFAULT PRIVILEGES da plataforma. Diferente do PUBLIC=X de funcao
-- (hardwired, so o gate2 resolve), grant de default privileges de tabela e
-- ADICAO removivel - da pra fechar declarativamente aqui. Consequencia
-- deliberada: tabela nova nasce SEM grant pra anon/authenticated; todo modulo
-- novo precisa do seu GRANT explicito (senao a tela renderiza VAZIA sem erro
-- - e o smoke da migration do modulo deve provar o GRANT). service_role fica
-- intacto (scripts/convite dependem dele).
ALTER DEFAULT PRIVILEGES FOR ROLE postgres IN SCHEMA public
  REVOKE ALL ON TABLES FROM anon, authenticated;

-- ============================================================
-- GATE 4a: extensao do Vault (se disponivel neste Postgres)
-- ============================================================
DO $$
BEGIN
  IF EXISTS (SELECT 1 FROM pg_available_extensions WHERE name = 'supabase_vault') THEN
    EXECUTE 'CREATE EXTENSION IF NOT EXISTS supabase_vault';
  ELSE
    RAISE NOTICE 'supabase_vault indisponivel neste Postgres: gate4 instala so a funcao public.segredo e prova a estrutura';
  END IF;
EXCEPTION WHEN OTHERS THEN
  RAISE WARNING 'gate4: CREATE EXTENSION supabase_vault falhou (migration segue): %', SQLERRM;
END $$;

-- ============================================================
-- GATE 4b: public.segredo(text) - unica porta de leitura do Vault
-- ============================================================
-- Criada mesmo quando o schema `vault` nao existe: plpgsql nao resolve o
-- objeto no CREATE, so falha se chamada - e isso que permite provar o
-- privilegio (6a/6b/6c) num Postgres puro, sem Vault.
CREATE OR REPLACE FUNCTION public.segredo(p_nome text)
RETURNS text
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = pg_catalog, vault
AS $$
DECLARE
  v_valor text;
BEGIN
  SELECT decrypted_secret INTO v_valor
    FROM vault.decrypted_secrets
   WHERE name = p_nome
   LIMIT 1;
  IF v_valor IS NULL THEN
    RAISE EXCEPTION 'segredo % nao existe no Vault - cadastre com vault.create_secret(valor, nome, descricao)', p_nome;
  END IF;
  RETURN v_valor;
END $$;

COMMENT ON FUNCTION public.segredo(text) IS
  'unica porta de leitura do Vault; quem chama e codigo do Empresa OS com '
  'service_role, nunca a IA nem o front.';

-- ============================================================
-- GATE 4c: privilegio de public.segredo (explicito - gate4 nao pode
-- depender do gate2 pra existir)
-- ============================================================
REVOKE ALL ON FUNCTION public.segredo(text) FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.segredo(text) TO service_role;

-- ============================================================
-- GATE 4d: tentativa de REVOKE do acesso direto a view/tabela do Vault
-- (MELHOR ESFORCO - NAO e a defesa; ver GATE 4 no cabecalho do arquivo)
-- ============================================================
-- REVOKE de objeto de outro dono (schema `vault` pertence a `supabase_admin`,
-- nao a `postgres`) pode: (a) levantar insufficient_privilege - capturado
-- abaixo; ou (b) terminar sem erro e SEM efeito (Postgres so revoga o que o
-- papel atual tem poder de revogar; sem ser grantor/owner o REVOKE e um
-- no-op silencioso). MEDIDO EM PRODUCAO (18/09/2026, projeto Supabase
-- hospedado real): `postgres` NAO e membro de `supabase_admin` - e essa e a
-- situacao ESPERADA de todo projeto do aluno, nao uma excecao rara. Por
-- isso este bloco so tenta e AVISA (nunca falha a migration por causa
-- disso); quem confirma se pegou ou nao e o SMOKE (item 6f, mais abaixo),
-- que MEDE a pos-condicao e tambem nunca vira RAISE EXCEPTION aqui - so
-- WARNING/NOTICE. Vale como tranca extra SE o dono do projeto algum dia for
-- o mesmo papel que aplica a migration (instalacao atipica); no caminho
-- comum do aluno, e inofensivo e sem efeito - REVOKE em objeto que voce nao
-- pode revogar nunca destroi nada.
DO $$
DECLARE
  v_tranca_ok boolean := true;
BEGIN
  IF EXISTS (SELECT 1 FROM pg_namespace WHERE nspname = 'vault') THEN

    IF to_regclass('vault.decrypted_secrets') IS NOT NULL THEN
      BEGIN
        EXECUTE 'REVOKE ALL ON vault.decrypted_secrets FROM PUBLIC, anon, authenticated, service_role';
      EXCEPTION WHEN insufficient_privilege THEN
        v_tranca_ok := false;
        RAISE WARNING 'gate4: sem privilegio pra revogar vault.decrypted_secrets (o dono do schema vault nao e este papel) - ver README de migrations';
      END;
      IF has_table_privilege('service_role', 'vault.decrypted_secrets', 'SELECT') THEN
        v_tranca_ok := false;
        RAISE WARNING 'gate4: REVOKE em vault.decrypted_secrets nao teve efeito (grant e de outro dono) - rode manualmente: REVOKE ALL ON vault.decrypted_secrets FROM service_role; (como o dono do schema vault) - ver README de migrations';
      END IF;
    END IF;

    IF to_regclass('vault.secrets') IS NOT NULL THEN
      BEGIN
        EXECUTE 'REVOKE ALL ON vault.secrets FROM PUBLIC, anon, authenticated, service_role';
      EXCEPTION WHEN insufficient_privilege THEN
        v_tranca_ok := false;
        RAISE WARNING 'gate4: sem privilegio pra revogar vault.secrets (o dono do schema vault nao e este papel) - ver README de migrations';
      END;
      IF has_table_privilege('service_role', 'vault.secrets', 'SELECT') THEN
        v_tranca_ok := false;
        RAISE WARNING 'gate4: REVOKE em vault.secrets nao teve efeito (grant e de outro dono) - rode manualmente: REVOKE ALL ON vault.secrets FROM service_role; (como o dono do schema vault) - ver README de migrations';
      END IF;
    END IF;

    BEGIN
      EXECUTE 'REVOKE USAGE ON SCHEMA vault FROM anon, authenticated, service_role';
    EXCEPTION WHEN insufficient_privilege THEN
      v_tranca_ok := false;
      RAISE WARNING 'gate4: sem privilegio pra revogar USAGE do schema vault (o dono do schema vault nao e este papel) - ver README de migrations';
    END;
    IF has_schema_privilege('service_role', 'vault', 'USAGE') THEN
      v_tranca_ok := false;
      RAISE WARNING 'gate4: REVOKE USAGE ON SCHEMA vault nao teve efeito (grant e de outro dono) - rode manualmente: REVOKE USAGE ON SCHEMA vault FROM service_role; (como o dono do schema vault) - ver README de migrations';
    END IF;

  END IF;

  PERFORM set_config('gate4.tranca_ok', v_tranca_ok::text, false);
END $$;

-- ============================================================
-- Smoke: probes REAIS - os gates tem que agir sozinhos
-- ============================================================
DO $$
DECLARE
  v_gates       int;
  v_rls         boolean;
  v_anon_exec   boolean;
  v_public_x    int;
  v_proconfig   text;
  v_respeitou   text;
  v_vault_ok    boolean;
  v_segredo_ok  int;
  v_valor       text;
  v_segredo_lancou_excecao boolean;
BEGIN
  -- 1. os 3 event triggers no ar (evtenabled = 'D' seria kill-switch acionado)
  SELECT count(*) INTO v_gates FROM pg_event_trigger
   WHERE evtname IN ('trg_gate1_rls_auto',
                     'trg_gate2_revoke_execute',
                     'trg_gate3_search_path')
     AND evtenabled <> 'D';
  IF v_gates <> 3 THEN
    RAISE EXCEPTION
      'smoke: esperava 3 gates ativos, achei % - sem eles tabela nova nasce sem RLS (dado publico) e funcao nova nasce anon-executavel',
      v_gates;
  END IF;

  -- 2. probe gate1: cria tabela SEM rodar ENABLE ROW LEVEL SECURITY manual;
  --    quem tem que ligar e o gate, no ato do CREATE
  EXECUTE 'CREATE TABLE public._gate1_smoke (id int)';
  SELECT t.relrowsecurity INTO v_rls
    FROM pg_class t WHERE t.oid = 'public._gate1_smoke'::regclass;
  IF NOT v_rls THEN
    RAISE EXCEPTION
      'smoke: _gate1_smoke nasceu SEM RLS - gate1 nao pegou; toda tabela futura ficaria legivel pela API publica';
  END IF;

  -- 2b. probe gate1 via CREATE TABLE AS (command tag distinto do CREATE TABLE;
  --     a tag irma SELECT INTO usa a MESMA maquinaria e esta na lista do
  --     trigger, mas nao da pra probar daqui: plpgsql nao EXECUTE SELECT INTO)
  EXECUTE 'CREATE TABLE public._gate1_smoke2 AS SELECT 1 AS id';
  SELECT t.relrowsecurity INTO v_rls
    FROM pg_class t WHERE t.oid = 'public._gate1_smoke2'::regclass;
  IF NOT v_rls THEN
    RAISE EXCEPTION
      'smoke: _gate1_smoke2 (CREATE TABLE AS) nasceu SEM RLS - a tag CREATE TABLE AS saiu da lista do gate1';
  END IF;

  -- 2c. default privileges fechados: tabela nova nao pode nascer com grant
  --     de anon/authenticated (TRUNCATE do default ALL nem passa por RLS)
  IF has_table_privilege('anon', 'public._gate1_smoke', 'SELECT')
     OR has_table_privilege('authenticated', 'public._gate1_smoke', 'INSERT') THEN
    RAISE EXCEPTION
      'smoke: _gate1_smoke nasceu com grant de anon/authenticated - o ALTER DEFAULT PRIVILEGES desta migration sumiu';
  END IF;

  -- 3. probe gate2+gate3: cria funcao sem search_path e sem revoke manual
  EXECUTE 'CREATE FUNCTION public._gate_smoke_fn() RETURNS int '
       || 'LANGUAGE sql AS $x$ SELECT 1 $x$';

  -- gate2: anon herda de PUBLIC, entao anon=false prova os dois fechados...
  v_anon_exec := has_function_privilege(
    'anon', 'public._gate_smoke_fn()'::regprocedure, 'EXECUTE');
  IF v_anon_exec THEN
    RAISE EXCEPTION
      'smoke: _gate_smoke_fn nasceu executavel por anon - gate2 nao pegou; qualquer visitante com a chave publica executaria funcao nova';
  END IF;
  -- ...e este assert prova PUBLIC direto: grantee 0 = PUBLIC no ACL
  -- (proacl NULL = vale o acldefault, que INCLUI PUBLIC=X: tambem reprova)
  SELECT count(*) INTO v_public_x
    FROM pg_proc p,
         LATERAL aclexplode(coalesce(p.proacl, acldefault('f', p.proowner))) a
   WHERE p.oid = 'public._gate_smoke_fn()'::regprocedure
     AND a.grantee = 0
     AND a.privilege_type = 'EXECUTE';
  IF v_public_x > 0 THEN
    RAISE EXCEPTION
      'smoke: _gate_smoke_fn manteve PUBLIC=EXECUTE no ACL - gate2 nao removeu o hardwired';
  END IF;

  -- gate3: proconfig tem que conter search_path
  SELECT array_to_string(p.proconfig, ',') INTO v_proconfig
    FROM pg_proc p WHERE p.oid = 'public._gate_smoke_fn()'::regprocedure;
  IF v_proconfig IS NULL OR v_proconfig NOT LIKE '%search_path=%' THEN
    RAISE EXCEPTION
      'smoke: _gate_smoke_fn nasceu sem search_path (%) - gate3 nao pegou; funcao fica vulneravel a shadowing pelo path do chamador',
      coalesce(v_proconfig, '<null>');
  END IF;

  -- 4. probe gate3: funcao que DECLARA o proprio path nao pode ser sobrescrita
  EXECUTE 'CREATE FUNCTION public._gate_smoke_fn_path() RETURNS int '
       || 'LANGUAGE sql SET search_path = public, extensions AS $x$ SELECT 1 $x$';
  SELECT array_to_string(p.proconfig, ',') INTO v_respeitou
    FROM pg_proc p WHERE p.oid = 'public._gate_smoke_fn_path()'::regprocedure;
  IF v_respeitou NOT LIKE '%extensions%' THEN
    RAISE EXCEPTION
      'smoke: gate3 sobrescreveu search_path declarado pelo autor (%) - o gate deve respeitar escolha explicita',
      v_respeitou;
  END IF;

  -- 5. as proprias funcoes de gate nao podem ficar executaveis por ninguem
  IF has_function_privilege('anon', 'public.fn_gate1_rls_auto()'::regprocedure, 'EXECUTE')
     OR has_function_privilege('authenticated', 'public.fn_gate1_rls_auto()'::regprocedure, 'EXECUTE')
     OR has_function_privilege('anon', 'public.fn_gate2_revoke_execute()'::regprocedure, 'EXECUTE')
     OR has_function_privilege('authenticated', 'public.fn_gate2_revoke_execute()'::regprocedure, 'EXECUTE')
     OR has_function_privilege('anon', 'public.fn_gate3_search_path()'::regprocedure, 'EXECUTE')
     OR has_function_privilege('authenticated', 'public.fn_gate3_search_path()'::regprocedure, 'EXECUTE') THEN
    RAISE EXCEPTION
      'smoke: funcao de gate ficou executavel por anon/authenticated - o REVOKE ALL do bloco de seguranca sumiu';
  END IF;

  -- 6. gate4 (public.segredo + tranca do Vault)
  -- 6a. DURO: service_role tem que conseguir executar public.segredo
  IF NOT has_function_privilege('service_role', 'public.segredo(text)'::regprocedure, 'EXECUTE') THEN
    RAISE EXCEPTION
      'smoke: service_role nao pode executar public.segredo - o Empresa OS nao consegue ler nenhum segredo de integracao';
  END IF;

  -- 6b. DURO: anon/authenticated NUNCA executam public.segredo
  IF has_function_privilege('anon', 'public.segredo(text)'::regprocedure, 'EXECUTE')
     OR has_function_privilege('authenticated', 'public.segredo(text)'::regprocedure, 'EXECUTE') THEN
    RAISE EXCEPTION
      'smoke: public.segredo ficou executavel por anon/authenticated - qualquer visitante com a chave publica leria os segredos da empresa';
  END IF;

  -- 6c. DURO: mesmo assert de ACL do gate2, aplicado a public.segredo
  SELECT count(*) INTO v_segredo_ok
    FROM pg_proc p,
         LATERAL aclexplode(coalesce(p.proacl, acldefault('f', p.proowner))) a
   WHERE p.oid = 'public.segredo(text)'::regprocedure
     AND a.grantee = 0
     AND a.privilege_type = 'EXECUTE';
  IF v_segredo_ok > 0 THEN
    RAISE EXCEPTION
      'smoke: public.segredo manteve PUBLIC=EXECUTE no ACL - gate4 nao fechou o hardwired';
  END IF;

  -- 6d. DURO: segredo inexistente levanta excecao, nunca devolve NULL.
  -- ATENCAO DE IMPLEMENTACAO (bug real, medido por mutacao em 18/09/2026):
  -- o RAISE EXCEPTION de deteccao NAO PODE morar dentro do mesmo bloco
  -- BEGIN/EXCEPTION que engole a excecao esperada de public.segredo() -
  -- senao ele se auto-engole (WHEN OTHERS pega tanto a excecao boa quanto a
  -- de deteccao) e a guarda vira decoracao: a mutacao gate4-g42 (RAISE
  -- EXCEPTION trocado por RETURN NULL dentro de public.segredo) passava
  -- pelo smoke em silencio. Por isso o resultado fica numa flag e o RAISE
  -- de deteccao mora FORA do bloco que captura a excecao.
  v_segredo_lancou_excecao := false;
  BEGIN
    PERFORM public.segredo('_gate4_nao_existe');
  EXCEPTION WHEN OTHERS THEN
    v_segredo_lancou_excecao := true; -- qualquer excecao serve: sem Vault e "schema vault nao existe", com Vault e o RAISE proprio de public.segredo
  END;
  IF NOT v_segredo_lancou_excecao THEN
    RAISE EXCEPTION
      'smoke: public.segredo devolveu valor pra segredo inexistente - erro silencioso vira NULL passeando pelo sistema (trigger/webhook chamaria API externa com token vazio e tomaria 401 sem ninguem entender por que)';
  END IF;

  -- 6e. SO SE o Vault estiver instalado: ciclo real create_secret -> segredo()
  IF to_regclass('vault.secrets') IS NOT NULL THEN
    v_vault_ok := true;
    BEGIN
      DELETE FROM vault.secrets WHERE name = '_gate4_smoke';
      PERFORM vault.create_secret('valor-de-teste-gate4', '_gate4_smoke', 'smoke da 0001 - apagado no fim do bloco');
      v_valor := public.segredo('_gate4_smoke');
      IF v_valor IS DISTINCT FROM 'valor-de-teste-gate4' THEN
        RAISE EXCEPTION
          'smoke: ciclo create_secret -> public.segredo devolveu % em vez do valor cadastrado', coalesce(v_valor, '<null>');
      END IF;
    EXCEPTION WHEN OTHERS THEN
      IF SQLSTATE = 'P0001' THEN
        RAISE; -- o RAISE EXCEPTION explicito acima nao e engolido pelo cleanup
      END IF;
      v_vault_ok := false;
      RAISE WARNING 'gate4: ciclo create_secret/segredo falhou (Vault presente mas sem privilegio completo): %', SQLERRM;
    END;
    BEGIN
      DELETE FROM vault.secrets WHERE name = '_gate4_smoke';
    EXCEPTION WHEN OTHERS THEN
      RAISE WARNING 'gate4: limpeza do secret de smoke falhou (nao derruba a migration): %', SQLERRM;
    END;
    IF NOT v_vault_ok THEN
      RAISE EXCEPTION
        'smoke: ciclo real do Vault falhou - ver WARNING acima pra causa';
    END IF;
  END IF;

  -- 6f. TRANCA: MEDE a pos-condicao real, NUNCA falha a migration por causa
  -- dela. REVOKE em objeto de outro dono (schema vault = supabase_admin)
  -- pode ser um no-op silencioso - medido em producao real (18/09/2026):
  -- postgres NAO e membro de supabase_admin, entao o has_table_privilege
  -- abaixo da TRUE mesmo depois do REVOKE em QUALQUER projeto hospedado
  -- comum, e isso e o ESPERADO, nao uma falha. A defesa contra a IA ler o
  -- Vault direto NAO e esta tranca: e usar sempre public.segredo(), manter
  -- o MCP em modo read_only sem o schema vault, e o hook PreToolUse (peca a)
  -- que nega qualquer comando citando decrypted_secrets. RAISE EXCEPTION
  -- aqui derrubaria a 0001 em todo projeto real - por isso so WARNING/NOTICE.
  IF to_regclass('vault.decrypted_secrets') IS NOT NULL THEN
    IF has_table_privilege('service_role', 'vault.decrypted_secrets', 'SELECT') THEN
      RAISE WARNING
        'gate4: vault.decrypted_secrets continua legivel por service_role depois do REVOKE - ESPERADO no Supabase hospedado (o schema vault e de supabase_admin; postgres nao pode revogar o que nao e dono). A defesa aqui NAO e a tranca: e usar sempre public.segredo(), manter o MCP read_only sem o schema vault, e o hook PreToolUse que nega decrypted_secrets.';
    ELSE
      RAISE NOTICE
        'gate4: REVOKE em vault.decrypted_secrets teve efeito nesta instalacao (dono compativel) - tranca extra, mas a defesa principal continua sendo public.segredo() + MCP read_only + hook PreToolUse.';
    END IF;
  END IF;

  -- 6g. sem Vault: gate4 so foi provado na estrutura
  IF to_regclass('vault.secrets') IS NULL THEN
    RAISE NOTICE 'vault indisponivel neste Postgres: gate4 provado so na estrutura (privilegio de public.segredo)';
  END IF;

  -- limpeza dos artefatos do smoke
  EXECUTE 'DROP TABLE public._gate1_smoke';
  EXECUTE 'DROP TABLE public._gate1_smoke2';
  EXECUTE 'DROP FUNCTION public._gate_smoke_fn()';
  EXECUTE 'DROP FUNCTION public._gate_smoke_fn_path()';

  RAISE NOTICE
    '0001 smoke OK: 3 gates ativos; tabela probe nasceu com RLS; funcao probe nasceu fechada (sem PUBLIC/anon) e com [%]; path declarado respeitado [%]; gate4 (public.segredo) fechado pra anon/authenticated',
    v_proconfig, v_respeitou;
END $$;

-- ============================================================
-- Rollback (ordem: triggers antes das funcoes)
-- ============================================================
--   DROP EVENT TRIGGER IF EXISTS trg_gate1_rls_auto;
--   DROP EVENT TRIGGER IF EXISTS trg_gate2_revoke_execute;
--   DROP EVENT TRIGGER IF EXISTS trg_gate3_search_path;
--   DROP FUNCTION IF EXISTS public.fn_gate1_rls_auto();
--   DROP FUNCTION IF EXISTS public.fn_gate2_revoke_execute();
--   DROP FUNCTION IF EXISTS public.fn_gate3_search_path();
-- (kill-switch reversivel, sem drop: ALTER EVENT TRIGGER <nome> DISABLE;)
--   DROP FUNCTION IF EXISTS public.segredo(text);
-- O REVOKE do bloco GATE 4d (quando teve efeito - instalacao onde o dono do
-- projeto e o mesmo papel que aplica a migration) se desfaz devolvendo o
-- acesso direto:
--   GRANT SELECT ON vault.decrypted_secrets TO service_role;
--   GRANT USAGE ON SCHEMA vault TO service_role;
-- No Supabase hospedado comum isso normalmente e um no-op (a plataforma ja
-- concede esse acesso a service_role por construcao - ver GATE 4 no
-- cabecalho). Consequencia de rodar mesmo assim: qualquer codigo com
-- service_role volta a poder ler o valor em texto puro de TODO segredo do
-- Vault, nao so o nome - so faca isso se tiver certeza do motivo.
