-- 0014_tarefas_plano_modelo.sql
-- Planta v0.3, onda 2A (ADR-020): modelo de plano de implantacao como dado, em
-- `tarefas`. Recorte de 09/10: so o MODELO (plano_modelo, plano_etapa_modelo,
-- plano_atividade_modelo) e a carga por RPC; instancia, tarefa_plano e as RPCs de
-- instanciacao ficam depois (dependem da Parte, onda 2).
--   1) public.tarefas ganha tipo, prazo, projeto_ref, origem_tipo, origem_ref e
--      estimativa_min (ADR-012 item 9, ADR-017, P6): so acrescimo sobre a E3-07
--   2) schema `tarefas` (public.modulo.schema_nome), com outbox/inbox do padrao
--   3) plano_modelo versionado por hash; etapa; atividade com `instrucao` (como
--      rodar a etapa) separada de `comando` (o que colar no chat), `prazo_dias`
--      relativo ao inicio do aluno e elo com a aula (`aula_ref`, sem FK: Curso e ligavel)
--   4) RPC tarefas.carregar_modelo_plano(jsonb): so service_role, idempotente por
--      (chave, versao, hash); versao ja carregada com outro hash e recusada
-- Leitura por `tarefas.read`; ninguem da tela escreve (sem grant de escrita).
-- Depende de 0005 (agentes), 0006 (tarefas), 0012/0013 (modulo, outbox).
-- Rollback ao fim.

-- ---------------------------------------------------------------------------
-- 1) Colunas novas de public.tarefas
-- ---------------------------------------------------------------------------
ALTER TABLE public.tarefas
  ADD COLUMN IF NOT EXISTS tipo text NOT NULL DEFAULT 'acao',
  ADD COLUMN IF NOT EXISTS prazo date,
  ADD COLUMN IF NOT EXISTS projeto_ref bigint,
  ADD COLUMN IF NOT EXISTS origem_tipo text,
  ADD COLUMN IF NOT EXISTS origem_ref text,
  ADD COLUMN IF NOT EXISTS estimativa_min integer;

DO $$
BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conrelid = 'public.tarefas'::regclass
                 AND conname = 'ck_tarefas_tipo_formato') THEN
    ALTER TABLE public.tarefas ADD CONSTRAINT ck_tarefas_tipo_formato
      CHECK (tipo ~ '^[a-z][a-z0-9_]*$');
  END IF;
  IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conrelid = 'public.tarefas'::regclass
                 AND conname = 'ck_tarefas_origem_formato') THEN
    ALTER TABLE public.tarefas ADD CONSTRAINT ck_tarefas_origem_formato
      CHECK ((origem_tipo IS NULL OR origem_tipo ~ '^[a-z][a-z0-9_]*$')
             AND (origem_ref IS NULL OR origem_tipo IS NOT NULL));
  END IF;
  IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conrelid = 'public.tarefas'::regclass
                 AND conname = 'ck_tarefas_estimativa_positiva') THEN
    ALTER TABLE public.tarefas ADD CONSTRAINT ck_tarefas_estimativa_positiva
      CHECK (estimativa_min IS NULL OR estimativa_min > 0);
  END IF;
END $$;

COMMENT ON COLUMN public.tarefas.tipo IS
  'classe=nenhum; tipo da tarefa (acao, chamado, peca, roadmap...), minusculo. O catalogo tarefas.tipo_tarefa chega com o modulo completo; ate la o valor e so validado no formato (sem FK: public nao aponta para schema de modulo, GA-05).';
COMMENT ON COLUMN public.tarefas.prazo IS
  'classe=nenhum; data limite da tarefa (ADR-012 item 9). Em tarefa nascida de plano, calculada a partir do inicio do plano e do prazo_dias da atividade do modelo.';
COMMENT ON COLUMN public.tarefas.projeto_ref IS
  'classe=nenhum; projeto da tarefa (tarefas.projeto.id, bigint), referencia sem FK ate o ADR de ida de tarefas ao schema do modulo (ADR-012 item 12).';
COMMENT ON COLUMN public.tarefas.origem_tipo IS
  'classe=nenhum; de onde a tarefa veio (chat, ideia, especificacao, roadmap_item, reuniao_item...), minusculo; ADR-017: chat guarda so o link permanente em origem_ref. Definida na criacao, nao editavel pela tela.';
COMMENT ON COLUMN public.tarefas.origem_ref IS
  'classe=nenhum; id ou link da origem (sem FK, validado por evento). Exige origem_tipo.';
COMMENT ON COLUMN public.tarefas.estimativa_min IS
  'classe=nenhum; esforco estimado em minutos (P6). Base do apontamento de horas por tarefa (P3): custo de entrega e capacidade, nunca avaliacao individual nem controle de jornada.';

-- A tela edita prazo, tipo, projeto e estimativa; origem_* nasce com a tarefa e nao muda.
GRANT UPDATE (tipo, prazo, projeto_ref, estimativa_min) ON public.tarefas TO authenticated;

-- ---------------------------------------------------------------------------
-- 2) Schema do modulo + outbox/inbox
-- ---------------------------------------------------------------------------
CREATE SCHEMA IF NOT EXISTS tarefas;
COMMENT ON SCHEMA tarefas IS
  'Modulo Tarefas (dono Integrador). public.tarefas (spec v2) segue em public ate o ADR posterior (ADR-012 item 12); aqui vivem o modelo de plano e, nas ondas seguintes, projeto, portfolio, apontamento e o resto do modulo.';
REVOKE ALL ON SCHEMA tarefas FROM PUBLIC, anon;
GRANT USAGE ON SCHEMA tarefas TO authenticated, service_role;

UPDATE public.modulo SET schema_nome = 'tarefas' WHERE slug = 'tarefas' AND schema_nome IS NULL;

SELECT public.criar_outbox_inbox('tarefas');

-- ---------------------------------------------------------------------------
-- 3) Modelo de plano
-- ---------------------------------------------------------------------------
CREATE TABLE IF NOT EXISTS tarefas.plano_modelo (
  id bigint GENERATED ALWAYS AS IDENTITY PRIMARY KEY,
  chave text NOT NULL CHECK (chave ~ '^[a-z0-9][a-z0-9-]*$'),
  versao integer NOT NULL CHECK (versao >= 1),
  titulo text NOT NULL CHECK (length(trim(titulo)) > 0),
  descricao text,
  caminho_origem text NOT NULL CHECK (length(trim(caminho_origem)) > 0),
  hash text NOT NULL CHECK (hash ~ '^[0-9a-f]{64}$'),
  carregado_em timestamptz NOT NULL DEFAULT now(),
  CONSTRAINT uq_plano_modelo_chave_versao UNIQUE (chave, versao)
);

COMMENT ON TABLE tarefas.plano_modelo IS
  'dono=Integrador; retencao=R12; Modelo de plano versionado (integracao de colaborador 30/60/90, implantacao de cliente, plano de 90 dias, curso). Fonte da verdade e o arquivo do repositorio; so a RPC tarefas.carregar_modelo_plano grava, com o sha256 do arquivo. Versao carregada nao muda: mudou, vira versao nova (ADR-020).';
COMMENT ON COLUMN tarefas.plano_modelo.chave IS 'classe=nenhum; identificador do modelo, ex.: integracao-colaborador.';
COMMENT ON COLUMN tarefas.plano_modelo.versao IS 'classe=nenhum; versao do modelo; UNIQUE com a chave.';
COMMENT ON COLUMN tarefas.plano_modelo.titulo IS 'classe=nenhum; titulo do modelo em linguagem de gente.';
COMMENT ON COLUMN tarefas.plano_modelo.descricao IS 'classe=nenhum; pra que serve o plano e a quem se aplica.';
COMMENT ON COLUMN tarefas.plano_modelo.caminho_origem IS 'classe=nenhum; arquivo do repositorio de onde o modelo foi carregado (direcao unica: arquivo para banco).';
COMMENT ON COLUMN tarefas.plano_modelo.hash IS 'classe=nenhum; sha256 do arquivo carregado (64 hex minusculos). Mesma versao com outro hash e recusada.';
COMMENT ON COLUMN tarefas.plano_modelo.carregado_em IS 'classe=nenhum; quando o modelo foi carregado.';

CREATE TABLE IF NOT EXISTS tarefas.plano_etapa_modelo (
  id bigint GENERATED ALWAYS AS IDENTITY PRIMARY KEY,
  modelo_id bigint NOT NULL REFERENCES tarefas.plano_modelo(id) ON DELETE CASCADE,
  chave text NOT NULL CHECK (chave ~ '^[a-z0-9][a-z0-9-]*$'),
  ordem integer NOT NULL CHECK (ordem >= 0),
  titulo text NOT NULL CHECK (length(trim(titulo)) > 0),
  objetivo text,
  trilha text NOT NULL DEFAULT 'trabalho' CHECK (trilha IN ('curso', 'plano90', 'trabalho')),
  fase text,
  inicio_dias integer NOT NULL DEFAULT 0 CHECK (inicio_dias >= 0),
  CONSTRAINT uq_plano_etapa_chave UNIQUE (modelo_id, chave),
  CONSTRAINT uq_plano_etapa_ordem UNIQUE (modelo_id, ordem),
  -- mesmo contrato de fase da spec v2 (ck_tarefas_fase_da_trilha)
  CONSTRAINT ck_plano_etapa_fase_da_trilha CHECK (
    (trilha = 'curso' AND fase IN ('D1', 'D2', 'D3'))
    OR (trilha = 'plano90' AND fase IN ('clareza', 'fundacao', 'ativacao', 'aplicacao', 'escala'))
    OR (trilha = 'trabalho' AND fase IS NULL))
);

COMMENT ON TABLE tarefas.plano_etapa_modelo IS
  'dono=Integrador; retencao=R12; Etapa do modelo de plano. trilha e fase seguem o mesmo contrato de public.tarefas (curso: D1 a D3; plano90: 5 fases; trabalho: sem fase).';
COMMENT ON COLUMN tarefas.plano_etapa_modelo.modelo_id IS 'classe=nenhum; modelo a que a etapa pertence.';
COMMENT ON COLUMN tarefas.plano_etapa_modelo.chave IS 'classe=nenhum; identificador da etapa dentro do modelo.';
COMMENT ON COLUMN tarefas.plano_etapa_modelo.ordem IS 'classe=nenhum; posicao da etapa no modelo.';
COMMENT ON COLUMN tarefas.plano_etapa_modelo.titulo IS 'classe=nenhum; titulo da etapa.';
COMMENT ON COLUMN tarefas.plano_etapa_modelo.objetivo IS 'classe=nenhum; o que a etapa entrega.';
COMMENT ON COLUMN tarefas.plano_etapa_modelo.trilha IS 'classe=nenhum; trilha das tarefas que a etapa gera (curso, plano90 ou trabalho).';
COMMENT ON COLUMN tarefas.plano_etapa_modelo.fase IS 'classe=nenhum; fase da trilha; NULL em trabalho.';
COMMENT ON COLUMN tarefas.plano_etapa_modelo.inicio_dias IS 'classe=nenhum; dias, contados do inicio do plano de cada aluno ou colaborador, em que a etapa comeca.';

CREATE TABLE IF NOT EXISTS tarefas.plano_atividade_modelo (
  id bigint GENERATED ALWAYS AS IDENTITY PRIMARY KEY,
  etapa_id bigint NOT NULL REFERENCES tarefas.plano_etapa_modelo(id) ON DELETE CASCADE,
  chave text NOT NULL CHECK (chave ~ '^[a-z0-9][a-z0-9-]*$'),
  ordem integer NOT NULL CHECK (ordem >= 0),
  titulo text NOT NULL CHECK (length(trim(titulo)) > 0),
  objetivo text,
  instrucao text NOT NULL CHECK (length(trim(instrucao)) > 0),
  comando text,
  prova text,
  prazo_dias integer CHECK (prazo_dias IS NULL OR prazo_dias >= 0),
  prazo_tipo text NOT NULL DEFAULT 'corridos' CHECK (prazo_tipo IN ('corridos', 'uteis')),
  duracao_estimada_min integer CHECK (duracao_estimada_min IS NULL OR duracao_estimada_min > 0),
  depende_de_id bigint REFERENCES tarefas.plano_atividade_modelo(id) ON DELETE SET NULL,
  aula_ref text,
  artigo_ref text,
  executor_padrao text NOT NULL DEFAULT 'pessoa' CHECK (executor_padrao IN ('pessoa', 'agente', 'dupla')),
  agente_padrao_id uuid CONSTRAINT fk_plano_atividade_agente REFERENCES public.agentes(id) ON DELETE SET NULL,
  CONSTRAINT uq_plano_atividade_chave UNIQUE (etapa_id, chave),
  CONSTRAINT uq_plano_atividade_ordem UNIQUE (etapa_id, ordem),
  CONSTRAINT ck_plano_atividade_sem_autodependencia CHECK (depende_de_id IS NULL OR depende_de_id <> id),
  CONSTRAINT ck_plano_atividade_agente_so_se_agente CHECK (executor_padrao <> 'pessoa' OR agente_padrao_id IS NULL)
);

COMMENT ON TABLE tarefas.plano_atividade_modelo IS
  'dono=Integrador; retencao=R12; Atividade do modelo: o que vira uma tarefa de public.tarefas quando o plano e instanciado. `instrucao` e como rodar a etapa (o agente guia por ela); `comando` e o que se cola no chat; sao campos distintos. O procedimento longo mora em conhecimento (artigo_ref), nao aqui.';
COMMENT ON COLUMN tarefas.plano_atividade_modelo.etapa_id IS 'classe=nenhum; etapa a que a atividade pertence.';
COMMENT ON COLUMN tarefas.plano_atividade_modelo.chave IS 'classe=nenhum; identificador da atividade dentro da etapa.';
COMMENT ON COLUMN tarefas.plano_atividade_modelo.ordem IS 'classe=nenhum; posicao dentro da etapa.';
COMMENT ON COLUMN tarefas.plano_atividade_modelo.titulo IS 'classe=nenhum; titulo da atividade (vira o titulo da tarefa).';
COMMENT ON COLUMN tarefas.plano_atividade_modelo.objetivo IS 'classe=nenhum; por que a atividade existe.';
COMMENT ON COLUMN tarefas.plano_atividade_modelo.instrucao IS 'classe=nenhum; como rodar a atividade, em poucas linhas. Obrigatoria: e o que o agente usa pra guiar quem executa.';
COMMENT ON COLUMN tarefas.plano_atividade_modelo.comando IS 'classe=nenhum; o que o aluno cola no chat pra fazer a atividade (distinto da instrucao). NULL = atividade sem comando.';
COMMENT ON COLUMN tarefas.plano_atividade_modelo.prova IS 'classe=nenhum; como provar que acabou.';
COMMENT ON COLUMN tarefas.plano_atividade_modelo.prazo_dias IS 'classe=nenhum; prazo em dias RELATIVO ao inicio do plano de quem executa (nao data fixa). NULL = sem prazo.';
COMMENT ON COLUMN tarefas.plano_atividade_modelo.prazo_tipo IS 'classe=nenhum; corridos ou uteis (uteis le public.calendario quando existir).';
COMMENT ON COLUMN tarefas.plano_atividade_modelo.duracao_estimada_min IS 'classe=nenhum; esforco estimado em minutos; vira public.tarefas.estimativa_min (P6).';
COMMENT ON COLUMN tarefas.plano_atividade_modelo.depende_de_id IS 'classe=nenhum; atividade do MESMO modelo que precisa acabar antes (sem ciclo: gatilho trg_plano_atividade_dependencia).';
COMMENT ON COLUMN tarefas.plano_atividade_modelo.aula_ref IS 'classe=nenhum; aula do curso que a atividade pratica (curso.aula, sem FK: Curso e ligavel, ADR-015). Titulo e link vem da view de contrato do curso.';
COMMENT ON COLUMN tarefas.plano_atividade_modelo.artigo_ref IS 'classe=nenhum; artigo da base de conhecimento com o procedimento longo (conhecimento.artigo, sem FK).';
COMMENT ON COLUMN tarefas.plano_atividade_modelo.executor_padrao IS 'classe=nenhum; quem executa por padrao: pessoa, agente ou dupla.';
COMMENT ON COLUMN tarefas.plano_atividade_modelo.agente_padrao_id IS 'classe=nenhum; agente padrao (public.agentes.id) quando o executor nao e so pessoa; NULL = o agente e escolhido na instanciacao. FK ao nucleo (ADR-013).';

CREATE INDEX IF NOT EXISTS idx_plano_atividade_depende ON tarefas.plano_atividade_modelo (depende_de_id)
  WHERE depende_de_id IS NOT NULL;
CREATE INDEX IF NOT EXISTS idx_plano_atividade_agente ON tarefas.plano_atividade_modelo (agente_padrao_id)
  WHERE agente_padrao_id IS NOT NULL;

-- A dependencia fica dentro do mesmo modelo e nao forma ciclo (CHECK nao enxerga outra linha).
CREATE OR REPLACE FUNCTION tarefas.fn_plano_atividade_dependencia()
RETURNS trigger
LANGUAGE plpgsql
SET search_path = tarefas, public, pg_temp
AS $$
DECLARE
  v_modelo_a bigint;
  v_modelo_b bigint;
BEGIN
  IF NEW.depende_de_id IS NULL THEN
    RETURN NEW;
  END IF;
  SELECT e.modelo_id INTO v_modelo_a FROM tarefas.plano_etapa_modelo e WHERE e.id = NEW.etapa_id;
  SELECT e.modelo_id INTO v_modelo_b
    FROM tarefas.plano_atividade_modelo a
    JOIN tarefas.plano_etapa_modelo e ON e.id = a.etapa_id
   WHERE a.id = NEW.depende_de_id;
  IF v_modelo_b IS DISTINCT FROM v_modelo_a THEN
    RAISE EXCEPTION 'atividade % depende de atividade de outro modelo', NEW.chave;
  END IF;
  -- ciclo: seguindo depende_de a partir da dependencia, nao pode voltar a esta atividade
  IF NEW.id IS NOT NULL AND EXISTS (
    WITH RECURSIVE cadeia(id) AS (
      SELECT NEW.depende_de_id
      UNION
      SELECT a.depende_de_id FROM tarefas.plano_atividade_modelo a
        JOIN cadeia c ON a.id = c.id WHERE a.depende_de_id IS NOT NULL
    )
    SELECT 1 FROM cadeia WHERE id = NEW.id
  ) THEN
    RAISE EXCEPTION 'dependencia circular na atividade %', NEW.chave;
  END IF;
  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS trg_plano_atividade_dependencia ON tarefas.plano_atividade_modelo;
CREATE TRIGGER trg_plano_atividade_dependencia
  BEFORE INSERT OR UPDATE OF depende_de_id, etapa_id ON tarefas.plano_atividade_modelo
  FOR EACH ROW EXECUTE FUNCTION tarefas.fn_plano_atividade_dependencia();

COMMENT ON TRIGGER trg_plano_atividade_dependencia ON tarefas.plano_atividade_modelo IS
  'depende_de_id so aponta atividade do mesmo modelo e nao pode fechar ciclo.';

-- ---------------------------------------------------------------------------
-- Seguranca: RLS + grants minimos (so SELECT pra authenticated) + policy por tarefas.read
-- ---------------------------------------------------------------------------
ALTER TABLE tarefas.plano_modelo ENABLE ROW LEVEL SECURITY;
ALTER TABLE tarefas.plano_etapa_modelo ENABLE ROW LEVEL SECURITY;
ALTER TABLE tarefas.plano_atividade_modelo ENABLE ROW LEVEL SECURITY;

REVOKE ALL ON tarefas.plano_modelo, tarefas.plano_etapa_modelo, tarefas.plano_atividade_modelo
  FROM PUBLIC, anon, authenticated;
GRANT SELECT ON tarefas.plano_modelo, tarefas.plano_etapa_modelo, tarefas.plano_atividade_modelo TO authenticated;
GRANT ALL ON tarefas.plano_modelo, tarefas.plano_etapa_modelo, tarefas.plano_atividade_modelo TO service_role;

DROP POLICY IF EXISTS plano_modelo_select ON tarefas.plano_modelo;
CREATE POLICY plano_modelo_select ON tarefas.plano_modelo
  FOR SELECT TO authenticated USING (public.tem_permissao('tarefas.read'));
DROP POLICY IF EXISTS plano_etapa_modelo_select ON tarefas.plano_etapa_modelo;
CREATE POLICY plano_etapa_modelo_select ON tarefas.plano_etapa_modelo
  FOR SELECT TO authenticated USING (public.tem_permissao('tarefas.read'));
DROP POLICY IF EXISTS plano_atividade_modelo_select ON tarefas.plano_atividade_modelo;
CREATE POLICY plano_atividade_modelo_select ON tarefas.plano_atividade_modelo
  FOR SELECT TO authenticated USING (public.tem_permissao('tarefas.read'));

-- ---------------------------------------------------------------------------
-- 4) RPC de carga: arquivo -> banco, uma direcao so
--    Entrada: {chave, versao, titulo, descricao, caminho_origem, hash,
--              etapas: [{chave, ordem, titulo, objetivo, trilha, fase, inicio_dias,
--                        atividades: [{chave, ordem, titulo, objetivo, instrucao, comando, prova,
--                                      prazo_dias, prazo_tipo, duracao_estimada_min,
--                                      depende_de (chave de atividade do modelo), aula_ref,
--                                      artigo_ref, executor_padrao, agente_padrao (public.agentes.name)}]}]}
--    Devolve o id do modelo. Mesma (chave, versao, hash): devolve o existente sem mexer.
--    Mesma (chave, versao) com outro hash: excecao (versao carregada nao muda).
-- ---------------------------------------------------------------------------
CREATE OR REPLACE FUNCTION tarefas.carregar_modelo_plano(p_modelo jsonb)
RETURNS bigint
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = tarefas, public, pg_temp
AS $$
DECLARE
  v_id bigint;
  v_hash_atual text;
  v_etapa jsonb;
  v_ativ jsonb;
  v_etapa_id bigint;
  v_ativ_id bigint;
  v_agente uuid;
  v_dep_ids bigint[] := '{}';
  v_dep_chaves text[] := '{}';
  v_i int;
BEGIN
  IF p_modelo IS NULL OR jsonb_typeof(p_modelo) <> 'object' THEN
    RAISE EXCEPTION 'modelo de plano deve ser um objeto JSON';
  END IF;
  IF jsonb_typeof(p_modelo->'etapas') IS DISTINCT FROM 'array' OR jsonb_array_length(p_modelo->'etapas') = 0 THEN
    RAISE EXCEPTION 'modelo % sem etapas', p_modelo->>'chave';
  END IF;

  SELECT m.id, m.hash INTO v_id, v_hash_atual
    FROM tarefas.plano_modelo m
   WHERE m.chave = p_modelo->>'chave' AND m.versao = (p_modelo->>'versao')::integer;
  IF FOUND THEN
    IF v_hash_atual = p_modelo->>'hash' THEN
      RETURN v_id;  -- ja carregado, identico: idempotente
    END IF;
    RAISE EXCEPTION 'modelo % versao % ja foi carregado com outro conteudo (hash diferente): publique uma versao nova',
      p_modelo->>'chave', p_modelo->>'versao';
  END IF;

  INSERT INTO tarefas.plano_modelo (chave, versao, titulo, descricao, caminho_origem, hash)
  VALUES (p_modelo->>'chave', (p_modelo->>'versao')::integer, p_modelo->>'titulo',
          p_modelo->>'descricao', p_modelo->>'caminho_origem', p_modelo->>'hash')
  RETURNING id INTO v_id;

  FOR v_etapa IN SELECT * FROM jsonb_array_elements(p_modelo->'etapas') LOOP
    INSERT INTO tarefas.plano_etapa_modelo (modelo_id, chave, ordem, titulo, objetivo, trilha, fase, inicio_dias)
    VALUES (v_id, v_etapa->>'chave', (v_etapa->>'ordem')::integer, v_etapa->>'titulo', v_etapa->>'objetivo',
            coalesce(v_etapa->>'trilha', 'trabalho'), v_etapa->>'fase', coalesce((v_etapa->>'inicio_dias')::integer, 0))
    RETURNING id INTO v_etapa_id;

    FOR v_ativ IN SELECT * FROM jsonb_array_elements(coalesce(v_etapa->'atividades', '[]'::jsonb)) LOOP
      v_agente := NULL;
      IF v_ativ->>'agente_padrao' IS NOT NULL THEN
        SELECT a.id INTO v_agente FROM public.agentes a WHERE a.name = v_ativ->>'agente_padrao';
        IF v_agente IS NULL THEN
          RAISE EXCEPTION 'agente % da atividade % nao existe em public.agentes', v_ativ->>'agente_padrao', v_ativ->>'chave';
        END IF;
      END IF;
      INSERT INTO tarefas.plano_atividade_modelo
        (etapa_id, chave, ordem, titulo, objetivo, instrucao, comando, prova, prazo_dias, prazo_tipo,
         duracao_estimada_min, aula_ref, artigo_ref, executor_padrao, agente_padrao_id)
      VALUES (v_etapa_id, v_ativ->>'chave', (v_ativ->>'ordem')::integer, v_ativ->>'titulo', v_ativ->>'objetivo',
              v_ativ->>'instrucao', v_ativ->>'comando', v_ativ->>'prova', (v_ativ->>'prazo_dias')::integer,
              coalesce(v_ativ->>'prazo_tipo', 'corridos'), (v_ativ->>'duracao_estimada_min')::integer,
              v_ativ->>'aula_ref', v_ativ->>'artigo_ref', coalesce(v_ativ->>'executor_padrao', 'pessoa'), v_agente)
      RETURNING id INTO v_ativ_id;
      IF v_ativ->>'depende_de' IS NOT NULL THEN
        v_dep_ids := v_dep_ids || v_ativ_id;
        v_dep_chaves := v_dep_chaves || (v_ativ->>'depende_de');
      END IF;
    END LOOP;
  END LOOP;

  -- Dependencias por chave, depois que todas as atividades existem (o gatilho confere modelo e ciclo)
  FOR v_i IN 1..coalesce(array_length(v_dep_ids, 1), 0) LOOP
    UPDATE tarefas.plano_atividade_modelo a
       SET depende_de_id = (SELECT x.id FROM tarefas.plano_atividade_modelo x
                              JOIN tarefas.plano_etapa_modelo e ON e.id = x.etapa_id
                             WHERE e.modelo_id = v_id AND x.chave = v_dep_chaves[v_i])
     WHERE a.id = v_dep_ids[v_i];
    IF (SELECT depende_de_id FROM tarefas.plano_atividade_modelo WHERE id = v_dep_ids[v_i]) IS NULL THEN
      RAISE EXCEPTION 'atividade depende de % que nao existe no modelo %', v_dep_chaves[v_i], p_modelo->>'chave';
    END IF;
  END LOOP;

  RETURN v_id;
END;
$$;

COMMENT ON FUNCTION tarefas.carregar_modelo_plano(jsonb) IS
  'Carga do modelo de plano (arquivo do repositorio -> banco), so service_role (script da IA). Idempotente por (chave, versao, hash); versao ja carregada com outro hash levanta excecao. Transacional: ou carrega tudo ou nada. Nao cria tarefa: a instanciacao e outra RPC (onda seguinte).';

REVOKE ALL ON FUNCTION tarefas.carregar_modelo_plano(jsonb) FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION tarefas.carregar_modelo_plano(jsonb) TO service_role;
REVOKE ALL ON FUNCTION tarefas.fn_plano_atividade_dependencia() FROM PUBLIC, anon, authenticated, service_role;

-- ---------------------------------------------------------------------------
-- Smoke
-- ---------------------------------------------------------------------------
DO $$
DECLARE
  v_id bigint;
  v_estim_pegou boolean := false;
  v_origem_pegou boolean := false;
  v_ciclo_pegou boolean := false;
  v_hash_pegou boolean := false;
  v_modelo jsonb := jsonb_build_object(
    'chave', 'smoke-modelo', 'versao', 1, 'titulo', 'smoke', 'caminho_origem', 'smoke.json',
    'hash', repeat('a', 64),
    'etapas', jsonb_build_array(jsonb_build_object('chave', 'e1', 'ordem', 1, 'titulo', 'Etapa', 'atividades',
      jsonb_build_array(
        jsonb_build_object('chave', 'a1', 'ordem', 1, 'titulo', 'A1', 'instrucao', 'faca a1'),
        jsonb_build_object('chave', 'a2', 'ordem', 2, 'titulo', 'A2', 'instrucao', 'faca a2', 'depende_de', 'a1')))));
BEGIN
  IF (SELECT count(*) FROM pg_attribute WHERE attrelid = 'public.tarefas'::regclass AND NOT attisdropped
        AND attname IN ('tipo', 'prazo', 'projeto_ref', 'origem_tipo', 'origem_ref', 'estimativa_min')) <> 6 THEN
    RAISE EXCEPTION 'smoke 0014: public.tarefas sem as 6 colunas novas';
  END IF;
  IF NOT has_column_privilege('authenticated', 'public.tarefas', 'estimativa_min', 'UPDATE')
     OR NOT has_column_privilege('authenticated', 'public.tarefas', 'prazo', 'UPDATE') THEN
    RAISE EXCEPTION 'smoke 0014: authenticated sem UPDATE em prazo/estimativa_min — a tela nao edita';
  END IF;
  IF has_column_privilege('authenticated', 'public.tarefas', 'origem_tipo', 'UPDATE') THEN
    RAISE EXCEPTION 'smoke 0014: authenticated edita origem_tipo — a origem nasce com a tarefa';
  END IF;
  IF NOT EXISTS (SELECT 1 FROM public.modulo WHERE slug = 'tarefas' AND schema_nome = 'tarefas') THEN
    RAISE EXCEPTION 'smoke 0014: public.modulo(tarefas) sem schema_nome — os gates nao cobrem o schema';
  END IF;
  IF EXISTS (SELECT 1 FROM unnest(ARRAY['plano_modelo', 'plano_etapa_modelo', 'plano_atividade_modelo', 'outbox', 'inbox']) t
              WHERE NOT coalesce((SELECT relrowsecurity FROM pg_class WHERE oid = to_regclass('tarefas.' || t)), false)) THEN
    RAISE EXCEPTION 'smoke 0014: tabela de tarefas ausente ou sem RLS';
  END IF;
  IF NOT has_table_privilege('authenticated', 'tarefas.plano_atividade_modelo', 'SELECT') THEN
    RAISE EXCEPTION 'smoke 0014: authenticated sem SELECT no modelo — a tela renderiza VAZIA sem erro';
  END IF;
  IF has_table_privilege('authenticated', 'tarefas.plano_atividade_modelo', 'INSERT,UPDATE,DELETE')
     OR has_table_privilege('anon', 'tarefas.plano_modelo', 'SELECT') THEN
    RAISE EXCEPTION 'smoke 0014: escrita de authenticated ou leitura de anon no modelo';
  END IF;
  IF has_function_privilege('authenticated', 'tarefas.carregar_modelo_plano(jsonb)', 'EXECUTE') THEN
    RAISE EXCEPTION 'smoke 0014: authenticated carrega modelo — so o servico carrega';
  END IF;

  -- CHECKs de public.tarefas pegam o dado ruim (linhas desfeitas)
  BEGIN
    BEGIN
      INSERT INTO public.tarefas (titulo, estimativa_min) VALUES ('_smoke', 0);
    EXCEPTION WHEN check_violation THEN v_estim_pegou := true; END;
    BEGIN
      INSERT INTO public.tarefas (titulo, origem_ref) VALUES ('_smoke', 'x');
    EXCEPTION WHEN check_violation THEN v_origem_pegou := true; END;
    RAISE EXCEPTION 'smoke 0014: desfazendo' USING ERRCODE = 'P0999';
  EXCEPTION WHEN SQLSTATE 'P0999' THEN NULL;
  END;
  IF NOT v_estim_pegou THEN RAISE EXCEPTION 'smoke 0014: estimativa_min = 0 foi aceita'; END IF;
  IF NOT v_origem_pegou THEN RAISE EXCEPTION 'smoke 0014: origem_ref sem origem_tipo foi aceita'; END IF;

  -- Carga: modelo, idempotencia, hash diferente, ciclo (tudo desfeito)
  BEGIN
    v_id := tarefas.carregar_modelo_plano(v_modelo);
    IF tarefas.carregar_modelo_plano(v_modelo) <> v_id THEN
      RAISE EXCEPTION 'smoke 0014: recarga do mesmo modelo nao e idempotente';
    END IF;
    IF (SELECT count(*) FROM tarefas.plano_atividade_modelo a JOIN tarefas.plano_etapa_modelo e ON e.id = a.etapa_id
         WHERE e.modelo_id = v_id) <> 2 THEN
      RAISE EXCEPTION 'smoke 0014: carga nao criou as 2 atividades';
    END IF;
    IF (SELECT a2.depende_de_id FROM tarefas.plano_atividade_modelo a2 JOIN tarefas.plano_etapa_modelo e ON e.id = a2.etapa_id
         WHERE e.modelo_id = v_id AND a2.chave = 'a2') IS NULL THEN
      RAISE EXCEPTION 'smoke 0014: depende_de por chave nao foi resolvido';
    END IF;
    BEGIN
      PERFORM tarefas.carregar_modelo_plano(v_modelo || jsonb_build_object('hash', repeat('b', 64)));
    EXCEPTION WHEN OTHERS THEN v_hash_pegou := true; END;
    BEGIN
      UPDATE tarefas.plano_atividade_modelo SET depende_de_id = (SELECT id FROM tarefas.plano_atividade_modelo WHERE chave = 'a2'
                                                                  AND etapa_id IN (SELECT id FROM tarefas.plano_etapa_modelo WHERE modelo_id = v_id))
       WHERE chave = 'a1' AND etapa_id IN (SELECT id FROM tarefas.plano_etapa_modelo WHERE modelo_id = v_id);
    EXCEPTION WHEN OTHERS THEN v_ciclo_pegou := true; END;
    RAISE EXCEPTION 'smoke 0014: desfazendo' USING ERRCODE = 'P0999';
  EXCEPTION WHEN SQLSTATE 'P0999' THEN NULL;
  END;
  IF NOT v_hash_pegou THEN RAISE EXCEPTION 'smoke 0014: versao ja carregada aceitou outro hash'; END IF;
  IF NOT v_ciclo_pegou THEN RAISE EXCEPTION 'smoke 0014: dependencia circular foi aceita — trg_plano_atividade_dependencia sumiu'; END IF;
END $$;

-- Rollback:
--   DROP SCHEMA tarefas CASCADE;   -- derruba modelo, outbox e inbox
--   UPDATE public.modulo SET schema_nome = NULL WHERE slug = 'tarefas';
--   ALTER TABLE public.tarefas DROP COLUMN IF EXISTS estimativa_min, DROP COLUMN IF EXISTS origem_ref,
--     DROP COLUMN IF EXISTS origem_tipo, DROP COLUMN IF EXISTS projeto_ref, DROP COLUMN IF EXISTS prazo,
--     DROP COLUMN IF EXISTS tipo;
