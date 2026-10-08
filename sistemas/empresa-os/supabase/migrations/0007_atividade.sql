-- 0007_atividade.sql
-- Linha do tempo da empresa. O dono nao-programador so confia no sistema se
-- consegue VER o que as IAs fizeram — cada acao vira uma linha aqui, e nenhuma
-- linha pode ser editada ou apagada depois (append-only de verdade, via GRANT).
-- Sem org_id: 1 empresa por banco. Evento de sistema (dos gates) e
-- `tipo = 'sistema'` com usuario_id e agente_id nulos, escrito so por service_role.
-- Depende de: 0003 (usuarios), 0004 (helpers), 0005 (agentes), 0006 (tarefas).
-- Rollback ao fim do arquivo.

-- Preflight: as policies abaixo referenciam os helpers da 0004. Sem eles o
-- CREATE POLICY falha com erro criptico — melhor avisar em pt-BR na ordem certa.
DO $$
BEGIN
  IF to_regprocedure('public.usuario_atual()') IS NULL
     OR to_regprocedure('public.tem_permissao(text)') IS NULL THEN
    RAISE EXCEPTION '0007 depende da 0004 (helpers de permissao). Aplique as migrations na ordem.';
  END IF;
END $$;

CREATE TABLE IF NOT EXISTS public.atividade (
  id bigint GENERATED ALWAYS AS IDENTITY PRIMARY KEY,
  quando timestamptz NOT NULL DEFAULT now(),
  usuario_id uuid REFERENCES public.usuarios(id) ON DELETE SET NULL,
  agente_id uuid REFERENCES public.agentes(id) ON DELETE SET NULL,
  tipo text NOT NULL CHECK (length(trim(tipo)) > 0),
  descricao text NOT NULL CHECK (length(trim(descricao)) > 0),
  tarefa_id uuid REFERENCES public.tarefas(id) ON DELETE SET NULL,
  metadata jsonb NOT NULL DEFAULT '{}'
);

COMMENT ON TABLE public.atividade IS
  'dono=Lider de Dados; retencao=R13; Linha do tempo append-only — a confianca do dono vem de ver o que as IAs fizeram. Nunca UPDATE/DELETE (nem existe GRANT pra isso). Evento de sistema = tipo `sistema`, usuario_id e agente_id nulos, so service_role escreve. Descricao e metadata nao levam dado pessoal.';
COMMENT ON COLUMN public.atividade.id IS
  'classe=nenhum; sequencia da linha.';
COMMENT ON COLUMN public.atividade.quando IS
  'classe=nenhum; quando aconteceu.';
COMMENT ON COLUMN public.atividade.usuario_id IS
  'classe=pessoal; quem fez, quando foi humano. ON DELETE SET NULL: apagar o usuario NAO apaga a historia dele — a linha fica, anonima.';
COMMENT ON COLUMN public.atividade.agente_id IS
  'classe=nenhum; qual agente fez, quando foi IA. Linha de agente so entra por service_role.';
COMMENT ON COLUMN public.atividade.tipo IS
  'classe=nenhum; dominio aberto de proposito (ex: tarefa_criada, agente_rodou, sistema), em snake_case estavel. `sistema` e exclusivo do service_role.';
COMMENT ON COLUMN public.atividade.descricao IS
  'classe=nenhum; texto pra dono nao-programador. Sem dado pessoal.';
COMMENT ON COLUMN public.atividade.tarefa_id IS
  'classe=nenhum; tarefa a que o evento se refere. ON DELETE SET NULL.';
COMMENT ON COLUMN public.atividade.metadata IS
  'classe=nenhum; jsonb de contexto. Sem dado pessoal.';

-- Leitura tipica: "o que aconteceu, do mais recente pro mais antigo".
CREATE INDEX IF NOT EXISTS idx_atividade_quando
  ON public.atividade (quando DESC);

-- Sem trigger de atualizada_em: tabela append-only, nao existe a coluna.

-- ---------------------------------------------------------------------------
-- Seguranca: RLS + GRANTs minimos. Append-only e garantido em DUAS camadas:
-- (1) nenhum GRANT de UPDATE/DELETE, (2) nenhuma policy de UPDATE/DELETE.
-- ---------------------------------------------------------------------------
ALTER TABLE public.atividade ENABLE ROW LEVEL SECURITY;

-- Projeto Supabase virgem tem DEFAULT PRIVILEGES que concedem ALL a
-- anon/authenticated/service_role em tabela nova. Zerar antes de conceder o
-- minimo — senao o REVOKE explicito abaixo viraria decoracao.
REVOKE ALL ON public.atividade FROM PUBLIC, anon, authenticated, service_role;

GRANT SELECT, INSERT ON public.atividade TO authenticated;
GRANT SELECT, INSERT ON public.atividade TO service_role;

-- A sequencia da identity nasce com o ALTER DEFAULT PRIVILEGES da plataforma
-- (ALL pra anon/authenticated). INSERT em coluna identity nao precisa de USAGE
-- na sequencia, entao fecha: anon nunca recebe nada (GA-03).
REVOKE ALL ON SEQUENCE public.atividade_id_seq FROM PUBLIC, anon, authenticated;

-- Leitura: quem tem atividade.read (a linha do tempo mostra o que todo mundo fez).
DROP POLICY IF EXISTS atividade_select ON public.atividade;
CREATE POLICY atividade_select ON public.atividade
  FOR SELECT TO authenticated
  USING (public.tem_permissao('atividade.read'));

-- Registro em nome proprio por QUALQUER usuario ativo (E3-05): a nota de acao
-- e efeito colateral de outros modulos; exigir permissao propria daria acao
-- sem registro. SEMPRE em nome proprio: numa tabela cuja razao de existir e
-- confianca, autoria forjavel seria pior que tabela editavel. Por isso o WITH
-- CHECK exige usuario_id = usuario_atual(), proibe linha de agente e o tipo
-- 'sistema' (ambos exclusivos do service_role, que bypassa RLS).
DROP POLICY IF EXISTS atividade_insert ON public.atividade;
CREATE POLICY atividade_insert ON public.atividade
  FOR INSERT TO authenticated
  WITH CHECK (
    public.usuario_atual() IS NOT NULL
    AND usuario_id = public.usuario_atual()
    AND agente_id IS NULL
    AND tipo <> 'sistema'
  );

-- SEM policy de UPDATE/DELETE — de proposito. Nao adicionar.

-- ---------------------------------------------------------------------------
-- Smoke: prova GRANT + policy + RLS + append-only. Teste de mutacao: apagar
-- qualquer GRANT/policy/REVOKE acima TEM que quebrar um destes asserts.
-- ---------------------------------------------------------------------------
DO $$
BEGIN
  IF to_regclass('public.atividade') IS NULL THEN
    RAISE EXCEPTION 'smoke 0007: tabela atividade nao criada — a linha do tempo do painel nao existe';
  END IF;

  IF NOT (SELECT relrowsecurity FROM pg_class WHERE oid = 'public.atividade'::regclass) THEN
    RAISE EXCEPTION 'smoke 0007: RLS desligada — qualquer usuario logado leria a linha do tempo';
  END IF;

  IF NOT EXISTS (SELECT 1 FROM pg_policies
                 WHERE schemaname = 'public' AND tablename = 'atividade'
                   AND policyname = 'atividade_select') THEN
    RAISE EXCEPTION 'smoke 0007: policy atividade_select ausente — a pagina de atividade renderiza VAZIA sem erro';
  END IF;

  IF NOT EXISTS (SELECT 1 FROM pg_policies
                 WHERE schemaname = 'public' AND tablename = 'atividade'
                   AND policyname = 'atividade_insert') THEN
    RAISE EXCEPTION 'smoke 0007: policy atividade_insert ausente — nenhuma acao de usuario entra na linha do tempo';
  END IF;

  -- Autoria nao-forjavel: o WITH CHECK tem que amarrar usuario_id ao proprio
  -- usuario e vetar linha de agente/sistema via client (mutacao: afrouxar quebra).
  IF NOT EXISTS (SELECT 1 FROM pg_policies
                 WHERE schemaname = 'public' AND tablename = 'atividade'
                   AND policyname = 'atividade_insert'
                   AND with_check LIKE '%usuario_atual%'
                   AND with_check LIKE '%sistema%') THEN
    RAISE EXCEPTION 'smoke 0007: WITH CHECK do INSERT sem trava de autoria — alguem assinaria acao em nome de outro ou forjaria evento de sistema';
  END IF;

  -- Append-only exige AUSENCIA de policy de escrita destrutiva.
  IF EXISTS (SELECT 1 FROM pg_policies
             WHERE schemaname = 'public' AND tablename = 'atividade'
               AND cmd IN ('UPDATE','DELETE')) THEN
    RAISE EXCEPTION 'smoke 0007: existe policy de UPDATE/DELETE em atividade — quebra o append-only que sustenta a confianca do dono';
  END IF;

  IF NOT has_table_privilege('authenticated', 'public.atividade', 'SELECT') THEN
    RAISE EXCEPTION 'smoke 0007: authenticated sem GRANT SELECT — policy sozinha nao basta, a pagina renderiza VAZIA';
  END IF;
  IF NOT has_table_privilege('authenticated', 'public.atividade', 'INSERT') THEN
    RAISE EXCEPTION 'smoke 0007: authenticated sem GRANT INSERT — nenhuma acao de usuario e registrada';
  END IF;

  -- Prova do append-only: o REVOKE explicito tem que ter pegado, ate pra service_role.
  IF has_table_privilege('authenticated', 'public.atividade', 'UPDATE')
     OR has_table_privilege('service_role', 'public.atividade', 'UPDATE') THEN
    RAISE EXCEPTION 'smoke 0007: UPDATE concedido em atividade — a linha do tempo vira ficcao editavel';
  END IF;
  IF has_table_privilege('authenticated', 'public.atividade', 'DELETE')
     OR has_table_privilege('service_role', 'public.atividade', 'DELETE') THEN
    RAISE EXCEPTION 'smoke 0007: DELETE concedido em atividade — historico apagavel nao gera confianca nenhuma';
  END IF;

  -- anon e chave PUBLICA: linha do tempo interna jamais pode vazar por ela.
  IF has_table_privilege('anon', 'public.atividade', 'SELECT') THEN
    RAISE EXCEPTION 'smoke 0007: anon tem SELECT em atividade — a linha do tempo inteira vaza pela chave publica';
  END IF;

  IF NOT has_table_privilege('service_role', 'public.atividade', 'INSERT') THEN
    RAISE EXCEPTION 'smoke 0007: service_role sem INSERT — os gates nao conseguem registrar evento de sistema';
  END IF;

  IF NOT EXISTS (SELECT 1 FROM pg_indexes
                 WHERE schemaname = 'public' AND tablename = 'atividade'
                   AND indexname = 'idx_atividade_quando') THEN
    RAISE EXCEPTION 'smoke 0007: idx_atividade_quando ausente — a linha do tempo degrada pra seq scan conforme cresce';
  END IF;
END $$;

-- Rollback:
--   DROP POLICY IF EXISTS atividade_insert ON public.atividade;
--   DROP POLICY IF EXISTS atividade_select ON public.atividade;
--   DROP TABLE IF EXISTS public.atividade;
