-- 0012_fundacao_extensao.sql
-- Fundacao de extensao do banco (ADR-012, planta onda 1): o que permite o banco
-- do aluno CRESCER sem quebrar a planta, um modulo por PR.
--   1) public.modulo: catalogo de modulos (dono, prefixo dos slugs, schema proprio)
--   2) permissoes.modulo passa a apontar pra modulo (GA-08 por estrutura)
--   3) gates 1-3 passam a cobrir todo schema do catalogo, mais analitico e arquivo
--   4) schema `arquivo` (fechado; leitura so por RPC de modulo futuro)
--   5) atividade.modulo_origem: evento de modulo exige tambem o `.read` do modulo
-- Convencao de crescimento (um modulo novo = uma migration, ADR-012 §2 da planta):
--   a) INSERT em public.modulo (dono, descricao, schema_nome)
--   b) CREATE SCHEMA <modulo> + gates 1-3 ja valem; RLS, REVOKE, grants minimos
--   c) INSERT em public.permissoes (slugs `<modulo>.read|write|manage`)
--   d) tabelas com COMMENT `dono=...; retencao=...` e `classe=...` por coluna
--   e) pgTAP de permissao e negacao como usuario em supabase/tests/NNN_<modulo>.sql
-- Migration so ACRESCENTA; slug de permissao nunca muda de sentido.
-- Depende de: 0001-0011. Rollback ao fim.

-- ---------------------------------------------------------------------------
-- 1) Catalogo de modulos
-- ---------------------------------------------------------------------------
CREATE TABLE IF NOT EXISTS public.modulo (
  slug text PRIMARY KEY CHECK (slug ~ '^[a-z0-9_]+$'),
  nome text NOT NULL CHECK (length(trim(nome)) > 0),
  descricao text NOT NULL,
  dono text NOT NULL CHECK (length(trim(dono)) > 0),
  schema_nome text UNIQUE CHECK (schema_nome IS NULL OR schema_nome ~ '^[a-z][a-z0-9_]*$'),
  criada_em timestamptz NOT NULL DEFAULT now()
);

COMMENT ON TABLE public.modulo IS
  'dono=Lider de Dados; retencao=R12; Catalogo de modulos: cada prefixo de slug de permissao tem uma linha aqui, com dono (diretoria). schema_nome = schema onde as tabelas do modulo vivem; NULL = modulo da base, que mora em `public` ate o ADR que o move (ADR-012 item 12). Escrita so por migration; leitura por qualquer usuario ativo (ADR-012 item 10).';
COMMENT ON COLUMN public.modulo.slug IS
  'classe=nenhum; prefixo dos slugs de permissao (`<slug>.read|write|manage`) e, quando ha schema proprio, o proprio nome do schema.';
COMMENT ON COLUMN public.modulo.nome IS
  'classe=nenhum; nome de exibicao.';
COMMENT ON COLUMN public.modulo.descricao IS
  'classe=nenhum; o que o modulo guarda, em linguagem de gente.';
COMMENT ON COLUMN public.modulo.dono IS
  'classe=nenhum; diretoria dona do modulo. Modulo sem dono nao entra (GA-08).';
COMMENT ON COLUMN public.modulo.schema_nome IS
  'classe=nenhum; schema do modulo, coberto pelos gates 1-3. NULL = vive em public (modulo da base). Schema novo so existe se tiver linha aqui (GA-08).';
COMMENT ON COLUMN public.modulo.criada_em IS
  'classe=nenhum; quando o modulo entrou no catalogo.';

-- Os prefixos da base (spec v2). Moram em `public`: schema_nome NULL.
INSERT INTO public.modulo (slug, nome, descricao, dono) VALUES
  ('tarefas',       'Tarefas',        'Kanban, trilha do curso e plano de 90 dias',                  'Integrador'),
  ('agentes',       'Agentes',        'Catalogo do time de agentes e melhorias propostas',            'Lider de Dados'),
  ('execucoes',     'Execucoes',      'Registro do que cada agente executou',                         'CAIO'),
  ('documentos',    'Documentos',     'Dossie, persona, marca e extracoes publicados pela IA',        'Lider de Dados'),
  ('usuarios',      'Usuarios',       'Pessoas com acesso ao sistema e as permissoes de cada uma',    'Lider de Dados'),
  ('atividade',     'Atividade',      'Linha do tempo da empresa (append-only)',                      'Lider de Dados'),
  ('configuracoes', 'Configuracoes',  'Dados da empresa e ajustes do sistema',                        'Lider de Dados')
ON CONFLICT (slug) DO NOTHING;

ALTER TABLE public.modulo ENABLE ROW LEVEL SECURITY;
REVOKE ALL ON public.modulo FROM PUBLIC, anon, authenticated;
GRANT SELECT ON public.modulo TO authenticated;
GRANT ALL ON public.modulo TO service_role;

-- Excecao documentada ao lado das da E3-05: qualquer usuario ativo le o catalogo
-- (o menu e a tela de permissoes precisam dele). Escrita so por migration.
DROP POLICY IF EXISTS modulo_select ON public.modulo;
CREATE POLICY modulo_select ON public.modulo
  FOR SELECT TO authenticated
  USING (public.usuario_atual() IS NOT NULL);

-- ---------------------------------------------------------------------------
-- 2) Todo slug tem prefixo no catalogo (GA-08 por estrutura)
-- ---------------------------------------------------------------------------
DO $$
BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_constraint
                 WHERE conrelid = 'public.permissoes'::regclass
                   AND conname = 'fk_permissoes_modulo') THEN
    ALTER TABLE public.permissoes
      ADD CONSTRAINT fk_permissoes_modulo
      FOREIGN KEY (modulo) REFERENCES public.modulo(slug) ON UPDATE CASCADE;
  END IF;
END $$;

-- ---------------------------------------------------------------------------
-- 3) Gates 1-3 cobrem public + schemas do catalogo + analitico + arquivo.
--    Mesmo corpo da 0001, com o filtro de schema ampliado. Falha interna
--    continua virando aviso: o gate NUNCA derruba um DDL legitimo.
--    Schema fora desta lista (de sistema ou de extensao) fica de fora.
-- ---------------------------------------------------------------------------
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
    WHERE (c.schema_name = 'public'
           OR c.schema_name IN ('analitico', 'arquivo')
           OR c.schema_name IN (SELECT m.schema_nome FROM public.modulo m
                                 WHERE m.schema_nome IS NOT NULL))
      AND c.object_type = 'table'
  LOOP
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

    BEGIN
      INSERT INTO public.atividade (tipo, descricao)
      VALUES ('sistema',
              format('Proteção de dados ligada automaticamente na área nova do banco (%s)',
                     r.objid::regclass));
    EXCEPTION WHEN OTHERS THEN
      NULL;
    END;
  END LOOP;
EXCEPTION WHEN OTHERS THEN
  RAISE WARNING 'fn_gate1_rls_auto falhou (DDL segue): %', SQLERRM;
END $$;

COMMENT ON FUNCTION public.fn_gate1_rls_auto() IS
  'GATE1 (0001, ampliado na 0012): liga ROW LEVEL SECURITY em toda tabela nova de public, dos schemas de public.modulo, de analitico e de arquivo. '
  'Tabela sem RLS = dado legivel pela API publica do Supabase. '
  'Kill-switch: ALTER EVENT TRIGGER trg_gate1_rls_auto DISABLE;';

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
    WHERE (c.schema_name = 'public'
           OR c.schema_name IN ('analitico', 'arquivo')
           OR c.schema_name IN (SELECT m.schema_nome FROM public.modulo m
                                 WHERE m.schema_nome IS NOT NULL))
      AND c.object_type IN ('function', 'procedure')
  LOOP
    CONTINUE WHEN NOT EXISTS (
      SELECT 1 FROM pg_proc p
      WHERE p.oid = r.objid
        AND p.proowner = 'postgres'::regrole
        AND NOT EXISTS (
          SELECT 1 FROM pg_depend d WHERE d.objid = p.oid AND d.deptype = 'e'
        )
    );

    EXECUTE format('REVOKE EXECUTE ON ROUTINE %s FROM PUBLIC', r.objid::regprocedure);
    EXECUTE format('REVOKE EXECUTE ON ROUTINE %s FROM anon',   r.objid::regprocedure);
  END LOOP;
EXCEPTION WHEN OTHERS THEN
  RAISE WARNING 'fn_gate2_revoke_execute falhou (DDL segue): %', SQLERRM;
END $$;

COMMENT ON FUNCTION public.fn_gate2_revoke_execute() IS
  'GATE2 (0001, ampliado na 0012): fecha EXECUTE de PUBLIC/anon em funcao nova de public, dos schemas de public.modulo, de analitico e de arquivo. '
  'Necessario porque ALTER DEFAULT PRIVILEGES nao remove o PUBLIC=X hardwired do acldefault() do Postgres. '
  'Kill-switch: ALTER EVENT TRIGGER trg_gate2_revoke_execute DISABLE;';

CREATE OR REPLACE FUNCTION public.fn_gate3_search_path()
RETURNS event_trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = pg_catalog, public
AS $$
DECLARE
  r record;
  v_schema text;
  v_path text;
BEGIN
  FOR r IN
    SELECT c.objid, c.schema_name
    FROM pg_event_trigger_ddl_commands() c
    WHERE (c.schema_name = 'public'
           OR c.schema_name IN ('analitico', 'arquivo')
           OR c.schema_name IN (SELECT m.schema_nome FROM public.modulo m
                                 WHERE m.schema_nome IS NOT NULL))
      AND c.object_type IN ('function', 'procedure')
  LOOP
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

    -- Funcao de modulo enxerga o proprio schema primeiro; pg_temp por ULTIMO:
    -- sem isso, tabela temporaria do chamador poderia sombrear objeto do schema.
    v_schema := r.schema_name;
    v_path := CASE WHEN v_schema = 'public' THEN 'public, pg_temp'
                   ELSE quote_ident(v_schema) || ', public, pg_temp' END;
    EXECUTE format('ALTER ROUTINE %s SET search_path = %s', r.objid::regprocedure, v_path);
    RAISE WARNING
      'gate3: % nasceu sem search_path; apliquei SET search_path = %. '
      'Se ela precisa de outro schema, declare no CREATE (ex.: SET search_path = public, outro_schema).',
      r.objid::regprocedure, v_path;
  END LOOP;
EXCEPTION WHEN OTHERS THEN
  RAISE WARNING 'fn_gate3_search_path falhou (DDL segue): %', SQLERRM;
END $$;

COMMENT ON FUNCTION public.fn_gate3_search_path() IS
  'GATE3 (0001, ampliado na 0012): aplica SET search_path fixo em funcao nova de public, dos schemas de public.modulo, de analitico e de arquivo que nao declarou o proprio. '
  'Fecha o lint function_search_path_mutable na raiz. '
  'Kill-switch: ALTER EVENT TRIGGER trg_gate3_search_path DISABLE;';

REVOKE ALL ON FUNCTION public.fn_gate1_rls_auto()
  FROM PUBLIC, anon, authenticated, service_role;
REVOKE ALL ON FUNCTION public.fn_gate2_revoke_execute()
  FROM PUBLIC, anon, authenticated, service_role;
REVOKE ALL ON FUNCTION public.fn_gate3_search_path()
  FROM PUBLIC, anon, authenticated, service_role;

-- ---------------------------------------------------------------------------
-- 4) Schema `arquivo`: arquivo restrito (ADR-012 item 11). NAO exposto pela API
--    (config.toml [api] schemas fica so com public). Tabela
--    arquivo.<schema>__<tabela> nasce no primeiro lote de arquivamento; leitura
--    so por RPC de modulo com slug restrito; escrita so pela rotina. Sem tabela
--    nem grant nesta migration.
-- ---------------------------------------------------------------------------
CREATE SCHEMA IF NOT EXISTS arquivo;
COMMENT ON SCHEMA arquivo IS
  'Arquivo restrito: espelho frio de tabelas de modulo com obrigacao legal de guarda (ADR-010). Nao exposto pela API. Sem grant para anon, authenticated ou agente: leitura so por RPC com slug restrito, escrita so pela rotina de retencao.';
REVOKE ALL ON SCHEMA arquivo FROM PUBLIC, anon, authenticated;

-- ---------------------------------------------------------------------------
-- 5) atividade.modulo_origem: o evento de um modulo so aparece pra quem tambem
--    tem o `.read` desse modulo (alem de atividade.read). Sem modulo_origem
--    (NULL), vale so atividade.read, como na spec v2. Evento de modulo
--    restrito leva so tipo e id na descricao/metadata (regra de quem produz).
-- ---------------------------------------------------------------------------
ALTER TABLE public.atividade
  ADD COLUMN IF NOT EXISTS modulo_origem text REFERENCES public.modulo(slug) ON UPDATE CASCADE;

COMMENT ON COLUMN public.atividade.modulo_origem IS
  'classe=nenhum; modulo que gerou o evento (public.modulo.slug). NULL = evento da base, visivel por atividade.read. Preenchido, a linha so aparece pra quem tem tambem `<modulo>.read`. Evento de modulo restrito carrega so tipo e id (sem texto livre com dado pessoal).';

CREATE INDEX IF NOT EXISTS idx_atividade_modulo_origem
  ON public.atividade (modulo_origem) WHERE modulo_origem IS NOT NULL;

DROP POLICY IF EXISTS atividade_select ON public.atividade;
CREATE POLICY atividade_select ON public.atividade
  FOR SELECT TO authenticated
  USING (
    public.tem_permissao('atividade.read')
    AND (modulo_origem IS NULL OR public.tem_permissao(modulo_origem || '.read'))
  );

DROP POLICY IF EXISTS atividade_insert ON public.atividade;
CREATE POLICY atividade_insert ON public.atividade
  FOR INSERT TO authenticated
  WITH CHECK (
    public.usuario_atual() IS NOT NULL
    AND usuario_id = public.usuario_atual()
    AND agente_id IS NULL
    AND tipo <> 'sistema'
    AND (modulo_origem IS NULL OR public.tem_permissao(modulo_origem || '.read'))
  );

-- ---------------------------------------------------------------------------
-- Smoke
-- ---------------------------------------------------------------------------
DO $$
DECLARE
  v_n int;
  v_fk_pegou boolean := false;
BEGIN
  IF to_regclass('public.modulo') IS NULL THEN
    RAISE EXCEPTION 'smoke 0012: public.modulo nao criada — modulo novo nao tem onde se registrar';
  END IF;
  IF NOT (SELECT relrowsecurity FROM pg_class WHERE oid = 'public.modulo'::regclass) THEN
    RAISE EXCEPTION 'smoke 0012: RLS desligada em modulo';
  END IF;
  IF NOT has_table_privilege('authenticated', 'public.modulo', 'SELECT') THEN
    RAISE EXCEPTION 'smoke 0012: authenticated sem SELECT em modulo — menu e tela de permissoes renderizam VAZIOS sem erro';
  END IF;
  IF has_table_privilege('authenticated', 'public.modulo', 'INSERT')
     OR has_table_privilege('authenticated', 'public.modulo', 'UPDATE')
     OR has_table_privilege('authenticated', 'public.modulo', 'DELETE') THEN
    RAISE EXCEPTION 'smoke 0012: authenticated escreve em modulo — o catalogo so muda por migration';
  END IF;
  IF has_table_privilege('anon', 'public.modulo', 'SELECT') THEN
    RAISE EXCEPTION 'smoke 0012: anon tem SELECT em modulo';
  END IF;
  IF NOT EXISTS (SELECT 1 FROM pg_policies WHERE schemaname = 'public'
                 AND tablename = 'modulo' AND policyname = 'modulo_select') THEN
    RAISE EXCEPTION 'smoke 0012: policy modulo_select ausente — o catalogo fica ilegivel';
  END IF;

  -- GA-08 por estrutura: todo prefixo de slug tem modulo com dono
  SELECT count(*) INTO v_n FROM public.permissoes p
   WHERE NOT EXISTS (SELECT 1 FROM public.modulo m WHERE m.slug = p.modulo);
  IF v_n <> 0 THEN
    RAISE EXCEPTION 'smoke 0012: % slug(s) de permissao sem modulo no catalogo', v_n;
  END IF;
  BEGIN
    BEGIN
      INSERT INTO public.permissoes (slug, modulo, acao, descricao)
      VALUES ('modulo_fantasma.read', 'modulo_fantasma', 'read', 'x');
    EXCEPTION WHEN foreign_key_violation THEN v_fk_pegou := true; END;
    RAISE EXCEPTION 'smoke 0012: desfazendo' USING ERRCODE = 'P0999';
  EXCEPTION WHEN SQLSTATE 'P0999' THEN NULL;
  END;
  IF NOT v_fk_pegou THEN
    RAISE EXCEPTION 'smoke 0012: permissao com prefixo fora do catalogo foi aceita — fk_permissoes_modulo sumiu';
  END IF;

  IF NOT EXISTS (SELECT 1 FROM pg_namespace WHERE nspname = 'arquivo') THEN
    RAISE EXCEPTION 'smoke 0012: schema arquivo ausente';
  END IF;
  IF has_schema_privilege('authenticated', 'arquivo', 'USAGE')
     OR has_schema_privilege('anon', 'arquivo', 'USAGE') THEN
    RAISE EXCEPTION 'smoke 0012: anon/authenticated com USAGE em arquivo — o arquivo restrito so abre por RPC';
  END IF;

  -- Os 3 gates cobrem os schemas do catalogo: o texto da funcao cita public.modulo
  IF EXISTS (
    SELECT 1 FROM pg_proc
     WHERE oid IN ('public.fn_gate1_rls_auto()'::regprocedure,
                   'public.fn_gate2_revoke_execute()'::regprocedure,
                   'public.fn_gate3_search_path()'::regprocedure)
       AND prosrc NOT LIKE '%public.modulo%'
  ) THEN
    RAISE EXCEPTION 'smoke 0012: algum gate (1-3) nao cobre os schemas de public.modulo — tabela de modulo nasceria sem RLS';
  END IF;

  IF NOT EXISTS (SELECT 1 FROM pg_attribute WHERE attrelid = 'public.atividade'::regclass
                 AND attname = 'modulo_origem' AND NOT attisdropped) THEN
    RAISE EXCEPTION 'smoke 0012: atividade.modulo_origem ausente';
  END IF;
  IF NOT EXISTS (SELECT 1 FROM pg_policies WHERE schemaname = 'public'
                 AND tablename = 'atividade' AND policyname = 'atividade_select'
                 AND qual LIKE '%modulo_origem%') THEN
    RAISE EXCEPTION 'smoke 0012: atividade_select sem a trava de modulo_origem — evento de modulo restrito apareceria pra quem so tem atividade.read';
  END IF;
END $$;

-- Rollback:
--   (ordem inversa; as policies de atividade voltam ao texto da 0007)
--   ALTER TABLE public.atividade DROP COLUMN IF EXISTS modulo_origem;
--   DROP SCHEMA IF EXISTS arquivo;
--   ALTER TABLE public.permissoes DROP CONSTRAINT IF EXISTS fk_permissoes_modulo;
--   DROP TABLE IF EXISTS public.modulo;
--   (re-aplicar a 0001 restaura os gates so de public)
