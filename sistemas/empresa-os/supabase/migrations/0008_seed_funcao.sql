-- 0008_seed_funcao.sql
-- As 3 funcoes de seed do Empresa OS (RPCs idempotentes, so service_role):
--   seed_empresa(p_nome, p_email_dono, p_nome_dono)  empresa + dono + 1a linha do feed
--   semear_tarefas(p_itens jsonb)                    trilhas do curso e do plano (upsert por chave)
--   sincronizar_agentes(p_itens jsonb)               catalogo de agentes (espelho do agentes.json v4)
-- O setup/instalador chama com a chave de servico; re-rodar NAO duplica nada
-- e nunca sobrescreve o que o aluno editou no sistema.
-- Depende de: 0002-0007 (tabelas, set_atualizada_em, helpers e RLS ja aplicados).
-- Rollback ao fim do arquivo.

-- ---------------------------------------------------------------------------
-- seed_empresa: empresa id = 1 + usuario dono + 'Empresa criada' no feed (1a vez)
-- ---------------------------------------------------------------------------
CREATE OR REPLACE FUNCTION public.seed_empresa(
  p_nome text,
  p_email_dono text,
  p_nome_dono text
) RETURNS uuid
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_dono_id uuid;
  v_email text;
BEGIN
  IF p_nome IS NULL OR length(trim(p_nome)) = 0 THEN
    RAISE EXCEPTION 'nome da empresa vazio — informe o nome em p_nome';
  END IF;
  IF p_email_dono IS NULL OR length(trim(p_email_dono)) = 0 THEN
    RAISE EXCEPTION 'email do dono vazio — informe o email em p_email_dono';
  END IF;
  IF p_nome_dono IS NULL OR length(trim(p_nome_dono)) = 0 THEN
    RAISE EXCEPTION 'nome do dono vazio — informe o nome em p_nome_dono';
  END IF;

  -- Normaliza o email: e unico no sistema e o convite compara por email.
  v_email := lower(trim(p_email_dono));

  -- Empresa: DO NOTHING de proposito — re-rodar o setup NAO pode reverter um
  -- nome que o dono editou dentro do sistema.
  INSERT INTO public.empresa (id, nome)
  VALUES (1, trim(p_nome))
  ON CONFLICT (id) DO NOTHING;

  -- Dono: so pode haver UM (uq_usuarios_um_dono, 0003). Se ja existe dono,
  -- re-rodar com email DIFERENTE nao cria um segundo nem sobrescreve o atual —
  -- reusa o existente e avisa. DO NOTHING no conflito de email de proposito: a
  -- segunda chamada nao pode zerar auth_user_id nem sobrescrever nome editado.
  SELECT u.id INTO v_dono_id FROM public.usuarios u WHERE u.e_dono;

  IF v_dono_id IS NULL THEN
    INSERT INTO public.usuarios (nome, email, e_dono)
    VALUES (trim(p_nome_dono), v_email, true)
    ON CONFLICT (email) DO NOTHING
    RETURNING id INTO v_dono_id;

    IF v_dono_id IS NULL THEN
      RAISE EXCEPTION 'o email % ja existe como usuario NAO-dono — o dono nao pode ser promovido por UPDATE (transferencia de dono e operacao manual, ver trg_usuarios_protege_dono na 0003)', v_email;
    END IF;
  ELSIF NOT EXISTS (
    SELECT 1 FROM public.usuarios u WHERE u.id = v_dono_id AND u.email = v_email
  ) THEN
    RAISE WARNING
      'seed_empresa: a empresa ja tem dono com OUTRO email — mantido o existente. Trocar o dono e operacao manual (ver trigger trg_usuarios_protege_dono na 0003).';
  END IF;

  -- Registro de nascimento no feed (1 vez; re-rodar nao duplica).
  IF NOT EXISTS (
    SELECT 1 FROM public.atividade x WHERE x.tipo = 'sistema' AND x.descricao = 'Empresa criada'
  ) THEN
    INSERT INTO public.atividade (tipo, descricao)
    VALUES ('sistema', 'Empresa criada');
  END IF;

  RETURN v_dono_id;
END;
$$;

COMMENT ON FUNCTION public.seed_empresa(text, text, text) IS
  'Seed idempotente: empresa (id = 1), usuario dono (e_dono) e o registro "Empresa criada" no feed. Somente service_role: e SECURITY DEFINER e cria o dono sem passar pelo RBAC. auth_user_id do dono nasce NULL — o setup vincula depois do convite; re-rodar nunca sobrescreve esse vinculo. Devolve o id do dono. Chamada em producao E em homologacao (o seed de exemplo NUNCA cria dono).';

-- ---------------------------------------------------------------------------
-- semear_tarefas: trilhas do curso e do plano (upsert por chave)
-- ---------------------------------------------------------------------------
CREATE OR REPLACE FUNCTION public.semear_tarefas(p_itens jsonb)
RETURNS integer
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_item jsonb;
  v_chave text;
  v_perm text[] := ARRAY['chave','trilha','fase','ordem','titulo','objetivo',
                         'criterio_pronto','comando','prova','depende_de'];
  v_k text;
  v_novas integer := 0;
  v_n integer;
BEGIN
  IF p_itens IS NULL OR jsonb_typeof(p_itens) <> 'array' THEN
    RAISE EXCEPTION 'semear_tarefas: p_itens deve ser um array jsonb de itens';
  END IF;

  -- 1a passada: VALIDA tudo antes de inserir qualquer coisa (tudo ou nada).
  FOR v_item IN SELECT * FROM jsonb_array_elements(p_itens) LOOP
    IF jsonb_typeof(v_item) <> 'object' THEN
      RAISE EXCEPTION 'semear_tarefas: cada item deve ser um objeto';
    END IF;
    FOR v_k IN SELECT jsonb_object_keys(v_item) LOOP
      IF NOT (v_k = ANY (v_perm)) THEN
        RAISE EXCEPTION 'semear_tarefas: chave desconhecida "%" no item % (permitidas: %)',
          v_k, coalesce(v_item->>'chave', '?'), array_to_string(v_perm, ', ');
      END IF;
    END LOOP;
    IF coalesce(v_item->>'trilha', '') NOT IN ('curso', 'plano90') THEN
      RAISE EXCEPTION 'semear_tarefas: item % com trilha "%" — so curso e plano90 (trabalho e criada pela tela)',
        coalesce(v_item->>'chave', '?'), coalesce(v_item->>'trilha', '');
    END IF;
    IF v_item->>'chave' IS NULL THEN
      RAISE EXCEPTION 'semear_tarefas: item sem chave';
    END IF;
    IF v_item->>'depende_de' IS NOT NULL
       AND NOT EXISTS (SELECT 1 FROM jsonb_array_elements(p_itens) o WHERE o->>'chave' = v_item->>'depende_de')
       AND NOT EXISTS (SELECT 1 FROM public.tarefas t WHERE t.chave = v_item->>'depende_de') THEN
      RAISE EXCEPTION 'semear_tarefas: item % depende de "%" que nao existe (nem no payload nem no banco)',
        v_item->>'chave', v_item->>'depende_de';
    END IF;
  END LOOP;

  -- Insere. ON CONFLICT (chave) DO NOTHING: nunca sobrescreve status nem texto
  -- que o aluno ja mexeu. A trilha e imutavel pela tela, mas o titulo e o status nao.
  FOR v_item IN SELECT * FROM jsonb_array_elements(p_itens) LOOP
    INSERT INTO public.tarefas
      (chave, trilha, fase, ordem, titulo, objetivo, criterio_pronto, comando, prova, origem)
    VALUES (
      v_item->>'chave',
      v_item->>'trilha',
      v_item->>'fase',
      (v_item->>'ordem')::integer,
      v_item->>'titulo',
      v_item->>'objetivo',
      v_item->>'criterio_pronto',
      v_item->>'comando',
      v_item->>'prova',
      'ia'
    )
    ON CONFLICT (chave) DO NOTHING;
    GET DIAGNOSTICS v_n = ROW_COUNT;
    v_novas := v_novas + v_n;
  END LOOP;

  -- 2a passada: resolve depende_de (chave -> id) so onde ainda esta vazio.
  FOR v_item IN SELECT * FROM jsonb_array_elements(p_itens) LOOP
    CONTINUE WHEN v_item->>'depende_de' IS NULL;
    UPDATE public.tarefas t
       SET depende_de = d.id
      FROM public.tarefas d
     WHERE t.chave = v_item->>'chave'
       AND d.chave = v_item->>'depende_de'
       AND t.depende_de IS NULL;
  END LOOP;

  RETURN v_novas;
END;
$$;

COMMENT ON FUNCTION public.semear_tarefas(jsonb) IS
  'Semeia as trilhas curso/plano90 a partir de `config/trilhas.json` ({"versao","itens":[...]}; este parametro e o array `itens`). Chaves permitidas: chave, trilha, fase, ordem, titulo, objetivo, criterio_pronto, comando, prova, depende_de. Chave desconhecida, trilha trabalho ou depende_de que nao resolve = excecao SEM inserir nada. Idempotente por chave (nunca sobrescreve status nem texto do aluno). Devolve quantas linhas NOVAS.';

-- ---------------------------------------------------------------------------
-- sincronizar_agentes: catalogo de agentes (o JSON e a fonte)
-- ---------------------------------------------------------------------------
CREATE OR REPLACE FUNCTION public.sincronizar_agentes(p_itens jsonb)
RETURNS integer
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_item jsonb;
  v_perm text[] := ARRAY['name','time','descricao_curta','descricao','quando','tier',
                         'modelo','esforco','sandbox','skills','estado'];
  v_k text;
  v_n integer := 0;
  v_nomes text[] := '{}';
BEGIN
  IF p_itens IS NULL OR jsonb_typeof(p_itens) <> 'array' THEN
    RAISE EXCEPTION 'sincronizar_agentes: p_itens deve ser um array jsonb de agentes';
  END IF;

  -- Valida tudo antes de escrever.
  FOR v_item IN SELECT * FROM jsonb_array_elements(p_itens) LOOP
    IF jsonb_typeof(v_item) <> 'object' THEN
      RAISE EXCEPTION 'sincronizar_agentes: cada item deve ser um objeto';
    END IF;
    FOR v_k IN SELECT jsonb_object_keys(v_item) LOOP
      IF NOT (v_k = ANY (v_perm)) THEN
        RAISE EXCEPTION 'sincronizar_agentes: chave desconhecida "%" no agente % (permitidas: %)',
          v_k, coalesce(v_item->>'name', '?'), array_to_string(v_perm, ', ');
      END IF;
    END LOOP;
  END LOOP;

  -- Upsert por name: o JSON e a fonte, entao DO UPDATE em todos os campos.
  FOR v_item IN SELECT * FROM jsonb_array_elements(p_itens) LOOP
    INSERT INTO public.agentes
      (name, time, descricao_curta, descricao, quando, tier, modelo, esforco,
       sandbox, skills, estado, estado_conferido_em)
    VALUES (
      v_item->>'name',
      v_item->>'time',
      v_item->>'descricao_curta',
      v_item->>'descricao',
      v_item->>'quando',
      v_item->>'tier',
      v_item->>'modelo',
      v_item->>'esforco',
      v_item->>'sandbox',
      coalesce(ARRAY(SELECT jsonb_array_elements_text(v_item->'skills')), '{}'),
      v_item->>'estado',
      now()
    )
    ON CONFLICT (name) DO UPDATE SET
      time = EXCLUDED.time,
      descricao_curta = EXCLUDED.descricao_curta,
      descricao = EXCLUDED.descricao,
      quando = EXCLUDED.quando,
      tier = EXCLUDED.tier,
      modelo = EXCLUDED.modelo,
      esforco = EXCLUDED.esforco,
      sandbox = EXCLUDED.sandbox,
      skills = EXCLUDED.skills,
      estado = EXCLUDED.estado,
      estado_conferido_em = now();
    v_nomes := v_nomes || (v_item->>'name');
    v_n := v_n + 1;
  END LOOP;

  -- Papel que existe no banco e nao veio no payload vira `aposentado`
  -- (nao apaga: execucoes_agente referencia).
  UPDATE public.agentes
     SET estado = 'aposentado', estado_conferido_em = now()
   WHERE NOT (name = ANY (v_nomes))
     AND estado <> 'aposentado';

  RETURN v_n;
END;
$$;

COMMENT ON FUNCTION public.sincronizar_agentes(jsonb) IS
  'Espelha o catalogo agentes.json v4 em public.agentes. Payload GERADO pelo instalador depois da conferencia, nunca lista a mao. Chave desconhecida = excecao. Upsert por name (o JSON e a fonte); estado_conferido_em = now(); papel que sumiu do payload vira `aposentado` (nao apaga). Devolve quantos agentes vieram no payload.';

-- ---------------------------------------------------------------------------
-- Seguranca: SECURITY DEFINER que cria dono e escreve catalogo. Funcao nova
-- nasce com EXECUTE pra PUBLIC por default — revogar e obrigatorio, senao
-- qualquer visitante com a chave anon criaria dono.
-- ---------------------------------------------------------------------------
REVOKE ALL ON FUNCTION public.seed_empresa(text, text, text)  FROM PUBLIC, anon, authenticated;
REVOKE ALL ON FUNCTION public.semear_tarefas(jsonb)           FROM PUBLIC, anon, authenticated;
REVOKE ALL ON FUNCTION public.sincronizar_agentes(jsonb)      FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.seed_empresa(text, text, text)  TO service_role;
GRANT EXECUTE ON FUNCTION public.semear_tarefas(jsonb)           TO service_role;
GRANT EXECUTE ON FUNCTION public.sincronizar_agentes(jsonb)      TO service_role;

-- ---------------------------------------------------------------------------
-- Smoke: privilegio + idempotencia real (2 chamadas, mesmas contagens).
-- Tudo roda num sub-bloco que se desfaz por excecao proposital (SQLSTATE
-- P0999); flags e RAISE de falha FORA do bloco que captura. Nunca deixa linha
-- de teste no banco do aluno.
-- ---------------------------------------------------------------------------
DO $$
DECLARE
  v_fn text;
  v_falha text := NULL;
  v_n1 integer; v_n2 integer; v_c1 integer; v_c2 integer;
  v_a1 integer; v_a2 integer;
  v_chave_barrada boolean := false;
  v_sem_dep_barrada boolean := false;
  v_trabalho_barrado boolean := false;
  v_aposentou boolean := false;
  v_dono_a uuid; v_dono_b uuid;
  v_tem_dono boolean;
  v_itens jsonb := '[
    {"chave":"smoke.a1","trilha":"curso","fase":"D1","ordem":99001,"titulo":"Smoke A"},
    {"chave":"smoke.a2","trilha":"curso","fase":"D1","ordem":99002,"titulo":"Smoke B","depende_de":"smoke.a1"}
  ]'::jsonb;
  v_ag jsonb := '[
    {"name":"smoke-a","time":"sistema","descricao_curta":"Smoke A","descricao":"d","sandbox":"read-only","estado":"instalado"},
    {"name":"smoke-b","time":"sistema","descricao_curta":"Smoke B","descricao":"d","sandbox":"read-only","estado":"instalado"}
  ]'::jsonb;
  v_ag2 jsonb := '[
    {"name":"smoke-a","time":"sistema","descricao_curta":"Smoke A","descricao":"d","sandbox":"read-only","estado":"instalado"}
  ]'::jsonb;
BEGIN
  -- Privilegios: teste de mutacao — apagar o REVOKE acima TEM que quebrar
  -- (funcao herda EXECUTE de PUBLIC).
  FOREACH v_fn IN ARRAY ARRAY[
    'public.seed_empresa(text,text,text)',
    'public.semear_tarefas(jsonb)',
    'public.sincronizar_agentes(jsonb)'
  ] LOOP
    IF to_regprocedure(v_fn) IS NULL THEN
      RAISE EXCEPTION 'smoke 0008: % nao existe — o setup nao tem como semear', v_fn;
    END IF;
    IF NOT has_function_privilege('service_role', v_fn, 'EXECUTE') THEN
      RAISE EXCEPTION 'smoke 0008: service_role sem EXECUTE em % — o script de setup falha', v_fn;
    END IF;
    IF has_function_privilege('anon', v_fn, 'EXECUTE') THEN
      RAISE EXCEPTION 'smoke 0008: anon executa % — qualquer visitante semearia o banco (REVOKE FROM PUBLIC sumiu)', v_fn;
    END IF;
    IF has_function_privilege('authenticated', v_fn, 'EXECUTE') THEN
      RAISE EXCEPTION 'smoke 0008: authenticated executa % — usuario comum semearia fora do fluxo de setup', v_fn;
    END IF;
  END LOOP;

  SELECT EXISTS (SELECT 1 FROM public.usuarios WHERE e_dono) INTO v_tem_dono;

  BEGIN
    -- semear_tarefas: 2 chamadas, mesmas contagens (G15).
    v_n1 := public.semear_tarefas(v_itens);
    v_n2 := public.semear_tarefas(v_itens);
    SELECT count(*) INTO v_c1 FROM public.tarefas WHERE chave LIKE 'smoke.%';
    IF v_n1 <> 2 OR v_n2 <> 0 OR v_c1 <> 2 THEN
      v_falha := format('semear_tarefas: 1a chamada devolveu %s (esperado 2), 2a devolveu %s (esperado 0), linhas %s (esperado 2) — re-rodar o setup duplicaria a trilha', v_n1, v_n2, v_c1);
    END IF;
    IF v_falha IS NULL AND NOT EXISTS (
      SELECT 1 FROM public.tarefas a JOIN public.tarefas b ON a.depende_de = b.id
       WHERE a.chave = 'smoke.a2' AND b.chave = 'smoke.a1') THEN
      v_falha := 'semear_tarefas: depende_de (chave -> id) nao foi resolvido na 2a passada';
    END IF;

    -- chave desconhecida, trilha trabalho e depende_de que nao resolve = excecao sem inserir
    BEGIN
      PERFORM public.semear_tarefas('[{"chave":"smoke.x","trilha":"curso","fase":"D1","ordem":99010,"titulo":"x","invento":1}]'::jsonb);
    EXCEPTION WHEN raise_exception THEN v_chave_barrada := true; END;
    BEGIN
      PERFORM public.semear_tarefas('[{"chave":"smoke.y","trilha":"trabalho","titulo":"y"}]'::jsonb);
    EXCEPTION WHEN raise_exception THEN v_trabalho_barrado := true; END;
    BEGIN
      PERFORM public.semear_tarefas('[{"chave":"smoke.z","trilha":"curso","fase":"D1","ordem":99011,"titulo":"z","depende_de":"smoke.nao-existe"}]'::jsonb);
    EXCEPTION WHEN raise_exception THEN v_sem_dep_barrada := true; END;

    -- sincronizar_agentes: 2 chamadas, mesmas contagens; quem sumiu vira aposentado
    v_a1 := public.sincronizar_agentes(v_ag);
    v_a2 := public.sincronizar_agentes(v_ag);
    SELECT count(*) INTO v_c2 FROM public.agentes WHERE name LIKE 'smoke-%';
    IF v_falha IS NULL AND (v_a1 <> 2 OR v_a2 <> 2 OR v_c2 <> 2) THEN
      v_falha := format('sincronizar_agentes: devolveu %s e %s, linhas %s (esperado 2, 2 e 2) — re-rodar o sync duplicaria o catalogo', v_a1, v_a2, v_c2);
    END IF;
    PERFORM public.sincronizar_agentes(v_ag2);
    v_aposentou := EXISTS (SELECT 1 FROM public.agentes WHERE name = 'smoke-b' AND estado = 'aposentado')
                   AND EXISTS (SELECT 1 FROM public.agentes WHERE name = 'smoke-a' AND estado = 'instalado');

    -- seed_empresa: 2 chamadas, mesmo dono, 1 linha 'Empresa criada' (so se
    -- ainda nao ha dono: num banco ja semeado o seed real ja rodou).
    IF NOT v_tem_dono THEN
      v_dono_a := public.seed_empresa('Empresa Smoke', 'smoke-seed@exemplo.invalid', 'Smoke');
      v_dono_b := public.seed_empresa('Empresa Smoke', 'smoke-seed@exemplo.invalid', 'Smoke');
      IF v_falha IS NULL AND v_dono_a IS DISTINCT FROM v_dono_b THEN
        v_falha := 'seed_empresa: duas chamadas devolveram donos diferentes — re-rodar o setup criaria dono fantasma';
      END IF;
      IF v_falha IS NULL AND (SELECT count(*) FROM public.usuarios WHERE e_dono) <> 1 THEN
        v_falha := 'seed_empresa: nao ha exatamente 1 dono depois de 2 chamadas';
      END IF;
      IF v_falha IS NULL AND (SELECT count(*) FROM public.atividade
                               WHERE tipo = 'sistema' AND descricao = 'Empresa criada') <> 1 THEN
        v_falha := 'seed_empresa: "Empresa criada" nao tem exatamente 1 linha no feed depois de 2 chamadas';
      END IF;
    END IF;

    RAISE EXCEPTION 'smoke 0008: desfazendo as linhas de teste' USING ERRCODE = 'P0999';
  EXCEPTION WHEN SQLSTATE 'P0999' THEN
    NULL;
  END;

  IF v_falha IS NOT NULL THEN
    RAISE EXCEPTION 'smoke 0008: %', v_falha;
  END IF;
  IF NOT v_chave_barrada THEN
    RAISE EXCEPTION 'smoke 0008: chave desconhecida aceita em semear_tarefas — typo no config/trilhas.json passaria calado';
  END IF;
  IF NOT v_trabalho_barrado THEN
    RAISE EXCEPTION 'smoke 0008: trilha trabalho aceita em semear_tarefas — o seed so cria curso e plano90';
  END IF;
  IF NOT v_sem_dep_barrada THEN
    RAISE EXCEPTION 'smoke 0008: depende_de que nao resolve foi aceito — a trilha nasceria com elo quebrado';
  END IF;
  IF NOT v_aposentou THEN
    RAISE EXCEPTION 'smoke 0008: agente fora do payload nao virou aposentado — o catalogo mostraria agente que nao existe mais';
  END IF;
END $$;

-- Rollback:
--   DROP FUNCTION IF EXISTS public.sincronizar_agentes(jsonb);
--   DROP FUNCTION IF EXISTS public.semear_tarefas(jsonb);
--   DROP FUNCTION IF EXISTS public.seed_empresa(text, text, text);
