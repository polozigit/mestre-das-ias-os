-- 002_rls_como_usuario.sql — o teste que pega "tela vazia sem erro" ANTES do merge:
-- vê o seed COMO usuario autenticado (nao como postgres nem service_role).
-- Cria o dono dentro da propria transacao (o seed nunca cria dono) e liga os
-- usuarios de exemplo a contas de auth. Termina em ROLLBACK.
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

-- contas de auth e vinculo (como postgres: maquina)
insert into auth.users (id, email) values
  ('aaaaaaaa-0000-4000-8000-000000000001', 'dono-teste@exemplo.invalid'),
  ('aaaaaaaa-0000-4000-8000-000000000002', 'equipe@exemplo.invalid'),
  ('aaaaaaaa-0000-4000-8000-000000000003', 'leitor@exemplo.invalid'),
  ('aaaaaaaa-0000-4000-8000-000000000004', 'sem-linha@exemplo.invalid');
insert into public.usuarios (nome, email, e_dono, auth_user_id)
values ('Dono Teste', 'dono-teste@exemplo.invalid', true, 'aaaaaaaa-0000-4000-8000-000000000001');
update public.usuarios set auth_user_id = 'aaaaaaaa-0000-4000-8000-000000000002' where email = 'equipe@exemplo.invalid';
update public.usuarios set auth_user_id = 'aaaaaaaa-0000-4000-8000-000000000003' where email = 'leitor@exemplo.invalid';

select plan(11 + 11 + 10 + 11 + 6);

-- G7 (e G6 para o dono): o dono ve >= 1 linha em cada tabela com dado de exemplo
-- GA-06 positivo: empresa, usuarios, permissoes, usuarios_permissoes, agentes, tarefas, atividade, execucoes_agente, documentos_publicados, melhorias, modulo
select cmp_ok(
  pg_temp.visto_como('aaaaaaaa-0000-4000-8000-000000000001', format('select count(*)::text from public.%I', t))::int,
  '>=', 1, 'dono ve public.' || t)
  from unnest(array['empresa','usuarios','permissoes','usuarios_permissoes','agentes','tarefas',
                    'atividade','execucoes_agente','documentos_publicados','melhorias','modulo']) as t;

-- equipe (todos os .read + tarefas.write + agentes.write): ve todo o seed
-- (usuarios_permissoes: so as proprias, e a equipe nao tem usuarios.manage)
select cmp_ok(
  pg_temp.visto_como('aaaaaaaa-0000-4000-8000-000000000002', format('select count(*)::text from public.%I', t))::int,
  '>=', 1, 'equipe ve public.' || t)
  from unnest(array['empresa','usuarios','permissoes','usuarios_permissoes','agentes','tarefas',
                    'atividade','execucoes_agente','documentos_publicados','melhorias','modulo']) as t;

-- leitor (so tarefas.read): G6 — ve as tarefas do seed; 0 no que nao tem permissao
select cmp_ok(pg_temp.visto_como('aaaaaaaa-0000-4000-8000-000000000003', 'select count(*)::text from public.tarefas')::int,
  '>=', 1, 'leitor (tarefas.read) ve tarefas do seed');
select is(pg_temp.visto_como('aaaaaaaa-0000-4000-8000-000000000003', 'select count(*)::text from public.execucoes_agente'),
  '0', 'leitor ve 0 em execucoes_agente');
select is(pg_temp.visto_como('aaaaaaaa-0000-4000-8000-000000000003', 'select count(*)::text from public.documentos_publicados'),
  '0', 'leitor ve 0 em documentos_publicados');
select is(pg_temp.visto_como('aaaaaaaa-0000-4000-8000-000000000003', 'select count(*)::text from public.usuarios_permissoes'),
  '1', 'leitor ve so as PROPRIAS linhas de usuarios_permissoes');
select is(pg_temp.visto_como('aaaaaaaa-0000-4000-8000-000000000003', 'select count(*)::text from public.agentes'),
  '0', 'leitor ve 0 em agentes');
select is(pg_temp.visto_como('aaaaaaaa-0000-4000-8000-000000000003', 'select count(*)::text from public.melhorias'),
  '0', 'leitor ve 0 em melhorias');
select is(pg_temp.visto_como('aaaaaaaa-0000-4000-8000-000000000003', 'select count(*)::text from public.atividade'),
  '0', 'leitor ve 0 em atividade');
-- excecoes E3-05 / ADR-012 item 10: qualquer usuario ativo le empresa, usuarios, permissoes, modulo
select is(pg_temp.visto_como('aaaaaaaa-0000-4000-8000-000000000003', 'select count(*)::text from public.empresa'),
  '1', 'leitor ve a empresa (excecao E3-05)');
select cmp_ok(pg_temp.visto_como('aaaaaaaa-0000-4000-8000-000000000003', 'select count(*)::text from public.modulo')::int,
  '>=', 1, 'leitor ve o catalogo de modulos (ADR-012 item 10)');
select is(pg_temp.visto_como('aaaaaaaa-0000-4000-8000-000000000003',
  $$ select coalesce(count(*), 0)::text from public.tarefas where chave = 'exemplo.curso-d1-01' $$),
  '1', 'leitor ve a tarefa de trilha do seed pela chave');

-- login sem linha em usuarios ve 0 em tudo (inclusive empresa e catalogo)
-- GA-06 negacao: empresa, usuarios, permissoes, usuarios_permissoes, agentes, tarefas, atividade, execucoes_agente, documentos_publicados, melhorias, modulo
select is(
  pg_temp.visto_como('aaaaaaaa-0000-4000-8000-000000000004', format('select count(*)::text from public.%I', t)),
  '0', 'login sem cadastro ve 0 em public.' || t)
  from unnest(array['empresa','usuarios','permissoes','usuarios_permissoes','agentes','tarefas',
                    'atividade','execucoes_agente','documentos_publicados','melhorias','modulo']) as t;

-- escrita: o leitor nao cria tarefa (42501); a equipe cria tarefa de trabalho e nao cria de trilha
select is(pg_temp.visto_como('aaaaaaaa-0000-4000-8000-000000000003',
  $$ insert into public.tarefas (titulo) values ('leitor tenta criar') returning 'ok' $$),
  'ERRO:42501', 'leitor INSERT em tarefas -> 42501');
select is(pg_temp.visto_como('aaaaaaaa-0000-4000-8000-000000000002',
  $$ insert into public.tarefas (titulo) values ('equipe cria tarefa de trabalho') returning 'ok' $$),
  'ok', 'equipe INSERT em tarefas (trabalho) funciona');
select is(pg_temp.visto_como('aaaaaaaa-0000-4000-8000-000000000002',
  $$ insert into public.tarefas (titulo, trilha, fase, ordem, chave) values ('trilha pela tela', 'curso', 'D1', 98000, 'teste.trilha-pela-tela') returning 'ok' $$),
  'ERRO:42501', 'equipe nao cria tarefa de trilha pela tela');
select is(pg_temp.visto_como('aaaaaaaa-0000-4000-8000-000000000002',
  $$ insert into public.atividade (usuario_id, tipo, descricao)
     values (public.usuario_atual(), 'nota', 'registro em nome proprio') returning 'ok' $$),
  'ok', 'usuario ativo registra atividade em nome proprio');
select is(pg_temp.visto_como('aaaaaaaa-0000-4000-8000-000000000003',
  $$ insert into public.atividade (usuario_id, tipo, descricao)
     values (public.usuario_atual(), 'nota', 'leitor registra nota propria') returning 'ok' $$),
  'ok', 'E3-05: leitor (sem atividade.read) tambem registra atividade em nome proprio');
select is(pg_temp.visto_como('aaaaaaaa-0000-4000-8000-000000000002',
  $$ insert into public.atividade (usuario_id, tipo, descricao)
     values (null, 'sistema', 'forjado') returning 'ok' $$),
  'ERRO:42501', 'ninguem forja evento de sistema pelo client');

select * from finish();
rollback;
