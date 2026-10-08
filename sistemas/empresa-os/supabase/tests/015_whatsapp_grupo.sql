-- 015_whatsapp_grupo.sql — 0021: mensagem do WhatsApp local enviada a GRUPO (e midia/enquete,
-- que entram como texto-marcador). O id do grupo ocupa o lugar do telefone; destino_tipo e gerada.
-- Mesmo molde do 010: leitura COMO usuario, escrita COMO servico pelas RPCs, privilegio no catalogo.
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

select public.ligar_modulo('whatsapp', true);

insert into auth.users (id, email) values
  ('ffffffff-0000-4000-8000-000000000001', 'leitor11@exemplo.invalid'),
  ('ffffffff-0000-4000-8000-000000000002', 'sem11@exemplo.invalid');
insert into public.usuarios (id, nome, email, auth_user_id) values
  ('ffffffff-1111-4000-8000-000000000001', 'Leitor 11', 'leitor11@exemplo.invalid', 'ffffffff-0000-4000-8000-000000000001'),
  ('ffffffff-1111-4000-8000-000000000002', 'Sem 11', 'sem11@exemplo.invalid', 'ffffffff-0000-4000-8000-000000000002');
insert into public.usuarios_permissoes (usuario_id, permissao) values
  ('ffffffff-1111-4000-8000-000000000001', 'whatsapp.read'),
  ('ffffffff-1111-4000-8000-000000000002', 'tarefas.read');

create temp table _ativ0 as select count(*)::int as n from public.atividade;

select plan(32);

-- estrutura da 0021
select is((select count(*)::int from pg_proc p join pg_namespace n on n.oid = p.pronamespace
            where n.nspname = 'public' and p.proname = 'registrar_mensagem_whatsapp'), 1,
  'existe UMA registrar_mensagem_whatsapp (a assinatura antiga continua valendo, sem sobrecarga ambigua)');
select is(has_function_privilege('authenticated', 'public.registrar_mensagem_whatsapp(text, text, text, text, text, text, text, timestamptz)', 'EXECUTE')
       or has_function_privilege('anon', 'public.registrar_mensagem_whatsapp(text, text, text, text, text, text, text, timestamptz)', 'EXECUTE'),
  false, 'authenticated e anon continuam sem executar registrar_mensagem_whatsapp');
select is(has_function_privilege('service_role', 'public.registrar_mensagem_whatsapp(text, text, text, text, text, text, text, timestamptz)', 'EXECUTE'),
  true, 'service_role continua executando registrar_mensagem_whatsapp');
select is((select attgenerated::text from pg_attribute where attrelid = 'public.whatsapp_mensagem'::regclass and attname = 'destino_tipo'),
  's', 'destino_tipo e coluna gerada (armazenada)');
select ok(col_description('public.whatsapp_mensagem'::regclass, (select attnum from pg_attribute where attrelid = 'public.whatsapp_mensagem'::regclass and attname = 'destino_tipo')) ~ 'classe=nenhum',
  'destino_tipo tem COMMENT com classe=');
select is((select count(*)::int from pg_constraint where conrelid = 'public.whatsapp_mensagem'::regclass and conname = 'whatsapp_mensagem_telefone_check'), 0,
  'o CHECK antigo de telefone (so numero) saiu');

-- numero continua numero
select ok(pg_temp.como_servico($$ select public.registrar_mensagem_whatsapp('w11-num', 'enviada', '5511999990001', 'oi', 'teste', 'enviada')::text $$) ~ '^[0-9a-f-]{36}$',
  'a assinatura antiga (numero) continua funcionando');
select is((select destino_tipo from public.whatsapp_mensagem where wa_id = 'w11-num'), 'numero', 'telefone de 13 digitos e destino numero');
select ok(pg_temp.como_servico($$ select public.registrar_mensagem_whatsapp('w11-num15', 'enviada', '551199999000011', 'oi', 'teste', 'enviada')::text $$) ~ '^[0-9a-f-]{36}$',
  'telefone de 15 digitos (o limite) e aceito');
select is((select destino_tipo from public.whatsapp_mensagem where wa_id = 'w11-num15'), 'numero', 'telefone de 15 digitos continua destino numero (nao vira grupo)');

-- grupo: id novo e id antigo
select ok(pg_temp.como_servico($$ select public.registrar_mensagem_whatsapp('w11-g1', 'enviada', '120363000000000000', '[documento: vendas.pdf]', 'relatorio', 'enviada')::text $$) ~ '^[0-9a-f-]{36}$',
  'mensagem de grupo (id novo, 18 digitos) e registrada');
select is((select destino_tipo from public.whatsapp_mensagem where wa_id = 'w11-g1'), 'grupo', 'id de 18 digitos e destino grupo');
select ok(pg_temp.como_servico($$ select public.registrar_mensagem_whatsapp('w11-g2', 'enviada', '5511999990001-1600000000', '[imagem]', 'mcp', 'enviada')::text $$) ~ '^[0-9a-f-]{36}$',
  'mensagem de grupo antigo (<numero>-<carimbo>) e registrada');
select is((select destino_tipo from public.whatsapp_mensagem where wa_id = 'w11-g2'), 'grupo', 'id <numero>-<carimbo> e destino grupo');
select is(pg_temp.como_servico($$ select (public.registrar_mensagem_whatsapp('w11-g1', 'enviada', '120363000000000000', '[documento: vendas.pdf]', 'relatorio', 'enviada')
    = (select id from public.whatsapp_mensagem where wa_id = 'w11-g1'))::text $$),
  'true', 'registrar de novo a mensagem de grupo e upsert (mesma linha)');
select is((select count(*)::int from public.whatsapp_mensagem where wa_id = 'w11-g1'), 1, 'upsert de grupo nao duplica');
select ok(pg_temp.como_servico($$ select public.registrar_mensagem_whatsapp('w11-g3', 'enviada', '120363000000000000', '[enquete: Almoco?]', 'mcp', 'enviada')::text $$) ~ '^[0-9a-f-]{36}$',
  'enquete em grupo entra como texto-marcador');

-- recibo e status que so avanca valem para grupo
select is(pg_temp.como_servico($$ select public.atualizar_status_whatsapp('w11-g1', 'lida')::text $$), 'true', 'recibo de leitura acha a mensagem de grupo');
select is(pg_temp.como_servico($$ select public.registrar_mensagem_whatsapp('w11-g1', 'enviada', '120363000000000000', '[documento: vendas.pdf]', 'relatorio', 'enviada')::text $$) ~ '^[0-9a-f-]{36}$', true,
  'registrar de novo a mensagem de grupo ja lida e aceito');
select is((select status from public.whatsapp_mensagem where wa_id = 'w11-g1'), 'lida', 'mensagem de grupo lida NAO regride');

-- formato fora dos dois padroes
select is(pg_temp.como_servico($$ select public.registrar_mensagem_whatsapp('w11-x', 'enviada', '1234567', 'x', 'mcp', 'enviada')::text $$),
  'ERRO:22023', 'telefone de 7 digitos e recusado pela RPC');
select is(pg_temp.como_servico($$ select public.registrar_mensagem_whatsapp('w11-x', 'enviada', repeat('1', 31), 'x', 'mcp', 'enviada')::text $$),
  'ERRO:22023', 'id de 31 digitos e recusado pela RPC');
select is(pg_temp.como_servico($$ select public.registrar_mensagem_whatsapp('w11-x', 'enviada', '12036300000000000a', 'x', 'mcp', 'enviada')::text $$),
  'ERRO:22023', 'id de grupo com letra e recusado pela RPC');
select is(pg_temp.como_servico($$ select public.registrar_mensagem_whatsapp('w11-x', 'enviada', '5511999990001-12', 'x', 'mcp', 'enviada')::text $$),
  'ERRO:22023', 'id de grupo antigo com carimbo curto e recusado pela RPC');
select is(pg_temp.como_servico($$ select public.registrar_mensagem_whatsapp('w11-x', 'enviada', '120363000000000000@g.us', 'x', 'mcp', 'enviada')::text $$),
  'ERRO:22023', 'o id do grupo vai SEM o @g.us');
select is(pg_temp.como_servico($$ insert into public.whatsapp_mensagem (wa_id, direcao, telefone, texto, origem, status)
    values ('w11-d', 'enviada', repeat('1', 31), 'x', 'mcp', 'enviada') returning 'ok' $$),
  'ERRO:23514', 'a tabela tambem recusa id fora do padrao (nao so a RPC)');
select is(pg_temp.como_servico($$ insert into public.whatsapp_mensagem (wa_id, direcao, telefone, texto, origem, status, destino_tipo)
    values ('w11-e', 'enviada', '5511999990001', 'x', 'mcp', 'enviada', 'grupo') returning 'ok' $$),
  'ERRO:428C9', 'destino_tipo e gerada: nem o servico grava nela');

-- leitura COMO usuario (GA-06 ja cobre a tabela no 010; aqui a linha de grupo)
select cmp_ok(pg_temp.visto_como('ffffffff-0000-4000-8000-000000000001', $$ select count(*)::text from public.whatsapp_mensagem where destino_tipo = 'grupo' $$)::int,
  '>=', 3, 'whatsapp.read ve as mensagens de grupo e o destino_tipo');
select is(pg_temp.visto_como('ffffffff-0000-4000-8000-000000000002', 'select count(*)::text from public.whatsapp_mensagem'),
  '0', 'sem whatsapp.read ve 0 mensagem (de grupo ou nao)');
select is(pg_temp.visto_como('ffffffff-0000-4000-8000-000000000001',
  $$ insert into public.whatsapp_mensagem (wa_id, direcao, telefone, texto, origem, status) values ('w11-u', 'enviada', '120363000000000000', 'x', 'mcp', 'enviada') returning 'ok' $$),
  'ERRO:42501', 'nem quem le escreve mensagem de grupo direto na tabela');
select is(pg_temp.visto_como(null, 'select count(*)::text from public.whatsapp_mensagem'), 'ERRO:42501', 'anon continua sem ler');

select is((select count(*)::int from public.atividade), (select n from _ativ0),
  'registrar mensagem de grupo nao grava em atividade');

select * from finish();
rollback;
