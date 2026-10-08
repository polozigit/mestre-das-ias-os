-- 0010_documentos_publicados.sql
-- Dossie, persona, marca e extracoes PUBLICADOS pela IA (D24-40, E3-10).
-- Direcao unica arquivo -> banco: a IA publica por upsert de `caminho_origem`;
-- a tela e so leitura (editar = pedir a IA). Escrita so service_role.
-- Imagem: bucket PRIVADO `publicados` criado pelo script (Storage API); esta
-- migration NAO toca o schema `storage` nem cria policy em storage.objects.
-- Depende de: 0004 (helpers). Rollback ao fim.

CREATE TABLE IF NOT EXISTS public.documentos_publicados (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  tipo text NOT NULL CHECK (tipo IN ('dossie','persona','marca','extracao')),
  titulo text NOT NULL,
  texto text NOT NULL,
  resumo text,
  caminho_origem text NOT NULL UNIQUE
    CHECK (caminho_origem !~ '^/' AND caminho_origem !~ '(^|/)\.\.(/|$)'),
  hash text NOT NULL CHECK (hash ~ '^[0-9a-f]{64}$'),
  imagem_caminho text,
  publicado_em timestamptz NOT NULL DEFAULT now()
);

COMMENT ON TABLE public.documentos_publicados IS
  'dono=Lider de Dados; retencao=R13; Documentos publicados pela IA (dossie, persona, marca, extracao). Direcao unica arquivo -> banco (D24-40c): republicar = upsert por caminho_origem trocando texto/resumo/hash/publicado_em. A tela e leitura (documentos.read); authenticated nunca escreve. publicacao_atrasada = hash do arquivo aprovado diferente do `hash` da linha, ou linha ausente; quem confere e o script da IA.';
COMMENT ON COLUMN public.documentos_publicados.id IS
  'classe=nenhum; chave do documento.';
COMMENT ON COLUMN public.documentos_publicados.tipo IS
  'classe=nenhum; dossie, persona, marca ou extracao. Espelha o MAPA do projeto (D24-40f): o script mapeia o papel do MAPA para o tipo.';
COMMENT ON COLUMN public.documentos_publicados.titulo IS
  'classe=nenhum; titulo de exibicao.';
COMMENT ON COLUMN public.documentos_publicados.texto IS
  'classe=pessoal; texto integral publicado. Pode conter dado pessoal (ex.: persona de cliente real).';
COMMENT ON COLUMN public.documentos_publicados.resumo IS
  'classe=nenhum; resumo curto pra lista da tela.';
COMMENT ON COLUMN public.documentos_publicados.caminho_origem IS
  'classe=nenhum; caminho RELATIVO do arquivo no repositorio (sem / inicial e sem ..). Unico: e a chave do upsert.';
COMMENT ON COLUMN public.documentos_publicados.hash IS
  'classe=nenhum; sha256 em 64 caracteres hexadecimais minusculos do arquivo publicado.';
COMMENT ON COLUMN public.documentos_publicados.imagem_caminho IS
  'classe=nenhum; caminho dentro do bucket privado `publicados`. O servidor do app gera URL assinada depois de checar documentos.read.';
COMMENT ON COLUMN public.documentos_publicados.publicado_em IS
  'classe=nenhum; quando a versao vigente foi publicada.';

ALTER TABLE public.documentos_publicados ENABLE ROW LEVEL SECURITY;

REVOKE ALL ON public.documentos_publicados FROM PUBLIC, anon, authenticated;
-- G19: authenticated so SELECT — a tela e leitura (D24-40b).
GRANT SELECT ON public.documentos_publicados TO authenticated;
GRANT ALL ON public.documentos_publicados TO service_role;

DROP POLICY IF EXISTS documentos_select ON public.documentos_publicados;
CREATE POLICY documentos_select ON public.documentos_publicados
  FOR SELECT TO authenticated
  USING (public.tem_permissao('documentos.read'));

DO $$
DECLARE
  v_hash_pegou boolean := false;
  v_abs_pegou boolean := false;
  v_dots_pegou boolean := false;
  v_dup_pegou boolean := false;
  v_h text := repeat('a', 64);
BEGIN
  IF to_regclass('public.documentos_publicados') IS NULL THEN
    RAISE EXCEPTION 'smoke 0010: tabela documentos_publicados nao criada — a tela de documentos nao existe';
  END IF;
  IF NOT (SELECT relrowsecurity FROM pg_class WHERE oid = 'public.documentos_publicados'::regclass) THEN
    RAISE EXCEPTION 'smoke 0010: RLS desligada em documentos_publicados — qualquer usuario logado leria os documentos';
  END IF;
  IF NOT has_table_privilege('authenticated', 'public.documentos_publicados', 'SELECT') THEN
    RAISE EXCEPTION 'smoke 0010: authenticated sem SELECT — a tela de documentos renderiza VAZIA sem erro';
  END IF;
  IF has_table_privilege('authenticated', 'public.documentos_publicados', 'INSERT')
     OR has_table_privilege('authenticated', 'public.documentos_publicados', 'UPDATE')
     OR has_table_privilege('authenticated', 'public.documentos_publicados', 'DELETE') THEN
    RAISE EXCEPTION 'smoke 0010: authenticated escreve em documentos_publicados — tela e leitura, editar = pedir a IA';
  END IF;
  IF NOT has_table_privilege('service_role', 'public.documentos_publicados', 'INSERT') THEN
    RAISE EXCEPTION 'smoke 0010: service_role sem INSERT — a IA nao consegue publicar';
  END IF;
  IF has_table_privilege('anon', 'public.documentos_publicados', 'SELECT') THEN
    RAISE EXCEPTION 'smoke 0010: anon tem SELECT em documentos_publicados — chave publica vaza os documentos';
  END IF;
  IF NOT EXISTS (SELECT 1 FROM pg_policies WHERE schemaname = 'public'
                 AND tablename = 'documentos_publicados' AND policyname = 'documentos_select'
                 AND qual LIKE '%documentos.read%') THEN
    RAISE EXCEPTION 'smoke 0010: policy documentos_select ausente ou sem documentos.read';
  END IF;

  BEGIN
    BEGIN
      INSERT INTO public.documentos_publicados (tipo, titulo, texto, caminho_origem, hash)
      VALUES ('persona', 't', 'x', 'smoke/a.md', 'nao-e-hex');
    EXCEPTION WHEN check_violation THEN v_hash_pegou := true; END;
    BEGIN
      INSERT INTO public.documentos_publicados (tipo, titulo, texto, caminho_origem, hash)
      VALUES ('persona', 't', 'x', '/etc/passwd', v_h);
    EXCEPTION WHEN check_violation THEN v_abs_pegou := true; END;
    BEGIN
      INSERT INTO public.documentos_publicados (tipo, titulo, texto, caminho_origem, hash)
      VALUES ('persona', 't', 'x', 'a/../../b.md', v_h);
    EXCEPTION WHEN check_violation THEN v_dots_pegou := true; END;
    INSERT INTO public.documentos_publicados (tipo, titulo, texto, caminho_origem, hash)
    VALUES ('persona', 't', 'x', 'smoke/dup.md', v_h);
    BEGIN
      INSERT INTO public.documentos_publicados (tipo, titulo, texto, caminho_origem, hash)
      VALUES ('marca', 't2', 'y', 'smoke/dup.md', v_h);
    EXCEPTION WHEN unique_violation THEN v_dup_pegou := true; END;
    RAISE EXCEPTION 'smoke 0010: desfazendo as linhas de teste' USING ERRCODE = 'P0999';
  EXCEPTION WHEN SQLSTATE 'P0999' THEN
    NULL;
  END;
  IF NOT v_hash_pegou THEN
    RAISE EXCEPTION 'smoke 0010: hash fora de 64 hex foi aceito — publicacao_atrasada compararia lixo';
  END IF;
  IF NOT v_abs_pegou OR NOT v_dots_pegou THEN
    RAISE EXCEPTION 'smoke 0010: caminho_origem absoluto ou com .. foi aceito — o upsert poderia apontar fora do repositorio';
  END IF;
  IF NOT v_dup_pegou THEN
    RAISE EXCEPTION 'smoke 0010: 2 linhas com o mesmo caminho_origem — UNIQUE sumiu e o upsert duplicaria o documento';
  END IF;
END $$;

-- Rollback:
--   DROP TABLE IF EXISTS public.documentos_publicados;
