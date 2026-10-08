-- 006_tarefas_plano_modelo.sql — onda 2A (0014): campos novos de public.tarefas e o
-- modelo de plano (plano_modelo, plano_etapa_modelo, plano_atividade_modelo).
-- COMO usuario (nao como postgres): permissao e negacao. Cria os proprios usuarios
-- dentro da transacao e termina em ROLLBACK.
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

insert into auth.users (id, email) values
  ('cccccccc-0000-4000-8000-000000000001', 'leitor6@exemplo.invalid'),
  ('cccccccc-0000-4000-8000-000000000002', 'semperm6@exemplo.invalid'),
  ('cccccccc-0000-4000-8000-000000000003', 'escritor6@exemplo.invalid');
insert into public.usuarios (id, nome, email, auth_user_id) values
  ('cccccccc-1111-4000-8000-000000000001', 'Leitor 6', 'leitor6@exemplo.invalid', 'cccccccc-0000-4000-8000-000000000001'),
  ('cccccccc-1111-4000-8000-000000000002', 'Sem Permissao 6', 'semperm6@exemplo.invalid', 'cccccccc-0000-4000-8000-000000000002'),
  ('cccccccc-1111-4000-8000-000000000003', 'Escritor 6', 'escritor6@exemplo.invalid', 'cccccccc-0000-4000-8000-000000000003');
insert into public.usuarios_permissoes (usuario_id, permissao) values
  ('cccccccc-1111-4000-8000-000000000001', 'tarefas.read'),
  ('cccccccc-1111-4000-8000-000000000002', 'agentes.read'),
  ('cccccccc-1111-4000-8000-000000000003', 'tarefas.read'),
  ('cccccccc-1111-4000-8000-000000000003', 'tarefas.write'),
  ('cccccccc-1111-4000-8000-000000000003', 'tarefas.manage');

select plan(35);

-- ---- COM permissao: o seed aparece (pega "tela vazia sem erro") ----
-- GA-06 positivo: tarefas.plano_modelo, tarefas.plano_etapa_modelo, tarefas.plano_atividade_modelo
select cmp_ok(
  pg_temp.visto_como('cccccccc-0000-4000-8000-000000000001', format('select count(*)::text from tarefas.%I', t))::int,
  '>=', 1, 'tarefas.read ve tarefas.' || t)
  from unnest(array['plano_modelo', 'plano_etapa_modelo', 'plano_atividade_modelo']) as t;
select cmp_ok(pg_temp.visto_como('cccccccc-0000-4000-8000-000000000003',
  'select count(*)::text from tarefas.plano_atividade_modelo')::int, '>=', 3,
  'quem tambem escreve e gerencia tarefas ve as 3 atividades do exemplo');

-- ---- SEM permissao: 0 linhas ----
-- GA-06 negacao: tarefas.plano_modelo, tarefas.plano_etapa_modelo, tarefas.plano_atividade_modelo
select is(
  pg_temp.visto_como('cccccccc-0000-4000-8000-000000000002', format('select count(*)::text from tarefas.%I', t)),
  '0', 'sem tarefas.read ve 0 em tarefas.' || t)
  from unnest(array['plano_modelo', 'plano_etapa_modelo', 'plano_atividade_modelo']) as t;

-- ---- ninguem da tela escreve no modelo (nem com tarefas.write e tarefas.manage) ----
select is(pg_temp.visto_como('cccccccc-0000-4000-8000-000000000003',
  $$ insert into tarefas.plano_modelo (chave, versao, titulo, caminho_origem, hash)
     values ('via-tela', 1, 'x', 'x.json', repeat('c', 64)) returning 'ok' $$),
  'ERRO:42501', 'authenticated nao insere plano_modelo');
select is(pg_temp.visto_como('cccccccc-0000-4000-8000-000000000003',
  $$ update tarefas.plano_atividade_modelo set instrucao = 'trocada pela tela' returning 'ok' $$),
  'ERRO:42501', 'authenticated nao altera a instrucao do modelo');
select is(pg_temp.visto_como('cccccccc-0000-4000-8000-000000000003',
  $$ delete from tarefas.plano_etapa_modelo returning 'ok' $$),
  'ERRO:42501', 'authenticated nao apaga etapa do modelo');
-- (nao CHAMA a funcao como authenticated: na imagem supabase/postgres:17.6.1.106 chamar funcao sem
--  EXECUTE derruba o servidor, signal 11; o privilegio se confere no catalogo)
select is(has_function_privilege('authenticated', 'tarefas.carregar_modelo_plano(jsonb)', 'EXECUTE')
       or has_function_privilege('anon', 'tarefas.carregar_modelo_plano(jsonb)', 'EXECUTE'),
  false, 'authenticated e anon nao executam a carga do modelo (so o servico)');
select is(has_function_privilege('service_role', 'tarefas.carregar_modelo_plano(jsonb)', 'EXECUTE'),
  true, 'service_role executa a carga do modelo');

-- ---- Carga pelo servico: modelo, instrucao x comando, prazo relativo, elo com a aula ----
select ok(pg_temp.como_servico($$ select tarefas.carregar_modelo_plano(jsonb_build_object(
    'chave', 'plano-teste6', 'versao', 1, 'titulo', 'Plano de teste', 'caminho_origem', 'teste/plano.json',
    'hash', repeat('d', 64),
    'etapas', jsonb_build_array(jsonb_build_object('chave', 'e1', 'ordem', 1, 'titulo', 'Etapa 1',
      'trilha', 'curso', 'fase', 'D1', 'inicio_dias', 0,
      'atividades', jsonb_build_array(
        jsonb_build_object('chave', 'a1', 'ordem', 1, 'titulo', 'Atividade 1',
          'instrucao', 'Siga a aula e anote o resultado.', 'comando', 'Cole isto no chat',
          'prazo_dias', 3, 'prazo_tipo', 'uteis', 'aula_ref', 'curso.aula.d1-01', 'artigo_ref', 'conhecimento.artigo.d1-01',
          'duracao_estimada_min', 45),
        jsonb_build_object('chave', 'a2', 'ordem', 2, 'titulo', 'Atividade 2', 'instrucao', 'Depois da 1.', 'depende_de', 'a1'),
        jsonb_build_object('chave', 'a3', 'ordem', 3, 'titulo', 'Atividade 3', 'instrucao', 'Depois da 2.', 'depende_de', 'a2'))))))::text $$) ~ '^[0-9]+$',
  'servico carrega o modelo (devolve o id)');
select is(pg_temp.como_servico($$ select instrucao || ' | ' || comando from tarefas.plano_atividade_modelo where chave = 'a1'
   and etapa_id in (select id from tarefas.plano_etapa_modelo where modelo_id in (select id from tarefas.plano_modelo where chave = 'plano-teste6')) $$),
  'Siga a aula e anote o resultado. | Cole isto no chat', 'instrucao e comando ficam em campos separados');
select is(pg_temp.como_servico($$ select prazo_dias::text || '/' || prazo_tipo || '/' || aula_ref || '/' || artigo_ref from tarefas.plano_atividade_modelo where chave = 'a1'
   and etapa_id in (select id from tarefas.plano_etapa_modelo where modelo_id in (select id from tarefas.plano_modelo where chave = 'plano-teste6')) $$),
  '3/uteis/curso.aula.d1-01/conhecimento.artigo.d1-01', 'prazo_dias relativo, tipo do prazo e elo com a aula/artigo (sem FK) ficam gravados');
select is(pg_temp.como_servico($$ select (a2.depende_de_id = a1.id)::text from tarefas.plano_atividade_modelo a1, tarefas.plano_atividade_modelo a2
   where a1.chave = 'a1' and a2.chave = 'a2' and a1.etapa_id = a2.etapa_id
     and a1.etapa_id in (select id from tarefas.plano_etapa_modelo where modelo_id in (select id from tarefas.plano_modelo where chave = 'plano-teste6')) $$),
  'true', 'depende_de chega por chave e vira FK');
select is(pg_temp.como_servico($$ select (a3.depende_de_id = a2.id)::text from tarefas.plano_atividade_modelo a2, tarefas.plano_atividade_modelo a3
   where a2.chave = 'a2' and a3.chave = 'a3' and a2.etapa_id = a3.etapa_id
     and a2.etapa_id in (select id from tarefas.plano_etapa_modelo where modelo_id in (select id from tarefas.plano_modelo where chave = 'plano-teste6')) $$),
  'true', 'depende_de resolve a chave certa (a3 -> a2, nao a primeira atividade)');
select is(pg_temp.como_servico($$ select (select tarefas.carregar_modelo_plano(m.m) from (select jsonb_build_object(
    'chave', 'plano-teste6', 'versao', 1, 'titulo', 'Plano de teste', 'caminho_origem', 'teste/plano.json',
    'hash', repeat('d', 64), 'etapas', (select jsonb_agg(x) from (select jsonb_build_object('chave', 'e1', 'ordem', 1, 'titulo', 'Etapa 1', 'trilha', 'curso', 'fase', 'D1') x) q)) as m) m)::text
   = (select id::text from tarefas.plano_modelo where chave = 'plano-teste6') $$),
  'true', 'recarregar a mesma versao e o mesmo hash devolve o mesmo modelo (idempotente)');
select is(pg_temp.como_servico($$ select count(*)::text from tarefas.plano_modelo where chave = 'plano-teste6' $$),
  '1', 'recarga nao duplicou o modelo');
select is(pg_temp.como_servico($$ select tarefas.carregar_modelo_plano(jsonb_build_object(
    'chave', 'plano-teste6', 'versao', 1, 'titulo', 'Plano de teste', 'caminho_origem', 'teste/plano.json',
    'hash', repeat('e', 64), 'etapas', jsonb_build_array(jsonb_build_object('chave', 'e1', 'ordem', 1, 'titulo', 'x'))))::text $$),
  'ERRO:P0001', 'mesma versao com outro hash e recusada (versao carregada nao muda)');
select is(pg_temp.como_servico($$ select tarefas.carregar_modelo_plano(jsonb_build_object(
    'chave', 'plano-ruim-fase', 'versao', 1, 'titulo', 'x', 'caminho_origem', 'x.json', 'hash', repeat('f', 64),
    'etapas', jsonb_build_array(jsonb_build_object('chave', 'e1', 'ordem', 1, 'titulo', 'x', 'trilha', 'curso', 'fase', 'clareza',
      'atividades', jsonb_build_array(jsonb_build_object('chave', 'a', 'ordem', 1, 'titulo', 'x', 'instrucao', 'x'))))))::text $$),
  'ERRO:23514', 'etapa de trilha curso com fase de plano90 e recusada (mesmo contrato da spec v2)');
select is(pg_temp.como_servico($$ select tarefas.carregar_modelo_plano(jsonb_build_object(
    'chave', 'plano-sem-instrucao', 'versao', 1, 'titulo', 'x', 'caminho_origem', 'x.json', 'hash', repeat('1', 64),
    'etapas', jsonb_build_array(jsonb_build_object('chave', 'e1', 'ordem', 1, 'titulo', 'x',
      'atividades', jsonb_build_array(jsonb_build_object('chave', 'a', 'ordem', 1, 'titulo', 'x'))))))::text $$),
  'ERRO:23502', 'atividade sem instrucao e recusada');
select is(pg_temp.como_servico($$ select tarefas.carregar_modelo_plano(jsonb_build_object(
    'chave', 'plano-dep-fantasma', 'versao', 1, 'titulo', 'x', 'caminho_origem', 'x.json', 'hash', repeat('2', 64),
    'etapas', jsonb_build_array(jsonb_build_object('chave', 'e1', 'ordem', 1, 'titulo', 'x',
      'atividades', jsonb_build_array(jsonb_build_object('chave', 'a', 'ordem', 1, 'titulo', 'x', 'instrucao', 'x', 'depende_de', 'nao-existe'))))))::text $$),
  'ERRO:P0001', 'depende_de que nao existe no modelo e recusado');
select is(pg_temp.como_servico($$ select tarefas.carregar_modelo_plano(jsonb_build_object(
    'chave', 'plano-agente-fantasma', 'versao', 1, 'titulo', 'x', 'caminho_origem', 'x.json', 'hash', repeat('3', 64),
    'etapas', jsonb_build_array(jsonb_build_object('chave', 'e1', 'ordem', 1, 'titulo', 'x',
      'atividades', jsonb_build_array(jsonb_build_object('chave', 'a', 'ordem', 1, 'titulo', 'x', 'instrucao', 'x',
        'executor_padrao', 'agente', 'agente_padrao', 'agente-que-nao-existe'))))))::text $$),
  'ERRO:P0001', 'agente padrao que nao existe em public.agentes e recusado');
select is(pg_temp.como_servico($$ select count(*)::text from tarefas.plano_modelo where chave in ('plano-ruim-fase', 'plano-sem-instrucao', 'plano-dep-fantasma', 'plano-agente-fantasma') $$),
  '0', 'carga que falha nao deixa modelo pela metade (tudo ou nada)');

-- ---- dependencia circular (gatilho) ----
select throws_ok($$ update tarefas.plano_atividade_modelo set depende_de_id = (select id from tarefas.plano_atividade_modelo where chave = 'a2'
    and etapa_id in (select id from tarefas.plano_etapa_modelo where modelo_id in (select id from tarefas.plano_modelo where chave = 'plano-teste6')))
  where chave = 'a1' and etapa_id in (select id from tarefas.plano_etapa_modelo where modelo_id in (select id from tarefas.plano_modelo where chave = 'plano-teste6')) $$,
  'P0001', null, 'dependencia circular entre atividades e recusada');

select throws_ok($$ update tarefas.plano_atividade_modelo set depende_de_id = (select a.id from tarefas.plano_atividade_modelo a
    join tarefas.plano_etapa_modelo e on e.id = a.etapa_id join tarefas.plano_modelo m on m.id = e.modelo_id where m.chave = 'exemplo-integracao' limit 1)
  where chave = 'a1' and etapa_id in (select id from tarefas.plano_etapa_modelo where modelo_id in (select id from tarefas.plano_modelo where chave = 'plano-teste6')) $$,
  'P0001', null, 'dependencia entre atividades de modelos diferentes e recusada');

-- ---- public.tarefas: colunas novas (tipo, prazo, projeto, origem, estimativa) ----
select is(pg_temp.visto_como('cccccccc-0000-4000-8000-000000000003',
  $$ update public.tarefas set prazo = '2026-12-31', estimativa_min = 120, tipo = 'chamado', projeto_ref = 7
      where id = '00000000-0000-4000-8000-0000000000b5' returning 'ok' $$),
  'ok', 'quem tem tarefas.write edita prazo, estimativa, tipo e projeto da tarefa');
select is(pg_temp.visto_como('cccccccc-0000-4000-8000-000000000001',
  $$ update public.tarefas set prazo = '2026-12-31' where id = '00000000-0000-4000-8000-0000000000b5' returning 'ok' $$),
  null, 'leitor (sem tarefas.write) nao edita o prazo: nenhuma linha atualizada');
select is(pg_temp.visto_como('cccccccc-0000-4000-8000-000000000003',
  $$ update public.tarefas set origem_tipo = 'chat' where id = '00000000-0000-4000-8000-0000000000b5' returning 'ok' $$),
  'ERRO:42501', 'a origem nao e editavel pela tela');
select is(pg_temp.visto_como('cccccccc-0000-4000-8000-000000000003',
  $$ insert into public.tarefas (titulo, estimativa_min) values ('estimativa zero', 0) returning 'ok' $$),
  'ERRO:23514', 'estimativa de 0 minuto e recusada');
select is(pg_temp.visto_como('cccccccc-0000-4000-8000-000000000003',
  $$ insert into public.tarefas (titulo, origem_ref) values ('origem sem tipo', 'http://x') returning 'ok' $$),
  'ERRO:23514', 'origem_ref sem origem_tipo e recusada');
select is(pg_temp.visto_como('cccccccc-0000-4000-8000-000000000003',
  $$ insert into public.tarefas (titulo, origem_tipo, origem_ref, estimativa_min, prazo)
     values ('tarefa vinda do chat', 'chat', 'https://exemplo.invalid/chat/1', 30, '2026-11-01') returning 'ok' $$),
  'ok', 'tarefa nascida do chat guarda origem_tipo/origem_ref (ADR-017), estimativa e prazo');

-- ---- outbox/inbox do schema tarefas no padrao ----
select is((select count(*)::int from information_schema.columns
            where table_schema = 'tarefas' and table_name = 'outbox'
              and column_name in ('id', 'tipo', 'versao', 'correlacao', 'payload', 'criada_em', 'publicada_em')),
  7, 'tarefas.outbox tem as 7 colunas do padrao');
select is(has_table_privilege('authenticated', 'tarefas.outbox', 'SELECT,INSERT,UPDATE,DELETE')
       or has_table_privilege('authenticated', 'tarefas.inbox', 'SELECT,INSERT,UPDATE,DELETE'),
  false, 'outbox e inbox de tarefas sem acesso de usuario');

select * from finish();
rollback;
