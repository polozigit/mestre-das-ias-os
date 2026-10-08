-- 0002_empresa.sql
-- A empresa do aluno: UMA linha, garantida pela estrutura (id = 1 com CHECK),
-- nunca por convencao. Um banco guarda uma empresa so (ADR-001, spec v2 E3-02);
-- nenhuma tabela do sistema tem org_id.
-- Tambem nasce aqui a funcao compartilhada public.set_atualizada_em(), que as
-- migrations 0003+ apenas REFERENCIAM (nunca recriam) nos seus triggers.
-- Depende da 0001. As policies desta tabela nascem na 0004 (precisam dos
-- helpers de permissao); ate la a tabela fica deny-all de proposito.
-- Rollback ao fim do arquivo.

-- ---------------------------------------------------------------------------
-- Funcao compartilhada de carimbo de atualizacao.
-- SECURITY INVOKER: roda com o papel de quem fez o UPDATE — nao precisa de
-- privilegio extra e nao vira vetor de escalada.
-- ---------------------------------------------------------------------------
CREATE OR REPLACE FUNCTION public.set_atualizada_em()
RETURNS trigger
LANGUAGE plpgsql
SECURITY INVOKER
SET search_path = public
AS $$
BEGIN
  NEW.atualizada_em := now();
  RETURN NEW;
END;
$$;

COMMENT ON FUNCTION public.set_atualizada_em() IS
  'Trigger BEFORE UPDATE compartilhada: carimba atualizada_em = now(). Criada na 0002; migrations posteriores so referenciam — a 0002 e o unico lugar que pode recria-la.';

-- ---------------------------------------------------------------------------
-- Tabela empresa: linha unica por estrutura (PK + CHECK id = 1).
-- A 2a linha viola o CHECK (id <> 1) ou a PK (id = 1 repetido), inclusive para
-- service_role: constraint nao e pulada por BYPASSRLS.
-- ---------------------------------------------------------------------------
CREATE TABLE IF NOT EXISTS public.empresa (
  id smallint PRIMARY KEY DEFAULT 1 CHECK (id = 1),
  nome text NOT NULL CHECK (length(trim(nome)) > 0),
  descricao text,
  criada_em timestamptz NOT NULL DEFAULT now(),
  atualizada_em timestamptz NOT NULL DEFAULT now()
);

COMMENT ON TABLE public.empresa IS
  'dono=Lider de Dados; retencao=R12; Empresa do aluno. Linha unica por estrutura (id = 1 com CHECK). Nasce pelo seed (seed_empresa, service_role); authenticated nao tem INSERT/DELETE. Marca basica no banco = nome + descricao; logo e cores seguem no codigo (config/empresa.ts, theme.css).';
COMMENT ON COLUMN public.empresa.id IS
  'classe=nenhum; sempre 1. A constraint garante a linha unica.';
COMMENT ON COLUMN public.empresa.nome IS
  'classe=nenhum; nome da empresa, aparece no cabecalho.';
COMMENT ON COLUMN public.empresa.descricao IS
  'classe=nenhum; texto livre sobre a empresa.';
COMMENT ON COLUMN public.empresa.atualizada_em IS
  'classe=nenhum; mantida pelo trigger trg_empresa_atualizada_em. Nao setar na mao no UPDATE — o trigger sobrescreve.';

DROP TRIGGER IF EXISTS trg_empresa_atualizada_em ON public.empresa;
CREATE TRIGGER trg_empresa_atualizada_em
  BEFORE UPDATE ON public.empresa
  FOR EACH ROW EXECUTE FUNCTION public.set_atualizada_em();

-- ---------------------------------------------------------------------------
-- Seguranca: RLS ligada JA nesta migration, ANTES de existir policy.
-- Deny-all intencional: entre a 0002 e a 0004 ninguem le nada via API.
-- authenticated NAO recebe INSERT/DELETE: a empresa nasce so pelo seed
-- (service_role). anon NUNCA recebe grant — e a chave PUBLICA do projeto.
-- ---------------------------------------------------------------------------
ALTER TABLE public.empresa ENABLE ROW LEVEL SECURITY;

-- Reset dos default privileges do projeto virgem (concedem ALL, incl. TRUNCATE
-- — que NAO passa por RLS — a anon/authenticated). A 0001 fecha isso pra
-- tabelas futuras; aqui e defesa em profundidade.
REVOKE ALL ON public.empresa FROM PUBLIC, anon, authenticated;

GRANT SELECT ON public.empresa TO authenticated;
GRANT UPDATE (nome, descricao) ON public.empresa TO authenticated;
GRANT ALL ON public.empresa TO service_role;

-- Nenhuma policy aqui de proposito. empresa_select e empresa_update nascem na
-- 0004, porque dependem de public.usuario_atual() e public.tem_permissao().

-- ---------------------------------------------------------------------------
-- Smoke test. Teste de mutacao: apagar o CHECK (id = 1), um GRANT ou o ENABLE
-- RLS acima QUEBRA este bloco. A linha de teste vive num sub-bloco que se
-- desfaz por excecao proposital (SQLSTATE P0999); as flags de deteccao e o
-- RAISE de falha ficam FORA do bloco que captura (variavel plpgsql nao e
-- transacional, o INSERT sim).
-- ---------------------------------------------------------------------------
DO $$
DECLARE
  v_check_pegou boolean := false;
  v_pk_pegou boolean := false;
BEGIN
  IF to_regclass('public.empresa') IS NULL THEN
    RAISE EXCEPTION 'smoke 0002: tabela empresa nao criada — as migrations seguintes falham no seed';
  END IF;

  IF to_regprocedure('public.set_atualizada_em()') IS NULL THEN
    RAISE EXCEPTION 'smoke 0002: funcao set_atualizada_em ausente — os triggers das migrations 0003+ falham ao criar';
  END IF;

  IF NOT EXISTS (SELECT 1 FROM pg_trigger
                 WHERE tgrelid = 'public.empresa'::regclass
                   AND tgname = 'trg_empresa_atualizada_em'
                   AND NOT tgisinternal) THEN
    RAISE EXCEPTION 'smoke 0002: trigger de atualizada_em ausente — atualizada_em congela e a auditoria de mudanca mente';
  END IF;

  IF NOT (SELECT relrowsecurity FROM pg_class WHERE oid = 'public.empresa'::regclass) THEN
    RAISE EXCEPTION 'smoke 0002: RLS desligada — quando a 0004 criar as policies elas viram decoracao';
  END IF;

  IF NOT has_table_privilege('authenticated', 'public.empresa', 'SELECT') THEN
    RAISE EXCEPTION 'smoke 0002: authenticated sem SELECT — mesmo com a policy da 0004, o cabecalho renderiza VAZIO sem erro';
  END IF;

  IF NOT has_column_privilege('authenticated', 'public.empresa', 'nome', 'UPDATE') THEN
    RAISE EXCEPTION 'smoke 0002: authenticated sem UPDATE em nome — o dono nao edita a empresa mesmo com a policy da 0004';
  END IF;

  IF has_column_privilege('authenticated', 'public.empresa', 'id', 'UPDATE') THEN
    RAISE EXCEPTION 'smoke 0002: authenticated com UPDATE em id — so nome e descricao sao editaveis pela tela';
  END IF;

  IF has_table_privilege('authenticated', 'public.empresa', 'INSERT')
     OR has_table_privilege('authenticated', 'public.empresa', 'DELETE') THEN
    RAISE EXCEPTION 'smoke 0002: authenticated com INSERT/DELETE — a empresa so nasce pelo seed via service_role';
  END IF;

  IF NOT has_table_privilege('service_role', 'public.empresa', 'INSERT') THEN
    RAISE EXCEPTION 'smoke 0002: service_role sem INSERT — o seed nao consegue criar a empresa';
  END IF;

  -- anon e a chave PUBLICA do projeto: qualquer grant aqui vaza dado interno
  IF has_table_privilege('anon', 'public.empresa', 'SELECT') THEN
    RAISE EXCEPTION 'smoke 0002: anon com SELECT em empresa — chave publica lendo dado interno';
  END IF;

  -- G1: a linha unica e ESTRUTURA. Sub-bloco desfeito no fim.
  BEGIN
    INSERT INTO public.empresa (id, nome) VALUES (1, 'smoke') ON CONFLICT (id) DO NOTHING;

    BEGIN
      INSERT INTO public.empresa (id, nome) VALUES (2, 'x');
    EXCEPTION WHEN check_violation THEN
      v_check_pegou := true;
    END;

    BEGIN
      INSERT INTO public.empresa (nome) VALUES ('x');
    EXCEPTION WHEN unique_violation THEN
      v_pk_pegou := true;
    END;

    RAISE EXCEPTION 'smoke 0002: desfazendo a linha de teste' USING ERRCODE = 'P0999';
  EXCEPTION WHEN SQLSTATE 'P0999' THEN
    NULL;
  END;

  IF NOT v_check_pegou THEN
    RAISE EXCEPTION 'smoke 0002: INSERT com id = 2 foi aceito — CHECK (id = 1) sumiu e a empresa deixou de ser unica por estrutura';
  END IF;
  IF NOT v_pk_pegou THEN
    RAISE EXCEPTION 'smoke 0002: segundo INSERT com id = 1 foi aceito — PRIMARY KEY sumiu e a empresa deixou de ser unica por estrutura';
  END IF;
END $$;

-- Rollback:
--   DROP TRIGGER IF EXISTS trg_empresa_atualizada_em ON public.empresa;
--   DROP TABLE IF EXISTS public.empresa CASCADE;
--   -- ATENCAO: a funcao abaixo e compartilhada pelas migrations 0003+.
--   -- So derrubar se estiver revertendo o template inteiro.
--   DROP FUNCTION IF EXISTS public.set_atualizada_em();
