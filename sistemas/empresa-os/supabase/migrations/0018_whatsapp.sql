-- 0018_whatsapp.sql
-- Registro das mensagens do WhatsApp local do aluno (motor local sem Docker,
-- decisao do Polozi de 06/10/2026: o que o Postgres do motor antigo guardava de
-- registro de mensagem passa a morar no Supabase do proprio aluno).
--   1) modulo `whatsapp` (Canal WhatsApp) e slugs whatsapp.read / .manage: JA
--      EXISTEM desde a 0013 (ligavel, desligado de partida, pai mensageria, sem
--      schema; o teste 005 e o smoke da 0013 exigem esse estado). Esta migration
--      NAO mexe na linha do modulo: so confere que ela existe. Quem quer ler a
--      tabela liga o modulo (public.ligar_modulo('whatsapp', true)) e concede
--      whatsapp.read. Escrita nunca passa pela tela.
--   2) public.whatsapp_mensagem: uma linha por mensagem (wa_id unico). Guarda o
--      telefone e o texto (dado pessoal; texto pode ser sensivel). So o motor
--      local escreve, pelas duas RPCs abaixo, com a chave de servico.
--   3) public.registrar_mensagem_whatsapp(...): upsert por wa_id; status so avanca
--   4) public.atualizar_status_whatsapp(wa_id, status): recibo de entrega e leitura;
--      status so avanca (enviada < entregue < lida), nunca regride
-- Contrato fixo com o motor (PLANO.md, "Contrato T1 <-> T2"): nomes, parametros e
-- retornos abaixo sao chamados por POST /rest/v1/rpc/<nome> com a chave de servico.
-- Atividade: de proposito NAO grava nada em public.atividade. Toda mensagem la
-- afogaria a linha do tempo do dono (ela existe pra "o que as IAs fizeram", nao
-- pra log de mensageria) e a regra da tabela e "sem dado pessoal"; o relatorio de
-- mensagens sai desta tabela, com ocorrida_em desc.
-- Depende de 0002 (set_atualizada_em), 0004 (tem_permissao), 0012/0013 (modulo e
-- slugs do whatsapp). Rollback ao fim.

DO $$
BEGIN
  IF to_regprocedure('public.tem_permissao(text)') IS NULL
     OR to_regprocedure('public.set_atualizada_em()') IS NULL THEN
    RAISE EXCEPTION '0018 depende da 0002 e da 0004 (carimbo e helpers de permissao). Aplique as migrations na ordem.';
  END IF;
  IF NOT EXISTS (SELECT 1 FROM public.modulo WHERE slug = 'whatsapp')
     OR (SELECT count(*) FROM public.permissoes WHERE slug IN ('whatsapp.read', 'whatsapp.manage')) <> 2 THEN
    RAISE EXCEPTION '0018 depende da 0013: o modulo whatsapp e os slugs whatsapp.read/whatsapp.manage nao existem. Aplique as migrations na ordem.';
  END IF;
END $$;

CREATE TABLE IF NOT EXISTS public.whatsapp_mensagem (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  wa_id text NOT NULL CONSTRAINT uq_whatsapp_mensagem_wa_id UNIQUE
    CHECK (length(trim(wa_id)) > 0 AND length(wa_id) <= 128),
  direcao text NOT NULL CHECK (direcao IN ('enviada', 'recebida')),
  telefone text NOT NULL CHECK (telefone ~ '^[0-9]{8,15}$'),
  texto text NOT NULL CHECK (length(texto) BETWEEN 1 AND 4096),
  origem text NOT NULL CHECK (origem IN ('mcp', 'assistente', 'teste', 'relatorio', 'outro')),
  status text NOT NULL CHECK (status IN ('enviada', 'falhou', 'recebida', 'entregue', 'lida')),
  erro text CHECK (erro IS NULL OR length(erro) <= 1000),
  ocorrida_em timestamptz NOT NULL DEFAULT now(),
  status_em timestamptz NOT NULL DEFAULT now(),
  criada_em timestamptz NOT NULL DEFAULT now(),
  atualizada_em timestamptz NOT NULL DEFAULT now(),
  -- recebida so tem o status recebida; enviada nunca tem o status recebida
  CONSTRAINT ck_whatsapp_direcao_status CHECK (
    (direcao = 'recebida' AND status = 'recebida')
    OR (direcao = 'enviada' AND status <> 'recebida'))
);
CREATE INDEX IF NOT EXISTS idx_whatsapp_mensagem_ocorrida
  ON public.whatsapp_mensagem (ocorrida_em DESC);

COMMENT ON TABLE public.whatsapp_mensagem IS
  'dono=CRO; retencao=R05; Registro das mensagens do WhatsApp local do aluno (motor Baileys): copia nossa de conversa de WhatsApp, linha da regra R05 (provisoria, sem prazo lido: nao descarta). v1 so grava mensagem ENVIADA pelo motor e os recibos dela; recebida de terceiro NAO entra (decisao do Polozi, 06/10/2026). Escrita so por public.registrar_mensagem_whatsapp e public.atualizar_status_whatsapp (service_role); leitura por whatsapp.read. Nada disto vai para a linha do tempo (atividade).';
COMMENT ON COLUMN public.whatsapp_mensagem.id IS 'classe=nenhum; identificador da linha.';
COMMENT ON COLUMN public.whatsapp_mensagem.wa_id IS 'classe=nenhum; id da mensagem no WhatsApp (chave de dedup do upsert). Identificador tecnico da mensagem, sem o numero nem o conteudo.';
COMMENT ON COLUMN public.whatsapp_mensagem.direcao IS 'classe=nenhum; enviada (pelo motor local) ou recebida.';
COMMENT ON COLUMN public.whatsapp_mensagem.telefone IS 'classe=pessoal; telefone do destinatario (ou remetente), so digitos com DDI. Identifica uma pessoa natural.';
COMMENT ON COLUMN public.whatsapp_mensagem.texto IS 'classe=sensivel; texto da mensagem, ate 4096 caracteres. Campo livre: quem escreve pode citar saude, religiao ou dado de crianca, entao trata-se como sensivel.';
COMMENT ON COLUMN public.whatsapp_mensagem.origem IS 'classe=nenhum; quem pediu o envio: mcp, assistente, teste, relatorio ou outro.';
COMMENT ON COLUMN public.whatsapp_mensagem.status IS 'classe=nenhum; enviada, falhou, recebida, entregue ou lida. So avanca: falhou < enviada < entregue < lida (a funcao nao deixa regredir).';
COMMENT ON COLUMN public.whatsapp_mensagem.erro IS 'classe=pessoal; motivo da falha de envio, ate 1000 caracteres. Mensagem de erro da biblioteca pode citar o numero do destinatario.';
COMMENT ON COLUMN public.whatsapp_mensagem.ocorrida_em IS 'classe=nenhum; quando a mensagem foi enviada ou recebida (hora do motor).';
COMMENT ON COLUMN public.whatsapp_mensagem.status_em IS 'classe=nenhum; quando o status mudou pela ultima vez.';
COMMENT ON COLUMN public.whatsapp_mensagem.criada_em IS 'classe=nenhum; quando a linha foi criada.';
COMMENT ON COLUMN public.whatsapp_mensagem.atualizada_em IS 'classe=nenhum; ultima alteracao da linha (carimbo automatico).';

DROP TRIGGER IF EXISTS trg_whatsapp_mensagem_atualizada_em ON public.whatsapp_mensagem;
CREATE TRIGGER trg_whatsapp_mensagem_atualizada_em BEFORE UPDATE ON public.whatsapp_mensagem
  FOR EACH ROW EXECUTE FUNCTION public.set_atualizada_em();

ALTER TABLE public.whatsapp_mensagem ENABLE ROW LEVEL SECURITY;
REVOKE ALL ON public.whatsapp_mensagem FROM PUBLIC, anon, authenticated;
GRANT SELECT ON public.whatsapp_mensagem TO authenticated;
GRANT ALL ON public.whatsapp_mensagem TO service_role;

DROP POLICY IF EXISTS whatsapp_mensagem_select ON public.whatsapp_mensagem;
CREATE POLICY whatsapp_mensagem_select ON public.whatsapp_mensagem FOR SELECT TO authenticated
  USING (public.tem_permissao('whatsapp.read'));
-- SEM policy de escrita pra authenticated, de proposito: quem escreve e o motor local,
-- pelas RPCs, com a chave de servico (que ignora RLS).

-- ---------------------------------------------------------------------------
-- RPC de escrita (so service_role: o motor local). Chamar via PostgREST:
-- POST /rest/v1/rpc/registrar_mensagem_whatsapp com os p_*.
-- Upsert por wa_id: a primeira chamada grava a linha; as seguintes so avancam o
-- status e completam o erro (telefone, texto, origem, direcao e ocorrida_em ficam
-- como foram gravados: o registro nao e reescrito).
-- ---------------------------------------------------------------------------
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
  IF p_telefone IS NULL OR p_telefone !~ '^[0-9]{8,15}$' THEN
    RAISE EXCEPTION 'p_telefone invalido: so digitos, de 8 a 15, com DDI (ex.: 5511999999999)' USING ERRCODE = '22023';
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
  'Operacao fixa do motor local do WhatsApp: upsert por wa_id (contrato do PLANO.md). Valida enums e formato com mensagem clara (SQLSTATE 22023, sem repetir telefone nem texto). Status so avanca; erro truncado em 1000 caracteres. NAO grava em atividade. EXECUTE so service_role.';
REVOKE ALL ON FUNCTION public.registrar_mensagem_whatsapp(text, text, text, text, text, text, text, timestamptz)
  FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.registrar_mensagem_whatsapp(text, text, text, text, text, text, text, timestamptz)
  TO service_role;

-- ---------------------------------------------------------------------------
-- RPC do recibo (so service_role). Devolve true quando a mensagem ENVIADA existe
-- (o status avancou, ou ja estava igual ou a frente e o recibo atrasado foi
-- ignorado) e false quando o wa_id nao existe (ou e de mensagem recebida): recibo
-- de mensagem que o motor nao registrou nao e erro.
-- ---------------------------------------------------------------------------
CREATE OR REPLACE FUNCTION public.atualizar_status_whatsapp(p_wa_id text, p_status text)
RETURNS boolean
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = pg_catalog, public
AS $$
DECLARE
  v_ordem text[] := ARRAY['recebida', 'falhou', 'enviada', 'entregue', 'lida'];
BEGIN
  IF p_status IS NULL OR p_status NOT IN ('entregue', 'lida') THEN
    RAISE EXCEPTION 'p_status invalido: use entregue ou lida' USING ERRCODE = '22023';
  END IF;
  IF p_wa_id IS NULL OR length(trim(p_wa_id)) = 0 THEN
    RETURN false;
  END IF;

  -- um UPDATE so, com a regra no WHERE: dois recibos fora de ordem nao se atropelam
  UPDATE public.whatsapp_mensagem m
     SET status = p_status, status_em = now()
   WHERE m.wa_id = p_wa_id
     AND m.direcao = 'enviada'
     AND array_position(v_ordem, p_status) > array_position(v_ordem, m.status);
  IF FOUND THEN
    RETURN true;
  END IF;

  -- nao avancou: ou o recibo e atrasado (status ja igual ou a frente) ou o id e desconhecido
  RETURN EXISTS (SELECT 1 FROM public.whatsapp_mensagem m WHERE m.wa_id = p_wa_id AND m.direcao = 'enviada');
END;
$$;

COMMENT ON FUNCTION public.atualizar_status_whatsapp(text, text) IS
  'Recibo do WhatsApp pelo motor local (contrato do PLANO.md): so entregue ou lida; so avanca (enviada < entregue < lida), nunca regride. true = a mensagem enviada existe (avancou ou o recibo atrasado foi ignorado); false = wa_id desconhecido, sem erro. NAO grava em atividade. EXECUTE so service_role.';
REVOKE ALL ON FUNCTION public.atualizar_status_whatsapp(text, text) FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.atualizar_status_whatsapp(text, text) TO service_role;

-- ---------------------------------------------------------------------------
-- Smoke. Roda como o dono da migration; desfaz tudo que insere (P0999).
-- ---------------------------------------------------------------------------
DO $$
DECLARE
  v_id1 uuid;
  v_id2 uuid;
  v_n int;
  v_ativ_antes bigint;
  v_ativ_depois bigint;
  v_status text;
  v_ok boolean;
  v_direcao_pegou boolean := false;
  v_origem_pegou boolean := false;
  v_status_pegou boolean := false;
  v_telefone_pegou boolean := false;
  v_texto_pegou boolean := false;
  v_coerencia_pegou boolean := false;
  v_rpc_enum_pegou boolean := false;
BEGIN
  IF NOT coalesce((SELECT relrowsecurity FROM pg_class WHERE oid = to_regclass('public.whatsapp_mensagem')), false) THEN
    RAISE EXCEPTION 'smoke 0018: public.whatsapp_mensagem ausente ou sem RLS';
  END IF;
  IF has_table_privilege('authenticated', 'public.whatsapp_mensagem', 'INSERT,UPDATE,DELETE')
     OR has_table_privilege('anon', 'public.whatsapp_mensagem', 'SELECT') THEN
    RAISE EXCEPTION 'smoke 0018: escrita de authenticated ou leitura de anon em whatsapp_mensagem';
  END IF;
  IF NOT has_table_privilege('authenticated', 'public.whatsapp_mensagem', 'SELECT') THEN
    RAISE EXCEPTION 'smoke 0018: authenticated sem SELECT em whatsapp_mensagem — a tela renderiza VAZIA sem erro';
  END IF;
  IF NOT EXISTS (SELECT 1 FROM pg_policies WHERE schemaname = 'public' AND tablename = 'whatsapp_mensagem'
                   AND policyname = 'whatsapp_mensagem_select' AND qual LIKE '%whatsapp.read%') THEN
    RAISE EXCEPTION 'smoke 0018: policy whatsapp_mensagem_select ausente ou sem exigir whatsapp.read';
  END IF;
  IF EXISTS (SELECT 1 FROM pg_policies WHERE schemaname = 'public' AND tablename = 'whatsapp_mensagem'
               AND cmd IN ('INSERT', 'UPDATE', 'DELETE', 'ALL')) THEN
    RAISE EXCEPTION 'smoke 0018: existe policy de escrita em whatsapp_mensagem — a escrita e so das RPCs do motor';
  END IF;
  IF NOT EXISTS (SELECT 1 FROM pg_indexes WHERE schemaname = 'public' AND tablename = 'whatsapp_mensagem'
                   AND indexname = 'idx_whatsapp_mensagem_ocorrida') THEN
    RAISE EXCEPTION 'smoke 0018: idx_whatsapp_mensagem_ocorrida ausente — o relatorio degrada pra seq scan';
  END IF;
  IF has_function_privilege('authenticated', 'public.registrar_mensagem_whatsapp(text, text, text, text, text, text, text, timestamptz)', 'EXECUTE')
     OR has_function_privilege('anon', 'public.registrar_mensagem_whatsapp(text, text, text, text, text, text, text, timestamptz)', 'EXECUTE')
     OR has_function_privilege('authenticated', 'public.atualizar_status_whatsapp(text, text)', 'EXECUTE')
     OR has_function_privilege('anon', 'public.atualizar_status_whatsapp(text, text)', 'EXECUTE') THEN
    RAISE EXCEPTION 'smoke 0018: registrar_mensagem_whatsapp ou atualizar_status_whatsapp executavel pelo app';
  END IF;
  IF NOT has_function_privilege('service_role', 'public.registrar_mensagem_whatsapp(text, text, text, text, text, text, text, timestamptz)', 'EXECUTE')
     OR NOT has_function_privilege('service_role', 'public.atualizar_status_whatsapp(text, text)', 'EXECUTE') THEN
    RAISE EXCEPTION 'smoke 0018: service_role sem EXECUTE nas RPCs do motor — o registro nunca grava';
  END IF;

  SELECT count(*) INTO v_ativ_antes FROM public.atividade;
  BEGIN
    -- check de enum e de formato pega valor invalido (INSERT direto, sem passar pela RPC)
    BEGIN
      INSERT INTO public.whatsapp_mensagem (wa_id, direcao, telefone, texto, origem, status)
      VALUES ('smoke0018-a', 'enviando', '5511999999999', 'x', 'mcp', 'enviada');
    EXCEPTION WHEN check_violation THEN v_direcao_pegou := true; END;
    BEGIN
      INSERT INTO public.whatsapp_mensagem (wa_id, direcao, telefone, texto, origem, status)
      VALUES ('smoke0018-b', 'enviada', '5511999999999', 'x', 'bot', 'enviada');
    EXCEPTION WHEN check_violation THEN v_origem_pegou := true; END;
    BEGIN
      INSERT INTO public.whatsapp_mensagem (wa_id, direcao, telefone, texto, origem, status)
      VALUES ('smoke0018-c', 'enviada', '5511999999999', 'x', 'mcp', 'perdida');
    EXCEPTION WHEN check_violation THEN v_status_pegou := true; END;
    BEGIN
      INSERT INTO public.whatsapp_mensagem (wa_id, direcao, telefone, texto, origem, status)
      VALUES ('smoke0018-d', 'enviada', '+55 11 99999-9999', 'x', 'mcp', 'enviada');
    EXCEPTION WHEN check_violation THEN v_telefone_pegou := true; END;
    BEGIN
      INSERT INTO public.whatsapp_mensagem (wa_id, direcao, telefone, texto, origem, status)
      VALUES ('smoke0018-e', 'enviada', '5511999999999', repeat('x', 4097), 'mcp', 'enviada');
    EXCEPTION WHEN check_violation THEN v_texto_pegou := true; END;
    BEGIN
      INSERT INTO public.whatsapp_mensagem (wa_id, direcao, telefone, texto, origem, status)
      VALUES ('smoke0018-f', 'recebida', '5511999999999', 'x', 'outro', 'enviada');
    EXCEPTION WHEN check_violation THEN v_coerencia_pegou := true; END;
    -- a RPC tambem recusa enum invalido, com mensagem clara
    BEGIN
      PERFORM public.registrar_mensagem_whatsapp('smoke0018-g', 'enviada', '5511999999999', 'x', 'bot', 'enviada');
    EXCEPTION WHEN SQLSTATE '22023' THEN v_rpc_enum_pegou := true; END;

    -- ida e volta pelas RPCs: registra, repete (upsert), avanca, nao regride, id desconhecido
    v_id1 := public.registrar_mensagem_whatsapp('smoke0018-ok', 'enviada', '5511999999999', 'oi', 'teste', 'enviada');
    v_id2 := public.registrar_mensagem_whatsapp('smoke0018-ok', 'enviada', '5511999999999', 'oi', 'teste', 'enviada');
    SELECT count(*) INTO v_n FROM public.whatsapp_mensagem WHERE wa_id = 'smoke0018-ok';
    IF v_id1 IS NULL OR v_id1 <> v_id2 OR v_n <> 1 THEN
      RAISE EXCEPTION 'smoke 0018: registrar a mesma mensagem 2x nao e upsert (ids % e %, % linhas)', v_id1, v_id2, v_n;
    END IF;
    v_ok := public.atualizar_status_whatsapp('smoke0018-ok', 'lida');
    IF NOT v_ok THEN RAISE EXCEPTION 'smoke 0018: atualizar_status_whatsapp nao achou a mensagem registrada'; END IF;
    PERFORM public.atualizar_status_whatsapp('smoke0018-ok', 'entregue');
    PERFORM public.registrar_mensagem_whatsapp('smoke0018-ok', 'enviada', '5511999999999', 'oi', 'teste', 'enviada');
    SELECT status INTO v_status FROM public.whatsapp_mensagem WHERE wa_id = 'smoke0018-ok';
    IF v_status <> 'lida' THEN
      RAISE EXCEPTION 'smoke 0018: o status regrediu para % — recibo atrasado ou registro repetido derrubou a mensagem lida', v_status;
    END IF;
    IF public.atualizar_status_whatsapp('smoke0018-nao-existe', 'lida') THEN
      RAISE EXCEPTION 'smoke 0018: wa_id desconhecido devolveu true';
    END IF;

    SELECT count(*) INTO v_ativ_depois FROM public.atividade;
    IF v_ativ_depois <> v_ativ_antes THEN
      RAISE EXCEPTION 'smoke 0018: as RPCs do WhatsApp gravaram em atividade — poluem a linha do tempo do dono';
    END IF;
    RAISE EXCEPTION 'smoke 0018: desfazendo' USING ERRCODE = 'P0999';
  EXCEPTION WHEN SQLSTATE 'P0999' THEN NULL;
  END;
  IF NOT v_direcao_pegou THEN RAISE EXCEPTION 'smoke 0018: direcao fora da lista foi aceita'; END IF;
  IF NOT v_origem_pegou THEN RAISE EXCEPTION 'smoke 0018: origem fora da lista foi aceita'; END IF;
  IF NOT v_status_pegou THEN RAISE EXCEPTION 'smoke 0018: status fora da lista foi aceito'; END IF;
  IF NOT v_telefone_pegou THEN RAISE EXCEPTION 'smoke 0018: telefone com simbolo ou espaco foi aceito'; END IF;
  IF NOT v_texto_pegou THEN RAISE EXCEPTION 'smoke 0018: texto com mais de 4096 caracteres foi aceito'; END IF;
  IF NOT v_coerencia_pegou THEN RAISE EXCEPTION 'smoke 0018: mensagem recebida com status enviada foi aceita'; END IF;
  IF NOT v_rpc_enum_pegou THEN RAISE EXCEPTION 'smoke 0018: registrar_mensagem_whatsapp aceitou origem invalida'; END IF;
END $$;

-- Rollback:
--   DROP FUNCTION public.atualizar_status_whatsapp(text, text);
--   DROP FUNCTION public.registrar_mensagem_whatsapp(text, text, text, text, text, text, text, timestamptz);
--   DROP TABLE public.whatsapp_mensagem;
--   (o modulo whatsapp e os slugs whatsapp.* pertencem a 0013: NAO apagar aqui)
