-- 005_modulo_ligavel.sql — onda 1 (0013): modulo ligavel, ligar_modulo, gatilho da P4
-- (concessao de slug de modulo desligado recusada; desligar revoga) e o padrao de
-- outbox/inbox. COMO usuario (nao como postgres): permissao e negacao.
-- Cria os proprios usuarios dentro da transacao e termina em ROLLBACK.
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

insert into auth.users (id, email) values
  ('bbbbbbbb-0000-4000-8000-000000000001', 'dono5@exemplo.invalid'),
  ('bbbbbbbb-0000-4000-8000-000000000002', 'config5@exemplo.invalid'),
  ('bbbbbbbb-0000-4000-8000-000000000003', 'leitor5@exemplo.invalid');
insert into public.usuarios (id, nome, email, e_dono, auth_user_id) values
  ('bbbbbbbb-1111-4000-8000-000000000001', 'Dono 5', 'dono5@exemplo.invalid', true, 'bbbbbbbb-0000-4000-8000-000000000001'),
  ('bbbbbbbb-1111-4000-8000-000000000002', 'Config 5', 'config5@exemplo.invalid', false, 'bbbbbbbb-0000-4000-8000-000000000002'),
  ('bbbbbbbb-1111-4000-8000-000000000003', 'Leitor 5', 'leitor5@exemplo.invalid', false, 'bbbbbbbb-0000-4000-8000-000000000003');
insert into public.usuarios_permissoes (usuario_id, permissao) values
  ('bbbbbbbb-1111-4000-8000-000000000002', 'configuracoes.write'),
  ('bbbbbbbb-1111-4000-8000-000000000002', 'configuracoes.read'),
  ('bbbbbbbb-1111-4000-8000-000000000002', 'atividade.read'),
  ('bbbbbbbb-1111-4000-8000-000000000003', 'tarefas.read');

-- Modulo ligavel de sonda COM schema instalado (a unica forma de provar o ramo "liga")
insert into public.modulo (slug, nome, descricao, dono, schema_nome, classe, ligado)
  values ('x_lig', 'Sonda ligavel', 'Modulo de sonda do teste 005', 'Lider de Dados', 'x_lig', 'ligavel', false),
         ('x_pai', 'Sonda pai', 'Pai desligado', 'Lider de Dados', null, 'ligavel', false);
insert into public.modulo (slug, nome, descricao, dono, schema_nome, classe, ligado, modulo_pai)
  values ('x_canal', 'Sonda canal', 'Canal cujo pai esta desligado', 'Lider de Dados', null, 'ligavel', false, 'x_pai');
create schema x_lig;

-- Sonda do padrao de outbox/inbox: devolve o que a funcao criou, sem deixar rastro
create or replace function pg_temp.sonda_outbox() returns jsonb language plpgsql as $$
declare r jsonb := '{}';
begin
  begin
    insert into public.modulo (slug, nome, descricao, dono, schema_nome, classe, ligado)
      values ('x_ob', 'Sonda outbox', 'sonda', 'Lider de Dados', 'x_ob', 'essencial', true);
    create schema x_ob;
    -- ambiente hostil: tabela nova de x_ob nasce ABERTA pra anon e authenticated; a funcao tem que fechar
    alter default privileges for role postgres in schema x_ob grant all on tables to anon, authenticated;
    perform public.criar_outbox_inbox('x_ob');
    perform public.criar_outbox_inbox('x_ob');  -- idempotente
    r := jsonb_build_object(
      'tabelas', (select count(*) from pg_class c join pg_namespace n on n.oid = c.relnamespace
                   where n.nspname = 'x_ob' and c.relname in ('outbox', 'inbox') and c.relrowsecurity),
      'colunas_outbox', (select count(*) from information_schema.columns
                          where table_schema = 'x_ob' and table_name = 'outbox'
                            and column_name in ('id', 'tipo', 'versao', 'correlacao', 'payload', 'criada_em', 'publicada_em')),
      'unique_inbox', (select count(*) from pg_index i join pg_class c on c.oid = i.indrelid
                         join pg_namespace n on n.oid = c.relnamespace
                        where n.nspname = 'x_ob' and c.relname = 'inbox' and i.indisunique and not i.indisprimary),
      'authenticated_acessa', has_table_privilege('authenticated', 'x_ob.outbox', 'SELECT,INSERT,UPDATE,DELETE')
                           or has_table_privilege('authenticated', 'x_ob.inbox', 'SELECT,INSERT,UPDATE,DELETE'),
      'anon_acessa', has_table_privilege('anon', 'x_ob.outbox', 'SELECT,INSERT,UPDATE,DELETE')
                  or has_table_privilege('anon', 'x_ob.inbox', 'SELECT,INSERT,UPDATE,DELETE'),
      'service_role_escreve', has_table_privilege('service_role', 'x_ob.outbox', 'INSERT')
                           and has_table_privilege('service_role', 'x_ob.inbox', 'INSERT'),
      'comment_ok', (select count(*) from pg_class c join pg_namespace n on n.oid = c.relnamespace
                      where n.nspname = 'x_ob' and c.relname in ('outbox', 'inbox')
                        and obj_description(c.oid, 'pg_class') ~ 'dono=Lider de Dados;\s*retencao=R06\y'),
      'colunas_sem_classe', (select count(*) from pg_attribute a join pg_class c on c.oid = a.attrelid
                               join pg_namespace n on n.oid = c.relnamespace
                              where n.nspname = 'x_ob' and c.relname in ('outbox', 'inbox') and a.attnum > 0
                                and not a.attisdropped and a.attname not in ('id', 'criada_em')
                                and coalesce(col_description(c.oid, a.attnum), '') !~ 'classe=(nenhum|pessoal|sens[ií]vel)'));
    raise exception 'desfaz' using errcode = 'P0999';
  exception when sqlstate 'P0999' then null;
  end;
  return r;
end $$;

select plan(30);

select is((select string_agg(slug, ',' order by slug) from public.modulo
            where classe = 'ligavel' and not ligado and slug not like 'x\_%'),
  'cobranca,curso,eventos,instagram,maturidade,whatsapp',
  'decisao P8: ligaveis desligados de partida = cobranca, curso, eventos, instagram, maturidade e o canal WhatsApp');

-- ---- ligar_modulo: permissao (positivo) ----
-- GA-06 positivo: modulo
select is(pg_temp.visto_como('bbbbbbbb-0000-4000-8000-000000000002',
  $$ select 'ok' from (select public.ligar_modulo('whatsapp', true)) s $$),
  'ok', 'configuracoes.write liga o canal WhatsApp (pai mensageria ligado, sem schema)');
select is((select ligado::text || '/' || coalesce(ligado_por_usuario_id::text, '-') from public.modulo where slug = 'whatsapp'),
  'true/bbbbbbbb-1111-4000-8000-000000000002', 'ligado e quem ligou ficam gravados');
select cmp_ok((select ligado_em from public.modulo where slug = 'whatsapp'), '>=', now() - interval '1 minute',
  'ligado_em carimbado');
select is(pg_temp.visto_como('bbbbbbbb-0000-4000-8000-000000000002',
  $$ select count(*)::text from public.atividade where tipo = 'modulo_ligado' and metadata->>'modulo' = 'whatsapp' $$),
  '1', 'ligar grava linha em atividade (tipo e modulo, sem texto livre de pessoa)');
select is(pg_temp.visto_como('bbbbbbbb-0000-4000-8000-000000000002',
  $$ select 'ok' from (select public.ligar_modulo('x_lig', true)) s $$),
  'ok', 'ligavel COM schema instalado liga');

-- ---- ligar_modulo: negacao ----
-- GA-06 negacao: modulo
select is(pg_temp.visto_como('bbbbbbbb-0000-4000-8000-000000000003',
  $$ select 'ok' from (select public.ligar_modulo('eventos', true)) s $$),
  'ERRO:42501', 'sem configuracoes.write nao liga (42501)');
select is(pg_temp.visto_como('bbbbbbbb-0000-4000-8000-000000000002',
  $$ select 'ok' from (select public.ligar_modulo('crm', false)) s $$),
  'ERRO:P0001', 'essencial nao desliga pela RPC');
select is(pg_temp.visto_como('bbbbbbbb-0000-4000-8000-000000000002',
  $$ select 'ok' from (select public.ligar_modulo('curso', true)) s $$),
  'ERRO:P0001', 'ligavel SEM schema instalado nao liga (ADR-024)');
select is(pg_temp.visto_como('bbbbbbbb-0000-4000-8000-000000000002',
  $$ select 'ok' from (select public.ligar_modulo('modulo_que_nao_existe', true)) s $$),
  'ERRO:P0001', 'modulo fora do catalogo e recusado');
select is(pg_temp.visto_como('bbbbbbbb-0000-4000-8000-000000000002',
  $$ update public.modulo set ligado = true where slug = 'curso' returning 'ok' $$),
  'ERRO:42501', 'usuario nao escreve em public.modulo direto (so pela RPC)');
select is(pg_temp.visto_como('bbbbbbbb-0000-4000-8000-000000000001',
  $$ update public.modulo set ligado = true where slug = 'curso' returning 'ok' $$),
  'ERRO:42501', 'nem o dono escreve em public.modulo direto');
select is(has_function_privilege('anon', 'public.ligar_modulo(text, boolean)', 'EXECUTE'), false,
  'anon sem EXECUTE em ligar_modulo');

select is(pg_temp.visto_como('bbbbbbbb-0000-4000-8000-000000000002',
  $$ select 'ok' from (select public.ligar_modulo('x_canal', true)) s $$),
  'ERRO:P0001', 'canal nao liga com o pai desligado');
select is((select count(*)::int from public.permissoes
            where acao in ('restrito', 'privacidade', 'denuncia', 'registros', 'arquivo', 'memoria_pessoal', 'risco')),
  7, 'os 7 slugs restritos do ADR-012 item 7 (mais risco do ADR-018 e memoria do ADR-019) existem');

-- ---- P4: concessao de slug de modulo desligado ----
select is(pg_temp.visto_como('bbbbbbbb-0000-4000-8000-000000000001',
  $$ insert into public.usuarios_permissoes (usuario_id, permissao, concedida_por)
     values ('bbbbbbbb-1111-4000-8000-000000000003', 'curso.read', public.usuario_atual()) returning 'ok' $$),
  'ERRO:P0001', 'P4: nem o dono concede slug de modulo desligado');
select is(pg_temp.visto_como('bbbbbbbb-0000-4000-8000-000000000001',
  $$ insert into public.usuarios_permissoes (usuario_id, permissao, concedida_por)
     values ('bbbbbbbb-1111-4000-8000-000000000003', 'whatsapp.read', public.usuario_atual()) returning 'ok' $$),
  'ok', 'P4: com o modulo ligado a concessao passa');
select is(pg_temp.visto_como('bbbbbbbb-0000-4000-8000-000000000003',
  $$ select count(*)::text from public.usuarios_permissoes where usuario_id = public.usuario_atual() $$),
  '2', 'leitor tem tarefas.read e whatsapp.read antes de desligar');
select is(pg_temp.visto_como('bbbbbbbb-0000-4000-8000-000000000002',
  $$ select 'ok' from (select public.ligar_modulo('whatsapp', false)) s $$),
  'ok', 'configuracoes.write desliga o canal');
select is(pg_temp.visto_como('bbbbbbbb-0000-4000-8000-000000000003',
  $$ select string_agg(permissao, ',' order by permissao) from public.usuarios_permissoes where usuario_id = public.usuario_atual() $$),
  'tarefas.read', 'P4: desligar revogou as concessoes do modulo e preservou as outras');
select is(pg_temp.visto_como('bbbbbbbb-0000-4000-8000-000000000002',
  $$ select count(*)::text from public.atividade where tipo = 'modulo_desligado' and metadata->>'modulo' = 'whatsapp' $$),
  '1', 'desligar tambem grava atividade');

-- ---- catalogo legivel por usuario ativo (ADR-012 item 10), sem anon ----
select cmp_ok(pg_temp.visto_como('bbbbbbbb-0000-4000-8000-000000000003', 'select count(*)::text from public.modulo')::int,
  '>=', 25, 'leitor ve o catalogo inteiro de modulos (25+ linhas)');

-- ---- padrao de outbox/inbox ----
select is((pg_temp.sonda_outbox()->>'tabelas')::int, 2, 'criar_outbox_inbox cria outbox e inbox com RLS (e e idempotente)');
select is((pg_temp.sonda_outbox()->>'colunas_outbox')::int, 7, 'outbox tem as 7 colunas do padrao (GA-10)');
select is((pg_temp.sonda_outbox()->>'unique_inbox')::int, 1, 'inbox tem UNIQUE (origem, evento_id)');
select is(pg_temp.sonda_outbox()->>'authenticated_acessa', 'false', 'outbox e inbox sem grant a authenticated');
select is(pg_temp.sonda_outbox()->>'anon_acessa', 'false', 'outbox e inbox sem grant a anon');
select is(pg_temp.sonda_outbox()->>'service_role_escreve', 'true', 'service_role (relay) escreve na outbox e na inbox');
select is((pg_temp.sonda_outbox()->>'comment_ok')::int, 2, 'outbox e inbox com COMMENT de dono e retencao R06 (GA-02)');
select is((pg_temp.sonda_outbox()->>'colunas_sem_classe')::int, 0, 'toda coluna da outbox e da inbox tem classe= (GA-07)');

select * from finish();
rollback;
