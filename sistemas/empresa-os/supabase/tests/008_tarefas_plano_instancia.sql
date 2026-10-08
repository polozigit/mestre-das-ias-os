-- 008_tarefas_plano_instancia.sql — onda 2A, parte 2 (0016): o modelo vira tarefas.
-- COMO usuario: quem inicia plano, o que a tela pode criar (so trilha trabalho), o que
-- so liga (curso/plano90 ja semeado), as views de contrato e a negacao.
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

-- e1 escritor (tarefas.read + write), e2 leitor (tarefas.read), e3 sem tarefas
insert into auth.users (id, email) values
  ('eeeeeeee-0000-4000-8000-000000000001', 'escritor8@exemplo.invalid'),
  ('eeeeeeee-0000-4000-8000-000000000002', 'leitor8@exemplo.invalid'),
  ('eeeeeeee-0000-4000-8000-000000000003', 'sem8@exemplo.invalid');
insert into public.usuarios (id, nome, email, auth_user_id) values
  ('eeeeeeee-1111-4000-8000-000000000001', 'Escritor 8', 'escritor8@exemplo.invalid', 'eeeeeeee-0000-4000-8000-000000000001'),
  ('eeeeeeee-1111-4000-8000-000000000002', 'Leitor 8', 'leitor8@exemplo.invalid', 'eeeeeeee-0000-4000-8000-000000000002'),
  ('eeeeeeee-1111-4000-8000-000000000003', 'Sem 8', 'sem8@exemplo.invalid', 'eeeeeeee-0000-4000-8000-000000000003');
insert into public.usuarios_permissoes (usuario_id, permissao) values
  ('eeeeeeee-1111-4000-8000-000000000001', 'tarefas.read'),
  ('eeeeeeee-1111-4000-8000-000000000001', 'tarefas.write'),
  ('eeeeeeee-1111-4000-8000-000000000002', 'tarefas.read'),
  ('eeeeeeee-1111-4000-8000-000000000003', 'agentes.read');

-- modelo com etapa de trilha curso (pela maquina), e uma tarefa de curso ja semeada pra um deles
select tarefas.carregar_modelo_plano(jsonb_build_object(
  'chave', 'curso-teste8', 'versao', 1, 'titulo', 'Curso teste', 'caminho_origem', 't.json', 'hash', repeat('8', 64),
  'etapas', jsonb_build_array(jsonb_build_object('chave', 'd1', 'ordem', 1, 'titulo', 'Dia 1', 'trilha', 'curso', 'fase', 'D1',
    'atividades', jsonb_build_array(
      jsonb_build_object('chave', 't8-semeada', 'ordem', 1, 'titulo', 'Ja semeada', 'instrucao', 'Siga a aula 1.', 'aula_ref', 'aula-1', 'prazo_dias', 1),
      jsonb_build_object('chave', 't8-faltando', 'ordem', 2, 'titulo', 'Nao semeada', 'instrucao', 'Siga a aula 2.'))))));
insert into public.tarefas (titulo, trilha, fase, ordem, chave) values ('Ja semeada', 'curso', 'D1', 98010, 'curso.d1.t8-semeada');

create temp table _ids (k text primary key, v bigint);
insert into _ids
  select 'modelo', id from tarefas.plano_modelo where chave = 'exemplo-integracao' and versao = 1
  union all select 'curso', id from tarefas.plano_modelo where chave = 'curso-teste8'
  union all select 'cli', parte_id from public.parte_pessoa where cpf = '52998224725';
create function pg_temp.id(p text) returns bigint language sql as $$ select v from _ids where k = p $$;

select plan(25);

-- =============== positivo ===============
-- GA-06 positivo: tarefas.plano_instancia, tarefas.tarefa_plano
select cmp_ok(pg_temp.visto_como('eeeeeeee-0000-4000-8000-000000000002', format('select count(*)::text from tarefas.%I', t))::int,
  '>=', 1, 'tarefas.read ve tarefas.' || t)
  from unnest(array['plano_instancia', 'tarefa_plano', 'v_tarefa_com_instrucao']) as t;

-- =============== negacao ===============
-- GA-06 negacao: tarefas.plano_instancia, tarefas.tarefa_plano
select is(pg_temp.visto_como('eeeeeeee-0000-4000-8000-000000000003', format('select count(*)::text from tarefas.%I', t)),
  '0', 'sem tarefas.read ve 0 em tarefas.' || t)
  from unnest(array['plano_instancia', 'tarefa_plano', 'v_tarefa_com_instrucao', 'v_fila_agente']) as t;
select is(pg_temp.visto_como('eeeeeeee-0000-4000-8000-000000000002',
  format('select tarefas.instanciar_plano(%s, ''2026-03-02'')::text', pg_temp.id('modelo'))),
  'ERRO:42501', 'leitor (sem tarefas.write) nao inicia plano');
select is(pg_temp.visto_como('eeeeeeee-0000-4000-8000-000000000001',
  $$ insert into tarefas.tarefa_plano (tarefa_id, instancia_id, etapa_modelo_id) values (gen_random_uuid(), 1, 1) returning 'ok' $$),
  'ERRO:42501', 'ninguem da tela escreve em tarefa_plano direto');
select is(has_function_privilege('authenticated', 'tarefas.instanciar_plano_servico(bigint, date, bigint)', 'EXECUTE'),
  false, 'authenticated nao executa a instanciacao de servico (so o servico cria tarefa de trilha)');

-- =============== a tela inicia plano de trabalho ===============
select ok(pg_temp.visto_como('eeeeeeee-0000-4000-8000-000000000001',
  format('select tarefas.instanciar_plano(%s, ''2026-03-02'', %s)::text', pg_temp.id('modelo'), pg_temp.id('cli'))) ~ '^[0-9]+$',
  'tarefas.write inicia o plano de integracao');
select is((select count(*)::int from tarefas.tarefa_plano tp join tarefas.plano_instancia i on i.id = tp.instancia_id
            where i.dono_id = 'eeeeeeee-1111-4000-8000-000000000001'),
  3, 'o plano virou 3 tarefas ligadas ao plano');
select is((select string_agg(t.trilha || ':' || t.prazo::text, ',' order by t.prazo) from public.tarefas t
             join tarefas.tarefa_plano tp on tp.tarefa_id = t.id join tarefas.plano_instancia i on i.id = tp.instancia_id
            where i.dono_id = 'eeeeeeee-1111-4000-8000-000000000001'),
  'trabalho:2026-03-04,trabalho:2026-03-09,trabalho:2026-04-01',
  'prazos relativos ao inicio: 2 corridos, 5 uteis (pula fim de semana), 30 corridos');
select is((select count(*)::int from public.tarefas t join tarefas.tarefa_plano tp on tp.tarefa_id = t.id
             join tarefas.plano_instancia i on i.id = tp.instancia_id
            where i.dono_id = 'eeeeeeee-1111-4000-8000-000000000001' and t.depende_de is not null),
  1, 'a dependencia do modelo virou depende_de entre as tarefas');
select is(pg_temp.visto_como('eeeeeeee-0000-4000-8000-000000000002',
  $$ select instrucao from tarefas.v_tarefa_com_instrucao where titulo = 'Conhecer o time' limit 1 $$),
  'Marque uma conversa curta com cada pessoa do time.', 'o agente le a instrucao pela view de contrato');
select is(pg_temp.visto_como('eeeeeeee-0000-4000-8000-000000000002',
  $$ select count(*)::text from tarefas.v_fila_agente where titulo = 'Fazer a primeira entrega' $$),
  '2', 'a atividade com agente padrao entra na fila do agente (seed + plano novo)');
select is(pg_temp.visto_como('eeeeeeee-0000-4000-8000-000000000002',
  $$ select count(*)::text from tarefas.v_fila_agente where agente_id is null or status in ('CONCLUIDA', 'CANCELADA') $$),
  '0', 'a fila do agente so tem tarefa aberta e com agente');
select cmp_ok((select count(*)::int from tarefas.outbox where tipo = 'tarefas.plano_instanciado'), '>=', 2,
  'iniciar plano publica tarefas.plano_instanciado');

-- =============== trilha curso: a tela so liga, nunca cria ===============
select is(pg_temp.visto_como('eeeeeeee-0000-4000-8000-000000000001',
  format('select tarefas.instanciar_plano(%s, ''2026-03-02'')::text', pg_temp.id('curso'))),
  'ERRO:P0001', 'com uma tarefa de curso nao semeada, a tela recebe excecao');
select is((select count(*)::int from tarefas.plano_instancia where modelo_id = pg_temp.id('curso')),
  0, 'e nada fica pela metade (0 instancias, 0 tarefas)');
select ok(pg_temp.como_servico(format('select tarefas.instanciar_plano_servico(%s, ''2026-03-02'')::text', pg_temp.id('curso'))) ~ '^[0-9]+$',
  'o servico instancia o curso');
select is((select count(*)::int from public.tarefas where chave in ('curso.d1.t8-semeada', 'curso.d1.t8-faltando')),
  2, 'o servico ligou a semeada e criou a que faltava (sem duplicar a semeada)');
select is(pg_temp.como_servico(format('select tarefas.instanciar_plano_servico(%s, ''2026-03-02'')::text', pg_temp.id('curso')))
          = (select id::text from tarefas.plano_instancia where modelo_id = pg_temp.id('curso')),
  true, 'instanciar de novo pelo servico devolve a mesma instancia (idempotente)');

-- =============== apagar tarefa de trabalho tira do plano ===============
select is(pg_temp.visto_como('eeeeeeee-0000-4000-8000-000000000001',
  $$ delete from public.tarefas where titulo = 'Pedir os acessos' and origem_tipo = 'plano'
       and id in (select tarefa_id from tarefas.tarefa_plano tp join tarefas.plano_instancia i on i.id = tp.instancia_id
                   where i.dono_id = 'eeeeeeee-1111-4000-8000-000000000001') returning 'ok' $$),
  'ok', 'a tela apaga tarefa de trabalho nascida do plano');
select is((select count(*)::int from tarefas.tarefa_plano tp join tarefas.plano_instancia i on i.id = tp.instancia_id
            where i.dono_id = 'eeeeeeee-1111-4000-8000-000000000001'),
  2, 'a ligacao com o plano sai junto (ON DELETE CASCADE) e a instancia segue');

select * from finish();
rollback;
