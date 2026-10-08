-- 0006_tarefas.sql
-- Tarefas da empresa: o Kanban do Empresa OS e a TRILHA do aluno (curso,
-- plano de 90 dias e trabalho do dia a dia). Cada tarefa pode ter dono humano
-- (usuarios) e/ou agente IA (agentes) e carrega o criterio de pronto — e o
-- objeto central que humanos e IA movem juntos.
-- A estrutura da trilha (trilha, fase, ordem, chave, comando, prova,
-- depende_de) e IMUTAVEL pela tela: GRANT de UPDATE so nas colunas de trabalho
-- (E3-07). A tela so cria e apaga tarefa de trilha `trabalho`.
-- Depende de: public.set_atualizada_em() (0002), usuarios (0003), helpers (0004),
-- agentes (0005). Rollback ao fim do arquivo.

CREATE TABLE IF NOT EXISTS public.tarefas (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  titulo text NOT NULL CHECK (length(trim(titulo)) > 0),
  objetivo text,
  criterio_pronto text,
  -- NOT NULL de proposito: status NULL passaria no CHECK calado e a tarefa
  -- sumiria de todo filtro por status sem erro nenhum.
  status text NOT NULL DEFAULT 'BACKLOG'
    CHECK (status IN ('BACKLOG','EM_ANDAMENTO','REVISAO','CONCLUIDA','CANCELADA')),
  origem text NOT NULL DEFAULT 'humano'
    CHECK (origem IN ('humano','ia')),
  dono_id uuid REFERENCES public.usuarios(id) ON DELETE SET NULL,
  agente_id uuid REFERENCES public.agentes(id) ON DELETE SET NULL,
  branch text,
  metadata jsonb NOT NULL DEFAULT '{}',
  criada_em timestamptz NOT NULL DEFAULT now(),
  concluida_em timestamptz,
  atualizada_em timestamptz NOT NULL DEFAULT now(),
  -- CONCLUIDA sem carimbo de quando concluiu quebraria lead time e relatorios.
  CONSTRAINT ck_tarefas_concluida_tem_data
    CHECK (status <> 'CONCLUIDA' OR concluida_em IS NOT NULL)
);

-- Trilha estruturada (E3-07): colunas novas, acrescentadas de forma idempotente.
ALTER TABLE public.tarefas
  ADD COLUMN IF NOT EXISTS trilha text NOT NULL DEFAULT 'trabalho',
  ADD COLUMN IF NOT EXISTS fase text,
  ADD COLUMN IF NOT EXISTS ordem integer,
  ADD COLUMN IF NOT EXISTS comando text,
  ADD COLUMN IF NOT EXISTS prova text,
  ADD COLUMN IF NOT EXISTS depende_de uuid REFERENCES public.tarefas(id) ON DELETE SET NULL,
  ADD COLUMN IF NOT EXISTS chave text;

DO $$
BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conrelid = 'public.tarefas'::regclass
                 AND conname = 'ck_tarefas_trilha') THEN
    ALTER TABLE public.tarefas ADD CONSTRAINT ck_tarefas_trilha
      CHECK (trilha IN ('curso','plano90','trabalho'));
  END IF;
  IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conrelid = 'public.tarefas'::regclass
                 AND conname = 'ck_tarefas_depende_de_outra') THEN
    ALTER TABLE public.tarefas ADD CONSTRAINT ck_tarefas_depende_de_outra
      CHECK (depende_de <> id);
  END IF;
  IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conrelid = 'public.tarefas'::regclass
                 AND conname = 'uq_tarefas_chave') THEN
    ALTER TABLE public.tarefas ADD CONSTRAINT uq_tarefas_chave UNIQUE (chave);
  END IF;
  IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conrelid = 'public.tarefas'::regclass
                 AND conname = 'ck_tarefas_chave_formato') THEN
    ALTER TABLE public.tarefas ADD CONSTRAINT ck_tarefas_chave_formato
      CHECK (chave ~ '^[a-z0-9]+(\.[a-z0-9-]+)+$');
  END IF;
  -- G11: fase coerente com a trilha; tarefa de trilha tem ordem e chave.
  IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conrelid = 'public.tarefas'::regclass
                 AND conname = 'ck_tarefas_fase_da_trilha') THEN
    ALTER TABLE public.tarefas ADD CONSTRAINT ck_tarefas_fase_da_trilha
      CHECK (
        (trilha = 'curso' AND fase IN ('D1','D2','D3'))
        OR (trilha = 'plano90' AND fase IN ('clareza','fundacao','ativacao','aplicacao','escala'))
        OR (trilha = 'trabalho' AND fase IS NULL)
      );
  END IF;
  IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conrelid = 'public.tarefas'::regclass
                 AND conname = 'ck_tarefas_trilha_estruturada') THEN
    ALTER TABLE public.tarefas ADD CONSTRAINT ck_tarefas_trilha_estruturada
      CHECK (trilha = 'trabalho' OR (ordem IS NOT NULL AND chave IS NOT NULL));
  END IF;
END $$;

COMMENT ON TABLE public.tarefas IS
  'dono=Integrador; retencao=R13; Kanban e trilha do aluno. status CONCLUIDA exige concluida_em (ck_tarefas_concluida_tem_data): quem move pra CONCLUIDA carimba a data no MESMO update. Trilhas curso/plano90 podem ser CANCELADAS mas nao apagadas (historico do aluno). A tela so cria e apaga tarefa de trilha `trabalho`; a estrutura da trilha so muda por service_role.';
COMMENT ON COLUMN public.tarefas.id IS
  'classe=nenhum; chave da tarefa. atividade.tarefa_id e execucoes_agente.tarefa_id apontam pra ca.';
COMMENT ON COLUMN public.tarefas.titulo IS
  'classe=nenhum; titulo curto.';
COMMENT ON COLUMN public.tarefas.objetivo IS
  'classe=nenhum; por que a tarefa existe.';
COMMENT ON COLUMN public.tarefas.criterio_pronto IS
  'classe=nenhum; como saber que acabou, em linguagem de gente.';
COMMENT ON COLUMN public.tarefas.status IS
  'classe=nenhum; as 5 colunas do Kanban: BACKLOG, EM_ANDAMENTO, REVISAO, CONCLUIDA, CANCELADA. "Bloqueada" NAO e status: e depende_de apontando pra tarefa fora de CONCLUIDA/CANCELADA, calculado no app.';
COMMENT ON COLUMN public.tarefas.origem IS
  'classe=nenhum; quem CRIOU a tarefa: humano ou ia. Nao confundir com quem executa (dono_id/agente_id).';
COMMENT ON COLUMN public.tarefas.dono_id IS
  'classe=pessoal; dono humano (usuarios.id). ON DELETE SET NULL: a tarefa sobrevive a saida do dono, fica sem dono.';
COMMENT ON COLUMN public.tarefas.agente_id IS
  'classe=nenhum; agente de IA responsavel (agentes.id). ON DELETE SET NULL.';
COMMENT ON COLUMN public.tarefas.branch IS
  'classe=nenhum; galho git quando a tarefa e trabalho tecnico. NULL em tarefa nao-tecnica.';
COMMENT ON COLUMN public.tarefas.metadata IS
  'classe=nenhum; jsonb livre pra contexto extra (links, ids externos). Nao usar como fonte de regra de negocio.';
COMMENT ON COLUMN public.tarefas.criada_em IS
  'classe=nenhum; quando nasceu.';
COMMENT ON COLUMN public.tarefas.concluida_em IS
  'classe=nenhum; carimbo de conclusao. Obrigatorio em CONCLUIDA.';
COMMENT ON COLUMN public.tarefas.atualizada_em IS
  'classe=nenhum; mantida pelo trigger trg_tarefas_atualizada_em.';
COMMENT ON COLUMN public.tarefas.trilha IS
  'classe=nenhum; curso (instalacao e curso guiado), plano90 (plano de 90 dias) ou trabalho (dia a dia). Imutavel pela tela.';
COMMENT ON COLUMN public.tarefas.fase IS
  'classe=nenhum; curso: D1, D2 ou D3; plano90: clareza, fundacao, ativacao, aplicacao ou escala; trabalho: NULL (ck_tarefas_fase_da_trilha).';
COMMENT ON COLUMN public.tarefas.ordem IS
  'classe=nenhum; posicao na trilha, com saltos de 10 (10, 20, 30) pra inserir passo no meio sem renumerar. Unica por (trilha, ordem).';
COMMENT ON COLUMN public.tarefas.comando IS
  'classe=nenhum; o que o aluno cola no chat pra fazer a tarefa.';
COMMENT ON COLUMN public.tarefas.prova IS
  'classe=nenhum; como provar que acabou.';
COMMENT ON COLUMN public.tarefas.depende_de IS
  'classe=nenhum; tarefa que precisa acabar antes. Sem trava no banco: o app calcula "bloqueada" por embed. ON DELETE SET NULL.';
COMMENT ON COLUMN public.tarefas.chave IS
  'classe=nenhum; identificador estavel e unico de tarefa de trilha, ex.: curso.d1.01-conta-github. semear_tarefas faz upsert por chave sem sobrescrever o que o aluno mexeu.';

CREATE INDEX IF NOT EXISTS idx_tarefas_status ON public.tarefas (status);
CREATE INDEX IF NOT EXISTS idx_tarefas_dono ON public.tarefas (dono_id);
CREATE INDEX IF NOT EXISTS idx_tarefas_trilha ON public.tarefas (trilha, fase, ordem);
CREATE UNIQUE INDEX IF NOT EXISTS uq_tarefas_trilha_ordem
  ON public.tarefas (trilha, ordem) WHERE ordem IS NOT NULL;

-- Trigger de atualizada_em (funcao criada na 0002).
DROP TRIGGER IF EXISTS trg_tarefas_atualizada_em ON public.tarefas;
CREATE TRIGGER trg_tarefas_atualizada_em
  BEFORE UPDATE ON public.tarefas
  FOR EACH ROW EXECUTE FUNCTION public.set_atualizada_em();

-- ============================================================
-- Seguranca: RLS + GRANTs minimos + policies
-- ============================================================

ALTER TABLE public.tarefas ENABLE ROW LEVEL SECURITY;

-- Reset dos default privileges do projeto virgem (ALL pra anon/authenticated,
-- incl. TRUNCATE que nao passa por RLS). Defesa em profundidade alem da 0001.
REVOKE ALL ON public.tarefas FROM PUBLIC, anon, authenticated;

-- G10: UPDATE POR COLUNA — a estrutura da trilha (trilha, fase, ordem, chave,
-- comando, prova, depende_de) nao e editavel pela tela. anon NUNCA recebe grant.
GRANT SELECT, INSERT, DELETE ON public.tarefas TO authenticated;
GRANT UPDATE (titulo, objetivo, criterio_pronto, status, dono_id, agente_id,
              branch, metadata, concluida_em)
  ON public.tarefas TO authenticated;
GRANT ALL ON public.tarefas TO service_role;

-- Helpers da 0004 — nunca subconsultar usuarios direto aqui (recursao de RLS).
DROP POLICY IF EXISTS tarefas_select ON public.tarefas;
CREATE POLICY tarefas_select ON public.tarefas
  FOR SELECT TO authenticated
  USING (public.tem_permissao('tarefas.read'));

-- A tela so cria tarefa de trabalho; a trilha vem do seed (semear_tarefas).
DROP POLICY IF EXISTS tarefas_insert ON public.tarefas;
CREATE POLICY tarefas_insert ON public.tarefas
  FOR INSERT TO authenticated
  WITH CHECK (public.tem_permissao('tarefas.write') AND trilha = 'trabalho');

DROP POLICY IF EXISTS tarefas_update ON public.tarefas;
CREATE POLICY tarefas_update ON public.tarefas
  FOR UPDATE TO authenticated
  USING (public.tem_permissao('tarefas.write'))
  WITH CHECK (public.tem_permissao('tarefas.write'));

-- Trilhas curso/plano90 nao se apagam (historico do aluno): so cancelar.
DROP POLICY IF EXISTS tarefas_delete ON public.tarefas;
CREATE POLICY tarefas_delete ON public.tarefas
  FOR DELETE TO authenticated
  USING (public.tem_permissao('tarefas.write') AND trilha = 'trabalho');

-- ============================================================
-- Smoke test: prova GRANT + RLS + policies + trigger + checks.
-- Apagar qualquer GRANT/policy/CHECK acima TEM que quebrar este bloco.
-- Linhas de teste vivem num sub-bloco desfeito por excecao proposital.
-- ============================================================
DO $$
DECLARE
  v_policies int;
  v_fase_pegou boolean := false;
  v_chave_pegou boolean := false;
  v_dep_pegou boolean := false;
  v_id uuid := gen_random_uuid();
BEGIN
  IF to_regclass('public.tarefas') IS NULL THEN
    RAISE EXCEPTION 'smoke 0006: tabela tarefas nao criada — nada do kanban funciona';
  END IF;

  IF NOT (SELECT relrowsecurity FROM pg_class WHERE oid = 'public.tarefas'::regclass) THEN
    RAISE EXCEPTION 'smoke 0006: RLS desligada em tarefas — qualquer usuario logado leria o kanban';
  END IF;

  IF NOT has_table_privilege('authenticated', 'public.tarefas', 'SELECT') THEN
    RAISE EXCEPTION 'smoke 0006: authenticated sem SELECT — pagina de tarefas renderiza VAZIA sem erro';
  END IF;
  IF NOT has_table_privilege('authenticated', 'public.tarefas', 'INSERT') THEN
    RAISE EXCEPTION 'smoke 0006: authenticated sem INSERT — criar tarefa falha mesmo com policy certa';
  END IF;
  IF NOT has_table_privilege('authenticated', 'public.tarefas', 'DELETE') THEN
    RAISE EXCEPTION 'smoke 0006: authenticated sem DELETE — nao consegue excluir tarefa de trabalho';
  END IF;
  IF NOT has_column_privilege('authenticated', 'public.tarefas', 'status', 'UPDATE') THEN
    RAISE EXCEPTION 'smoke 0006: authenticated sem UPDATE em status — mover card no kanban falha mesmo com policy certa';
  END IF;
  -- G10: a estrutura da trilha nao e editavel pela tela
  IF has_column_privilege('authenticated', 'public.tarefas', 'trilha', 'UPDATE')
     OR has_column_privilege('authenticated', 'public.tarefas', 'fase', 'UPDATE')
     OR has_column_privilege('authenticated', 'public.tarefas', 'ordem', 'UPDATE')
     OR has_column_privilege('authenticated', 'public.tarefas', 'chave', 'UPDATE')
     OR has_column_privilege('authenticated', 'public.tarefas', 'depende_de', 'UPDATE') THEN
    RAISE EXCEPTION 'smoke 0006: authenticated com UPDATE na estrutura da trilha — a tela poderia reordenar ou trocar a trilha';
  END IF;
  IF NOT has_table_privilege('service_role', 'public.tarefas', 'SELECT') THEN
    RAISE EXCEPTION 'smoke 0006: service_role sem acesso — scripts e a RPC de seed quebram';
  END IF;

  -- anon e chave PUBLICA: qualquer grant aqui vaza o kanban pra internet.
  IF has_table_privilege('anon', 'public.tarefas', 'SELECT') THEN
    RAISE EXCEPTION 'smoke 0006: anon tem SELECT em tarefas — kanban exposto sem login';
  END IF;

  SELECT count(*) INTO v_policies
  FROM pg_policies
  WHERE schemaname = 'public' AND tablename = 'tarefas'
    AND policyname IN ('tarefas_select', 'tarefas_insert', 'tarefas_update', 'tarefas_delete');
  IF v_policies <> 4 THEN
    RAISE EXCEPTION 'smoke 0006: esperava 4 policies em tarefas, achei % — sem elas RLS bloqueia TUDO e a pagina fica vazia', v_policies;
  END IF;

  IF NOT EXISTS (SELECT 1 FROM pg_trigger WHERE tgrelid = 'public.tarefas'::regclass
                 AND tgname = 'trg_tarefas_atualizada_em' AND NOT tgisinternal) THEN
    RAISE EXCEPTION 'smoke 0006: trigger de atualizada_em ausente — coluna congela e ordenacao por atividade recente mente';
  END IF;

  IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conrelid = 'public.tarefas'::regclass
                 AND conname = 'ck_tarefas_concluida_tem_data') THEN
    RAISE EXCEPTION 'smoke 0006: check ck_tarefas_concluida_tem_data ausente — CONCLUIDA sem data quebra lead time';
  END IF;

  -- G11 e invariantes de trilha (sub-bloco desfeito no fim)
  BEGIN
    BEGIN
      INSERT INTO public.tarefas (titulo, trilha, fase, ordem, chave)
      VALUES ('smoke fase', 'curso', 'clareza', 99990, 'smoke.fase');
    EXCEPTION WHEN check_violation THEN
      v_fase_pegou := true;
    END;
    BEGIN
      INSERT INTO public.tarefas (titulo, trilha, fase, ordem)
      VALUES ('smoke sem chave', 'curso', 'D1', 99991);
    EXCEPTION WHEN check_violation THEN
      v_chave_pegou := true;
    END;
    INSERT INTO public.tarefas (id, titulo) VALUES (v_id, 'smoke dep');
    BEGIN
      UPDATE public.tarefas SET depende_de = v_id WHERE id = v_id;
    EXCEPTION WHEN check_violation THEN
      v_dep_pegou := true;
    END;
    RAISE EXCEPTION 'smoke 0006: desfazendo as linhas de teste' USING ERRCODE = 'P0999';
  EXCEPTION WHEN SQLSTATE 'P0999' THEN
    NULL;
  END;
  IF NOT v_fase_pegou THEN
    RAISE EXCEPTION 'smoke 0006: tarefa de curso com fase clareza aceita — ck_tarefas_fase_da_trilha sumiu e a trilha mistura fases';
  END IF;
  IF NOT v_chave_pegou THEN
    RAISE EXCEPTION 'smoke 0006: tarefa de trilha sem chave aceita — ck_tarefas_trilha_estruturada sumiu e semear_tarefas nao a reencontra';
  END IF;
  IF NOT v_dep_pegou THEN
    RAISE EXCEPTION 'smoke 0006: tarefa dependendo de si mesma aceita — o app calcularia "bloqueada" em loop';
  END IF;
END $$;

-- ============================================================
-- Rollback:
--   DROP TABLE IF EXISTS public.tarefas;
--   (trigger, indices, policies e grants caem junto com a tabela;
--    a 0007 e a 0009 referenciam tarefas — rode o rollback delas antes.)
-- ============================================================
