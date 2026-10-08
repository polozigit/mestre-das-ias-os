-- 013_organograma.sql — 0019: schema `organograma` (19 tabelas da carga + posicao e posicao_ocupacao).
-- COMO usuario (nao como postgres): permissao e negacao. Cria os proprios usuarios dentro da
-- transacao e termina em ROLLBACK. Prova tambem os dois invariantes da ocupacao: pessoa E agente
-- ao mesmo tempo (CHECK, 23514) e duas ocupacoes vigentes sobrepostas (EXCLUDE, 23P01).
begin;
create extension if not exists pgtap with schema extensions;
set local search_path = public, extensions;

create or replace function pg_temp.visto_como(p_uid uuid, p_sql text)
returns text language plpgsql as $$
declare v text;
begin
  perform set_config('request.jwt.claim.sub', coalesce(p_uid::text, ''), true);
  perform set_config('request.jwt.claims',
    json_build_object('sub', p_uid, 'role', case when p_uid is null then 'anon' else 'authenticated' end)::text, true);
  execute 'set local role ' || case when p_uid is null then 'anon' else 'authenticated' end;
  begin
    execute p_sql into v;
  exception when others then
    v := 'ERRO:' || sqlstate;
  end;
  execute 'reset role';
  return v;
end $$;

create or replace function pg_temp.como_servico(p_sql text)
returns text language plpgsql as $$
declare v text;
begin
  execute 'set local role service_role';
  begin
    execute p_sql into v;
  exception when others then
    v := 'ERRO:' || sqlstate;
  end;
  execute 'reset role';
  return v;
end $$;

-- Payload de carga que toca as 19 tabelas de conteudo (o positivo de cada uma exige >= 1 linha).
create or replace function pg_temp.payload10() returns jsonb language sql as $j$
  select $json$ {
    "git_sha": "t10", "ambiente": "teste",
    "apqc": [{"codigo": "1.0", "nome_pt": "Desenvolver visao", "nome_en": "Develop vision"}],
    "areas": [{"slug": "t10-area", "titulo": "Area T10", "pai_cargo_slug": "t10-raiz", "time_total": 2, "ordem": 1,
               "interfaces": [{"titulo": "Com vendas", "nota": "semanal"}]}],
    "cargos": [
      {"slug": "t10-raiz", "tipo": "root", "titulo": "Raiz T10", "ordem": 0},
      {"slug": "t10-cargo", "tipo": "cargo", "titulo": "Cargo T10", "ordem": 1, "area_slug": "t10-area", "reporta_a_slug": "t10-raiz",
       "salarios": [{"cargo_pesquisado": "Analista", "nivel": "pleno", "minimo": 1, "mediana": 2, "maximo": 3, "fonte": "f", "auditoria": "ok"}],
       "referencias": ["ref 1"],
       "processos": [{"titulo": "Processo 1", "horas_mes": 4, "apqc": ["1.0"]}]}
    ],
    "pacotes": [{"slug": "t10-pacote", "cargo_slug": "t10-cargo", "versao": "1",
                 "secoes": [{"titulo": "Secao 1", "markdown": "texto"}],
                 "playbooks": [{"slug": "t10-pb", "processo": "Processo 1", "markdown": "passos",
                                "papeis": [{"cargo_slug": "t10-cargo", "papel": "executa"}]}]}],
    "workflows": [{"slug": "t10-w", "nome": "Workflow T10", "fonte": "teste",
                   "raias": [{"chave": "r1", "nome": "Raia 1", "cargo_slug": "t10-cargo"}],
                   "passos": [{"codigo": "p1", "passo": "Passo 1", "coluna": 0, "raias": ["r1"],
                               "playbooks": [{"pacote_slug": "t10-pacote", "slug": "t10-pb"}]}]}],
    "ondas": [{"codigo": "O1", "ordem": 1, "time": "t", "porque": "p", "depende": "-",
               "cargos": [{"texto": "Cargo T10", "cargo_slug": "t10-cargo"}]}],
    "documentos": [{"caminho": "t10/doc.md", "tipo": "frente", "titulo": "Doc T10", "markdown": "conteudo"}]
  } $json$::jsonb
$j$;

-- id da posicao `ordem` do cargo de teste (le como postgres; o SQL do usuario recebe o numero pronto)
create or replace function pg_temp.pid(p_ordem int) returns bigint language sql as $$
  select p.id from organograma.posicao p join organograma.org_cargo c on c.id = p.cargo_id
   where c.slug = 't10-cargo' and p.ordem = p_ordem
$$;

insert into auth.users (id, email) values
  ('abababab-0000-4000-8000-000000000001', 'leitor10@exemplo.invalid'),
  ('abababab-0000-4000-8000-000000000002', 'semperm10@exemplo.invalid'),
  ('abababab-0000-4000-8000-000000000003', 'gestor10@exemplo.invalid');
insert into public.usuarios (id, nome, email, auth_user_id) values
  ('abababab-1111-4000-8000-000000000001', 'Leitor 10', 'leitor10@exemplo.invalid', 'abababab-0000-4000-8000-000000000001'),
  ('abababab-1111-4000-8000-000000000002', 'Sem Permissao 10', 'semperm10@exemplo.invalid', 'abababab-0000-4000-8000-000000000002'),
  ('abababab-1111-4000-8000-000000000003', 'Gestor 10', 'gestor10@exemplo.invalid', 'abababab-0000-4000-8000-000000000003');
insert into public.usuarios_permissoes (usuario_id, permissao) values
  ('abababab-1111-4000-8000-000000000001', 'organograma.read'),
  ('abababab-1111-4000-8000-000000000002', 'agentes.read'),
  ('abababab-1111-4000-8000-000000000003', 'organograma.read'),
  ('abababab-1111-4000-8000-000000000003', 'organograma.manage'),
  ('abababab-1111-4000-8000-000000000003', 'agentes.read');

-- agentes e pessoa do nucleo que ocupam as posicoes de teste
insert into public.agentes (id, name, time, descricao_curta, descricao, sandbox, estado, estado_conferido_em) values
  ('abababab-aaaa-4000-8000-0000000000a1', 'agente-t10-a', 'teste', 'Agente A do teste 10', 'Agente A', 'read-only', 'instalado', now()),
  ('abababab-aaaa-4000-8000-0000000000a2', 'agente-t10-b', 'teste', 'Agente B do teste 10', 'Agente B', 'read-only', 'instalado', now());
create temp table _p10 as with i as (insert into public.parte (tipo) values ('pessoa') returning id) select id from i;

select plan(110);

-- GA-06 positivo: organograma.apqc_pcf, organograma.org_cargo, organograma.org_area, organograma.org_area_interface, organograma.org_cargo_salario, organograma.org_cargo_referencia, organograma.org_processo, organograma.org_pacote, organograma.org_pacote_secao, organograma.org_playbook, organograma.org_cargo_playbook, organograma.org_workflow, organograma.org_workflow_raia, organograma.org_workflow_passo, organograma.org_workflow_passo_playbook, organograma.org_onda, organograma.org_onda_cargo, organograma.org_documento, organograma.org_carga, organograma.posicao, organograma.posicao_ocupacao
-- GA-06 negacao: organograma.apqc_pcf, organograma.org_cargo, organograma.org_area, organograma.org_area_interface, organograma.org_cargo_salario, organograma.org_cargo_referencia, organograma.org_processo, organograma.org_pacote, organograma.org_pacote_secao, organograma.org_playbook, organograma.org_cargo_playbook, organograma.org_workflow, organograma.org_workflow_raia, organograma.org_workflow_passo, organograma.org_workflow_passo_playbook, organograma.org_onda, organograma.org_onda_cargo, organograma.org_documento, organograma.org_carga, organograma.posicao, organograma.posicao_ocupacao

-- ---- 1) schema e as 21 tabelas ----
select has_schema('organograma', 'schema organograma existe');
select has_table('organograma', t, 'organograma.' || t || ' existe')
  from unnest(array['apqc_pcf', 'org_cargo', 'org_area', 'org_area_interface', 'org_cargo_salario', 'org_cargo_referencia',
    'org_processo', 'org_pacote', 'org_pacote_secao', 'org_playbook', 'org_cargo_playbook', 'org_workflow',
    'org_workflow_raia', 'org_workflow_passo', 'org_workflow_passo_playbook', 'org_onda', 'org_onda_cargo',
    'org_documento', 'org_carga', 'posicao', 'posicao_ocupacao']) as t;

-- ---- 2) privilegio da carga (nao CHAMA como authenticated: signal 11 nesta imagem) ----
select is(has_function_privilege('service_role', 'organograma.carregar(jsonb)', 'EXECUTE'), true,
  'service_role executa organograma.carregar');
select is(has_function_privilege('authenticated', 'organograma.carregar(jsonb)', 'EXECUTE'), false,
  'authenticated nao executa organograma.carregar');
select is(has_function_privilege('anon', 'organograma.carregar(jsonb)', 'EXECUTE'), false,
  'anon nao executa organograma.carregar');

-- ---- 3) carga pelo servico, leitura por permissao ----
select ok(pg_temp.como_servico(format('select organograma.carregar(%L::jsonb)::text', pg_temp.payload10()))
  like '%"cargos": 2%', 'servico carrega o payload (devolve as contagens: 2 cargos)');
select is(pg_temp.como_servico($$ select organograma.carregar('{"cargos": []}'::jsonb)::text $$),
  'ERRO:P0001', 'payload sem raiz e recusado (nao esvazia o catalogo)');
select cmp_ok(pg_temp.visto_como('abababab-0000-4000-8000-000000000001', 'select count(*)::text from organograma.v_org_no')::int,
  '>=', 3, 'organograma.read ve v_org_no (raiz, cargo e area da carga)');
select is(pg_temp.visto_como('abababab-0000-4000-8000-000000000002', 'select count(*)::text from organograma.v_org_no'),
  '0', 'sem organograma.read v_org_no vem vazia');

-- ---- 4) posicao automatica e idempotencia ----
select is((select count(*)::text from organograma.posicao where cargo_id = (select id from organograma.org_cargo where slug = 't10-cargo')),
  '1', 'a carga cria 1 posicao para o cargo comum');
select is((select count(*)::text from organograma.posicao where cargo_id = (select id from organograma.org_cargo where slug = 't10-raiz')),
  '0', 'a raiz nao ganha posicao (so tipo = cargo)');
select ok(pg_temp.como_servico(format('select organograma.carregar(%L::jsonb)::text', pg_temp.payload10()))
  like '%"cargos": 2%', 'segunda carga igual roda sem erro');
select is((select count(*)::text from organograma.posicao where cargo_id = (select id from organograma.org_cargo where slug = 't10-cargo')),
  '1', 'segunda carga igual nao cria outra posicao (idempotente)');

-- posicoes de teste do cargo (ordem 1..6) e suas ocupacoes
insert into organograma.posicao (cargo_id, ordem)
  select (select id from organograma.org_cargo where slug = 't10-cargo'), n from generate_series(1, 6) n;
insert into organograma.posicao_ocupacao (posicao_id, agente_id, vigente_de) values
  (pg_temp.pid(1), 'abababab-aaaa-4000-8000-0000000000a1', current_date - 10);                     -- agente vigente, em aberto
insert into organograma.posicao_ocupacao (posicao_id, parte_id, vigente_de) values
  (pg_temp.pid(2), (select id from _p10), current_date - 10);                                        -- pessoa vigente
insert into organograma.posicao_ocupacao (posicao_id, agente_id, vigente_de, vigente_ate) values
  (pg_temp.pid(4), 'abababab-aaaa-4000-8000-0000000000a1', current_date - 30, current_date - 1);    -- encerrada ontem
insert into organograma.posicao_ocupacao (posicao_id, agente_id, vigente_de) values
  (pg_temp.pid(5), 'abababab-aaaa-4000-8000-0000000000a1', current_date + 5);                       -- comeca no futuro
insert into organograma.posicao_ocupacao (posicao_id, agente_id, vigente_de, vigente_ate) values
  (pg_temp.pid(6), 'abababab-aaaa-4000-8000-0000000000a1', date '2020-01-01', date '2020-01-31');   -- janela passada

-- ---- 5) COM permissao: cada tabela mostra linhas (pega "tela vazia sem erro") ----
select cmp_ok(pg_temp.visto_como('abababab-0000-4000-8000-000000000001', format('select count(*)::text from organograma.%I', t))::int,
  '>=', 1, 'organograma.read ve organograma.' || t)
  from unnest(array['apqc_pcf', 'org_cargo', 'org_area', 'org_area_interface', 'org_cargo_salario', 'org_cargo_referencia',
    'org_processo', 'org_pacote', 'org_pacote_secao', 'org_playbook', 'org_cargo_playbook', 'org_workflow',
    'org_workflow_raia', 'org_workflow_passo', 'org_workflow_passo_playbook', 'org_onda', 'org_onda_cargo',
    'org_documento', 'org_carga', 'posicao', 'posicao_ocupacao']) as t;

-- ---- 6) SEM permissao: 0 linhas ----
select is(pg_temp.visto_como('abababab-0000-4000-8000-000000000002', format('select count(*)::text from organograma.%I', t)),
  '0', 'sem organograma.read ve 0 em organograma.' || t)
  from unnest(array['apqc_pcf', 'org_cargo', 'org_area', 'org_area_interface', 'org_cargo_salario', 'org_cargo_referencia',
    'org_processo', 'org_pacote', 'org_pacote_secao', 'org_playbook', 'org_cargo_playbook', 'org_workflow',
    'org_workflow_raia', 'org_workflow_passo', 'org_workflow_passo_playbook', 'org_onda', 'org_onda_cargo',
    'org_documento', 'org_carga', 'posicao', 'posicao_ocupacao']) as t;

-- ---- 7) Review Focus 5: pessoa E agente, ocupacoes sobrepostas ----
select throws_ok(format($q$ insert into organograma.posicao_ocupacao (posicao_id, parte_id, agente_id)
    values (%s, %s, 'abababab-aaaa-4000-8000-0000000000a2') $q$, pg_temp.pid(3), (select id from _p10)),
  '23514', null, 'pessoa E agente na mesma ocupacao e recusado (CHECK)');
select throws_ok(format($q$ insert into organograma.posicao_ocupacao (posicao_id, agente_id, vigente_de)
    values (%s, 'abababab-aaaa-4000-8000-0000000000a2', current_date) $q$, pg_temp.pid(1)),
  '23P01', null, 'segundo agente vigente sobreposto na mesma posicao e recusado (EXCLUDE)');
select throws_ok(format($q$ insert into organograma.posicao_ocupacao (posicao_id, parte_id, vigente_de)
    values (%s, %s, current_date) $q$, pg_temp.pid(1), (select id from _p10)),
  '23P01', null, 'pessoa vigente sobreposta ao agente que ja ocupa a posicao e recusada (EXCLUDE)');
select throws_ok(format($q$ insert into organograma.posicao_ocupacao (posicao_id, parte_id, vigente_de)
    values (%s, %s, date '2020-01-31') $q$, pg_temp.pid(6), (select id from _p10)),
  '23P01', null, 'comecar no ultimo dia da ocupacao anterior sobrepoe (intervalo fechado)');
select lives_ok(format($q$ insert into organograma.posicao_ocupacao (posicao_id, parte_id, vigente_de)
    values (%s, %s, date '2020-02-01') $q$, pg_temp.pid(6), (select id from _p10)),
  'comecar no dia seguinte ao fim da ocupacao anterior e aceito');
select throws_ok(format($q$ insert into organograma.posicao_ocupacao (posicao_id, agente_id, vigente_de, vigente_ate)
    values (%s, 'abababab-aaaa-4000-8000-0000000000a2', current_date, current_date - 1) $q$, pg_temp.pid(3)),
  '23514', null, 'vigente_ate antes de vigente_de e recusado');

-- ---- 8) escrita pela tela: so organograma.manage ----
select is(pg_temp.visto_como('abababab-0000-4000-8000-000000000001', format(
  $q$ insert into organograma.posicao_ocupacao (posicao_id, agente_id) values (%s, 'abababab-aaaa-4000-8000-0000000000a2') returning 'ok' $q$, pg_temp.pid(3))),
  'ERRO:42501', 'so organograma.read nao insere ocupacao (RLS)');
select is(pg_temp.visto_como('abababab-0000-4000-8000-000000000001', format(
  $q$ update organograma.posicao_ocupacao set vigente_ate = current_date where posicao_id = %s returning 'ok' $q$, pg_temp.pid(1))),
  null, 'so organograma.read nao encerra ocupacao: nenhuma linha atualizada');
select is(pg_temp.visto_como('abababab-0000-4000-8000-000000000001',
  $q$ insert into organograma.posicao (cargo_id, ordem) select id, 9 from organograma.org_cargo where slug = 't10-cargo' returning 'ok' $q$),
  'ERRO:42501', 'so organograma.read nao cria posicao (RLS)');
select is(pg_temp.visto_como('abababab-0000-4000-8000-000000000003', format(
  $q$ insert into organograma.posicao_ocupacao (posicao_id, agente_id, vigente_de) values (%s, 'abababab-aaaa-4000-8000-0000000000a2', current_date - 5) returning 'ok' $q$, pg_temp.pid(3))),
  'ok', 'organograma.manage aloca agente numa posicao vazia');
select is(pg_temp.visto_como('abababab-0000-4000-8000-000000000003', format(
  $q$ update organograma.posicao_ocupacao set vigente_ate = current_date - 1 where posicao_id = %s returning 'ok' $q$, pg_temp.pid(3))),
  'ok', 'organograma.manage encerra a ocupacao por UPDATE de vigente_ate');
select is(pg_temp.visto_como('abababab-0000-4000-8000-000000000003', format(
  $q$ insert into organograma.posicao_ocupacao (posicao_id, parte_id, agente_id, vigente_de) values (%s, %s, 'abababab-aaaa-4000-8000-0000000000a2', date '2021-01-01') returning 'ok' $q$,
  pg_temp.pid(3), (select id from _p10))),
  'ERRO:23514', 'pela tela tambem: pessoa E agente juntos e recusado');
select is(pg_temp.visto_como('abababab-0000-4000-8000-000000000003', format(
  $q$ insert into organograma.posicao_ocupacao (posicao_id, agente_id, vigente_de) values (%s, 'abababab-aaaa-4000-8000-0000000000a2', current_date) returning 'ok' $q$, pg_temp.pid(1))),
  'ERRO:23P01', 'pela tela tambem: ocupacao vigente sobreposta e recusada');
select is(pg_temp.visto_como('abababab-0000-4000-8000-000000000003',
  $q$ insert into organograma.posicao (cargo_id, ordem, estado) select id, 8, 'inexistente' from organograma.org_cargo where slug = 't10-cargo' returning 'ok' $q$),
  'ERRO:23514', 'estado de posicao fora da lista e recusado');

-- ---- 9) nem o gestor apaga (GA-16): encerra-se por UPDATE ----
select is(has_table_privilege('authenticated', 'organograma.posicao_ocupacao', 'DELETE'), false,
  'authenticated nao tem DELETE em posicao_ocupacao');
select is(has_table_privilege('authenticated', 'organograma.posicao', 'DELETE'), false,
  'authenticated nao tem DELETE em posicao');
select is(pg_temp.visto_como('abababab-0000-4000-8000-000000000003', format(
  $q$ delete from organograma.posicao_ocupacao where posicao_id = %s returning 'ok' $q$, pg_temp.pid(1))),
  'ERRO:42501', 'nem organograma.manage apaga ocupacao');
select is(has_table_privilege('authenticated', 'organograma.org_cargo', 'INSERT,UPDATE,DELETE'), false,
  'authenticated nao escreve no conteudo do organograma (so a carga)');

-- ---- 10) v_posicao_ocupante: so a ocupacao vigente ----
select is(pg_temp.visto_como('abababab-0000-4000-8000-000000000003', format(
  'select ocupante_tipo from organograma.v_posicao_ocupante where posicao_id = %s', pg_temp.pid(1))),
  'agente', 'ocupacao vigente por agente aparece como agente');
select is(pg_temp.visto_como('abababab-0000-4000-8000-000000000003', format(
  'select agente_name from organograma.v_posicao_ocupante where posicao_id = %s', pg_temp.pid(1))),
  'agente-t10-a', 'quem tambem le agentes ve o nome do agente');
select is(pg_temp.visto_como('abababab-0000-4000-8000-000000000003', format(
  'select ocupante_tipo from organograma.v_posicao_ocupante where posicao_id = %s', pg_temp.pid(2))),
  'pessoa', 'ocupacao vigente por pessoa aparece como pessoa');
select is(pg_temp.visto_como('abababab-0000-4000-8000-000000000003', format(
  'select ocupante_tipo from organograma.v_posicao_ocupante where posicao_id = %s', pg_temp.pid(3))),
  'vazio', 'posicao sem ocupacao vigente aparece como vazio (a ocupacao que o gestor encerrou por UPDATE no teste 8 nao conta mais)');
select is(pg_temp.visto_como('abababab-0000-4000-8000-000000000003', format(
  'select ocupante_tipo from organograma.v_posicao_ocupante where posicao_id = %s', pg_temp.pid(4))),
  'vazio', 'ocupacao que terminou ontem nao conta');
select is(pg_temp.visto_como('abababab-0000-4000-8000-000000000003', format(
  'select ocupante_tipo from organograma.v_posicao_ocupante where posicao_id = %s', pg_temp.pid(5))),
  'vazio', 'ocupacao que so comeca no futuro nao conta');
select is(pg_temp.visto_como('abababab-0000-4000-8000-000000000003', format(
  'select ocupante_tipo from organograma.v_posicao_ocupante where posicao_id = %s', pg_temp.pid(0))),
  'vazio', 'posicao criada pela carga, ainda sem ocupante, aparece como vazio');
select is(pg_temp.visto_como('abababab-0000-4000-8000-000000000001', format(
  'select ocupante_tipo || coalesce(agente_name, ''-sem-nome'') from organograma.v_posicao_ocupante where posicao_id = %s', pg_temp.pid(1))),
  'agente-sem-nome', 'a view respeita quem chama: sem agentes.read o nome do agente nao aparece');
select is(pg_temp.visto_como('abababab-0000-4000-8000-000000000002', 'select count(*)::text from organograma.v_posicao_ocupante'),
  '0', 'sem organograma.read a view de ocupantes vem vazia');

-- ---- 11) recarga nao apaga historico de ocupacao (0019: FK RESTRICT + excecao clara) ----
create or replace function pg_temp.erro_servico(p_sql text)
returns text language plpgsql as $$
declare v text;
begin
  execute 'set local role service_role';
  begin
    execute p_sql;
    v := 'sem-erro';
  exception when others then
    v := sqlstate || ':' || sqlerrm;
  end;
  execute 'reset role';
  return v;
end $$;

create temp table _ocup10 as select count(*) as n from organograma.posicao_ocupacao;
create temp table _pos10 as select count(*) as n from organograma.posicao;

-- cargo sem ocupacao: entra na carga, ganha a posicao 0 e, ao sumir do payload, leva a posicao junto
select ok(pg_temp.como_servico(format('select organograma.carregar(%L::jsonb)::text',
  jsonb_set(pg_temp.payload10(), '{cargos}', (pg_temp.payload10()->'cargos') ||
    '[{"slug": "t10-efemero", "tipo": "cargo", "titulo": "Efemero T10", "ordem": 2, "reporta_a_slug": "t10-raiz"}]'::jsonb)))
  like '%"cargos": 3%', 'carga com um cargo a mais (sem ocupacao) roda');
select is((select count(*)::text from organograma.posicao p join organograma.org_cargo c on c.id = p.cargo_id where c.slug = 't10-efemero'),
  '1', 'o cargo novo ganhou a posicao 0');
select ok(pg_temp.como_servico(format('select organograma.carregar(%L::jsonb)::text', pg_temp.payload10()))
  like '%"cargos": 2%', 'recarga sem o cargo sem ocupacao roda');
select is((select count(*)::text from organograma.org_cargo where slug = 't10-efemero'),
  '0', 'cargo sem ocupacao que sumiu do payload foi apagado');
select is((select count(*)::text from organograma.posicao), (select (n + 0)::text from _pos10),
  'a posicao do cargo apagado sumiu junto (CASCADE de cargo para posicao); as demais ficaram');

-- a FK e RESTRICT: nem o dono da tabela apaga posicao que tem ocupacao (nao depende da checagem da carga)
select throws_ok(format('delete from organograma.posicao where id = %s', pg_temp.pid(1)),
  '23503', null, 'apagar posicao com ocupacao e barrado pela FK (RESTRICT)');

-- cargo com ocupacao: a recarga sem ele falha com a mensagem clara e nada some
select is(pg_temp.erro_servico($q$ select organograma.carregar('{"git_sha": "t", "ambiente": "t",
    "cargos": [{"slug": "t10-raiz", "tipo": "root", "titulo": "Raiz T10", "ordem": 0}]}'::jsonb) $q$),
  'P0001:organograma.carregar: cargo t10-cargo tem historico de ocupacao; mova ou encerre antes de recarregar',
  'recarga sem cargo que tem historico de ocupacao falha com mensagem clara');
select is((select count(*)::text from organograma.posicao_ocupacao), (select n::text from _ocup10),
  'o historico de ocupacao ficou intacto depois da recarga recusada');

select * from finish();
rollback;
