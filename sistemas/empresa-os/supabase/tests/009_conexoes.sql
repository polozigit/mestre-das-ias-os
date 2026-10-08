-- 009_conexoes.sql — 0017: inventario de conexoes e escrita no Vault (ADR-025).
-- COMO usuario: conexoes.read le, ninguem da tela escreve; COMO servico: registrar_conexao
-- e guardar_segredo (ida e volta real no Vault quando a extensao existe).
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
  ('ffffffff-0000-4000-8000-000000000001', 'leitor9@exemplo.invalid'),
  ('ffffffff-0000-4000-8000-000000000002', 'sem9@exemplo.invalid');
insert into public.usuarios (id, nome, email, auth_user_id) values
  ('ffffffff-1111-4000-8000-000000000001', 'Leitor 9', 'leitor9@exemplo.invalid', 'ffffffff-0000-4000-8000-000000000001'),
  ('ffffffff-1111-4000-8000-000000000002', 'Sem 9', 'sem9@exemplo.invalid', 'ffffffff-0000-4000-8000-000000000002');
insert into public.usuarios_permissoes (usuario_id, permissao) values
  ('ffffffff-1111-4000-8000-000000000001', 'conexoes.read'),
  ('ffffffff-1111-4000-8000-000000000002', 'tarefas.read');

select plan(20);

-- GA-06 positivo: conexao
select cmp_ok(pg_temp.visto_como('ffffffff-0000-4000-8000-000000000001', 'select count(*)::text from public.conexao')::int,
  '>=', 1, 'conexoes.read ve o inventario do seed');
-- GA-06 negacao: conexao
select is(pg_temp.visto_como('ffffffff-0000-4000-8000-000000000002', 'select count(*)::text from public.conexao'),
  '0', 'sem conexoes.read ve 0 conexao');
select is(pg_temp.visto_como('ffffffff-0000-4000-8000-000000000001',
  $$ insert into public.conexao (servico, conta, dono_papel) values ('x', 'y', 'cto') returning 'ok' $$),
  'ERRO:42501', 'ninguem da tela escreve no inventario');
-- privilegio conferido no catalogo (chamar sem EXECUTE derruba a imagem 17.6.1.106)
select is(has_function_privilege('authenticated', 'public.guardar_segredo(text, text)', 'EXECUTE')
       or has_function_privilege('anon', 'public.guardar_segredo(text, text)', 'EXECUTE'),
  false, 'authenticated e anon nao executam guardar_segredo');
select is(has_function_privilege('authenticated', 'public.registrar_conexao(text, text, text, text, uuid, text, text[], text, text, date, date, date, date)', 'EXECUTE'),
  false, 'authenticated nao executa registrar_conexao');
select is(has_function_privilege('service_role', 'public.guardar_segredo(text, text)', 'EXECUTE')
      and has_function_privilege('service_role', 'public.registrar_conexao(text, text, text, text, uuid, text, text[], text, text, date, date, date, date)', 'EXECUTE'),
  true, 'service_role executa as duas operacoes');

-- registrar_conexao
select ok(pg_temp.como_servico($$ select public.registrar_conexao('vercel', 'empresa-teste', 'projeto', null,
    'ffffffff-1111-4000-8000-000000000001', null, '{vercel_env:production}', null, 'ativo', '2026-10-06')::text $$) ~ '^[0-9a-f-]{36}$',
  'servico registra conexao com dono pessoa');
select is(pg_temp.como_servico($$ select (public.registrar_conexao('vercel', 'empresa-teste', 'projeto', null,
    'ffffffff-1111-4000-8000-000000000001', null, '{vercel_env:production,vercel_env:preview}', null, 'ativo')
    = (select id from public.conexao where servico = 'vercel' and conta = 'empresa-teste'))::text $$),
  'true', 'registrar de novo atualiza a mesma linha (upsert pela chave natural)');
select is((select copias::text || ' ' || provado_em::text from public.conexao where servico = 'vercel' and conta = 'empresa-teste'),
  '{vercel_env:production,vercel_env:preview} 2026-10-06', 'copias atualizadas e data nao informada nao apaga a existente');
select is(pg_temp.como_servico($$ select public.registrar_conexao('x', 'y', 'z', null, 'ffffffff-1111-4000-8000-000000000001', 'cto')::text $$),
  'ERRO:23514', 'dono pessoa E papel ao mesmo tempo e recusado');
select is(pg_temp.como_servico($$ select public.registrar_conexao('x', 'y', 'z', null, null, 'cto', '{planilha}')::text $$),
  'ERRO:23514', 'copia fora da lista fechada e recusada');
select is(pg_temp.como_servico($$ select public.registrar_conexao('x', 'y', 'z', 'segredo_que_nao_existe', null, 'cto')::text $$),
  'ERRO:P0001', 'segredo citado que nao existe no Vault e recusado');

-- guardar_segredo: ida e volta real no Vault (o pgTAP so roda na imagem supabase/postgres, que tem a extensao)
select ok(pg_temp.como_servico($$ select public.guardar_segredo('teste9_token', 'valor-teste-9-a')::text $$) ~ '^[0-9a-f-]{36}$',
  'servico guarda segredo e recebe so o id');
select is(pg_temp.como_servico($$ select public.segredo('teste9_token') $$), 'valor-teste-9-a',
  'a leitura continua pela porta unica public.segredo()');
select ok(pg_temp.como_servico($$ select public.guardar_segredo('teste9_token', 'valor-teste-9-b')::text $$) ~ '^[0-9a-f-]{36}$',
  'guardar de novo troca o valor (rotacao)');
select is(pg_temp.como_servico($$ select public.segredo('teste9_token') $$), 'valor-teste-9-b',
  'depois da troca, segredo() devolve o valor novo');
select is((select count(*)::int from vault.secrets where name = 'teste9_token'), 1, 'trocar nao duplica o segredo');
select ok(pg_temp.como_servico($$ select public.registrar_conexao('openai', 'empresa-teste', 'api', 'teste9_token', null, 'cto', '{arquivo_env}')::text $$) ~ '^[0-9a-f-]{36}$',
  'com o segredo no Vault, a conexao que o cita e registrada');
select is((select count(*)::int from public.atividade where metadata::text like '%valor-teste-9%' or descricao like '%valor-teste-9%'),
  0, 'o valor do segredo nunca aparece na trilha de atividade');
select is(pg_temp.como_servico($$ select public.guardar_segredo('nome com espaco', 'x')::text $$),
  'ERRO:P0001', 'nome de segredo invalido e recusado');

select * from finish();
rollback;
