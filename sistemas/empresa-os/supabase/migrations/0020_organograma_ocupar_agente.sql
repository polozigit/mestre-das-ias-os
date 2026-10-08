-- 0020_organograma_ocupar_agente.sql
-- O seed coloca os agentes do time nas posicoes do Time de IA do organograma (spec v2 secao 4.2).
-- A 0019 so deu SELECT ao service_role em posicao_ocupacao (escrita e da tela, com organograma.manage),
-- entao o script de setup nao tem como inserir. Em vez de abrir INSERT na tabela, uma funcao estreita:
--   organograma.ocupar_posicao_agente(p_agente_id, p_cargo_slug) -> text
-- SECURITY DEFINER, EXECUTE so do service_role. Nao sobrepoe ninguem e roda de novo sem duplicar:
--   'inserida'          ocupacao nova (em aberto, a partir de hoje) na posicao 0 do cargo
--   'ja_ocupa'          o mesmo agente ja tem ocupacao vigente (ou futura) nessa posicao
--   'ocupada_por_outro' outra pessoa/agente ocupa a posicao: nada e escrito
--   'sem_posicao'       cargo inexistente, ou sem posicao 0 (ex.: a raiz): nada e escrito
-- A funcao nao cita public.agentes: a FK fk_posicao_ocupacao_agente garante que o agente existe.
-- Depende de 0019. Rollback ao fim.

CREATE OR REPLACE FUNCTION organograma.ocupar_posicao_agente(p_agente_id uuid, p_cargo_slug text)
RETURNS text
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = ''
AS $fn$
DECLARE
  v_posicao bigint;
  v_ocupante uuid;
BEGIN
  IF p_agente_id IS NULL OR p_cargo_slug IS NULL THEN
    RAISE EXCEPTION 'organograma.ocupar_posicao_agente: agente e cargo sao obrigatorios';
  END IF;

  SELECT p.id INTO v_posicao
    FROM organograma.posicao p
    JOIN organograma.org_cargo c ON c.id = p.cargo_id
   WHERE c.slug = p_cargo_slug AND p.ordem = 0;
  IF v_posicao IS NULL THEN
    RETURN 'sem_posicao';
  END IF;

  -- ocupacao em aberto ou ainda por vencer: e o que o EXCLUDE da 0019 barraria ao inserir de hoje em diante
  SELECT o.agente_id INTO v_ocupante
    FROM organograma.posicao_ocupacao o
   WHERE o.posicao_id = v_posicao
     AND (o.vigente_ate IS NULL OR o.vigente_ate >= current_date)
   ORDER BY o.vigente_de
   LIMIT 1;
  IF FOUND THEN
    RETURN CASE WHEN v_ocupante IS NOT DISTINCT FROM p_agente_id THEN 'ja_ocupa' ELSE 'ocupada_por_outro' END;
  END IF;

  -- Duas chamadas simultaneas na mesma posicao: o EXCLUDE da 0019 barra a segunda (o erro sobe ao chamador).
  INSERT INTO organograma.posicao_ocupacao (posicao_id, agente_id) VALUES (v_posicao, p_agente_id);
  RETURN 'inserida';
END
$fn$;

COMMENT ON FUNCTION organograma.ocupar_posicao_agente(uuid, text) IS
  'Coloca um agente na posicao 0 de um cargo (so service_role, script de setup). Idempotente: devolve inserida, ja_ocupa, ocupada_por_outro ou sem_posicao; nunca sobrepoe ocupacao de outro ocupante.';
REVOKE ALL ON FUNCTION organograma.ocupar_posicao_agente(uuid, text) FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION organograma.ocupar_posicao_agente(uuid, text) TO service_role;

-- ---------------------------------------------------------------------------
-- Smoke
-- ---------------------------------------------------------------------------
DO $$
BEGIN
  IF NOT has_function_privilege('service_role', 'organograma.ocupar_posicao_agente(uuid, text)', 'EXECUTE') THEN
    RAISE EXCEPTION 'smoke 0020: service_role nao executa organograma.ocupar_posicao_agente (o setup nao consegue ocupar posicao)';
  END IF;
  IF has_function_privilege('authenticated', 'organograma.ocupar_posicao_agente(uuid, text)', 'EXECUTE')
     OR has_function_privilege('anon', 'organograma.ocupar_posicao_agente(uuid, text)', 'EXECUTE') THEN
    RAISE EXCEPTION 'smoke 0020: organograma.ocupar_posicao_agente executavel pelo app (SECURITY DEFINER aberta)';
  END IF;
END $$;

-- Rollback:
--   DROP FUNCTION organograma.ocupar_posicao_agente(uuid, text);
