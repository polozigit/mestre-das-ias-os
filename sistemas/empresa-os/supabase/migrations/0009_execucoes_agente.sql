-- 0009_execucoes_agente.sql
-- Registro de execucoes dos agentes: 1 linha no FIM de cada execucao (sem
-- estado "rodando"). Append-only ate pra service_role, no molde da atividade
-- (E3-09): quem escreve e o script do kit da IA, com a chave de servico (E3-08);
-- quem le e a tela, com execucoes.read.
-- Depende de: 0003-0006 (usuarios, helpers, agentes, tarefas). Rollback ao fim.

CREATE TABLE IF NOT EXISTS public.execucoes_agente (
  id bigint GENERATED ALWAYS AS IDENTITY PRIMARY KEY,
  agente text NOT NULL REFERENCES public.agentes(name) ON UPDATE CASCADE ON DELETE RESTRICT,
  tarefa_id uuid REFERENCES public.tarefas(id) ON DELETE SET NULL,
  iniciado_em timestamptz NOT NULL,
  terminado_em timestamptz NOT NULL CHECK (terminado_em >= iniciado_em),
  veredito text NOT NULL CHECK (veredito IN ('APROVADO','BLOQUEADO','CONCLUIDO','ERRO')),
  resumo text CHECK (resumo IS NULL OR char_length(resumo) <= 2000),
  custo_estimado_tokens integer CHECK (custo_estimado_tokens >= 0),
  registrado_em timestamptz NOT NULL DEFAULT now()
);

COMMENT ON TABLE public.execucoes_agente IS
  'dono=CAIO; retencao=R13; Registro de execucoes dos agentes, 1 linha por execucao TERMINADA. Append-only ate pra service_role (nada de UPDATE/DELETE). Veredito do auditor/QA em ingles (APPROVED/BLOCKED) e traduzido pelo script: APPROVED -> APROVADO, BLOCKED -> BLOQUEADO. W15 do fluxo (registro_execucao).';
COMMENT ON COLUMN public.execucoes_agente.id IS
  'classe=nenhum; sequencia da linha.';
COMMENT ON COLUMN public.execucoes_agente.agente IS
  'classe=nenhum; agentes.name do papel que rodou. ON DELETE RESTRICT: agente aposenta, nao apaga.';
COMMENT ON COLUMN public.execucoes_agente.tarefa_id IS
  'classe=nenhum; tarefa a que a execucao se refere, se houver. ON DELETE SET NULL.';
COMMENT ON COLUMN public.execucoes_agente.iniciado_em IS
  'classe=nenhum; quando a execucao comecou.';
COMMENT ON COLUMN public.execucoes_agente.terminado_em IS
  'classe=nenhum; quando terminou; nunca antes de iniciado_em.';
COMMENT ON COLUMN public.execucoes_agente.veredito IS
  'classe=nenhum; APROVADO, BLOQUEADO, CONCLUIDO ou ERRO.';
COMMENT ON COLUMN public.execucoes_agente.resumo IS
  'classe=nenhum; resumo de ate 2.000 caracteres: e resumo, nao despejo. Sem dado pessoal.';
COMMENT ON COLUMN public.execucoes_agente.custo_estimado_tokens IS
  'classe=nenhum; NULL = nao medido. Nunca numero de cabeca nem cota do plano (M8: sem fonte oficial de tokens por execucao).';
COMMENT ON COLUMN public.execucoes_agente.registrado_em IS
  'classe=nenhum; quando a linha entrou no banco.';

CREATE INDEX IF NOT EXISTS idx_execucoes_agente_quando
  ON public.execucoes_agente (agente, terminado_em DESC);
CREATE INDEX IF NOT EXISTS idx_execucoes_tarefa
  ON public.execucoes_agente (tarefa_id);

ALTER TABLE public.execucoes_agente ENABLE ROW LEVEL SECURITY;

-- REVOKE ALL antes, inclusive de service_role (molde da 0007): so entao o minimo.
REVOKE ALL ON public.execucoes_agente FROM PUBLIC, anon, authenticated, service_role;
GRANT SELECT ON public.execucoes_agente TO authenticated;
GRANT SELECT, INSERT ON public.execucoes_agente TO service_role;

-- Sequencia da identity: fecha o default da plataforma (GA-03); INSERT em coluna
-- identity nao precisa de USAGE na sequencia.
REVOKE ALL ON SEQUENCE public.execucoes_agente_id_seq FROM PUBLIC, anon, authenticated;

DROP POLICY IF EXISTS execucoes_select ON public.execucoes_agente;
CREATE POLICY execucoes_select ON public.execucoes_agente
  FOR SELECT TO authenticated
  USING (public.tem_permissao('execucoes.read'));

-- Sem policy de INSERT/UPDATE/DELETE pra authenticated: so a IA registra (service_role).

DO $$
DECLARE
  v_tempo_pegou boolean := false;
  v_veredito_pegou boolean := false;
  v_fk_pegou boolean := false;
BEGIN
  IF to_regclass('public.execucoes_agente') IS NULL THEN
    RAISE EXCEPTION 'smoke 0009: tabela execucoes_agente nao criada — o registro de execucoes nao existe';
  END IF;
  IF NOT (SELECT relrowsecurity FROM pg_class WHERE oid = 'public.execucoes_agente'::regclass) THEN
    RAISE EXCEPTION 'smoke 0009: RLS desligada em execucoes_agente — qualquer usuario logado leria o registro';
  END IF;
  IF NOT has_table_privilege('authenticated', 'public.execucoes_agente', 'SELECT') THEN
    RAISE EXCEPTION 'smoke 0009: authenticated sem SELECT — a tela de execucoes renderiza VAZIA sem erro';
  END IF;
  IF has_table_privilege('authenticated', 'public.execucoes_agente', 'INSERT')
     OR has_table_privilege('authenticated', 'public.execucoes_agente', 'UPDATE')
     OR has_table_privilege('authenticated', 'public.execucoes_agente', 'DELETE') THEN
    RAISE EXCEPTION 'smoke 0009: authenticated escreve em execucoes_agente — so a IA registra execucao';
  END IF;
  IF NOT has_table_privilege('service_role', 'public.execucoes_agente', 'SELECT')
     OR NOT has_table_privilege('service_role', 'public.execucoes_agente', 'INSERT') THEN
    RAISE EXCEPTION 'smoke 0009: service_role sem SELECT/INSERT — a IA nao consegue registrar execucao';
  END IF;
  -- G12: append-only ate pra service_role
  IF has_table_privilege('service_role', 'public.execucoes_agente', 'UPDATE')
     OR has_table_privilege('service_role', 'public.execucoes_agente', 'DELETE') THEN
    RAISE EXCEPTION 'smoke 0009: service_role com UPDATE/DELETE em execucoes_agente — o registro vira editavel';
  END IF;
  IF has_table_privilege('anon', 'public.execucoes_agente', 'SELECT') THEN
    RAISE EXCEPTION 'smoke 0009: anon tem SELECT em execucoes_agente — chave publica vaza o registro';
  END IF;
  IF NOT EXISTS (SELECT 1 FROM pg_policies WHERE schemaname = 'public'
                 AND tablename = 'execucoes_agente' AND policyname = 'execucoes_select'
                 AND qual LIKE '%execucoes.read%') THEN
    RAISE EXCEPTION 'smoke 0009: policy execucoes_select ausente ou sem execucoes.read';
  END IF;

  -- CHECKs e FK (sub-bloco desfeito no fim). O agente de teste existe so aqui.
  BEGIN
    INSERT INTO public.agentes (name, time, descricao_curta, descricao, sandbox, estado, estado_conferido_em)
    VALUES ('smoke-exec', 'sistema', 'Smoke', 'd', 'read-only', 'instalado', now());
    BEGIN
      INSERT INTO public.execucoes_agente (agente, iniciado_em, terminado_em, veredito)
      VALUES ('smoke-exec', now(), now() - interval '1 minute', 'CONCLUIDO');
    EXCEPTION WHEN check_violation THEN v_tempo_pegou := true; END;
    BEGIN
      INSERT INTO public.execucoes_agente (agente, iniciado_em, terminado_em, veredito)
      VALUES ('smoke-exec', now(), now(), 'TALVEZ');
    EXCEPTION WHEN check_violation THEN v_veredito_pegou := true; END;
    BEGIN
      INSERT INTO public.execucoes_agente (agente, iniciado_em, terminado_em, veredito)
      VALUES ('agente-que-nao-existe', now(), now(), 'CONCLUIDO');
    EXCEPTION WHEN foreign_key_violation THEN v_fk_pegou := true; END;
    RAISE EXCEPTION 'smoke 0009: desfazendo as linhas de teste' USING ERRCODE = 'P0999';
  EXCEPTION WHEN SQLSTATE 'P0999' THEN
    NULL;
  END;
  IF NOT v_tempo_pegou THEN
    RAISE EXCEPTION 'smoke 0009: terminado_em anterior a iniciado_em foi aceito — CHECK de tempo sumiu';
  END IF;
  IF NOT v_veredito_pegou THEN
    RAISE EXCEPTION 'smoke 0009: veredito fora da lista foi aceito — CHECK de veredito sumiu';
  END IF;
  IF NOT v_fk_pegou THEN
    RAISE EXCEPTION 'smoke 0009: agente fora do catalogo foi aceito — FK para agentes(name) sumiu';
  END IF;
END $$;

-- Rollback:
--   DROP TABLE IF EXISTS public.execucoes_agente;
