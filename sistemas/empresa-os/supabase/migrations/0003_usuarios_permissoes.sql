-- 0003_usuarios_permissoes.sql
-- Pessoas que entram no sistema e o catalogo de permissoes por modulo (padrao
-- do Polozi OS: slug `<modulo>.<acao>`, concessao direta por usuario). E a ponte
-- entre o login do Supabase (auth.users) e o sistema: toda policy resolve "quem
-- sou eu" lendo estas tabelas pelos helpers da 0004. Convite e server-side: a
-- linha nasce ANTES da conta.
-- Sem organizacao e sem papel global: 1 empresa por banco (0002), dono = e_dono,
-- o resto e permissao por modulo. "Papel" (Leitor, Equipe) e PRESET no app.
-- Depende da 0001 (gates) e da 0002 (public.set_atualizada_em).
-- Rollback ao fim do arquivo.

CREATE TABLE IF NOT EXISTS public.usuarios (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  auth_user_id uuid UNIQUE REFERENCES auth.users(id) ON DELETE SET NULL,
  nome text NOT NULL CHECK (length(trim(nome)) > 0),
  email text NOT NULL UNIQUE
    CHECK (email = lower(trim(email)) AND email ~ '^[^@[:space:]]+@[^@[:space:]]+$'),
  ativo boolean NOT NULL DEFAULT true,
  e_dono boolean NOT NULL DEFAULT false,
  senha_trocada_em timestamptz,
  criado_em timestamptz NOT NULL DEFAULT now(),
  atualizada_em timestamptz NOT NULL DEFAULT now()
);

COMMENT ON TABLE public.usuarios IS
  'dono=Lider de Dados; retencao=R04; Pessoa com acesso ao sistema. INSERT e SO do service_role (convite server-side) — nem o dono insere direto pelo client. Desativar, nao apagar (historico aponta pra ca). No maximo 1 dono (uq_usuarios_um_dono).';
COMMENT ON COLUMN public.usuarios.id IS
  'classe=nenhum; chave do usuario. dono_id/usuario_id das outras tabelas apontam pra ca.';
COMMENT ON COLUMN public.usuarios.auth_user_id IS
  'classe=pessoal; conta de login (auth.users). NULL = convite ainda sem conta, ou conta apagada em auth.users (ON DELETE SET NULL: a pessoa fica no historico, sem login). "Aguardando convite" NAO se deriva desta coluna: o sinal e last_sign_in_at no Auth Admin API.';
COMMENT ON COLUMN public.usuarios.nome IS
  'classe=pessoal; nome de exibicao.';
COMMENT ON COLUMN public.usuarios.email IS
  'classe=pessoal; unico no sistema INTEIRO, sempre minusculo e sem espaco (CHECK). 1 login = 1 usuario.';
COMMENT ON COLUMN public.usuarios.ativo IS
  'classe=nenhum; false = acesso desligado sem perder historico. Desativar, nao deletar, e o caminho padrao.';
COMMENT ON COLUMN public.usuarios.e_dono IS
  'classe=nenhum; o dono da empresa. Tem TODAS as permissoes (helper tem_permissao). No maximo um, nunca apagado, desativado ou rebaixado (gatilho). Fonte unica de "dono": nao existe coluna de dono em empresa.';
COMMENT ON COLUMN public.usuarios.senha_trocada_em IS
  'classe=nenhum; NULL = precisa trocar a senha inicial (o middleware manda pra /trocar-senha). Quem carimba e a RPC marcar_senha_trocada(), so na propria linha.';
COMMENT ON COLUMN public.usuarios.criado_em IS
  'classe=nenhum; quando o convite foi criado.';
COMMENT ON COLUMN public.usuarios.atualizada_em IS
  'classe=nenhum; mantida pelo trigger trg_usuarios_atualizada_em.';

-- No maximo UM dono (indice parcial sobre constante: 2 linhas com e_dono colidem).
CREATE UNIQUE INDEX IF NOT EXISTS uq_usuarios_um_dono
  ON public.usuarios ((true)) WHERE e_dono;

DROP TRIGGER IF EXISTS trg_usuarios_atualizada_em ON public.usuarios;
CREATE TRIGGER trg_usuarios_atualizada_em
  BEFORE UPDATE ON public.usuarios
  FOR EACH ROW EXECUTE FUNCTION public.set_atualizada_em();

-- Trava REAL das regras do dono (o app repete a validacao so pra dar mensagem
-- amigavel; sem este gatilho elas seriam promessa de comentario).
-- SECURITY INVOKER de proposito: dispara ate pra service_role — BYPASSRLS pula
-- policy, nao pula gatilho. search_path pinado por higiene.
CREATE OR REPLACE FUNCTION public.fn_usuarios_protege_dono()
RETURNS trigger
LANGUAGE plpgsql
SET search_path = public
AS $$
BEGIN
  -- DELETE e a operacao MAIS forte: sem esta guarda, apagar a linha do dono
  -- deixaria a empresa sem dono (promover outro e barrado abaixo).
  IF TG_OP = 'DELETE' THEN
    IF OLD.e_dono THEN
      RAISE EXCEPTION 'o dono nao pode ser removido — transferencia de dono e operacao manual documentada (ver COMMENT do gatilho trg_usuarios_protege_dono)';
    END IF;
    RETURN OLD;
  END IF;
  IF NEW.e_dono AND NOT OLD.e_dono THEN
    RAISE EXCEPTION 'so existe um dono — transferencia de dono e operacao manual documentada (ver COMMENT do gatilho trg_usuarios_protege_dono)';
  END IF;
  IF OLD.e_dono AND NOT NEW.e_dono THEN
    RAISE EXCEPTION 'o dono nao pode ser rebaixado — transferencia de dono e operacao manual documentada (ver COMMENT do gatilho trg_usuarios_protege_dono)';
  END IF;
  IF OLD.e_dono AND NOT NEW.ativo THEN
    RAISE EXCEPTION 'o dono nao pode ser desativado';
  END IF;
  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS trg_usuarios_protege_dono ON public.usuarios;
CREATE TRIGGER trg_usuarios_protege_dono
  BEFORE UPDATE OR DELETE ON public.usuarios
  FOR EACH ROW EXECUTE FUNCTION public.fn_usuarios_protege_dono();

COMMENT ON TRIGGER trg_usuarios_protege_dono ON public.usuarios IS
  'Bloqueia apagar, desativar ou rebaixar o dono e promover alguem a dono por UPDATE. Vale pra TODO role, inclusive service_role (bypassa RLS, nao gatilho). Kill-switch pra transferir a titularidade (operacao manual, rara): ALTER TABLE public.usuarios DISABLE TRIGGER trg_usuarios_protege_dono; fazer a transferencia (rebaixar o dono atual + promover o novo, na mesma transacao); ALTER TABLE public.usuarios ENABLE TRIGGER trg_usuarios_protege_dono;';

-- ---------------------------------------------------------------------------
-- Catalogo de permissoes (slug `<modulo>.<acao>`).
-- Escrita so por migration: modulo novo = INSERT ... ON CONFLICT DO NOTHING na
-- migration do modulo (e linha em public.modulo, 0012).
-- ---------------------------------------------------------------------------
CREATE TABLE IF NOT EXISTS public.permissoes (
  slug text PRIMARY KEY
    CHECK (slug ~ '^[a-z0-9_]+\.[a-z0-9_]+$' AND slug = modulo || '.' || acao),
  modulo text NOT NULL,
  acao text NOT NULL,
  descricao text NOT NULL,
  criada_em timestamptz NOT NULL DEFAULT now()
);

COMMENT ON TABLE public.permissoes IS
  'dono=Lider de Dados; retencao=R12; Catalogo de slugs `<modulo>.<acao>` semeado por migration. A guarda G16 compara os slugs entre os marcadores PERMISSOES:INICIO/FIM com o catalogo do app. Slug nunca muda de sentido (ADR-012).';
COMMENT ON COLUMN public.permissoes.slug IS
  'classe=nenhum; modulo.acao em minusculas.';
COMMENT ON COLUMN public.permissoes.modulo IS
  'classe=nenhum; prefixo do slug. Cada prefixo tem linha em public.modulo (0012, guarda GA-08).';
COMMENT ON COLUMN public.permissoes.acao IS
  'classe=nenhum; sufixo do slug (read, write, manage, ou slug restrito do modulo).';
COMMENT ON COLUMN public.permissoes.descricao IS
  'classe=nenhum; texto pra quem concede a permissao, em linguagem de gente.';

-- ---------------------------------------------------------------------------
-- Concessao direta por usuario.
-- ---------------------------------------------------------------------------
CREATE TABLE IF NOT EXISTS public.usuarios_permissoes (
  usuario_id uuid NOT NULL REFERENCES public.usuarios(id) ON DELETE CASCADE,
  permissao text NOT NULL REFERENCES public.permissoes(slug) ON UPDATE CASCADE ON DELETE CASCADE,
  concedida_por uuid REFERENCES public.usuarios(id) ON DELETE SET NULL,
  concedida_em timestamptz NOT NULL DEFAULT now(),
  PRIMARY KEY (usuario_id, permissao)
);

COMMENT ON TABLE public.usuarios_permissoes IS
  'dono=Lider de Dados; retencao=R13; Concessao direta de permissao por usuario. DELETE de authenticated so pra revogar (lista antiga, E3-04). `usuarios.manage` so o dono concede ou tira (gatilho trg_usuarios_manage_so_dono, 0004). O dono nao precisa de linha: tem todas pelo e_dono.';
COMMENT ON COLUMN public.usuarios_permissoes.usuario_id IS
  'classe=pessoal; quem recebe a permissao.';
COMMENT ON COLUMN public.usuarios_permissoes.permissao IS
  'classe=nenhum; slug do catalogo.';
COMMENT ON COLUMN public.usuarios_permissoes.concedida_por IS
  'classe=pessoal; quem concedeu (usuarios.id). NULL = concessao por maquina (seed).';
COMMENT ON COLUMN public.usuarios_permissoes.concedida_em IS
  'classe=nenhum; quando foi concedida.';

CREATE INDEX IF NOT EXISTS idx_usuarios_permissoes_permissao
  ON public.usuarios_permissoes (permissao);

-- ---------------------------------------------------------------------------
-- Seguranca: RLS ligada, GRANTs minimos, SEM policies ainda (0004).
-- Deny-all ate la, de proposito. anon e a chave PUBLICA: nunca recebe grant.
-- ---------------------------------------------------------------------------
ALTER TABLE public.usuarios ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.permissoes ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.usuarios_permissoes ENABLE ROW LEVEL SECURITY;

REVOKE ALL ON public.usuarios FROM PUBLIC, anon, authenticated;
REVOKE ALL ON public.permissoes FROM PUBLIC, anon, authenticated;
REVOKE ALL ON public.usuarios_permissoes FROM PUBLIC, anon, authenticated;

-- Sem INSERT/DELETE em usuarios pra authenticated: convite e server-side.
GRANT SELECT ON public.usuarios TO authenticated;
GRANT UPDATE (nome, ativo) ON public.usuarios TO authenticated;
GRANT SELECT ON public.permissoes TO authenticated;
GRANT SELECT, INSERT, DELETE ON public.usuarios_permissoes TO authenticated;

GRANT ALL ON public.usuarios TO service_role;
GRANT ALL ON public.permissoes TO service_role;
GRANT ALL ON public.usuarios_permissoes TO service_role;

-- ---------------------------------------------------------------------------
-- Seed do catalogo (idempotente). A guarda G16 le os slugs ENTRE os marcadores:
-- nao mexa no formato das linhas nem apague os marcadores.
-- ---------------------------------------------------------------------------
-- PERMISSOES:INICIO
INSERT INTO public.permissoes (slug, modulo, acao, descricao) VALUES
  ('tarefas.read',        'tarefas',       'read',   'Ver o quadro de tarefas, a trilha do curso e o plano de 90 dias'),
  ('tarefas.write',       'tarefas',       'write',  'Criar, editar, mover e cancelar tarefas'),
  ('agentes.read',        'agentes',       'read',   'Ver o time de agentes e as melhorias propostas'),
  ('agentes.write',       'agentes',       'write',  'Aprovar ou rejeitar melhoria proposta'),
  ('execucoes.read',      'execucoes',     'read',   'Ver o registro de execucoes dos agentes'),
  ('documentos.read',     'documentos',    'read',   'Ver dossie, persona, marca e extracoes publicados'),
  ('usuarios.manage',     'usuarios',      'manage', 'Convidar e desativar pessoas e dar permissoes'),
  ('atividade.read',      'atividade',     'read',   'Ver a linha do tempo da empresa'),
  ('configuracoes.read',  'configuracoes', 'read',   'Ver as configuracoes do sistema'),
  ('configuracoes.write', 'configuracoes', 'write',  'Editar os dados da empresa')
ON CONFLICT (slug) DO NOTHING;
-- PERMISSOES:FIM

-- ---------------------------------------------------------------------------
-- Smoke. Linhas de teste vivem em sub-blocos desfeitos por excecao proposital
-- (SQLSTATE P0999); flags e RAISE de falha ficam FORA do bloco que captura.
-- Teste de mutacao: apagar o indice, um GRANT, um RLS ou o RAISE do gatilho
-- QUEBRA este bloco.
-- ---------------------------------------------------------------------------
DO $$
DECLARE
  v_t text;
  v_n int;
  v_dono_unico boolean := false;
  v_desativar boolean := false;
  v_rebaixar boolean := false;
  v_apagar boolean := false;
  v_promover boolean := false;
  v_id1 uuid := gen_random_uuid();
  v_id2 uuid := gen_random_uuid();
BEGIN
  FOREACH v_t IN ARRAY ARRAY['usuarios', 'permissoes', 'usuarios_permissoes'] LOOP
    IF to_regclass('public.' || v_t) IS NULL THEN
      RAISE EXCEPTION 'smoke 0003: tabela % nao criada — todo o sistema de permissoes (0004+) fica sem base', v_t;
    END IF;
    IF NOT (SELECT relrowsecurity FROM pg_class WHERE oid = ('public.' || v_t)::regclass) THEN
      RAISE EXCEPTION 'smoke 0003: RLS desligada em % — qualquer usuario logado leria o cadastro inteiro', v_t;
    END IF;
    IF NOT has_table_privilege('authenticated', 'public.' || v_t, 'SELECT') THEN
      RAISE EXCEPTION 'smoke 0003: authenticated sem SELECT em % — com a policy da 0004 a tela renderiza VAZIA sem erro', v_t;
    END IF;
    IF has_table_privilege('anon', 'public.' || v_t, 'SELECT') THEN
      RAISE EXCEPTION 'smoke 0003: anon com SELECT em % — anon e chave publica, exporia o cadastro', v_t;
    END IF;
    IF NOT has_table_privilege('service_role', 'public.' || v_t, 'INSERT') THEN
      RAISE EXCEPTION 'smoke 0003: service_role sem INSERT em % — convite e seed morrem calados', v_t;
    END IF;
  END LOOP;

  -- usuarios: sem INSERT/DELETE pra authenticated; UPDATE so em nome e ativo.
  IF has_table_privilege('authenticated', 'public.usuarios', 'INSERT')
     OR has_table_privilege('authenticated', 'public.usuarios', 'DELETE') THEN
    RAISE EXCEPTION 'smoke 0003: authenticated com INSERT/DELETE em usuarios — convite tem que ser so server-side (service_role)';
  END IF;
  IF NOT has_column_privilege('authenticated', 'public.usuarios', 'ativo', 'UPDATE') THEN
    RAISE EXCEPTION 'smoke 0003: authenticated sem UPDATE em usuarios.ativo — o dono nao desativa ninguem pela tela';
  END IF;
  IF has_column_privilege('authenticated', 'public.usuarios', 'e_dono', 'UPDATE')
     OR has_column_privilege('authenticated', 'public.usuarios', 'email', 'UPDATE') THEN
    RAISE EXCEPTION 'smoke 0003: authenticated com UPDATE em e_dono/email — so nome e ativo sao editaveis pela tela';
  END IF;
  IF has_table_privilege('authenticated', 'public.permissoes', 'INSERT')
     OR has_table_privilege('authenticated', 'public.permissoes', 'UPDATE')
     OR has_table_privilege('authenticated', 'public.permissoes', 'DELETE') THEN
    RAISE EXCEPTION 'smoke 0003: authenticated escreve em permissoes — o catalogo so muda por migration';
  END IF;
  IF NOT has_table_privilege('authenticated', 'public.usuarios_permissoes', 'INSERT')
     OR NOT has_table_privilege('authenticated', 'public.usuarios_permissoes', 'DELETE') THEN
    RAISE EXCEPTION 'smoke 0003: authenticated sem INSERT/DELETE em usuarios_permissoes — quem tem usuarios.manage nao concede nem revoga';
  END IF;

  -- Catalogo: exatamente as 10 permissoes da spec (outros modulos acrescentam
  -- as suas em migrations proprias, entao confere so as base).
  SELECT count(*) INTO v_n FROM public.permissoes WHERE slug IN (
    'tarefas.read','tarefas.write','agentes.read','agentes.write','execucoes.read',
    'documentos.read','usuarios.manage','atividade.read','configuracoes.read','configuracoes.write');
  IF v_n <> 10 THEN
    RAISE EXCEPTION 'smoke 0003: catalogo base com % de 10 permissoes — slug faltando vira tela vazia pra todo mundo menos o dono', v_n;
  END IF;

  IF NOT EXISTS (SELECT 1 FROM pg_indexes WHERE schemaname = 'public'
                 AND indexname = 'uq_usuarios_um_dono') THEN
    RAISE EXCEPTION 'smoke 0003: uq_usuarios_um_dono ausente — um segundo dono entraria por INSERT';
  END IF;
  IF NOT EXISTS (SELECT 1 FROM pg_trigger WHERE tgrelid = 'public.usuarios'::regclass
                 AND tgname = 'trg_usuarios_protege_dono' AND NOT tgisinternal) THEN
    RAISE EXCEPTION 'smoke 0003: gatilho trg_usuarios_protege_dono ausente — as regras do dono viram validacao so de app';
  END IF;

  -- G9: 1 dono so; dono nao e desativado, rebaixado nem apagado (contexto de
  -- maquina: auth.uid() nulo). Sub-bloco desfeito no fim. Num banco que JA tem
  -- dono (re-aplicacao depois do setup) o proprio indice impediria o dono de
  -- teste: ai os invariantes sao provados pelo pgTAP 003, nao aqui.
  IF EXISTS (SELECT 1 FROM public.usuarios WHERE e_dono) THEN
    RETURN;
  END IF;
  BEGIN
    INSERT INTO public.usuarios (id, nome, email, e_dono)
    VALUES (v_id1, 'Smoke Dono', 'smoke-dono@exemplo.invalid', true);

    BEGIN
      INSERT INTO public.usuarios (id, nome, email, e_dono)
      VALUES (v_id2, 'Smoke Outro Dono', 'smoke-outro@exemplo.invalid', true);
    EXCEPTION WHEN unique_violation THEN
      v_dono_unico := true;
    END;

    INSERT INTO public.usuarios (id, nome, email)
    VALUES (v_id2, 'Smoke Outro', 'smoke-outro@exemplo.invalid');

    BEGIN
      UPDATE public.usuarios SET ativo = false WHERE id = v_id1;
    EXCEPTION WHEN raise_exception THEN
      v_desativar := true;
    END;
    BEGIN
      UPDATE public.usuarios SET e_dono = false WHERE id = v_id1;
    EXCEPTION WHEN raise_exception THEN
      v_rebaixar := true;
    END;
    BEGIN
      DELETE FROM public.usuarios WHERE id = v_id1;
    EXCEPTION WHEN raise_exception THEN
      v_apagar := true;
    END;
    BEGIN
      UPDATE public.usuarios SET e_dono = true WHERE id = v_id2;
    EXCEPTION WHEN raise_exception OR unique_violation THEN
      v_promover := true;
    END;

    RAISE EXCEPTION 'smoke 0003: desfazendo as linhas de teste' USING ERRCODE = 'P0999';
  EXCEPTION WHEN SQLSTATE 'P0999' THEN
    NULL;
  END;

  IF NOT v_dono_unico THEN
    RAISE EXCEPTION 'smoke 0003: 2o dono aceito — uq_usuarios_um_dono nao protege (a empresa teria dois donos)';
  END IF;
  IF NOT v_desativar THEN
    RAISE EXCEPTION 'smoke 0003: dono desativado sem erro — gatilho trg_usuarios_protege_dono nao protege';
  END IF;
  IF NOT v_rebaixar THEN
    RAISE EXCEPTION 'smoke 0003: dono rebaixado sem erro — gatilho trg_usuarios_protege_dono nao protege';
  END IF;
  IF NOT v_apagar THEN
    RAISE EXCEPTION 'smoke 0003: dono apagado sem erro — gatilho trg_usuarios_protege_dono nao protege';
  END IF;
  IF NOT v_promover THEN
    RAISE EXCEPTION 'smoke 0003: promocao a dono por UPDATE aceita — gatilho trg_usuarios_protege_dono nao protege';
  END IF;
END $$;

-- Rollback:
--   DROP TABLE IF EXISTS public.usuarios_permissoes;
--   DROP TABLE IF EXISTS public.permissoes;
--   DROP TABLE IF EXISTS public.usuarios;  -- derruba os gatilhos junto
--   DROP FUNCTION IF EXISTS public.fn_usuarios_protege_dono();
--   (0005+ criam FKs apontando pra ca — tarefas.dono_id, atividade.usuario_id;
--    se elas ja rodaram, reverta-as antes ou o DROP falha por dependencia.)
