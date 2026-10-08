-- 0011_melhorias.sql
-- Melhorias propostas ao time de agentes (retrospectiva e vigilancia). Nasce
-- `proposta`; so gente com agentes.write decide (aprovada/rejeitada); so vira
-- `aplicada` vinda de `aprovada` e COM commit — gatilho que vale para TODO papel
-- (E3-11; P9 do doc 26: proposta revisada pelo dono, nunca auto-merge).
-- Quem aplica e a IA (script, service_role) com o commit da regra.
-- Depende de: 0003-0005 (usuarios, helpers, agentes). Rollback ao fim.

CREATE TABLE IF NOT EXISTS public.melhorias (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  origem text NOT NULL CHECK (origem IN ('retrospectiva','vigilancia')),
  agente text REFERENCES public.agentes(name) ON UPDATE CASCADE ON DELETE SET NULL,
  titulo text NOT NULL,
  regra_texto text NOT NULL,
  justificativa text,
  status text NOT NULL DEFAULT 'proposta'
    CHECK (status IN ('proposta','aprovada','aplicada','rejeitada')),
  decidido_por uuid REFERENCES public.usuarios(id) ON DELETE SET NULL,
  decidido_em timestamptz,
  aplicada_em timestamptz,
  commit_sha text CHECK (commit_sha IS NULL OR commit_sha ~ '^[0-9a-f]{7,40}$'),
  criada_em timestamptz NOT NULL DEFAULT now(),
  CONSTRAINT ck_melhorias_decisao CHECK (status = 'proposta' OR decidido_em IS NOT NULL),
  CONSTRAINT ck_melhorias_aplicada
    CHECK (status <> 'aplicada' OR (aplicada_em IS NOT NULL AND commit_sha IS NOT NULL))
);

COMMENT ON TABLE public.melhorias IS
  'dono=CAIO; retencao=R13; Melhorias propostas ao time de agentes. Gatilho trg_melhorias_transicao (todo papel): INSERT so `proposta`; UPDATE so nas arestas proposta->aprovada, proposta->rejeitada, aprovada->aplicada, aprovada->rejeitada; aplicada e rejeitada sao finais.';
COMMENT ON COLUMN public.melhorias.id IS
  'classe=nenhum; chave da melhoria.';
COMMENT ON COLUMN public.melhorias.origem IS
  'classe=nenhum; retrospectiva ou vigilancia.';
COMMENT ON COLUMN public.melhorias.agente IS
  'classe=nenhum; agentes.name do papel. NULL = melhoria da Casa, nao de um papel.';
COMMENT ON COLUMN public.melhorias.titulo IS
  'classe=nenhum; titulo curto.';
COMMENT ON COLUMN public.melhorias.regra_texto IS
  'classe=nenhum; a regra proposta, em texto.';
COMMENT ON COLUMN public.melhorias.justificativa IS
  'classe=nenhum; por que a regra ajuda.';
COMMENT ON COLUMN public.melhorias.status IS
  'classe=nenhum; proposta, aprovada, aplicada ou rejeitada.';
COMMENT ON COLUMN public.melhorias.decidido_por IS
  'classe=pessoal; quem aprovou ou rejeitou (usuarios.id). ON DELETE SET NULL.';
COMMENT ON COLUMN public.melhorias.decidido_em IS
  'classe=nenhum; quando foi decidida. Obrigatorio fora de `proposta`.';
COMMENT ON COLUMN public.melhorias.aplicada_em IS
  'classe=nenhum; quando a IA aplicou. Obrigatorio em `aplicada`.';
COMMENT ON COLUMN public.melhorias.commit_sha IS
  'classe=nenhum; commit que aplicou a regra (7 a 40 hexadecimais). Obrigatorio em `aplicada`.';
COMMENT ON COLUMN public.melhorias.criada_em IS
  'classe=nenhum; quando foi proposta.';

CREATE INDEX IF NOT EXISTS idx_melhorias_status ON public.melhorias (status);

-- Gatilho de transicao: vale pra TODO papel (BYPASSRLS pula policy, nao gatilho).
CREATE OR REPLACE FUNCTION public.fn_melhorias_transicao()
RETURNS trigger
LANGUAGE plpgsql
SET search_path = public
AS $$
BEGIN
  IF TG_OP = 'INSERT' THEN
    IF NEW.status <> 'proposta' THEN
      RAISE EXCEPTION 'melhoria nasce como proposta (recebeu %)', NEW.status;
    END IF;
    RETURN NEW;
  END IF;

  -- UPDATE: so as 4 arestas permitidas.
  IF NOT (
       (OLD.status = 'proposta' AND NEW.status = 'aprovada')
    OR (OLD.status = 'proposta' AND NEW.status = 'rejeitada')
    OR (OLD.status = 'aprovada' AND NEW.status = 'aplicada')
    OR (OLD.status = 'aprovada' AND NEW.status = 'rejeitada')
  ) THEN
    RAISE EXCEPTION 'transicao de melhoria nao permitida: % -> % (aplicada e rejeitada sao finais; so se aplica o que foi aprovado)',
      OLD.status, NEW.status;
  END IF;
  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS trg_melhorias_transicao ON public.melhorias;
CREATE TRIGGER trg_melhorias_transicao
  BEFORE INSERT OR UPDATE ON public.melhorias
  FOR EACH ROW EXECUTE FUNCTION public.fn_melhorias_transicao();

ALTER TABLE public.melhorias ENABLE ROW LEVEL SECURITY;

REVOKE ALL ON public.melhorias FROM PUBLIC, anon, authenticated;
GRANT SELECT ON public.melhorias TO authenticated;
GRANT UPDATE (status, decidido_por, decidido_em) ON public.melhorias TO authenticated;
GRANT ALL ON public.melhorias TO service_role;

DROP POLICY IF EXISTS melhorias_select ON public.melhorias;
CREATE POLICY melhorias_select ON public.melhorias
  FOR SELECT TO authenticated
  USING (public.tem_permissao('agentes.read'));

DROP POLICY IF EXISTS melhorias_update ON public.melhorias;
CREATE POLICY melhorias_update ON public.melhorias
  FOR UPDATE TO authenticated
  USING (public.tem_permissao('agentes.write') AND status = 'proposta')
  WITH CHECK (public.tem_permissao('agentes.write')
              AND status IN ('aprovada','rejeitada')
              AND decidido_por = public.usuario_atual());

DO $$
DECLARE
  v_insert_pegou boolean := false;
  v_pulo_pegou boolean := false;
  v_final_pegou boolean := false;
  v_sem_commit_pegou boolean := false;
  v_id uuid := gen_random_uuid();
  v_id2 uuid := gen_random_uuid();
BEGIN
  IF to_regclass('public.melhorias') IS NULL THEN
    RAISE EXCEPTION 'smoke 0011: tabela melhorias nao criada — a tela de melhorias nao existe';
  END IF;
  IF NOT (SELECT relrowsecurity FROM pg_class WHERE oid = 'public.melhorias'::regclass) THEN
    RAISE EXCEPTION 'smoke 0011: RLS desligada em melhorias — qualquer usuario logado leria as melhorias';
  END IF;
  IF NOT has_table_privilege('authenticated', 'public.melhorias', 'SELECT') THEN
    RAISE EXCEPTION 'smoke 0011: authenticated sem SELECT — a tela de melhorias renderiza VAZIA sem erro';
  END IF;
  IF has_table_privilege('authenticated', 'public.melhorias', 'INSERT')
     OR has_table_privilege('authenticated', 'public.melhorias', 'DELETE') THEN
    RAISE EXCEPTION 'smoke 0011: authenticated com INSERT/DELETE em melhorias — so a IA propoe e nada se apaga';
  END IF;
  -- GRANT de UPDATE so em (status, decidido_por, decidido_em)
  IF NOT has_column_privilege('authenticated', 'public.melhorias', 'status', 'UPDATE')
     OR NOT has_column_privilege('authenticated', 'public.melhorias', 'decidido_por', 'UPDATE')
     OR NOT has_column_privilege('authenticated', 'public.melhorias', 'decidido_em', 'UPDATE') THEN
    RAISE EXCEPTION 'smoke 0011: authenticated sem UPDATE em status/decidido_por/decidido_em — ninguem aprova melhoria pela tela';
  END IF;
  IF has_column_privilege('authenticated', 'public.melhorias', 'commit_sha', 'UPDATE')
     OR has_column_privilege('authenticated', 'public.melhorias', 'aplicada_em', 'UPDATE')
     OR has_column_privilege('authenticated', 'public.melhorias', 'regra_texto', 'UPDATE') THEN
    RAISE EXCEPTION 'smoke 0011: authenticated com UPDATE alem de status/decidido_* — a tela poderia forjar commit ou reescrever a regra';
  END IF;
  IF has_table_privilege('anon', 'public.melhorias', 'SELECT') THEN
    RAISE EXCEPTION 'smoke 0011: anon tem SELECT em melhorias — chave publica vaza as melhorias';
  END IF;
  IF NOT EXISTS (SELECT 1 FROM pg_trigger WHERE tgrelid = 'public.melhorias'::regclass
                 AND tgname = 'trg_melhorias_transicao' AND NOT tgisinternal) THEN
    RAISE EXCEPTION 'smoke 0011: gatilho trg_melhorias_transicao ausente — qualquer papel pularia a aprovacao humana';
  END IF;

  -- G13: a regra vale pra qualquer papel, inclusive o dono deste script
  -- (postgres). Sub-bloco desfeito no fim.
  BEGIN
    BEGIN
      INSERT INTO public.melhorias (origem, titulo, regra_texto, status, decidido_em)
      VALUES ('retrospectiva', 't', 'r', 'aprovada', now());
    EXCEPTION WHEN raise_exception THEN v_insert_pegou := true; END;

    INSERT INTO public.melhorias (id, origem, titulo, regra_texto)
    VALUES (v_id, 'vigilancia', 't', 'r');
    BEGIN
      UPDATE public.melhorias
         SET status = 'aplicada', decidido_em = now(), aplicada_em = now(), commit_sha = 'abcdef1'
       WHERE id = v_id;
    EXCEPTION WHEN raise_exception THEN v_pulo_pegou := true; END;

    UPDATE public.melhorias SET status = 'aprovada', decidido_em = now() WHERE id = v_id;
    BEGIN
      UPDATE public.melhorias SET status = 'aplicada', aplicada_em = now() WHERE id = v_id;
    EXCEPTION WHEN check_violation THEN v_sem_commit_pegou := true; END;
    UPDATE public.melhorias SET status = 'aplicada', aplicada_em = now(), commit_sha = 'abcdef1'
     WHERE id = v_id;
    BEGIN
      UPDATE public.melhorias SET status = 'proposta' WHERE id = v_id;
    EXCEPTION WHEN raise_exception THEN v_final_pegou := true; END;
    RAISE EXCEPTION 'smoke 0011: desfazendo as linhas de teste' USING ERRCODE = 'P0999';
  EXCEPTION WHEN SQLSTATE 'P0999' THEN
    NULL;
  END;
  IF NOT v_insert_pegou THEN
    RAISE EXCEPTION 'smoke 0011: INSERT com status diferente de proposta foi aceito — a melhoria pularia a aprovacao';
  END IF;
  IF NOT v_pulo_pegou THEN
    RAISE EXCEPTION 'smoke 0011: UPDATE proposta -> aplicada foi aceito (como postgres) — a melhoria pularia a aprovacao humana';
  END IF;
  IF NOT v_sem_commit_pegou THEN
    RAISE EXCEPTION 'smoke 0011: aplicada sem commit_sha foi aceita — ck_melhorias_aplicada sumiu';
  END IF;
  IF NOT v_final_pegou THEN
    RAISE EXCEPTION 'smoke 0011: aplicada voltou a proposta — estado final deixou de ser final';
  END IF;

  -- FIM do conjunto base: o log do gate1 sem org_id funciona (G14). As tabelas
  -- 0009-0011 nasceram com o gate1 ligado, entao `atividade` tem >= 3 linhas
  -- de sistema "Protecao de dados ligada...". O log falha CALADO se o INSERT
  -- do gate1 estiver quebrado: so esta prova pega.
  IF (SELECT count(*) FROM public.atividade
       WHERE tipo = 'sistema' AND descricao LIKE 'Prote%ligada%') < 3 THEN
    RAISE EXCEPTION 'smoke 0011: atividade com menos de 3 linhas de sistema do gate1 — o INSERT do log do gate1 falha calado (G14)';
  END IF;
END $$;

-- Rollback:
--   DROP TABLE IF EXISTS public.melhorias;
--   DROP FUNCTION IF EXISTS public.fn_melhorias_transicao();
