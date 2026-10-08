-- 0021_whatsapp_grupo.sql
-- O WhatsApp local passou a falar com GRUPOS e a mandar midia e enquete (fase 3 do
-- motor, 06/10/2026). Mensagem enviada a um grupo entra em whatsapp_mensagem com o id
-- do grupo no lugar do telefone, e a 0018 so aceita telefone (8 a 15 digitos).
-- Esta migration ACRESCENTA, sem tocar na 0018 e sem mudar contrato do motor:
--   1) o CHECK de telefone passa a aceitar tambem o id de grupo (sem o @g.us):
--      16 a 30 digitos (grupo novo, ex.: 120363000000000000) ou <numero>-<carimbo>
--      (grupo antigo, ex.: 5511999999999-1600000000). Numero de telefone continua
--      exatamente como era (8 a 15 digitos): as duas formas nao se sobrepoem.
--   2) coluna destino_tipo ('numero' | 'grupo'), GERADA do formato do telefone: nunca
--      fica incoerente com ele e o relatorio filtra grupo sem adivinhar.
--   3) registrar_mensagem_whatsapp: MESMA assinatura da 0018 (os 8 parametros; o motor
--      antigo continua funcionando) com a validacao de p_telefone alargada. De proposito
--      NAO ganhou parametro novo: outra assinatura criaria uma segunda funcao de mesmo
--      nome, e chamar a funcao com os parametros antigos viraria "function is not
--      unique" (inclusive no re-apply da 0018 na rodada 2 do harness). O tipo do destino
--      sai do proprio formato do telefone, que e inequivoco.
-- O texto de midia, enquete e mensagem de grupo e o que o motor escolhe: a legenda ou um
-- marcador como [documento: vendas.pdf], [imagem], [audio] ou [enquete: pergunta]. O
-- arquivo em si NUNCA vai pro banco, so esse texto.
-- Depende da 0018 (tabela e RPCs). Rollback ao fim.

DO $$
BEGIN
  IF to_regclass('public.whatsapp_mensagem') IS NULL
     OR to_regprocedure('public.registrar_mensagem_whatsapp(text, text, text, text, text, text, text, timestamptz)') IS NULL
     OR to_regprocedure('public.atualizar_status_whatsapp(text, text)') IS NULL THEN
    RAISE EXCEPTION '0021 depende da 0018 (tabela whatsapp_mensagem e as duas RPCs). Aplique as migrations na ordem.';
  END IF;
END $$;

-- 1) CHECK de telefone: o da 0018 e o inline da coluna (nome automatico); sai e entra o alargado.
--    Idempotente: pode rodar de novo (rodada 2 do harness) sem erro.
ALTER TABLE public.whatsapp_mensagem DROP CONSTRAINT IF EXISTS whatsapp_mensagem_telefone_check;
ALTER TABLE public.whatsapp_mensagem DROP CONSTRAINT IF EXISTS ck_whatsapp_telefone_destino;
ALTER TABLE public.whatsapp_mensagem ADD CONSTRAINT ck_whatsapp_telefone_destino CHECK (
  telefone ~ '^[0-9]{8,15}$'
  OR telefone ~ '^([0-9]{16,30}|[0-9]{8,15}-[0-9]{5,12})$');

-- 2) destino_tipo: gerada, so leitura (nem o service_role grava nela)
ALTER TABLE public.whatsapp_mensagem ADD COLUMN IF NOT EXISTS destino_tipo text
  GENERATED ALWAYS AS (CASE WHEN telefone ~ '^[0-9]{8,15}$' THEN 'numero' ELSE 'grupo' END) STORED;

COMMENT ON COLUMN public.whatsapp_mensagem.destino_tipo IS 'classe=nenhum; numero (conversa com uma pessoa) ou grupo (mensagem em grupo do WhatsApp). Gerada a partir do formato de telefone; nao e gravada pelo motor.';
COMMENT ON COLUMN public.whatsapp_mensagem.telefone IS 'classe=pessoal; telefone do destinatario (ou remetente), so digitos com DDI, OU o id do grupo (so digitos, sem o @g.us) quando destino_tipo = grupo. Identifica uma pessoa natural (no grupo, identifica o grupo e, por ele, seus participantes).';

-- 3) RPC de escrita: mesma assinatura da 0018, p_telefone aceita tambem o id de grupo
CREATE OR REPLACE FUNCTION public.registrar_mensagem_whatsapp(
  p_wa_id text,
  p_direcao text,
  p_telefone text,
  p_texto text,
  p_origem text,
  p_status text,
  p_erro text DEFAULT NULL,
  p_ocorrida_em timestamptz DEFAULT now())
RETURNS uuid
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = pg_catalog, public
AS $$
DECLARE
  v_id uuid;
  v_ordem text[] := ARRAY['recebida', 'falhou', 'enviada', 'entregue', 'lida'];
  v_quando timestamptz := coalesce(p_ocorrida_em, now());
  v_dir_existente text;
BEGIN
  -- Validacao com mensagem clara. Nunca repete telefone nem texto na mensagem de erro
  -- (o erro vai para log do PostgREST).
  IF p_wa_id IS NULL OR length(trim(p_wa_id)) = 0 OR length(p_wa_id) > 128 THEN
    RAISE EXCEPTION 'p_wa_id invalido: informe o id da mensagem no WhatsApp (1 a 128 caracteres)' USING ERRCODE = '22023';
  END IF;
  IF p_direcao IS NULL OR p_direcao NOT IN ('enviada', 'recebida') THEN
    RAISE EXCEPTION 'p_direcao invalida: use enviada ou recebida' USING ERRCODE = '22023';
  END IF;
  IF p_telefone IS NULL OR (p_telefone !~ '^[0-9]{8,15}$' AND p_telefone !~ '^([0-9]{16,30}|[0-9]{8,15}-[0-9]{5,12})$') THEN
    RAISE EXCEPTION 'p_telefone invalido: so digitos, de 8 a 15, com DDI (ex.: 5511999999999), ou o id do grupo sem o @g.us' USING ERRCODE = '22023';
  END IF;
  IF p_texto IS NULL OR length(p_texto) = 0 OR length(p_texto) > 4096 THEN
    RAISE EXCEPTION 'p_texto invalido: de 1 a 4096 caracteres' USING ERRCODE = '22023';
  END IF;
  IF p_origem IS NULL OR p_origem NOT IN ('mcp', 'assistente', 'teste', 'relatorio', 'outro') THEN
    RAISE EXCEPTION 'p_origem invalida: use mcp, assistente, teste, relatorio ou outro' USING ERRCODE = '22023';
  END IF;
  IF p_status IS NULL OR p_status NOT IN ('enviada', 'falhou', 'recebida') THEN
    RAISE EXCEPTION 'p_status invalido: use enviada, falhou ou recebida (entregue e lida entram por atualizar_status_whatsapp)' USING ERRCODE = '22023';
  END IF;
  IF (p_direcao = 'recebida') <> (p_status = 'recebida') THEN
    RAISE EXCEPTION 'p_status incoerente com p_direcao: mensagem recebida tem status recebida e mensagem enviada nunca tem' USING ERRCODE = '22023';
  END IF;

  -- o mesmo id nao muda de direcao (seria outra mensagem com id repetido)
  SELECT m.direcao INTO v_dir_existente FROM public.whatsapp_mensagem m WHERE m.wa_id = p_wa_id;
  IF v_dir_existente IS NOT NULL AND v_dir_existente <> p_direcao THEN
    RAISE EXCEPTION 'p_wa_id ja registrado com outra direcao (%): o id da mensagem e unico', v_dir_existente USING ERRCODE = '22023';
  END IF;

  INSERT INTO public.whatsapp_mensagem AS m (wa_id, direcao, telefone, texto, origem, status, erro, ocorrida_em, status_em)
  VALUES (p_wa_id, p_direcao, p_telefone, p_texto, p_origem, p_status, left(p_erro, 1000), v_quando, v_quando)
  ON CONFLICT (wa_id) DO UPDATE
    SET -- status so avanca: reenviar o registro de uma mensagem ja entregue ou lida nao a faz voltar
        status = CASE WHEN array_position(v_ordem, EXCLUDED.status) > array_position(v_ordem, m.status)
                      THEN EXCLUDED.status ELSE m.status END,
        status_em = CASE WHEN array_position(v_ordem, EXCLUDED.status) > array_position(v_ordem, m.status)
                         THEN EXCLUDED.status_em ELSE m.status_em END,
        -- erro novo completa; erro ja gravado nao se perde
        erro = coalesce(EXCLUDED.erro, m.erro)
  RETURNING m.id INTO v_id;

  RETURN v_id;
END;
$$;

COMMENT ON FUNCTION public.registrar_mensagem_whatsapp(text, text, text, text, text, text, text, timestamptz) IS
  'Operacao fixa do motor local do WhatsApp: upsert por wa_id (contrato do PLANO.md). p_telefone aceita o telefone (8 a 15 digitos) ou o id do grupo sem @g.us (0021); destino_tipo sai do formato. Valida enums e formato com mensagem clara (SQLSTATE 22023, sem repetir telefone nem texto). Status so avanca; erro truncado em 1000 caracteres. NAO grava em atividade. EXECUTE so service_role.';
REVOKE ALL ON FUNCTION public.registrar_mensagem_whatsapp(text, text, text, text, text, text, text, timestamptz)
  FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.registrar_mensagem_whatsapp(text, text, text, text, text, text, text, timestamptz)
  TO service_role;

-- ---------------------------------------------------------------------------
-- Smoke. Roda como o dono da migration; desfaz tudo que insere (P0999).
-- ---------------------------------------------------------------------------
DO $$
DECLARE
  v_id1 uuid;
  v_id2 uuid;
  v_n int;
  v_tipo text;
  v_status text;
  v_ativ_antes bigint;
  v_ativ_depois bigint;
  v_curto_pegou boolean := false;
  v_longo_pegou boolean := false;
  v_letra_pegou boolean := false;
  v_traco_pegou boolean := false;
  v_rpc_pegou boolean := false;
  v_geradora_pegou boolean := false;
BEGIN
  IF (SELECT count(*) FROM pg_proc p JOIN pg_namespace n ON n.oid = p.pronamespace
       WHERE n.nspname = 'public' AND p.proname = 'registrar_mensagem_whatsapp') <> 1 THEN
    RAISE EXCEPTION 'smoke 0021: existe mais de uma registrar_mensagem_whatsapp — chamar com os parametros antigos viraria "function is not unique"';
  END IF;
  IF EXISTS (SELECT 1 FROM pg_constraint WHERE conrelid = 'public.whatsapp_mensagem'::regclass AND conname = 'whatsapp_mensagem_telefone_check') THEN
    RAISE EXCEPTION 'smoke 0021: o CHECK antigo de telefone (so numero) continua ativo — mensagem de grupo nao entra';
  END IF;
  IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conrelid = 'public.whatsapp_mensagem'::regclass AND conname = 'ck_whatsapp_telefone_destino') THEN
    RAISE EXCEPTION 'smoke 0021: ck_whatsapp_telefone_destino ausente';
  END IF;
  IF NOT EXISTS (SELECT 1 FROM pg_attribute WHERE attrelid = 'public.whatsapp_mensagem'::regclass AND attname = 'destino_tipo'
                   AND attgenerated = 's' AND NOT attisdropped) THEN
    RAISE EXCEPTION 'smoke 0021: destino_tipo ausente ou nao e coluna gerada';
  END IF;
  IF coalesce(col_description('public.whatsapp_mensagem'::regclass,
       (SELECT attnum FROM pg_attribute WHERE attrelid = 'public.whatsapp_mensagem'::regclass AND attname = 'destino_tipo')), '') !~ 'classe=nenhum' THEN
    RAISE EXCEPTION 'smoke 0021: destino_tipo sem COMMENT classe=';
  END IF;
  IF has_function_privilege('authenticated', 'public.registrar_mensagem_whatsapp(text, text, text, text, text, text, text, timestamptz)', 'EXECUTE')
     OR has_function_privilege('anon', 'public.registrar_mensagem_whatsapp(text, text, text, text, text, text, text, timestamptz)', 'EXECUTE')
     OR NOT has_function_privilege('service_role', 'public.registrar_mensagem_whatsapp(text, text, text, text, text, text, text, timestamptz)', 'EXECUTE') THEN
    RAISE EXCEPTION 'smoke 0021: EXECUTE de registrar_mensagem_whatsapp fora do padrao (so service_role)';
  END IF;
  IF NOT has_table_privilege('authenticated', 'public.whatsapp_mensagem', 'SELECT')
     OR has_table_privilege('authenticated', 'public.whatsapp_mensagem', 'INSERT,UPDATE,DELETE')
     OR has_table_privilege('anon', 'public.whatsapp_mensagem', 'SELECT') THEN
    RAISE EXCEPTION 'smoke 0021: grants da tabela mudaram (authenticated so le; anon nada)';
  END IF;

  SELECT count(*) INTO v_ativ_antes FROM public.atividade;
  BEGIN
    -- numero continua numero (inclusive 15 digitos) e grupo novo/antigo viram grupo
    v_id1 := public.registrar_mensagem_whatsapp('smoke0021-num', 'enviada', '5511999999999', 'oi', 'teste', 'enviada');
    SELECT destino_tipo INTO v_tipo FROM public.whatsapp_mensagem WHERE id = v_id1;
    IF v_tipo IS DISTINCT FROM 'numero' THEN RAISE EXCEPTION 'smoke 0021: telefone virou % (esperado numero)', v_tipo; END IF;
    PERFORM public.registrar_mensagem_whatsapp('smoke0021-num15', 'enviada', '551199999999999', 'oi', 'teste', 'enviada');
    SELECT destino_tipo INTO v_tipo FROM public.whatsapp_mensagem WHERE wa_id = 'smoke0021-num15';
    IF v_tipo IS DISTINCT FROM 'numero' THEN RAISE EXCEPTION 'smoke 0021: telefone de 15 digitos virou % (esperado numero)', v_tipo; END IF;

    v_id1 := public.registrar_mensagem_whatsapp('smoke0021-grupo', 'enviada', '120363000000000000', '[documento: vendas.pdf]', 'relatorio', 'enviada');
    v_id2 := public.registrar_mensagem_whatsapp('smoke0021-grupo', 'enviada', '120363000000000000', '[documento: vendas.pdf]', 'relatorio', 'enviada');
    SELECT count(*) INTO v_n FROM public.whatsapp_mensagem WHERE wa_id = 'smoke0021-grupo';
    IF v_id1 IS NULL OR v_id1 <> v_id2 OR v_n <> 1 THEN
      RAISE EXCEPTION 'smoke 0021: registrar a mesma mensagem de grupo 2x nao e upsert (% linhas)', v_n;
    END IF;
    SELECT destino_tipo INTO v_tipo FROM public.whatsapp_mensagem WHERE id = v_id1;
    IF v_tipo IS DISTINCT FROM 'grupo' THEN RAISE EXCEPTION 'smoke 0021: id de grupo novo virou % (esperado grupo)', v_tipo; END IF;
    PERFORM public.registrar_mensagem_whatsapp('smoke0021-antigo', 'enviada', '5511999999999-1600000000', '[imagem]', 'mcp', 'enviada');
    SELECT destino_tipo INTO v_tipo FROM public.whatsapp_mensagem WHERE wa_id = 'smoke0021-antigo';
    IF v_tipo IS DISTINCT FROM 'grupo' THEN RAISE EXCEPTION 'smoke 0021: id de grupo antigo virou % (esperado grupo)', v_tipo; END IF;

    -- recibo e "so avanca" valem pra mensagem de grupo
    IF NOT public.atualizar_status_whatsapp('smoke0021-grupo', 'lida') THEN
      RAISE EXCEPTION 'smoke 0021: recibo de mensagem de grupo nao achou a mensagem';
    END IF;
    PERFORM public.atualizar_status_whatsapp('smoke0021-grupo', 'entregue');
    PERFORM public.registrar_mensagem_whatsapp('smoke0021-grupo', 'enviada', '120363000000000000', '[documento: vendas.pdf]', 'relatorio', 'enviada');
    SELECT status INTO v_status FROM public.whatsapp_mensagem WHERE wa_id = 'smoke0021-grupo';
    IF v_status <> 'lida' THEN RAISE EXCEPTION 'smoke 0021: o status da mensagem de grupo regrediu para %', v_status; END IF;

    -- formato fora dos dois padroes: o CHECK pega (INSERT direto) e a RPC recusa com mensagem clara
    BEGIN
      INSERT INTO public.whatsapp_mensagem (wa_id, direcao, telefone, texto, origem, status)
      VALUES ('smoke0021-a', 'enviada', '1234567', 'x', 'mcp', 'enviada');
    EXCEPTION WHEN check_violation THEN v_curto_pegou := true; END;
    BEGIN
      INSERT INTO public.whatsapp_mensagem (wa_id, direcao, telefone, texto, origem, status)
      VALUES ('smoke0021-b', 'enviada', repeat('1', 31), 'x', 'mcp', 'enviada');
    EXCEPTION WHEN check_violation THEN v_longo_pegou := true; END;
    BEGIN
      INSERT INTO public.whatsapp_mensagem (wa_id, direcao, telefone, texto, origem, status)
      VALUES ('smoke0021-c', 'enviada', '12036300000000000a', 'x', 'mcp', 'enviada');
    EXCEPTION WHEN check_violation THEN v_letra_pegou := true; END;
    BEGIN
      INSERT INTO public.whatsapp_mensagem (wa_id, direcao, telefone, texto, origem, status)
      VALUES ('smoke0021-d', 'enviada', '5511999999999-12', 'x', 'mcp', 'enviada');
    EXCEPTION WHEN check_violation THEN v_traco_pegou := true; END;
    BEGIN
      PERFORM public.registrar_mensagem_whatsapp('smoke0021-e', 'enviada', '+55 11 99999-9999', 'x', 'mcp', 'enviada');
    EXCEPTION WHEN SQLSTATE '22023' THEN v_rpc_pegou := true; END;
    -- destino_tipo e gerada: ninguem grava nela
    BEGIN
      INSERT INTO public.whatsapp_mensagem (wa_id, direcao, telefone, texto, origem, status, destino_tipo)
      VALUES ('smoke0021-f', 'enviada', '5511999999999', 'x', 'mcp', 'enviada', 'grupo');
    EXCEPTION WHEN generated_always THEN v_geradora_pegou := true; END;

    SELECT count(*) INTO v_ativ_depois FROM public.atividade;
    IF v_ativ_depois <> v_ativ_antes THEN
      RAISE EXCEPTION 'smoke 0021: registrar mensagem de grupo gravou em atividade — polui a linha do tempo do dono';
    END IF;
    RAISE EXCEPTION 'smoke 0021: desfazendo' USING ERRCODE = 'P0999';
  EXCEPTION WHEN SQLSTATE 'P0999' THEN NULL;
  END;
  IF NOT v_curto_pegou THEN RAISE EXCEPTION 'smoke 0021: telefone de 7 digitos foi aceito'; END IF;
  IF NOT v_longo_pegou THEN RAISE EXCEPTION 'smoke 0021: id de 31 digitos foi aceito'; END IF;
  IF NOT v_letra_pegou THEN RAISE EXCEPTION 'smoke 0021: id de grupo com letra foi aceito'; END IF;
  IF NOT v_traco_pegou THEN RAISE EXCEPTION 'smoke 0021: id de grupo antigo com carimbo curto foi aceito'; END IF;
  IF NOT v_rpc_pegou THEN RAISE EXCEPTION 'smoke 0021: registrar_mensagem_whatsapp aceitou telefone com simbolo'; END IF;
  IF NOT v_geradora_pegou THEN RAISE EXCEPTION 'smoke 0021: destino_tipo aceitou gravacao direta (deveria ser gerada)'; END IF;
END $$;

-- Rollback (so depois de apagar as linhas de grupo, senao o CHECK antigo nao volta):
--   DELETE FROM public.whatsapp_mensagem WHERE destino_tipo = 'grupo';
--   ALTER TABLE public.whatsapp_mensagem DROP COLUMN destino_tipo;
--   ALTER TABLE public.whatsapp_mensagem DROP CONSTRAINT ck_whatsapp_telefone_destino;
--   ALTER TABLE public.whatsapp_mensagem ADD CONSTRAINT whatsapp_mensagem_telefone_check CHECK (telefone ~ '^[0-9]{8,15}$');
--   COMMENT ON COLUMN public.whatsapp_mensagem.telefone IS '<texto da 0018>';
--   reaplicar o CREATE OR REPLACE FUNCTION public.registrar_mensagem_whatsapp da 0018_whatsapp.sql (validacao de p_telefone so numero)
