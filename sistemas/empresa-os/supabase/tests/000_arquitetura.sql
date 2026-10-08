-- 000_arquitetura.sql — guardas de arquitetura (GA-01..GA-18 da planta, ADR-012, ADR-015).
-- Testes pgTAP `is_empty` sobre o CATALOGO do PostgreSQL, rodados DEPOIS da
-- rodada 2 com seed (job `banco`). Leitura estatica das migrations (GA-06,
-- GA-13, GA-15) fica em tests/test_arquitetura.py.
-- Catalogo de schemas = public + analitico + arquivo + schema_nome de cada
-- linha de public.modulo. Excecao = linha em supabase/arquitetura/excecoes.yml
-- com id de ADR; o espelho dela e a lista _exc abaixo (test_arquitetura.py
-- confere que os dois batem). Lista antiga SO DIMINUI (GA-13).
begin;
create extension if not exists pgtap with schema extensions;
set local search_path = public, extensions;

create temp table _cat (s text primary key);
insert into _cat
  select nspname from pg_namespace
   where nspname in ('public', 'analitico', 'arquivo')
      or nspname in (select schema_nome from public.modulo where schema_nome is not null);

create temp table _exc (guarda text not null, objeto text not null);
-- ESPELHO de supabase/arquitetura/excecoes.yml (guarda, objeto)
insert into _exc (guarda, objeto) values
  ('GA-07', 'public.empresa.nome'),
  ('GA-07', 'public.modulo.nome'),
  ('GA-05', 'fk_plano_atividade_agente'),
  ('GA-05', 'fk_plano_instancia_dono'),
  ('GA-05', 'fk_plano_instancia_parte'),
  ('GA-05', 'fk_tarefa_plano_tarefa'),
  ('GA-04', 'tarefas.v_tarefa_com_instrucao -> public.tarefas'),
  ('GA-04', 'tarefas.v_fila_agente -> public.tarefas'),
  ('GA-09', 'tarefas.fn_instanciar -> public.tarefas'),
  ('GA-05', 'fk_posicao_ocupacao_parte'),
  ('GA-05', 'fk_posicao_ocupacao_agente'),
  ('GA-04', 'organograma.v_posicao_ocupante -> public.agentes'),
  ('GA-07', 'organograma.org_workflow.nome'),
  ('GA-07', 'organograma.org_workflow_raia.nome'),
  ('GA-07', 'public.artefatos_ia.nome');

create temp view _tabs as
  select c.oid, n.nspname as s, c.relname as t
    from pg_class c join pg_namespace n on n.oid = c.relnamespace
   where n.nspname in (select s from _cat) and c.relkind in ('r', 'p');

create temp view _views as
  select c.oid, n.nspname as s, c.relname as t, c.reloptions
    from pg_class c join pg_namespace n on n.oid = c.relnamespace
   where n.nspname in (select s from _cat) and c.relkind in ('v', 'm');

create temp view _funcs as
  select p.oid, n.nspname as s, p.proname as f, p.prosrc
    from pg_proc p join pg_namespace n on n.oid = p.pronamespace
   where n.nspname in (select s from _cat)
     and p.proowner = (select oid from pg_roles where rolname = 'postgres')
     and not exists (select 1 from pg_depend d where d.objid = p.oid and d.deptype = 'e');

select plan(27);

-- GA-01: tabela sem RLS
select is_empty($$ select s || '.' || t from _tabs where not (select relrowsecurity from pg_class where oid = _tabs.oid) $$,
  'GA-01: toda tabela dos schemas do catalogo tem RLS ligado');

-- GA-02: dono e regra de retencao no COMMENT da tabela
select is_empty($$ select s || '.' || t from _tabs
   where coalesce(obj_description(oid, 'pg_class'), '') !~ 'dono=[^;]+;\s*retencao=R(0[1-9]|1[0-8])\y' $$,
  'GA-02: toda tabela tem COMMENT com dono= e retencao=R01..R18');

-- GA-03: grant a anon (tabela, view, sequencia, funcao, schema) sem excecao com ADR
select is_empty($$ select s || '.' || t from _tabs
   where has_table_privilege('anon', oid, 'SELECT,INSERT,UPDATE,DELETE,TRUNCATE,REFERENCES,TRIGGER')
     and not exists (select 1 from _exc where guarda = 'GA-03' and objeto = _tabs.s || '.' || _tabs.t)
  union all
  select s || '.' || t from _views
   where has_table_privilege('anon', oid, 'SELECT,INSERT,UPDATE,DELETE')
     and not exists (select 1 from _exc where guarda = 'GA-03' and objeto = _views.s || '.' || _views.t)
  union all
  select n.nspname || '.' || c.relname from pg_class c join pg_namespace n on n.oid = c.relnamespace
   where n.nspname in (select s from _cat) and c.relkind = 'S'
     and (case when c.relkind = 'S' then has_sequence_privilege('anon', c.oid, 'USAGE,SELECT,UPDATE') end)
  union all
  select s || '.' || f from _funcs
   where has_function_privilege('anon', oid, 'EXECUTE')
     and not exists (select 1 from _exc where guarda = 'GA-03' and objeto = _funcs.s || '.' || _funcs.f)
  union all
  select s from _cat where s <> 'public' and has_schema_privilege('anon', s, 'USAGE') $$,
  'GA-03: anon sem privilegio em objeto dos schemas do catalogo (fora de excecao com ADR)');

-- GA-04: modulo lendo tabela de outro (view e funcao SQL)
select is_empty($$ select v.s || '.' || v.t || ' -> ' || tn.nspname || '.' || t.relname
   from _views v
   join pg_rewrite rw on rw.ev_class = v.oid
   join pg_depend d on d.objid = rw.oid and d.classid = 'pg_rewrite'::regclass and d.refclassid = 'pg_class'::regclass
   join pg_class t on t.oid = d.refobjid and t.relkind in ('r', 'p', 'f')
   join pg_namespace tn on tn.oid = t.relnamespace
  where tn.nspname in (select s from _cat) and tn.nspname <> v.s
    and not exists (select 1 from _exc where guarda = 'GA-04'
                     and objeto = v.s || '.' || v.t || ' -> ' || tn.nspname || '.' || t.relname) $$,
  'GA-04: view nao depende de tabela de outro schema (leitura entre modulos so por objeto de contrato)');
select is_empty($$ select f.s || '.' || f.f || ' -> ' || x.s || '.' || x.t
   from _funcs f join _tabs x on x.s <> f.s and x.s not in ('public', 'arquivo')
  where f.prosrc ~* ('\m' || x.s || '\.' || x.t || '\M')
    and not exists (select 1 from _exc where guarda = 'GA-04'
                     and objeto = f.s || '.' || f.f || ' -> ' || x.s || '.' || x.t) $$,
  'GA-04: funcao de um modulo nao cita tabela interna de outro');

-- GA-05: FK entre schemas do catalogo so pra `public` e so com excecao (ADR-013)
select is_empty($$ select o.nspname || '.' || co.relname || '.' || c.conname || ' -> ' || d.nspname || '.' || cd.relname
   from pg_constraint c
   join pg_class co on co.oid = c.conrelid join pg_namespace o on o.oid = co.relnamespace
   join pg_class cd on cd.oid = c.confrelid join pg_namespace d on d.oid = cd.relnamespace
  where c.contype = 'f' and o.nspname <> d.nspname
    and o.nspname in (select s from _cat) and d.nspname in (select s from _cat)
    and not (d.nspname = 'public' and exists (select 1 from _exc where guarda = 'GA-05' and objeto = c.conname)) $$,
  'GA-05: FK entre schemas so aponta pro nucleo (public) e consta na lista de excecoes com ADR-013');

-- GA-07: coluna sem classificacao de dado pessoal; nome de risco marcado classe=nenhum
select is_empty($$ select x.s || '.' || x.t || '.' || a.attname
   from _tabs x join pg_attribute a on a.attrelid = x.oid and a.attnum > 0 and not a.attisdropped
  where a.attname not in ('id', 'criada_em', 'atualizada_em',
                          'criada_por_usuario_id', 'criada_por_agente_id', 'criada_por_servico',
                          'atualizada_por_usuario_id', 'atualizada_por_agente_id', 'atualizada_por_servico')
    and coalesce(col_description(x.oid, a.attnum), '') !~ 'classe=(nenhum|pessoal|sens[ií]vel)' $$,
  'GA-07: toda coluna tem classe= (nenhum, pessoal ou sensivel) no COMMENT');
select is_empty($$ select x.s || '.' || x.t || '.' || a.attname
   from _tabs x join pg_attribute a on a.attrelid = x.oid and a.attnum > 0 and not a.attisdropped
  where a.attname in ('cpf', 'email', 'telefone', 'nome', 'nascimento', 'endereco')
    and coalesce(col_description(x.oid, a.attnum), '') ~ 'classe=nenhum'
    and not exists (select 1 from _exc where guarda = 'GA-07'
                     and objeto = x.s || '.' || x.t || '.' || a.attname) $$,
  'GA-07: coluna com nome de risco nao fica classe=nenhum sem excecao');

-- GA-08: schema proprio sem linha em public.modulo; slug com prefixo fora do catalogo
select is_empty($$ select n.nspname from pg_namespace n
  where n.nspowner = (select oid from pg_roles where rolname = 'postgres')
    and n.nspname !~ '^pg_' and n.nspname not in ('public', 'analitico', 'arquivo')
    -- schema de controle do Supabase CLI: no projeto hospedado nasce com dono postgres (homolog, 06/10/2026)
    and n.nspname <> 'supabase_migrations'
    and not exists (select 1 from pg_extension e where e.extnamespace = n.oid)
    and not exists (select 1 from public.modulo m where m.schema_nome = n.nspname and length(trim(m.dono)) > 0) $$,
  'GA-08: todo schema proprio tem linha em public.modulo com dono');
select is_empty($$ select p.slug from public.permissoes p
  where not exists (select 1 from public.modulo m where m.slug = p.modulo and length(trim(m.dono)) > 0) $$,
  'GA-08: todo prefixo de slug de permissao e um modulo do catalogo com dono');

-- GA-09: funcao que escreve em tabela de outro schema; funcao publica de modulo sem motivo
select is_empty($$ select f.s || '.' || f.f || ' -> ' || x.s || '.' || x.t
   from _funcs f join _tabs x on x.s <> f.s
  where f.prosrc ~* ('(insert\s+into|update|delete\s+from|merge\s+into)\s+' || x.s || '\.' || x.t || '\y')
    and not exists (select 1 from _exc where guarda = 'GA-09'
                     and objeto = f.s || '.' || f.f || ' -> ' || x.s || '.' || x.t) $$,
  'GA-09: funcao nao escreve em tabela de outro schema');
select is_empty($$ select f.s || '.' || f.f from _funcs f
  where f.s in (select schema_nome from public.modulo where schema_nome is not null)
    and has_function_privilege('authenticated', f.oid, 'EXECUTE')
    and coalesce(obj_description(f.oid, 'pg_proc'), '') !~ 'motivo:' $$,
  'GA-09: funcao publica de modulo (executavel por authenticated) tem motivo: no COMMENT');

-- GA-10: outbox e inbox no padrao; NOTIFY nunca como fila
select is_empty($$ select x.s || '.outbox sem ' || col
   from _tabs x cross join unnest(array['id', 'tipo', 'versao', 'correlacao', 'payload', 'criada_em', 'publicada_em']) as col
  where x.t = 'outbox'
    and not exists (select 1 from pg_attribute a where a.attrelid = x.oid and a.attname = col and not a.attisdropped) $$,
  'GA-10: outbox tem as colunas do padrao');
select is_empty($$ select x.s || '.inbox sem UNIQUE (origem, evento_id)'
   from _tabs x
  where x.t = 'inbox'
    and not exists (select 1 from pg_index i
      where i.indrelid = x.oid and i.indisunique
        and (select array_agg(a.attname::text order by a.attname) from pg_attribute a
              where a.attrelid = x.oid and a.attnum = any (i.indkey)) = array['evento_id', 'origem']) $$,
  'GA-10: inbox tem UNIQUE (origem, evento_id)');
select is_empty($$ select s || '.' || f from _funcs where prosrc ~* '(pg_notify|\mnotify\M)' $$,
  'GA-10: nenhuma funcao de modulo usa NOTIFY/pg_notify como fila');

-- GA-11: escrita direta no nucleo
select is_empty($$ select 'public.' || n from unnest(array['parte', 'parte_pessoa', 'parte_organizacao', 'papel_parte',
     'contato', 'endereco', 'consentimento', 'documento', 'produto', 'produto_preco', 'evento']) as n
  where to_regclass('public.' || n) is not null
    and has_table_privilege('authenticated', ('public.' || n)::regclass, 'INSERT,UPDATE,DELETE') $$,
  'GA-11: authenticated sem escrita direta nas tabelas do nucleo (so pela funcao publica)');

-- GA-12: view sem security_invoker
select is_empty($$ select s || '.' || t from _views
  where not coalesce('security_invoker=true' = any (reloptions) or 'security_invoker=on' = any (reloptions), false) $$,
  'GA-12: toda view tem security_invoker');

-- GA-14: papel de agente sem bypass e sem acesso a tabela
select is_empty($$ select rolname from pg_roles where rolname ~ '^agente_' and rolbypassrls $$,
  'GA-14: papel de agente sem BYPASSRLS');
select is_empty($$ select r.rolname || ' -> ' || x.s || '.' || x.t
   from pg_roles r join _tabs x on has_table_privilege(r.oid, x.oid, 'SELECT,INSERT,UPDATE,DELETE')
  where r.rolname ~ '^agente_' $$,
  'GA-14: papel de agente so acessa view ou funcao de contrato, nunca tabela');

-- GA-15: organizacao em tabela nova
select is_empty($$ select x.s || '.' || x.t from _tabs x join pg_attribute a on a.attrelid = x.oid
  where a.attname = 'org_id' and not a.attisdropped
  union all select s || '.' || f from _funcs where f = 'org_atual' $$,
  'GA-15: nenhuma coluna org_id nem org_atual() (1 empresa por banco)');

-- GA-16: DELETE fora da rotina (lista antiga: tarefas de trilha trabalho e usuarios_permissoes)
select is_empty($$ select s || '.' || t from _tabs
  where has_table_privilege('authenticated', oid, 'DELETE')
    and (s || '.' || t) not in ('public.tarefas', 'public.usuarios_permissoes')
    and not exists (select 1 from _exc where guarda = 'GA-16' and objeto = _tabs.s || '.' || _tabs.t) $$,
  'GA-16: DELETE de authenticated so na lista antiga (tarefas, usuarios_permissoes)');

-- GA-17: tabela restrita (COMMENT com restrito=<slug>) so abre pelo slug restrito
select is_empty($$ select x.s || '.' || x.t || ' / ' || p.policyname
   from _tabs x
   join lateral (select substring(obj_description(x.oid, 'pg_class') from 'restrito=([a-z0-9_]+\.[a-z0-9_]+)') as slug) r on r.slug is not null
   join pg_policies p on p.schemaname = x.s and p.tablename = x.t
  where coalesce(p.qual, '') || ' ' || coalesce(p.with_check, '') !~ ('tem_permissao\(''' || r.slug || '''')
     or coalesce(p.qual, '') || ' ' || coalesce(p.with_check, '') ~ ('tem_permissao\(''' || split_part(r.slug, '.', 1) || '\.(read|write|manage)''') $$,
  'GA-17: policy de tabela restrita exige o slug restrito (nunca .read/.write/.manage do modulo)');
select is_empty($$ select 'arquivo.' || c.relname from pg_class c join pg_namespace n on n.oid = c.relnamespace
  where n.nspname = 'arquivo' and c.relkind in ('r', 'p', 'v', 'm')
    and has_table_privilege('authenticated', c.oid, 'SELECT,INSERT,UPDATE,DELETE') $$,
  'GA-17: objeto de arquivo sem grant a authenticated (leitura so por RPC)');

-- GA-18 (ADR-015, ADR-024): modulo essencial nao pode depender de schema ligavel
-- (FK, view, funcao). `public` conta como essencial. O texto da guarda fica numa
-- tabela temporaria pra o teste real e os controles positivos usarem o MESMO SQL.
create temp table _ga18 (sql text not null);
insert into _ga18 values ($$
  with s as (
    select 'public'::text as schema_nome, 'essencial'::text as classe
    union all select m.schema_nome, m.classe from public.modulo m where m.schema_nome is not null
  )
  select 'FK ' || o.nspname || '.' || co.relname || '.' || c.conname || ' -> ' || d.nspname || '.' || cd.relname as achado
    from pg_constraint c
    join pg_class co on co.oid = c.conrelid join pg_namespace o on o.oid = co.relnamespace
    join pg_class cd on cd.oid = c.confrelid join pg_namespace d on d.oid = cd.relnamespace
    join s so on so.schema_nome = o.nspname and so.classe = 'essencial'
    join s sd on sd.schema_nome = d.nspname and sd.classe = 'ligavel'
   where c.contype = 'f'
  union all
  select 'VIEW ' || vn.nspname || '.' || v.relname || ' -> ' || tn.nspname || '.' || t.relname
    from pg_class v
    join pg_namespace vn on vn.oid = v.relnamespace
    join s sv on sv.schema_nome = vn.nspname and sv.classe = 'essencial'
    join pg_rewrite rw on rw.ev_class = v.oid
    join pg_depend d on d.objid = rw.oid and d.classid = 'pg_rewrite'::regclass and d.refclassid = 'pg_class'::regclass
    join pg_class t on t.oid = d.refobjid and t.relkind in ('r', 'p', 'f', 'v', 'm')
    join pg_namespace tn on tn.oid = t.relnamespace
    join s st on st.schema_nome = tn.nspname and st.classe = 'ligavel'
   where v.relkind in ('v', 'm')
  union all
  select 'FUNC ' || pn.nspname || '.' || p.proname || ' -> ' || tn.nspname || '.' || t.relname
    from pg_proc p
    join pg_namespace pn on pn.oid = p.pronamespace
    join s sp on sp.schema_nome = pn.nspname and sp.classe = 'essencial'
    join s st on st.classe = 'ligavel'
    join pg_namespace tn on tn.nspname = st.schema_nome
    join pg_class t on t.relnamespace = tn.oid and t.relkind in ('r', 'p', 'v', 'm')
   where p.proowner = (select oid from pg_roles where rolname = 'postgres')
     and not exists (select 1 from pg_depend dd where dd.objid = p.oid and dd.deptype = 'e')
     and p.prosrc ~* ('\m' || st.schema_nome || '\.' || t.relname || '\M')
$$);

select is_empty((select sql from _ga18),
  'GA-18: nenhum objeto de modulo essencial depende de schema de modulo ligavel (FK, view, funcao)');

-- Controle positivo: hoje nenhum ligavel tem schema instalado, entao a guarda real passa
-- no vazio. Estas sondas criam o ligavel + o objeto proibido numa subtransacao desfeita e
-- exigem que a guarda ACUSE. Sem elas, apagar um ramo da guarda nao reprovava nada.
create function pg_temp.pega(p_setup text, p_tipo text) returns boolean language plpgsql as $$
declare v boolean := false;
begin
  begin
    execute 'insert into public.modulo (slug, nome, descricao, dono, schema_nome, classe, ligado) '
         || $q$ values ('x_lig18', 'sonda', 'sonda GA-18', 'Lider de Dados', 'x_lig18', 'ligavel', false) $q$;
    execute 'create schema x_lig18';
    execute 'create table x_lig18.t (id int primary key)';
    execute p_setup;
    execute 'select exists (select 1 from (' || (select sql from _ga18) || ') g where g.achado like ' || quote_literal(p_tipo || ' %') || ')' into v;
    raise exception 'desfaz' using errcode = 'P0999';
  exception when sqlstate 'P0999' then null;
  end;
  return v;
end $$;

select ok(pg_temp.pega('create table public.x_ess (id int, t_id int references x_lig18.t(id))', 'FK'),
  'GA-18 (controle positivo): essencial com FK para ligavel e acusado');
select ok(pg_temp.pega('create view public.x_v with (security_invoker = true) as select * from x_lig18.t', 'VIEW'),
  'GA-18 (controle positivo): view de essencial sobre tabela de ligavel e acusada');
select ok(pg_temp.pega($f$ create function public.x_f() returns int language sql set search_path = public as 'select count(*)::int from x_lig18.t' $f$, 'FUNC'),
  'GA-18 (controle positivo): funcao de essencial que cita tabela de ligavel e acusada');

select * from finish();
rollback;
