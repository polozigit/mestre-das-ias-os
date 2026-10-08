-- 003_invariantes.sql — invariantes que moram no banco e valem ate pra service_role:
-- linha unica da empresa, 1 dono, `usuarios.manage` so pelo dono, estrutura da
-- trilha imutavel pela tela, melhoria so aplicada vinda de aprovada,
-- execucoes append-only, marcar_senha_trocada so na propria linha.
begin;
create extension if not exists pgtap with schema extensions;
set local search_path = public, extensions;

create or replace function pg_temp.visto_como(p_uid uuid, p_sql text, p_role text default null)
returns text language plpgsql as $$
declare v text; v_role text := coalesce(p_role, case when p_uid is null then 'anon' else 'authenticated' end);
begin
  perform set_config('request.jwt.claim.sub', coalesce(p_uid::text, ''), true);
  perform set_config('request.jwt.claims', json_build_object('sub', p_uid, 'role', v_role)::text, true);
  execute 'set local role ' || v_role;
  begin
    execute p_sql into v;
  exception when others then
    v := 'ERRO:' || sqlstate;
  end;
  execute 'reset role';
  return v;
end $$;

insert into auth.users (id, email) values
  ('aaaaaaaa-0000-4000-8000-000000000001', 'dono-teste@exemplo.invalid'),
  ('aaaaaaaa-0000-4000-8000-000000000002', 'equipe@exemplo.invalid'),
  ('aaaaaaaa-0000-4000-8000-000000000003', 'leitor@exemplo.invalid'),
  ('aaaaaaaa-0000-4000-8000-000000000005', 'gerente@exemplo.invalid');
insert into public.usuarios (id, nome, email, e_dono, auth_user_id)
values ('00000000-0000-4000-8000-0000000000c1', 'Dono Teste', 'dono-teste@exemplo.invalid', true,
        'aaaaaaaa-0000-4000-8000-000000000001');
-- gerente: nao-dono com usuarios.manage (concedido por maquina: auth.uid() nulo passa no gatilho)
insert into public.usuarios (id, nome, email, auth_user_id)
values ('00000000-0000-4000-8000-0000000000c2', 'Gerente Teste', 'gerente@exemplo.invalid',
        'aaaaaaaa-0000-4000-8000-000000000005');
insert into public.usuarios_permissoes (usuario_id, permissao)
values ('00000000-0000-4000-8000-0000000000c2', 'usuarios.manage');
update public.usuarios set auth_user_id = 'aaaaaaaa-0000-4000-8000-000000000002' where email = 'equipe@exemplo.invalid';
update public.usuarios set auth_user_id = 'aaaaaaaa-0000-4000-8000-000000000003' where email = 'leitor@exemplo.invalid';

select plan(15);

-- G1: 2a empresa (como service_role: constraint nao e pulada por BYPASSRLS)
select is(pg_temp.visto_como(null, $$ insert into public.empresa (id, nome) values (2, 'outra') returning 'ok' $$, 'service_role'),
  'ERRO:23514', 'G1: empresa com id 2 viola o CHECK, ate pra service_role');
select is(pg_temp.visto_como(null, $$ insert into public.empresa (nome) values ('outra') returning 'ok' $$, 'service_role'),
  'ERRO:23505', 'G1: 2a linha com id 1 viola a PK, ate pra service_role');

-- G9: 2o dono, desativar o dono
select is(pg_temp.visto_como(null, $$ insert into public.usuarios (nome, email, e_dono) values ('outro dono', 'outro-dono@exemplo.invalid', true) returning 'ok' $$, 'service_role'),
  'ERRO:23505', 'G9: 2o dono viola o indice unico');
select is(pg_temp.visto_como(null, $$ update public.usuarios set ativo = false where e_dono returning 'ok' $$, 'service_role'),
  'ERRO:P0001', 'G9: desativar o dono levanta excecao, ate pra service_role');

-- G8: nao-dono com usuarios.manage nao concede nem tira usuarios.manage
select is(pg_temp.visto_como('aaaaaaaa-0000-4000-8000-000000000005',
  $$ insert into public.usuarios_permissoes (usuario_id, permissao, concedida_por)
     values ('00000000-0000-4000-8000-0000000000c1', 'usuarios.manage', '00000000-0000-4000-8000-0000000000c2') returning 'ok' $$),
  'ERRO:42501', 'G8: nao-dono NAO concede usuarios.manage');
select is(pg_temp.visto_como('aaaaaaaa-0000-4000-8000-000000000005',
  $$ delete from public.usuarios_permissoes where permissao = 'usuarios.manage' returning 'ok' $$),
  'ERRO:42501', 'G8: nao-dono NAO tira usuarios.manage');
-- ... mas concede outra permissao normalmente, em nome proprio
select is(pg_temp.visto_como('aaaaaaaa-0000-4000-8000-000000000005',
  $$ insert into public.usuarios_permissoes (usuario_id, permissao, concedida_por)
     values ('00000000-0000-4000-8000-0000000000e2', 'agentes.read', '00000000-0000-4000-8000-0000000000c2') returning 'ok' $$),
  'ok', 'quem tem usuarios.manage concede outras permissoes');
-- ... e nao forja a autoria da concessao
select is(pg_temp.visto_como('aaaaaaaa-0000-4000-8000-000000000005',
  $$ insert into public.usuarios_permissoes (usuario_id, permissao, concedida_por)
     values ('00000000-0000-4000-8000-0000000000e2', 'execucoes.read', '00000000-0000-4000-8000-0000000000c1') returning 'ok' $$),
  'ERRO:42501', 'concedida_por forjado e recusado pela policy');

-- G10: estrutura da trilha imutavel pela tela (UPDATE por coluna)
select is(pg_temp.visto_como('aaaaaaaa-0000-4000-8000-000000000002',
  $$ update public.tarefas set trilha = 'trabalho' where chave = 'exemplo.curso-d1-01' returning 'ok' $$),
  'ERRO:42501', 'G10: equipe nao muda a trilha de uma tarefa');
select is(pg_temp.visto_como('aaaaaaaa-0000-4000-8000-000000000002',
  $$ update public.tarefas set status = 'EM_ANDAMENTO' where chave = 'exemplo.curso-d1-01' returning 'ok' $$),
  'ok', 'equipe move o status de uma tarefa de trilha');

-- G13: melhoria proposta -> aplicada recusada pra qualquer papel
select is(pg_temp.visto_como(null,
  $$ update public.melhorias set status = 'aplicada', aplicada_em = now(), commit_sha = 'abc1234'
      where id = '00000000-0000-4000-8000-0000000000f1' returning 'ok' $$, 'service_role'),
  'ERRO:P0001', 'G13: proposta -> aplicada levanta excecao, ate pra service_role');

-- G12: execucoes append-only ate pra service_role
select is(pg_temp.visto_como(null, $$ update public.execucoes_agente set resumo = 'editado' returning 'ok' $$, 'service_role'),
  'ERRO:42501', 'G12: UPDATE em execucoes_agente -> 42501 ate pra service_role');
select is(pg_temp.visto_como(null,
  $$ insert into public.execucoes_agente (agente, iniciado_em, terminado_em, veredito)
     values ('tecnologia-publicar', now(), now(), 'CONCLUIDO') returning 'ok' $$, 'service_role'),
  'ok', 'service_role registra execucao');

-- E3-15: marcar_senha_trocada so mexe na PROPRIA linha
select is(pg_temp.visto_como('aaaaaaaa-0000-4000-8000-000000000003',
  $$ select count(*)::text from (select public.marcar_senha_trocada()) s $$),
  '1', 'leitor chama marcar_senha_trocada');
select results_eq(
  $$ select email from public.usuarios where senha_trocada_em is not null and email like '%@exemplo.invalid' order by email $$,
  $$ values ('leitor@exemplo.invalid'::text) $$,
  'so a linha do leitor foi carimbada');

select * from finish();
rollback;
