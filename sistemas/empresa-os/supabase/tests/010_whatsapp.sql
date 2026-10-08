-- 010_whatsapp.sql — 0018: registro das mensagens do WhatsApp local do aluno.
-- COMO usuario: whatsapp.read le, ninguem da tela escreve, anon nao ve nada; COMO servico:
-- registrar_mensagem_whatsapp (upsert por wa_id) e atualizar_status_whatsapp (so avanca).
-- O modulo whatsapp nasce DESLIGADO (0013): o teste liga antes de conceder o slug e o
-- rollback no fim desfaz tudo. Privilegio de funcao e conferido no catalogo (chamar
-- funcao sem EXECUTE como anon/authenticated derruba a imagem 17.6.1.106).
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

-- o canal nasce desligado: liga (maquina, sem usuario logado) pra poder conceder o slug
select public.ligar_modulo('whatsapp', true);

insert into auth.users (id, email) values
  ('eeeeeeee-0000-4000-8000-000000000001', 'leitor10@exemplo.invalid'),
  ('eeeeeeee-0000-4000-8000-000000000002', 'sem10@exemplo.invalid');
insert into public.usuarios (id, nome, email, auth_user_id) values
  ('eeeeeeee-1111-4000-8000-000000000001', 'Leitor 10', 'leitor10@exemplo.invalid', 'eeeeeeee-0000-4000-8000-000000000001'),
  ('eeeeeeee-1111-4000-8000-000000000002', 'Sem 10', 'sem10@exemplo.invalid', 'eeeeeeee-0000-4000-8000-000000000002');
insert into public.usuarios_permissoes (usuario_id, permissao) values
  ('eeeeeeee-1111-4000-8000-000000000001', 'whatsapp.read'),
  ('eeeeeeee-1111-4000-8000-000000000002', 'tarefas.read');

create temp table _ativ0 as select count(*)::int as n from public.atividade;

select plan(37);

-- privilegio conferido no catalogo
select is(has_function_privilege('authenticated', 'public.registrar_mensagem_whatsapp(text, text, text, text, text, text, text, timestamptz)', 'EXECUTE')
       or has_function_privilege('anon', 'public.registrar_mensagem_whatsapp(text, text, text, text, text, text, text, timestamptz)', 'EXECUTE'),
  false, 'authenticated e anon nao executam registrar_mensagem_whatsapp');
select is(has_function_privilege('authenticated', 'public.atualizar_status_whatsapp(text, text)', 'EXECUTE')
       or has_function_privilege('anon', 'public.atualizar_status_whatsapp(text, text)', 'EXECUTE'),
  false, 'authenticated e anon nao executam atualizar_status_whatsapp');
select is(has_function_privilege('service_role', 'public.registrar_mensagem_whatsapp(text, text, text, text, text, text, text, timestamptz)', 'EXECUTE')
      and has_function_privilege('service_role', 'public.atualizar_status_whatsapp(text, text)', 'EXECUTE'),
  true, 'service_role executa as duas operacoes do motor');
select ok(exists (select 1 from pg_indexes where schemaname = 'public' and tablename = 'whatsapp_mensagem'
                    and indexname = 'idx_whatsapp_mensagem_ocorrida' and indexdef like '%ocorrida_em DESC%'),
  'indice do relatorio (ocorrida_em desc) existe');

-- registrar: forma do retorno, upsert, validacao
select ok(pg_temp.como_servico($$ select public.registrar_mensagem_whatsapp('w10-a', 'enviada', '5511999990001', 'ola, tudo bem?', 'teste', 'enviada')::text $$) ~ '^[0-9a-f-]{36}$',
  'servico registra mensagem enviada e recebe so o id');
select is(pg_temp.como_servico($$ select (public.registrar_mensagem_whatsapp('w10-a', 'enviada', '5511999990001', 'ola, tudo bem?', 'teste', 'enviada')
    = (select id from public.whatsapp_mensagem where wa_id = 'w10-a'))::text $$),
  'true', 'registrar de novo o mesmo wa_id devolve a mesma linha (upsert)');
select is((select count(*)::int from public.whatsapp_mensagem where wa_id = 'w10-a'), 1, 'upsert nao duplica a mensagem');
select is(pg_temp.como_servico($$ select public.registrar_mensagem_whatsapp('w10-r', 'recebida', '5511999990002', 'comando', 'outro', 'recebida', null, '2026-10-06 10:00:00+00')::text $$) ~ '^[0-9a-f-]{36}$',
  true, 'mensagem recebida entra com ocorrida_em informada');
select ok((select ocorrida_em = '2026-10-06 10:00:00+00'::timestamptz from public.whatsapp_mensagem where wa_id = 'w10-r'),
  'ocorrida_em informada e respeitada');
select is(pg_temp.como_servico($$ select public.registrar_mensagem_whatsapp('w10-x', 'sumiu', '5511999990001', 'x', 'mcp', 'enviada')::text $$),
  'ERRO:22023', 'direcao fora da lista e recusada com mensagem clara');
select is(pg_temp.como_servico($$ select public.registrar_mensagem_whatsapp('w10-x', 'enviada', '5511999990001', 'x', 'bot', 'enviada')::text $$),
  'ERRO:22023', 'origem fora da lista e recusada');
select is(pg_temp.como_servico($$ select public.registrar_mensagem_whatsapp('w10-x', 'enviada', '5511999990001', 'x', 'mcp', 'lida')::text $$),
  'ERRO:22023', 'status lida nao entra pelo registrar (so pelo recibo)');
select is(pg_temp.como_servico($$ select public.registrar_mensagem_whatsapp('w10-x', 'enviada', '+55 11 99999-0001', 'x', 'mcp', 'enviada')::text $$),
  'ERRO:22023', 'telefone com simbolo ou espaco e recusado');
select is(pg_temp.como_servico($$ select public.registrar_mensagem_whatsapp('w10-x', 'enviada', '5511999990001', 'x', 'mcp', 'recebida')::text $$),
  'ERRO:22023', 'mensagem enviada com status recebida e recusada');
select is(pg_temp.como_servico($$ select public.registrar_mensagem_whatsapp('w10-r', 'enviada', '5511999990002', 'x', 'mcp', 'enviada')::text $$),
  'ERRO:22023', 'o mesmo wa_id nao muda de direcao');
select is(pg_temp.como_servico($$ select public.registrar_mensagem_whatsapp('', 'enviada', '5511999990001', 'x', 'mcp', 'enviada')::text $$),
  'ERRO:22023', 'wa_id vazio e recusado');
select is(pg_temp.como_servico($$ select public.registrar_mensagem_whatsapp('w10-t0', 'enviada', '5511999990001', repeat('a', 4097), 'mcp', 'enviada')::text $$),
  'ERRO:22023', 'texto de 4097 caracteres e recusado');
select ok(pg_temp.como_servico($$ select public.registrar_mensagem_whatsapp('w10-t1', 'enviada', '5511999990001', repeat('a', 4096), 'mcp', 'enviada')::text $$) ~ '^[0-9a-f-]{36}$',
  'texto de 4096 caracteres (o limite) e aceito');
select is(pg_temp.como_servico($$ select public.registrar_mensagem_whatsapp('w10-f', 'enviada', '5511999990001', 'x', 'mcp', 'falhou', repeat('e', 5000))::text $$) ~ '^[0-9a-f-]{36}$',
  true, 'falha de envio com erro longo e registrada');
select is((select length(erro) from public.whatsapp_mensagem where wa_id = 'w10-f'), 1000, 'erro e truncado em 1000 caracteres, nao recusado');

-- atualizar_status: so avanca, nunca regride, id desconhecido = false
select is(pg_temp.como_servico($$ select public.atualizar_status_whatsapp('w10-a', 'entregue')::text $$), 'true', 'recibo de entrega acha a mensagem');
select is((select status from public.whatsapp_mensagem where wa_id = 'w10-a'), 'entregue', 'status avancou para entregue');
select is(pg_temp.como_servico($$ select public.atualizar_status_whatsapp('w10-a', 'lida')::text $$), 'true', 'recibo de leitura acha a mensagem');
select is((select status from public.whatsapp_mensagem where wa_id = 'w10-a'), 'lida', 'status avancou para lida');
select is(pg_temp.como_servico($$ select public.atualizar_status_whatsapp('w10-a', 'entregue')::text $$), 'true',
  'recibo de entrega atrasado nao e erro (a mensagem existe)');
select is((select status from public.whatsapp_mensagem where wa_id = 'w10-a'), 'lida', 'recibo atrasado NAO faz a mensagem lida regredir');
select is(pg_temp.como_servico($$ select public.registrar_mensagem_whatsapp('w10-a', 'enviada', '5511999990001', 'ola, tudo bem?', 'teste', 'enviada')::text $$) ~ '^[0-9a-f-]{36}$', true,
  'registrar de novo mensagem ja lida e aceito');
select is((select status from public.whatsapp_mensagem where wa_id = 'w10-a'), 'lida', 'registrar de novo NAO faz a mensagem lida regredir');
select is(pg_temp.como_servico($$ select public.atualizar_status_whatsapp('w10-nao-existe', 'lida')::text $$), 'false', 'wa_id desconhecido devolve false, sem erro');
select is(pg_temp.como_servico($$ select public.atualizar_status_whatsapp('w10-a', 'enviada')::text $$), 'ERRO:22023', 'recibo so aceita entregue ou lida');

-- leitura COMO usuario
-- GA-06 positivo: whatsapp_mensagem
select cmp_ok(pg_temp.visto_como('eeeeeeee-0000-4000-8000-000000000001', 'select count(*)::text from public.whatsapp_mensagem')::int,
  '>=', 4, 'whatsapp.read ve as mensagens registradas');
-- GA-06 negacao: whatsapp_mensagem
select is(pg_temp.visto_como('eeeeeeee-0000-4000-8000-000000000002', 'select count(*)::text from public.whatsapp_mensagem'),
  '0', 'sem whatsapp.read ve 0 mensagem');
select is(pg_temp.visto_como('eeeeeeee-0000-4000-8000-000000000001',
  $$ insert into public.whatsapp_mensagem (wa_id, direcao, telefone, texto, origem, status) values ('w10-u', 'enviada', '5511999990001', 'x', 'mcp', 'enviada') returning 'ok' $$),
  'ERRO:42501', 'nem quem le escreve direto na tabela');
select is(has_table_privilege('authenticated', 'public.whatsapp_mensagem', 'INSERT,UPDATE,DELETE')
       or has_table_privilege('anon', 'public.whatsapp_mensagem', 'SELECT,INSERT,UPDATE,DELETE'),
  false, 'authenticated nao tem escrita e anon nao tem nada na tabela (grants no catalogo)');
select is(pg_temp.como_servico($$ insert into public.whatsapp_mensagem (wa_id, direcao, telefone, texto, origem, status)
    values ('w10-d', 'enviada', '5511999990001', repeat('a', 4097), 'mcp', 'enviada') returning 'ok' $$),
  'ERRO:23514', 'a tabela tambem recusa texto de 4097 caracteres (nao so a RPC)');
select is(pg_temp.visto_como(null, 'select count(*)::text from public.whatsapp_mensagem'),
  'ERRO:42501', 'anon nao le (chave publica)');

-- a linha do tempo do dono nao e poluida: nenhuma mensagem gerou linha em atividade
select is((select count(*)::int from public.atividade), (select n from _ativ0),
  'registrar e atualizar mensagem nao gravam em atividade');

select * from finish();
rollback;
