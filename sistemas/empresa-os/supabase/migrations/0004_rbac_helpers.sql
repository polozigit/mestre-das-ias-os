-- 0004_rbac_helpers.sql
-- Helpers de permissao do Empresa OS. Toda policy do sistema pergunta "quem e
-- voce e o que pode" ATRAVES destas funcoes SECURITY DEFINER — policy que
-- subconsulta usuarios direto entra em recursao de RLS (a subconsulta dispara a
-- propria policy de usuarios, que subconsulta de novo, ate o Postgres abortar).
-- AVISO: NUNCA escreva policy com SELECT em usuarios inline. Sempre via
-- public.usuario_atual() / public.e_dono() / public.tem_permissao(slug).
-- Padrao do Polozi OS (migration_090): `tem_permissao`, com e_dono no lugar de
-- is_admin. Diferenca deliberada: aqui NUNCA ha EXECUTE para anon (G3).
-- Depende de: 0002 (empresa, set_atualizada_em), 0003 (usuarios, permissoes,
-- usuarios_permissoes) e Supabase Auth (auth.uid()).
-- Rollback ao fim do arquivo.

-- ============================================================
-- 1) Helpers (LANGUAGE sql, STABLE, SECURITY DEFINER)
--    SECURITY DEFINER = rodam como dono da funcao, que bypassa RLS
--    de usuarios — e isso que quebra a recursao.
--    search_path fixo em public: dentro do corpo, tudo que nao e
--    public precisa vir qualificado (auth.uid()).
-- ============================================================

CREATE OR REPLACE FUNCTION public.usuario_atual()
RETURNS uuid
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
  SELECT u.id
  FROM public.usuarios u
  WHERE u.auth_user_id = auth.uid()
    AND u.ativo
  LIMIT 1;
$$;

COMMENT ON FUNCTION public.usuario_atual() IS
  'usuarios.id do usuario logado (mapeado via auth.uid). NULL se anon, sem cadastro ou inativo. E o valor que policies comparam contra dono_id/usuario_id.';

CREATE OR REPLACE FUNCTION public.e_dono()
RETURNS boolean
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
  SELECT coalesce(
    (SELECT u.e_dono
       FROM public.usuarios u
      WHERE u.auth_user_id = auth.uid()
        AND u.ativo
      LIMIT 1),
    false);
$$;

COMMENT ON FUNCTION public.e_dono() IS
  'true se o usuario logado e o dono da empresa (e ativo). false (nunca NULL) pra quem nao esta logado.';

CREATE OR REPLACE FUNCTION public.tem_permissao(p_perm text)
RETURNS boolean
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
  SELECT coalesce(
    (SELECT u.e_dono
            OR EXISTS (SELECT 1
                         FROM public.usuarios_permissoes up
                        WHERE up.usuario_id = u.id
                          AND up.permissao = p_perm)
       FROM public.usuarios u
      WHERE u.auth_user_id = auth.uid()
        AND u.ativo),
    false);
$$;

COMMENT ON FUNCTION public.tem_permissao(text) IS
  'true se o usuario logado e o DONO (tem todas) ou recebeu o slug em usuarios_permissoes. coalesce garante false (nunca NULL) pra quem nao esta logado/inativo. Uso em policy: tem_permissao(''tarefas.read''). Slug com erro de digitacao nao da erro: devolve false e a tela fica VAZIA pra todo mundo menos o dono — por isso a guarda G4 e o teste pgTAP como usuario.';

CREATE OR REPLACE FUNCTION public.sessao_atual()
RETURNS TABLE (
  usuario_id       uuid,
  nome             text,
  email            text,
  e_dono           boolean,
  senha_trocada_em timestamptz,
  permissoes       text[]
)
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
  SELECT u.id,
         u.nome,
         u.email,
         u.e_dono,
         u.senha_trocada_em,
         CASE WHEN u.e_dono
              THEN coalesce((SELECT array_agg(p.slug ORDER BY p.slug) FROM public.permissoes p), '{}')
              ELSE coalesce((SELECT array_agg(up.permissao ORDER BY up.permissao)
                               FROM public.usuarios_permissoes up
                              WHERE up.usuario_id = u.id), '{}')
         END
  FROM public.usuarios u
  WHERE u.auth_user_id = auth.uid()
    AND u.ativo
  LIMIT 1;
$$;

COMMENT ON FUNCTION public.sessao_atual() IS
  'RPC do front (getSessao) e do middleware (1 por request, falha fechada): 1 linha com identidade e permissoes do usuario logado, zero linhas se anon/inativo. O dono recebe o catalogo inteiro em permissoes.';

CREATE OR REPLACE FUNCTION public.marcar_senha_trocada()
RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
  UPDATE public.usuarios
     SET senha_trocada_em = now()
   WHERE auth_user_id = auth.uid()
     AND senha_trocada_em IS NULL;
END;
$$;

COMMENT ON FUNCTION public.marcar_senha_trocada() IS
  'Carimba usuarios.senha_trocada_em = now() SO na linha do usuario logado e SO se ainda NULL (D24-10: o middleware manda pra /trocar-senha enquanto NULL).';

-- ============================================================
-- 2) ACL das funcoes: anon e PUBLIC NUNCA executam.
--    (PUBLIC recebe EXECUTE por default em funcao nova — revogar sempre.)
-- ============================================================

REVOKE ALL ON FUNCTION public.usuario_atual()          FROM PUBLIC, anon;
REVOKE ALL ON FUNCTION public.e_dono()                 FROM PUBLIC, anon;
REVOKE ALL ON FUNCTION public.tem_permissao(text)      FROM PUBLIC, anon;
REVOKE ALL ON FUNCTION public.sessao_atual()           FROM PUBLIC, anon;
REVOKE ALL ON FUNCTION public.marcar_senha_trocada()   FROM PUBLIC, anon;

GRANT EXECUTE ON FUNCTION public.usuario_atual()        TO authenticated, service_role;
GRANT EXECUTE ON FUNCTION public.e_dono()               TO authenticated, service_role;
GRANT EXECUTE ON FUNCTION public.tem_permissao(text)    TO authenticated, service_role;
GRANT EXECUTE ON FUNCTION public.sessao_atual()         TO authenticated, service_role;
GRANT EXECUTE ON FUNCTION public.marcar_senha_trocada() TO authenticated, service_role;

-- ============================================================
-- 3) Gatilho: so o dono mexe em `usuarios.manage` (G8)
--    Mesmo espirito de migration_377:196-217 (so o master mexe em admin).
--    Maquina (auth.uid() nulo: seed, script, migration) passa.
-- ============================================================

CREATE OR REPLACE FUNCTION public.fn_usuarios_manage_so_dono()
RETURNS trigger
LANGUAGE plpgsql
SET search_path = public
AS $$
DECLARE
  v_permissao text;
BEGIN
  v_permissao := CASE WHEN TG_OP = 'DELETE' THEN OLD.permissao ELSE NEW.permissao END;
  IF v_permissao = 'usuarios.manage'
     AND auth.uid() IS NOT NULL
     AND NOT public.e_dono() THEN
    RAISE EXCEPTION 'so o dono concede ou tira a permissao usuarios.manage'
      USING ERRCODE = '42501';
  END IF;
  IF TG_OP = 'DELETE' THEN
    RETURN OLD;
  END IF;
  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS trg_usuarios_manage_so_dono ON public.usuarios_permissoes;
CREATE TRIGGER trg_usuarios_manage_so_dono
  BEFORE INSERT OR DELETE ON public.usuarios_permissoes
  FOR EACH ROW EXECUTE FUNCTION public.fn_usuarios_manage_so_dono();

COMMENT ON TRIGGER trg_usuarios_manage_so_dono ON public.usuarios_permissoes IS
  'Linha com permissao = usuarios.manage exige e_dono() ou auth.uid() NULL (maquina). Sem isso, quem tem usuarios.manage se multiplicaria sozinho.';

-- ============================================================
-- 4) Policies de empresa, usuarios, permissoes e usuarios_permissoes
--    (moram AQUI porque dependem dos helpers)
--    Excecoes documentadas a regra "toda policy checa tem_permissao" (E3-05):
--    SELECT em empresa, permissoes e usuarios vale pra QUALQUER usuario ativo
--    (usuario_atual() IS NOT NULL): nome da empresa no cabecalho e lista de
--    responsaveis no Kanban sao efeito colateral de outros modulos; exigir
--    permissao propria daria tela vazia sem erro.
-- ============================================================

ALTER TABLE public.empresa ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.usuarios ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.permissoes ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.usuarios_permissoes ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS empresa_select ON public.empresa;
CREATE POLICY empresa_select ON public.empresa
  FOR SELECT TO authenticated
  USING (public.usuario_atual() IS NOT NULL);

DROP POLICY IF EXISTS empresa_update ON public.empresa;
CREATE POLICY empresa_update ON public.empresa
  FOR UPDATE TO authenticated
  USING (public.tem_permissao('configuracoes.write'))
  WITH CHECK (public.tem_permissao('configuracoes.write'));

DROP POLICY IF EXISTS usuarios_select ON public.usuarios;
CREATE POLICY usuarios_select ON public.usuarios
  FOR SELECT TO authenticated
  USING (public.usuario_atual() IS NOT NULL);

-- Sem policy de INSERT/DELETE pra authenticated: convite entra so via
-- service_role; desativar, nao apagar.
DROP POLICY IF EXISTS usuarios_update ON public.usuarios;
CREATE POLICY usuarios_update ON public.usuarios
  FOR UPDATE TO authenticated
  USING (public.tem_permissao('usuarios.manage'))
  WITH CHECK (public.tem_permissao('usuarios.manage'));

DROP POLICY IF EXISTS permissoes_select ON public.permissoes;
CREATE POLICY permissoes_select ON public.permissoes
  FOR SELECT TO authenticated
  USING (public.usuario_atual() IS NOT NULL);

DROP POLICY IF EXISTS usuarios_permissoes_select ON public.usuarios_permissoes;
CREATE POLICY usuarios_permissoes_select ON public.usuarios_permissoes
  FOR SELECT TO authenticated
  USING (usuario_id = public.usuario_atual() OR public.tem_permissao('usuarios.manage'));

DROP POLICY IF EXISTS usuarios_permissoes_insert ON public.usuarios_permissoes;
CREATE POLICY usuarios_permissoes_insert ON public.usuarios_permissoes
  FOR INSERT TO authenticated
  WITH CHECK (public.tem_permissao('usuarios.manage') AND concedida_por = public.usuario_atual());

DROP POLICY IF EXISTS usuarios_permissoes_delete ON public.usuarios_permissoes;
CREATE POLICY usuarios_permissoes_delete ON public.usuarios_permissoes
  FOR DELETE TO authenticated
  USING (public.tem_permissao('usuarios.manage'));

-- ============================================================
-- 5) Smoke — prova que a fundacao de permissao esta de pe.
--    Teste de mutacao: apagar qualquer GRANT/policy/RLS acima QUEBRA aqui.
-- ============================================================

DO $$
DECLARE
  v_fn  text;
  v_oid oid;
  v_pol text;
  r     record;
  v_slug text;
BEGIN
  -- 5.1 As 5 funcoes existem, sao SECURITY DEFINER e tem search_path pinado
  FOR v_fn IN
    SELECT unnest(ARRAY[
      'public.usuario_atual()',
      'public.e_dono()',
      'public.tem_permissao(text)',
      'public.sessao_atual()',
      'public.marcar_senha_trocada()'
    ])
  LOOP
    v_oid := to_regprocedure(v_fn);
    IF v_oid IS NULL THEN
      RAISE EXCEPTION 'smoke 0004: funcao % nao existe — toda policy que a referencia falha e NADA renderiza', v_fn;
    END IF;
    IF NOT (SELECT prosecdef FROM pg_proc WHERE oid = v_oid) THEN
      RAISE EXCEPTION 'smoke 0004: % sem SECURITY DEFINER — ao ler usuarios ela dispara RLS e entra em RECURSAO', v_fn;
    END IF;
    IF NOT EXISTS (
      SELECT 1 FROM pg_proc
      WHERE oid = v_oid
        AND EXISTS (SELECT 1 FROM unnest(proconfig) c WHERE c LIKE 'search_path=%')
    ) THEN
      RAISE EXCEPTION 'smoke 0004: % sem SET search_path — SECURITY DEFINER com path herdado e vetor de hijack de schema', v_fn;
    END IF;
    -- G3: anon nao executa (has_function_privilege cobre grant direto E via PUBLIC)
    IF has_function_privilege('anon', v_oid, 'EXECUTE') THEN
      RAISE EXCEPTION 'smoke 0004: anon executa % — anon e chave PUBLICA, enumera identidade sem login', v_fn;
    END IF;
    IF NOT has_function_privilege('authenticated', v_oid, 'EXECUTE') THEN
      RAISE EXCEPTION 'smoke 0004: authenticated nao executa % — toda policy avalia como erro e o app inteiro para', v_fn;
    END IF;
    IF NOT has_function_privilege('service_role', v_oid, 'EXECUTE') THEN
      RAISE EXCEPTION 'smoke 0004: service_role nao executa % — scripts server-side quebram', v_fn;
    END IF;
  END LOOP;

  -- 5.2 RLS ligada nas 4 tabelas
  FOREACH v_pol IN ARRAY ARRAY['empresa', 'usuarios', 'permissoes', 'usuarios_permissoes'] LOOP
    IF NOT (SELECT relrowsecurity FROM pg_class WHERE oid = ('public.' || v_pol)::regclass) THEN
      RAISE EXCEPTION 'smoke 0004: RLS desligada em % — qualquer usuario logado le o cadastro todo', v_pol;
    END IF;
  END LOOP;

  -- 5.3 As 8 policies existem com o nome do contrato
  FOR v_pol IN
    SELECT unnest(ARRAY[
      'empresa:empresa_select',
      'empresa:empresa_update',
      'usuarios:usuarios_select',
      'usuarios:usuarios_update',
      'permissoes:permissoes_select',
      'usuarios_permissoes:usuarios_permissoes_select',
      'usuarios_permissoes:usuarios_permissoes_insert',
      'usuarios_permissoes:usuarios_permissoes_delete'
    ])
  LOOP
    IF NOT EXISTS (
      SELECT 1 FROM pg_policies
      WHERE schemaname = 'public'
        AND tablename  = split_part(v_pol, ':', 1)
        AND policyname = split_part(v_pol, ':', 2)
    ) THEN
      RAISE EXCEPTION 'smoke 0004: policy % ausente — com RLS ligada e sem policy a tabela fica INACESSIVEL (pagina vazia, sem erro)', v_pol;
    END IF;
  END LOOP;

  -- 5.4 G4: todo slug citado em policy (desta e das migrations ja aplicadas)
  -- existe no catalogo. Typo = tela vazia pra todo mundo menos o dono.
  FOR r IN
    SELECT p.tablename, p.policyname,
           coalesce(p.qual, '') || ' ' || coalesce(p.with_check, '') AS texto
    FROM pg_policies p
    WHERE p.schemaname = 'public'
  LOOP
    FOR v_slug IN
      SELECT m[1] FROM regexp_matches(r.texto, 'tem_permissao\(''([^'']+)''', 'g') AS m
    LOOP
      IF NOT EXISTS (SELECT 1 FROM public.permissoes WHERE slug = v_slug) THEN
        RAISE EXCEPTION 'smoke 0004: policy %.% cita o slug % que nao existe em permissoes — a tela fica vazia pra todo mundo menos o dono', r.tablename, r.policyname, v_slug;
      END IF;
    END LOOP;
  END LOOP;

  -- 5.5 Gatilho de usuarios.manage so pelo dono (G8)
  IF NOT EXISTS (SELECT 1 FROM pg_trigger
                 WHERE tgrelid = 'public.usuarios_permissoes'::regclass
                   AND tgname = 'trg_usuarios_manage_so_dono' AND NOT tgisinternal) THEN
    RAISE EXCEPTION 'smoke 0004: gatilho trg_usuarios_manage_so_dono ausente — quem tem usuarios.manage se multiplica sozinho';
  END IF;
END $$;

-- ============================================================
-- Rollback:
--   DROP TRIGGER IF EXISTS trg_usuarios_manage_so_dono ON public.usuarios_permissoes;
--   DROP FUNCTION IF EXISTS public.fn_usuarios_manage_so_dono();
--   DROP POLICY IF EXISTS usuarios_permissoes_delete ON public.usuarios_permissoes;
--   DROP POLICY IF EXISTS usuarios_permissoes_insert ON public.usuarios_permissoes;
--   DROP POLICY IF EXISTS usuarios_permissoes_select ON public.usuarios_permissoes;
--   DROP POLICY IF EXISTS permissoes_select ON public.permissoes;
--   DROP POLICY IF EXISTS usuarios_update ON public.usuarios;
--   DROP POLICY IF EXISTS usuarios_select ON public.usuarios;
--   DROP POLICY IF EXISTS empresa_update ON public.empresa;
--   DROP POLICY IF EXISTS empresa_select ON public.empresa;
--   DROP FUNCTION IF EXISTS public.marcar_senha_trocada();
--   DROP FUNCTION IF EXISTS public.sessao_atual();
--   DROP FUNCTION IF EXISTS public.tem_permissao(text);
--   DROP FUNCTION IF EXISTS public.e_dono();
--   DROP FUNCTION IF EXISTS public.usuario_atual();
--   (RLS fica ligada de proposito: desligar reabriria as tabelas.)
-- ============================================================
