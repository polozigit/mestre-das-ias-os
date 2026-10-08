-- 0013_modulo_ligavel.sql
-- Planta v0.3, onda 1 (restante): modulo ligavel (ADR-015, ADR-024) e padrao de
-- outbox/inbox (ADR-006).
--   1) public.modulo ganha classe (essencial | ligavel), ligado, ligado_em,
--      ligado_por_usuario_id, modulo_pai; essencial nao desliga (CHECK)
--   2) linha de TODO modulo do catalogo (ligavel inclusive) e os slugs de todos,
--      inclusive os restritos do ADR-012 item 7 (o `.manage` nao abre o restrito)
--   3) gatilho da P4: concessao de slug de modulo desligado e recusada; desligar
--      revoga as concessoes do modulo
--   4) RPC public.ligar_modulo(modulo, ligado): so com `configuracoes.write`
--      (ou maquina), registra em atividade; ligavel so liga com o schema ja
--      instalado pela migration do proprio modulo (ADR-024)
--   5) public.criar_outbox_inbox(schema): padrao unico de outbox e inbox por
--      schema de modulo (GA-10); chamada pela migration de cada modulo
-- Nao cria schema de modulo nenhum: cada modulo traz o seu na PR dele (uma PR
-- por modulo). Depende de 0003/0004 (usuarios, permissoes, helpers), 0007
-- (atividade) e 0012 (public.modulo). Rollback ao fim.

-- ---------------------------------------------------------------------------
-- 1) Classe e estado do modulo
-- ---------------------------------------------------------------------------
ALTER TABLE public.modulo
  ADD COLUMN IF NOT EXISTS classe text NOT NULL DEFAULT 'essencial',
  ADD COLUMN IF NOT EXISTS ligado boolean NOT NULL DEFAULT true,
  ADD COLUMN IF NOT EXISTS ligado_em timestamptz,
  ADD COLUMN IF NOT EXISTS ligado_por_usuario_id uuid REFERENCES public.usuarios(id) ON DELETE SET NULL,
  ADD COLUMN IF NOT EXISTS modulo_pai text REFERENCES public.modulo(slug) ON UPDATE CASCADE;

-- DEFAULT true de proposito: a 0012 (re-aplicada na rodada 2, sem a coluna `ligado`) insere
-- os modulos da base como essenciais. Modulo LIGAVEL declara `ligado = false` na propria linha.

DO $$
BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conrelid = 'public.modulo'::regclass
                 AND conname = 'ck_modulo_classe') THEN
    ALTER TABLE public.modulo ADD CONSTRAINT ck_modulo_classe
      CHECK (classe IN ('essencial', 'ligavel'));
  END IF;
  IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conrelid = 'public.modulo'::regclass
                 AND conname = 'ck_modulo_essencial_ligado') THEN
    ALTER TABLE public.modulo ADD CONSTRAINT ck_modulo_essencial_ligado
      CHECK (classe <> 'essencial' OR ligado);
  END IF;
  IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conrelid = 'public.modulo'::regclass
                 AND conname = 'ck_modulo_pai_diferente') THEN
    ALTER TABLE public.modulo ADD CONSTRAINT ck_modulo_pai_diferente
      CHECK (modulo_pai IS NULL OR modulo_pai <> slug);
  END IF;
END $$;

CREATE INDEX IF NOT EXISTS idx_modulo_ligado_por ON public.modulo (ligado_por_usuario_id)
  WHERE ligado_por_usuario_id IS NOT NULL;
CREATE INDEX IF NOT EXISTS idx_modulo_pai ON public.modulo (modulo_pai) WHERE modulo_pai IS NOT NULL;

COMMENT ON COLUMN public.modulo.classe IS
  'classe=nenhum; essencial (sempre ligado, nao desliga: ck_modulo_essencial_ligado) ou ligavel (instala e liga so por vontade da empresa; ADR-015, ADR-024).';
COMMENT ON COLUMN public.modulo.ligado IS
  'classe=nenhum; estado do modulo. Muda so pela RPC public.ligar_modulo (ou migration). Desligado: concessao de slug do modulo e recusada e as existentes sao revogadas (P4); dado e tabela ficam (ADR-012 item 5).';
COMMENT ON COLUMN public.modulo.ligado_em IS
  'classe=nenhum; quando o modulo foi ligado pela ultima vez. NULL = nunca ligado, ou essencial.';
COMMENT ON COLUMN public.modulo.ligado_por_usuario_id IS
  'classe=pessoal; quem ligou ou desligou por ultimo (usuarios.id). NULL = maquina (seed) ou usuario removido.';
COMMENT ON COLUMN public.modulo.modulo_pai IS
  'classe=nenhum; modulo de que este e canal (ex.: o canal WhatsApp tem pai mensageria e nao tem schema). So liga com o pai ligado.';

-- ---------------------------------------------------------------------------
-- 2) Linha de todo modulo do catalogo (planta v0.3, peca 4 §1). Idempotente.
--    schema_nome so aponta schema que nasce na PR do proprio modulo; ate la o
--    modulo existe so no catalogo. `tarefas` ganha schema na onda 2A.
-- ---------------------------------------------------------------------------
INSERT INTO public.modulo (slug, nome, descricao, dono, schema_nome, classe, ligado, modulo_pai) VALUES
  ('crm',           'CRM',                       'Lead, oportunidade, venda, pos-venda e pesquisa de satisfacao',            'CRO',           'crm',           'essencial', true,  NULL),
  ('eventos',       'Eventos',                   'Evento, participante, presenca e ingresso (modulo ligavel)',               'CMO',           'eventos',       'ligavel',   false, NULL),
  ('produto',       'Gestao de produto',         'Linha de produto, ficha versionada, roadmap, feedback e lancamento',       'CPO',           'produto',       'essencial', true,  NULL),
  ('marketing',     'Marketing',                 'Canal, campanha, captacao, segmento, disparo e atribuicao',                'CMO',           'marketing',     'essencial', true,  NULL),
  ('financeiro',    'ERP financeiro',            'Espelho do ERP: titulo, pagamento, conciliacao, fornecedor e orcamento',   'CFO',           'financeiro',    'essencial', true,  NULL),
  ('cobranca',      'Cobranca recorrente',       'Assinatura, ciclo e meio de pagamento do provedor (modulo ligavel)',       'CFO',           'cobranca',      'ligavel',   false, NULL),
  ('pessoas',       'Pessoas e feedback',        'Colaborador, avaliacao, clima, vaga e feedback',                           'CHRO',          'pessoas',       'essencial', true,  NULL),
  ('mensageria',    'Mensageria e atendimento',  'Caixa unica de atendimento, conversa, mensagem e fila',                    'CRO',           'mensageria',    'essencial', true,  NULL),
  ('whatsapp',      'Canal WhatsApp',            'Canal oficial da Meta na caixa de mensageria (sem schema proprio)',        'CRO',           NULL,            'ligavel',   false, 'mensageria'),
  ('instagram',     'Automacao Instagram',       'Fluxo de comentario e DM do Instagram (modulo ligavel)',                   'CMO',           'instagram',     'ligavel',   false, NULL),
  ('organograma',   'Organograma',               'Cargo, posicao, equipe, lideranca e trilha do cargo',                      'CHRO',          'organograma',   'essencial', true,  NULL),
  ('maturidade',    'Maturidade',                'Niveis 1 a 5 da empresa e evidencia (modulo ligavel)',                     'CAIO',          'maturidade',    'ligavel',   false, NULL),
  ('curso',         'Curso',                     'Curso, aula, trilha, matricula e certificado (modulo ligavel)',            'CPO',           'curso',         'ligavel',   false, NULL),
  ('gestao',        'Gestao',                    'Meta, reuniao, decisao e painel de gestao',                                'Integrador',    'gestao',        'essencial', true,  NULL),
  ('juridico',      'Juridico e conformidade',   'Contrato, risco, tratamento de dado pessoal e pedido do titular',          'Juridico',      'juridico',      'essencial', true,  NULL),
  ('plataforma',    'Plataforma de TI e dados',  'Catalogo de rotina, indicador, acesso e retencao',                         'CTO',           'plataforma',    'essencial', true,  NULL),
  ('operacao_ia',   'Operacao de agentes',       'Rastro, avaliacao, memoria e fila dos agentes de IA',                      'CAIO',          'operacao_ia',   'essencial', true,  NULL),
  ('conhecimento',  'Base de conhecimento',      'Artigo e trecho indexado, fonte de busca do agente e do atendimento',      'CAIO',          'conhecimento',  'essencial', true,  NULL)
ON CONFLICT (slug) DO NOTHING;

-- Os slugs restritos (ADR-012 item 7): `.manage` nao abre. Os slugs de todo
-- modulo (read, write, manage), ligavel inclusive, entram aqui (P4: slug de
-- modulo desligado existe no catalogo; a CONCESSAO e que e recusada).
-- PERMISSOES:INICIO
INSERT INTO public.permissoes (slug, modulo, acao, descricao) VALUES
  ('crm.read', 'crm', 'read', 'Ver os dados do modulo CRM'),
  ('crm.write', 'crm', 'write', 'Criar e editar dados do modulo CRM'),
  ('crm.manage', 'crm', 'manage', 'Gerir o modulo CRM (aprovacoes e ajustes)'),
  ('eventos.read', 'eventos', 'read', 'Ver os dados do modulo Eventos'),
  ('eventos.write', 'eventos', 'write', 'Criar e editar dados do modulo Eventos'),
  ('eventos.manage', 'eventos', 'manage', 'Gerir o modulo Eventos (aprovacoes e ajustes)'),
  ('produto.read', 'produto', 'read', 'Ver os dados do modulo Gestao de produto'),
  ('produto.write', 'produto', 'write', 'Criar e editar dados do modulo Gestao de produto'),
  ('produto.manage', 'produto', 'manage', 'Gerir o modulo Gestao de produto (aprovacoes e ajustes)'),
  ('marketing.read', 'marketing', 'read', 'Ver os dados do modulo Marketing'),
  ('marketing.write', 'marketing', 'write', 'Criar e editar dados do modulo Marketing'),
  ('marketing.manage', 'marketing', 'manage', 'Gerir o modulo Marketing (aprovacoes e ajustes)'),
  ('financeiro.read', 'financeiro', 'read', 'Ver os dados do modulo ERP financeiro'),
  ('financeiro.write', 'financeiro', 'write', 'Criar e editar dados do modulo ERP financeiro'),
  ('financeiro.manage', 'financeiro', 'manage', 'Gerir o modulo ERP financeiro (aprovacoes e ajustes)'),
  ('cobranca.read', 'cobranca', 'read', 'Ver os dados do modulo Cobranca recorrente'),
  ('cobranca.write', 'cobranca', 'write', 'Criar e editar dados do modulo Cobranca recorrente'),
  ('cobranca.manage', 'cobranca', 'manage', 'Gerir o modulo Cobranca recorrente (aprovacoes e ajustes)'),
  ('pessoas.read', 'pessoas', 'read', 'Ver os dados do modulo Pessoas e feedback'),
  ('pessoas.write', 'pessoas', 'write', 'Criar e editar dados do modulo Pessoas e feedback'),
  ('pessoas.manage', 'pessoas', 'manage', 'Gerir o modulo Pessoas e feedback (aprovacoes e ajustes)'),
  ('mensageria.read', 'mensageria', 'read', 'Ver os dados do modulo Mensageria e atendimento'),
  ('mensageria.write', 'mensageria', 'write', 'Criar e editar dados do modulo Mensageria e atendimento'),
  ('mensageria.manage', 'mensageria', 'manage', 'Gerir o modulo Mensageria e atendimento (aprovacoes e ajustes)'),
  ('whatsapp.read', 'whatsapp', 'read', 'Ver os dados do modulo Canal WhatsApp'),
  ('whatsapp.write', 'whatsapp', 'write', 'Criar e editar dados do modulo Canal WhatsApp'),
  ('whatsapp.manage', 'whatsapp', 'manage', 'Gerir o modulo Canal WhatsApp (aprovacoes e ajustes)'),
  ('instagram.read', 'instagram', 'read', 'Ver os dados do modulo Automacao Instagram'),
  ('instagram.write', 'instagram', 'write', 'Criar e editar dados do modulo Automacao Instagram'),
  ('instagram.manage', 'instagram', 'manage', 'Gerir o modulo Automacao Instagram (aprovacoes e ajustes)'),
  ('organograma.read', 'organograma', 'read', 'Ver os dados do modulo Organograma'),
  ('organograma.write', 'organograma', 'write', 'Criar e editar dados do modulo Organograma'),
  ('organograma.manage', 'organograma', 'manage', 'Gerir o modulo Organograma (aprovacoes e ajustes)'),
  ('maturidade.read', 'maturidade', 'read', 'Ver os dados do modulo Maturidade'),
  ('maturidade.write', 'maturidade', 'write', 'Criar e editar dados do modulo Maturidade'),
  ('maturidade.manage', 'maturidade', 'manage', 'Gerir o modulo Maturidade (aprovacoes e ajustes)'),
  ('curso.read', 'curso', 'read', 'Ver os dados do modulo Curso'),
  ('curso.write', 'curso', 'write', 'Criar e editar dados do modulo Curso'),
  ('curso.manage', 'curso', 'manage', 'Gerir o modulo Curso (aprovacoes e ajustes)'),
  ('gestao.read', 'gestao', 'read', 'Ver os dados do modulo Gestao'),
  ('gestao.write', 'gestao', 'write', 'Criar e editar dados do modulo Gestao'),
  ('gestao.manage', 'gestao', 'manage', 'Gerir o modulo Gestao (aprovacoes e ajustes)'),
  ('juridico.read', 'juridico', 'read', 'Ver os dados do modulo Juridico e conformidade'),
  ('juridico.write', 'juridico', 'write', 'Criar e editar dados do modulo Juridico e conformidade'),
  ('juridico.manage', 'juridico', 'manage', 'Gerir o modulo Juridico e conformidade (aprovacoes e ajustes)'),
  ('plataforma.read', 'plataforma', 'read', 'Ver os dados do modulo Plataforma de TI e dados'),
  ('plataforma.write', 'plataforma', 'write', 'Criar e editar dados do modulo Plataforma de TI e dados'),
  ('plataforma.manage', 'plataforma', 'manage', 'Gerir o modulo Plataforma de TI e dados (aprovacoes e ajustes)'),
  ('operacao_ia.read', 'operacao_ia', 'read', 'Ver os dados do modulo Operacao de agentes'),
  ('operacao_ia.write', 'operacao_ia', 'write', 'Criar e editar dados do modulo Operacao de agentes'),
  ('operacao_ia.manage', 'operacao_ia', 'manage', 'Gerir o modulo Operacao de agentes (aprovacoes e ajustes)'),
  ('conhecimento.read', 'conhecimento', 'read', 'Ver os dados do modulo Base de conhecimento'),
  ('conhecimento.write', 'conhecimento', 'write', 'Criar e editar dados do modulo Base de conhecimento'),
  ('conhecimento.manage', 'conhecimento', 'manage', 'Gerir o modulo Base de conhecimento (aprovacoes e ajustes)'),
  ('tarefas.manage', 'tarefas', 'manage', 'Portfolio, linha de base e aprovacao de horas das tarefas'),
  ('pessoas.restrito', 'pessoas', 'restrito', 'Ver avaliacao, salario e plano de desenvolvimento (o gestor do modulo nao abre sozinho)'),
  ('juridico.privacidade', 'juridico', 'privacidade', 'Tratar pedido do titular e registro de tratamento de dado pessoal'),
  ('juridico.denuncia', 'juridico', 'denuncia', 'Gerir o canal de denuncia'),
  ('juridico.risco', 'juridico', 'risco', 'Ver e editar risco de escopo projeto'),
  ('plataforma.registros', 'plataforma', 'registros', 'Gerir a regra de retencao e o termo de descarte'),
  ('plataforma.arquivo', 'plataforma', 'arquivo', 'Ler o arquivo restrito (dado guardado por obrigacao legal)'),
  ('operacao_ia.memoria_pessoal', 'operacao_ia', 'memoria_pessoal', 'Ler memoria de agente que guarda dado de pessoa')
ON CONFLICT (slug) DO NOTHING;
-- PERMISSOES:FIM

-- ---------------------------------------------------------------------------
-- 3) Gatilho da P4: nao se concede slug de modulo desligado; desligar revoga.
--    Vale pra TODO papel (gatilho nao e policy: service_role tambem cai).
-- ---------------------------------------------------------------------------
CREATE OR REPLACE FUNCTION public.fn_concessao_so_modulo_ligado()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_modulo text;
BEGIN
  SELECT p.modulo INTO v_modulo FROM public.permissoes p WHERE p.slug = NEW.permissao;
  IF v_modulo IS NOT NULL
     AND EXISTS (SELECT 1 FROM public.modulo m WHERE m.slug = v_modulo AND NOT m.ligado) THEN
    RAISE EXCEPTION 'modulo % esta desligado: ligue o modulo antes de conceder %', v_modulo, NEW.permissao
      USING ERRCODE = 'P0001';
  END IF;
  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS trg_concessao_so_modulo_ligado ON public.usuarios_permissoes;
CREATE TRIGGER trg_concessao_so_modulo_ligado
  BEFORE INSERT ON public.usuarios_permissoes
  FOR EACH ROW EXECUTE FUNCTION public.fn_concessao_so_modulo_ligado();

COMMENT ON TRIGGER trg_concessao_so_modulo_ligado ON public.usuarios_permissoes IS
  'P4 (ADR-015): recusa INSERT de concessao cujo slug pertence a modulo desligado (public.modulo.ligado = false). Vale pra todo papel. Religar o modulo libera concessao nova; as revogadas ao desligar nao voltam sozinhas.';

CREATE OR REPLACE FUNCTION public.fn_modulo_desligado_revoga()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
  IF OLD.ligado AND NOT NEW.ligado THEN
    DELETE FROM public.usuarios_permissoes up
     USING public.permissoes p
     WHERE up.permissao = p.slug AND p.modulo = NEW.slug;
  END IF;
  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS trg_modulo_desligado_revoga ON public.modulo;
CREATE TRIGGER trg_modulo_desligado_revoga
  AFTER UPDATE OF ligado ON public.modulo
  FOR EACH ROW EXECUTE FUNCTION public.fn_modulo_desligado_revoga();

COMMENT ON TRIGGER trg_modulo_desligado_revoga ON public.modulo IS
  'P4 (ADR-015): ao passar ligado de true para false, apaga as concessoes de todos os slugs do modulo (acrescimo em usuarios_permissoes, tabela da spec v2). Dado e tabela do modulo ficam (ADR-012 item 5). Dispara por qualquer caminho (RPC ou UPDATE de maquina).';

-- ---------------------------------------------------------------------------
-- 4) RPC public.ligar_modulo(modulo, ligado)
-- ---------------------------------------------------------------------------
CREATE OR REPLACE FUNCTION public.ligar_modulo(p_modulo text, p_ligado boolean)
RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  m public.modulo%ROWTYPE;
  v_usuario uuid := public.usuario_atual();
BEGIN
  -- Maquina (auth.uid() nulo: seed, migration) passa; anon nem chega aqui (sem EXECUTE).
  IF auth.uid() IS NOT NULL AND NOT public.tem_permissao('configuracoes.write') THEN
    RAISE EXCEPTION 'ligar ou desligar modulo exige a permissao configuracoes.write'
      USING ERRCODE = '42501';
  END IF;
  IF p_ligado IS NULL THEN
    RAISE EXCEPTION 'informe se o modulo deve ficar ligado (true) ou desligado (false)';
  END IF;

  SELECT * INTO m FROM public.modulo WHERE slug = p_modulo FOR UPDATE;
  IF NOT FOUND THEN
    RAISE EXCEPTION 'modulo % nao existe no catalogo', p_modulo;
  END IF;
  IF m.classe = 'essencial' AND NOT p_ligado THEN
    RAISE EXCEPTION 'modulo essencial (%) nao desliga', p_modulo;
  END IF;
  IF m.ligado = p_ligado THEN
    RETURN;  -- ja esta no estado pedido: nada a fazer, nada a registrar
  END IF;

  IF p_ligado THEN
    -- Ligavel so liga com o schema ja instalado pela migration do modulo (ADR-024)
    IF m.schema_nome IS NOT NULL
       AND NOT EXISTS (SELECT 1 FROM pg_namespace WHERE nspname = m.schema_nome) THEN
      RAISE EXCEPTION 'o schema % do modulo % nao esta instalado: aplique a migration do modulo antes de ligar',
        m.schema_nome, p_modulo;
    END IF;
    -- Canal so liga com o pai ligado
    IF m.modulo_pai IS NOT NULL
       AND NOT EXISTS (SELECT 1 FROM public.modulo p WHERE p.slug = m.modulo_pai AND p.ligado) THEN
      RAISE EXCEPTION 'o modulo % depende de % e ele esta desligado', p_modulo, m.modulo_pai;
    END IF;
  END IF;

  UPDATE public.modulo
     SET ligado = p_ligado,
         ligado_em = CASE WHEN p_ligado THEN now() ELSE ligado_em END,
         ligado_por_usuario_id = v_usuario
   WHERE slug = p_modulo;

  -- Trilha: so tipo e id do modulo, sem dado pessoal. usuario_id NULL = maquina.
  INSERT INTO public.atividade (usuario_id, tipo, descricao, metadata)
  VALUES (v_usuario,
          CASE WHEN p_ligado THEN 'modulo_ligado' ELSE 'modulo_desligado' END,
          CASE WHEN p_ligado THEN 'Modulo ligado: ' ELSE 'Modulo desligado: ' END || p_modulo,
          jsonb_build_object('modulo', p_modulo));
END;
$$;

COMMENT ON FUNCTION public.ligar_modulo(text, boolean) IS
  'RPC unica pra ligar e desligar modulo (ADR-015). Exige configuracoes.write (ou maquina: auth.uid() nulo). Essencial nao desliga; ligavel so liga com o schema instalado (ADR-024) e com o pai ligado. Desligar revoga as concessoes do modulo (trigger trg_modulo_desligado_revoga). Grava linha em atividade (modulo_ligado / modulo_desligado).';

REVOKE ALL ON FUNCTION public.ligar_modulo(text, boolean) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.ligar_modulo(text, boolean) TO authenticated, service_role;

-- Funcoes de gatilho: ninguem chama direto.
REVOKE ALL ON FUNCTION public.fn_concessao_so_modulo_ligado() FROM PUBLIC, anon, authenticated, service_role;
REVOKE ALL ON FUNCTION public.fn_modulo_desligado_revoga() FROM PUBLIC, anon, authenticated, service_role;

-- ---------------------------------------------------------------------------
-- 5) Padrao unico de outbox e inbox (ADR-006, GA-10). Chamada pela migration de
--    cada modulo logo depois do CREATE SCHEMA: select public.criar_outbox_inbox('crm');
--    Sem grant a authenticated nem a anon (so o relay, hoje service_role); sem
--    policy: deny-all pra quem tem RLS. Payload so com ids, tipo e versao.
--    Fila pgmq e NOTIFY ficam fora do template (GA-10 proibe NOTIFY como fila).
-- ---------------------------------------------------------------------------
CREATE OR REPLACE FUNCTION public.criar_outbox_inbox(p_schema text)
RETURNS void
LANGUAGE plpgsql
SET search_path = public
AS $$
DECLARE
  v_dono text;
BEGIN
  SELECT m.dono INTO v_dono FROM public.modulo m WHERE m.schema_nome = p_schema;
  IF p_schema = 'public' THEN
    v_dono := 'Lider de Dados';  -- outbox do nucleo (eventos nucleo.*), dono do nucleo
  END IF;
  IF v_dono IS NULL THEN
    RAISE EXCEPTION 'schema % nao esta em public.modulo (schema_nome): registre o modulo antes de criar a outbox', p_schema;
  END IF;
  IF NOT EXISTS (SELECT 1 FROM pg_namespace WHERE nspname = p_schema) THEN
    RAISE EXCEPTION 'schema % nao existe: crie o schema do modulo antes da outbox', p_schema;
  END IF;

  EXECUTE format($t$
    CREATE TABLE IF NOT EXISTS %1$I.outbox (
      id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
      tipo text NOT NULL CHECK (tipo ~ '^[a-z0-9_]+\.[a-z0-9_]+$'),
      versao integer NOT NULL DEFAULT 1 CHECK (versao >= 1),
      correlacao text,
      payload jsonb NOT NULL DEFAULT '{}',
      criada_em timestamptz NOT NULL DEFAULT now(),
      publicada_em timestamptz
    )$t$, p_schema);
  EXECUTE format($t$
    CREATE TABLE IF NOT EXISTS %1$I.inbox (
      id bigint GENERATED ALWAYS AS IDENTITY PRIMARY KEY,
      origem text NOT NULL,
      evento_id uuid NOT NULL,
      tipo text NOT NULL,
      recebida_em timestamptz NOT NULL DEFAULT now(),
      processada_em timestamptz,
      tentativas integer NOT NULL DEFAULT 0,
      erro text,
      CONSTRAINT uq_inbox_origem_evento UNIQUE (origem, evento_id)
    )$t$, p_schema);
  EXECUTE format('CREATE INDEX IF NOT EXISTS idx_outbox_pendente ON %1$I.outbox (criada_em) WHERE publicada_em IS NULL', p_schema);
  EXECUTE format('CREATE INDEX IF NOT EXISTS idx_inbox_pendente ON %1$I.inbox (recebida_em) WHERE processada_em IS NULL', p_schema);

  EXECUTE format('ALTER TABLE %1$I.outbox ENABLE ROW LEVEL SECURITY', p_schema);
  EXECUTE format('ALTER TABLE %1$I.inbox ENABLE ROW LEVEL SECURITY', p_schema);
  EXECUTE format('REVOKE ALL ON %1$I.outbox FROM PUBLIC, anon, authenticated', p_schema);
  EXECUTE format('REVOKE ALL ON %1$I.inbox FROM PUBLIC, anon, authenticated', p_schema);
  EXECUTE format('GRANT ALL ON %1$I.outbox TO service_role', p_schema);
  EXECUTE format('GRANT ALL ON %1$I.inbox TO service_role', p_schema);

  EXECUTE format('COMMENT ON TABLE %1$I.outbox IS %2$L', p_schema,
    'dono=' || v_dono || '; retencao=R06; Evento do modulo gravado na mesma transacao do fato; o relay publica e carimba publicada_em. Sem acesso de usuario nem de agente. Payload so com ids, tipo e versao.');
  EXECUTE format('COMMENT ON TABLE %1$I.inbox IS %2$L', p_schema,
    'dono=' || v_dono || '; retencao=R06; Evento recebido de outro modulo, idempotente por (origem, evento_id); o marcador entra na mesma transacao do efeito. Sem acesso de usuario nem de agente.');

  EXECUTE format('COMMENT ON COLUMN %1$I.outbox.id IS %2$L', p_schema, 'classe=nenhum; id do evento (envelope CloudEvents).');
  EXECUTE format('COMMENT ON COLUMN %1$I.outbox.tipo IS %2$L', p_schema, 'classe=nenhum; tipo do evento no formato modulo.fato.');
  EXECUTE format('COMMENT ON COLUMN %1$I.outbox.versao IS %2$L', p_schema, 'classe=nenhum; versao do contrato do evento; consumidor tolera versao desconhecida.');
  EXECUTE format('COMMENT ON COLUMN %1$I.outbox.correlacao IS %2$L', p_schema, 'classe=nenhum; chave de correlacao do fato (id da linha de origem).');
  EXECUTE format('COMMENT ON COLUMN %1$I.outbox.payload IS %2$L', p_schema, 'classe=pessoal; so ids, tipo e versao, sem texto livre; pessoal pelos ids de parte.');
  EXECUTE format('COMMENT ON COLUMN %1$I.outbox.publicada_em IS %2$L', p_schema, 'classe=nenhum; NULL = ainda nao publicada pelo relay.');
  EXECUTE format('COMMENT ON COLUMN %1$I.inbox.origem IS %2$L', p_schema, 'classe=nenhum; modulo produtor do evento.');
  EXECUTE format('COMMENT ON COLUMN %1$I.inbox.evento_id IS %2$L', p_schema, 'classe=nenhum; id do evento na outbox de origem.');
  EXECUTE format('COMMENT ON COLUMN %1$I.inbox.tipo IS %2$L', p_schema, 'classe=nenhum; tipo do evento.');
  EXECUTE format('COMMENT ON COLUMN %1$I.inbox.recebida_em IS %2$L', p_schema, 'classe=nenhum; quando chegou.');
  EXECUTE format('COMMENT ON COLUMN %1$I.inbox.processada_em IS %2$L', p_schema, 'classe=nenhum; NULL = ainda nao processada.');
  EXECUTE format('COMMENT ON COLUMN %1$I.inbox.tentativas IS %2$L', p_schema, 'classe=nenhum; quantas vezes o processador tentou.');
  EXECUTE format('COMMENT ON COLUMN %1$I.inbox.erro IS %2$L', p_schema, 'classe=nenhum; codigo do erro da ultima tentativa, nunca o payload.');
END;
$$;

COMMENT ON FUNCTION public.criar_outbox_inbox(text) IS
  'Cria <schema>.outbox e <schema>.inbox no padrao unico (GA-10), com RLS, sem grant a anon/authenticated, COMMENT de dono e retencao R06 e classe por coluna. Uso unico: dentro da migration do modulo, depois do CREATE SCHEMA e da linha em public.modulo. Idempotente. Ninguem a chama pelo app.';

REVOKE ALL ON FUNCTION public.criar_outbox_inbox(text) FROM PUBLIC, anon, authenticated, service_role;

-- ---------------------------------------------------------------------------
-- Smoke
-- ---------------------------------------------------------------------------
DO $$
DECLARE
  v_n int;
  v_ess_pegou boolean := false;
  v_conc_pegou boolean := false;
  v_sem_schema_pegou boolean := false;
  v_revogou int;
  v_u uuid := gen_random_uuid();
BEGIN
  -- estrutura
  IF (SELECT count(*) FROM pg_attribute WHERE attrelid = 'public.modulo'::regclass
        AND attname IN ('classe','ligado','ligado_em','ligado_por_usuario_id','modulo_pai')
        AND NOT attisdropped) <> 5 THEN
    RAISE EXCEPTION 'smoke 0013: public.modulo sem as 5 colunas novas';
  END IF;

  -- todo modulo tem classe valida; ligavel desligado nasce sem concessao
  SELECT count(*) INTO v_n FROM public.modulo WHERE slug IN
    ('eventos','cobranca','whatsapp','instagram','maturidade','curso') AND classe = 'ligavel' AND NOT ligado;
  IF v_n <> 6 THEN
    RAISE EXCEPTION 'smoke 0013: esperava 6 modulos ligaveis desligados, achei %', v_n;
  END IF;
  IF EXISTS (SELECT 1 FROM public.modulo WHERE classe = 'essencial' AND NOT ligado) THEN
    RAISE EXCEPTION 'smoke 0013: modulo essencial desligado — ck_modulo_essencial_ligado sumiu';
  END IF;

  -- slugs: todo modulo novo tem read/write/manage; restrito existe
  SELECT count(*) INTO v_n FROM public.modulo m
   WHERE m.slug NOT IN ('agentes','execucoes','documentos','usuarios','atividade','configuracoes','conexoes')
     AND (SELECT count(*) FROM public.permissoes p WHERE p.modulo = m.slug AND p.acao IN ('read','write','manage')) < 3;
  IF v_n <> 0 THEN
    RAISE EXCEPTION 'smoke 0013: % modulo(s) sem os 3 slugs read/write/manage', v_n;
  END IF;
  IF NOT EXISTS (SELECT 1 FROM public.permissoes WHERE slug = 'pessoas.restrito')
     OR NOT EXISTS (SELECT 1 FROM public.permissoes WHERE slug = 'plataforma.arquivo')
     OR NOT EXISTS (SELECT 1 FROM public.permissoes WHERE slug = 'tarefas.manage') THEN
    RAISE EXCEPTION 'smoke 0013: slug restrito do ADR-012 item 7 ausente';
  END IF;

  -- essencial nao desliga (CHECK)
  BEGIN
    BEGIN
      UPDATE public.modulo SET ligado = false WHERE slug = 'crm';
    EXCEPTION WHEN check_violation THEN v_ess_pegou := true; END;
    RAISE EXCEPTION 'smoke 0013: desfazendo' USING ERRCODE = 'P0999';
  EXCEPTION WHEN SQLSTATE 'P0999' THEN NULL;
  END;
  IF NOT v_ess_pegou THEN
    RAISE EXCEPTION 'smoke 0013: modulo essencial foi desligado — ck_modulo_essencial_ligado sumiu';
  END IF;

  -- P4: conceder slug de modulo desligado e recusado; desligar revoga
  BEGIN
    INSERT INTO public.usuarios (id, nome, email) VALUES (v_u, '_smoke', '_smoke@exemplo.invalid');
    BEGIN
      INSERT INTO public.usuarios_permissoes (usuario_id, permissao) VALUES (v_u, 'curso.read');
    EXCEPTION WHEN SQLSTATE 'P0001' THEN v_conc_pegou := true; END;
    -- liga o canal (pai ligado, sem schema), concede, desliga e conta o que sobrou
    PERFORM public.ligar_modulo('whatsapp', true);
    INSERT INTO public.usuarios_permissoes (usuario_id, permissao) VALUES (v_u, 'whatsapp.read');
    PERFORM public.ligar_modulo('whatsapp', false);
    SELECT count(*) INTO v_revogou FROM public.usuarios_permissoes WHERE usuario_id = v_u;
    -- ligavel com schema nao instalado nao liga
    BEGIN
      PERFORM public.ligar_modulo('curso', true);
    EXCEPTION WHEN OTHERS THEN v_sem_schema_pegou := true; END;
    RAISE EXCEPTION 'smoke 0013: desfazendo' USING ERRCODE = 'P0999';
  EXCEPTION WHEN SQLSTATE 'P0999' THEN NULL;
  END;
  IF NOT v_conc_pegou THEN
    RAISE EXCEPTION 'smoke 0013: concessao de slug de modulo desligado foi aceita — trg_concessao_so_modulo_ligado sumiu';
  END IF;
  IF v_revogou <> 0 THEN
    RAISE EXCEPTION 'smoke 0013: desligar o modulo nao revogou as concessoes (% restaram) — trg_modulo_desligado_revoga sumiu', v_revogou;
  END IF;
  IF NOT v_sem_schema_pegou THEN
    RAISE EXCEPTION 'smoke 0013: ligavel sem schema instalado foi ligado — a checagem do ADR-024 sumiu da ligar_modulo';
  END IF;

  -- ligar_modulo: anon sem EXECUTE; authenticated e service_role com
  IF has_function_privilege('anon', 'public.ligar_modulo(text, boolean)', 'EXECUTE') THEN
    RAISE EXCEPTION 'smoke 0013: anon executa ligar_modulo';
  END IF;
  IF NOT has_function_privilege('authenticated', 'public.ligar_modulo(text, boolean)', 'EXECUTE') THEN
    RAISE EXCEPTION 'smoke 0013: authenticated sem EXECUTE em ligar_modulo — a tela de configuracoes nao liga nada';
  END IF;
  IF has_function_privilege('authenticated', 'public.criar_outbox_inbox(text)', 'EXECUTE')
     OR has_function_privilege('anon', 'public.criar_outbox_inbox(text)', 'EXECUTE') THEN
    RAISE EXCEPTION 'smoke 0013: criar_outbox_inbox executavel pelo app';
  END IF;
END $$;

-- Rollback:
--   DROP FUNCTION IF EXISTS public.criar_outbox_inbox(text);
--   DROP FUNCTION IF EXISTS public.ligar_modulo(text, boolean);
--   DROP TRIGGER IF EXISTS trg_modulo_desligado_revoga ON public.modulo;
--   DROP FUNCTION IF EXISTS public.fn_modulo_desligado_revoga();
--   DROP TRIGGER IF EXISTS trg_concessao_so_modulo_ligado ON public.usuarios_permissoes;
--   DROP FUNCTION IF EXISTS public.fn_concessao_so_modulo_ligado();
--   DELETE FROM public.permissoes WHERE modulo IN (SELECT slug FROM public.modulo WHERE criada_em >= <data desta migration>);
--   (e as linhas de modulo inseridas acima; depois)
--   ALTER TABLE public.modulo DROP COLUMN IF EXISTS modulo_pai, DROP COLUMN IF EXISTS ligado_por_usuario_id,
--     DROP COLUMN IF EXISTS ligado_em, DROP COLUMN IF EXISTS ligado, DROP COLUMN IF EXISTS classe;
