-- 0022_catalogo_ia.sql
-- Catalogo de IA da empresa: agentes, skills e workflows, com o conteudo integral dos arquivos,
-- pra tela "Agentes, skills e workflows". O REPOSITORIO do aluno e a fonte; estas tabelas sao
-- ESPELHO: authenticated so LE (agentes.read); a escrita e so pela RPC sincronizar_catalogo_ia
-- (service_role), chamada pelo script polozi-instalar-time/scripts/sincronizar_catalogo.py.
-- O agente continua em public.agentes (execucoes_agente aponta pra la); aqui fica o conteudo dele.
-- artefato_playbook e o elo I25 (passo do playbook -> skill/agente), nasce vazio.
-- Segredo nunca: a RPC recusa o lote inteiro se qualquer conteudo bater o PADRAO_SEGREDO de .githooks/regras-segredo.sh da Casa (c_segredo, abaixo).
-- Depende de 0002 (set_atualizada_em), 0004 (tem_permissao), 0005 e 0008 (sincronizar_agentes).
-- Rollback ao fim do arquivo.

CREATE TABLE IF NOT EXISTS public.artefatos_ia (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  tipo text NOT NULL CHECK (tipo IN ('agente', 'skill', 'workflow')),
  nome text NOT NULL CHECK (nome ~ '^[a-z0-9][a-z0-9._-]*$' AND char_length(nome) <= 80),
  time text NOT NULL,
  origem text NOT NULL CHECK (origem IN ('nucleo', 'time', 'plugin', 'sistema', 'casa')),
  resumo text NOT NULL CHECK (char_length(resumo) BETWEEN 1 AND 140),
  descricao text,
  quando text,
  gatilho text,
  le text,
  grava text,
  formato text NOT NULL CHECK (formato IN ('markdown', 'toml', 'yaml', 'texto')),
  conteudo text NOT NULL CHECK (char_length(conteudo) <= 262144),
  caminho text NOT NULL,
  hash text NOT NULL CHECK (hash ~ '^[0-9a-f]{64}$'),
  estado text NOT NULL CHECK (estado IN ('instalado', 'disponivel', 'aposentado')),
  conferido_em timestamptz NOT NULL,
  criado_em timestamptz NOT NULL DEFAULT now(),
  atualizada_em timestamptz NOT NULL DEFAULT now(),
  UNIQUE (tipo, nome)
);

CREATE TABLE IF NOT EXISTS public.artefato_arquivos (
  id bigint GENERATED ALWAYS AS IDENTITY PRIMARY KEY,
  artefato_id uuid NOT NULL REFERENCES public.artefatos_ia(id) ON DELETE CASCADE,
  caminho text NOT NULL,
  linguagem text NOT NULL CHECK (linguagem IN ('python', 'bash', 'javascript', 'typescript', 'sql',
                                               'toml', 'yaml', 'json', 'markdown', 'texto')),
  conteudo text CHECK (conteudo IS NULL OR char_length(conteudo) <= 262144),
  bytes integer NOT NULL CHECK (bytes >= 0),
  hash text NOT NULL CHECK (hash ~ '^[0-9a-f]{64}$'),
  UNIQUE (artefato_id, caminho)
);

CREATE TABLE IF NOT EXISTS public.artefato_relacoes (
  id bigint GENERATED ALWAYS AS IDENTITY PRIMARY KEY,
  origem_id uuid NOT NULL REFERENCES public.artefatos_ia(id) ON DELETE CASCADE,
  destino_id uuid NOT NULL REFERENCES public.artefatos_ia(id) ON DELETE CASCADE,
  tipo text NOT NULL CHECK (tipo IN ('usa')),
  CHECK (origem_id <> destino_id),
  UNIQUE (origem_id, destino_id, tipo)
);

CREATE TABLE IF NOT EXISTS public.artefato_playbook (
  id bigint GENERATED ALWAYS AS IDENTITY PRIMARY KEY,
  artefato_id uuid NOT NULL REFERENCES public.artefatos_ia(id) ON DELETE CASCADE,
  pacote_slug text NOT NULL,
  playbook_slug text NOT NULL,
  passo_codigo text,
  forma text NOT NULL CHECK (forma IN ('prompt', 'skill', 'workflow', 'agente', 'multiagente', 'humano')),
  UNIQUE NULLS NOT DISTINCT (artefato_id, pacote_slug, playbook_slug, passo_codigo)
);

CREATE INDEX IF NOT EXISTS idx_artefato_relacoes_destino ON public.artefato_relacoes (destino_id);
CREATE INDEX IF NOT EXISTS idx_artefato_playbook_artefato ON public.artefato_playbook (artefato_id);

COMMENT ON TABLE public.artefatos_ia IS
  'dono=Lider de Dados; retencao=R12; Espelho do catalogo de IA (agentes, skills, workflows) do repositorio do aluno, com o conteudo integral. authenticated so le (agentes.read); escrita so por sincronizar_catalogo_ia(jsonb) com service_role. Artefato que some do repositorio vira aposentado, nunca e apagado.';
COMMENT ON COLUMN public.artefatos_ia.id IS
  'classe=nenhum; chave do artefato. artefato_arquivos, artefato_relacoes e artefato_playbook apontam pra ca.';
COMMENT ON COLUMN public.artefatos_ia.tipo IS
  'classe=nenhum; agente, skill ou workflow.';
COMMENT ON COLUMN public.artefatos_ia.nome IS
  'classe=nenhum; identificador do artefato ([a-z0-9._-], ate 80), nome de ferramenta e nao de pessoa. Com o tipo, e a chave do upsert do sync.';
COMMENT ON COLUMN public.artefatos_ia.time IS
  'classe=nenhum; time/agrupamento do artefato. Agrupa os cards na tela.';
COMMENT ON COLUMN public.artefatos_ia.origem IS
  'classe=nenhum; de onde veio: nucleo, time, plugin, sistema ou casa.';
COMMENT ON COLUMN public.artefatos_ia.resumo IS
  'classe=nenhum; uma linha (ate 140 caracteres) do que o artefato faz. O card mostra nome + resumo.';
COMMENT ON COLUMN public.artefatos_ia.descricao IS
  'classe=nenhum; o que o artefato faz, em linguagem de gente. NULL = nao declarada.';
COMMENT ON COLUMN public.artefatos_ia.quando IS
  'classe=nenhum; quando acionar o artefato. NULL = sem regra de acionamento.';
COMMENT ON COLUMN public.artefatos_ia.gatilho IS
  'classe=nenhum; o que dispara o workflow (push, cron, manual). NULL = nao se aplica.';
COMMENT ON COLUMN public.artefatos_ia.le IS
  'classe=nenhum; o que o artefato le, declarado na fonte. NULL = nao declarado.';
COMMENT ON COLUMN public.artefatos_ia.grava IS
  'classe=nenhum; o que o artefato grava, declarado na fonte. NULL = nao declarado.';
COMMENT ON COLUMN public.artefatos_ia.formato IS
  'classe=nenhum; formato do conteudo: markdown, toml, yaml ou texto.';
COMMENT ON COLUMN public.artefatos_ia.conteudo IS
  'classe=nenhum; texto integral do arquivo principal (toml do agente, SKILL.md, yml). Varrido contra segredo na RPC.';
COMMENT ON COLUMN public.artefatos_ia.caminho IS
  'classe=nenhum; caminho do arquivo principal no repositorio (ou plugin:<pacote>/...).';
COMMENT ON COLUMN public.artefatos_ia.hash IS
  'classe=nenhum; sha256 hex dos arquivos do artefato; muda quando o repositorio muda.';
COMMENT ON COLUMN public.artefatos_ia.estado IS
  'classe=nenhum; instalado, disponivel ou aposentado. Calculado pelo sync, nunca editado na tela.';
COMMENT ON COLUMN public.artefatos_ia.conferido_em IS
  'classe=nenhum; quando o sync conferiu este artefato pela ultima vez.';
COMMENT ON COLUMN public.artefatos_ia.criado_em IS
  'classe=nenhum; quando o artefato entrou no catalogo.';
COMMENT ON COLUMN public.artefatos_ia.atualizada_em IS
  'classe=nenhum; mantida pelo trigger trg_artefatos_ia_atualizada_em.';
COMMENT ON TABLE public.artefato_arquivos IS
  'dono=Lider de Dados; retencao=R12; Arquivos de cada artefato (scripts, referencias) com conteudo integral; conteudo NULL = arquivo acima de 256 KB. Reescrito a cada sync do artefato.';
COMMENT ON COLUMN public.artefato_arquivos.id IS
  'classe=nenhum; chave do arquivo.';
COMMENT ON COLUMN public.artefato_arquivos.artefato_id IS
  'classe=nenhum; artefato dono do arquivo (artefatos_ia.id). Apagar o artefato apaga os arquivos.';
COMMENT ON COLUMN public.artefato_arquivos.caminho IS
  'classe=nenhum; caminho do arquivo relativo ao artefato. Unico por artefato.';
COMMENT ON COLUMN public.artefato_arquivos.linguagem IS
  'classe=nenhum; linguagem pra destacar o codigo: python, bash, javascript, typescript, sql, toml, yaml, json, markdown ou texto.';
COMMENT ON COLUMN public.artefato_arquivos.conteudo IS
  'classe=nenhum; texto integral do arquivo, varrido contra segredo na RPC. NULL = arquivo acima de 256 KB.';
COMMENT ON COLUMN public.artefato_arquivos.bytes IS
  'classe=nenhum; tamanho do arquivo em bytes.';
COMMENT ON COLUMN public.artefato_arquivos.hash IS
  'classe=nenhum; sha256 hex do arquivo.';
COMMENT ON TABLE public.artefato_relacoes IS
  'dono=Lider de Dados; retencao=R12; Quem usa quem no catalogo (agente usa skill, skill usa agente, workflow usa skill). Reescrito a cada sync pela origem.';
COMMENT ON COLUMN public.artefato_relacoes.id IS
  'classe=nenhum; chave da relacao.';
COMMENT ON COLUMN public.artefato_relacoes.origem_id IS
  'classe=nenhum; artefato que usa o outro (artefatos_ia.id). A origem e dona: o sync reescreve as relacoes dela.';
COMMENT ON COLUMN public.artefato_relacoes.destino_id IS
  'classe=nenhum; artefato usado (artefatos_ia.id).';
COMMENT ON COLUMN public.artefato_relacoes.tipo IS
  'classe=nenhum; tipo da relacao; hoje so usa.';
COMMENT ON TABLE public.artefato_playbook IS
  'dono=Lider de Dados; retencao=R12; Elo I25: passo do playbook do cargo (organograma) -> artefato que o executa. Chave textual (pacote_slug, playbook_slug, passo_codigo), sem FK entre schemas (GA-05). Nasce vazia; escrita so service_role.';
COMMENT ON COLUMN public.artefato_playbook.id IS
  'classe=nenhum; chave do elo.';
COMMENT ON COLUMN public.artefato_playbook.artefato_id IS
  'classe=nenhum; artefato que executa o passo (artefatos_ia.id).';
COMMENT ON COLUMN public.artefato_playbook.pacote_slug IS
  'classe=nenhum; slug do pacote do cargo no organograma. Chave textual, sem FK entre schemas (GA-05).';
COMMENT ON COLUMN public.artefato_playbook.playbook_slug IS
  'classe=nenhum; slug do playbook dentro do pacote.';
COMMENT ON COLUMN public.artefato_playbook.passo_codigo IS
  'classe=nenhum; codigo do passo do playbook. NULL = o artefato serve o playbook inteiro.';
COMMENT ON COLUMN public.artefato_playbook.forma IS
  'classe=nenhum; como o passo e executado: prompt, skill, workflow, agente, multiagente ou humano.';

DROP TRIGGER IF EXISTS trg_artefatos_ia_atualizada_em ON public.artefatos_ia;
CREATE TRIGGER trg_artefatos_ia_atualizada_em
  BEFORE UPDATE ON public.artefatos_ia
  FOR EACH ROW EXECUTE FUNCTION public.set_atualizada_em();

ALTER TABLE public.artefatos_ia ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.artefato_arquivos ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.artefato_relacoes ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.artefato_playbook ENABLE ROW LEVEL SECURITY;

REVOKE ALL ON public.artefatos_ia, public.artefato_arquivos, public.artefato_relacoes, public.artefato_playbook
  FROM PUBLIC, anon, authenticated;
GRANT SELECT ON public.artefatos_ia, public.artefato_arquivos, public.artefato_relacoes, public.artefato_playbook
  TO authenticated;
GRANT ALL ON public.artefatos_ia, public.artefato_arquivos, public.artefato_relacoes, public.artefato_playbook
  TO service_role;
REVOKE ALL ON SEQUENCE public.artefato_arquivos_id_seq, public.artefato_relacoes_id_seq, public.artefato_playbook_id_seq
  FROM PUBLIC, anon, authenticated;

DROP POLICY IF EXISTS artefatos_ia_select ON public.artefatos_ia;
CREATE POLICY artefatos_ia_select ON public.artefatos_ia
  FOR SELECT TO authenticated USING (public.tem_permissao('agentes.read'));
DROP POLICY IF EXISTS artefato_arquivos_select ON public.artefato_arquivos;
CREATE POLICY artefato_arquivos_select ON public.artefato_arquivos
  FOR SELECT TO authenticated USING (public.tem_permissao('agentes.read'));
DROP POLICY IF EXISTS artefato_relacoes_select ON public.artefato_relacoes;
CREATE POLICY artefato_relacoes_select ON public.artefato_relacoes
  FOR SELECT TO authenticated USING (public.tem_permissao('agentes.read'));
DROP POLICY IF EXISTS artefato_playbook_select ON public.artefato_playbook;
CREATE POLICY artefato_playbook_select ON public.artefato_playbook
  FOR SELECT TO authenticated USING (public.tem_permissao('agentes.read'));

CREATE OR REPLACE FUNCTION public.sincronizar_catalogo_ia(p_catalogo jsonb)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  -- Fonte unica: PADRAO_SEGREDO de .githooks/regras-segredo.sh da Casa, copiado sem alteracao (a
  -- sintaxe e a mesma em grep -E, Python re e Postgres ARE). O sincronizar_catalogo.py tem outra copia e
  -- um teste confere as tres. Mexeu na regra? Mexa nas tres.
  -- Nao escreva aqui exemplo literal que case o padrao: o commit do aluno seria barrado.
  c_segredo constant text := '((^|[^A-Za-z0-9])sk-[A-Za-z0-9]{8,}|ghp_[A-Za-z0-9]{8,}|sb_secret_[A-Za-z0-9]|AKIA[0-9A-Z]{12,}|-----BEGIN [A-Z ]*PRIVATE KEY|sk_live_[A-Za-z0-9]{8,}|github_pat_[A-Za-z0-9_]{20,}|xox[baprs]-[A-Za-z0-9-]{10,}|AIza[0-9A-Za-z_-]{35}|sk-(proj|ant|svcacct|admin)-[A-Za-z0-9_-]{20,})';
  v_topo text[] := ARRAY['agentes', 'artefatos', 'relacoes', 'manter'];
  v_perm_art text[] := ARRAY['tipo','nome','time','origem','resumo','descricao','quando','gatilho','le','grava',
                             'formato','conteudo','caminho','hash','estado','arquivos'];
  v_perm_arq text[] := ARRAY['caminho','linguagem','conteudo','bytes','hash'];
  v_perm_rel text[] := ARRAY['origem_tipo','origem_nome','destino_tipo','destino_nome','tipo'];
  v_perm_man text[] := ARRAY['tipo','nome'];
  v_k text;
  v_a jsonb;
  v_f jsonb;
  v_r jsonb;
  v_id uuid;
  v_ids uuid[] := '{}';
  v_donas uuid[] := '{}';
  v_origem uuid;
  v_destino uuid;
  v_tmp integer;
  v_n_ag integer := 0;
  v_n_art integer := 0;
  v_n_arq integer := 0;
  v_n_rel integer := 0;
  v_n_apos integer := 0;
BEGIN
  IF p_catalogo IS NULL OR jsonb_typeof(p_catalogo) <> 'object' THEN
    RAISE EXCEPTION 'sincronizar_catalogo_ia: p_catalogo deve ser um objeto jsonb {agentes, artefatos, relacoes, manter}';
  END IF;
  FOR v_k IN SELECT jsonb_object_keys(p_catalogo) LOOP
    IF NOT (v_k = ANY (v_topo)) THEN
      RAISE EXCEPTION 'sincronizar_catalogo_ia: chave de topo desconhecida "%" (permitidas: %)', v_k, array_to_string(v_topo, ', ');
    END IF;
    IF jsonb_typeof(p_catalogo->v_k) <> 'array' THEN
      RAISE EXCEPTION 'sincronizar_catalogo_ia: "%" deve ser um array', v_k;
    END IF;
  END LOOP;

  -- 1) Valida TUDO antes de escrever (tudo ou nada), inclusive a varredura de segredo.
  FOR v_a IN SELECT * FROM jsonb_array_elements(coalesce(p_catalogo->'artefatos', '[]'::jsonb)) LOOP
    IF jsonb_typeof(v_a) <> 'object' THEN
      RAISE EXCEPTION 'sincronizar_catalogo_ia: cada artefato deve ser um objeto';
    END IF;
    FOR v_k IN SELECT jsonb_object_keys(v_a) LOOP
      IF NOT (v_k = ANY (v_perm_art)) THEN
        RAISE EXCEPTION 'sincronizar_catalogo_ia: chave desconhecida "%" no artefato %/% (permitidas: %)',
          v_k, coalesce(v_a->>'tipo', '?'), coalesce(v_a->>'nome', '?'), array_to_string(v_perm_art, ', ');
      END IF;
    END LOOP;
    IF coalesce(v_a->>'conteudo', '') ~ c_segredo THEN
      RAISE EXCEPTION 'sincronizar_catalogo_ia: possivel segredo no conteudo de %/% (%) — nada foi gravado',
        v_a->>'tipo', v_a->>'nome', v_a->>'caminho';
    END IF;
    FOR v_f IN SELECT * FROM jsonb_array_elements(coalesce(v_a->'arquivos', '[]'::jsonb)) LOOP
      FOR v_k IN SELECT jsonb_object_keys(v_f) LOOP
        IF NOT (v_k = ANY (v_perm_arq)) THEN
          RAISE EXCEPTION 'sincronizar_catalogo_ia: chave desconhecida "%" em arquivo de %/%', v_k, v_a->>'tipo', v_a->>'nome';
        END IF;
      END LOOP;
      IF coalesce(v_f->>'conteudo', '') ~ c_segredo THEN
        RAISE EXCEPTION 'sincronizar_catalogo_ia: possivel segredo em %/% arquivo % — nada foi gravado',
          v_a->>'tipo', v_a->>'nome', v_f->>'caminho';
      END IF;
    END LOOP;
  END LOOP;
  FOR v_r IN SELECT * FROM jsonb_array_elements(coalesce(p_catalogo->'relacoes', '[]'::jsonb)) LOOP
    FOR v_k IN SELECT jsonb_object_keys(v_r) LOOP
      IF NOT (v_k = ANY (v_perm_rel)) THEN
        RAISE EXCEPTION 'sincronizar_catalogo_ia: chave desconhecida "%" em relacao', v_k;
      END IF;
    END LOOP;
  END LOOP;

  FOR v_r IN SELECT * FROM jsonb_array_elements(coalesce(p_catalogo->'manter', '[]'::jsonb)) LOOP
    IF jsonb_typeof(v_r) <> 'object' THEN
      RAISE EXCEPTION 'sincronizar_catalogo_ia: cada item de manter deve ser um objeto {tipo, nome}';
    END IF;
    FOR v_k IN SELECT jsonb_object_keys(v_r) LOOP
      IF NOT (v_k = ANY (v_perm_man)) THEN
        RAISE EXCEPTION 'sincronizar_catalogo_ia: chave desconhecida "%" em manter (permitidas: tipo, nome)', v_k;
      END IF;
    END LOOP;
    IF coalesce(v_r->>'tipo', '') NOT IN ('agente', 'skill', 'workflow') OR coalesce(v_r->>'nome', '') = '' THEN
      RAISE EXCEPTION 'sincronizar_catalogo_ia: item de manter precisa de tipo (agente, skill ou workflow) e nome';
    END IF;
  END LOOP;

  -- 2) Agentes: reuso da sincronizar_agentes (0008), mesma regra de aposentar.
  IF p_catalogo ? 'agentes' THEN
    v_n_ag := public.sincronizar_agentes(p_catalogo->'agentes');
  END IF;

  -- 3) Upsert por (tipo, nome); arquivos reescritos por artefato.
  FOR v_a IN SELECT * FROM jsonb_array_elements(coalesce(p_catalogo->'artefatos', '[]'::jsonb)) LOOP
    INSERT INTO public.artefatos_ia
      (tipo, nome, time, origem, resumo, descricao, quando, gatilho, le, grava,
       formato, conteudo, caminho, hash, estado, conferido_em)
    VALUES (
      v_a->>'tipo', v_a->>'nome', v_a->>'time', v_a->>'origem', v_a->>'resumo', v_a->>'descricao',
      v_a->>'quando', v_a->>'gatilho', v_a->>'le', v_a->>'grava', v_a->>'formato', v_a->>'conteudo',
      v_a->>'caminho', v_a->>'hash', v_a->>'estado', now()
    )
    ON CONFLICT (tipo, nome) DO UPDATE SET
      time = EXCLUDED.time, origem = EXCLUDED.origem, resumo = EXCLUDED.resumo,
      descricao = EXCLUDED.descricao, quando = EXCLUDED.quando, gatilho = EXCLUDED.gatilho,
      le = EXCLUDED.le, grava = EXCLUDED.grava, formato = EXCLUDED.formato,
      conteudo = EXCLUDED.conteudo, caminho = EXCLUDED.caminho, hash = EXCLUDED.hash,
      estado = EXCLUDED.estado, conferido_em = now()
    RETURNING id INTO v_id;
    v_ids := v_ids || v_id;
    v_n_art := v_n_art + 1;

    DELETE FROM public.artefato_arquivos WHERE artefato_id = v_id;
    INSERT INTO public.artefato_arquivos (artefato_id, caminho, linguagem, conteudo, bytes, hash)
    SELECT v_id, f->>'caminho', f->>'linguagem', f->>'conteudo', (f->>'bytes')::integer, f->>'hash'
      FROM jsonb_array_elements(coalesce(v_a->'arquivos', '[]'::jsonb)) f;
    GET DIAGNOSTICS v_tmp = ROW_COUNT;
    v_n_arq := v_n_arq + v_tmp;
  END LOOP;

  -- 4) Relacoes (so se a chave vier; lote sem relacoes nao toca nelas). Origens donas = o catalogo
  --    COMPLETO em manter (varios lotes) ou, sem manter, os artefatos deste payload.
  IF p_catalogo ? 'relacoes' THEN
    IF p_catalogo ? 'manter' THEN
      SELECT coalesce(array_agg(a.id), '{}') INTO v_donas
        FROM jsonb_array_elements(p_catalogo->'manter') m
        JOIN public.artefatos_ia a ON a.tipo = m->>'tipo' AND a.nome = m->>'nome';
    ELSE
      v_donas := v_ids;
    END IF;
    DELETE FROM public.artefato_relacoes WHERE origem_id = ANY (v_donas);
    FOR v_r IN SELECT * FROM jsonb_array_elements(p_catalogo->'relacoes') LOOP
      SELECT id INTO v_origem FROM public.artefatos_ia
       WHERE tipo = v_r->>'origem_tipo' AND nome = v_r->>'origem_nome';
      SELECT id INTO v_destino FROM public.artefatos_ia
       WHERE tipo = v_r->>'destino_tipo' AND nome = v_r->>'destino_nome';
      IF v_origem IS NULL OR v_destino IS NULL OR NOT (v_origem = ANY (v_donas)) THEN
        RAISE EXCEPTION 'sincronizar_catalogo_ia: relacoes %/% -> %/% nao resolve (as duas pontas precisam existir e a origem vir no payload ou em manter)',
          v_r->>'origem_tipo', v_r->>'origem_nome', v_r->>'destino_tipo', v_r->>'destino_nome';
      END IF;
      INSERT INTO public.artefato_relacoes (origem_id, destino_id, tipo)
      VALUES (v_origem, v_destino, coalesce(v_r->>'tipo', 'usa'))
      ON CONFLICT (origem_id, destino_id, tipo) DO NOTHING;
      GET DIAGNOSTICS v_tmp = ROW_COUNT;
      v_n_rel := v_n_rel + v_tmp;
    END LOOP;
  END IF;

  -- 5) Quem sumiu do repositorio vira aposentado (nao apaga: o elo I25 aponta pra ele).
  --    Com manter: aposenta o que nao esta nele (catalogo completo, qualquer lote). Sem manter: so
  --    quando a chave artefatos vem, aposenta o que nao veio no payload. Sem nenhuma das duas, nunca.
  IF p_catalogo ? 'manter' THEN
    UPDATE public.artefatos_ia a
       SET estado = 'aposentado', conferido_em = now()
     WHERE a.estado <> 'aposentado'
       AND NOT EXISTS (SELECT 1 FROM jsonb_array_elements(p_catalogo->'manter') m
                        WHERE m->>'tipo' = a.tipo AND m->>'nome' = a.nome);
    GET DIAGNOSTICS v_n_apos = ROW_COUNT;
  ELSIF p_catalogo ? 'artefatos' THEN
    UPDATE public.artefatos_ia
       SET estado = 'aposentado', conferido_em = now()
     WHERE NOT (id = ANY (v_ids)) AND estado <> 'aposentado';
    GET DIAGNOSTICS v_n_apos = ROW_COUNT;
  END IF;

  RETURN jsonb_build_object('agentes', v_n_ag, 'artefatos', v_n_art, 'arquivos', v_n_arq,
                            'relacoes', v_n_rel, 'aposentados', v_n_apos);
END;
$$;

COMMENT ON FUNCTION public.sincronizar_catalogo_ia(jsonb) IS
  'Espelha o catalogo de IA do repositorio do aluno. Payload {agentes, artefatos, relacoes, manter} GERADO por polozi-instalar-time/scripts/sincronizar_catalogo.py, nunca a mao. Valida tudo antes (chave desconhecida ou possivel segredo = excecao sem gravar nada). agentes -> sincronizar_agentes; artefatos -> upsert por (tipo, nome) com arquivos reescritos; relacoes so se a chave vier, reescritas pela origem. Catalogo grande vai em lotes: manter = [{tipo, nome}] com o catalogo COMPLETO (todos os lotes); com manter, o que nao esta nele vira aposentado e as origens de relacao sao as dele; sem manter, aposenta o que nao veio em artefatos (so se a chave vier). Sem artefatos nem manter nunca aposenta. Somente service_role.';

REVOKE ALL ON FUNCTION public.sincronizar_catalogo_ia(jsonb) FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.sincronizar_catalogo_ia(jsonb) TO service_role;

DO $$
DECLARE
  v_t text;
  v_falha text := NULL;
  v_r1 jsonb; v_r2 jsonb;
  v_segredo_barrado boolean := false;
  v_chave_barrada boolean := false;
  v_aposentou boolean := false;
  v_so_agentes_ok boolean := false;
  v_item jsonb := jsonb_build_object(
    'tipo', 'skill', 'nome', 'smoke-0022', 'time', 'sistema', 'origem', 'casa', 'resumo', 'Smoke',
    'formato', 'markdown', 'conteudo', '# smoke', 'caminho', 'smoke', 'hash', repeat('a', 64), 'estado', 'instalado',
    'arquivos', jsonb_build_array(jsonb_build_object('caminho', 'a.py', 'linguagem', 'python',
      'conteudo', 'x', 'bytes', 1, 'hash', repeat('b', 64))));
BEGIN
  FOREACH v_t IN ARRAY ARRAY['public.artefatos_ia', 'public.artefato_arquivos', 'public.artefato_relacoes', 'public.artefato_playbook'] LOOP
    IF to_regclass(v_t) IS NULL THEN
      RAISE EXCEPTION 'smoke 0022: % nao criada — a tela de skills e workflows quebra', v_t;
    END IF;
    IF NOT (SELECT relrowsecurity FROM pg_class WHERE oid = v_t::regclass) THEN
      RAISE EXCEPTION 'smoke 0022: RLS desligada em % — qualquer usuario logado leria o catalogo', v_t;
    END IF;
    IF NOT has_table_privilege('authenticated', v_t, 'SELECT') THEN
      RAISE EXCEPTION 'smoke 0022: authenticated sem SELECT em % — a pagina renderiza VAZIA sem erro', v_t;
    END IF;
    IF has_table_privilege('authenticated', v_t, 'INSERT') OR has_table_privilege('authenticated', v_t, 'UPDATE')
       OR has_table_privilege('authenticated', v_t, 'DELETE') THEN
      RAISE EXCEPTION 'smoke 0022: authenticated escreve em % — o catalogo e espelho do repositorio, so o sync escreve', v_t;
    END IF;
    IF has_table_privilege('anon', v_t, 'SELECT') THEN
      RAISE EXCEPTION 'smoke 0022: anon tem SELECT em % — chave publica vaza o catalogo e o codigo da IA', v_t;
    END IF;
    IF NOT EXISTS (SELECT 1 FROM pg_policies WHERE schemaname = 'public' AND tablename = split_part(v_t, '.', 2)
                   AND qual LIKE '%agentes.read%') THEN
      RAISE EXCEPTION 'smoke 0022: policy de leitura com agentes.read ausente em % — RLS bloqueia tudo e a pagina fica vazia', v_t;
    END IF;
  END LOOP;

  IF NOT has_function_privilege('service_role', 'public.sincronizar_catalogo_ia(jsonb)', 'EXECUTE') THEN
    RAISE EXCEPTION 'smoke 0022: service_role sem EXECUTE na RPC — o sync do catalogo falha';
  END IF;
  IF has_function_privilege('anon', 'public.sincronizar_catalogo_ia(jsonb)', 'EXECUTE')
     OR has_function_privilege('authenticated', 'public.sincronizar_catalogo_ia(jsonb)', 'EXECUTE') THEN
    RAISE EXCEPTION 'smoke 0022: anon/authenticated executa a RPC — qualquer visitante reescreveria o catalogo (REVOKE FROM PUBLIC sumiu)';
  END IF;

  BEGIN
    v_r1 := public.sincronizar_catalogo_ia(jsonb_build_object('artefatos', jsonb_build_array(v_item)));
    v_r2 := public.sincronizar_catalogo_ia(jsonb_build_object('artefatos', jsonb_build_array(v_item)));
    IF (SELECT count(*) FROM public.artefatos_ia WHERE nome = 'smoke-0022') <> 1
       OR (SELECT count(*) FROM public.artefato_arquivos f JOIN public.artefatos_ia a ON a.id = f.artefato_id
            WHERE a.nome = 'smoke-0022') <> 1 THEN
      v_falha := 'rodar o sync 2x duplicou artefato ou arquivo';
    END IF;
    PERFORM public.sincronizar_catalogo_ia('{"agentes":[]}'::jsonb - 'agentes');
    v_so_agentes_ok := EXISTS (SELECT 1 FROM public.artefatos_ia WHERE nome = 'smoke-0022' AND estado = 'instalado');
    PERFORM public.sincronizar_catalogo_ia('{"artefatos":[]}'::jsonb);
    v_aposentou := EXISTS (SELECT 1 FROM public.artefatos_ia WHERE nome = 'smoke-0022' AND estado = 'aposentado');
    BEGIN
      PERFORM public.sincronizar_catalogo_ia(jsonb_build_object('artefatos', jsonb_build_array(
        jsonb_set(v_item, '{conteudo}', to_jsonb('k ' || 'sk' || '-' || repeat('a', 12))))));
    EXCEPTION WHEN raise_exception THEN v_segredo_barrado := true; END;
    BEGIN
      PERFORM public.sincronizar_catalogo_ia('{"invento":[]}'::jsonb);
    EXCEPTION WHEN raise_exception THEN v_chave_barrada := true; END;
    RAISE EXCEPTION 'smoke 0022: desfazendo as linhas de teste' USING ERRCODE = 'P0999';
  EXCEPTION WHEN SQLSTATE 'P0999' THEN
    NULL;
  END;

  IF v_falha IS NOT NULL THEN
    RAISE EXCEPTION 'smoke 0022: %', v_falha;
  END IF;
  IF NOT v_so_agentes_ok THEN
    RAISE EXCEPTION 'smoke 0022: payload sem a chave artefatos aposentou artefato — sync so de agentes apagaria a tela';
  END IF;
  IF NOT v_aposentou THEN
    RAISE EXCEPTION 'smoke 0022: artefato fora do payload nao virou aposentado — a tela mostraria skill que nao existe mais';
  END IF;
  IF NOT v_segredo_barrado THEN
    RAISE EXCEPTION 'smoke 0022: conteudo com segredo foi aceito — chave de API iria parar no banco';
  END IF;
  IF NOT v_chave_barrada THEN
    RAISE EXCEPTION 'smoke 0022: chave de topo desconhecida aceita — typo no payload passaria calado';
  END IF;
END $$;

-- Rollback:
--   DROP FUNCTION IF EXISTS public.sincronizar_catalogo_ia(jsonb);
--   DROP TABLE IF EXISTS public.artefato_playbook, public.artefato_relacoes, public.artefato_arquivos, public.artefatos_ia;
