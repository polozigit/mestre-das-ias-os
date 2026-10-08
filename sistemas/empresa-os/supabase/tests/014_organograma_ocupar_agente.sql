-- 014_organograma_ocupar_agente.sql — 0020: organograma.ocupar_posicao_agente (setup coloca agente na posicao).
-- Prova o PRIVILEGIO (so service_role executa; has_function_privilege, nunca chamar sem EXECUTE: a
-- imagem 17.6.1.106 cai com signal 11) e a IDEMPOTENCIA (rodar de novo nao duplica, nao sobrepoe
-- pessoa nem outro agente). Termina em ROLLBACK.
begin;
create extension if not exists pgtap with schema extensions;
set local search_path = public, extensions;

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

create or replace function pg_temp.ocupar(p_agente uuid, p_cargo text) returns text language sql as $$
  select pg_temp.como_servico(format('select organograma.ocupar_posicao_agente(%L, %L)', p_agente, p_cargo))
$$;

create or replace function pg_temp.n_ocup(p_cargo text) returns text language sql as $$
  select count(*)::text from organograma.posicao_ocupacao o
    join organograma.posicao p on p.id = o.posicao_id
    join organograma.org_cargo c on c.id = p.cargo_id
   where c.slug = p_cargo
$$;

insert into public.agentes (id, name, time, descricao_curta, descricao, sandbox, estado, estado_conferido_em) values
  ('abababab-aaaa-4000-8000-0000000012a1', 'agente-t12-a', 'teste', 'Agente A do teste 12', 'Agente A', 'read-only', 'instalado', now()),
  ('abababab-aaaa-4000-8000-0000000012a2', 'agente-t12-b', 'teste', 'Agente B do teste 12', 'Agente B', 'read-only', 'instalado', now());
create temp table _p12 as with i as (insert into public.parte (tipo) values ('pessoa') returning id) select id from i;

select plan(24);

-- ---- 1) privilegio: so o service_role executa ----
select is(has_function_privilege('service_role', 'organograma.ocupar_posicao_agente(uuid, text)', 'EXECUTE'), true,
  'service_role executa organograma.ocupar_posicao_agente');
select is(has_function_privilege('authenticated', 'organograma.ocupar_posicao_agente(uuid, text)', 'EXECUTE'), false,
  'authenticated nao executa organograma.ocupar_posicao_agente');
select is(has_function_privilege('anon', 'organograma.ocupar_posicao_agente(uuid, text)', 'EXECUTE'), false,
  'anon nao executa organograma.ocupar_posicao_agente');
select is((select prosecdef from pg_proc where oid = 'organograma.ocupar_posicao_agente(uuid, text)'::regprocedure), true,
  'a funcao e SECURITY DEFINER (service_role nao tem INSERT na tabela)');
select is(has_table_privilege('service_role', 'organograma.posicao_ocupacao', 'INSERT'), false,
  'service_role continua sem INSERT direto em posicao_ocupacao (so pela funcao)');

-- ---- 2) cargos de teste: inseridos direto (nao pela carga: a carga apaga os cargos de fora do payload e
--         recusa os que ja tem ocupacao, entao nao roda num banco ja semeado, como a homologacao) ----
insert into organograma.org_cargo (slug, tipo, titulo, ordem) values
  ('t12-raiz', 'root', 'Raiz T12', 0),
  ('t12-a', 'cargo', 'Cargo A T12', 1),
  ('t12-b', 'cargo', 'Cargo B T12', 2),
  ('t12-c', 'cargo', 'Cargo C T12', 3),
  ('t12-d', 'cargo', 'Cargo D T12', 4),
  ('t12-e', 'cargo', 'Cargo E T12', 5);
insert into organograma.posicao (cargo_id, ordem)
  select id, 0 from organograma.org_cargo where slug in ('t12-a', 't12-b', 't12-c', 't12-d', 't12-e');
select is((select count(*)::text from organograma.posicao p join organograma.org_cargo c on c.id = p.cargo_id where c.slug like 't12-%'),
  '5', 'os 5 cargos de teste tem a posicao 0 (a raiz nao)');

-- ---- 3) idempotencia ----
select is(pg_temp.ocupar('abababab-aaaa-4000-8000-0000000012a1', 't12-a'), 'inserida', 'posicao vazia: agente entra');
select is(pg_temp.n_ocup('t12-a'), '1', 'uma ocupacao gravada');
select is(pg_temp.ocupar('abababab-aaaa-4000-8000-0000000012a1', 't12-a'), 'ja_ocupa', 'mesma chamada de novo: ja_ocupa');
select is(pg_temp.ocupar('abababab-aaaa-4000-8000-0000000012a1', 't12-a'), 'ja_ocupa', 'e de novo: ja_ocupa');
select is(pg_temp.n_ocup('t12-a'), '1', 'rodar de novo nao duplica a ocupacao');
select is((select vigente_ate is null and vigente_de = current_date from organograma.posicao_ocupacao o
            join organograma.posicao p on p.id = o.posicao_id join organograma.org_cargo c on c.id = p.cargo_id where c.slug = 't12-a'),
  true, 'a ocupacao nasce em aberto, a partir de hoje');

-- ---- 4) nao sobrepoe outro ocupante ----
select is(pg_temp.ocupar('abababab-aaaa-4000-8000-0000000012a2', 't12-a'), 'ocupada_por_outro', 'outro agente na posicao ocupada: pula');
select is(pg_temp.n_ocup('t12-a'), '1', 'a ocupacao do primeiro agente ficou intacta');
select is((select o.agente_id::text from organograma.posicao_ocupacao o join organograma.posicao p on p.id = o.posicao_id
            join organograma.org_cargo c on c.id = p.cargo_id where c.slug = 't12-a'),
  'abababab-aaaa-4000-8000-0000000012a1', 'e continua sendo o primeiro agente');
insert into organograma.posicao_ocupacao (posicao_id, parte_id)
  select p.id, (select id from _p12) from organograma.posicao p join organograma.org_cargo c on c.id = p.cargo_id where c.slug = 't12-b';
select is(pg_temp.ocupar('abababab-aaaa-4000-8000-0000000012a1', 't12-b'), 'ocupada_por_outro', 'posicao ocupada por pessoa: agente nao sobrepoe');
select is(pg_temp.n_ocup('t12-b'), '1', 'so a pessoa continua na posicao');

-- ---- 5) ocupacao encerrada nao bloqueia; borda ----
insert into organograma.posicao_ocupacao (posicao_id, agente_id, vigente_de, vigente_ate)
  select p.id, 'abababab-aaaa-4000-8000-0000000012a2', current_date - 30, current_date - 1
    from organograma.posicao p join organograma.org_cargo c on c.id = p.cargo_id where c.slug = 't12-c';
select is(pg_temp.ocupar('abababab-aaaa-4000-8000-0000000012a1', 't12-c'), 'inserida', 'ocupacao que terminou ontem nao bloqueia');
select is(pg_temp.n_ocup('t12-c'), '2', 'historico mantido e a nova ocupacao somada');

-- ocupacao de outro agente que ainda vai terminar (hoje ou depois) segue bloqueando
insert into organograma.posicao_ocupacao (posicao_id, agente_id, vigente_de, vigente_ate)
  select p.id, 'abababab-aaaa-4000-8000-0000000012a2', current_date - 5, current_date + 3
    from organograma.posicao p join organograma.org_cargo c on c.id = p.cargo_id where c.slug = 't12-e';
select is(pg_temp.ocupar('abababab-aaaa-4000-8000-0000000012a1', 't12-e'), 'ocupada_por_outro',
  'ocupacao de outro com fim futuro ainda bloqueia (nao cai no EXCLUDE)');

-- ---- 6) entradas invalidas ----
select is(pg_temp.ocupar('abababab-aaaa-4000-8000-0000000012a1', 't12-nao-existe'), 'sem_posicao', 'cargo inexistente: sem_posicao');
select is(pg_temp.ocupar('abababab-aaaa-4000-8000-0000000012a1', 't12-raiz'), 'sem_posicao', 'a raiz nao tem posicao: sem_posicao');
select is(pg_temp.como_servico($q$ select organograma.ocupar_posicao_agente(null, 't12-a') $q$), 'ERRO:P0001', 'agente nulo e recusado');
select is(pg_temp.ocupar('abababab-aaaa-4000-8000-0000000012ff', 't12-d'), 'ERRO:23503',
  'agente que nao existe em public.agentes e barrado pela FK (nada e gravado)');

select * from finish();
rollback;
