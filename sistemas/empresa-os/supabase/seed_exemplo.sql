-- seed_exemplo.sql
-- Dado de EXEMPLO do Empresa OS: serve ao CI (entre as rodadas de migration, pra
-- provar idempotencia COM dado), a homologacao (db push --include-seed) e ao
-- testar-migrations-local.sh. NUNCA vai pra producao (deploy-db.yml sem seed).
-- Regras (spec v2, seed_exemplo): SO DML (nada de CREATE/ALTER/DROP/GRANT/
-- REVOKE/TRUNCATE: o hook r10 nega DDL via MCP); idempotente (UUIDs fixos +
-- ON CONFLICT DO NOTHING; atividade e execucoes por WHERE NOT EXISTS); e-mails
-- @exemplo.invalid; auth_user_id NULL (login de verdade so pelo setup);
-- NUNCA cria dono — na homologacao o dono real vem do setup-inicial.mjs (se o
-- seed criasse um dono de exemplo antes, o seed_empresa manteria o de exemplo
-- e o dono real ficaria sem acesso); no CI os testes pgTAP criam o dono dentro
-- da propria transacao.
-- Na homologacao o cabecalho mostra "Empresa Exemplo" quando o workflow roda
-- antes do setup: e o sinal visivel de que o preview NAO e producao.

-- ---------------------------------------------------------------------------
-- Empresa
-- ---------------------------------------------------------------------------
INSERT INTO public.empresa (id, nome, descricao)
VALUES (1, 'Empresa Exemplo', 'Dado de exemplo: este banco ainda nao foi configurado como a sua empresa.')
ON CONFLICT (id) DO NOTHING;

-- ---------------------------------------------------------------------------
-- 2 usuarios NAO-dono: "equipe" e "leitor"
-- ---------------------------------------------------------------------------
INSERT INTO public.usuarios (id, nome, email) VALUES
  ('00000000-0000-4000-8000-0000000000e1', 'Equipe Exemplo', 'equipe@exemplo.invalid'),
  ('00000000-0000-4000-8000-0000000000e2', 'Leitor Exemplo', 'leitor@exemplo.invalid')
ON CONFLICT DO NOTHING;

-- equipe = todos os .read + tarefas.write + agentes.write; leitor = so tarefas.read
INSERT INTO public.usuarios_permissoes (usuario_id, permissao) VALUES
  ('00000000-0000-4000-8000-0000000000e1', 'tarefas.read'),
  ('00000000-0000-4000-8000-0000000000e1', 'agentes.read'),
  ('00000000-0000-4000-8000-0000000000e1', 'execucoes.read'),
  ('00000000-0000-4000-8000-0000000000e1', 'documentos.read'),
  ('00000000-0000-4000-8000-0000000000e1', 'atividade.read'),
  ('00000000-0000-4000-8000-0000000000e1', 'configuracoes.read'),
  ('00000000-0000-4000-8000-0000000000e1', 'tarefas.write'),
  ('00000000-0000-4000-8000-0000000000e1', 'agentes.write'),
  ('00000000-0000-4000-8000-0000000000e2', 'tarefas.read')
ON CONFLICT DO NOTHING;

-- ---------------------------------------------------------------------------
-- Os papeis do nucleo (NOMES_NUCLEO do instalar_time.py) e do time Tecnologia, estado instalado
-- ---------------------------------------------------------------------------
INSERT INTO public.agentes (id, name, time, descricao_curta, descricao, sandbox, estado, estado_conferido_em) VALUES
  ('00000000-0000-4000-8000-0000000000a1', 'polozi-gerente-de-trabalho', 'sistema',
   'Mantem o quadro de tarefas em dia',
   'Organiza as tarefas da empresa e fecha os trabalhos abertos. E quem mantem o quadro em dia.',
   'workspace-write', 'instalado', now()),
  ('00000000-0000-4000-8000-0000000000a2', 'tecnologia-publicar', 'sistema',
   'Leva a mudanca ate o ar e cuida das versoes',
   'Leva a mudanca ate o ar e cuida das versoes do codigo. Nada se perde quando ele esta de plantao.',
   'workspace-write', 'instalado', now()),
  ('00000000-0000-4000-8000-0000000000a3', 'tecnologia-revisor-seguranca', 'sistema',
   'Revisa a seguranca antes de todo merge',
   'Revisa a seguranca (chaves, senhas, tokens) antes de todo merge. Barra o vazamento antes de acontecer.',
   'read-only', 'instalado', now()),
  ('00000000-0000-4000-8000-0000000000a4', 'polozi-sistema-qa', 'sistema',
   'Confere se o sistema funciona de verdade',
   'Exercita o sistema como usuario e devolve aprovado ou bloqueado, com prova.',
   'read-only', 'instalado', now())
ON CONFLICT DO NOTHING;

-- ---------------------------------------------------------------------------
-- Tarefas: 2 do curso D1, 2 do plano de 90 dias (chave `exemplo.*`, ordem >= 9000,
-- pra nao colidir com o seed real) e 3 de trabalho (uma CONCLUIDA)
-- ---------------------------------------------------------------------------
INSERT INTO public.tarefas (id, chave, trilha, fase, ordem, titulo, objetivo, criterio_pronto, comando, prova, origem) VALUES
  ('00000000-0000-4000-8000-0000000000b1', 'exemplo.curso-d1-01', 'curso', 'D1', 9010,
   'Exemplo: criar a conta no GitHub', 'Ter um lugar pra guardar o codigo.', 'Conta criada e e-mail confirmado.',
   NULL, 'Tela do perfil aberta', 'ia'),
  ('00000000-0000-4000-8000-0000000000b2', 'exemplo.curso-d1-02', 'curso', 'D1', 9020,
   'Exemplo: criar o projeto no Supabase', 'Ter o banco da empresa.', 'Projeto criado.',
   NULL, 'Painel do projeto aberto', 'ia'),
  ('00000000-0000-4000-8000-0000000000b3', 'exemplo.plano90-clareza-1', 'plano90', 'clareza', 9010,
   'Exemplo: escrever em uma frase o que a empresa vende', 'Clareza sobre o produto.', 'Frase aprovada pelo dono.',
   NULL, 'Frase registrada', 'ia'),
  ('00000000-0000-4000-8000-0000000000b4', 'exemplo.plano90-clareza-2', 'plano90', 'clareza', 9020,
   'Exemplo: listar os 3 clientes mais importantes', 'Saber quem sustenta a empresa.', 'Lista com 3 nomes.',
   NULL, 'Lista registrada', 'ia')
ON CONFLICT DO NOTHING;

INSERT INTO public.tarefas (id, titulo, objetivo, criterio_pronto, status, origem, dono_id, concluida_em) VALUES
  ('00000000-0000-4000-8000-0000000000b5', 'Exemplo: revisar a proposta do cliente', 'Responder o cliente ate sexta.',
   'Proposta revisada e enviada.', 'EM_ANDAMENTO', 'humano', '00000000-0000-4000-8000-0000000000e1', NULL),
  ('00000000-0000-4000-8000-0000000000b6', 'Exemplo: atualizar o cadastro de fornecedores', 'Cadastro sem duplicidade.',
   'Lista conferida.', 'BACKLOG', 'ia', NULL, NULL),
  ('00000000-0000-4000-8000-0000000000b7', 'Exemplo: tarefa ja concluida', 'Mostrar uma tarefa pronta no quadro.',
   'Carimbo de conclusao preenchido.', 'CONCLUIDA', 'humano', '00000000-0000-4000-8000-0000000000e1',
   '2026-01-15T12:00:00Z')
ON CONFLICT DO NOTHING;

-- ---------------------------------------------------------------------------
-- 3 execucoes (APROVADO, BLOQUEADO, ERRO). Sem chave natural: WHERE NOT EXISTS
-- pelo resumo, que leva o prefixo "exemplo:".
-- ---------------------------------------------------------------------------
INSERT INTO public.execucoes_agente (agente, tarefa_id, iniciado_em, terminado_em, veredito, resumo)
SELECT v.agente, v.tarefa_id, v.iniciado_em, v.terminado_em, v.veredito, v.resumo
FROM (VALUES
  ('tecnologia-revisor-seguranca', '00000000-0000-4000-8000-0000000000b5'::uuid,
   '2026-01-15T10:00:00Z'::timestamptz, '2026-01-15T10:02:00Z'::timestamptz,
   'APROVADO', 'exemplo: varredura de segredos sem achados'),
  ('polozi-sistema-qa', NULL::uuid,
   '2026-01-15T11:00:00Z'::timestamptz, '2026-01-15T11:05:00Z'::timestamptz,
   'BLOQUEADO', 'exemplo: tela de tarefas abriu vazia, bloqueado ate corrigir'),
  ('tecnologia-publicar', NULL::uuid,
   '2026-01-15T12:00:00Z'::timestamptz, '2026-01-15T12:00:30Z'::timestamptz,
   'ERRO', 'exemplo: nao conseguiu falar com o repositorio')
) AS v(agente, tarefa_id, iniciado_em, terminado_em, veredito, resumo)
WHERE NOT EXISTS (SELECT 1 FROM public.execucoes_agente e WHERE e.resumo = v.resumo);

-- ---------------------------------------------------------------------------
-- 3 documentos publicados (persona, marca e dossie), com o hash do proprio texto
-- ---------------------------------------------------------------------------
INSERT INTO public.documentos_publicados (id, tipo, titulo, texto, resumo, caminho_origem, hash) VALUES
  ('00000000-0000-4000-8000-0000000000d1', 'persona', 'Exemplo: persona do cliente',
   'Dona Maria, 45 anos, tem uma padaria e quer vender mais sem trabalhar mais.', 'Cliente ideal de exemplo',
   'exemplo/persona.md',
   encode(sha256(convert_to('Dona Maria, 45 anos, tem uma padaria e quer vender mais sem trabalhar mais.', 'UTF8')), 'hex')),
  ('00000000-0000-4000-8000-0000000000d2', 'marca', 'Exemplo: manual da marca',
   'Tom de voz: simples, direto e gentil. Cores: as do tema.', 'Manual de marca de exemplo',
   'exemplo/marca.md',
   encode(sha256(convert_to('Tom de voz: simples, direto e gentil. Cores: as do tema.', 'UTF8')), 'hex')),
  ('00000000-0000-4000-8000-0000000000d3', 'dossie', 'Exemplo: dossiê da empresa',
   'Resumo da empresa: o que ela faz, para quem e por que importa. Texto de exemplo, troque pelo da sua empresa.', 'Dossiê de exemplo',
   'exemplo/dossie.md',
   encode(sha256(convert_to('Resumo da empresa: o que ela faz, para quem e por que importa. Texto de exemplo, troque pelo da sua empresa.', 'UTF8')), 'hex'))
ON CONFLICT DO NOTHING;

-- ---------------------------------------------------------------------------
-- 2 melhorias: 1 `proposta` e 1 levada proposta -> aprovada -> aplicada por
-- UPDATE com WHERE no status anterior (idempotente; o gatilho so aceita as arestas)
-- ---------------------------------------------------------------------------
INSERT INTO public.melhorias (id, origem, agente, titulo, regra_texto, justificativa) VALUES
  ('00000000-0000-4000-8000-0000000000f1', 'retrospectiva', 'tecnologia-publicar',
   'Exemplo: sempre conferir o branch antes do push', 'Antes de todo push, confirmar em qual branch esta.',
   'Evita push no lugar errado.'),
  ('00000000-0000-4000-8000-0000000000f2', 'vigilancia', NULL,
   'Exemplo: avisar quando o projeto ficar parado', 'Se o projeto passar 6 dias sem rodar, avisar o dono.',
   'O plano gratuito pausa projeto parado.')
ON CONFLICT DO NOTHING;

UPDATE public.melhorias
   SET status = 'aprovada',
       decidido_por = '00000000-0000-4000-8000-0000000000e1',
       decidido_em = '2026-01-16T09:00:00Z'
 WHERE id = '00000000-0000-4000-8000-0000000000f2' AND status = 'proposta';

UPDATE public.melhorias
   SET status = 'aplicada',
       aplicada_em = '2026-01-16T10:00:00Z',
       commit_sha = 'abc1234'
 WHERE id = '00000000-0000-4000-8000-0000000000f2' AND status = 'aprovada';

-- ---------------------------------------------------------------------------
-- 2 linhas de atividade (sem chave natural: WHERE NOT EXISTS pela descricao)
-- ---------------------------------------------------------------------------
INSERT INTO public.atividade (usuario_id, tipo, descricao)
SELECT v.usuario_id, v.tipo, v.descricao
FROM (VALUES
  ('00000000-0000-4000-8000-0000000000e1'::uuid, 'tarefa_criada', 'Exemplo: Equipe Exemplo criou uma tarefa'),
  (NULL::uuid, 'sistema', 'Exemplo: sistema de exemplo carregado')
) AS v(usuario_id, tipo, descricao)
WHERE NOT EXISTS (SELECT 1 FROM public.atividade a WHERE a.descricao = v.descricao);

-- ---------------------------------------------------------------------------
-- Onda 2A: campos novos de tarefa e um modelo de plano de exemplo (carga pela RPC,
-- idempotente por chave, versao e hash)
-- ---------------------------------------------------------------------------
UPDATE public.tarefas
   SET prazo = '2026-01-20', estimativa_min = 90, tipo = 'acao'
 WHERE id = '00000000-0000-4000-8000-0000000000b5' AND prazo IS NULL;

SELECT tarefas.carregar_modelo_plano(jsonb_build_object(
  'chave', 'exemplo-integracao', 'versao', 1,
  'titulo', 'Exemplo: integracao de colaborador',
  'descricao', 'Plano de exemplo de 30 dias para quem entra na empresa.',
  'caminho_origem', 'exemplo/planos/integracao.json',
  'hash', encode(sha256(convert_to('exemplo-integracao-v1', 'UTF8')), 'hex'),
  'etapas', jsonb_build_array(
    jsonb_build_object('chave', 'primeira-semana', 'ordem', 10, 'titulo', 'Primeira semana', 'inicio_dias', 0,
      'objetivo', 'Conhecer a empresa e ter os acessos.',
      'atividades', jsonb_build_array(
        jsonb_build_object('chave', 'acessos', 'ordem', 10, 'titulo', 'Pedir os acessos',
          'instrucao', 'Abra o chamado de acessos e acompanhe ate a confirmacao.',
          'comando', 'Quais acessos eu preciso pedir para o meu cargo?',
          'prova', 'Chamado fechado com os acessos', 'prazo_dias', 2, 'duracao_estimada_min', 30),
        jsonb_build_object('chave', 'conhecer-time', 'ordem', 20, 'titulo', 'Conhecer o time',
          'instrucao', 'Marque uma conversa curta com cada pessoa do time.',
          'prova', 'Agenda com as conversas marcadas', 'prazo_dias', 5, 'prazo_tipo', 'uteis',
          'duracao_estimada_min', 120, 'depende_de', 'acessos'))),
    jsonb_build_object('chave', 'primeiro-mes', 'ordem', 20, 'titulo', 'Primeiro mes', 'inicio_dias', 7,
      'objetivo', 'Entregar a primeira tarefa sozinho.',
      'atividades', jsonb_build_array(
        jsonb_build_object('chave', 'primeira-entrega', 'ordem', 10, 'titulo', 'Fazer a primeira entrega',
          'instrucao', 'Combine a tarefa com o gestor e entregue com a prova pedida.',
          'prova', 'Entrega aceita pelo gestor', 'prazo_dias', 30, 'duracao_estimada_min', 240,
          'executor_padrao', 'dupla', 'agente_padrao', 'polozi-gerente-de-trabalho'))))));

-- ---------------------------------------------------------------------------
-- Onda 2: nucleo comum. Tudo pelas funcoes publicas (como maquina), idempotente:
-- so cria a Parte de exemplo se ela ainda nao existe (pelo CPF/CNPJ de teste).
-- CPF 52998224725 e CNPJ 11222333000181 / 12ABC34501DE35 sao numeros de teste
-- conhecidos (DV valido), nao de pessoa real.
-- ---------------------------------------------------------------------------
DO $$
DECLARE
  v_cli bigint;
  v_forn bigint;
  v_mei bigint;
  v_cont bigint;
  v_prod bigint;
BEGIN
  SELECT parte_id INTO v_cli FROM public.parte_pessoa WHERE cpf = '52998224725';
  IF v_cli IS NULL THEN
    v_cli := public.parte_salvar_pessoa(NULL, 'Cliente Exemplo da Silva', 'Cliente Exemplo', '529.982.247-25', '1985-03-10');
    v_cont := public.contato_salvar(v_cli, 'email', 'cliente@exemplo.invalid', 'geral', true);
    PERFORM public.contato_salvar(v_cli, 'whatsapp', '+5511900000000', 'atendimento', true);
    PERFORM public.endereco_salvar(v_cli, 'Rua de Exemplo', 'Sao Paulo', '100', NULL, 'Centro', 'SP', '01001-000');
    PERFORM public.papel_parte_iniciar(v_cli, 'cliente', '2026-01-10');
    PERFORM public.consentimento_registrar(v_cli, 'email', 'marketing', 'concedido', 'consentimento', v_cont,
                                           'exemplo: formulario de inscricao');
    PERFORM public.documento_registrar('crm', 'contrato', 'contrato-exemplo.pdf', 'exemplo/contratos/contrato-exemplo.pdf',
                                       encode(sha256(convert_to('contrato-exemplo', 'UTF8')), 'hex'), v_cli, 1024, 'application/pdf');
  END IF;
  SELECT parte_id INTO v_forn FROM public.parte_organizacao WHERE cnpj = '11222333000181';
  IF v_forn IS NULL THEN
    v_forn := public.parte_salvar_organizacao(NULL, 'Fornecedor Exemplo Ltda', 'Fornecedor Exemplo', '11.222.333/0001-81', false);
    PERFORM public.papel_parte_iniciar(v_forn, 'fornecedor', '2026-01-05');
  END IF;
  SELECT parte_id INTO v_mei FROM public.parte_organizacao WHERE cnpj = '12ABC34501DE35';
  IF v_mei IS NULL THEN
    v_mei := public.parte_salvar_organizacao(NULL, 'Maria Exemplo MEI', 'Doces da Maria', '12.ABC.345/01DE-35', true);
    PERFORM public.papel_parte_iniciar(v_mei, 'lead', '2026-02-01');
  END IF;
  IF NOT EXISTS (SELECT 1 FROM public.produto WHERE codigo = 'produto-exemplo') THEN
    v_prod := public.produto_salvar('produto-exemplo', 'Produto de exemplo', 'Oferta de exemplo do catalogo');
    PERFORM public.produto_preco_definir(v_prod, 497.00, '2026-01-01');
  END IF;
END $$;

INSERT INTO public.calendario (rotulo, feriados)
VALUES ('padrao', '{2026-10-12,2026-11-02,2026-11-15,2026-11-20,2026-12-25}')
ON CONFLICT (rotulo) DO NOTHING;

INSERT INTO public.politica_sla (tipo_item, prioridade, calendario_id, primeira_resposta_min, resolucao_min)
SELECT 'atendimento', 'media', c.id, 60, 480 FROM public.calendario c
 WHERE c.rotulo = 'padrao'
   AND NOT EXISTS (SELECT 1 FROM public.politica_sla s WHERE s.tipo_item = 'atendimento' AND s.prioridade = 'media' AND s.ativa);

INSERT INTO public.campo_definicao (entidade, chave, rotulo, tipo, opcoes)
VALUES ('public.parte', 'segmento', 'Segmento', 'opcao', '["varejo", "servicos", "industria"]')
ON CONFLICT (entidade, chave) DO NOTHING;

-- Onda 2A (instancia): o plano de exemplo iniciado para o cliente de exemplo (servico,
-- idempotente por modelo + Parte + inicio)
SELECT tarefas.instanciar_plano_servico(m.id, '2026-01-12', p.parte_id)
  FROM tarefas.plano_modelo m, public.parte_pessoa p
 WHERE m.chave = 'exemplo-integracao' AND m.versao = 1 AND p.cpf = '52998224725';

-- 0017: uma conexao de exemplo, sem segredo (o seed nunca toca o Vault)
SELECT public.registrar_conexao('github', 'empresa-exemplo', 'repo', NULL, NULL, 'cto', '{github_secret}', NULL, 'ativo', '2026-01-15');
