-- 0005_agentes.sql
-- Catalogo dos agentes de IA da empresa — alimenta a tela "Time de Agentes".
-- O `agentes.json` v4 do repositorio do aluno e a FONTE da verdade; esta tabela
-- e um ESPELHO pra interface (E3-06): authenticated so LE; a escrita e so pela
-- RPC sincronizar_agentes(jsonb) (0008, service_role), que grava o `estado`
-- CALCULADO pela conferencia do instalador. Editar aqui na mao gera drift.
-- A ultima execucao de cada agente vem de execucoes_agente (0009), nao desta tabela.
-- Depende da 0002 (set_atualizada_em) e 0004 (helpers de permissao).
-- Rollback ao fim do arquivo.

CREATE TABLE IF NOT EXISTS public.agentes (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  name text NOT NULL UNIQUE CHECK (name ~ '^[a-z0-9-]+$'),
  time text NOT NULL,
  descricao_curta text NOT NULL CHECK (char_length(descricao_curta) BETWEEN 1 AND 50),
  descricao text NOT NULL,
  quando text,
  tier text CHECK (tier IN ('terra', 'sol', 'luna')),
  modelo text,
  esforco text CHECK (esforco IN ('low', 'medium', 'high', 'xhigh')),
  sandbox text NOT NULL CHECK (sandbox IN ('read-only', 'workspace-write')),
  skills text[] NOT NULL DEFAULT '{}',
  estado text NOT NULL CHECK (estado IN ('instalado', 'disponivel', 'aposentado')),
  estado_conferido_em timestamptz NOT NULL,
  criado_em timestamptz NOT NULL DEFAULT now(),
  atualizada_em timestamptz NOT NULL DEFAULT now()
);

COMMENT ON TABLE public.agentes IS
  'dono=Lider de Dados; retencao=R12; Espelho do agentes.json v4 pra tela "Time de Agentes" (E3-06). authenticated so le (agentes.read); escrita so por sincronizar_agentes(jsonb) com service_role. Papel que some do catalogo vira `aposentado`, nunca e apagado: execucoes_agente referencia.';
COMMENT ON COLUMN public.agentes.id IS
  'classe=nenhum; chave do agente. tarefas.agente_id e atividade.agente_id apontam pra ca.';
COMMENT ON COLUMN public.agentes.name IS
  'classe=nenhum; identificador do papel ([a-z0-9-]), unico. E a chave do upsert do sync e o alvo de execucoes_agente.agente.';
COMMENT ON COLUMN public.agentes.time IS
  'classe=nenhum; time/agrupamento do agente. Agrupa os cards na tela.';
COMMENT ON COLUMN public.agentes.descricao_curta IS
  'classe=nenhum; ate 50 caracteres (D24-41c). O card mostra name + descricao_curta.';
COMMENT ON COLUMN public.agentes.descricao IS
  'classe=nenhum; o que o agente faz, em linguagem de gente. Escrito pro leitor humano, nao pro modelo.';
COMMENT ON COLUMN public.agentes.quando IS
  'classe=nenhum; quando acionar o agente. NULL = sem regra de acionamento.';
COMMENT ON COLUMN public.agentes.tier IS
  'classe=nenhum; terra, sol ou luna (catalogo v4). NULL = herda.';
COMMENT ON COLUMN public.agentes.modelo IS
  'classe=nenhum; id do modelo resolvido pelo gerador. NULL = herda da conversa.';
COMMENT ON COLUMN public.agentes.esforco IS
  'classe=nenhum; low, medium, high ou xhigh. Sem `minimal`: a API recusa no Luna (guarda G5 do catalogo).';
COMMENT ON COLUMN public.agentes.sandbox IS
  'classe=nenhum; read-only ou workspace-write.';
COMMENT ON COLUMN public.agentes.skills IS
  'classe=nenhum; nomes das habilidades que o agente usa.';
COMMENT ON COLUMN public.agentes.estado IS
  'classe=nenhum; instalado, disponivel ou aposentado. CALCULADO pela conferencia do instalador (D24-42), nunca editado na tela.';
COMMENT ON COLUMN public.agentes.estado_conferido_em IS
  'classe=nenhum; quando o instalador conferiu o estado pela ultima vez.';
COMMENT ON COLUMN public.agentes.criado_em IS
  'classe=nenhum; quando o agente entrou no catalogo.';
COMMENT ON COLUMN public.agentes.atualizada_em IS
  'classe=nenhum; mantida pelo trigger trg_agentes_atualizada_em.';

DROP TRIGGER IF EXISTS trg_agentes_atualizada_em ON public.agentes;
CREATE TRIGGER trg_agentes_atualizada_em
  BEFORE UPDATE ON public.agentes
  FOR EACH ROW EXECUTE FUNCTION public.set_atualizada_em();

-- ============================================================
-- Seguranca: RLS + GRANTs minimos + policy.
-- anon NUNCA recebe grant — e a chave PUBLICA do projeto.
-- ============================================================

ALTER TABLE public.agentes ENABLE ROW LEVEL SECURITY;

-- Reset dos default privileges do projeto virgem (ALL pra anon/authenticated,
-- incl. TRUNCATE que nao passa por RLS). Defesa em profundidade alem da 0001.
REVOKE ALL ON public.agentes FROM PUBLIC, anon, authenticated;

GRANT SELECT ON public.agentes TO authenticated;
GRANT ALL ON public.agentes TO service_role;

-- Leitura: quem tem agentes.read. Escrita: so o sync (service_role ignora RLS).
-- Helpers da 0004 — NUNCA subconsultar usuarios direto (recursao de RLS).
DROP POLICY IF EXISTS agentes_select ON public.agentes;
CREATE POLICY agentes_select ON public.agentes
  FOR SELECT TO authenticated
  USING (public.tem_permissao('agentes.read'));

-- ============================================================
-- Smoke test — cada assert diz a CONSEQUENCIA de falhar.
-- A linha de teste vive num sub-bloco desfeito por excecao proposital.
-- ============================================================

DO $$
DECLARE
  v_curta_pegou boolean := false;
  v_minimal_pegou boolean := false;
BEGIN
  IF to_regclass('public.agentes') IS NULL THEN
    RAISE EXCEPTION 'smoke 0005: tabela agentes nao criada — tela Time de Agentes quebra inteira';
  END IF;

  IF to_regprocedure('public.tem_permissao(text)') IS NULL THEN
    RAISE EXCEPTION 'smoke 0005: helpers da 0004 ausentes — rode as migrations na ordem';
  END IF;

  IF NOT (SELECT relrowsecurity FROM pg_class WHERE oid = 'public.agentes'::regclass) THEN
    RAISE EXCEPTION 'smoke 0005: RLS desligada em agentes — qualquer usuario logado leria o time';
  END IF;

  -- GRANTs: sem eles a policy nem chega a ser avaliada — pagina renderiza VAZIA sem erro.
  IF NOT has_table_privilege('authenticated', 'public.agentes', 'SELECT') THEN
    RAISE EXCEPTION 'smoke 0005: authenticated sem SELECT em agentes — pagina renderiza VAZIA sem erro';
  END IF;
  IF has_table_privilege('authenticated', 'public.agentes', 'INSERT')
     OR has_table_privilege('authenticated', 'public.agentes', 'UPDATE')
     OR has_table_privilege('authenticated', 'public.agentes', 'DELETE') THEN
    RAISE EXCEPTION 'smoke 0005: authenticated escreve em agentes — o catalogo e espelho do agentes.json, so o sync escreve';
  END IF;
  IF NOT has_table_privilege('service_role', 'public.agentes', 'INSERT')
     OR NOT has_table_privilege('service_role', 'public.agentes', 'UPDATE') THEN
    RAISE EXCEPTION 'smoke 0005: service_role sem escrita em agentes — o sync do catalogo morre calado';
  END IF;

  -- anon e a chave PUBLICA: grant aqui vaza o time de agentes pra internet.
  IF has_table_privilege('anon', 'public.agentes', 'SELECT') THEN
    RAISE EXCEPTION 'smoke 0005: anon tem SELECT em agentes — chave publica vaza o time de agentes';
  END IF;

  IF NOT EXISTS (SELECT 1 FROM pg_policies
                 WHERE schemaname = 'public' AND tablename = 'agentes'
                   AND policyname = 'agentes_select') THEN
    RAISE EXCEPTION 'smoke 0005: policy agentes_select ausente — sem policy o RLS bloqueia TUDO e a pagina fica vazia';
  END IF;

  IF NOT EXISTS (SELECT 1 FROM pg_trigger
                 WHERE tgrelid = 'public.agentes'::regclass
                   AND tgname = 'trg_agentes_atualizada_em' AND NOT tgisinternal) THEN
    RAISE EXCEPTION 'smoke 0005: trigger de atualizada_em ausente — updates ficam com timestamp velho e o sync nao detecta drift';
  END IF;

  -- CHECKs do contrato do catalogo (sub-bloco desfeito no fim)
  BEGIN
    BEGIN
      INSERT INTO public.agentes (name, time, descricao_curta, descricao, sandbox, estado, estado_conferido_em)
      VALUES ('smoke-longo', 'sistema', repeat('x', 51), 'd', 'read-only', 'instalado', now());
    EXCEPTION WHEN check_violation THEN
      v_curta_pegou := true;
    END;
    BEGIN
      INSERT INTO public.agentes (name, time, descricao_curta, descricao, esforco, sandbox, estado, estado_conferido_em)
      VALUES ('smoke-minimal', 'sistema', 'curta', 'd', 'minimal', 'read-only', 'instalado', now());
    EXCEPTION WHEN check_violation THEN
      v_minimal_pegou := true;
    END;
    RAISE EXCEPTION 'smoke 0005: desfazendo as linhas de teste' USING ERRCODE = 'P0999';
  EXCEPTION WHEN SQLSTATE 'P0999' THEN
    NULL;
  END;
  IF NOT v_curta_pegou THEN
    RAISE EXCEPTION 'smoke 0005: descricao_curta de 51 caracteres foi aceita — o card quebra o layout (D24-41c)';
  END IF;
  IF NOT v_minimal_pegou THEN
    RAISE EXCEPTION 'smoke 0005: esforco minimal foi aceito — a API recusa no Luna e o agente nao roda';
  END IF;
END $$;

-- Rollback:
--   DROP TABLE IF EXISTS public.agentes;
--   (trigger, indice e policy caem junto com a tabela; 0006/0007/0009/0011
--    referenciam agentes — reverta-as antes)
