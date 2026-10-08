-- 007_nucleo.sql — onda 2 (0015): nucleo comum. COMO usuario (nao como postgres):
-- quem le (nucleo.read mascarado, nucleo.pessoal inteiro, titular o proprio), quem
-- escreve (so pelas funcoes), catalogos, consentimento versionado, eventos nucleo.*.
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

-- usuarios: d1 dono, d2 leitor (nucleo.read), d3 pessoal (read + pessoal), d4 crm (crm.read/write),
-- d5 sem nucleo (tarefas.read), d6 titular (sem permissao, ligado a uma Parte), d7 config,
-- d8 produto.write, d9 gestor (nucleo.manage, sem pessoal), d10 login sem cadastro
insert into auth.users (id, email)
select ('dddddddd-0000-4000-8000-0000000000' || lpad(i::text, 2, '0'))::uuid, 'u' || i || '-7@exemplo.invalid'
  from generate_series(1, 10) i;
insert into public.usuarios (id, nome, email, e_dono, auth_user_id)
select ('dddddddd-1111-4000-8000-0000000000' || lpad(i::text, 2, '0'))::uuid, 'Usuario ' || i, 'u' || i || '-7@exemplo.invalid',
       i = 1, ('dddddddd-0000-4000-8000-0000000000' || lpad(i::text, 2, '0'))::uuid
  from generate_series(1, 9) i;
insert into public.usuarios_permissoes (usuario_id, permissao) values
  ('dddddddd-1111-4000-8000-000000000002', 'nucleo.read'),
  ('dddddddd-1111-4000-8000-000000000003', 'nucleo.read'),
  ('dddddddd-1111-4000-8000-000000000003', 'nucleo.pessoal'),
  ('dddddddd-1111-4000-8000-000000000004', 'crm.read'),
  ('dddddddd-1111-4000-8000-000000000004', 'crm.write'),
  ('dddddddd-1111-4000-8000-000000000005', 'tarefas.read'),
  ('dddddddd-1111-4000-8000-000000000007', 'configuracoes.write'),
  ('dddddddd-1111-4000-8000-000000000008', 'produto.write'),
  ('dddddddd-1111-4000-8000-000000000009', 'nucleo.read'),
  ('dddddddd-1111-4000-8000-000000000009', 'nucleo.manage');

-- ids do seed e do titular (como maquina)
create temp table _ids (k text primary key, v bigint);
insert into _ids
  select 'cli', parte_id from public.parte_pessoa where cpf = '52998224725'
  union all select 'forn', parte_id from public.parte_organizacao where cnpj = '11222333000181'
  union all select 'mei', parte_id from public.parte_organizacao where cnpj = '12ABC34501DE35'
  union all select 'prod', id from public.produto where codigo = 'produto-exemplo'
  union all select 'cont', id from public.contato where valor = 'cliente@exemplo.invalid'
  union all select 'cal', id from public.calendario where rotulo = 'padrao';
insert into _ids values ('tit', public.parte_salvar_pessoa(null, 'Titular Teste', null, '12345678909'));
select public.usuario_vincular_parte('dddddddd-1111-4000-8000-000000000006', (select v from _ids where k = 'tit'));

create function pg_temp.id(p text) returns bigint language sql as $$ select v from _ids where k = p $$;

select plan(90);

-- =============== COM permissao (positivo) ===============
-- GA-06 positivo: parte, parte_pessoa, parte_organizacao, papel_parte, contato, endereco, consentimento, documento, tipo_papel, produto, produto_preco, calendario, politica_sla, campo_definicao
select cmp_ok(pg_temp.visto_como('dddddddd-0000-4000-8000-000000000002', format('select count(*)::text from public.%I', t))::int,
  '>=', n, 'nucleo.read ve public.' || t)
  from (values ('parte', 3), ('parte_pessoa', 1), ('parte_organizacao', 2), ('papel_parte', 3), ('contato', 2), ('endereco', 1)) as x(t, n);
select cmp_ok(pg_temp.visto_como('dddddddd-0000-4000-8000-000000000003', 'select count(*)::text from public.consentimento')::int,
  '>=', 1, 'nucleo.pessoal ve consentimento');
select cmp_ok(pg_temp.visto_como('dddddddd-0000-4000-8000-000000000004', 'select count(*)::text from public.documento')::int,
  '>=', 1, 'crm.read ve o documento do modulo crm');
select cmp_ok(pg_temp.visto_como('dddddddd-0000-4000-8000-000000000005', format('select count(*)::text from public.%I', t))::int,
  '>=', 1, 'usuario ativo sem nucleo ve o catalogo public.' || t)
  from unnest(array['tipo_papel', 'produto', 'produto_preco', 'calendario', 'politica_sla', 'campo_definicao']) as t;

-- =============== SEM permissao (negacao) ===============
-- GA-06 negacao: parte, parte_pessoa, parte_organizacao, papel_parte, contato, endereco, consentimento, documento, tipo_papel, produto, produto_preco, calendario, politica_sla, campo_definicao
select is(pg_temp.visto_como('dddddddd-0000-4000-8000-000000000005', format('select count(*)::text from public.%I', t)),
  '0', 'sem nucleo.read ve 0 em public.' || t)
  from unnest(array['parte', 'parte_pessoa', 'parte_organizacao', 'papel_parte', 'contato', 'endereco']) as t;
select is(pg_temp.visto_como('dddddddd-0000-4000-8000-000000000002', 'select count(*)::text from public.consentimento'),
  '0', 'nucleo.read sem o restrito ve 0 em consentimento');
select is(pg_temp.visto_como('dddddddd-0000-4000-8000-000000000002', 'select count(*)::text from public.documento'),
  '0', 'sem crm.read ve 0 no documento do crm');
select is(pg_temp.visto_como('dddddddd-0000-4000-8000-000000000010', format('select count(*)::text from public.%I', t)),
  '0', 'login sem cadastro ve 0 no catalogo public.' || t)
  from unnest(array['tipo_papel', 'produto', 'produto_preco', 'calendario', 'politica_sla', 'campo_definicao']) as t;

-- =============== mascara ===============
select is(pg_temp.visto_como('dddddddd-0000-4000-8000-000000000002', format('select cpf from public.parte_pessoa where parte_id = %s', pg_temp.id('cli'))),
  'ERRO:42501', 'nucleo.read nao le o CPF bruto');
select is(pg_temp.visto_como('dddddddd-0000-4000-8000-000000000002', format('select cpf_mascarado from public.parte_pessoa where parte_id = %s', pg_temp.id('cli'))),
  '***.***.***-25', 'nucleo.read ve o CPF mascarado');
select is(pg_temp.visto_como('dddddddd-0000-4000-8000-000000000002', format('select data_nascimento::text from public.parte_pessoa where parte_id = %s', pg_temp.id('cli'))),
  'ERRO:42501', 'nucleo.read nao le a data de nascimento');
select is(pg_temp.visto_como('dddddddd-0000-4000-8000-000000000002', format('select valor from public.contato where id = %s', pg_temp.id('cont'))),
  'ERRO:42501', 'nucleo.read nao le o contato bruto');
select is(pg_temp.visto_como('dddddddd-0000-4000-8000-000000000002', format('select valor_mascarado from public.contato where id = %s', pg_temp.id('cont'))),
  'c***@exemplo.invalid', 'nucleo.read ve o e-mail mascarado');
select is(pg_temp.visto_como('dddddddd-0000-4000-8000-000000000002',
  format($q$ select valor_mascarado from public.contato where parte_id = %s and tipo = 'whatsapp' $q$, pg_temp.id('cli'))),
  '**********0000', 'nucleo.read ve so os 4 ultimos digitos do telefone');
select is(pg_temp.visto_como('dddddddd-0000-4000-8000-000000000002', format('select logradouro from public.endereco where parte_id = %s', pg_temp.id('cli'))),
  'ERRO:42501', 'nucleo.read nao le o logradouro');
select is(pg_temp.visto_como('dddddddd-0000-4000-8000-000000000002', format('select cep_prefixo || ''/'' || cidade from public.endereco where parte_id = %s', pg_temp.id('cli'))),
  '01001/Sao Paulo', 'nucleo.read ve cidade e prefixo do CEP');
select is(pg_temp.visto_como('dddddddd-0000-4000-8000-000000000002', format('select cnpj_exibicao from public.parte_organizacao where parte_id = %s', pg_temp.id('mei'))),
  '**.***.***/****-35', 'CNPJ de MEI aparece mascarado');
select is(pg_temp.visto_como('dddddddd-0000-4000-8000-000000000002', format('select cnpj_exibicao from public.parte_organizacao where parte_id = %s', pg_temp.id('forn'))),
  '11222333000181', 'CNPJ de empresa (nao MEI) aparece inteiro');
select is(pg_temp.visto_como('dddddddd-0000-4000-8000-000000000002', format('select cnpj from public.parte_organizacao where parte_id = %s', pg_temp.id('forn'))),
  'ERRO:42501', 'a coluna cnpj bruta nao tem grant');
select is(pg_temp.visto_como('dddddddd-0000-4000-8000-000000000002', format('select exibicao || '' '' || cpf_mascarado from public.parte_v where id = %s', pg_temp.id('cli'))),
  'Cliente Exemplo ***.***.***-25', 'parte_v mostra nome social e documento mascarado');
select is(pg_temp.visto_como('dddddddd-0000-4000-8000-000000000002', format('select (public.parte_dados_pessoais(%s))->>''cpf''', pg_temp.id('cli'))),
  'ERRO:42501', 'nucleo.read nao abre o dado pessoal inteiro');
select is(pg_temp.visto_como('dddddddd-0000-4000-8000-000000000009', format('select (public.parte_dados_pessoais(%s))->>''cpf''', pg_temp.id('cli'))),
  'ERRO:42501', 'nucleo.manage NAO abre o restrito nucleo.pessoal');
select is(pg_temp.visto_como('dddddddd-0000-4000-8000-000000000003', format('select (public.parte_dados_pessoais(%s))->>''cpf''', pg_temp.id('cli'))),
  '52998224725', 'nucleo.pessoal ve o CPF inteiro pela funcao');
select is((select count(*)::int from public.atividade where tipo = 'dado_pessoal_lido'
             and (metadata->>'parte_id')::bigint = pg_temp.id('cli')
             and usuario_id = 'dddddddd-1111-4000-8000-000000000003'),
  1, 'a leitura de dado pessoal de terceiro fica registrada (so o id)');

-- =============== titular ===============
select is(pg_temp.visto_como('dddddddd-0000-4000-8000-000000000006', 'select count(*)::text from public.parte'),
  '1', 'titular sem permissao ve so a propria Parte');
select is(pg_temp.visto_como('dddddddd-0000-4000-8000-000000000006', format('select (public.parte_dados_pessoais(%s))->>''cpf''', pg_temp.id('tit'))),
  '12345678909', 'titular ve o proprio dado inteiro');
select is(pg_temp.visto_como('dddddddd-0000-4000-8000-000000000006', format('select (public.parte_dados_pessoais(%s))->>''cpf''', pg_temp.id('cli'))),
  'ERRO:42501', 'titular nao ve o dado de outra pessoa');
select is((select count(*)::int from public.atividade where tipo = 'dado_pessoal_lido' and (metadata->>'parte_id')::bigint = pg_temp.id('tit')),
  0, 'o titular lendo o proprio dado nao gera registro de leitura de terceiro');
select is(pg_temp.visto_como('dddddddd-0000-4000-8000-000000000006', 'select public.parte_atual()::text'),
  pg_temp.id('tit')::text, 'parte_atual() devolve a Parte do usuario logado');

-- =============== escrita so pela funcao ===============
select is(pg_temp.visto_como('dddddddd-0000-4000-8000-000000000002', $$ select public.parte_salvar_pessoa(null, 'Leitor tenta')::text $$),
  'ERRO:42501', 'nucleo.read nao cadastra pessoa');
select ok(pg_temp.visto_como('dddddddd-0000-4000-8000-000000000004', $$ select public.parte_salvar_pessoa(null, 'Lead do CRM', null, '111.444.777-35')::text $$) ~ '^[0-9]+$',
  'crm.write cadastra pessoa pela funcao (modulo com papel de Parte)');
select is(pg_temp.visto_como('dddddddd-0000-4000-8000-000000000004', $$ select public.parte_salvar_pessoa(null, 'CPF errado', null, '111.444.777-36')::text $$),
  'ERRO:23514', 'CPF com digito verificador errado e recusado');
select is(pg_temp.visto_como('dddddddd-0000-4000-8000-000000000004', $$ insert into public.parte (tipo) values ('pessoa') returning 'ok' $$),
  'ERRO:42501', 'GA-11: nem quem escreve no nucleo insere direto na tabela');
select ok(pg_temp.visto_como('dddddddd-0000-4000-8000-000000000004', format($q$ select public.contato_salvar(%s, 'email', '  NOVO@Exemplo.Invalid ')::text $q$, pg_temp.id('cli'))) ~ '^[0-9]+$',
  'crm.write cadastra contato');
select is((select count(*)::int from public.contato where valor = 'novo@exemplo.invalid'), 1, 'e-mail gravado minusculo e sem espaco');
select is(pg_temp.visto_como('dddddddd-0000-4000-8000-000000000004', format($q$ select public.contato_salvar(%s, 'telefone', '11999')::text $q$, pg_temp.id('cli'))),
  'ERRO:23514', 'telefone fora do E.164 e recusado');
select is(pg_temp.visto_como('dddddddd-0000-4000-8000-000000000004', format($q$ select public.papel_parte_iniciar(%s, 'cliente', '2026-06-01')::text $q$, pg_temp.id('cli'))),
  'ERRO:23P01', 'papel cliente sobreposto na mesma Parte e recusado (EXCLUDE)');
select is(pg_temp.visto_como('dddddddd-0000-4000-8000-000000000004', format($q$ select public.papel_parte_iniciar(%s, 'papel_inventado')::text $q$, pg_temp.id('cli'))),
  'ERRO:P0001', 'papel fora do catalogo e recusado');
select is(pg_temp.visto_como('dddddddd-0000-4000-8000-000000000001', $$ insert into public.tipo_papel (slug, rotulo, modulo) values ('x', 'x', 'crm') returning 'ok' $$),
  'ERRO:42501', 'tipo_papel so muda por migration (nem o dono insere)');

-- =============== consentimento versionado ===============
select ok(pg_temp.visto_como('dddddddd-0000-4000-8000-000000000004',
  format($q$ select public.consentimento_registrar(%s, 'email', 'marketing', 'revogado', 'consentimento', %s, 'pedido por resposta')::text $q$,
         pg_temp.id('cli'), pg_temp.id('cont'))) ~ '^[0-9]+$', 'crm.write registra o opt-out');
select is(pg_temp.visto_como('dddddddd-0000-4000-8000-000000000004',
  format($q$ select public.consentimento_vigente(%s, 'email', 'marketing', %s) $q$, pg_temp.id('cli'), pg_temp.id('cont'))),
  'revogado', 'o estado vigente e o da versao mais alta');
select is((select max(versao) from public.consentimento where parte_id = pg_temp.id('cli') and canal = 'email' and finalidade = 'marketing'),
  2, 'o opt-out e uma linha nova (versao 2), nao um UPDATE');
select cmp_ok((select count(*)::int from public.outbox where tipo = 'nucleo.consentimento_alterado'
                 and (payload->>'parte_id')::bigint = pg_temp.id('cli')), '>=', 2,
  'cada mudanca de consentimento publica nucleo.consentimento_alterado');
select is(pg_temp.visto_como('dddddddd-0000-4000-8000-000000000004',
  format($q$ select public.consentimento_vigente(%s, 'sms', 'marketing') $q$, pg_temp.id('cli'))),
  'sem_registro', 'sem registro devolve sem_registro (a mensageria nao envia)');
select is(pg_temp.visto_como('dddddddd-0000-4000-8000-000000000005',
  format($q$ select public.consentimento_vigente(%s, 'email', 'marketing') $q$, pg_temp.id('cli'))),
  'ERRO:42501', 'quem nao le nem escreve no nucleo nao consulta consentimento');
select is(pg_temp.visto_como('dddddddd-0000-4000-8000-000000000004', format($q$ update public.consentimento set estado = 'concedido' where parte_id = %s returning 'ok' $q$, pg_temp.id('cli'))),
  'ERRO:42501', 'consentimento nao se altera (append-only)');

-- =============== documento ===============
select is(pg_temp.visto_como('dddddddd-0000-4000-8000-000000000004',
  $$ select public.documento_registrar('pessoas', 'contrato', 'x.pdf', 'teste/x.pdf', repeat('a', 64))::text $$),
  'ERRO:42501', 'crm.write nao registra documento do modulo pessoas');
select ok(pg_temp.visto_como('dddddddd-0000-4000-8000-000000000004',
  $$ select public.documento_registrar('crm', 'proposta', 'p.pdf', 'teste/p.pdf', repeat('b', 64))::text $$) ~ '^[0-9]+$',
  'crm.write registra documento do crm');

-- =============== produto e preco ===============
select is(pg_temp.visto_como('dddddddd-0000-4000-8000-000000000004', $$ select public.produto_salvar('p-crm', 'x')::text $$),
  'ERRO:42501', 'crm.write nao cadastra produto (dono CPO)');
select ok(pg_temp.visto_como('dddddddd-0000-4000-8000-000000000008', $$ select public.produto_salvar('p-novo', 'Produto novo')::text $$) ~ '^[0-9]+$',
  'produto.write cadastra produto');
select is(pg_temp.visto_como('dddddddd-0000-4000-8000-000000000008', format($q$ select public.produto_preco_definir(%s, 10, '2026-01-01')::text $q$, pg_temp.id('prod'))),
  'ERRO:23P01', 'dois precos vigentes ao mesmo tempo para o mesmo produto e moeda sao recusados');
select ok(pg_temp.visto_como('dddddddd-0000-4000-8000-000000000008', format($q$ select public.produto_preco_definir(%s, 597, '2026-07-01')::text $q$, pg_temp.id('prod'))) ~ '^[0-9]+$',
  'preco novo com data posterior entra');
select is((select count(*)::int from public.produto_preco where produto_id = pg_temp.id('prod') and vigente_ate = '2026-07-01'),
  1, 'o preco anterior foi fechado na data do novo');
select cmp_ok((select count(*)::int from public.outbox where tipo = 'nucleo.produto_alterado'), '>=', 3,
  'cadastro de produto e de preco publicam nucleo.produto_alterado');

-- =============== configuracao: calendario, SLA, campo ===============
select is(pg_temp.visto_como('dddddddd-0000-4000-8000-000000000007', $$ insert into public.calendario (rotulo) values ('filial') returning 'ok' $$),
  'ok', 'configuracoes.write cria calendario');
select is(pg_temp.visto_como('dddddddd-0000-4000-8000-000000000002', $$ insert into public.calendario (rotulo) values ('leitor') returning 'ok' $$),
  'ERRO:42501', 'sem configuracoes.write nao cria calendario');
select is(pg_temp.visto_como('dddddddd-0000-4000-8000-000000000007', $$ delete from public.calendario where rotulo = 'filial' returning 'ok' $$),
  'ERRO:42501', 'ninguem apaga calendario pela tela (GA-16)');
select is(pg_temp.visto_como('dddddddd-0000-4000-8000-000000000007',
  format($q$ select public.somar_dias_uteis(%s, '2026-10-09', 1)::text $q$, pg_temp.id('cal'))),
  '2026-10-13', '1 dia util depois de sexta 09/10 pula o fim de semana e o feriado de 12/10');
select is(pg_temp.visto_como('dddddddd-0000-4000-8000-000000000002',
  $$ insert into public.campo_definicao (entidade, chave, rotulo, tipo) values ('public.parte', 'x', 'x', 'texto') returning 'ok' $$),
  'ERRO:42501', 'sem configuracoes.write nao define campo');
select is(pg_temp.visto_como('dddddddd-0000-4000-8000-000000000007',
  $$ insert into public.campo_definicao (entidade, chave, rotulo, tipo, obrigatorio) values ('crm.lead', 'origem_feira', 'Origem', 'texto', false) returning 'ok' $$),
  'ok', 'configuracoes.write define campo personalizado');

-- =============== campo personalizado validado (ADR-016) ===============
select ok(pg_temp.visto_como('dddddddd-0000-4000-8000-000000000004',
  $$ select public.parte_salvar_pessoa(null, 'Com segmento', null, null, null, '{"segmento": "varejo"}')::text $$) ~ '^[0-9]+$',
  'campo personalizado valido entra');
select is(pg_temp.visto_como('dddddddd-0000-4000-8000-000000000004',
  $$ select public.parte_salvar_pessoa(null, 'Segmento ruim', null, null, null, '{"segmento": "agro"}')::text $$),
  'ERRO:22023', 'valor fora das opcoes e recusado');
select is(pg_temp.visto_como('dddddddd-0000-4000-8000-000000000004',
  $$ select public.parte_salvar_pessoa(null, 'Chave inventada', null, null, null, '{"inventado": 1}')::text $$),
  'ERRO:22023', 'chave nao definida e recusada');

-- =============== mescla e vinculo (nucleo.manage) ===============
select is(pg_temp.visto_como('dddddddd-0000-4000-8000-000000000004', format('select ''ok'' from (select public.parte_mesclar(%s, %s)) s', pg_temp.id('mei'), pg_temp.id('forn'))),
  'ERRO:42501', 'crm.write nao mescla cadastro');
select is(pg_temp.visto_como('dddddddd-0000-4000-8000-000000000009', format('select ''ok'' from (select public.parte_mesclar(%s, %s)) s', pg_temp.id('mei'), pg_temp.id('forn'))),
  'ok', 'nucleo.manage mescla cadastro duplicado');
select is((select count(*)::int from public.outbox where tipo = 'nucleo.parte_mesclada' and (payload->>'parte_antiga')::bigint = pg_temp.id('mei')),
  1, 'a mescla publica nucleo.parte_mesclada');
select is(pg_temp.visto_como('dddddddd-0000-4000-8000-000000000002',
  format($q$ select 'ok' from (select public.usuario_vincular_parte('dddddddd-1111-4000-8000-000000000002', %s)) s $q$, pg_temp.id('cli'))),
  'ERRO:42501', 'sem nucleo.manage nao liga usuario a Parte');

-- =============== validadores e anon ===============
select ok(public.cpf_valido('52998224725') and not public.cpf_valido('52998224724') and not public.cpf_valido('00000000000'),
  'cpf_valido confere os 2 digitos e recusa repeticao');
select ok(public.cnpj_valido('12ABC34501DE35') and public.cnpj_valido('11222333000181') and not public.cnpj_valido('12ABC34501DE36'),
  'cnpj_valido aceita o alfanumerico da Receita e o numerico');
select is(has_function_privilege('anon', 'public.parte_dados_pessoais(bigint)', 'EXECUTE')
       or has_function_privilege('anon', 'public.parte_salvar_pessoa(bigint, text, text, text, date, jsonb)', 'EXECUTE')
       or has_table_privilege('anon', 'public.parte_v', 'SELECT'),
  false, 'anon nao alcanca o nucleo (nem funcao nem view)');

select * from finish();
rollback;
