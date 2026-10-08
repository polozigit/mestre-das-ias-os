-- 0015_nucleo_comum.sql
-- Planta v0.3, onda 2: nucleo comum em `public` (peca 4 §3), sem evento (ADR-015).
--   Parte e subtipos (pessoa, organizacao), tipo_papel, papel_parte (vigencia sem
--   sobreposicao), contato, endereco, consentimento (historico append-only),
--   documento (referencia ao arquivo), produto e produto_preco, calendario,
--   politica_sla, campo_definicao (ADR-016) e parte.campos validado;
--   usuarios.parte_id e public.parte_atual() (ADR-012 item 8); outbox do nucleo.
--
-- Decisao de desenho (05/10/2026, fora da planta, tomada no Opus a pedido do Polozi;
-- registrada no handoff planta/_CONTINUAR-AQUI.md):
--   a) prefixo `nucleo` em public.modulo (essencial, dono Lider de Dados):
--      nucleo.read (le o nucleo MASCARADO), nucleo.write (escreve pelas funcoes),
--      nucleo.manage (mescla Parte, vincula usuario a Parte) e o restrito
--      nucleo.pessoal (ve CPF, nascimento, contato e endereco inteiros; o .manage
--      NAO abre). Titular (parte_id = parte_atual()) ve o proprio.
--   b) mascara por COLUNA: o dado bruto nao tem grant a authenticated; a coluna
--      gerada mascarada tem. O bruto so sai por public.parte_dados_pessoais(), que
--      exige nucleo.pessoal (ou ser o titular) e registra a leitura em atividade.
--   c) escrita no nucleo so pelas funcoes publicas (P-07, GA-11), com nucleo.write
--      OU o .write de modulo que exerce papel de Parte (crm, marketing, pessoas,
--      financeiro, mensageria, juridico, curso, eventos, cobranca, instagram).
--   d) catalogos (tipo_papel, produto, produto_preco, calendario, politica_sla,
--      campo_definicao): leitura por usuario ativo; calendario, SLA e campo com
--      configuracoes.write; produto e preco pela funcao, com produto.write.
-- Depende de 0003/0004 (usuarios, permissoes, helpers), 0007 (atividade),
-- 0012/0013 (modulo, outbox). Rollback ao fim.

CREATE EXTENSION IF NOT EXISTS btree_gist WITH SCHEMA extensions;

-- ---------------------------------------------------------------------------
-- 0) Modulo `nucleo` e slugs
-- ---------------------------------------------------------------------------
INSERT INTO public.modulo (slug, nome, descricao, dono, schema_nome, classe, ligado) VALUES
  ('nucleo', 'Nucleo comum', 'Parte (pessoa e organizacao), contato, endereco, consentimento, documento e catalogos comuns', 'Lider de Dados', NULL, 'essencial', true)
ON CONFLICT (slug) DO NOTHING;

-- PERMISSOES:INICIO
INSERT INTO public.permissoes (slug, modulo, acao, descricao) VALUES
  ('nucleo.read', 'nucleo', 'read', 'Ver pessoas, empresas, contatos e enderecos com o dado pessoal mascarado'),
  ('nucleo.write', 'nucleo', 'write', 'Cadastrar e corrigir pessoas, empresas, contatos, enderecos e consentimentos'),
  ('nucleo.manage', 'nucleo', 'manage', 'Mesclar cadastros duplicados e ligar usuario a pessoa'),
  ('nucleo.pessoal', 'nucleo', 'pessoal', 'Ver CPF, nascimento, contato e endereco inteiros (o gestor do nucleo nao abre sozinho)')
ON CONFLICT (slug) DO NOTHING;
-- PERMISSOES:FIM

-- ---------------------------------------------------------------------------
-- 1) Validadores e mascaras (puros)
-- ---------------------------------------------------------------------------
CREATE OR REPLACE FUNCTION public.cpf_valido(p text)
RETURNS boolean
LANGUAGE plpgsql
IMMUTABLE
SET search_path = public
AS $$
DECLARE
  s int;
  d int;
  i int;
BEGIN
  IF p IS NULL OR p !~ '^[0-9]{11}$' OR p ~ '^(.)\1{10}$' THEN
    RETURN false;
  END IF;
  s := 0;
  FOR i IN 1..9 LOOP s := s + substr(p, i, 1)::int * (11 - i); END LOOP;
  d := 11 - (s % 11); IF d >= 10 THEN d := 0; END IF;
  IF d <> substr(p, 10, 1)::int THEN RETURN false; END IF;
  s := 0;
  FOR i IN 1..10 LOOP s := s + substr(p, i, 1)::int * (12 - i); END LOOP;
  d := 11 - (s % 11); IF d >= 10 THEN d := 0; END IF;
  RETURN d = substr(p, 11, 1)::int;
END;
$$;

COMMENT ON FUNCTION public.cpf_valido(text) IS
  'CPF com 11 digitos e os 2 digitos verificadores certos (repeticao de um digito e invalida).';

-- CNPJ alfanumerico (Receita, a partir de 07/2026): 12 posicoes [0-9A-Z] + 2 DV numericos;
-- valor de cada caractere = codigo ASCII - 48; numerico antigo e caso particular.
CREATE OR REPLACE FUNCTION public.cnpj_valido(p text)
RETURNS boolean
LANGUAGE plpgsql
IMMUTABLE
SET search_path = public
AS $$
DECLARE
  pesos1 int[] := ARRAY[5,4,3,2,9,8,7,6,5,4,3,2];
  pesos2 int[] := ARRAY[6,5,4,3,2,9,8,7,6,5,4,3,2];
  s int;
  r int;
  d1 int;
  d2 int;
  i int;
BEGIN
  IF p IS NULL OR p !~ '^[0-9A-Z]{12}[0-9]{2}$' OR p ~ '^(.)\1{13}$' THEN
    RETURN false;
  END IF;
  s := 0;
  FOR i IN 1..12 LOOP s := s + (ascii(substr(p, i, 1)) - 48) * pesos1[i]; END LOOP;
  r := s % 11; d1 := CASE WHEN r < 2 THEN 0 ELSE 11 - r END;
  IF d1 <> substr(p, 13, 1)::int THEN RETURN false; END IF;
  s := 0;
  FOR i IN 1..13 LOOP s := s + (ascii(substr(p, i, 1)) - 48) * pesos2[i]; END LOOP;
  r := s % 11; d2 := CASE WHEN r < 2 THEN 0 ELSE 11 - r END;
  RETURN d2 = substr(p, 14, 1)::int;
END;
$$;

COMMENT ON FUNCTION public.cnpj_valido(text) IS
  'CNPJ de 14 posicoes, alfanumerico (12 [0-9A-Z] + 2 DV) ou numerico, com os 2 digitos verificadores certos.';

GRANT EXECUTE ON FUNCTION public.cpf_valido(text), public.cnpj_valido(text) TO authenticated, service_role;

-- ---------------------------------------------------------------------------
-- 2) Catalogos: tipo_papel, campo_definicao
-- ---------------------------------------------------------------------------
CREATE TABLE IF NOT EXISTS public.tipo_papel (
  slug text PRIMARY KEY CHECK (slug ~ '^[a-z][a-z0-9_]*$'),
  rotulo text NOT NULL CHECK (length(trim(rotulo)) > 0),
  descricao text,
  modulo text NOT NULL REFERENCES public.modulo(slug) ON UPDATE CASCADE,
  ativo boolean NOT NULL DEFAULT true,
  criada_em timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX IF NOT EXISTS idx_tipo_papel_modulo ON public.tipo_papel (modulo);

COMMENT ON TABLE public.tipo_papel IS
  'dono=Lider de Dados; retencao=R12; Catalogo do papel que uma Parte exerce (lead, cliente, colaborador, fornecedor...). Semeado pela migration do modulo que o usa (aluno vem com o Curso, participante com Eventos). Escrita so por migration; leitura por usuario ativo.';
COMMENT ON COLUMN public.tipo_papel.slug IS 'classe=nenhum; identificador do papel.';
COMMENT ON COLUMN public.tipo_papel.rotulo IS 'classe=nenhum; nome de exibicao do papel.';
COMMENT ON COLUMN public.tipo_papel.descricao IS 'classe=nenhum; o que o papel significa.';
COMMENT ON COLUMN public.tipo_papel.modulo IS 'classe=nenhum; modulo que semeia e usa o papel.';
COMMENT ON COLUMN public.tipo_papel.ativo IS 'classe=nenhum; false = papel aposentado (nao se inicia novo).';

INSERT INTO public.tipo_papel (slug, rotulo, descricao, modulo) VALUES
  ('lead',        'Lead',        'Pessoa ou empresa interessada que ainda nao comprou', 'crm'),
  ('cliente',     'Cliente',     'Pessoa ou empresa que comprou',                       'crm'),
  ('colaborador', 'Colaborador', 'Pessoa que trabalha na empresa',                      'pessoas'),
  ('fornecedor',  'Fornecedor',  'Pessoa ou empresa que fornece para a empresa',        'financeiro')
ON CONFLICT (slug) DO NOTHING;

CREATE TABLE IF NOT EXISTS public.campo_definicao (
  id bigint GENERATED ALWAYS AS IDENTITY PRIMARY KEY,
  entidade text NOT NULL CHECK (entidade IN ('public.parte', 'crm.lead', 'crm.oportunidade', 'crm.conta_cliente',
                                             'pessoas.colaborador', 'tarefas.projeto', 'tarefas.chamado')),
  chave text NOT NULL CHECK (chave ~ '^[a-z][a-z0-9_]*$'),
  rotulo text NOT NULL CHECK (length(trim(rotulo)) > 0),
  tipo text NOT NULL CHECK (tipo IN ('texto', 'numero', 'data', 'booleano', 'opcao')),
  obrigatorio boolean NOT NULL DEFAULT false,
  opcoes jsonb,
  classe_dado text NOT NULL DEFAULT 'nenhum' CHECK (classe_dado IN ('nenhum', 'pessoal', 'sensivel')),
  ativo boolean NOT NULL DEFAULT true,
  criada_em timestamptz NOT NULL DEFAULT now(),
  atualizada_em timestamptz NOT NULL DEFAULT now(),
  CONSTRAINT uq_campo_definicao UNIQUE (entidade, chave),
  CONSTRAINT ck_campo_opcoes CHECK (
    (tipo = 'opcao' AND jsonb_typeof(opcoes) = 'array' AND jsonb_array_length(opcoes) > 0)
    OR (tipo <> 'opcao' AND opcoes IS NULL))
);

COMMENT ON TABLE public.campo_definicao IS
  'dono=Lider de Dados; retencao=R12; Definicao de campo personalizado (ADR-016): a coluna `campos jsonb` das entidades da lista fechada e validada contra estas linhas por public.validar_campos(). Nao e tabela atributo-valor; classe_dado mantem a classificacao no grao do campo.';
COMMENT ON COLUMN public.campo_definicao.entidade IS 'classe=nenhum; tabela que tem o campo (lista fechada do ADR-016).';
COMMENT ON COLUMN public.campo_definicao.chave IS 'classe=nenhum; nome da chave dentro de `campos`.';
COMMENT ON COLUMN public.campo_definicao.rotulo IS 'classe=nenhum; nome de exibicao do campo.';
COMMENT ON COLUMN public.campo_definicao.tipo IS 'classe=nenhum; texto, numero, data (AAAA-MM-DD), booleano ou opcao.';
COMMENT ON COLUMN public.campo_definicao.obrigatorio IS 'classe=nenhum; true = a chave tem que vir preenchida.';
COMMENT ON COLUMN public.campo_definicao.opcoes IS 'classe=nenhum; lista de valores aceitos quando tipo = opcao.';
COMMENT ON COLUMN public.campo_definicao.classe_dado IS 'classe=nenhum; classificacao LGPD do VALOR guardado: nenhum, pessoal ou sensivel.';
COMMENT ON COLUMN public.campo_definicao.ativo IS 'classe=nenhum; false = campo aposentado (valor novo e recusado).';

DROP TRIGGER IF EXISTS trg_campo_definicao_atualizada_em ON public.campo_definicao;
CREATE TRIGGER trg_campo_definicao_atualizada_em BEFORE UPDATE ON public.campo_definicao
  FOR EACH ROW EXECUTE FUNCTION public.set_atualizada_em();

CREATE OR REPLACE FUNCTION public.validar_campos(p_entidade text, p_campos jsonb)
RETURNS void
LANGUAGE plpgsql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  k text;
  v jsonb;
  d public.campo_definicao%ROWTYPE;
BEGIN
  IF p_campos IS NULL OR p_campos = '{}'::jsonb THEN
    p_campos := '{}'::jsonb;
  ELSIF jsonb_typeof(p_campos) <> 'object' THEN
    RAISE EXCEPTION 'campos de % deve ser um objeto JSON', p_entidade USING ERRCODE = '22023';
  END IF;
  FOR k, v IN SELECT * FROM jsonb_each(p_campos) LOOP
    SELECT * INTO d FROM public.campo_definicao c WHERE c.entidade = p_entidade AND c.chave = k AND c.ativo;
    IF NOT FOUND THEN
      RAISE EXCEPTION 'campo % nao esta definido (ou esta inativo) para %', k, p_entidade USING ERRCODE = '22023';
    END IF;
    IF v = 'null'::jsonb THEN
      CONTINUE;
    END IF;
    IF (d.tipo = 'texto' AND jsonb_typeof(v) <> 'string')
       OR (d.tipo = 'numero' AND jsonb_typeof(v) <> 'number')
       OR (d.tipo = 'booleano' AND jsonb_typeof(v) <> 'boolean')
       OR (d.tipo = 'data' AND (jsonb_typeof(v) <> 'string' OR (v #>> '{}') !~ '^\d{4}-\d{2}-\d{2}$'))
       OR (d.tipo = 'opcao' AND NOT (d.opcoes @> jsonb_build_array(v))) THEN
      RAISE EXCEPTION 'valor do campo % nao e do tipo % (ou fora das opcoes)', k, d.tipo USING ERRCODE = '22023';
    END IF;
  END LOOP;
  FOR d IN SELECT * FROM public.campo_definicao c
            WHERE c.entidade = p_entidade AND c.ativo AND c.obrigatorio LOOP
    IF coalesce(p_campos -> d.chave, 'null'::jsonb) = 'null'::jsonb THEN
      RAISE EXCEPTION 'campo obrigatorio % nao preenchido em %', d.chave, p_entidade USING ERRCODE = '22023';
    END IF;
  END LOOP;
END;
$$;

COMMENT ON FUNCTION public.validar_campos(text, jsonb) IS
  'ADR-016: valida `campos jsonb` contra public.campo_definicao (chave definida e ativa, tipo, opcao, obrigatorio). Erro 22023. Usada pelo gatilho de cada entidade da lista fechada.';
GRANT EXECUTE ON FUNCTION public.validar_campos(text, jsonb) TO authenticated, service_role;

-- ---------------------------------------------------------------------------
-- 3) Parte e subtipos
-- ---------------------------------------------------------------------------
CREATE TABLE IF NOT EXISTS public.parte (
  id bigint GENERATED ALWAYS AS IDENTITY PRIMARY KEY,
  tipo text NOT NULL CHECK (tipo IN ('pessoa', 'organizacao')),
  mesclada_em_parte_id bigint REFERENCES public.parte(id),
  mesclada_em timestamptz,
  campos jsonb NOT NULL DEFAULT '{}',
  criada_em timestamptz NOT NULL DEFAULT now(),
  atualizada_em timestamptz NOT NULL DEFAULT now(),
  CONSTRAINT uq_parte_id_tipo UNIQUE (id, tipo),
  CONSTRAINT ck_parte_mescla CHECK ((mesclada_em_parte_id IS NULL) = (mesclada_em IS NULL)
                                    AND (mesclada_em_parte_id IS NULL OR mesclada_em_parte_id <> id))
);
CREATE INDEX IF NOT EXISTS idx_parte_mesclada ON public.parte (mesclada_em_parte_id) WHERE mesclada_em_parte_id IS NOT NULL;

COMMENT ON TABLE public.parte IS
  'dono=Lider de Dados; retencao=R01; Supertipo de pessoa ou organizacao: uma ficha por pessoa ou empresa, fonte unica do cadastro (P-07). Retencao segue o papel mais longo (R01 a R04 em papel_parte). Escrita so pelas funcoes publicas do nucleo; fusao por mesclada_em_parte_id.';
COMMENT ON COLUMN public.parte.tipo IS 'classe=nenhum; pessoa ou organizacao (subtipo em parte_pessoa ou parte_organizacao).';
COMMENT ON COLUMN public.parte.mesclada_em_parte_id IS 'classe=nenhum; quando duplicada, a Parte que ficou (evento nucleo.parte_mesclada).';
COMMENT ON COLUMN public.parte.mesclada_em IS 'classe=nenhum; quando foi mesclada.';
COMMENT ON COLUMN public.parte.campos IS 'classe=pessoal; campos personalizados (ADR-016), validados por public.validar_campos(''public.parte'', ...); a classe de cada chave esta em campo_definicao.classe_dado.';

DROP TRIGGER IF EXISTS trg_parte_atualizada_em ON public.parte;
CREATE TRIGGER trg_parte_atualizada_em BEFORE UPDATE ON public.parte
  FOR EACH ROW EXECUTE FUNCTION public.set_atualizada_em();

CREATE OR REPLACE FUNCTION public.fn_parte_valida_campos()
RETURNS trigger
LANGUAGE plpgsql
SET search_path = public
AS $$
BEGIN
  PERFORM public.validar_campos('public.parte', NEW.campos);
  RETURN NEW;
END;
$$;
DROP TRIGGER IF EXISTS trg_parte_valida_campos ON public.parte;
CREATE TRIGGER trg_parte_valida_campos BEFORE INSERT OR UPDATE OF campos ON public.parte
  FOR EACH ROW EXECUTE FUNCTION public.fn_parte_valida_campos();

CREATE TABLE IF NOT EXISTS public.parte_pessoa (
  parte_id bigint PRIMARY KEY,
  tipo text NOT NULL DEFAULT 'pessoa' CHECK (tipo = 'pessoa'),
  nome_civil text NOT NULL CHECK (length(trim(nome_civil)) > 0),
  nome_social text,
  cpf text CHECK (cpf IS NULL OR public.cpf_valido(cpf)),
  data_nascimento date CHECK (data_nascimento IS NULL OR data_nascimento > '1900-01-01'),
  cpf_mascarado text GENERATED ALWAYS AS (CASE WHEN cpf IS NULL THEN NULL ELSE '***.***.***-' || right(cpf, 2) END) STORED,
  atualizada_em timestamptz NOT NULL DEFAULT now(),
  CONSTRAINT fk_parte_pessoa_parte FOREIGN KEY (parte_id, tipo) REFERENCES public.parte(id, tipo)
);
CREATE UNIQUE INDEX IF NOT EXISTS uq_parte_pessoa_cpf ON public.parte_pessoa (cpf) WHERE cpf IS NOT NULL;

COMMENT ON TABLE public.parte_pessoa IS
  'dono=Lider de Dados; retencao=R01; Pessoa natural: nome civil, nome social, CPF e nascimento. CPF e nascimento sem grant a authenticated: leitor ve cpf_mascarado; inteiro so por parte_dados_pessoais() com nucleo.pessoal ou pelo titular. Retencao segue a Parte.';
COMMENT ON COLUMN public.parte_pessoa.parte_id IS 'classe=nenhum; a Parte (tipo pessoa, garantido pela FK composta).';
COMMENT ON COLUMN public.parte_pessoa.tipo IS 'classe=nenhum; sempre pessoa (amarra o subtipo na FK).';
COMMENT ON COLUMN public.parte_pessoa.nome_civil IS 'classe=pessoal; nome de registro.';
COMMENT ON COLUMN public.parte_pessoa.nome_social IS 'classe=pessoal; nome pelo qual a pessoa quer ser chamada; quando existe, e o que a tela mostra.';
COMMENT ON COLUMN public.parte_pessoa.cpf IS 'classe=pessoal; CPF so digitos, com DV conferido (cpf_valido); unico. Sem grant a authenticated.';
COMMENT ON COLUMN public.parte_pessoa.data_nascimento IS 'classe=pessoal; pode marcar crianca, adolescente ou idoso (tratamento especial LGPD). Sem grant a authenticated.';
COMMENT ON COLUMN public.parte_pessoa.cpf_mascarado IS 'classe=pessoal; mascara do CPF (2 ultimos digitos), o que o leitor do nucleo ve.';

DROP TRIGGER IF EXISTS trg_parte_pessoa_atualizada_em ON public.parte_pessoa;
CREATE TRIGGER trg_parte_pessoa_atualizada_em BEFORE UPDATE ON public.parte_pessoa
  FOR EACH ROW EXECUTE FUNCTION public.set_atualizada_em();

CREATE TABLE IF NOT EXISTS public.parte_organizacao (
  parte_id bigint PRIMARY KEY,
  tipo text NOT NULL DEFAULT 'organizacao' CHECK (tipo = 'organizacao'),
  razao_social text NOT NULL CHECK (length(trim(razao_social)) > 0),
  nome_fantasia text,
  cnpj text CHECK (cnpj IS NULL OR public.cnpj_valido(cnpj)),
  mei boolean NOT NULL DEFAULT false,
  cnpj_exibicao text GENERATED ALWAYS AS (
    CASE WHEN cnpj IS NULL THEN NULL WHEN mei THEN '**.***.***/****-' || right(cnpj, 2) ELSE cnpj END) STORED,
  atualizada_em timestamptz NOT NULL DEFAULT now(),
  CONSTRAINT fk_parte_organizacao_parte FOREIGN KEY (parte_id, tipo) REFERENCES public.parte(id, tipo)
);
CREATE UNIQUE INDEX IF NOT EXISTS uq_parte_organizacao_cnpj ON public.parte_organizacao (cnpj) WHERE cnpj IS NOT NULL;

COMMENT ON TABLE public.parte_organizacao IS
  'dono=Lider de Dados; retencao=R02; Organizacao: razao social e CNPJ (alfanumerico, com DV). CNPJ de MEI identifica pessoa natural: mascarado em cnpj_exibicao; o cnpj bruto nao tem grant a authenticated.';
COMMENT ON COLUMN public.parte_organizacao.parte_id IS 'classe=nenhum; a Parte (tipo organizacao, garantido pela FK composta).';
COMMENT ON COLUMN public.parte_organizacao.tipo IS 'classe=nenhum; sempre organizacao.';
COMMENT ON COLUMN public.parte_organizacao.razao_social IS 'classe=pessoal; razao social (de MEI contem o nome da pessoa).';
COMMENT ON COLUMN public.parte_organizacao.nome_fantasia IS 'classe=nenhum; nome comercial.';
COMMENT ON COLUMN public.parte_organizacao.cnpj IS 'classe=pessoal; CNPJ de 14 posicoes com DV (cnpj_valido); pessoal quando MEI. Sem grant a authenticated: leia cnpj_exibicao.';
COMMENT ON COLUMN public.parte_organizacao.mei IS 'classe=nenhum; true = microempreendedor individual (CNPJ de pessoa natural, mascarado).';
COMMENT ON COLUMN public.parte_organizacao.cnpj_exibicao IS 'classe=pessoal; CNPJ inteiro, ou mascarado (2 ultimos digitos) quando MEI.';

DROP TRIGGER IF EXISTS trg_parte_organizacao_atualizada_em ON public.parte_organizacao;
CREATE TRIGGER trg_parte_organizacao_atualizada_em BEFORE UPDATE ON public.parte_organizacao
  FOR EACH ROW EXECUTE FUNCTION public.set_atualizada_em();

-- ---------------------------------------------------------------------------
-- 4) Papel, contato, endereco, consentimento, documento
-- ---------------------------------------------------------------------------
CREATE TABLE IF NOT EXISTS public.papel_parte (
  id bigint GENERATED ALWAYS AS IDENTITY PRIMARY KEY,
  parte_id bigint NOT NULL REFERENCES public.parte(id),
  tipo text NOT NULL REFERENCES public.tipo_papel(slug) ON UPDATE CASCADE,
  vigente_de date NOT NULL DEFAULT current_date,
  vigente_ate date,
  criada_em timestamptz NOT NULL DEFAULT now(),
  CONSTRAINT ck_papel_vigencia CHECK (vigente_ate IS NULL OR vigente_ate > vigente_de),
  CONSTRAINT ex_papel_sem_sobreposicao EXCLUDE USING gist (
    parte_id WITH =, tipo WITH =, daterange(vigente_de, vigente_ate, '[)') WITH &&)
);
CREATE INDEX IF NOT EXISTS idx_papel_parte_tipo ON public.papel_parte (tipo);

COMMENT ON TABLE public.papel_parte IS
  'dono=Lider de Dados; retencao=R01; Fonte unica da vigencia do papel da Parte (lead, cliente, colaborador...), sem sobreposicao do mesmo papel (EXCLUDE). A regra de retencao da Parte segue o papel mais longo (R01 a R04).';
COMMENT ON COLUMN public.papel_parte.parte_id IS 'classe=pessoal; a Parte que exerce o papel.';
COMMENT ON COLUMN public.papel_parte.tipo IS 'classe=nenhum; papel (public.tipo_papel).';
COMMENT ON COLUMN public.papel_parte.vigente_de IS 'classe=nenhum; inicio do papel (inclusive).';
COMMENT ON COLUMN public.papel_parte.vigente_ate IS 'classe=nenhum; fim do papel (exclusive). NULL = vigente.';

CREATE TABLE IF NOT EXISTS public.contato (
  id bigint GENERATED ALWAYS AS IDENTITY PRIMARY KEY,
  parte_id bigint NOT NULL REFERENCES public.parte(id),
  tipo text NOT NULL CHECK (tipo IN ('telefone', 'email', 'whatsapp', 'rede')),
  valor text NOT NULL CHECK (length(trim(valor)) > 0),
  finalidade text NOT NULL DEFAULT 'geral' CHECK (finalidade ~ '^[a-z][a-z0-9_]*$'),
  principal boolean NOT NULL DEFAULT false,
  valor_mascarado text GENERATED ALWAYS AS (
    CASE tipo
      WHEN 'email' THEN left(valor, 1) || '***@' || split_part(valor, '@', 2)
      WHEN 'rede'  THEN left(valor, 3) || '***'
      ELSE repeat('*', greatest(length(valor) - 4, 0)) || right(valor, 4)
    END) STORED,
  criada_em timestamptz NOT NULL DEFAULT now(),
  atualizada_em timestamptz NOT NULL DEFAULT now(),
  CONSTRAINT uq_contato UNIQUE (parte_id, tipo, valor),
  CONSTRAINT ck_contato_formato CHECK (
    (tipo = 'email' AND valor = lower(trim(valor)) AND valor ~ '^[^@[:space:]]+@[^@[:space:]]+\.[^@[:space:]]+$')
    OR (tipo IN ('telefone', 'whatsapp') AND valor ~ '^\+[1-9][0-9]{7,14}$')
    OR tipo = 'rede')
);

COMMENT ON TABLE public.contato IS
  'dono=Lider de Dados; retencao=R01; Telefone (E.164), e-mail (minusculo), WhatsApp ou rede, com finalidade. Nunca contato solto em modulo. O valor bruto nao tem grant a authenticated: leitor ve valor_mascarado.';
COMMENT ON COLUMN public.contato.parte_id IS 'classe=pessoal; dono do contato.';
COMMENT ON COLUMN public.contato.tipo IS 'classe=nenhum; telefone, email, whatsapp ou rede.';
COMMENT ON COLUMN public.contato.valor IS 'classe=pessoal; o contato. Sem grant a authenticated.';
COMMENT ON COLUMN public.contato.finalidade IS 'classe=nenhum; para que o contato serve (geral, cobranca, atendimento...).';
COMMENT ON COLUMN public.contato.principal IS 'classe=nenhum; contato preferido do tipo.';
COMMENT ON COLUMN public.contato.valor_mascarado IS 'classe=pessoal; mascara do contato (inicio e dominio do e-mail; 4 ultimos digitos do telefone).';

DROP TRIGGER IF EXISTS trg_contato_atualizada_em ON public.contato;
CREATE TRIGGER trg_contato_atualizada_em BEFORE UPDATE ON public.contato
  FOR EACH ROW EXECUTE FUNCTION public.set_atualizada_em();

CREATE TABLE IF NOT EXISTS public.endereco (
  id bigint GENERATED ALWAYS AS IDENTITY PRIMARY KEY,
  parte_id bigint NOT NULL REFERENCES public.parte(id),
  finalidade text NOT NULL DEFAULT 'geral' CHECK (finalidade ~ '^[a-z][a-z0-9_]*$'),
  logradouro text NOT NULL CHECK (length(trim(logradouro)) > 0),
  numero text,
  complemento text,
  bairro text,
  cidade text NOT NULL CHECK (length(trim(cidade)) > 0),
  uf text CHECK (uf IS NULL OR uf ~ '^[A-Z]{2}$'),
  cep text CHECK (cep IS NULL OR cep ~ '^[0-9]{8}$'),
  pais text NOT NULL DEFAULT 'BR' CHECK (pais ~ '^[A-Z]{2}$'),
  principal boolean NOT NULL DEFAULT false,
  cep_prefixo text GENERATED ALWAYS AS (left(cep, 5)) STORED,
  criada_em timestamptz NOT NULL DEFAULT now(),
  atualizada_em timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX IF NOT EXISTS idx_endereco_parte ON public.endereco (parte_id);

COMMENT ON TABLE public.endereco IS
  'dono=Lider de Dados; retencao=R01; Endereco por finalidade. Leitor ve cidade, UF, pais e prefixo do CEP; logradouro, numero, complemento, bairro e CEP inteiros so com nucleo.pessoal ou pelo titular.';
COMMENT ON COLUMN public.endereco.parte_id IS 'classe=pessoal; dono do endereco.';
COMMENT ON COLUMN public.endereco.finalidade IS 'classe=nenhum; entrega, cobranca, residencial, geral...';
COMMENT ON COLUMN public.endereco.logradouro IS 'classe=pessoal; rua. Sem grant a authenticated.';
COMMENT ON COLUMN public.endereco.numero IS 'classe=pessoal; numero. Sem grant a authenticated.';
COMMENT ON COLUMN public.endereco.complemento IS 'classe=pessoal; complemento. Sem grant a authenticated.';
COMMENT ON COLUMN public.endereco.bairro IS 'classe=pessoal; bairro. Sem grant a authenticated.';
COMMENT ON COLUMN public.endereco.cidade IS 'classe=pessoal; cidade.';
COMMENT ON COLUMN public.endereco.uf IS 'classe=nenhum; UF em 2 letras.';
COMMENT ON COLUMN public.endereco.cep IS 'classe=pessoal; CEP so digitos. Sem grant a authenticated.';
COMMENT ON COLUMN public.endereco.pais IS 'classe=nenhum; pais ISO 3166 (2 letras).';
COMMENT ON COLUMN public.endereco.principal IS 'classe=nenhum; endereco preferido da finalidade.';
COMMENT ON COLUMN public.endereco.cep_prefixo IS 'classe=nenhum; 5 primeiros digitos do CEP (regiao), o que o leitor ve.';

DROP TRIGGER IF EXISTS trg_endereco_atualizada_em ON public.endereco;
CREATE TRIGGER trg_endereco_atualizada_em BEFORE UPDATE ON public.endereco
  FOR EACH ROW EXECUTE FUNCTION public.set_atualizada_em();

CREATE TABLE IF NOT EXISTS public.consentimento (
  id bigint GENERATED ALWAYS AS IDENTITY PRIMARY KEY,
  parte_id bigint NOT NULL REFERENCES public.parte(id),
  contato_id bigint REFERENCES public.contato(id),
  canal text NOT NULL CHECK (canal ~ '^[a-z][a-z0-9_]*$'),
  finalidade text NOT NULL CHECK (finalidade ~ '^[a-z][a-z0-9_]*$'),
  estado text NOT NULL CHECK (estado IN ('concedido', 'revogado')),
  base_legal text NOT NULL CHECK (base_legal IN ('consentimento', 'obrigacao_legal', 'politica_publica', 'estudo_pesquisa',
                                                 'execucao_contrato', 'exercicio_direitos', 'protecao_vida', 'tutela_saude',
                                                 'legitimo_interesse', 'protecao_credito')),
  prova text,
  versao integer NOT NULL CHECK (versao >= 1),
  registrado_em timestamptz NOT NULL DEFAULT now(),
  registrado_por_usuario_id uuid REFERENCES public.usuarios(id) ON DELETE SET NULL,
  CONSTRAINT uq_consentimento_versao UNIQUE NULLS NOT DISTINCT (parte_id, contato_id, canal, finalidade, versao)
);
CREATE INDEX IF NOT EXISTS idx_consentimento_contato ON public.consentimento (contato_id) WHERE contato_id IS NOT NULL;
CREATE INDEX IF NOT EXISTS idx_consentimento_usuario ON public.consentimento (registrado_por_usuario_id) WHERE registrado_por_usuario_id IS NOT NULL;

COMMENT ON TABLE public.consentimento IS
  'dono=Lider de Dados; retencao=R09; Historico append-only de opt-in e opt-out por Parte, contato, canal e finalidade, com base legal (LGPD art. 7) e prova: o estado vigente e a versao mais alta. Correcao = linha nova, nunca UPDATE. A mensageria consulta public.consentimento_vigente() na hora do envio; a tabela so abre para nucleo.pessoal e para o titular.';
COMMENT ON COLUMN public.consentimento.parte_id IS 'classe=pessoal; titular.';
COMMENT ON COLUMN public.consentimento.contato_id IS 'classe=pessoal; contato coberto. NULL = vale para a Parte no canal.';
COMMENT ON COLUMN public.consentimento.canal IS 'classe=nenhum; whatsapp, email, telefone, sms...';
COMMENT ON COLUMN public.consentimento.finalidade IS 'classe=nenhum; marketing, atendimento, cobranca...';
COMMENT ON COLUMN public.consentimento.estado IS 'classe=nenhum; concedido ou revogado.';
COMMENT ON COLUMN public.consentimento.base_legal IS 'classe=nenhum; hipotese do art. 7 da LGPD.';
COMMENT ON COLUMN public.consentimento.prova IS 'classe=pessoal; como o consentimento foi dado (link, id da mensagem, documento).';
COMMENT ON COLUMN public.consentimento.versao IS 'classe=nenhum; sequencia por (parte, contato, canal, finalidade); a maior e a vigente.';
COMMENT ON COLUMN public.consentimento.registrado_em IS 'classe=nenhum; quando foi registrado.';
COMMENT ON COLUMN public.consentimento.registrado_por_usuario_id IS 'classe=pessoal; quem registrou. NULL = maquina (integracao).';

CREATE TABLE IF NOT EXISTS public.documento (
  id bigint GENERATED ALWAYS AS IDENTITY PRIMARY KEY,
  modulo text NOT NULL REFERENCES public.modulo(slug) ON UPDATE CASCADE,
  parte_id bigint REFERENCES public.parte(id),
  tipo text NOT NULL CHECK (tipo ~ '^[a-z][a-z0-9_]*$'),
  nome_arquivo text NOT NULL CHECK (length(trim(nome_arquivo)) > 0),
  caminho text NOT NULL UNIQUE CHECK (length(trim(caminho)) > 0),
  hash text NOT NULL CHECK (hash ~ '^[0-9a-f]{64}$'),
  tamanho_bytes bigint CHECK (tamanho_bytes IS NULL OR tamanho_bytes >= 0),
  mime text,
  criada_em timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX IF NOT EXISTS idx_documento_modulo ON public.documento (modulo);
CREATE INDEX IF NOT EXISTS idx_documento_parte ON public.documento (parte_id) WHERE parte_id IS NOT NULL;

COMMENT ON TABLE public.documento IS
  'dono=Lider de Dados; retencao=R18; Referencia a arquivo do armazenamento (caminho e sha256), com o modulo dono. O arquivo fica no Storage. Le quem tem `<modulo>.read`; registra quem tem `<modulo>.write`, pela funcao documento_registrar. Retencao segue o documento de origem (R02 a R04, R18).';
COMMENT ON COLUMN public.documento.modulo IS 'classe=nenhum; modulo dono do documento (decide quem le).';
COMMENT ON COLUMN public.documento.parte_id IS 'classe=pessoal; Parte a que o documento se refere.';
COMMENT ON COLUMN public.documento.tipo IS 'classe=nenhum; contrato, comprovante, nota, documento_pessoal...';
COMMENT ON COLUMN public.documento.nome_arquivo IS 'classe=pessoal; nome do arquivo (pode conter nome de pessoa).';
COMMENT ON COLUMN public.documento.caminho IS 'classe=pessoal; caminho no armazenamento.';
COMMENT ON COLUMN public.documento.hash IS 'classe=nenhum; sha256 do arquivo.';
COMMENT ON COLUMN public.documento.tamanho_bytes IS 'classe=nenhum; tamanho do arquivo.';
COMMENT ON COLUMN public.documento.mime IS 'classe=nenhum; tipo do arquivo.';

-- ---------------------------------------------------------------------------
-- 5) Produto e preco (dono CPO)
-- ---------------------------------------------------------------------------
CREATE TABLE IF NOT EXISTS public.produto (
  id bigint GENERATED ALWAYS AS IDENTITY PRIMARY KEY,
  codigo text NOT NULL UNIQUE CHECK (codigo ~ '^[a-z0-9][a-z0-9-]*$'),
  titulo text NOT NULL CHECK (length(trim(titulo)) > 0),
  descricao text,
  ativo boolean NOT NULL DEFAULT true,
  criada_em timestamptz NOT NULL DEFAULT now(),
  atualizada_em timestamptz NOT NULL DEFAULT now()
);

COMMENT ON TABLE public.produto IS
  'dono=CPO; retencao=R12; Catalogo de produtos e ofertas lido por todos os modulos (identidade e preco). Ficha versionada e ciclo de vida ficam no modulo produto (ADR-022). Escrita so pela funcao produto_salvar, com produto.write.';
COMMENT ON COLUMN public.produto.codigo IS 'classe=nenhum; identificador estavel do produto.';
COMMENT ON COLUMN public.produto.titulo IS 'classe=nenhum; nome comercial do produto.';
COMMENT ON COLUMN public.produto.descricao IS 'classe=nenhum; descricao curta.';
COMMENT ON COLUMN public.produto.ativo IS 'classe=nenhum; false = fora de venda (nao some de venda antiga).';

DROP TRIGGER IF EXISTS trg_produto_atualizada_em ON public.produto;
CREATE TRIGGER trg_produto_atualizada_em BEFORE UPDATE ON public.produto
  FOR EACH ROW EXECUTE FUNCTION public.set_atualizada_em();

CREATE TABLE IF NOT EXISTS public.produto_preco (
  id bigint GENERATED ALWAYS AS IDENTITY PRIMARY KEY,
  produto_id bigint NOT NULL REFERENCES public.produto(id),
  valor numeric(14, 2) NOT NULL CHECK (valor >= 0),
  moeda text NOT NULL DEFAULT 'BRL' CHECK (moeda ~ '^[A-Z]{3}$'),
  periodicidade text NOT NULL DEFAULT 'unica' CHECK (periodicidade IN ('unica', 'mensal', 'trimestral', 'anual')),
  vigente_de date NOT NULL DEFAULT current_date,
  vigente_ate date,
  criada_em timestamptz NOT NULL DEFAULT now(),
  CONSTRAINT ck_preco_vigencia CHECK (vigente_ate IS NULL OR vigente_ate > vigente_de),
  CONSTRAINT ex_preco_sem_sobreposicao EXCLUDE USING gist (
    produto_id WITH =, moeda WITH =, periodicidade WITH =, daterange(vigente_de, vigente_ate, '[)') WITH &&)
);

COMMENT ON TABLE public.produto_preco IS
  'dono=CPO; retencao=R12; Preco de tabela com vigencia, moeda (ISO 4217) e periodicidade, sem sobreposicao para o mesmo produto, moeda e periodicidade. Escrita so pela funcao produto_preco_definir.';
COMMENT ON COLUMN public.produto_preco.produto_id IS 'classe=nenhum; produto.';
COMMENT ON COLUMN public.produto_preco.valor IS 'classe=nenhum; valor na moeda.';
COMMENT ON COLUMN public.produto_preco.moeda IS 'classe=nenhum; ISO 4217 (BRL padrao).';
COMMENT ON COLUMN public.produto_preco.periodicidade IS 'classe=nenhum; unica, mensal, trimestral ou anual.';
COMMENT ON COLUMN public.produto_preco.vigente_de IS 'classe=nenhum; inicio da vigencia (inclusive).';
COMMENT ON COLUMN public.produto_preco.vigente_ate IS 'classe=nenhum; fim da vigencia (exclusive). NULL = vigente.';

-- ---------------------------------------------------------------------------
-- 6) Calendario e politica de SLA
-- ---------------------------------------------------------------------------
CREATE TABLE IF NOT EXISTS public.calendario (
  id bigint GENERATED ALWAYS AS IDENTITY PRIMARY KEY,
  rotulo text NOT NULL UNIQUE CHECK (length(trim(rotulo)) > 0),
  fuso text NOT NULL DEFAULT 'America/Sao_Paulo',
  dias_uteis smallint[] NOT NULL DEFAULT '{1,2,3,4,5}' CHECK (dias_uteis <@ '{1,2,3,4,5,6,7}'::smallint[] AND cardinality(dias_uteis) > 0),
  expediente_inicio time NOT NULL DEFAULT '09:00',
  expediente_fim time NOT NULL DEFAULT '18:00',
  feriados date[] NOT NULL DEFAULT '{}',
  criada_em timestamptz NOT NULL DEFAULT now(),
  atualizada_em timestamptz NOT NULL DEFAULT now(),
  CONSTRAINT ck_calendario_expediente CHECK (expediente_fim > expediente_inicio)
);

COMMENT ON TABLE public.calendario IS
  'dono=Lider de Dados; retencao=R12; Expediente e feriados para prazo em dias uteis (SLA da mensageria e do chamado, prazo do plano, prazo do titular). Le qualquer usuario ativo; edita quem tem configuracoes.write. Conta pela funcao somar_dias_uteis.';
COMMENT ON COLUMN public.calendario.rotulo IS 'classe=nenhum; nome do calendario (padrao, filial...).';
COMMENT ON COLUMN public.calendario.fuso IS 'classe=nenhum; fuso IANA.';
COMMENT ON COLUMN public.calendario.dias_uteis IS 'classe=nenhum; dias da semana uteis (ISO: 1 = segunda ... 7 = domingo).';
COMMENT ON COLUMN public.calendario.expediente_inicio IS 'classe=nenhum; inicio do expediente.';
COMMENT ON COLUMN public.calendario.expediente_fim IS 'classe=nenhum; fim do expediente.';
COMMENT ON COLUMN public.calendario.feriados IS 'classe=nenhum; datas que nao contam como dia util.';

DROP TRIGGER IF EXISTS trg_calendario_atualizada_em ON public.calendario;
CREATE TRIGGER trg_calendario_atualizada_em BEFORE UPDATE ON public.calendario
  FOR EACH ROW EXECUTE FUNCTION public.set_atualizada_em();

CREATE TABLE IF NOT EXISTS public.politica_sla (
  id bigint GENERATED ALWAYS AS IDENTITY PRIMARY KEY,
  tipo_item text NOT NULL CHECK (tipo_item ~ '^[a-z][a-z0-9_]*$'),
  prioridade text NOT NULL CHECK (prioridade IN ('baixa', 'media', 'alta', 'urgente')),
  calendario_id bigint NOT NULL REFERENCES public.calendario(id),
  primeira_resposta_min integer NOT NULL CHECK (primeira_resposta_min > 0),
  resolucao_min integer NOT NULL CHECK (resolucao_min > 0),
  ativa boolean NOT NULL DEFAULT true,
  criada_em timestamptz NOT NULL DEFAULT now(),
  atualizada_em timestamptz NOT NULL DEFAULT now(),
  CONSTRAINT ck_sla_resolucao_depois CHECK (resolucao_min >= primeira_resposta_min)
);
CREATE UNIQUE INDEX IF NOT EXISTS uq_politica_sla_ativa ON public.politica_sla (tipo_item, prioridade) WHERE ativa;
CREATE INDEX IF NOT EXISTS idx_politica_sla_calendario ON public.politica_sla (calendario_id);

COMMENT ON TABLE public.politica_sla IS
  'dono=Lider de Dados; retencao=R12; Uma politica ativa por tipo de item (atendimento, chamado...) e prioridade: meta de primeira resposta e de resolucao em minutos uteis do calendario. Quem aplica (mensageria.atendimento, tarefas.chamado) guarda o prazo calculado. Mudou = desativa e cria outra (nao apaga com item vivo).';
COMMENT ON COLUMN public.politica_sla.tipo_item IS 'classe=nenhum; a que a politica se aplica.';
COMMENT ON COLUMN public.politica_sla.prioridade IS 'classe=nenhum; baixa, media, alta ou urgente.';
COMMENT ON COLUMN public.politica_sla.calendario_id IS 'classe=nenhum; calendario que define o tempo util.';
COMMENT ON COLUMN public.politica_sla.primeira_resposta_min IS 'classe=nenhum; meta da primeira resposta, em minutos uteis.';
COMMENT ON COLUMN public.politica_sla.resolucao_min IS 'classe=nenhum; meta de resolucao, em minutos uteis.';
COMMENT ON COLUMN public.politica_sla.ativa IS 'classe=nenhum; so uma ativa por tipo e prioridade.';

DROP TRIGGER IF EXISTS trg_politica_sla_atualizada_em ON public.politica_sla;
CREATE TRIGGER trg_politica_sla_atualizada_em BEFORE UPDATE ON public.politica_sla
  FOR EACH ROW EXECUTE FUNCTION public.set_atualizada_em();

CREATE OR REPLACE FUNCTION public.somar_dias_uteis(p_calendario_id bigint, p_inicio date, p_dias integer)
RETURNS date
LANGUAGE plpgsql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  c public.calendario%ROWTYPE;
  d date := p_inicio;
  n integer := 0;
BEGIN
  SELECT * INTO c FROM public.calendario WHERE id = p_calendario_id;
  IF NOT FOUND THEN
    RAISE EXCEPTION 'calendario % nao existe', p_calendario_id;
  END IF;
  IF p_dias IS NULL OR p_dias < 0 THEN
    RAISE EXCEPTION 'numero de dias uteis invalido: %', p_dias;
  END IF;
  WHILE n < p_dias LOOP
    d := d + 1;
    IF extract(isodow FROM d)::smallint = ANY (c.dias_uteis) AND NOT d = ANY (c.feriados) THEN
      n := n + 1;
    END IF;
  END LOOP;
  RETURN d;
END;
$$;

COMMENT ON FUNCTION public.somar_dias_uteis(bigint, date, integer) IS
  'Data que fica p_dias dias uteis depois de p_inicio no calendario (pula fim de semana e feriado). Usada pelo prazo uteis do plano e pelo SLA.';
GRANT EXECUTE ON FUNCTION public.somar_dias_uteis(bigint, date, integer) TO authenticated, service_role;

-- ---------------------------------------------------------------------------
-- 7) usuarios.parte_id e parte_atual() (ADR-012 item 8)
-- ---------------------------------------------------------------------------
ALTER TABLE public.usuarios ADD COLUMN IF NOT EXISTS parte_id bigint REFERENCES public.parte(id);
CREATE UNIQUE INDEX IF NOT EXISTS uq_usuarios_parte ON public.usuarios (parte_id) WHERE parte_id IS NOT NULL;
COMMENT ON COLUMN public.usuarios.parte_id IS
  'classe=nenhum; a pessoa (public.parte) que este usuario e. Base da policy de titular: parte_id da linha = parte_atual(). So muda por usuario_vincular_parte (nucleo.manage).';

CREATE OR REPLACE FUNCTION public.parte_atual()
RETURNS bigint
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
  SELECT u.parte_id FROM public.usuarios u
   WHERE u.auth_user_id = auth.uid() AND u.ativo
   LIMIT 1;
$$;

COMMENT ON FUNCTION public.parte_atual() IS
  'parte_id da pessoa logada (usuarios.parte_id). NULL se anon, sem cadastro, inativo ou sem vinculo. Usada na policy de titular.';
REVOKE ALL ON FUNCTION public.parte_atual() FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.parte_atual() TO authenticated, service_role;

-- ---------------------------------------------------------------------------
-- 8) Outbox do nucleo (eventos nucleo.*)
-- ---------------------------------------------------------------------------
SELECT public.criar_outbox_inbox('public');

-- ---------------------------------------------------------------------------
-- 9) Seguranca: RLS, grants por coluna, policies
-- ---------------------------------------------------------------------------
ALTER TABLE public.tipo_papel ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.campo_definicao ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.parte ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.parte_pessoa ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.parte_organizacao ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.papel_parte ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.contato ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.endereco ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.consentimento ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.documento ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.produto ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.produto_preco ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.calendario ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.politica_sla ENABLE ROW LEVEL SECURITY;

REVOKE ALL ON public.tipo_papel, public.campo_definicao, public.parte, public.parte_pessoa, public.parte_organizacao,
              public.papel_parte, public.contato, public.endereco, public.consentimento, public.documento,
              public.produto, public.produto_preco, public.calendario, public.politica_sla
  FROM PUBLIC, anon, authenticated;
GRANT ALL ON public.tipo_papel, public.campo_definicao, public.parte, public.parte_pessoa, public.parte_organizacao,
             public.papel_parte, public.contato, public.endereco, public.consentimento, public.documento,
             public.produto, public.produto_preco, public.calendario, public.politica_sla
  TO service_role;

-- Sequencias de identidade: o default privilege da plataforma abre sequencia nova de
-- public pra anon/authenticated (GA-03). Ninguem do app precisa delas: a escrita e
-- pelas funcoes (dono postgres) e coluna identity nao exige USAGE de quem insere.
DO $$
DECLARE
  r record;
BEGIN
  FOR r IN SELECT c.oid::regclass AS s FROM pg_class c JOIN pg_namespace n ON n.oid = c.relnamespace
            WHERE n.nspname = 'public' AND c.relkind = 'S' LOOP
    EXECUTE format('REVOKE ALL ON SEQUENCE %s FROM PUBLIC, anon, authenticated', r.s);
  END LOOP;
END $$;

-- Leitura (tabela inteira) onde nao ha coluna bruta a esconder
GRANT SELECT ON public.tipo_papel, public.campo_definicao, public.parte, public.papel_parte,
                public.consentimento, public.documento, public.produto, public.produto_preco,
                public.calendario, public.politica_sla
  TO authenticated;
-- Leitura por coluna: o bruto (cpf, nascimento, cnpj, valor, logradouro...) fica sem grant
GRANT SELECT (parte_id, tipo, nome_civil, nome_social, cpf_mascarado, atualizada_em) ON public.parte_pessoa TO authenticated;
GRANT SELECT (parte_id, tipo, razao_social, nome_fantasia, mei, cnpj_exibicao, atualizada_em) ON public.parte_organizacao TO authenticated;
GRANT SELECT (id, parte_id, tipo, finalidade, principal, valor_mascarado, criada_em, atualizada_em) ON public.contato TO authenticated;
GRANT SELECT (id, parte_id, finalidade, cidade, uf, pais, cep_prefixo, principal, criada_em, atualizada_em) ON public.endereco TO authenticated;
-- Escrita direta so nos catalogos de configuracao (sem DELETE: GA-16)
GRANT INSERT, UPDATE ON public.calendario, public.politica_sla, public.campo_definicao TO authenticated;

-- catalogos: qualquer usuario ativo le
DROP POLICY IF EXISTS tipo_papel_select ON public.tipo_papel;
CREATE POLICY tipo_papel_select ON public.tipo_papel FOR SELECT TO authenticated
  USING (public.usuario_atual() IS NOT NULL);
DROP POLICY IF EXISTS campo_definicao_select ON public.campo_definicao;
CREATE POLICY campo_definicao_select ON public.campo_definicao FOR SELECT TO authenticated
  USING (public.usuario_atual() IS NOT NULL);
DROP POLICY IF EXISTS produto_select ON public.produto;
CREATE POLICY produto_select ON public.produto FOR SELECT TO authenticated
  USING (public.usuario_atual() IS NOT NULL);
DROP POLICY IF EXISTS produto_preco_select ON public.produto_preco;
CREATE POLICY produto_preco_select ON public.produto_preco FOR SELECT TO authenticated
  USING (public.usuario_atual() IS NOT NULL);
DROP POLICY IF EXISTS calendario_select ON public.calendario;
CREATE POLICY calendario_select ON public.calendario FOR SELECT TO authenticated
  USING (public.usuario_atual() IS NOT NULL);
DROP POLICY IF EXISTS politica_sla_select ON public.politica_sla;
CREATE POLICY politica_sla_select ON public.politica_sla FOR SELECT TO authenticated
  USING (public.usuario_atual() IS NOT NULL);

-- configuracao: configuracoes.write insere e altera
DROP POLICY IF EXISTS calendario_insert ON public.calendario;
CREATE POLICY calendario_insert ON public.calendario FOR INSERT TO authenticated
  WITH CHECK (public.tem_permissao('configuracoes.write'));
DROP POLICY IF EXISTS calendario_update ON public.calendario;
CREATE POLICY calendario_update ON public.calendario FOR UPDATE TO authenticated
  USING (public.tem_permissao('configuracoes.write')) WITH CHECK (public.tem_permissao('configuracoes.write'));
DROP POLICY IF EXISTS politica_sla_insert ON public.politica_sla;
CREATE POLICY politica_sla_insert ON public.politica_sla FOR INSERT TO authenticated
  WITH CHECK (public.tem_permissao('configuracoes.write'));
DROP POLICY IF EXISTS politica_sla_update ON public.politica_sla;
CREATE POLICY politica_sla_update ON public.politica_sla FOR UPDATE TO authenticated
  USING (public.tem_permissao('configuracoes.write')) WITH CHECK (public.tem_permissao('configuracoes.write'));
DROP POLICY IF EXISTS campo_definicao_insert ON public.campo_definicao;
CREATE POLICY campo_definicao_insert ON public.campo_definicao FOR INSERT TO authenticated
  WITH CHECK (public.tem_permissao('configuracoes.write'));
DROP POLICY IF EXISTS campo_definicao_update ON public.campo_definicao;
CREATE POLICY campo_definicao_update ON public.campo_definicao FOR UPDATE TO authenticated
  USING (public.tem_permissao('configuracoes.write')) WITH CHECK (public.tem_permissao('configuracoes.write'));

-- Parte e satelites: nucleo.read, ou o titular
DROP POLICY IF EXISTS parte_select ON public.parte;
CREATE POLICY parte_select ON public.parte FOR SELECT TO authenticated
  USING (public.tem_permissao('nucleo.read') OR id = public.parte_atual());
DROP POLICY IF EXISTS parte_pessoa_select ON public.parte_pessoa;
CREATE POLICY parte_pessoa_select ON public.parte_pessoa FOR SELECT TO authenticated
  USING (public.tem_permissao('nucleo.read') OR parte_id = public.parte_atual());
DROP POLICY IF EXISTS parte_organizacao_select ON public.parte_organizacao;
CREATE POLICY parte_organizacao_select ON public.parte_organizacao FOR SELECT TO authenticated
  USING (public.tem_permissao('nucleo.read') OR parte_id = public.parte_atual());
DROP POLICY IF EXISTS papel_parte_select ON public.papel_parte;
CREATE POLICY papel_parte_select ON public.papel_parte FOR SELECT TO authenticated
  USING (public.tem_permissao('nucleo.read') OR parte_id = public.parte_atual());
DROP POLICY IF EXISTS contato_select ON public.contato;
CREATE POLICY contato_select ON public.contato FOR SELECT TO authenticated
  USING (public.tem_permissao('nucleo.read') OR parte_id = public.parte_atual());
DROP POLICY IF EXISTS endereco_select ON public.endereco;
CREATE POLICY endereco_select ON public.endereco FOR SELECT TO authenticated
  USING (public.tem_permissao('nucleo.read') OR parte_id = public.parte_atual());
-- consentimento: so o restrito ou o titular; o resto pergunta a consentimento_vigente()
DROP POLICY IF EXISTS consentimento_select ON public.consentimento;
CREATE POLICY consentimento_select ON public.consentimento FOR SELECT TO authenticated
  USING (public.tem_permissao('nucleo.pessoal') OR parte_id = public.parte_atual());
-- documento: quem le o modulo dono
DROP POLICY IF EXISTS documento_select ON public.documento;
CREATE POLICY documento_select ON public.documento FOR SELECT TO authenticated
  USING (public.tem_permissao(modulo || '.read'));

-- View de leitura do cadastro, mascarada (security_invoker: as policies e os grants de quem le valem)
CREATE OR REPLACE VIEW public.parte_v WITH (security_invoker = true) AS
  SELECT p.id, p.tipo,
         coalesce(pp.nome_social, pp.nome_civil, po.nome_fantasia, po.razao_social) AS exibicao,
         pp.cpf_mascarado, po.cnpj_exibicao, po.mei,
         p.mesclada_em_parte_id, p.criada_em, p.atualizada_em
    FROM public.parte p
    LEFT JOIN public.parte_pessoa pp ON pp.parte_id = p.id
    LEFT JOIN public.parte_organizacao po ON po.parte_id = p.id;
COMMENT ON VIEW public.parte_v IS
  'Cadastro de Parte para a tela: nome de exibicao e documento mascarado. Nao expoe CPF, nascimento nem CNPJ de MEI.';
REVOKE ALL ON public.parte_v FROM PUBLIC, anon, authenticated;
GRANT SELECT ON public.parte_v TO authenticated, service_role;

-- ---------------------------------------------------------------------------
-- 10) Funcoes publicas de escrita e leitura do nucleo (SECURITY DEFINER)
-- ---------------------------------------------------------------------------
CREATE OR REPLACE FUNCTION public.pode_escrever_nucleo()
RETURNS boolean
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
  SELECT auth.uid() IS NULL  -- maquina: seed, inbox, script de servico (anon nao tem EXECUTE)
      OR public.tem_permissao('nucleo.write')
      OR EXISTS (SELECT 1 FROM unnest(ARRAY['crm', 'marketing', 'pessoas', 'financeiro', 'mensageria', 'juridico',
                                            'curso', 'eventos', 'cobranca', 'instagram']) AS m(s)
                  WHERE public.tem_permissao(m.s || '.write'));
$$;
COMMENT ON FUNCTION public.pode_escrever_nucleo() IS
  'Quem escreve no nucleo: maquina, nucleo.write, ou o .write de modulo que exerce papel de Parte (crm, marketing, pessoas, financeiro, mensageria, juridico, curso, eventos, cobranca, instagram). Decisao de 05/10/2026.';
REVOKE ALL ON FUNCTION public.pode_escrever_nucleo() FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.pode_escrever_nucleo() TO authenticated, service_role;

CREATE OR REPLACE FUNCTION public.parte_salvar_pessoa(
  p_parte_id bigint, p_nome_civil text, p_nome_social text DEFAULT NULL, p_cpf text DEFAULT NULL,
  p_data_nascimento date DEFAULT NULL, p_campos jsonb DEFAULT NULL)
RETURNS bigint
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_id bigint := p_parte_id;
BEGIN
  IF NOT public.pode_escrever_nucleo() THEN
    RAISE EXCEPTION 'sem permissao para cadastrar pessoa' USING ERRCODE = '42501';
  END IF;
  IF v_id IS NULL THEN
    INSERT INTO public.parte (tipo, campos) VALUES ('pessoa', coalesce(p_campos, '{}')) RETURNING id INTO v_id;
    INSERT INTO public.parte_pessoa (parte_id, nome_civil, nome_social, cpf, data_nascimento)
    VALUES (v_id, p_nome_civil, p_nome_social, nullif(regexp_replace(coalesce(p_cpf, ''), '\D', '', 'g'), ''), p_data_nascimento);
  ELSE
    UPDATE public.parte_pessoa
       SET nome_civil = p_nome_civil, nome_social = p_nome_social,
           cpf = nullif(regexp_replace(coalesce(p_cpf, ''), '\D', '', 'g'), ''), data_nascimento = p_data_nascimento
     WHERE parte_id = v_id;
    IF NOT FOUND THEN
      RAISE EXCEPTION 'Parte % nao e uma pessoa cadastrada', v_id;
    END IF;
    IF p_campos IS NOT NULL THEN
      UPDATE public.parte SET campos = p_campos WHERE id = v_id;
    END IF;
  END IF;
  RETURN v_id;
END;
$$;

CREATE OR REPLACE FUNCTION public.parte_salvar_organizacao(
  p_parte_id bigint, p_razao_social text, p_nome_fantasia text DEFAULT NULL, p_cnpj text DEFAULT NULL,
  p_mei boolean DEFAULT false, p_campos jsonb DEFAULT NULL)
RETURNS bigint
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_id bigint := p_parte_id;
  v_cnpj text := nullif(upper(regexp_replace(coalesce(p_cnpj, ''), '[^0-9A-Za-z]', '', 'g')), '');
BEGIN
  IF NOT public.pode_escrever_nucleo() THEN
    RAISE EXCEPTION 'sem permissao para cadastrar organizacao' USING ERRCODE = '42501';
  END IF;
  IF v_id IS NULL THEN
    INSERT INTO public.parte (tipo, campos) VALUES ('organizacao', coalesce(p_campos, '{}')) RETURNING id INTO v_id;
    INSERT INTO public.parte_organizacao (parte_id, razao_social, nome_fantasia, cnpj, mei)
    VALUES (v_id, p_razao_social, p_nome_fantasia, v_cnpj, coalesce(p_mei, false));
  ELSE
    UPDATE public.parte_organizacao
       SET razao_social = p_razao_social, nome_fantasia = p_nome_fantasia, cnpj = v_cnpj, mei = coalesce(p_mei, false)
     WHERE parte_id = v_id;
    IF NOT FOUND THEN
      RAISE EXCEPTION 'Parte % nao e uma organizacao cadastrada', v_id;
    END IF;
    IF p_campos IS NOT NULL THEN
      UPDATE public.parte SET campos = p_campos WHERE id = v_id;
    END IF;
  END IF;
  RETURN v_id;
END;
$$;

CREATE OR REPLACE FUNCTION public.contato_salvar(
  p_parte_id bigint, p_tipo text, p_valor text, p_finalidade text DEFAULT 'geral', p_principal boolean DEFAULT false)
RETURNS bigint
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_id bigint;
  v_valor text := CASE WHEN p_tipo = 'email' THEN lower(trim(p_valor)) ELSE trim(p_valor) END;
BEGIN
  IF NOT public.pode_escrever_nucleo() THEN
    RAISE EXCEPTION 'sem permissao para cadastrar contato' USING ERRCODE = '42501';
  END IF;
  INSERT INTO public.contato (parte_id, tipo, valor, finalidade, principal)
  VALUES (p_parte_id, p_tipo, v_valor, coalesce(p_finalidade, 'geral'), coalesce(p_principal, false))
  ON CONFLICT (parte_id, tipo, valor)
    DO UPDATE SET finalidade = EXCLUDED.finalidade, principal = EXCLUDED.principal
  RETURNING id INTO v_id;
  RETURN v_id;
END;
$$;

CREATE OR REPLACE FUNCTION public.endereco_salvar(
  p_parte_id bigint, p_logradouro text, p_cidade text, p_numero text DEFAULT NULL, p_complemento text DEFAULT NULL,
  p_bairro text DEFAULT NULL, p_uf text DEFAULT NULL, p_cep text DEFAULT NULL, p_finalidade text DEFAULT 'geral',
  p_pais text DEFAULT 'BR', p_principal boolean DEFAULT false, p_endereco_id bigint DEFAULT NULL)
RETURNS bigint
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_id bigint := p_endereco_id;
  v_cep text := nullif(regexp_replace(coalesce(p_cep, ''), '\D', '', 'g'), '');
BEGIN
  IF NOT public.pode_escrever_nucleo() THEN
    RAISE EXCEPTION 'sem permissao para cadastrar endereco' USING ERRCODE = '42501';
  END IF;
  IF v_id IS NULL THEN
    INSERT INTO public.endereco (parte_id, finalidade, logradouro, numero, complemento, bairro, cidade, uf, cep, pais, principal)
    VALUES (p_parte_id, coalesce(p_finalidade, 'geral'), p_logradouro, p_numero, p_complemento, p_bairro, p_cidade,
            upper(p_uf), v_cep, upper(coalesce(p_pais, 'BR')), coalesce(p_principal, false))
    RETURNING id INTO v_id;
  ELSE
    UPDATE public.endereco
       SET finalidade = coalesce(p_finalidade, 'geral'), logradouro = p_logradouro, numero = p_numero,
           complemento = p_complemento, bairro = p_bairro, cidade = p_cidade, uf = upper(p_uf), cep = v_cep,
           pais = upper(coalesce(p_pais, 'BR')), principal = coalesce(p_principal, false)
     WHERE id = v_id AND parte_id = p_parte_id;
    IF NOT FOUND THEN
      RAISE EXCEPTION 'endereco % nao e da Parte %', v_id, p_parte_id;
    END IF;
  END IF;
  RETURN v_id;
END;
$$;

CREATE OR REPLACE FUNCTION public.papel_parte_iniciar(p_parte_id bigint, p_tipo text, p_vigente_de date DEFAULT current_date)
RETURNS bigint
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_id bigint;
BEGIN
  IF NOT public.pode_escrever_nucleo() THEN
    RAISE EXCEPTION 'sem permissao para dar papel a Parte' USING ERRCODE = '42501';
  END IF;
  IF NOT EXISTS (SELECT 1 FROM public.tipo_papel WHERE slug = p_tipo AND ativo) THEN
    RAISE EXCEPTION 'papel % nao existe ou esta aposentado', p_tipo;
  END IF;
  INSERT INTO public.papel_parte (parte_id, tipo, vigente_de)
  VALUES (p_parte_id, p_tipo, coalesce(p_vigente_de, current_date))
  RETURNING id INTO v_id;
  RETURN v_id;
END;
$$;

CREATE OR REPLACE FUNCTION public.papel_parte_encerrar(p_papel_id bigint, p_vigente_ate date DEFAULT current_date)
RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
  IF NOT public.pode_escrever_nucleo() THEN
    RAISE EXCEPTION 'sem permissao para encerrar papel' USING ERRCODE = '42501';
  END IF;
  UPDATE public.papel_parte SET vigente_ate = coalesce(p_vigente_ate, current_date)
   WHERE id = p_papel_id AND vigente_ate IS NULL;
  IF NOT FOUND THEN
    RAISE EXCEPTION 'papel % nao existe ou ja esta encerrado', p_papel_id;
  END IF;
END;
$$;

CREATE OR REPLACE FUNCTION public.consentimento_registrar(
  p_parte_id bigint, p_canal text, p_finalidade text, p_estado text, p_base_legal text,
  p_contato_id bigint DEFAULT NULL, p_prova text DEFAULT NULL)
RETURNS bigint
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_id bigint;
  v_versao integer;
BEGIN
  IF NOT public.pode_escrever_nucleo() THEN
    RAISE EXCEPTION 'sem permissao para registrar consentimento' USING ERRCODE = '42501';
  END IF;
  IF p_contato_id IS NOT NULL
     AND NOT EXISTS (SELECT 1 FROM public.contato WHERE id = p_contato_id AND parte_id = p_parte_id) THEN
    RAISE EXCEPTION 'contato % nao e da Parte %', p_contato_id, p_parte_id;
  END IF;
  -- serializa por titular: duas gravacoes simultaneas nao pegam a mesma versao
  PERFORM pg_advisory_xact_lock(hashtextextended('consentimento:' || p_parte_id, 0));
  SELECT coalesce(max(versao), 0) + 1 INTO v_versao FROM public.consentimento
   WHERE parte_id = p_parte_id AND contato_id IS NOT DISTINCT FROM p_contato_id
     AND canal = p_canal AND finalidade = p_finalidade;
  INSERT INTO public.consentimento (parte_id, contato_id, canal, finalidade, estado, base_legal, prova, versao,
                                    registrado_por_usuario_id)
  VALUES (p_parte_id, p_contato_id, p_canal, p_finalidade, p_estado, p_base_legal, p_prova, v_versao,
          public.usuario_atual())
  RETURNING id INTO v_id;
  INSERT INTO public.outbox (tipo, versao, correlacao, payload)
  VALUES ('nucleo.consentimento_alterado', 1, v_id::text,
          jsonb_build_object('parte_id', p_parte_id, 'contato_id', p_contato_id, 'canal', p_canal,
                             'finalidade', p_finalidade, 'estado', p_estado, 'versao', v_versao));
  RETURN v_id;
END;
$$;

CREATE OR REPLACE FUNCTION public.consentimento_vigente(
  p_parte_id bigint, p_canal text, p_finalidade text, p_contato_id bigint DEFAULT NULL)
RETURNS text
LANGUAGE plpgsql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v text;
BEGIN
  IF auth.uid() IS NOT NULL AND NOT (public.tem_permissao('nucleo.read') OR public.pode_escrever_nucleo()
                                     OR coalesce(p_parte_id = public.parte_atual(), false)) THEN
    RAISE EXCEPTION 'sem permissao para consultar consentimento' USING ERRCODE = '42501';
  END IF;
  -- o especifico do contato vence o geral da Parte; sem registro = 'sem_registro'
  SELECT c.estado INTO v FROM public.consentimento c
   WHERE c.parte_id = p_parte_id AND c.canal = p_canal AND c.finalidade = p_finalidade
     AND (c.contato_id = p_contato_id OR c.contato_id IS NULL)
   ORDER BY (c.contato_id IS NULL), c.versao DESC
   LIMIT 1;
  RETURN coalesce(v, 'sem_registro');
END;
$$;

CREATE OR REPLACE FUNCTION public.documento_registrar(
  p_modulo text, p_tipo text, p_nome_arquivo text, p_caminho text, p_hash text,
  p_parte_id bigint DEFAULT NULL, p_tamanho_bytes bigint DEFAULT NULL, p_mime text DEFAULT NULL)
RETURNS bigint
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_id bigint;
BEGIN
  IF auth.uid() IS NOT NULL AND NOT public.tem_permissao(p_modulo || '.write') THEN
    RAISE EXCEPTION 'sem permissao para registrar documento do modulo %', p_modulo USING ERRCODE = '42501';
  END IF;
  INSERT INTO public.documento (modulo, parte_id, tipo, nome_arquivo, caminho, hash, tamanho_bytes, mime)
  VALUES (p_modulo, p_parte_id, p_tipo, p_nome_arquivo, p_caminho, lower(p_hash), p_tamanho_bytes, p_mime)
  RETURNING id INTO v_id;
  RETURN v_id;
END;
$$;

CREATE OR REPLACE FUNCTION public.produto_salvar(p_codigo text, p_titulo text, p_descricao text DEFAULT NULL,
                                                 p_ativo boolean DEFAULT true)
RETURNS bigint
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_id bigint;
BEGIN
  IF auth.uid() IS NOT NULL AND NOT public.tem_permissao('produto.write') THEN
    RAISE EXCEPTION 'sem permissao para cadastrar produto' USING ERRCODE = '42501';
  END IF;
  INSERT INTO public.produto (codigo, titulo, descricao, ativo)
  VALUES (p_codigo, p_titulo, p_descricao, coalesce(p_ativo, true))
  ON CONFLICT (codigo) DO UPDATE SET titulo = EXCLUDED.titulo, descricao = EXCLUDED.descricao, ativo = EXCLUDED.ativo
  RETURNING id INTO v_id;
  INSERT INTO public.outbox (tipo, versao, correlacao, payload)
  VALUES ('nucleo.produto_alterado', 1, v_id::text, jsonb_build_object('produto_id', v_id));
  RETURN v_id;
END;
$$;

CREATE OR REPLACE FUNCTION public.produto_preco_definir(
  p_produto_id bigint, p_valor numeric, p_vigente_de date DEFAULT current_date, p_moeda text DEFAULT 'BRL',
  p_periodicidade text DEFAULT 'unica')
RETURNS bigint
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_id bigint;
  v_de date := coalesce(p_vigente_de, current_date);
BEGIN
  IF auth.uid() IS NOT NULL AND NOT public.tem_permissao('produto.write') THEN
    RAISE EXCEPTION 'sem permissao para definir preco' USING ERRCODE = '42501';
  END IF;
  -- fecha o preco vigente da mesma moeda e periodicidade na vespera do novo
  UPDATE public.produto_preco SET vigente_ate = v_de
   WHERE produto_id = p_produto_id AND moeda = coalesce(p_moeda, 'BRL')
     AND periodicidade = coalesce(p_periodicidade, 'unica') AND vigente_ate IS NULL AND vigente_de < v_de;
  INSERT INTO public.produto_preco (produto_id, valor, moeda, periodicidade, vigente_de)
  VALUES (p_produto_id, p_valor, coalesce(p_moeda, 'BRL'), coalesce(p_periodicidade, 'unica'), v_de)
  RETURNING id INTO v_id;
  INSERT INTO public.outbox (tipo, versao, correlacao, payload)
  VALUES ('nucleo.produto_alterado', 1, p_produto_id::text, jsonb_build_object('produto_id', p_produto_id, 'preco_id', v_id));
  RETURN v_id;
END;
$$;

CREATE OR REPLACE FUNCTION public.parte_mesclar(p_origem bigint, p_destino bigint)
RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
  IF auth.uid() IS NOT NULL AND NOT public.tem_permissao('nucleo.manage') THEN
    RAISE EXCEPTION 'mesclar cadastro exige nucleo.manage' USING ERRCODE = '42501';
  END IF;
  IF p_origem = p_destino THEN
    RAISE EXCEPTION 'origem e destino da mescla sao a mesma Parte';
  END IF;
  IF NOT EXISTS (SELECT 1 FROM public.parte WHERE id = p_destino AND mesclada_em_parte_id IS NULL) THEN
    RAISE EXCEPTION 'destino % nao existe ou ja foi mesclado', p_destino;
  END IF;
  UPDATE public.parte SET mesclada_em_parte_id = p_destino, mesclada_em = now()
   WHERE id = p_origem AND mesclada_em_parte_id IS NULL;
  IF NOT FOUND THEN
    RAISE EXCEPTION 'origem % nao existe ou ja foi mesclada', p_origem;
  END IF;
  UPDATE public.usuarios SET parte_id = p_destino
   WHERE parte_id = p_origem
     AND NOT EXISTS (SELECT 1 FROM public.usuarios u2 WHERE u2.parte_id = p_destino);
  INSERT INTO public.outbox (tipo, versao, correlacao, payload)
  VALUES ('nucleo.parte_mesclada', 1, p_origem::text,
          jsonb_build_object('parte_antiga', p_origem, 'parte_nova', p_destino));
END;
$$;

CREATE OR REPLACE FUNCTION public.usuario_vincular_parte(p_usuario_id uuid, p_parte_id bigint)
RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
  IF auth.uid() IS NOT NULL AND NOT public.tem_permissao('nucleo.manage') THEN
    RAISE EXCEPTION 'ligar usuario a pessoa exige nucleo.manage' USING ERRCODE = '42501';
  END IF;
  IF p_parte_id IS NOT NULL AND NOT EXISTS (SELECT 1 FROM public.parte WHERE id = p_parte_id AND tipo = 'pessoa') THEN
    RAISE EXCEPTION 'Parte % nao e uma pessoa', p_parte_id;
  END IF;
  UPDATE public.usuarios SET parte_id = p_parte_id WHERE id = p_usuario_id;
  IF NOT FOUND THEN
    RAISE EXCEPTION 'usuario % nao existe', p_usuario_id;
  END IF;
END;
$$;

CREATE OR REPLACE FUNCTION public.parte_dados_pessoais(p_parte_id bigint)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_titular boolean := p_parte_id = public.parte_atual();
  r jsonb;
BEGIN
  IF auth.uid() IS NOT NULL AND NOT (public.tem_permissao('nucleo.pessoal') OR coalesce(v_titular, false)) THEN
    RAISE EXCEPTION 'dado pessoal inteiro exige nucleo.pessoal (ou ser o titular)' USING ERRCODE = '42501';
  END IF;
  SELECT jsonb_build_object(
           'parte_id', p.id, 'tipo', p.tipo,
           'nome_civil', pp.nome_civil, 'nome_social', pp.nome_social, 'cpf', pp.cpf,
           'data_nascimento', pp.data_nascimento,
           'razao_social', po.razao_social, 'cnpj', po.cnpj, 'mei', po.mei,
           'contatos', coalesce((SELECT jsonb_agg(jsonb_build_object('id', c.id, 'tipo', c.tipo, 'valor', c.valor,
                                                                     'finalidade', c.finalidade) ORDER BY c.id)
                                   FROM public.contato c WHERE c.parte_id = p.id), '[]'),
           'enderecos', coalesce((SELECT jsonb_agg(jsonb_build_object('id', e.id, 'finalidade', e.finalidade,
                                    'logradouro', e.logradouro, 'numero', e.numero, 'complemento', e.complemento,
                                    'bairro', e.bairro, 'cidade', e.cidade, 'uf', e.uf, 'cep', e.cep, 'pais', e.pais) ORDER BY e.id)
                                    FROM public.endereco e WHERE e.parte_id = p.id), '[]'),
           'campos', p.campos)
    INTO r
    FROM public.parte p
    LEFT JOIN public.parte_pessoa pp ON pp.parte_id = p.id
    LEFT JOIN public.parte_organizacao po ON po.parte_id = p.id
   WHERE p.id = p_parte_id;
  IF r IS NULL THEN
    RAISE EXCEPTION 'Parte % nao existe', p_parte_id;
  END IF;
  -- trilha de quem leu dado pessoal de outra pessoa: so tipo e id, sem o dado
  IF auth.uid() IS NOT NULL AND NOT coalesce(v_titular, false) THEN
    INSERT INTO public.atividade (usuario_id, tipo, descricao, metadata)
    VALUES (public.usuario_atual(), 'dado_pessoal_lido', 'Leitura de dado pessoal de cadastro',
            jsonb_build_object('parte_id', p_parte_id));
  END IF;
  RETURN r;
END;
$$;

COMMENT ON FUNCTION public.parte_salvar_pessoa(bigint, text, text, text, date, jsonb) IS
  'motivo: escrita no nucleo so pela funcao publica (P-07, GA-11). Cria (p_parte_id NULL) ou corrige pessoa; CPF normalizado e conferido. Permissao: pode_escrever_nucleo().';
COMMENT ON FUNCTION public.parte_salvar_organizacao(bigint, text, text, text, boolean, jsonb) IS
  'motivo: escrita no nucleo so pela funcao publica (P-07). Cria ou corrige organizacao; CNPJ alfanumerico normalizado e conferido.';
COMMENT ON FUNCTION public.contato_salvar(bigint, text, text, text, boolean) IS
  'motivo: escrita no nucleo so pela funcao publica (P-07). Upsert por (parte, tipo, valor); e-mail minusculo.';
COMMENT ON FUNCTION public.endereco_salvar(bigint, text, text, text, text, text, text, text, text, text, boolean, bigint) IS
  'motivo: escrita no nucleo so pela funcao publica (P-07). Cria ou corrige endereco (p_endereco_id).';
COMMENT ON FUNCTION public.papel_parte_iniciar(bigint, text, date) IS
  'motivo: vigencia do papel so pela funcao publica (P-07); sobreposicao do mesmo papel e recusada (EXCLUDE).';
COMMENT ON FUNCTION public.papel_parte_encerrar(bigint, date) IS
  'motivo: encerra papel vigente (vigente_ate exclusive).';
COMMENT ON FUNCTION public.consentimento_registrar(bigint, text, text, text, text, bigint, text) IS
  'motivo: consentimento so por linha nova versionada, com evento nucleo.consentimento_alterado na mesma transacao.';
COMMENT ON FUNCTION public.consentimento_vigente(bigint, text, text, bigint) IS
  'motivo: a mensageria consulta na hora do envio (P-05). Devolve concedido, revogado ou sem_registro; o do contato vence o geral da Parte.';
COMMENT ON FUNCTION public.documento_registrar(text, text, text, text, text, bigint, bigint, text) IS
  'motivo: referencia de arquivo so pela funcao, com `<modulo>.write` do modulo dono.';
COMMENT ON FUNCTION public.produto_salvar(text, text, text, boolean) IS
  'motivo: catalogo de produto so pela funcao, com produto.write; publica nucleo.produto_alterado.';
COMMENT ON FUNCTION public.produto_preco_definir(bigint, numeric, date, text, text) IS
  'motivo: preco novo fecha o vigente da mesma moeda e periodicidade; publica nucleo.produto_alterado.';
COMMENT ON FUNCTION public.parte_mesclar(bigint, bigint) IS
  'motivo: fusao de cadastro duplicado (nucleo.manage); publica nucleo.parte_mesclada para os modulos reapontarem.';
COMMENT ON FUNCTION public.usuario_vincular_parte(uuid, bigint) IS
  'motivo: liga o usuario a sua Parte pessoa (nucleo.manage); base da policy de titular.';
COMMENT ON FUNCTION public.parte_dados_pessoais(bigint) IS
  'motivo: unica saida do dado pessoal inteiro (nucleo.pessoal ou titular); leitura de terceiro registrada em atividade (tipo dado_pessoal_lido, so o id).';

REVOKE ALL ON FUNCTION
  public.parte_salvar_pessoa(bigint, text, text, text, date, jsonb),
  public.parte_salvar_organizacao(bigint, text, text, text, boolean, jsonb),
  public.contato_salvar(bigint, text, text, text, boolean),
  public.endereco_salvar(bigint, text, text, text, text, text, text, text, text, text, boolean, bigint),
  public.papel_parte_iniciar(bigint, text, date),
  public.papel_parte_encerrar(bigint, date),
  public.consentimento_registrar(bigint, text, text, text, text, bigint, text),
  public.consentimento_vigente(bigint, text, text, bigint),
  public.documento_registrar(text, text, text, text, text, bigint, bigint, text),
  public.produto_salvar(text, text, text, boolean),
  public.produto_preco_definir(bigint, numeric, date, text, text),
  public.parte_mesclar(bigint, bigint),
  public.usuario_vincular_parte(uuid, bigint),
  public.parte_dados_pessoais(bigint)
  FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION
  public.parte_salvar_pessoa(bigint, text, text, text, date, jsonb),
  public.parte_salvar_organizacao(bigint, text, text, text, boolean, jsonb),
  public.contato_salvar(bigint, text, text, text, boolean),
  public.endereco_salvar(bigint, text, text, text, text, text, text, text, text, text, boolean, bigint),
  public.papel_parte_iniciar(bigint, text, date),
  public.papel_parte_encerrar(bigint, date),
  public.consentimento_registrar(bigint, text, text, text, text, bigint, text),
  public.consentimento_vigente(bigint, text, text, bigint),
  public.documento_registrar(text, text, text, text, text, bigint, bigint, text),
  public.produto_salvar(text, text, text, boolean),
  public.produto_preco_definir(bigint, numeric, date, text, text),
  public.parte_mesclar(bigint, bigint),
  public.usuario_vincular_parte(uuid, bigint),
  public.parte_dados_pessoais(bigint)
  TO authenticated, service_role;
REVOKE ALL ON FUNCTION public.fn_parte_valida_campos() FROM PUBLIC, anon, authenticated, service_role;

-- ---------------------------------------------------------------------------
-- Smoke
-- ---------------------------------------------------------------------------
DO $$
DECLARE
  t text;
  v_p bigint;
  v_cpf_pegou boolean := false;
  v_papel_pegou boolean := false;
BEGIN
  FOREACH t IN ARRAY ARRAY['tipo_papel', 'campo_definicao', 'parte', 'parte_pessoa', 'parte_organizacao', 'papel_parte',
                           'contato', 'endereco', 'consentimento', 'documento', 'produto', 'produto_preco',
                           'calendario', 'politica_sla', 'outbox', 'inbox'] LOOP
    IF NOT coalesce((SELECT relrowsecurity FROM pg_class WHERE oid = to_regclass('public.' || t)), false) THEN
      RAISE EXCEPTION 'smoke 0015: public.% ausente ou sem RLS', t;
    END IF;
    IF has_table_privilege('anon', 'public.' || t, 'SELECT,INSERT,UPDATE,DELETE') THEN
      RAISE EXCEPTION 'smoke 0015: anon com acesso a public.%', t;
    END IF;
  END LOOP;
  -- GA-11: nada de escrita direta nas tabelas do nucleo
  FOREACH t IN ARRAY ARRAY['parte', 'parte_pessoa', 'parte_organizacao', 'papel_parte', 'contato', 'endereco',
                           'consentimento', 'documento', 'produto', 'produto_preco'] LOOP
    IF has_table_privilege('authenticated', 'public.' || t, 'INSERT,UPDATE,DELETE') THEN
      RAISE EXCEPTION 'smoke 0015: authenticated escreve direto em public.% (escrita so pela funcao, GA-11)', t;
    END IF;
  END LOOP;
  -- mascara: bruto sem grant, mascarado com grant
  IF has_column_privilege('authenticated', 'public.parte_pessoa', 'cpf', 'SELECT')
     OR has_column_privilege('authenticated', 'public.parte_pessoa', 'data_nascimento', 'SELECT')
     OR has_column_privilege('authenticated', 'public.contato', 'valor', 'SELECT')
     OR has_column_privilege('authenticated', 'public.endereco', 'logradouro', 'SELECT')
     OR has_column_privilege('authenticated', 'public.parte_organizacao', 'cnpj', 'SELECT') THEN
    RAISE EXCEPTION 'smoke 0015: dado pessoal bruto com grant a authenticated — a mascara vira enfeite';
  END IF;
  IF NOT has_column_privilege('authenticated', 'public.parte_pessoa', 'cpf_mascarado', 'SELECT')
     OR NOT has_column_privilege('authenticated', 'public.contato', 'valor_mascarado', 'SELECT') THEN
    RAISE EXCEPTION 'smoke 0015: coluna mascarada sem grant — a tela renderiza VAZIA';
  END IF;
  IF NOT public.cpf_valido('52998224725') OR public.cpf_valido('52998224724') OR public.cpf_valido('11111111111')
     OR NOT public.cnpj_valido('11222333000181') OR NOT public.cnpj_valido('12ABC34501DE35')
     OR public.cnpj_valido('12ABC34501DE36') THEN
    RAISE EXCEPTION 'smoke 0015: validador de CPF/CNPJ errado';
  END IF;
  BEGIN
    BEGIN
      PERFORM public.parte_salvar_pessoa(NULL, '_smoke', NULL, '52998224724');
    EXCEPTION WHEN check_violation THEN v_cpf_pegou := true; END;
    v_p := public.parte_salvar_pessoa(NULL, '_smoke');
    PERFORM public.papel_parte_iniciar(v_p, 'lead', '2026-01-01');
    BEGIN
      PERFORM public.papel_parte_iniciar(v_p, 'lead', '2026-02-01');
    EXCEPTION WHEN exclusion_violation THEN v_papel_pegou := true; END;
    RAISE EXCEPTION 'smoke 0015: desfazendo' USING ERRCODE = 'P0999';
  EXCEPTION WHEN SQLSTATE 'P0999' THEN NULL;
  END;
  IF NOT v_cpf_pegou THEN RAISE EXCEPTION 'smoke 0015: CPF com DV errado foi aceito'; END IF;
  IF NOT v_papel_pegou THEN RAISE EXCEPTION 'smoke 0015: papel sobreposto foi aceito — ex_papel_sem_sobreposicao sumiu'; END IF;
END $$;

-- Rollback (ordem inversa):
--   DROP FUNCTION das 14 funcoes publicas, pode_escrever_nucleo, parte_atual, somar_dias_uteis,
--     validar_campos, fn_parte_valida_campos, cpf_valido, cnpj_valido;
--   DROP VIEW public.parte_v; DROP TABLE public.outbox, public.inbox;
--   ALTER TABLE public.usuarios DROP COLUMN parte_id;
--   DROP TABLE politica_sla, calendario, produto_preco, produto, documento, consentimento, endereco,
--     contato, papel_parte, parte_organizacao, parte_pessoa, parte, campo_definicao, tipo_papel;
--   DELETE FROM public.permissoes WHERE modulo = 'nucleo'; DELETE FROM public.modulo WHERE slug = 'nucleo';
