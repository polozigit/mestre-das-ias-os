-- 011_atividade_usuarios.sql — evento de seguranca de usuarios (convite, permissao,
-- desativacao) tem que ser gravado e lido por quem NAO e dono. Nao existe
-- `usuarios.read` no catalogo, entao modulo_origem = 'usuarios' seria negado: o
-- app grava com modulo_origem NULL (visivel por atividade.read).
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
  ('cccccccc-0000-4000-8000-000000000001', 'dono11@exemplo.invalid'),
  ('cccccccc-0000-4000-8000-000000000002', 'gestor11@exemplo.invalid');
insert into public.usuarios (id, nome, email, e_dono, auth_user_id) values
  ('cccccccc-1111-4000-8000-000000000001', 'Dono 11', 'dono11@exemplo.invalid', true, 'cccccccc-0000-4000-8000-000000000001'),
  ('cccccccc-1111-4000-8000-000000000002', 'Gestor 11', 'gestor11@exemplo.invalid', false, 'cccccccc-0000-4000-8000-000000000002');
-- gatilho so-dono (0004) vale pra quem concede; aqui o concedente e o postgres do teste
insert into public.usuarios_permissoes (usuario_id, permissao) values
  ('cccccccc-1111-4000-8000-000000000002', 'usuarios.manage'),
  ('cccccccc-1111-4000-8000-000000000002', 'atividade.read');

select plan(3);

select is(pg_temp.visto_como('cccccccc-0000-4000-8000-000000000002',
  $$ with i as (insert into public.atividade (usuario_id, tipo, descricao, modulo_origem)
       values ('cccccccc-1111-4000-8000-000000000002', 'usuario_convidado', 'Convite enviado', null) returning 1)
     select 'ok' from i $$),
  'ok', 'gestor (usuarios.manage, nao dono) grava evento de usuarios com modulo_origem NULL');

select is(pg_temp.visto_como('cccccccc-0000-4000-8000-000000000002',
  $$ select count(*)::text from public.atividade where tipo = 'usuario_convidado' $$),
  '1', 'o mesmo gestor, com atividade.read, ve o evento que gravou');

select is(pg_temp.visto_como('cccccccc-0000-4000-8000-000000000002',
  $$ with i as (insert into public.atividade (usuario_id, tipo, descricao, modulo_origem)
       values ('cccccccc-1111-4000-8000-000000000002', 'usuario_convidado', 'Convite 2', 'usuarios') returning 1)
     select 'ok' from i $$),
  'ERRO:42501', 'modulo_origem = usuarios e negado (sem usuarios.read no catalogo): por isso o app usa NULL');

select * from finish();
rollback;
