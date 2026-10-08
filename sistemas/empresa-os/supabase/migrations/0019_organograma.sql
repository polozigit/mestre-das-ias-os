-- 0019_organograma.sql
-- Organograma de referencia no banco do aluno (front v2): as 19 tabelas da migration_681 do Polozi OS
-- (areas, cargos, processos APQC, pacotes, playbooks, workflows, ondas, biblioteca de documentos), mais
-- POSICAO e OCUPACAO (nova): cada cargo tem posicoes que a empresa do aluno vai preencher com uma
-- pessoa (public.parte) OU um agente (public.agentes), nunca os dois, e sem duas ocupacoes vigentes
-- sobrepostas na mesma posicao.
--   1) schema `organograma` (public.modulo, 0013), com outbox/inbox do padrao
--   2) 19 tabelas de conteudo (copia da 681, sem os papeis do Polozi OS) + posicao + posicao_ocupacao
--   3) views no schema do modulo (GA-04), todas security_invoker; v_posicao_ocupante mostra so a
--      ocupacao vigente
--   4) organograma.carregar(jsonb): SECURITY DEFINER, so service_role; cria a posicao 0 de todo cargo
--   5) RLS: leitura por organograma.read; posicao e ocupacao editam com organograma.manage
--      (INSERT e UPDATE; sem DELETE, GA-16: ocupacao se encerra por UPDATE de vigente_ate)
-- Depende de 0005 (agentes), 0013 (modulo, outbox), 0015 (parte, btree_gist).
-- Rollback ao fim.

CREATE EXTENSION IF NOT EXISTS btree_gist WITH SCHEMA extensions;

-- ---------------------------------------------------------------------------
-- 1) Schema do modulo + outbox/inbox
-- ---------------------------------------------------------------------------
CREATE SCHEMA IF NOT EXISTS organograma;
COMMENT ON SCHEMA organograma IS
  'Modulo Organograma (dono CHRO): organograma de referencia (cargos, areas, processos, pacotes, playbooks, workflows, ondas, documentos) e as posicoes que a empresa preenche com pessoa ou agente.';
REVOKE ALL ON SCHEMA organograma FROM PUBLIC, anon;
GRANT USAGE ON SCHEMA organograma TO authenticated, service_role;

SELECT public.criar_outbox_inbox('organograma');

-- ---------------------------------------------------------------------------
-- 2) Tabelas de conteudo (mesmas colunas, chaves e FKs da migration_681)
-- ---------------------------------------------------------------------------
-- 1. tabelas -------------------------------------------------------------------------------------------
CREATE TABLE IF NOT EXISTS organograma.apqc_pcf (
  codigo  text PRIMARY KEY,
  nome_pt text,
  nome_en text
);

CREATE TABLE IF NOT EXISTS organograma.org_cargo (
  id                  bigint GENERATED ALWAYS AS IDENTITY PRIMARY KEY,
  slug                text NOT NULL UNIQUE,
  tipo                text NOT NULL CHECK (tipo IN ('root','cabeca','cargo')),
  titulo              text NOT NULL,
  sigla               text,
  cargo_real          text,
  area_id             bigint,
  reporta_a_id        bigint REFERENCES organograma.org_cargo(id) ON DELETE SET NULL,
  reporta_a_texto     text,
  sub_area            text,
  vagas               integer,
  aparece_a_partir_de integer,
  time_total          integer,
  missao              text,
  especialidade       text,
  antes               text,
  nivel               text NOT NULL DEFAULT 'senior_completo',
  salario_nota        text,
  salario_proxy       text,
  ordem               integer NOT NULL DEFAULT 0
);

CREATE TABLE IF NOT EXISTS organograma.org_area (
  id           bigint GENERATED ALWAYS AS IDENTITY PRIMARY KEY,
  slug         text NOT NULL UNIQUE,
  titulo       text NOT NULL,
  pai_cargo_id bigint REFERENCES organograma.org_cargo(id) ON DELETE SET NULL,
  time_total   integer,
  ordem        integer NOT NULL DEFAULT 0
);

DO $$ BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'org_cargo_area_id_fkey') THEN
    ALTER TABLE organograma.org_cargo ADD CONSTRAINT org_cargo_area_id_fkey
      FOREIGN KEY (area_id) REFERENCES organograma.org_area(id) ON DELETE SET NULL;
  END IF;
END $$;

CREATE TABLE IF NOT EXISTS organograma.org_area_interface (
  id      bigint GENERATED ALWAYS AS IDENTITY PRIMARY KEY,
  area_id bigint NOT NULL REFERENCES organograma.org_area(id) ON DELETE CASCADE,
  ordem   integer NOT NULL,
  titulo  text NOT NULL,
  nota    text,
  UNIQUE (area_id, ordem)
);

CREATE TABLE IF NOT EXISTS organograma.org_cargo_salario (
  id               bigint GENERATED ALWAYS AS IDENTITY PRIMARY KEY,
  cargo_id         bigint NOT NULL REFERENCES organograma.org_cargo(id) ON DELETE CASCADE,
  ordem            integer NOT NULL,
  cargo_pesquisado text,
  nivel            text,
  moeda            text NOT NULL DEFAULT 'BRL',
  minimo           numeric,
  mediana          numeric,
  maximo           numeric,
  fonte            text,
  url              text,
  auditoria        text CHECK (auditoria IN ('ok','secundaria','nao_confirmado')),
  UNIQUE (cargo_id, ordem)
);

CREATE TABLE IF NOT EXISTS organograma.org_cargo_referencia (
  id       bigint GENERATED ALWAYS AS IDENTITY PRIMARY KEY,
  cargo_id bigint NOT NULL REFERENCES organograma.org_cargo(id) ON DELETE CASCADE,
  ordem    integer NOT NULL,
  texto    text NOT NULL,
  UNIQUE (cargo_id, ordem)
);

CREATE TABLE IF NOT EXISTS organograma.org_processo (
  id        bigint GENERATED ALWAYS AS IDENTITY PRIMARY KEY,
  cargo_id  bigint NOT NULL REFERENCES organograma.org_cargo(id) ON DELETE CASCADE,
  ordem     integer NOT NULL,
  titulo    text NOT NULL,
  horas_mes numeric,
  notas     text,
  apqc      text[] NOT NULL DEFAULT '{}',
  UNIQUE (cargo_id, ordem)
);

CREATE TABLE IF NOT EXISTS organograma.org_pacote (
  id        bigint GENERATED ALWAYS AS IDENTITY PRIMARY KEY,
  slug      text NOT NULL UNIQUE,
  cargo_id  bigint NOT NULL UNIQUE REFERENCES organograma.org_cargo(id) ON DELETE CASCADE,
  versao    text,
  data      text,
  validade  text,
  modelou   text,
  aprovou   text,
  pasta     text,
  auditoria text,
  marcas    jsonb NOT NULL DEFAULT '{}'::jsonb,
  casos_md  text
);

CREATE TABLE IF NOT EXISTS organograma.org_pacote_secao (
  id        bigint GENERATED ALWAYS AS IDENTITY PRIMARY KEY,
  pacote_id bigint NOT NULL REFERENCES organograma.org_pacote(id) ON DELETE CASCADE,
  ordem     integer NOT NULL,
  titulo    text NOT NULL,
  markdown  text,
  UNIQUE (pacote_id, ordem)
);

CREATE TABLE IF NOT EXISTS organograma.org_playbook (
  id             bigint GENERATED ALWAYS AS IDENTITY PRIMARY KEY,
  pacote_id      bigint NOT NULL REFERENCES organograma.org_pacote(id) ON DELETE CASCADE,
  slug           text NOT NULL,
  ordem          integer NOT NULL DEFAULT 0,
  processo       text,
  frequencia     text,
  horas_texto    text,
  apqc           text,
  nivel_minimo   text,
  aprova         text,
  versao         text,
  validade       text,
  markdown       text,
  cargos_citados text[] NOT NULL DEFAULT '{}',
  UNIQUE (pacote_id, slug)
);

CREATE TABLE IF NOT EXISTS organograma.org_cargo_playbook (
  id          bigint GENERATED ALWAYS AS IDENTITY PRIMARY KEY,
  cargo_id    bigint NOT NULL REFERENCES organograma.org_cargo(id) ON DELETE CASCADE,
  playbook_id bigint NOT NULL REFERENCES organograma.org_playbook(id) ON DELETE CASCADE,
  papel       text,
  UNIQUE (cargo_id, playbook_id)
);

CREATE TABLE IF NOT EXISTS organograma.org_workflow (
  id    bigint GENERATED ALWAYS AS IDENTITY PRIMARY KEY,
  slug  text NOT NULL UNIQUE,
  nome  text NOT NULL,
  fonte text
);

CREATE TABLE IF NOT EXISTS organograma.org_workflow_raia (
  id          bigint GENERATED ALWAYS AS IDENTITY PRIMARY KEY,
  workflow_id bigint NOT NULL REFERENCES organograma.org_workflow(id) ON DELETE CASCADE,
  chave       text NOT NULL,
  nome        text NOT NULL,
  cargo_id    bigint REFERENCES organograma.org_cargo(id) ON DELETE SET NULL,
  ordem       integer NOT NULL DEFAULT 0,
  UNIQUE (workflow_id, chave)
);

CREATE TABLE IF NOT EXISTS organograma.org_workflow_passo (
  id             bigint GENERATED ALWAYS AS IDENTITY PRIMARY KEY,
  workflow_id    bigint NOT NULL REFERENCES organograma.org_workflow(id) ON DELETE CASCADE,
  codigo         text NOT NULL,
  ordem          integer NOT NULL DEFAULT 0,
  passo          text NOT NULL,
  quem           text,
  faz            text,
  entrega        text,
  passa          text,
  gate           text,
  playbook_texto text,
  coluna         integer NOT NULL DEFAULT 0,
  raias          text[] NOT NULL DEFAULT '{}',
  proximos       text[] NOT NULL DEFAULT '{}',
  lacos          text[] NOT NULL DEFAULT '{}',
  sai_caio       boolean NOT NULL DEFAULT false,
  UNIQUE (workflow_id, codigo)
);

CREATE TABLE IF NOT EXISTS organograma.org_workflow_passo_playbook (
  id          bigint GENERATED ALWAYS AS IDENTITY PRIMARY KEY,
  passo_id    bigint NOT NULL REFERENCES organograma.org_workflow_passo(id) ON DELETE CASCADE,
  playbook_id bigint NOT NULL REFERENCES organograma.org_playbook(id) ON DELETE CASCADE,
  ordem       integer NOT NULL DEFAULT 0,
  UNIQUE (passo_id, playbook_id)
);

CREATE TABLE IF NOT EXISTS organograma.org_onda (
  id      bigint GENERATED ALWAYS AS IDENTITY PRIMARY KEY,
  codigo  text NOT NULL UNIQUE,
  ordem   integer NOT NULL DEFAULT 0,
  time    text,
  porque  text,
  depende text
);

CREATE TABLE IF NOT EXISTS organograma.org_onda_cargo (
  id       bigint GENERATED ALWAYS AS IDENTITY PRIMARY KEY,
  onda_id  bigint NOT NULL REFERENCES organograma.org_onda(id) ON DELETE CASCADE,
  ordem    integer NOT NULL,
  texto    text NOT NULL,
  cargo_id bigint REFERENCES organograma.org_cargo(id) ON DELETE SET NULL,
  UNIQUE (onda_id, ordem)
);

-- biblioteca: todo documento da frente (10-mestre-das-ias/visao-niveis + gestao) e o conhecimento destilado dos
-- especialistas (12-fabrica-gurus/*/kb, fontes/ dos pacotes). Direito autoral (Polozi 28/09): destilacao e parafrase
-- entram; trecho literal so curto (o carregador corta em 25 palavras); livro ou transcricao integral (extracoes/) nunca.
CREATE TABLE IF NOT EXISTS organograma.org_documento (
  id        bigint GENERATED ALWAYS AS IDENTITY PRIMARY KEY,
  caminho   text NOT NULL UNIQUE,
  tipo      text NOT NULL,
  titulo    text NOT NULL,
  resumo    text,
  markdown  text NOT NULL,
  tamanho   integer NOT NULL DEFAULT 0,
  pacote_id bigint REFERENCES organograma.org_pacote(id) ON DELETE SET NULL,
  ordem     integer NOT NULL DEFAULT 0
);
-- colunas e regras que podem mudar: idempotentes (homolog ja tem a tabela de uma versao anterior deste arquivo)
ALTER TABLE organograma.org_documento ADD COLUMN IF NOT EXISTS especialista text;
ALTER TABLE organograma.org_documento
  DROP CONSTRAINT IF EXISTS org_documento_tipo_check,
  DROP CONSTRAINT IF EXISTS org_documento_caminho_check;
ALTER TABLE organograma.org_documento
  ADD CONSTRAINT org_documento_tipo_check CHECK (tipo IN ('frente','maturidade','dimensao','area_maturidade','pesquisa',
    'molde','cultura','dossie','auditoria','gestao','fonte_especialista','especialista','playbook_compartilhado')),
  ADD CONSTRAINT org_documento_caminho_check CHECK (caminho !~ '/extracoes/');

CREATE TABLE IF NOT EXISTS organograma.org_carga (
  id           bigint GENERATED ALWAYS AS IDENTITY PRIMARY KEY,
  carregado_em timestamptz NOT NULL DEFAULT now(),
  git_sha      text,
  ambiente     text,
  contagens    jsonb NOT NULL DEFAULT '{}'::jsonb
);

-- indices das FKs (advisor unindexed_foreign_keys)
CREATE INDEX IF NOT EXISTS org_cargo_area_idx        ON organograma.org_cargo (area_id);
CREATE INDEX IF NOT EXISTS org_cargo_reporta_idx     ON organograma.org_cargo (reporta_a_id);
CREATE INDEX IF NOT EXISTS org_area_pai_idx          ON organograma.org_area (pai_cargo_id);
CREATE INDEX IF NOT EXISTS org_cargo_playbook_pb_idx ON organograma.org_cargo_playbook (playbook_id);
CREATE INDEX IF NOT EXISTS org_raia_cargo_idx        ON organograma.org_workflow_raia (cargo_id);
CREATE INDEX IF NOT EXISTS org_passo_pb_pb_idx       ON organograma.org_workflow_passo_playbook (playbook_id);
CREATE INDEX IF NOT EXISTS org_onda_cargo_cargo_idx  ON organograma.org_onda_cargo (cargo_id);
CREATE INDEX IF NOT EXISTS org_documento_pacote_idx  ON organograma.org_documento (pacote_id);

-- ---------------------------------------------------------------------------
-- 2b) Posicao e ocupacao (nova no template do aluno)
-- ---------------------------------------------------------------------------
CREATE TABLE IF NOT EXISTS organograma.posicao (
  id bigint GENERATED ALWAYS AS IDENTITY PRIMARY KEY,
  cargo_id bigint NOT NULL REFERENCES organograma.org_cargo(id) ON DELETE CASCADE,
  estado text NOT NULL DEFAULT 'visivel' CHECK (estado IN ('visivel', 'contratada', 'integrada', 'aprovada')),
  titulo text,
  ordem integer NOT NULL DEFAULT 0,
  criada_em timestamptz NOT NULL DEFAULT now(),
  atualizada_em timestamptz NOT NULL DEFAULT now(),
  CONSTRAINT uq_posicao_cargo_ordem UNIQUE (cargo_id, ordem)
);

CREATE TABLE IF NOT EXISTS organograma.posicao_ocupacao (
  id bigint GENERATED ALWAYS AS IDENTITY PRIMARY KEY,
  posicao_id bigint NOT NULL REFERENCES organograma.posicao(id) ON DELETE RESTRICT,
  parte_id bigint CONSTRAINT fk_posicao_ocupacao_parte REFERENCES public.parte(id),
  agente_id uuid CONSTRAINT fk_posicao_ocupacao_agente REFERENCES public.agentes(id),
  vigente_de date NOT NULL DEFAULT current_date,
  vigente_ate date,
  CONSTRAINT ck_posicao_ocupacao_um_ocupante CHECK (num_nonnulls(parte_id, agente_id) <= 1),
  CONSTRAINT ck_posicao_ocupacao_periodo CHECK (vigente_ate IS NULL OR vigente_ate >= vigente_de),
  CONSTRAINT ex_posicao_ocupacao_sem_sobreposicao EXCLUDE USING gist (
    posicao_id WITH =, daterange(vigente_de, vigente_ate, '[]') WITH &&)
);

CREATE INDEX IF NOT EXISTS idx_posicao_ocupacao_parte ON organograma.posicao_ocupacao (parte_id) WHERE parte_id IS NOT NULL;
CREATE INDEX IF NOT EXISTS idx_posicao_ocupacao_agente ON organograma.posicao_ocupacao (agente_id) WHERE agente_id IS NOT NULL;

DROP TRIGGER IF EXISTS trg_posicao_atualizada_em ON organograma.posicao;
CREATE TRIGGER trg_posicao_atualizada_em
  BEFORE UPDATE ON organograma.posicao
  FOR EACH ROW EXECUTE FUNCTION public.set_atualizada_em();

-- ---------------------------------------------------------------------------
-- COMMENTs (GA-02 dono/retencao na tabela; GA-07 classe= em toda coluna fora id/criada_em/atualizada_em)
-- ---------------------------------------------------------------------------
COMMENT ON TABLE organograma.apqc_pcf IS
  'dono=CHRO; retencao=R12; Catalogo APQC PCF (codigo e nome pt/en) citado pelos processos e playbooks.';
COMMENT ON COLUMN organograma.apqc_pcf.codigo IS 'classe=nenhum; codigo estavel do item (chave natural usada pela carga).';
COMMENT ON COLUMN organograma.apqc_pcf.nome_pt IS 'classe=nenhum; nome em portugues.';
COMMENT ON COLUMN organograma.apqc_pcf.nome_en IS 'classe=nenhum; nome em ingles.';
COMMENT ON TABLE organograma.org_cargo IS
  'dono=CHRO; retencao=R12; Cargo de referencia do organograma (raiz, cabeca ou cargo), com hierarquia, missao e referencia salarial.';
COMMENT ON COLUMN organograma.org_cargo.slug IS 'classe=nenhum; identificador estavel (chave natural) usado pela carga.';
COMMENT ON COLUMN organograma.org_cargo.tipo IS 'classe=nenhum; raiz, cabeca ou cargo.';
COMMENT ON COLUMN organograma.org_cargo.titulo IS 'classe=nenhum; titulo exibido na tela.';
COMMENT ON COLUMN organograma.org_cargo.sigla IS 'classe=nenhum; sigla do cargo.';
COMMENT ON COLUMN organograma.org_cargo.cargo_real IS 'classe=nenhum; nome do cargo como aparece no mercado.';
COMMENT ON COLUMN organograma.org_cargo.area_id IS 'classe=nenhum; area a que pertence.';
COMMENT ON COLUMN organograma.org_cargo.reporta_a_id IS 'classe=nenhum; cargo a quem reporta (hierarquia).';
COMMENT ON COLUMN organograma.org_cargo.reporta_a_texto IS 'classe=nenhum; texto livre de a quem reporta, quando nao ha cargo correspondente.';
COMMENT ON COLUMN organograma.org_cargo.sub_area IS 'classe=nenhum; subarea dentro da area.';
COMMENT ON COLUMN organograma.org_cargo.vagas IS 'classe=nenhum; quantidade de vagas previstas.';
COMMENT ON COLUMN organograma.org_cargo.aparece_a_partir_de IS 'classe=nenhum; nivel de maturidade a partir do qual o cargo aparece.';
COMMENT ON COLUMN organograma.org_cargo.time_total IS 'classe=nenhum; tamanho total do time sob o cargo ou area.';
COMMENT ON COLUMN organograma.org_cargo.missao IS 'classe=nenhum; missao do cargo.';
COMMENT ON COLUMN organograma.org_cargo.especialidade IS 'classe=nenhum; especialidade do cargo.';
COMMENT ON COLUMN organograma.org_cargo.antes IS 'classe=nenhum; como a funcao era feita antes.';
COMMENT ON COLUMN organograma.org_cargo.nivel IS 'classe=nenhum; nivel de maturidade do cargo.';
COMMENT ON COLUMN organograma.org_cargo.salario_nota IS 'classe=nenhum; nota sobre a referencia salarial.';
COMMENT ON COLUMN organograma.org_cargo.salario_proxy IS 'classe=nenhum; cargo usado como proxy da referencia salarial.';
COMMENT ON COLUMN organograma.org_cargo.ordem IS 'classe=nenhum; posicao de exibicao.';
COMMENT ON TABLE organograma.org_area IS
  'dono=CHRO; retencao=R12; Area do organograma de referencia (agrupa cargos sob um cargo pai).';
COMMENT ON COLUMN organograma.org_area.slug IS 'classe=nenhum; identificador estavel (chave natural) usado pela carga.';
COMMENT ON COLUMN organograma.org_area.titulo IS 'classe=nenhum; titulo exibido na tela.';
COMMENT ON COLUMN organograma.org_area.pai_cargo_id IS 'classe=nenhum; cargo pai da area.';
COMMENT ON COLUMN organograma.org_area.time_total IS 'classe=nenhum; tamanho total do time sob o cargo ou area.';
COMMENT ON COLUMN organograma.org_area.ordem IS 'classe=nenhum; posicao de exibicao.';
COMMENT ON TABLE organograma.org_area_interface IS
  'dono=CHRO; retencao=R12; Interface da area com outras areas (lista ordenada).';
COMMENT ON COLUMN organograma.org_area_interface.area_id IS 'classe=nenhum; area a que pertence.';
COMMENT ON COLUMN organograma.org_area_interface.ordem IS 'classe=nenhum; posicao de exibicao.';
COMMENT ON COLUMN organograma.org_area_interface.titulo IS 'classe=nenhum; titulo exibido na tela.';
COMMENT ON COLUMN organograma.org_area_interface.nota IS 'classe=nenhum; observacao de apoio.';
COMMENT ON TABLE organograma.org_cargo_salario IS
  'dono=CHRO; retencao=R12; Faixa salarial pesquisada para o cargo de referencia, com fonte e grau de auditoria.';
COMMENT ON COLUMN organograma.org_cargo_salario.cargo_id IS 'classe=nenhum; cargo a que se refere.';
COMMENT ON COLUMN organograma.org_cargo_salario.ordem IS 'classe=nenhum; posicao de exibicao.';
COMMENT ON COLUMN organograma.org_cargo_salario.cargo_pesquisado IS 'classe=nenhum; cargo pesquisado na fonte salarial.';
COMMENT ON COLUMN organograma.org_cargo_salario.nivel IS 'classe=nenhum; nivel pesquisado na fonte.';
COMMENT ON COLUMN organograma.org_cargo_salario.moeda IS 'classe=nenhum; moeda da faixa salarial.';
COMMENT ON COLUMN organograma.org_cargo_salario.minimo IS 'classe=nenhum; valor minimo da faixa.';
COMMENT ON COLUMN organograma.org_cargo_salario.mediana IS 'classe=nenhum; valor mediano da faixa.';
COMMENT ON COLUMN organograma.org_cargo_salario.maximo IS 'classe=nenhum; valor maximo da faixa.';
COMMENT ON COLUMN organograma.org_cargo_salario.fonte IS 'classe=nenhum; fonte da informacao.';
COMMENT ON COLUMN organograma.org_cargo_salario.url IS 'classe=nenhum; endereco da fonte.';
COMMENT ON COLUMN organograma.org_cargo_salario.auditoria IS 'classe=nenhum; grau de auditoria da informacao.';
COMMENT ON TABLE organograma.org_cargo_referencia IS
  'dono=CHRO; retencao=R12; Referencia de mercado citada para o cargo (lista ordenada).';
COMMENT ON COLUMN organograma.org_cargo_referencia.cargo_id IS 'classe=nenhum; cargo a que se refere.';
COMMENT ON COLUMN organograma.org_cargo_referencia.ordem IS 'classe=nenhum; posicao de exibicao.';
COMMENT ON COLUMN organograma.org_cargo_referencia.texto IS 'classe=nenhum; texto da referencia ou do item.';
COMMENT ON TABLE organograma.org_processo IS
  'dono=CHRO; retencao=R12; Processo que o cargo executa, com horas por mes e codigos APQC.';
COMMENT ON COLUMN organograma.org_processo.cargo_id IS 'classe=nenhum; cargo a que se refere.';
COMMENT ON COLUMN organograma.org_processo.ordem IS 'classe=nenhum; posicao de exibicao.';
COMMENT ON COLUMN organograma.org_processo.titulo IS 'classe=nenhum; titulo exibido na tela.';
COMMENT ON COLUMN organograma.org_processo.horas_mes IS 'classe=nenhum; horas por mes dedicadas ao processo.';
COMMENT ON COLUMN organograma.org_processo.notas IS 'classe=nenhum; observacoes do processo.';
COMMENT ON COLUMN organograma.org_processo.apqc IS 'classe=nenhum; codigos APQC relacionados.';
COMMENT ON TABLE organograma.org_pacote IS
  'dono=CHRO; retencao=R12; Pacote do cargo (versao, aprovacao e partes em markdown); no maximo um por cargo.';
COMMENT ON COLUMN organograma.org_pacote.slug IS 'classe=nenhum; identificador estavel (chave natural) usado pela carga.';
COMMENT ON COLUMN organograma.org_pacote.cargo_id IS 'classe=nenhum; cargo a que se refere.';
COMMENT ON COLUMN organograma.org_pacote.versao IS 'classe=nenhum; versao do conteudo.';
COMMENT ON COLUMN organograma.org_pacote.data IS 'classe=nenhum; data do pacote (texto livre).';
COMMENT ON COLUMN organograma.org_pacote.validade IS 'classe=nenhum; validade do conteudo (texto livre).';
COMMENT ON COLUMN organograma.org_pacote.modelou IS 'classe=pessoal; quem modelou o pacote (pode ser nome de pessoa).';
COMMENT ON COLUMN organograma.org_pacote.aprovou IS 'classe=pessoal; quem aprovou o pacote (pode ser nome de pessoa).';
COMMENT ON COLUMN organograma.org_pacote.pasta IS 'classe=nenhum; pasta de origem no repositorio.';
COMMENT ON COLUMN organograma.org_pacote.auditoria IS 'classe=nenhum; resultado da auditoria do pacote.';
COMMENT ON COLUMN organograma.org_pacote.marcas IS 'classe=nenhum; marcas do pacote em JSON.';
COMMENT ON COLUMN organograma.org_pacote.casos_md IS 'classe=nenhum; casos de uso do pacote em markdown.';
COMMENT ON TABLE organograma.org_pacote_secao IS
  'dono=CHRO; retencao=R12; Secao em markdown do pacote do cargo.';
COMMENT ON COLUMN organograma.org_pacote_secao.pacote_id IS 'classe=nenhum; pacote a que pertence.';
COMMENT ON COLUMN organograma.org_pacote_secao.ordem IS 'classe=nenhum; posicao de exibicao.';
COMMENT ON COLUMN organograma.org_pacote_secao.titulo IS 'classe=nenhum; titulo exibido na tela.';
COMMENT ON COLUMN organograma.org_pacote_secao.markdown IS 'classe=nenhum; conteudo em markdown.';
COMMENT ON TABLE organograma.org_playbook IS
  'dono=CHRO; retencao=R12; Playbook do pacote: processo, frequencia, nivel minimo e texto em markdown.';
COMMENT ON COLUMN organograma.org_playbook.pacote_id IS 'classe=nenhum; pacote a que pertence.';
COMMENT ON COLUMN organograma.org_playbook.slug IS 'classe=nenhum; identificador estavel (chave natural) usado pela carga.';
COMMENT ON COLUMN organograma.org_playbook.ordem IS 'classe=nenhum; posicao do playbook no pacote.';
COMMENT ON COLUMN organograma.org_playbook.processo IS 'classe=nenhum; processo coberto pelo playbook.';
COMMENT ON COLUMN organograma.org_playbook.frequencia IS 'classe=nenhum; frequencia de execucao.';
COMMENT ON COLUMN organograma.org_playbook.horas_texto IS 'classe=nenhum; horas estimadas em texto livre.';
COMMENT ON COLUMN organograma.org_playbook.apqc IS 'classe=nenhum; codigos APQC relacionados.';
COMMENT ON COLUMN organograma.org_playbook.nivel_minimo IS 'classe=nenhum; nivel minimo de maturidade para o playbook.';
COMMENT ON COLUMN organograma.org_playbook.aprova IS 'classe=nenhum; cargo que aprova o playbook.';
COMMENT ON COLUMN organograma.org_playbook.versao IS 'classe=nenhum; versao do playbook.';
COMMENT ON COLUMN organograma.org_playbook.validade IS 'classe=nenhum; validade do playbook.';
COMMENT ON COLUMN organograma.org_playbook.markdown IS 'classe=nenhum; conteudo em markdown.';
COMMENT ON COLUMN organograma.org_playbook.cargos_citados IS 'classe=nenhum; slugs dos cargos citados no playbook.';
COMMENT ON TABLE organograma.org_cargo_playbook IS
  'dono=CHRO; retencao=R12; Quais cargos atuam em cada playbook e com que papel.';
COMMENT ON COLUMN organograma.org_cargo_playbook.cargo_id IS 'classe=nenhum; cargo que atua no playbook.';
COMMENT ON COLUMN organograma.org_cargo_playbook.playbook_id IS 'classe=nenhum; playbook a que se refere.';
COMMENT ON COLUMN organograma.org_cargo_playbook.papel IS 'classe=nenhum; papel do cargo no playbook.';
COMMENT ON TABLE organograma.org_workflow IS
  'dono=CHRO; retencao=R12; Workflow (W1 a W15) do organograma de referencia.';
COMMENT ON COLUMN organograma.org_workflow.slug IS 'classe=nenhum; identificador estavel (chave natural) usado pela carga.';
COMMENT ON COLUMN organograma.org_workflow.nome IS 'classe=nenhum; nome do workflow ou da raia (nome de processo, nao de pessoa).';
COMMENT ON COLUMN organograma.org_workflow.fonte IS 'classe=nenhum; documento de origem do workflow.';
COMMENT ON TABLE organograma.org_workflow_raia IS
  'dono=CHRO; retencao=R12; Raia (cargo ou grupo) de um workflow.';
COMMENT ON COLUMN organograma.org_workflow_raia.workflow_id IS 'classe=nenhum; workflow a que pertence.';
COMMENT ON COLUMN organograma.org_workflow_raia.chave IS 'classe=nenhum; chave da raia dentro do workflow.';
COMMENT ON COLUMN organograma.org_workflow_raia.nome IS 'classe=nenhum; nome do workflow ou da raia (nome de processo, nao de pessoa).';
COMMENT ON COLUMN organograma.org_workflow_raia.cargo_id IS 'classe=nenhum; cargo da raia, quando houver.';
COMMENT ON COLUMN organograma.org_workflow_raia.ordem IS 'classe=nenhum; posicao de exibicao.';
COMMENT ON TABLE organograma.org_workflow_passo IS
  'dono=CHRO; retencao=R12; Passo de um workflow: quem faz, o que entrega, gate e ligacoes com os proximos.';
COMMENT ON COLUMN organograma.org_workflow_passo.workflow_id IS 'classe=nenhum; workflow a que pertence.';
COMMENT ON COLUMN organograma.org_workflow_passo.codigo IS 'classe=nenhum; codigo estavel do item (chave natural usada pela carga).';
COMMENT ON COLUMN organograma.org_workflow_passo.ordem IS 'classe=nenhum; posicao do passo no workflow.';
COMMENT ON COLUMN organograma.org_workflow_passo.passo IS 'classe=nenhum; descricao curta do passo.';
COMMENT ON COLUMN organograma.org_workflow_passo.quem IS 'classe=nenhum; quem executa o passo (papel).';
COMMENT ON COLUMN organograma.org_workflow_passo.faz IS 'classe=nenhum; o que e feito.';
COMMENT ON COLUMN organograma.org_workflow_passo.entrega IS 'classe=nenhum; o que o passo entrega.';
COMMENT ON COLUMN organograma.org_workflow_passo.passa IS 'classe=nenhum; para quem passa a entrega.';
COMMENT ON COLUMN organograma.org_workflow_passo.gate IS 'classe=nenhum; criterio de passagem do passo.';
COMMENT ON COLUMN organograma.org_workflow_passo.playbook_texto IS 'classe=nenhum; playbook citado em texto livre.';
COMMENT ON COLUMN organograma.org_workflow_passo.coluna IS 'classe=nenhum; coluna do diagrama.';
COMMENT ON COLUMN organograma.org_workflow_passo.raias IS 'classe=nenhum; chaves das raias do passo.';
COMMENT ON COLUMN organograma.org_workflow_passo.proximos IS 'classe=nenhum; codigos dos proximos passos.';
COMMENT ON COLUMN organograma.org_workflow_passo.lacos IS 'classe=nenhum; codigos dos passos de retorno (lacos).';
COMMENT ON COLUMN organograma.org_workflow_passo.sai_caio IS 'classe=nenhum; se o passo sai para o CAIO.';
COMMENT ON TABLE organograma.org_workflow_passo_playbook IS
  'dono=CHRO; retencao=R12; Playbooks usados por cada passo de workflow.';
COMMENT ON COLUMN organograma.org_workflow_passo_playbook.passo_id IS 'classe=nenhum; passo a que se refere.';
COMMENT ON COLUMN organograma.org_workflow_passo_playbook.playbook_id IS 'classe=nenhum; playbook a que se refere.';
COMMENT ON COLUMN organograma.org_workflow_passo_playbook.ordem IS 'classe=nenhum; posicao de exibicao.';
COMMENT ON TABLE organograma.org_onda IS
  'dono=CHRO; retencao=R12; Onda de implantacao do organograma (quais cargos entram em cada uma).';
COMMENT ON COLUMN organograma.org_onda.codigo IS 'classe=nenhum; codigo estavel do item (chave natural usada pela carga).';
COMMENT ON COLUMN organograma.org_onda.ordem IS 'classe=nenhum; posicao de exibicao.';
COMMENT ON COLUMN organograma.org_onda.time IS 'classe=nenhum; time (conjunto de cargos) da onda.';
COMMENT ON COLUMN organograma.org_onda.porque IS 'classe=nenhum; por que a onda vem nessa ordem.';
COMMENT ON COLUMN organograma.org_onda.depende IS 'classe=nenhum; ondas de que depende.';
COMMENT ON TABLE organograma.org_onda_cargo IS
  'dono=CHRO; retencao=R12; Cargo (ou texto livre) que entra numa onda.';
COMMENT ON COLUMN organograma.org_onda_cargo.onda_id IS 'classe=nenhum; onda a que pertence.';
COMMENT ON COLUMN organograma.org_onda_cargo.ordem IS 'classe=nenhum; posicao de exibicao.';
COMMENT ON COLUMN organograma.org_onda_cargo.texto IS 'classe=nenhum; texto da referencia ou do item.';
COMMENT ON COLUMN organograma.org_onda_cargo.cargo_id IS 'classe=nenhum; cargo correspondente ao texto, quando houver.';
COMMENT ON TABLE organograma.org_documento IS
  'dono=CHRO; retencao=R12; Documento da biblioteca da frente (decisoes, pesquisas, dossies, conhecimento destilado); texto integral de livro ou transcricao fica fora.';
COMMENT ON COLUMN organograma.org_documento.caminho IS 'classe=nenhum; caminho do arquivo de origem no repositorio.';
COMMENT ON COLUMN organograma.org_documento.tipo IS 'classe=nenhum; tipo de documento da biblioteca.';
COMMENT ON COLUMN organograma.org_documento.titulo IS 'classe=nenhum; titulo exibido na tela.';
COMMENT ON COLUMN organograma.org_documento.resumo IS 'classe=nenhum; resumo do documento.';
COMMENT ON COLUMN organograma.org_documento.markdown IS 'classe=nenhum; conteudo em markdown.';
COMMENT ON COLUMN organograma.org_documento.tamanho IS 'classe=nenhum; tamanho do documento em caracteres.';
COMMENT ON COLUMN organograma.org_documento.pacote_id IS 'classe=nenhum; pacote relacionado, quando houver.';
COMMENT ON COLUMN organograma.org_documento.ordem IS 'classe=nenhum; posicao na biblioteca.';
COMMENT ON COLUMN organograma.org_documento.especialista IS 'classe=pessoal; especialista (autor) de quem o conhecimento foi destilado (nome de pessoa).';
COMMENT ON TABLE organograma.org_carga IS
  'dono=CHRO; retencao=R12; Registro de cada carga do organograma (quando, versao do git, ambiente, contagens).';
COMMENT ON COLUMN organograma.org_carga.carregado_em IS 'classe=nenhum; quando a carga rodou.';
COMMENT ON COLUMN organograma.org_carga.git_sha IS 'classe=nenhum; commit do repositorio que originou a carga.';
COMMENT ON COLUMN organograma.org_carga.ambiente IS 'classe=nenhum; ambiente da carga.';
COMMENT ON COLUMN organograma.org_carga.contagens IS 'classe=nenhum; contagem de linhas por entidade apos a carga.';
COMMENT ON TABLE organograma.posicao IS
  'dono=CHRO; retencao=R12; Posicao de um cargo (vaga a preencher). Estado: visivel, contratada, integrada ou aprovada. Um cargo pode ter varias posicoes (ordem); a carga cria a posicao 0 de todo cargo comum.';
COMMENT ON COLUMN organograma.posicao.cargo_id IS 'classe=nenhum; cargo de referencia a que a posicao pertence.';
COMMENT ON COLUMN organograma.posicao.estado IS 'classe=nenhum; visivel, contratada, integrada ou aprovada.';
COMMENT ON COLUMN organograma.posicao.titulo IS 'classe=nenhum; titulo proprio da posicao na empresa (NULL = usa o do cargo).';
COMMENT ON COLUMN organograma.posicao.ordem IS 'classe=nenhum; numero da posicao dentro do cargo; UNIQUE com cargo_id.';
COMMENT ON TABLE organograma.posicao_ocupacao IS
  'dono=CHRO; retencao=R12; Quem ocupa a posicao e em que periodo: uma pessoa (public.parte) OU um agente (public.agentes), nunca os dois (CHECK), e sem duas ocupacoes sobrepostas na mesma posicao (EXCLUDE). Encerrar = UPDATE de vigente_ate; ninguem apaga (GA-16).';
COMMENT ON COLUMN organograma.posicao_ocupacao.posicao_id IS 'classe=nenhum; posicao ocupada.';
COMMENT ON COLUMN organograma.posicao_ocupacao.parte_id IS 'classe=pessoal; pessoa que ocupa a posicao (public.parte). Exclusivo com agente_id. FK ao nucleo (ADR-013).';
COMMENT ON COLUMN organograma.posicao_ocupacao.agente_id IS 'classe=nenhum; agente que ocupa a posicao (public.agentes). Exclusivo com parte_id. FK ao nucleo (ADR-013).';
COMMENT ON COLUMN organograma.posicao_ocupacao.vigente_de IS 'classe=nenhum; primeiro dia da ocupacao.';
COMMENT ON COLUMN organograma.posicao_ocupacao.vigente_ate IS 'classe=nenhum; ultimo dia da ocupacao (inclusive); NULL = em aberto.';


-- ---------------------------------------------------------------------------
-- 3) Views (schema do modulo, security_invoker)
-- ---------------------------------------------------------------------------
CREATE OR REPLACE VIEW organograma.v_org_no WITH (security_invoker = on) AS
SELECT
  'c:' || c.slug AS no_id,
  CASE
    WHEN c.tipo = 'root' THEN NULL
    WHEN c.area_id IS NOT NULL AND g.area_id IS DISTINCT FROM c.area_id THEN 'a:' || ar.slug
    WHEN g.id IS NOT NULL THEN 'c:' || g.slug
  END AS pai_no_id,
  c.tipo, c.ordem, c.slug, c.titulo, c.sigla, c.cargo_real, c.sub_area, c.vagas, c.aparece_a_partir_de,
  c.time_total, c.missao, c.especialidade, c.antes, c.reporta_a_texto, g.slug AS reporta_a_slug,
  ar.slug AS area_slug, c.salario_nota, c.salario_proxy,
  coalesce((SELECT jsonb_agg(jsonb_build_object('cargo_pesquisado', s.cargo_pesquisado, 'nivel', s.nivel, 'moeda', s.moeda,
      'minimo', s.minimo, 'mediana', s.mediana, 'maximo', s.maximo, 'fonte', s.fonte, 'url', s.url, 'auditoria', s.auditoria)
      ORDER BY s.ordem) FROM organograma.org_cargo_salario s WHERE s.cargo_id = c.id), '[]'::jsonb) AS salarios,
  coalesce((SELECT jsonb_agg(r.texto ORDER BY r.ordem) FROM organograma.org_cargo_referencia r WHERE r.cargo_id = c.id), '[]'::jsonb) AS referencias,
  coalesce((SELECT jsonb_agg(jsonb_build_object('titulo', pr.titulo, 'horas_mes', pr.horas_mes, 'notas', pr.notas,
      'apqc', to_jsonb(pr.apqc)) ORDER BY pr.ordem) FROM organograma.org_processo pr WHERE pr.cargo_id = c.id), '[]'::jsonb) AS processos,
  '[]'::jsonb AS interfaces,
  (SELECT jsonb_build_object('slug', k.slug, 'versao', k.versao, 'data', k.data, 'aprovou', k.aprovou,
      'n_playbooks', (SELECT count(*) FROM organograma.org_playbook b WHERE b.pacote_id = k.id))
   FROM organograma.org_pacote k WHERE k.cargo_id = c.id) AS pacote
FROM organograma.org_cargo c
LEFT JOIN organograma.org_cargo g ON g.id = c.reporta_a_id
LEFT JOIN organograma.org_area ar ON ar.id = c.area_id
UNION ALL
SELECT
  'a:' || a.slug, 'c:' || pc.slug, 'area', a.ordem, a.slug, a.titulo, NULL, NULL, NULL, NULL, NULL,
  a.time_total, NULL, NULL, NULL, NULL, pc.slug, NULL, NULL, NULL,
  '[]'::jsonb, '[]'::jsonb, '[]'::jsonb,
  coalesce((SELECT jsonb_agg(jsonb_build_object('titulo', i.titulo, 'nota', i.nota) ORDER BY i.ordem)
    FROM organograma.org_area_interface i WHERE i.area_id = a.id), '[]'::jsonb),
  NULL::jsonb
FROM organograma.org_area a
LEFT JOIN organograma.org_cargo pc ON pc.id = a.pai_cargo_id;

CREATE OR REPLACE VIEW organograma.v_org_pacote WITH (security_invoker = on) AS
SELECT c.slug AS cargo_slug, k.slug, k.versao, k.data, k.validade, k.modelou, k.aprovou, k.pasta, k.auditoria, k.marcas, k.casos_md,
  coalesce((SELECT jsonb_agg(jsonb_build_object('titulo', s.titulo, 'markdown', s.markdown) ORDER BY s.ordem)
    FROM organograma.org_pacote_secao s WHERE s.pacote_id = k.id), '[]'::jsonb) AS secoes,
  coalesce((SELECT jsonb_agg(jsonb_build_object('slug', b.slug, 'processo', b.processo, 'nivel_minimo', b.nivel_minimo,
      'horas_texto', b.horas_texto, 'frequencia', b.frequencia, 'apqc', b.apqc, 'markdown', b.markdown,
      'papeis', coalesce((SELECT jsonb_agg(jsonb_build_object('cargo_slug', cc.slug, 'cargo_titulo', cc.titulo, 'papel', cp.papel)
                                           ORDER BY (cc.id = k.cargo_id) DESC, cc.ordem)
                          FROM organograma.org_cargo_playbook cp JOIN organograma.org_cargo cc ON cc.id = cp.cargo_id
                          WHERE cp.playbook_id = b.id), '[]'::jsonb)) ORDER BY b.ordem)
    FROM organograma.org_playbook b WHERE b.pacote_id = k.id), '[]'::jsonb) AS playbooks
FROM organograma.org_pacote k
JOIN organograma.org_cargo c ON c.id = k.cargo_id;

CREATE OR REPLACE VIEW organograma.v_org_workflow_raia WITH (security_invoker = on) AS
SELECT w.slug AS workflow_slug, r.ordem, r.chave, r.nome, c.slug AS cargo_slug
FROM organograma.org_workflow_raia r
JOIN organograma.org_workflow w ON w.id = r.workflow_id
LEFT JOIN organograma.org_cargo c ON c.id = r.cargo_id;

CREATE OR REPLACE VIEW organograma.v_org_workflow_passo WITH (security_invoker = on) AS
SELECT w.slug AS workflow_slug, p.ordem, p.codigo, p.passo, p.quem, p.faz, p.entrega, p.passa, p.gate, p.playbook_texto,
  p.coluna, p.raias, p.proximos, p.lacos, p.sai_caio,
  coalesce((SELECT jsonb_agg(jsonb_build_object('pacote_slug', k.slug, 'slug', b.slug) ORDER BY pp.ordem)
    FROM organograma.org_workflow_passo_playbook pp
    JOIN organograma.org_playbook b ON b.id = pp.playbook_id
    JOIN organograma.org_pacote k ON k.id = b.pacote_id
    WHERE pp.passo_id = p.id), '[]'::jsonb) AS playbooks
FROM organograma.org_workflow_passo p
JOIN organograma.org_workflow w ON w.id = p.workflow_id;

CREATE OR REPLACE VIEW organograma.v_org_onda WITH (security_invoker = on) AS
SELECT o.ordem, o.codigo, o.time, o.porque, o.depende,
  coalesce((SELECT jsonb_agg(jsonb_build_object('texto', oc.texto, 'cargo_slug', c.slug) ORDER BY oc.ordem)
    FROM organograma.org_onda_cargo oc LEFT JOIN organograma.org_cargo c ON c.id = oc.cargo_id
    WHERE oc.onda_id = o.id), '[]'::jsonb) AS cargos
FROM organograma.org_onda o;

CREATE OR REPLACE VIEW organograma.v_org_apqc WITH (security_invoker = on) AS
SELECT codigo, nome_pt, nome_en FROM organograma.apqc_pcf;

CREATE OR REPLACE VIEW organograma.v_org_documento WITH (security_invoker = on) AS
SELECT d.caminho, d.tipo, d.titulo, d.resumo, d.tamanho, d.ordem, k.slug AS pacote_slug, c.slug AS cargo_slug,
  d.markdown, d.especialista
FROM organograma.org_documento d
LEFT JOIN organograma.org_pacote k ON k.id = d.pacote_id
LEFT JOIN organograma.org_cargo c ON c.id = k.cargo_id;

-- em quais playbooks cada cargo atua e com que papel (inclusive cargo sem pacote proprio, via pacote do chefe)
CREATE OR REPLACE VIEW organograma.v_org_cargo_playbook WITH (security_invoker = on) AS
SELECT c.slug AS cargo_slug, k.slug AS pacote_slug, dono.slug AS pacote_cargo_slug, dono.titulo AS pacote_cargo_titulo,
  b.slug AS playbook_slug, b.processo, b.nivel_minimo, cp.papel, b.ordem
FROM organograma.org_cargo_playbook cp
JOIN organograma.org_cargo c ON c.id = cp.cargo_id
JOIN organograma.org_playbook b ON b.id = cp.playbook_id
JOIN organograma.org_pacote k ON k.id = b.pacote_id
JOIN organograma.org_cargo dono ON dono.id = k.cargo_id;

CREATE OR REPLACE VIEW organograma.v_org_carga WITH (security_invoker = on) AS
SELECT carregado_em, git_sha, ambiente, contagens FROM organograma.org_carga ORDER BY id DESC LIMIT 1;

-- Quem ocupa cada posicao HOJE (so a ocupacao vigente). LEFT JOIN em agentes: quem le o organograma
-- mas nao tem agentes.read ve o agente_id e ocupante_tipo, sem o nome.
CREATE OR REPLACE VIEW organograma.v_posicao_ocupante WITH (security_invoker = true) AS
SELECT p.id AS posicao_id, c.slug AS cargo_slug, c.titulo AS cargo_titulo, p.estado,
  CASE WHEN o.agente_id IS NOT NULL THEN 'agente'
       WHEN o.parte_id IS NOT NULL THEN 'pessoa'
       ELSE 'vazio' END AS ocupante_tipo,
  o.agente_id, a.name AS agente_name, o.parte_id
FROM organograma.posicao p
JOIN organograma.org_cargo c ON c.id = p.cargo_id
LEFT JOIN organograma.posicao_ocupacao o
  ON o.posicao_id = p.id AND o.vigente_de <= current_date AND (o.vigente_ate IS NULL OR o.vigente_ate >= current_date)
LEFT JOIN public.agentes a ON a.id = o.agente_id;

COMMENT ON VIEW organograma.v_posicao_ocupante IS
  'Ocupante vigente de cada posicao: pessoa, agente ou vazio. Le public.agentes (nucleo) so pra o nome do agente (GA-04, excecao com ADR-013).';


-- ---------------------------------------------------------------------------
-- 4) RPC de carga: arquivo -> banco. Corpo da migration_681; agora SECURITY DEFINER (dono escreve),
--    EXECUTE so do service_role (script da IA). Cria a posicao 0 de todo cargo comum.
-- ---------------------------------------------------------------------------
CREATE OR REPLACE FUNCTION organograma.carregar(p jsonb)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = organograma, pg_temp
AS $fn$
DECLARE
  v_cont jsonb;
  v_slug_hist text;
BEGIN
  DROP TABLE IF EXISTS _sal, _ref, _proc, _ifc, _sec, _pb, _cpb, _raia, _passo, _ppb, _oc, _doc;
  -- payload ruim nao pode esvaziar o catalogo
  IF p IS NULL OR jsonb_typeof(p->'cargos') IS DISTINCT FROM 'array'
     OR (SELECT count(*) FROM jsonb_array_elements(p->'cargos') x WHERE x->>'tipo' = 'root') <> 1 THEN
    RAISE EXCEPTION 'organograma.carregar: payload sem cargos ou sem exatamente 1 raiz';
  END IF;

  -- APQC
  INSERT INTO apqc_pcf AS t (codigo, nome_pt, nome_en)
  SELECT x.codigo, x.nome_pt, x.nome_en FROM jsonb_to_recordset(coalesce(p->'apqc','[]')) x(codigo text, nome_pt text, nome_en text)
  ON CONFLICT (codigo) DO UPDATE SET nome_pt = EXCLUDED.nome_pt, nome_en = EXCLUDED.nome_en
  WHERE (t.nome_pt, t.nome_en) IS DISTINCT FROM (EXCLUDED.nome_pt, EXCLUDED.nome_en);
  DELETE FROM apqc_pcf t WHERE NOT EXISTS (SELECT 1 FROM jsonb_array_elements(coalesce(p->'apqc','[]')) x WHERE x->>'codigo' = t.codigo);

  -- cargos (sem FKs; FKs depois das areas)
  INSERT INTO org_cargo AS t (slug, tipo, titulo, sigla, cargo_real, reporta_a_texto, sub_area, vagas,
    aparece_a_partir_de, time_total, missao, especialidade, antes, salario_nota, salario_proxy, ordem)
  SELECT x.slug, x.tipo, x.titulo, x.sigla, x.cargo_real, x.reporta_a_texto, x.sub_area, x.vagas,
    x.aparece_a_partir_de, x.time_total, x.missao, x.especialidade, x.antes, x.salario_nota, x.salario_proxy, x.ordem
  FROM jsonb_to_recordset(p->'cargos') x(slug text, tipo text, titulo text, sigla text, cargo_real text,
    reporta_a_texto text, sub_area text, vagas int, aparece_a_partir_de int, time_total int, missao text,
    especialidade text, antes text, salario_nota text, salario_proxy text, ordem int)
  ON CONFLICT (slug) DO UPDATE SET tipo = EXCLUDED.tipo, titulo = EXCLUDED.titulo, sigla = EXCLUDED.sigla,
    cargo_real = EXCLUDED.cargo_real, reporta_a_texto = EXCLUDED.reporta_a_texto, sub_area = EXCLUDED.sub_area,
    vagas = EXCLUDED.vagas, aparece_a_partir_de = EXCLUDED.aparece_a_partir_de, time_total = EXCLUDED.time_total,
    missao = EXCLUDED.missao, especialidade = EXCLUDED.especialidade, antes = EXCLUDED.antes,
    salario_nota = EXCLUDED.salario_nota, salario_proxy = EXCLUDED.salario_proxy, ordem = EXCLUDED.ordem
  WHERE (t.tipo, t.titulo, t.sigla, t.cargo_real, t.reporta_a_texto, t.sub_area, t.vagas, t.aparece_a_partir_de,
         t.time_total, t.missao, t.especialidade, t.antes, t.salario_nota, t.salario_proxy, t.ordem)
    IS DISTINCT FROM (EXCLUDED.tipo, EXCLUDED.titulo, EXCLUDED.sigla, EXCLUDED.cargo_real, EXCLUDED.reporta_a_texto,
         EXCLUDED.sub_area, EXCLUDED.vagas, EXCLUDED.aparece_a_partir_de, EXCLUDED.time_total, EXCLUDED.missao,
         EXCLUDED.especialidade, EXCLUDED.antes, EXCLUDED.salario_nota, EXCLUDED.salario_proxy, EXCLUDED.ordem);

  -- areas
  INSERT INTO org_area AS t (slug, titulo, pai_cargo_id, time_total, ordem)
  SELECT x.slug, x.titulo, c.id, x.time_total, x.ordem
  FROM jsonb_to_recordset(coalesce(p->'areas','[]')) x(slug text, titulo text, pai_cargo_slug text, time_total int, ordem int)
  LEFT JOIN org_cargo c ON c.slug = x.pai_cargo_slug
  ON CONFLICT (slug) DO UPDATE SET titulo = EXCLUDED.titulo, pai_cargo_id = EXCLUDED.pai_cargo_id,
    time_total = EXCLUDED.time_total, ordem = EXCLUDED.ordem
  WHERE (t.titulo, t.pai_cargo_id, t.time_total, t.ordem)
    IS DISTINCT FROM (EXCLUDED.titulo, EXCLUDED.pai_cargo_id, EXCLUDED.time_total, EXCLUDED.ordem);

  -- FKs do cargo
  UPDATE org_cargo t SET area_id = a.id, reporta_a_id = g.id
  FROM jsonb_to_recordset(p->'cargos') x(slug text, area_slug text, reporta_a_slug text)
  LEFT JOIN org_area a ON a.slug = x.area_slug
  LEFT JOIN org_cargo g ON g.slug = x.reporta_a_slug
  WHERE t.slug = x.slug AND (t.area_id, t.reporta_a_id) IS DISTINCT FROM (a.id, g.id);

  -- listas filhas do cargo e da area
  CREATE TEMP TABLE _sal ON COMMIT DROP AS
  SELECT c.id AS cargo_id, s.ordem::int - 1 AS ordem, s.v
  FROM jsonb_array_elements(p->'cargos') x JOIN org_cargo c ON c.slug = x->>'slug'
  CROSS JOIN LATERAL jsonb_array_elements(coalesce(x->'salarios','[]')) WITH ORDINALITY s(v, ordem);
  INSERT INTO org_cargo_salario AS t (cargo_id, ordem, cargo_pesquisado, nivel, moeda, minimo, mediana, maximo, fonte, url, auditoria)
  SELECT cargo_id, ordem, v->>'cargo_pesquisado', v->>'nivel', coalesce(v->>'moeda','BRL'), (v->>'minimo')::numeric,
    (v->>'mediana')::numeric, (v->>'maximo')::numeric, v->>'fonte', v->>'url', v->>'auditoria' FROM _sal
  ON CONFLICT (cargo_id, ordem) DO UPDATE SET cargo_pesquisado = EXCLUDED.cargo_pesquisado, nivel = EXCLUDED.nivel,
    moeda = EXCLUDED.moeda, minimo = EXCLUDED.minimo, mediana = EXCLUDED.mediana, maximo = EXCLUDED.maximo,
    fonte = EXCLUDED.fonte, url = EXCLUDED.url, auditoria = EXCLUDED.auditoria
  WHERE (t.cargo_pesquisado, t.nivel, t.moeda, t.minimo, t.mediana, t.maximo, t.fonte, t.url, t.auditoria)
    IS DISTINCT FROM (EXCLUDED.cargo_pesquisado, EXCLUDED.nivel, EXCLUDED.moeda, EXCLUDED.minimo, EXCLUDED.mediana,
      EXCLUDED.maximo, EXCLUDED.fonte, EXCLUDED.url, EXCLUDED.auditoria);
  DELETE FROM org_cargo_salario t WHERE NOT EXISTS (SELECT 1 FROM _sal s WHERE s.cargo_id = t.cargo_id AND s.ordem = t.ordem);

  CREATE TEMP TABLE _ref ON COMMIT DROP AS
  SELECT c.id AS cargo_id, r.ordem::int - 1 AS ordem, r.v #>> '{}' AS texto
  FROM jsonb_array_elements(p->'cargos') x JOIN org_cargo c ON c.slug = x->>'slug'
  CROSS JOIN LATERAL jsonb_array_elements(coalesce(x->'referencias','[]')) WITH ORDINALITY r(v, ordem);
  INSERT INTO org_cargo_referencia AS t (cargo_id, ordem, texto) SELECT cargo_id, ordem, texto FROM _ref
  ON CONFLICT (cargo_id, ordem) DO UPDATE SET texto = EXCLUDED.texto WHERE t.texto IS DISTINCT FROM EXCLUDED.texto;
  DELETE FROM org_cargo_referencia t WHERE NOT EXISTS (SELECT 1 FROM _ref s WHERE s.cargo_id = t.cargo_id AND s.ordem = t.ordem);

  CREATE TEMP TABLE _proc ON COMMIT DROP AS
  SELECT c.id AS cargo_id, r.ordem::int - 1 AS ordem, r.v
  FROM jsonb_array_elements(p->'cargos') x JOIN org_cargo c ON c.slug = x->>'slug'
  CROSS JOIN LATERAL jsonb_array_elements(coalesce(x->'processos','[]')) WITH ORDINALITY r(v, ordem);
  INSERT INTO org_processo AS t (cargo_id, ordem, titulo, horas_mes, notas, apqc)
  SELECT cargo_id, ordem, v->>'titulo', (v->>'horas_mes')::numeric, v->>'notas',
    coalesce(ARRAY(SELECT jsonb_array_elements_text(coalesce(v->'apqc','[]'))), '{}') FROM _proc
  ON CONFLICT (cargo_id, ordem) DO UPDATE SET titulo = EXCLUDED.titulo, horas_mes = EXCLUDED.horas_mes,
    notas = EXCLUDED.notas, apqc = EXCLUDED.apqc
  WHERE (t.titulo, t.horas_mes, t.notas, t.apqc) IS DISTINCT FROM (EXCLUDED.titulo, EXCLUDED.horas_mes, EXCLUDED.notas, EXCLUDED.apqc);
  DELETE FROM org_processo t WHERE NOT EXISTS (SELECT 1 FROM _proc s WHERE s.cargo_id = t.cargo_id AND s.ordem = t.ordem);

  CREATE TEMP TABLE _ifc ON COMMIT DROP AS
  SELECT a.id AS area_id, r.ordem::int - 1 AS ordem, r.v
  FROM jsonb_array_elements(coalesce(p->'areas','[]')) x JOIN org_area a ON a.slug = x->>'slug'
  CROSS JOIN LATERAL jsonb_array_elements(coalesce(x->'interfaces','[]')) WITH ORDINALITY r(v, ordem);
  INSERT INTO org_area_interface AS t (area_id, ordem, titulo, nota) SELECT area_id, ordem, v->>'titulo', v->>'nota' FROM _ifc
  ON CONFLICT (area_id, ordem) DO UPDATE SET titulo = EXCLUDED.titulo, nota = EXCLUDED.nota
  WHERE (t.titulo, t.nota) IS DISTINCT FROM (EXCLUDED.titulo, EXCLUDED.nota);
  DELETE FROM org_area_interface t WHERE NOT EXISTS (SELECT 1 FROM _ifc s WHERE s.area_id = t.area_id AND s.ordem = t.ordem);

  -- pacotes
  INSERT INTO org_pacote AS t (slug, cargo_id, versao, data, validade, modelou, aprovou, pasta, auditoria, marcas, casos_md)
  SELECT x.slug, c.id, x.versao, x.data, x.validade, x.modelou, x.aprovou, x.pasta, x.auditoria, coalesce(x.marcas,'{}'), x.casos_md
  FROM jsonb_to_recordset(coalesce(p->'pacotes','[]')) x(slug text, cargo_slug text, versao text, data text, validade text,
    modelou text, aprovou text, pasta text, auditoria text, marcas jsonb, casos_md text)
  JOIN org_cargo c ON c.slug = x.cargo_slug
  ON CONFLICT (slug) DO UPDATE SET cargo_id = EXCLUDED.cargo_id, versao = EXCLUDED.versao, data = EXCLUDED.data,
    validade = EXCLUDED.validade, modelou = EXCLUDED.modelou, aprovou = EXCLUDED.aprovou, pasta = EXCLUDED.pasta,
    auditoria = EXCLUDED.auditoria, marcas = EXCLUDED.marcas, casos_md = EXCLUDED.casos_md
  WHERE (t.cargo_id, t.versao, t.data, t.validade, t.modelou, t.aprovou, t.pasta, t.auditoria, t.marcas, t.casos_md)
    IS DISTINCT FROM (EXCLUDED.cargo_id, EXCLUDED.versao, EXCLUDED.data, EXCLUDED.validade, EXCLUDED.modelou,
      EXCLUDED.aprovou, EXCLUDED.pasta, EXCLUDED.auditoria, EXCLUDED.marcas, EXCLUDED.casos_md);
  DELETE FROM org_pacote t WHERE NOT EXISTS (SELECT 1 FROM jsonb_array_elements(coalesce(p->'pacotes','[]')) x WHERE x->>'slug' = t.slug);

  CREATE TEMP TABLE _sec ON COMMIT DROP AS
  SELECT k.id AS pacote_id, r.ordem::int - 1 AS ordem, r.v
  FROM jsonb_array_elements(coalesce(p->'pacotes','[]')) x JOIN org_pacote k ON k.slug = x->>'slug'
  CROSS JOIN LATERAL jsonb_array_elements(coalesce(x->'secoes','[]')) WITH ORDINALITY r(v, ordem);
  INSERT INTO org_pacote_secao AS t (pacote_id, ordem, titulo, markdown) SELECT pacote_id, ordem, v->>'titulo', v->>'markdown' FROM _sec
  ON CONFLICT (pacote_id, ordem) DO UPDATE SET titulo = EXCLUDED.titulo, markdown = EXCLUDED.markdown
  WHERE (t.titulo, t.markdown) IS DISTINCT FROM (EXCLUDED.titulo, EXCLUDED.markdown);
  DELETE FROM org_pacote_secao t WHERE NOT EXISTS (SELECT 1 FROM _sec s WHERE s.pacote_id = t.pacote_id AND s.ordem = t.ordem);

  CREATE TEMP TABLE _pb ON COMMIT DROP AS
  SELECT k.id AS pacote_id, r.ordem::int - 1 AS ordem, r.v
  FROM jsonb_array_elements(coalesce(p->'pacotes','[]')) x JOIN org_pacote k ON k.slug = x->>'slug'
  CROSS JOIN LATERAL jsonb_array_elements(coalesce(x->'playbooks','[]')) WITH ORDINALITY r(v, ordem);
  INSERT INTO org_playbook AS t (pacote_id, slug, ordem, processo, frequencia, horas_texto, apqc, nivel_minimo, aprova,
    versao, validade, markdown, cargos_citados)
  SELECT pacote_id, v->>'slug', ordem, v->>'processo', v->>'frequencia', v->>'horas_texto', v->>'apqc', v->>'nivel_minimo',
    v->>'aprova', v->>'versao', v->>'validade', v->>'markdown',
    coalesce(ARRAY(SELECT jsonb_array_elements_text(coalesce(v->'cargos_citados','[]'))), '{}') FROM _pb
  ON CONFLICT (pacote_id, slug) DO UPDATE SET ordem = EXCLUDED.ordem, processo = EXCLUDED.processo,
    frequencia = EXCLUDED.frequencia, horas_texto = EXCLUDED.horas_texto, apqc = EXCLUDED.apqc,
    nivel_minimo = EXCLUDED.nivel_minimo, aprova = EXCLUDED.aprova, versao = EXCLUDED.versao,
    validade = EXCLUDED.validade, markdown = EXCLUDED.markdown, cargos_citados = EXCLUDED.cargos_citados
  WHERE (t.ordem, t.processo, t.frequencia, t.horas_texto, t.apqc, t.nivel_minimo, t.aprova, t.versao, t.validade,
         t.markdown, t.cargos_citados)
    IS DISTINCT FROM (EXCLUDED.ordem, EXCLUDED.processo, EXCLUDED.frequencia, EXCLUDED.horas_texto, EXCLUDED.apqc,
         EXCLUDED.nivel_minimo, EXCLUDED.aprova, EXCLUDED.versao, EXCLUDED.validade, EXCLUDED.markdown,
         EXCLUDED.cargos_citados);
  DELETE FROM org_playbook t WHERE NOT EXISTS (SELECT 1 FROM _pb s WHERE s.pacote_id = t.pacote_id AND s.v->>'slug' = t.slug);

  CREATE TEMP TABLE _cpb ON COMMIT DROP AS
  SELECT DISTINCT ON (c.id, b.id) c.id AS cargo_id, b.id AS playbook_id, pp->>'papel' AS papel
  FROM _pb s JOIN org_playbook b ON b.pacote_id = s.pacote_id AND b.slug = s.v->>'slug'
  CROSS JOIN LATERAL jsonb_array_elements(coalesce(s.v->'papeis','[]')) pp
  JOIN org_cargo c ON c.slug = pp->>'cargo_slug';
  INSERT INTO org_cargo_playbook AS t (cargo_id, playbook_id, papel) SELECT cargo_id, playbook_id, papel FROM _cpb
  ON CONFLICT (cargo_id, playbook_id) DO UPDATE SET papel = EXCLUDED.papel WHERE t.papel IS DISTINCT FROM EXCLUDED.papel;
  DELETE FROM org_cargo_playbook t WHERE NOT EXISTS (SELECT 1 FROM _cpb s WHERE s.cargo_id = t.cargo_id AND s.playbook_id = t.playbook_id);

  -- workflows
  INSERT INTO org_workflow AS t (slug, nome, fonte)
  SELECT x.slug, x.nome, x.fonte FROM jsonb_to_recordset(coalesce(p->'workflows','[]')) x(slug text, nome text, fonte text)
  ON CONFLICT (slug) DO UPDATE SET nome = EXCLUDED.nome, fonte = EXCLUDED.fonte
  WHERE (t.nome, t.fonte) IS DISTINCT FROM (EXCLUDED.nome, EXCLUDED.fonte);
  DELETE FROM org_workflow t WHERE NOT EXISTS (SELECT 1 FROM jsonb_array_elements(coalesce(p->'workflows','[]')) x WHERE x->>'slug' = t.slug);

  CREATE TEMP TABLE _raia ON COMMIT DROP AS
  SELECT w.id AS workflow_id, r.ordem::int - 1 AS ordem, r.v
  FROM jsonb_array_elements(coalesce(p->'workflows','[]')) x JOIN org_workflow w ON w.slug = x->>'slug'
  CROSS JOIN LATERAL jsonb_array_elements(coalesce(x->'raias','[]')) WITH ORDINALITY r(v, ordem);
  INSERT INTO org_workflow_raia AS t (workflow_id, chave, nome, cargo_id, ordem)
  SELECT s.workflow_id, s.v->>'chave', s.v->>'nome', c.id, s.ordem FROM _raia s LEFT JOIN org_cargo c ON c.slug = s.v->>'cargo_slug'
  ON CONFLICT (workflow_id, chave) DO UPDATE SET nome = EXCLUDED.nome, cargo_id = EXCLUDED.cargo_id, ordem = EXCLUDED.ordem
  WHERE (t.nome, t.cargo_id, t.ordem) IS DISTINCT FROM (EXCLUDED.nome, EXCLUDED.cargo_id, EXCLUDED.ordem);
  DELETE FROM org_workflow_raia t WHERE NOT EXISTS (SELECT 1 FROM _raia s WHERE s.workflow_id = t.workflow_id AND s.v->>'chave' = t.chave);

  CREATE TEMP TABLE _passo ON COMMIT DROP AS
  SELECT w.id AS workflow_id, r.ordem::int - 1 AS ordem, r.v
  FROM jsonb_array_elements(coalesce(p->'workflows','[]')) x JOIN org_workflow w ON w.slug = x->>'slug'
  CROSS JOIN LATERAL jsonb_array_elements(coalesce(x->'passos','[]')) WITH ORDINALITY r(v, ordem);
  INSERT INTO org_workflow_passo AS t (workflow_id, codigo, ordem, passo, quem, faz, entrega, passa, gate, playbook_texto,
    coluna, raias, proximos, lacos, sai_caio)
  SELECT workflow_id, v->>'codigo', ordem, v->>'passo', v->>'quem', v->>'faz', v->>'entrega', v->>'passa', v->>'gate',
    v->>'playbook_texto', coalesce((v->>'coluna')::int, 0),
    coalesce(ARRAY(SELECT jsonb_array_elements_text(coalesce(v->'raias','[]'))), '{}'),
    coalesce(ARRAY(SELECT jsonb_array_elements_text(coalesce(v->'proximos','[]'))), '{}'),
    coalesce(ARRAY(SELECT jsonb_array_elements_text(coalesce(v->'lacos','[]'))), '{}'),
    coalesce((v->>'sai_caio')::boolean, false) FROM _passo
  ON CONFLICT (workflow_id, codigo) DO UPDATE SET ordem = EXCLUDED.ordem, passo = EXCLUDED.passo, quem = EXCLUDED.quem,
    faz = EXCLUDED.faz, entrega = EXCLUDED.entrega, passa = EXCLUDED.passa, gate = EXCLUDED.gate,
    playbook_texto = EXCLUDED.playbook_texto, coluna = EXCLUDED.coluna, raias = EXCLUDED.raias,
    proximos = EXCLUDED.proximos, lacos = EXCLUDED.lacos, sai_caio = EXCLUDED.sai_caio
  WHERE (t.ordem, t.passo, t.quem, t.faz, t.entrega, t.passa, t.gate, t.playbook_texto, t.coluna, t.raias, t.proximos,
         t.lacos, t.sai_caio)
    IS DISTINCT FROM (EXCLUDED.ordem, EXCLUDED.passo, EXCLUDED.quem, EXCLUDED.faz, EXCLUDED.entrega, EXCLUDED.passa,
         EXCLUDED.gate, EXCLUDED.playbook_texto, EXCLUDED.coluna, EXCLUDED.raias, EXCLUDED.proximos, EXCLUDED.lacos,
         EXCLUDED.sai_caio);
  DELETE FROM org_workflow_passo t WHERE NOT EXISTS (SELECT 1 FROM _passo s WHERE s.workflow_id = t.workflow_id AND s.v->>'codigo' = t.codigo);

  CREATE TEMP TABLE _ppb ON COMMIT DROP AS
  SELECT DISTINCT ON (wp.id, b.id) wp.id AS passo_id, b.id AS playbook_id, r.ordem::int - 1 AS ordem
  FROM _passo s JOIN org_workflow_passo wp ON wp.workflow_id = s.workflow_id AND wp.codigo = s.v->>'codigo'
  CROSS JOIN LATERAL jsonb_array_elements(coalesce(s.v->'playbooks','[]')) WITH ORDINALITY r(v, ordem)
  JOIN org_pacote k ON k.slug = r.v->>'pacote_slug'
  JOIN org_playbook b ON b.pacote_id = k.id AND b.slug = r.v->>'slug';
  INSERT INTO org_workflow_passo_playbook AS t (passo_id, playbook_id, ordem) SELECT passo_id, playbook_id, ordem FROM _ppb
  ON CONFLICT (passo_id, playbook_id) DO UPDATE SET ordem = EXCLUDED.ordem WHERE t.ordem IS DISTINCT FROM EXCLUDED.ordem;
  DELETE FROM org_workflow_passo_playbook t WHERE NOT EXISTS (SELECT 1 FROM _ppb s WHERE s.passo_id = t.passo_id AND s.playbook_id = t.playbook_id);

  -- ondas
  INSERT INTO org_onda AS t (codigo, ordem, time, porque, depende)
  SELECT x.codigo, x.ordem, x.time, x.porque, x.depende
  FROM jsonb_to_recordset(coalesce(p->'ondas','[]')) x(codigo text, ordem int, time text, porque text, depende text)
  ON CONFLICT (codigo) DO UPDATE SET ordem = EXCLUDED.ordem, time = EXCLUDED.time, porque = EXCLUDED.porque, depende = EXCLUDED.depende
  WHERE (t.ordem, t.time, t.porque, t.depende) IS DISTINCT FROM (EXCLUDED.ordem, EXCLUDED.time, EXCLUDED.porque, EXCLUDED.depende);
  DELETE FROM org_onda t WHERE NOT EXISTS (SELECT 1 FROM jsonb_array_elements(coalesce(p->'ondas','[]')) x WHERE x->>'codigo' = t.codigo);

  CREATE TEMP TABLE _oc ON COMMIT DROP AS
  SELECT o.id AS onda_id, r.ordem::int - 1 AS ordem, r.v
  FROM jsonb_array_elements(coalesce(p->'ondas','[]')) x JOIN org_onda o ON o.codigo = x->>'codigo'
  CROSS JOIN LATERAL jsonb_array_elements(coalesce(x->'cargos','[]')) WITH ORDINALITY r(v, ordem);
  INSERT INTO org_onda_cargo AS t (onda_id, ordem, texto, cargo_id)
  SELECT s.onda_id, s.ordem, s.v->>'texto', c.id FROM _oc s LEFT JOIN org_cargo c ON c.slug = s.v->>'cargo_slug'
  ON CONFLICT (onda_id, ordem) DO UPDATE SET texto = EXCLUDED.texto, cargo_id = EXCLUDED.cargo_id
  WHERE (t.texto, t.cargo_id) IS DISTINCT FROM (EXCLUDED.texto, EXCLUDED.cargo_id);
  DELETE FROM org_onda_cargo t WHERE NOT EXISTS (SELECT 1 FROM _oc s WHERE s.onda_id = t.onda_id AND s.ordem = t.ordem);

  -- biblioteca de documentos
  CREATE TEMP TABLE _doc ON COMMIT DROP AS
  SELECT x.caminho, x.tipo, x.titulo, x.resumo, x.markdown, coalesce(x.tamanho, length(x.markdown)) AS tamanho,
         k.id AS pacote_id, x.especialista, coalesce(x.ordem, 0) AS ordem
  FROM jsonb_to_recordset(coalesce(p->'documentos','[]')) x(caminho text, tipo text, titulo text, resumo text,
    markdown text, tamanho int, pacote_slug text, especialista text, ordem int)
  LEFT JOIN org_pacote k ON k.slug = x.pacote_slug;
  INSERT INTO org_documento AS t (caminho, tipo, titulo, resumo, markdown, tamanho, pacote_id, especialista, ordem)
  SELECT caminho, tipo, titulo, resumo, markdown, tamanho, pacote_id, especialista, ordem FROM _doc
  ON CONFLICT (caminho) DO UPDATE SET tipo = EXCLUDED.tipo, titulo = EXCLUDED.titulo, resumo = EXCLUDED.resumo,
    markdown = EXCLUDED.markdown, tamanho = EXCLUDED.tamanho, pacote_id = EXCLUDED.pacote_id,
    especialista = EXCLUDED.especialista, ordem = EXCLUDED.ordem
  WHERE (t.tipo, t.titulo, t.resumo, t.markdown, t.tamanho, t.pacote_id, t.especialista, t.ordem)
    IS DISTINCT FROM (EXCLUDED.tipo, EXCLUDED.titulo, EXCLUDED.resumo, EXCLUDED.markdown, EXCLUDED.tamanho,
      EXCLUDED.pacote_id, EXCLUDED.especialista, EXCLUDED.ordem);
  DELETE FROM org_documento t WHERE NOT EXISTS (SELECT 1 FROM _doc s WHERE s.caminho = t.caminho);

  -- entidades que sumiram do payload (no fim: filhas ja apontam pros ids novos)
  DELETE FROM org_area t WHERE NOT EXISTS (SELECT 1 FROM jsonb_array_elements(coalesce(p->'areas','[]')) x WHERE x->>'slug' = t.slug);
  -- historico de ocupacao nunca some em silencio (GA-16): cargo com ocupacao nao e apagado pela recarga
  SELECT c.slug INTO v_slug_hist
    FROM org_cargo c
    JOIN posicao pz ON pz.cargo_id = c.id
    JOIN posicao_ocupacao o ON o.posicao_id = pz.id
   WHERE NOT EXISTS (SELECT 1 FROM jsonb_array_elements(p->'cargos') x WHERE x->>'slug' = c.slug)
   ORDER BY c.slug LIMIT 1;
  IF v_slug_hist IS NOT NULL THEN
    RAISE EXCEPTION 'organograma.carregar: cargo % tem historico de ocupacao; mova ou encerre antes de recarregar', v_slug_hist;
  END IF;
  DELETE FROM org_cargo t WHERE NOT EXISTS (SELECT 1 FROM jsonb_array_elements(p->'cargos') x WHERE x->>'slug' = t.slug);

  -- toda vaga de cargo comum ganha a posicao 0 (idempotente: so quem ainda nao tem)
  INSERT INTO posicao (cargo_id, ordem)
  SELECT c.id, 0 FROM org_cargo c
  WHERE c.tipo = 'cargo' AND NOT EXISTS (SELECT 1 FROM posicao p WHERE p.cargo_id = c.id);

  v_cont := jsonb_build_object(
    'cargos',       (SELECT count(*) FROM org_cargo),
    'areas',        (SELECT count(*) FROM org_area),
    'interfaces',   (SELECT count(*) FROM org_area_interface),
    'salarios',     (SELECT count(*) FROM org_cargo_salario),
    'referencias',  (SELECT count(*) FROM org_cargo_referencia),
    'processos',    (SELECT count(*) FROM org_processo),
    'apqc',         (SELECT count(*) FROM apqc_pcf),
    'pacotes',      (SELECT count(*) FROM org_pacote),
    'secoes',       (SELECT count(*) FROM org_pacote_secao),
    'playbooks',    (SELECT count(*) FROM org_playbook),
    'cargo_playbook', (SELECT count(*) FROM org_cargo_playbook),
    'raias',        (SELECT count(*) FROM org_workflow_raia),
    'passos',       (SELECT count(*) FROM org_workflow_passo),
    'passo_playbook', (SELECT count(*) FROM org_workflow_passo_playbook),
    'ondas',        (SELECT count(*) FROM org_onda),
    'onda_cargos',  (SELECT count(*) FROM org_onda_cargo),
    'documentos',   (SELECT count(*) FROM org_documento));

  INSERT INTO org_carga (git_sha, ambiente, contagens) VALUES (p->>'git_sha', p->>'ambiente', v_cont);
  RETURN v_cont;
END
$fn$;

COMMENT ON FUNCTION organograma.carregar(jsonb) IS
  'Carga do organograma de referencia (JSON do repositorio -> banco), so service_role. Upsert por chave natural; o que sumiu do payload e apagado; payload sem cargos ou sem exatamente 1 raiz e recusado. Cria a posicao 0 de todo cargo comum que ainda nao tem. Recusa apagar cargo que tem historico de ocupacao (posicao_ocupacao.posicao_id e RESTRICT); cargo sem ocupacao some junto com a posicao.';
REVOKE ALL ON FUNCTION organograma.carregar(jsonb) FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION organograma.carregar(jsonb) TO service_role;


-- ---------------------------------------------------------------------------
-- 5) Seguranca: RLS + grants minimos + policies por organograma.read / organograma.manage
-- ---------------------------------------------------------------------------
DO $$
DECLARE t text;
BEGIN
  FOREACH t IN ARRAY ARRAY['apqc_pcf','org_cargo','org_area','org_area_interface','org_cargo_salario',
    'org_cargo_referencia','org_processo','org_pacote','org_pacote_secao','org_playbook','org_cargo_playbook',
    'org_workflow','org_workflow_raia','org_workflow_passo','org_workflow_passo_playbook','org_onda',
    'org_onda_cargo','org_documento','org_carga','posicao','posicao_ocupacao'] LOOP
    EXECUTE format('ALTER TABLE organograma.%I ENABLE ROW LEVEL SECURITY', t);
    EXECUTE format('REVOKE ALL ON organograma.%I FROM PUBLIC, anon, authenticated', t);
    EXECUTE format('GRANT SELECT ON organograma.%I TO authenticated, service_role', t);
    EXECUTE format('DROP POLICY IF EXISTS %I ON organograma.%I', t || '_select', t);
    EXECUTE format('CREATE POLICY %I ON organograma.%I FOR SELECT TO authenticated USING (public.tem_permissao(''organograma.read''))', t || '_select', t);
  END LOOP;
  FOREACH t IN ARRAY ARRAY['posicao','posicao_ocupacao'] LOOP
    EXECUTE format('GRANT INSERT, UPDATE ON organograma.%I TO authenticated', t);
    EXECUTE format('DROP POLICY IF EXISTS %I ON organograma.%I', t || '_insert', t);
    EXECUTE format('CREATE POLICY %I ON organograma.%I FOR INSERT TO authenticated WITH CHECK (public.tem_permissao(''organograma.manage''))', t || '_insert', t);
    EXECUTE format('DROP POLICY IF EXISTS %I ON organograma.%I', t || '_update', t);
    EXECUTE format('CREATE POLICY %I ON organograma.%I FOR UPDATE TO authenticated USING (public.tem_permissao(''organograma.manage'')) WITH CHECK (public.tem_permissao(''organograma.manage''))', t || '_update', t);
  END LOOP;
END $$;

DO $$
DECLARE v text;
BEGIN
  FOREACH v IN ARRAY ARRAY['v_org_no','v_org_pacote','v_org_workflow_raia','v_org_workflow_passo','v_org_onda','v_org_apqc',
    'v_org_documento','v_org_cargo_playbook','v_org_carga','v_posicao_ocupante'] LOOP
    EXECUTE format('REVOKE ALL ON organograma.%I FROM PUBLIC, anon, authenticated', v);
    EXECUTE format('GRANT SELECT ON organograma.%I TO authenticated, service_role', v);
  END LOOP;
END $$;

-- ---------------------------------------------------------------------------
-- Smoke
-- ---------------------------------------------------------------------------
DO $$
DECLARE r record;
BEGIN
  IF NOT EXISTS (SELECT 1 FROM public.permissoes WHERE slug = 'organograma.read') THEN
    RAISE EXCEPTION 'smoke 0019: permissao organograma.read nao existe (a policy leria nada)';
  END IF;
  IF NOT EXISTS (SELECT 1 FROM public.modulo WHERE slug = 'organograma' AND schema_nome = 'organograma') THEN
    RAISE EXCEPTION 'smoke 0019: public.modulo(organograma) sem schema_nome: os gates nao cobrem o schema';
  END IF;
  IF (SELECT count(*) FROM pg_class c JOIN pg_namespace n ON n.oid = c.relnamespace
       WHERE n.nspname = 'organograma' AND c.relkind = 'r' AND c.relname NOT IN ('outbox', 'inbox')) <> 21 THEN
    RAISE EXCEPTION 'smoke 0019: esperava 21 tabelas em organograma (19 da 681 + posicao + posicao_ocupacao)';
  END IF;
  FOR r IN SELECT c.oid, c.relname, c.relkind, c.reloptions FROM pg_class c JOIN pg_namespace n ON n.oid = c.relnamespace
            WHERE n.nspname = 'organograma' AND c.relkind IN ('r', 'v') LOOP
    IF r.relkind = 'r' AND NOT (SELECT relrowsecurity FROM pg_class WHERE oid = r.oid) THEN
      RAISE EXCEPTION 'smoke 0019: organograma.% sem RLS', r.relname;
    END IF;
    IF r.relkind = 'v' AND NOT (coalesce('security_invoker=true' = ANY (r.reloptions), false)
                                OR coalesce('security_invoker=on' = ANY (r.reloptions), false)) THEN
      RAISE EXCEPTION 'smoke 0019: view organograma.% sem security_invoker', r.relname;
    END IF;
    IF r.relname NOT IN ('outbox', 'inbox') AND NOT has_table_privilege('authenticated', r.oid, 'SELECT') THEN
      RAISE EXCEPTION 'smoke 0019: authenticated sem SELECT em organograma.% (a tela renderiza VAZIA sem erro)', r.relname;
    END IF;
    IF has_table_privilege('anon', r.oid, 'SELECT,INSERT,UPDATE,DELETE')
       OR has_table_privilege('authenticated', r.oid, 'DELETE') THEN
      RAISE EXCEPTION 'smoke 0019: anon acessa ou authenticated apaga em organograma.%', r.relname;
    END IF;
    IF r.relname NOT IN ('posicao', 'posicao_ocupacao', 'outbox', 'inbox')
       AND has_table_privilege('authenticated', r.oid, 'INSERT,UPDATE') THEN
      RAISE EXCEPTION 'smoke 0019: authenticated escreve em organograma.% (so a carga escreve)', r.relname;
    END IF;
  END LOOP;
  IF has_function_privilege('anon', 'organograma.carregar(jsonb)', 'EXECUTE')
     OR has_function_privilege('authenticated', 'organograma.carregar(jsonb)', 'EXECUTE')
     OR NOT has_function_privilege('service_role', 'organograma.carregar(jsonb)', 'EXECUTE') THEN
    RAISE EXCEPTION 'smoke 0019: carregar deve ser executavel so por service_role';
  END IF;
  IF (SELECT count(*) FROM pg_constraint WHERE conrelid = 'organograma.posicao_ocupacao'::regclass
        AND conname IN ('ck_posicao_ocupacao_um_ocupante', 'ex_posicao_ocupacao_sem_sobreposicao')) <> 2 THEN
    RAISE EXCEPTION 'smoke 0019: posicao_ocupacao sem o CHECK de um ocupante ou sem o EXCLUDE de sobreposicao';
  END IF;
END $$;

-- Rollback:
--   DROP SCHEMA organograma CASCADE;   -- derruba tabelas, views, carregar, outbox e inbox
