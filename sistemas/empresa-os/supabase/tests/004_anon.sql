-- 004_anon.sql — chave anon (PUBLICA do projeto): nada le, nada executa.
-- Como anon, SELECT em cada tabela de public -> 42501; helpers sem EXECUTE pra anon.
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

select plan(
  (select count(*) from pg_class c join pg_namespace n on n.oid = c.relnamespace
    where n.nspname = 'public' and c.relkind in ('r', 'p'))::int + 5
);

-- 1 por tabela de public: anon nao le
select is(pg_temp.visto_como(null, format('select count(*)::text from public.%I', c.relname)),
          'ERRO:42501',
          'anon nao le public.' || c.relname)
  from pg_class c join pg_namespace n on n.oid = c.relnamespace
 where n.nspname = 'public' and c.relkind in ('r', 'p')
 order by c.relname;

-- G3: helpers e funcoes de seed nunca executaveis por anon. Checa o PRIVILEGIO
-- (has_function_privilege) em vez de CHAMAR a funcao como anon: na imagem
-- supabase/postgres:17.6.1.106 chamar como anon uma funcao SEM EXECUTE derruba o
-- servidor (signal 11, medido em 03/10/2026 com public.segredo e tem_permissao,
-- direto no psql: `set role anon; select public.segredo('x');`). A prova de que
-- anon nao executa e a mesma; so evita o crash do harness.
select is(has_function_privilege('anon', 'public.tem_permissao(text)', 'EXECUTE'), false, 'anon nao executa tem_permissao');
select is(has_function_privilege('anon', 'public.usuario_atual()', 'EXECUTE'), false, 'anon nao executa usuario_atual');
select is(has_function_privilege('anon', 'public.e_dono()', 'EXECUTE'), false, 'anon nao executa e_dono');
select is(has_function_privilege('anon', 'public.sessao_atual()', 'EXECUTE'), false, 'anon nao executa sessao_atual');
select is(has_function_privilege('anon', 'public.seed_empresa(text, text, text)', 'EXECUTE'), false, 'anon nao executa seed_empresa');

select * from finish();
rollback;
