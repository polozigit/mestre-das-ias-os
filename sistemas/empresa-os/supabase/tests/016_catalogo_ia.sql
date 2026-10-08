-- 016_catalogo_ia.sql — 0022: catalogo de IA (artefatos_ia + arquivos + relacoes + playbook) e a RPC
-- sincronizar_catalogo_ia. Prova RLS como usuario (com e sem agentes.read), anon fechado, escrita so
-- pela RPC com service_role, idempotencia, aposentar, recusa de segredo e de chave desconhecida.
-- Termina em ROLLBACK.
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
    v := 'ERRO:' || sqlstate || ':' || sqlerrm;
  end;
  execute 'reset role';
  return v;
end $$;

create or replace function pg_temp.sync(p jsonb) returns text language sql as $$
  select pg_temp.como_servico(format('select public.sincronizar_catalogo_ia(%L::jsonb)::text', p))
$$;

-- usuarios: o dono (ve tudo; reaproveita o dono que ja existe, como em homologacao) e um sem permissao.
-- Roda igual no banco local vazio e na homologacao ja semeada (contagens sempre filtradas pelos nomes t16).
insert into auth.users (id, email) values
  ('cccccccc-0000-4000-8000-000000000016', 'dono-t16@exemplo.invalid'),
  ('cccccccc-0000-4000-8000-000000000017', 'sem-perm-t16@exemplo.invalid');
do $$
begin
  if not exists (select 1 from public.usuarios where e_dono) then
    insert into public.usuarios (nome, email, e_dono, auth_user_id)
    values ('Dono T16', 'dono-t16@exemplo.invalid', true, 'cccccccc-0000-4000-8000-000000000016');
  end if;
end $$;
create temp table _dono as
  select coalesce(auth_user_id, 'cccccccc-0000-4000-8000-000000000016'::uuid) as uid from public.usuarios where e_dono;
update public.usuarios set auth_user_id = (select uid from _dono) where e_dono and auth_user_id is null;
insert into public.usuarios (nome, email, e_dono, auth_user_id) values
  ('Sem Perm T16', 'sem-perm-t16@exemplo.invalid', false, 'cccccccc-0000-4000-8000-000000000017');

create temp table _payload as select $j$
{"artefatos":[
  {"tipo":"skill","nome":"t16-skill","time":"teste","origem":"plugin","resumo":"Skill de teste","descricao":"d",
   "formato":"markdown","conteudo":"# t16","caminho":"plugin:t16/skills/t16-skill/SKILL.md",
   "hash":"aaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaa","estado":"instalado",
   "arquivos":[{"caminho":"scripts/a.py","linguagem":"python","conteudo":"print(1)","bytes":8,
                "hash":"bbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbb"}]},
  {"tipo":"workflow","nome":"empresa-os.t16","time":"sistema","origem":"sistema","resumo":"Workflow de teste",
   "gatilho":"push","formato":"yaml","conteudo":"on: push","caminho":"sistemas/empresa-os/.github/workflows/t16.yml",
   "hash":"cccccccccccccccccccccccccccccccccccccccccccccccccccccccccccccccc","estado":"instalado","arquivos":[]}
 ],
 "relacoes":[{"origem_tipo":"workflow","origem_nome":"empresa-os.t16","destino_tipo":"skill","destino_nome":"t16-skill","tipo":"usa"}]
}$j$::jsonb as p;

select plan(43);

-- ---- 1) estrutura e privilegio ----
select has_table('public', 'artefatos_ia', 'artefatos_ia existe');
select has_table('public', 'artefato_arquivos', 'artefato_arquivos existe');
select has_table('public', 'artefato_relacoes', 'artefato_relacoes existe');
select has_table('public', 'artefato_playbook', 'artefato_playbook existe (elo I25, nasce vazia)');
select is(has_function_privilege('service_role', 'public.sincronizar_catalogo_ia(jsonb)', 'EXECUTE'), true, 'service_role executa a RPC');
select is(has_function_privilege('authenticated', 'public.sincronizar_catalogo_ia(jsonb)', 'EXECUTE'), false, 'authenticated nao executa a RPC');
select is(has_function_privilege('anon', 'public.sincronizar_catalogo_ia(jsonb)', 'EXECUTE'), false, 'anon nao executa a RPC');
select is(has_table_privilege('authenticated', 'public.artefatos_ia', 'INSERT'), false, 'authenticated nao insere em artefatos_ia');
select is(has_table_privilege('authenticated', 'public.artefato_arquivos', 'UPDATE'), false, 'authenticated nao altera artefato_arquivos');
select is(has_table_privilege('anon', 'public.artefatos_ia', 'SELECT'), false, 'anon nao le artefatos_ia');
select is(has_table_privilege('anon', 'public.artefato_playbook', 'SELECT'), false, 'anon nao le artefato_playbook');

-- ---- 2) sync, idempotencia ----
select is((pg_temp.sync((select p from _payload))::jsonb)->>'artefatos', '2', '1a sync grava 2 artefatos');
select is((pg_temp.sync((select p from _payload))::jsonb)->>'arquivos', '1', '2a sync regrava 1 arquivo');
select is((select count(*)::text from public.artefatos_ia where nome in ('t16-skill', 'empresa-os.t16')), '2', 'rodar 2x nao duplica artefato');
select is((select count(*)::text from public.artefato_arquivos f join public.artefatos_ia a on a.id = f.artefato_id where a.nome = 't16-skill'), '1', 'rodar 2x nao duplica arquivo');
select is((select count(*)::text from public.artefato_relacoes r join public.artefatos_ia o on o.id = r.origem_id where o.nome = 'empresa-os.t16'), '1', 'rodar 2x nao duplica relacao');

-- ---- 3) RLS como usuario ----
-- GA-06 positivo: artefatos_ia, artefato_arquivos, artefato_relacoes, artefato_playbook
select is(pg_temp.visto_como((select uid from _dono), $q$select count(*)::text from public.artefatos_ia where nome in ('t16-skill','empresa-os.t16')$q$), '2', 'dono le artefatos_ia');
select is(pg_temp.visto_como((select uid from _dono), $q$select count(*)::text from public.artefato_arquivos f join public.artefatos_ia a on a.id = f.artefato_id where a.nome = 't16-skill'$q$), '1', 'dono le artefato_arquivos');
select is(pg_temp.visto_como((select uid from _dono), $q$select count(*)::text from public.artefato_relacoes r join public.artefatos_ia o on o.id = r.origem_id where o.nome = 'empresa-os.t16'$q$), '1', 'dono le artefato_relacoes');
select ok(pg_temp.visto_como((select uid from _dono), 'select count(*)::text from public.artefato_playbook') !~ '^ERRO:', 'dono le artefato_playbook sem erro (nasce vazia)');
-- GA-06 negacao: artefatos_ia, artefato_arquivos, artefato_relacoes, artefato_playbook
select is(pg_temp.visto_como('cccccccc-0000-4000-8000-000000000017', 'select count(*)::text from public.artefatos_ia'), '0', 'sem agentes.read nao ve artefatos_ia');
select is(pg_temp.visto_como('cccccccc-0000-4000-8000-000000000017', 'select count(*)::text from public.artefato_arquivos'), '0', 'sem agentes.read nao ve artefato_arquivos');
select is(pg_temp.visto_como('cccccccc-0000-4000-8000-000000000017', 'select count(*)::text from public.artefato_relacoes'), '0', 'sem agentes.read nao ve artefato_relacoes');
select is(pg_temp.visto_como('cccccccc-0000-4000-8000-000000000017', 'select count(*)::text from public.artefato_playbook'), '0', 'sem agentes.read nao ve artefato_playbook');
select is(pg_temp.visto_como(null, 'select count(*)::text from public.artefatos_ia'), 'ERRO:42501', 'anon recebe permission denied em artefatos_ia');

-- ---- 4) aposentar, payload so com agentes, recusas ----
select is((pg_temp.sync('{"agentes":[]}'::jsonb)::jsonb)->>'aposentados', '0', 'payload sem a chave artefatos nao aposenta nada');
-- (agentes:[] aposenta os agentes do banco de teste; e o contrato da sincronizar_agentes, desfeito no rollback)
select cmp_ok(((pg_temp.sync(jsonb_set((select p from _payload), '{artefatos}', ((select p from _payload)->'artefatos') - 1) - 'relacoes')::jsonb)->>'aposentados')::int,
  '>=', 1, 'artefato que sumiu do payload vira aposentado');
select is((select estado from public.artefatos_ia where nome = 'empresa-os.t16'), 'aposentado', 'o workflow fora do payload ficou aposentado (nao apagado)');
select matches(pg_temp.sync(jsonb_set((select p from _payload), '{artefatos,0,conteudo}', to_jsonb('chave ' || 'sk' || '-' || repeat('a', 12)))),
  '^ERRO:P0001:.*segredo', 'conteudo com segredo e recusado (nada gravado)');
select matches(pg_temp.sync('{"artefatos":[],"invento":1}'::jsonb), '^ERRO:P0001:.*desconhecida', 'chave de topo desconhecida e recusada');
select matches(pg_temp.sync(jsonb_set((select p from _payload), '{relacoes,0,destino_nome}', to_jsonb('t16-nao-existe'::text))),
  '^ERRO:P0001:.*nao resolve', 'relacao com destino inexistente e recusada');
select matches(pg_temp.sync(jsonb_set((select p from _payload), '{artefatos,0,conteudo}', to_jsonb('veja o passo ta' || 'sk' || '-relevantissimo e o ri' || 'sk' || '-assessment01'))),
  '^\{.*"artefatos": 2', 'palavra terminada em sk seguida de hifen (tarefa, risco) NAO e segredo');
select matches(pg_temp.sync(jsonb_set((select p from _payload), '{artefatos,0,conteudo}', to_jsonb('chave=' || 'sk' || '-' || 'proj-' || repeat('a', 20)))),
  '^ERRO:P0001:.*segredo', 'chave sk-proj- e recusada');

-- ---- 5) lotes com `manter` (catalogo grande: o sync manda em varias chamadas) ----
-- manter = o catalogo COMPLETO (todos os lotes). Contagens/estados sempre filtrados pelos nomes t16.
create temp table _m as select
  '[{"tipo":"skill","nome":"t16-skill"},{"tipo":"workflow","nome":"empresa-os.t16"}]'::jsonb as ambos,
  '[{"tipo":"skill","nome":"t16-skill"}]'::jsonb as so_skill,
  (select p from _payload)->'artefatos'->0 as skill,
  (select p from _payload)->'artefatos'->1 as workflow,
  (select p from _payload)->'relacoes' as rel;
-- (a) dois lotes: o workflow ainda nao enviado no lote 1 NAO e aposentado porque esta em manter
select ok(pg_temp.sync(jsonb_build_object('artefatos', jsonb_build_array((select skill from _m)), 'manter', (select ambos from _m))) !~ '^ERRO:',
  'lote 1 (skill + manter dos dois) e aceito');
select is((select estado from public.artefatos_ia where nome = 'empresa-os.t16'), 'instalado', 'lote 1: o workflow que esta em manter e ainda nao veio nao e aposentado');
select ok(pg_temp.sync(jsonb_build_object('artefatos', jsonb_build_array((select workflow from _m)), 'manter', (select ambos from _m))) !~ '^ERRO:',
  'lote 2 (workflow + manter dos dois) e aceito');
select is((select count(*)::text from public.artefatos_ia where nome in ('t16-skill', 'empresa-os.t16') and estado = 'instalado'), '2', 'depois dos 2 lotes os dois estao instalados');
-- (b) lote final so de relacoes (sem a chave artefatos): origem dona vem de manter
select pg_temp.sync(jsonb_build_object('relacoes', '[]'::jsonb, 'manter', (select ambos from _m)));
select is((select count(*)::text from public.artefato_relacoes r join public.artefatos_ia o on o.id = r.origem_id where o.nome = 'empresa-os.t16'), '0',
  'lote com relacoes vazias e manter reescreve (apaga) as relacoes das origens em manter');
select matches(pg_temp.sync(jsonb_build_object('relacoes', (select rel from _m), 'manter', (select ambos from _m))), '^\{.*"relacoes": 1', 'lote final so de relacoes cria a relacao');
select is((select count(*)::text from public.artefato_relacoes r join public.artefatos_ia o on o.id = r.origem_id where o.nome = 'empresa-os.t16'), '1', 'a relacao do lote final existe');
-- (c) manter sozinho aposenta o que nao esta nele (sem a chave artefatos)
select cmp_ok(((pg_temp.sync(jsonb_build_object('manter', (select so_skill from _m)))::jsonb)->>'aposentados')::int, '>=', 1, 'manter sozinho aposenta o que ficou de fora');
select is((select string_agg(nome || ':' || estado, ',' order by nome) from public.artefatos_ia where nome in ('t16-skill', 'empresa-os.t16')),
  'empresa-os.t16:aposentado,t16-skill:instalado', 'manter [skill]: workflow aposentado, skill intacta');
-- (d) origem fora de manter nao resolve
select matches(pg_temp.sync(jsonb_build_object('relacoes', (select rel from _m), 'manter', (select so_skill from _m))), '^ERRO:P0001:.*nao resolve',
  'relacao cuja origem nao esta em manter nao resolve');

select * from finish();
rollback;
