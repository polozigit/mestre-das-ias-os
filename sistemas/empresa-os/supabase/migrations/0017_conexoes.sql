-- 0017_conexoes.sql
-- Inventario de conexoes com servicos externos (GitHub, Supabase, Vercel...) e a
-- escrita de segredo no Vault pelo script da IA (ADR-025; decisao do Polozi de
-- 06/10/2026, frente "conectar ferramentas" do kit do aluno).
--   1) modulo `conexoes` (base, em public; dono CTO) e slugs conexoes.read / .manage
--   2) public.conexao: uma linha por (servico, conta, escopo), com o NOME do segredo no
--      Vault (nunca o valor), as copias de uso (GitHub secret, env da Vercel...) e as
--      datas de prova e rotacao. A tela so le; credenciais/CONEXOES.md vira espelho.
--   3) public.registrar_conexao(...): upsert pela chave natural; so service_role
--   4) public.guardar_segredo(nome, valor): cria ou troca o segredo no Vault; so
--      service_role; devolve o id do segredo, nunca o valor
-- A LEITURA do segredo continua so por public.segredo() (gate 4, 0001). Limite
-- conhecido (disciplina, nao tranca): quem tem a chave de servico tambem executa
-- public.segredo(); o script da IA nao tem operacao que a chame e o hook da Casa
-- bloqueia `segredo(` em chamada da IA. Depende de 0001, 0003/0004, 0007, 0012/0013.
-- Rollback ao fim.

INSERT INTO public.modulo (slug, nome, descricao, dono, schema_nome, classe, ligado) VALUES
  ('conexoes', 'Conexoes', 'Inventario das conexoes com servicos externos e de onde mora cada segredo (o valor fica no Vault)', 'CTO', NULL, 'essencial', true)
ON CONFLICT (slug) DO NOTHING;

-- PERMISSOES:INICIO
INSERT INTO public.permissoes (slug, modulo, acao, descricao) VALUES
  ('conexoes.read', 'conexoes', 'read', 'Ver as conexoes com servicos externos (sem o valor de nenhum segredo)'),
  ('conexoes.manage', 'conexoes', 'manage', 'Gerir as conexoes com servicos externos (reservado; hoje so o script da IA escreve)')
ON CONFLICT (slug) DO NOTHING;
-- PERMISSOES:FIM

CREATE TABLE IF NOT EXISTS public.conexao (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  servico text NOT NULL CHECK (servico ~ '^[a-z0-9][a-z0-9_-]*$'),
  conta text NOT NULL CHECK (length(trim(conta)) > 0),
  escopo text NOT NULL DEFAULT 'padrao' CHECK (length(trim(escopo)) > 0),
  dono_usuario_id uuid CONSTRAINT fk_conexao_dono REFERENCES public.usuarios(id),
  dono_papel text CHECK (dono_papel IS NULL OR dono_papel ~ '^[a-z][a-z0-9_]*$'),
  segredo_ref text UNIQUE CHECK (segredo_ref IS NULL OR segredo_ref ~ '^[A-Za-z0-9_.-]+$'),
  copias text[] NOT NULL DEFAULT '{}'
    CHECK (copias <@ ARRAY['github_secret', 'vercel_env:production', 'vercel_env:preview',
                           'vercel_env:development', 'arquivo_env']::text[]),
  aplicacao_ref text,
  estado text NOT NULL DEFAULT 'ativo' CHECK (estado IN ('ativo', 'invalido', 'revogado')),
  provado_em date,
  rotacionado_em date,
  rotacionar_ate date,
  ultimo_uso_em date,
  criada_em timestamptz NOT NULL DEFAULT now(),
  atualizada_em timestamptz NOT NULL DEFAULT now(),
  CONSTRAINT uq_conexao UNIQUE (servico, conta, escopo),
  CONSTRAINT ck_conexao_um_dono CHECK (num_nonnulls(dono_usuario_id, dono_papel) = 1)
);
CREATE INDEX IF NOT EXISTS idx_conexao_dono ON public.conexao (dono_usuario_id) WHERE dono_usuario_id IS NOT NULL;

COMMENT ON TABLE public.conexao IS
  'dono=CTO; retencao=R13; Inventario de conexoes com servicos externos: fonte da verdade (credenciais/CONEXOES.md e espelho gerado, nao editar). Guarda o NOME do segredo no Vault (segredo_ref), nunca o valor. Escrita so por public.registrar_conexao (service_role); leitura por conexoes.read (ADR-025).';
COMMENT ON COLUMN public.conexao.servico IS 'classe=nenhum; servico externo (github, supabase, vercel, openai...).';
COMMENT ON COLUMN public.conexao.conta IS 'classe=pessoal; conta no servico (usuario, e-mail ou organizacao).';
COMMENT ON COLUMN public.conexao.escopo IS 'classe=nenhum; o que a credencial alcanca (repo, projeto, permissao).';
COMMENT ON COLUMN public.conexao.dono_usuario_id IS 'classe=pessoal; pessoa responsavel (usuarios.id). Exatamente um entre dono_usuario_id e dono_papel.';
COMMENT ON COLUMN public.conexao.dono_papel IS 'classe=nenhum; papel responsavel quando nao e uma pessoa (ex.: cto, dono).';
COMMENT ON COLUMN public.conexao.segredo_ref IS 'classe=nenhum; NOME do segredo em vault.secrets (o valor nunca passa por esta tabela). NULL = conexao sem segredo (ex.: OAuth na propria plataforma).';
COMMENT ON COLUMN public.conexao.copias IS 'classe=nenhum; onde existe copia de uso do segredo (github_secret, vercel_env:production|preview|development, arquivo_env): a rotacao precisa trocar em todas.';
COMMENT ON COLUMN public.conexao.aplicacao_ref IS 'classe=nenhum; aplicacao do cadastro de TI (plataforma.aplicacao), sem FK ate o modulo existir.';
COMMENT ON COLUMN public.conexao.estado IS 'classe=nenhum; ativo, invalido (falhou na prova) ou revogado.';
COMMENT ON COLUMN public.conexao.provado_em IS 'classe=nenhum; ultima vez que a conexao foi testada e funcionou.';
COMMENT ON COLUMN public.conexao.rotacionado_em IS 'classe=nenhum; ultima troca do segredo.';
COMMENT ON COLUMN public.conexao.rotacionar_ate IS 'classe=nenhum; data limite da proxima troca (validade do token ou politica).';
COMMENT ON COLUMN public.conexao.ultimo_uso_em IS 'classe=nenhum; ultimo uso conhecido (opcional).';

DROP TRIGGER IF EXISTS trg_conexao_atualizada_em ON public.conexao;
CREATE TRIGGER trg_conexao_atualizada_em BEFORE UPDATE ON public.conexao
  FOR EACH ROW EXECUTE FUNCTION public.set_atualizada_em();

ALTER TABLE public.conexao ENABLE ROW LEVEL SECURITY;
REVOKE ALL ON public.conexao FROM PUBLIC, anon, authenticated;
GRANT SELECT ON public.conexao TO authenticated;
GRANT ALL ON public.conexao TO service_role;

DROP POLICY IF EXISTS conexao_select ON public.conexao;
CREATE POLICY conexao_select ON public.conexao FOR SELECT TO authenticated
  USING (public.tem_permissao('conexoes.read'));

-- ---------------------------------------------------------------------------
-- RPC de escrita do inventario (so service_role: o script da IA)
-- ---------------------------------------------------------------------------
CREATE OR REPLACE FUNCTION public.registrar_conexao(
  p_servico text,
  p_conta text,
  p_escopo text DEFAULT 'padrao',
  p_segredo_ref text DEFAULT NULL,
  p_dono_usuario_id uuid DEFAULT NULL,
  p_dono_papel text DEFAULT NULL,
  p_copias text[] DEFAULT '{}',
  p_aplicacao_ref text DEFAULT NULL,
  p_estado text DEFAULT 'ativo',
  p_provado_em date DEFAULT NULL,
  p_rotacionado_em date DEFAULT NULL,
  p_rotacionar_ate date DEFAULT NULL,
  p_ultimo_uso_em date DEFAULT NULL)
RETURNS uuid
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_id uuid;
BEGIN
  -- o segredo citado tem que existir no Vault (so o nome e conferido)
  IF p_segredo_ref IS NOT NULL THEN
    IF to_regclass('vault.secrets') IS NULL THEN
      RAISE EXCEPTION 'Vault indisponivel neste banco: nao da para conferir o segredo %', p_segredo_ref;
    END IF;
    IF NOT EXISTS (SELECT 1 FROM vault.secrets s WHERE s.name = p_segredo_ref) THEN
      RAISE EXCEPTION 'segredo % nao existe no Vault: guarde com public.guardar_segredo antes de registrar a conexao', p_segredo_ref;
    END IF;
  END IF;

  INSERT INTO public.conexao AS c (servico, conta, escopo, segredo_ref, dono_usuario_id, dono_papel, copias,
                                   aplicacao_ref, estado, provado_em, rotacionado_em, rotacionar_ate, ultimo_uso_em)
  VALUES (lower(trim(p_servico)), trim(p_conta), coalesce(nullif(trim(p_escopo), ''), 'padrao'), p_segredo_ref,
          p_dono_usuario_id, p_dono_papel, coalesce(p_copias, '{}'), p_aplicacao_ref, coalesce(p_estado, 'ativo'),
          p_provado_em, p_rotacionado_em, p_rotacionar_ate, p_ultimo_uso_em)
  ON CONFLICT (servico, conta, escopo) DO UPDATE
    SET segredo_ref = EXCLUDED.segredo_ref,
        dono_usuario_id = EXCLUDED.dono_usuario_id,
        dono_papel = EXCLUDED.dono_papel,
        copias = EXCLUDED.copias,
        aplicacao_ref = coalesce(EXCLUDED.aplicacao_ref, c.aplicacao_ref),
        estado = EXCLUDED.estado,
        -- data nao informada nao apaga a que ja existia
        provado_em = coalesce(EXCLUDED.provado_em, c.provado_em),
        rotacionado_em = coalesce(EXCLUDED.rotacionado_em, c.rotacionado_em),
        rotacionar_ate = coalesce(EXCLUDED.rotacionar_ate, c.rotacionar_ate),
        ultimo_uso_em = coalesce(EXCLUDED.ultimo_uso_em, c.ultimo_uso_em)
  RETURNING c.id INTO v_id;

  INSERT INTO public.atividade (tipo, descricao, metadata)
  VALUES ('conexao_registrada', 'Conexao registrada: ' || lower(trim(p_servico)),
          jsonb_build_object('conexao_id', v_id, 'servico', lower(trim(p_servico))));
  RETURN v_id;
END;
$$;

COMMENT ON FUNCTION public.registrar_conexao(text, text, text, text, uuid, text, text[], text, text, date, date, date, date) IS
  'Operacao fixa do script da IA (ADR-025): upsert da conexao por (servico, conta, escopo). Confere que o segredo citado existe em vault.secrets (so o nome). Data nao informada nao apaga a existente. Grava atividade so com id e servico. EXECUTE so service_role.';
REVOKE ALL ON FUNCTION public.registrar_conexao(text, text, text, text, uuid, text, text[], text, text, date, date, date, date)
  FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.registrar_conexao(text, text, text, text, uuid, text, text[], text, text, date, date, date, date)
  TO service_role;

-- ---------------------------------------------------------------------------
-- RPC de escrita no Vault (so service_role). Chamar via PostgREST com parametro
-- ligado (POST /rest/v1/rpc/guardar_segredo), NUNCA com o valor literal num SQL:
-- o texto do SQL vai para log e pg_stat_statements.
-- ---------------------------------------------------------------------------
CREATE OR REPLACE FUNCTION public.guardar_segredo(p_nome text, p_valor text)
RETURNS uuid
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = pg_catalog, public
AS $$
DECLARE
  v_id uuid;
BEGIN
  IF p_nome IS NULL OR p_nome !~ '^[A-Za-z0-9_.-]+$' THEN
    RAISE EXCEPTION 'nome de segredo invalido (use letras, numeros, _ . -)';
  END IF;
  IF p_valor IS NULL OR length(p_valor) = 0 THEN
    RAISE EXCEPTION 'valor do segredo % vazio', p_nome;
  END IF;
  IF to_regclass('vault.secrets') IS NULL THEN
    RAISE EXCEPTION 'Vault indisponivel neste banco';
  END IF;
  SELECT s.id INTO v_id FROM vault.secrets s WHERE s.name = p_nome;
  IF v_id IS NULL THEN
    v_id := vault.create_secret(p_valor, p_nome, 'guardado pelo script do Empresa OS (ADR-025)');
  ELSE
    PERFORM vault.update_secret(v_id, p_valor);
  END IF;
  -- trilha so com o nome (o valor nunca sai desta funcao)
  INSERT INTO public.atividade (tipo, descricao, metadata)
  VALUES ('segredo_guardado', 'Segredo guardado no Vault: ' || p_nome, jsonb_build_object('nome', p_nome));
  RETURN v_id;
END;
$$;

COMMENT ON FUNCTION public.guardar_segredo(text, text) IS
  'Operacao fixa do script da IA (ADR-025): cria (vault.create_secret) ou troca (vault.update_secret) o segredo pelo nome. Devolve o id do segredo, nunca o valor. EXECUTE so service_role. Leitura continua so por public.segredo().';
REVOKE ALL ON FUNCTION public.guardar_segredo(text, text) FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.guardar_segredo(text, text) TO service_role;

-- ---------------------------------------------------------------------------
-- Smoke
-- ---------------------------------------------------------------------------
DO $$
DECLARE
  v_dono_pegou boolean := false;
  v_copia_pegou boolean := false;
BEGIN
  IF NOT coalesce((SELECT relrowsecurity FROM pg_class WHERE oid = to_regclass('public.conexao')), false) THEN
    RAISE EXCEPTION 'smoke 0017: public.conexao ausente ou sem RLS';
  END IF;
  IF has_table_privilege('authenticated', 'public.conexao', 'INSERT,UPDATE,DELETE')
     OR has_table_privilege('anon', 'public.conexao', 'SELECT') THEN
    RAISE EXCEPTION 'smoke 0017: escrita de authenticated ou leitura de anon em conexao';
  END IF;
  IF NOT has_table_privilege('authenticated', 'public.conexao', 'SELECT') THEN
    RAISE EXCEPTION 'smoke 0017: authenticated sem SELECT em conexao — a tela renderiza VAZIA sem erro';
  END IF;
  IF has_function_privilege('authenticated', 'public.guardar_segredo(text, text)', 'EXECUTE')
     OR has_function_privilege('anon', 'public.guardar_segredo(text, text)', 'EXECUTE')
     OR has_function_privilege('authenticated', 'public.registrar_conexao(text, text, text, text, uuid, text, text[], text, text, date, date, date, date)', 'EXECUTE') THEN
    RAISE EXCEPTION 'smoke 0017: guardar_segredo ou registrar_conexao executavel pelo app';
  END IF;
  BEGIN
    BEGIN
      INSERT INTO public.usuarios (id, nome, email) VALUES ('00000000-0000-4000-8000-00000000c017', '_smoke', '_smoke0017@exemplo.invalid');
      INSERT INTO public.conexao (servico, conta, dono_papel, dono_usuario_id)
      VALUES ('smoke', 'x', 'cto', '00000000-0000-4000-8000-00000000c017');
    EXCEPTION WHEN check_violation THEN v_dono_pegou := true; END;
    BEGIN
      INSERT INTO public.conexao (servico, conta, dono_papel, copias) VALUES ('smoke', 'y', 'cto', '{onde_quiser}');
    EXCEPTION WHEN check_violation THEN v_copia_pegou := true; END;
    RAISE EXCEPTION 'smoke 0017: desfazendo' USING ERRCODE = 'P0999';
  EXCEPTION WHEN SQLSTATE 'P0999' THEN NULL;
  END;
  IF NOT v_dono_pegou THEN RAISE EXCEPTION 'smoke 0017: conexao com dois donos foi aceita'; END IF;
  IF NOT v_copia_pegou THEN RAISE EXCEPTION 'smoke 0017: copia fora da lista fechada foi aceita'; END IF;
END $$;

-- Rollback:
--   DROP FUNCTION public.guardar_segredo(text, text);
--   DROP FUNCTION public.registrar_conexao(text, text, text, text, uuid, text, text[], text, text, date, date, date, date);
--   DROP TABLE public.conexao;
--   DELETE FROM public.permissoes WHERE modulo = 'conexoes'; DELETE FROM public.modulo WHERE slug = 'conexoes';
