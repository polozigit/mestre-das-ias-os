-- 0016_tarefas_plano_instancia.sql
-- Planta v0.3, onda 2A (segunda parte, depende da Parte da onda 2): o modelo de plano
-- vira linhas de public.tarefas, sem estrutura paralela (ADR-020).
--   1) tarefas.plano_instancia (modelo fixado, inicio, dono, Parte de quem e o plano)
--   2) tarefas.tarefa_plano (1:1 tarefa x plano; apagar a tarefa pela tela tira do plano)
--   3) RPCs: tarefas.instanciar_plano (authenticated com tarefas.write: CRIA tarefa so de
--      etapa `trabalho`; em `curso`/`plano90` so LIGA a tarefa ja semeada, ou levanta) e
--      tarefas.instanciar_plano_servico (so service_role: cria o que faltar em qualquer
--      trilha, idempotente por modelo + Parte + inicio)
--   4) views de contrato: tarefas.v_tarefa_com_instrucao (o agente le a instrucao) e
--      tarefas.v_fila_agente (fila do agente, sem tabela nova)
-- Convencao (decisao de implementacao, 05/10/2026): a tarefa semeada de uma atividade de
-- trilha curso/plano90 tem chave `<trilha>.<fase minuscula>.<chave da atividade>`
-- (ex.: curso.d1.01-conta-github, o formato da semente do curso).
-- projeto_ref (sem FK): tarefas.projeto nao existe ainda. Rollback ao fim.

CREATE TABLE IF NOT EXISTS tarefas.plano_instancia (
  id bigint GENERATED ALWAYS AS IDENTITY PRIMARY KEY,
  modelo_id bigint NOT NULL REFERENCES tarefas.plano_modelo(id),
  inicio_em date NOT NULL,
  dono_id uuid CONSTRAINT fk_plano_instancia_dono REFERENCES public.usuarios(id) ON DELETE SET NULL,
  parte_id bigint CONSTRAINT fk_plano_instancia_parte REFERENCES public.parte(id),
  projeto_ref bigint,
  status text NOT NULL DEFAULT 'ativo' CHECK (status IN ('ativo', 'concluido', 'cancelado')),
  criada_em timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX IF NOT EXISTS idx_plano_instancia_modelo ON tarefas.plano_instancia (modelo_id);
CREATE INDEX IF NOT EXISTS idx_plano_instancia_dono ON tarefas.plano_instancia (dono_id) WHERE dono_id IS NOT NULL;
CREATE INDEX IF NOT EXISTS idx_plano_instancia_parte ON tarefas.plano_instancia (parte_id) WHERE parte_id IS NOT NULL;

COMMENT ON TABLE tarefas.plano_instancia IS
  'dono=Integrador; retencao=R13; Plano iniciado a partir de um modelo (versao fixada): integracao de colaborador, implantacao de cliente, curso do aluno. Criacao so pelas RPCs instanciar_plano e instanciar_plano_servico; publica tarefas.plano_instanciado.';
COMMENT ON COLUMN tarefas.plano_instancia.modelo_id IS 'classe=nenhum; modelo (versao) usado.';
COMMENT ON COLUMN tarefas.plano_instancia.inicio_em IS 'classe=nenhum; dia zero do plano: os prazos das atividades contam daqui.';
COMMENT ON COLUMN tarefas.plano_instancia.dono_id IS 'classe=pessoal; quem iniciou e responde pelo plano (usuarios.id). NULL = servico.';
COMMENT ON COLUMN tarefas.plano_instancia.parte_id IS 'classe=pessoal; de quem e o plano (colaborador, cliente, aluno).';
COMMENT ON COLUMN tarefas.plano_instancia.projeto_ref IS 'classe=nenhum; projeto do portfolio na implantacao de cliente (tarefas.projeto, sem FK ate o modulo completo).';
COMMENT ON COLUMN tarefas.plano_instancia.status IS 'classe=nenhum; ativo, concluido ou cancelado.';

CREATE TABLE IF NOT EXISTS tarefas.tarefa_plano (
  tarefa_id uuid PRIMARY KEY CONSTRAINT fk_tarefa_plano_tarefa REFERENCES public.tarefas(id) ON DELETE CASCADE,
  instancia_id bigint NOT NULL REFERENCES tarefas.plano_instancia(id),
  etapa_modelo_id bigint NOT NULL REFERENCES tarefas.plano_etapa_modelo(id),
  atividade_modelo_id bigint REFERENCES tarefas.plano_atividade_modelo(id),
  prazo_previsto_em date,
  prazo_original_em date
);
CREATE INDEX IF NOT EXISTS idx_tarefa_plano_instancia ON tarefas.tarefa_plano (instancia_id);
CREATE INDEX IF NOT EXISTS idx_tarefa_plano_etapa ON tarefas.tarefa_plano (etapa_modelo_id);
CREATE INDEX IF NOT EXISTS idx_tarefa_plano_atividade ON tarefas.tarefa_plano (atividade_modelo_id) WHERE atividade_modelo_id IS NOT NULL;
CREATE UNIQUE INDEX IF NOT EXISTS uq_tarefa_plano_instancia_atividade ON tarefas.tarefa_plano (instancia_id, atividade_modelo_id)
  WHERE atividade_modelo_id IS NOT NULL;

COMMENT ON TABLE tarefas.tarefa_plano IS
  'dono=Integrador; retencao=R13; Liga cada tarefa de public.tarefas ao plano de onde nasceu. Tarefa apagada pela tela (trilha trabalho) sai do plano (ON DELETE CASCADE); a instancia segue. Escrita so pelas RPCs de instanciacao.';
COMMENT ON COLUMN tarefas.tarefa_plano.tarefa_id IS 'classe=nenhum; a tarefa (public.tarefas.id). FK ao nucleo da spec v2 (ADR-013).';
COMMENT ON COLUMN tarefas.tarefa_plano.instancia_id IS 'classe=nenhum; o plano iniciado.';
COMMENT ON COLUMN tarefas.tarefa_plano.etapa_modelo_id IS 'classe=nenhum; etapa do modelo.';
COMMENT ON COLUMN tarefas.tarefa_plano.atividade_modelo_id IS 'classe=nenhum; atividade do modelo (onde estao instrucao, aula e artigo).';
COMMENT ON COLUMN tarefas.tarefa_plano.prazo_previsto_em IS 'classe=nenhum; prazo atual da tarefa no plano.';
COMMENT ON COLUMN tarefas.tarefa_plano.prazo_original_em IS 'classe=nenhum; prazo calculado na instanciacao; nunca muda (base do atraso).';

ALTER TABLE tarefas.plano_instancia ENABLE ROW LEVEL SECURITY;
ALTER TABLE tarefas.tarefa_plano ENABLE ROW LEVEL SECURITY;
REVOKE ALL ON tarefas.plano_instancia, tarefas.tarefa_plano FROM PUBLIC, anon, authenticated;
GRANT SELECT ON tarefas.plano_instancia, tarefas.tarefa_plano TO authenticated;
GRANT ALL ON tarefas.plano_instancia, tarefas.tarefa_plano TO service_role;

DROP POLICY IF EXISTS plano_instancia_select ON tarefas.plano_instancia;
CREATE POLICY plano_instancia_select ON tarefas.plano_instancia FOR SELECT TO authenticated
  USING (public.tem_permissao('tarefas.read'));
DROP POLICY IF EXISTS tarefa_plano_select ON tarefas.tarefa_plano;
CREATE POLICY tarefa_plano_select ON tarefas.tarefa_plano FOR SELECT TO authenticated
  USING (public.tem_permissao('tarefas.read'));

-- ---------------------------------------------------------------------------
-- Nucleo da instanciacao (interno: ninguem chama direto)
-- ---------------------------------------------------------------------------
CREATE OR REPLACE FUNCTION tarefas.fn_instanciar(
  p_modelo_id bigint, p_inicio date, p_parte_id bigint, p_dono uuid, p_servico boolean)
RETURNS bigint
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = ''
AS $$
DECLARE
  v_inst bigint;
  v_chave_modelo text;
  v_cal bigint;
  r record;
  v_tarefa uuid;
  v_prazo date;
  v_chave text;
  v_ordem integer;
BEGIN
  IF p_inicio IS NULL THEN
    RAISE EXCEPTION 'informe o dia de inicio do plano';
  END IF;
  SELECT m.chave INTO v_chave_modelo FROM tarefas.plano_modelo m WHERE m.id = p_modelo_id;
  IF v_chave_modelo IS NULL THEN
    RAISE EXCEPTION 'modelo de plano % nao existe', p_modelo_id;
  END IF;
  IF p_parte_id IS NOT NULL AND NOT EXISTS (SELECT 1 FROM public.parte WHERE id = p_parte_id) THEN
    RAISE EXCEPTION 'Parte % nao existe', p_parte_id;
  END IF;
  -- servico: idempotente por modelo + Parte + inicio
  IF p_servico THEN
    SELECT i.id INTO v_inst FROM tarefas.plano_instancia i
     WHERE i.modelo_id = p_modelo_id AND i.inicio_em = p_inicio AND i.parte_id IS NOT DISTINCT FROM p_parte_id
       AND i.status <> 'cancelado';
    IF v_inst IS NOT NULL THEN
      RETURN v_inst;
    END IF;
  END IF;
  SELECT c.id INTO v_cal FROM public.calendario c ORDER BY (c.rotulo = 'padrao') DESC, c.id LIMIT 1;

  INSERT INTO tarefas.plano_instancia (modelo_id, inicio_em, dono_id, parte_id)
  VALUES (p_modelo_id, p_inicio, p_dono, p_parte_id)
  RETURNING id INTO v_inst;

  FOR r IN
    SELECT e.id AS etapa_id, e.trilha, e.fase, a.id AS atividade_id, a.chave, a.titulo, a.objetivo, a.comando, a.prova,
           a.prazo_dias, a.prazo_tipo, a.duracao_estimada_min, a.agente_padrao_id
      FROM tarefas.plano_etapa_modelo e
      JOIN tarefas.plano_atividade_modelo a ON a.etapa_id = e.id
     WHERE e.modelo_id = p_modelo_id
     ORDER BY e.ordem, a.ordem
  LOOP
    v_prazo := NULL;
    IF r.prazo_dias IS NOT NULL THEN
      IF r.prazo_tipo = 'uteis' THEN
        IF v_cal IS NULL THEN
          RAISE EXCEPTION 'a atividade % tem prazo em dias uteis e nao ha calendario cadastrado', r.chave;
        END IF;
        v_prazo := public.somar_dias_uteis(v_cal, p_inicio, r.prazo_dias);
      ELSE
        v_prazo := p_inicio + r.prazo_dias;
      END IF;
    END IF;

    v_tarefa := NULL;
    IF r.trilha = 'trabalho' THEN
      v_chave := 'plano.' || v_chave_modelo || '.' || v_inst || '.' || r.chave;
      INSERT INTO public.tarefas (titulo, objetivo, criterio_pronto, comando, prova, trilha, chave, prazo,
                                  estimativa_min, origem, origem_tipo, origem_ref, dono_id, agente_id)
      VALUES (r.titulo, r.objetivo, r.prova, r.comando, r.prova, 'trabalho', v_chave, v_prazo,
              r.duracao_estimada_min, CASE WHEN p_servico THEN 'ia' ELSE 'humano' END, 'plano', v_inst::text,
              p_dono, r.agente_padrao_id)
      RETURNING id INTO v_tarefa;
    ELSE
      v_chave := r.trilha || '.' || lower(r.fase) || '.' || r.chave;
      SELECT t.id INTO v_tarefa FROM public.tarefas t WHERE t.chave = v_chave;
      IF v_tarefa IS NULL AND NOT p_servico THEN
        RAISE EXCEPTION 'a tarefa % da trilha % ainda nao foi semeada: so o servico cria tarefa de trilha', v_chave, r.trilha;
      END IF;
      IF v_tarefa IS NULL THEN
        SELECT coalesce(max(t.ordem), 0) + 10 INTO v_ordem FROM public.tarefas t WHERE t.trilha = r.trilha;
        INSERT INTO public.tarefas (titulo, objetivo, criterio_pronto, comando, prova, trilha, fase, ordem, chave,
                                    prazo, estimativa_min, origem, origem_tipo, origem_ref, agente_id)
        VALUES (r.titulo, r.objetivo, r.prova, r.comando, r.prova, r.trilha, r.fase, v_ordem, v_chave,
                v_prazo, r.duracao_estimada_min, 'ia', 'plano', v_inst::text, r.agente_padrao_id)
        RETURNING id INTO v_tarefa;
      END IF;
    END IF;

    INSERT INTO tarefas.tarefa_plano (tarefa_id, instancia_id, etapa_modelo_id, atividade_modelo_id,
                                      prazo_previsto_em, prazo_original_em)
    VALUES (v_tarefa, v_inst, r.etapa_id, r.atividade_id, v_prazo, v_prazo)
    ON CONFLICT (tarefa_id) DO NOTHING;
  END LOOP;

  -- dependencias: so entre tarefas de trabalho criadas agora (a trilha semeada ja tem as suas)
  UPDATE public.tarefas t
     SET depende_de = tdep.tarefa_id
    FROM tarefas.tarefa_plano tp
    JOIN tarefas.plano_atividade_modelo a ON a.id = tp.atividade_modelo_id
    JOIN tarefas.tarefa_plano tdep ON tdep.instancia_id = tp.instancia_id AND tdep.atividade_modelo_id = a.depende_de_id
   WHERE tp.instancia_id = v_inst AND t.id = tp.tarefa_id AND t.trilha = 'trabalho' AND t.depende_de IS NULL;

  INSERT INTO tarefas.outbox (tipo, versao, correlacao, payload)
  VALUES ('tarefas.plano_instanciado', 1, v_inst::text,
          jsonb_build_object('instancia_id', v_inst, 'modelo_id', p_modelo_id, 'parte_id', p_parte_id));
  RETURN v_inst;
END;
$$;

COMMENT ON FUNCTION tarefas.fn_instanciar(bigint, date, bigint, uuid, boolean) IS
  'Interna: instancia o modelo em linhas de public.tarefas (ADR-020; excecao GA-09 do proprio modulo, cuja tabela public.tarefas mora em public ate o ADR-012 item 12). So as duas RPCs a chamam.';
REVOKE ALL ON FUNCTION tarefas.fn_instanciar(bigint, date, bigint, uuid, boolean) FROM PUBLIC, anon, authenticated, service_role;

CREATE OR REPLACE FUNCTION tarefas.instanciar_plano(p_modelo_id bigint, p_inicio date, p_parte_id bigint DEFAULT NULL)
RETURNS bigint
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = ''
AS $$
BEGIN
  IF NOT public.tem_permissao('tarefas.write') THEN
    RAISE EXCEPTION 'iniciar plano exige tarefas.write' USING ERRCODE = '42501';
  END IF;
  RETURN tarefas.fn_instanciar(p_modelo_id, p_inicio, p_parte_id, public.usuario_atual(), false);
END;
$$;
COMMENT ON FUNCTION tarefas.instanciar_plano(bigint, date, bigint) IS
  'motivo: a tela inicia um plano (integracao, implantacao de cliente) com tarefas.write. Cria tarefa so de etapa trabalho; em curso/plano90 so liga a tarefa ja semeada e levanta excecao se faltar (nada fica pela metade).';
REVOKE ALL ON FUNCTION tarefas.instanciar_plano(bigint, date, bigint) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION tarefas.instanciar_plano(bigint, date, bigint) TO authenticated, service_role;

CREATE OR REPLACE FUNCTION tarefas.instanciar_plano_servico(p_modelo_id bigint, p_inicio date, p_parte_id bigint DEFAULT NULL)
RETURNS bigint
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = ''
AS $$
BEGIN
  RETURN tarefas.fn_instanciar(p_modelo_id, p_inicio, p_parte_id, NULL, true);
END;
$$;
COMMENT ON FUNCTION tarefas.instanciar_plano_servico(bigint, date, bigint) IS
  'So service_role (setup do aluno, consumidor de pessoas.colaborador_admitido): cria o que faltar em qualquer trilha, idempotente por modelo + Parte + inicio.';
REVOKE ALL ON FUNCTION tarefas.instanciar_plano_servico(bigint, date, bigint) FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION tarefas.instanciar_plano_servico(bigint, date, bigint) TO service_role;

-- ---------------------------------------------------------------------------
-- Views de contrato (security_invoker: valem as policies de quem le)
-- ---------------------------------------------------------------------------
CREATE OR REPLACE VIEW tarefas.v_tarefa_com_instrucao WITH (security_invoker = true) AS
  SELECT t.id AS tarefa_id, t.titulo, t.status, t.trilha, t.fase, t.prazo, t.dono_id, t.agente_id,
         tp.instancia_id, a.instrucao, a.comando, a.prova, a.aula_ref, a.artigo_ref,
         tp.prazo_previsto_em, tp.prazo_original_em
    FROM public.tarefas t
    JOIN tarefas.tarefa_plano tp ON tp.tarefa_id = t.id
    LEFT JOIN tarefas.plano_atividade_modelo a ON a.id = tp.atividade_modelo_id;
COMMENT ON VIEW tarefas.v_tarefa_com_instrucao IS
  'Contrato do agente: a tarefa com a instrucao (como fazer), o comando, a prova e o elo com a aula e o artigo. O titulo da aula vem da view de contrato do curso, nao daqui.';

CREATE OR REPLACE VIEW tarefas.v_fila_agente WITH (security_invoker = true) AS
  SELECT t.id AS tarefa_id, t.agente_id, t.titulo, t.status, t.prazo, t.estimativa_min, t.trilha, t.chave, t.criada_em
    FROM public.tarefas t
   WHERE t.agente_id IS NOT NULL AND t.status NOT IN ('CONCLUIDA', 'CANCELADA');
COMMENT ON VIEW tarefas.v_fila_agente IS
  'Contrato: fila de trabalho de cada agente (tarefas abertas com agente_id), sem tabela nova (peca 9 §4.2).';

REVOKE ALL ON tarefas.v_tarefa_com_instrucao, tarefas.v_fila_agente FROM PUBLIC, anon, authenticated;
GRANT SELECT ON tarefas.v_tarefa_com_instrucao, tarefas.v_fila_agente TO authenticated, service_role;

-- ---------------------------------------------------------------------------
-- Smoke
-- ---------------------------------------------------------------------------
DO $$
BEGIN
  IF NOT coalesce((SELECT relrowsecurity FROM pg_class WHERE oid = to_regclass('tarefas.plano_instancia')), false)
     OR NOT coalesce((SELECT relrowsecurity FROM pg_class WHERE oid = to_regclass('tarefas.tarefa_plano')), false) THEN
    RAISE EXCEPTION 'smoke 0016: plano_instancia ou tarefa_plano ausente ou sem RLS';
  END IF;
  IF has_table_privilege('authenticated', 'tarefas.tarefa_plano', 'INSERT,UPDATE,DELETE')
     OR has_table_privilege('authenticated', 'tarefas.plano_instancia', 'INSERT,UPDATE,DELETE') THEN
    RAISE EXCEPTION 'smoke 0016: authenticated escreve direto no plano — so pelas RPCs';
  END IF;
  IF has_function_privilege('authenticated', 'tarefas.instanciar_plano_servico(bigint, date, bigint)', 'EXECUTE')
     OR has_function_privilege('authenticated', 'tarefas.fn_instanciar(bigint, date, bigint, uuid, boolean)', 'EXECUTE') THEN
    RAISE EXCEPTION 'smoke 0016: authenticated executa a instanciacao de servico';
  END IF;
  IF NOT has_function_privilege('authenticated', 'tarefas.instanciar_plano(bigint, date, bigint)', 'EXECUTE') THEN
    RAISE EXCEPTION 'smoke 0016: authenticated sem EXECUTE em instanciar_plano — a tela nao inicia plano';
  END IF;
END $$;

-- Rollback:
--   DROP VIEW tarefas.v_fila_agente, tarefas.v_tarefa_com_instrucao;
--   DROP FUNCTION tarefas.instanciar_plano_servico(bigint, date, bigint), tarefas.instanciar_plano(bigint, date, bigint),
--     tarefas.fn_instanciar(bigint, date, bigint, uuid, boolean);
--   DROP TABLE tarefas.tarefa_plano, tarefas.plano_instancia;
