-- 001_estrutura.sql — estrutura de toda tabela de `public`: RLS ligado, anon sem
-- nada, toda policy passa por tem_permissao( / usuario_atual(, todo slug citado
-- em policy existe no catalogo, nenhuma funcao de public executavel por anon.
-- (G4, G5; o teste COMPORTAMENTAL esta no 002.)
begin;
create extension if not exists pgtap with schema extensions;
set local search_path = public, extensions;

select plan(6);

-- G5: RLS ligado em toda tabela de public (gate1 + migration)
select is_empty(
  $$ select c.relname from pg_class c join pg_namespace n on n.oid = c.relnamespace
      where n.nspname = 'public' and c.relkind in ('r', 'p') and not c.relrowsecurity $$,
  'toda tabela de public tem RLS ligado');

-- G5: anon sem nenhum privilegio de tabela em public
select is_empty(
  $$ select c.relname from pg_class c join pg_namespace n on n.oid = c.relnamespace
      where n.nspname = 'public' and c.relkind in ('r', 'p', 'v', 'm')
        and (has_table_privilege('anon', c.oid, 'SELECT')
          or has_table_privilege('anon', c.oid, 'INSERT')
          or has_table_privilege('anon', c.oid, 'UPDATE')
          or has_table_privilege('anon', c.oid, 'DELETE')
          or has_table_privilege('anon', c.oid, 'TRUNCATE')) $$,
  'anon sem SELECT/INSERT/UPDATE/DELETE/TRUNCATE em tabela de public');

-- G5: toda policy de public passa por tem_permissao( ou usuario_atual(
select is_empty(
  $$ select tablename || '.' || policyname from pg_policies
      where schemaname = 'public'
        and coalesce(qual, '') || ' ' || coalesce(with_check, '') !~ '(tem_permissao|usuario_atual)\(' $$,
  'toda policy de public cita tem_permissao( ou usuario_atual(');

-- G4: todo slug literal em policy existe em permissoes (typo = tela vazia)
select is_empty(
  $$ select p.tablename || '.' || p.policyname || ' -> ' || m[1]
       from pg_policies p,
            lateral regexp_matches(coalesce(p.qual, '') || ' ' || coalesce(p.with_check, ''),
                                   'tem_permissao\(''([^'']+)''', 'g') as m
      where p.schemaname = 'public'
        and not exists (select 1 from public.permissoes x where x.slug = m[1]) $$,
  'todo slug citado em policy existe no catalogo de permissoes');

-- G3: nenhuma funcao de public (do postgres, fora de extensao) executavel por anon
select is_empty(
  $$ select p.oid::regprocedure::text from pg_proc p
       join pg_namespace n on n.oid = p.pronamespace
      where n.nspname = 'public'
        and p.proowner = 'postgres'::regrole
        and not exists (select 1 from pg_depend d where d.objid = p.oid and d.deptype = 'e')
        and has_function_privilege('anon', p.oid, 'EXECUTE') $$,
  'nenhuma funcao de public executavel por anon');

-- G5: nenhuma view em public sem security_invoker (nenhuma view nesta base)
select is_empty(
  $$ select c.relname from pg_class c join pg_namespace n on n.oid = c.relnamespace
      where n.nspname = 'public' and c.relkind in ('v', 'm')
        and not coalesce('security_invoker=true' = any (c.reloptions), false)
        and not coalesce('security_invoker=on' = any (c.reloptions), false) $$,
  'toda view de public tem security_invoker');

select * from finish();
rollback;
