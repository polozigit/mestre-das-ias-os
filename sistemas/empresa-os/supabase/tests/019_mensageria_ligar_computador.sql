BEGIN;
CREATE EXTENSION IF NOT EXISTS pgtap WITH SCHEMA extensions;
SET LOCAL search_path=public,extensions;
SELECT plan(1);
-- Ligar o computador do WhatsApp sem token na tela (migration 20261117120000).
-- Executado dentro de transacao com ROLLBACK, tanto pelo pgTAP quanto pelo harness.
SET LOCAL plpgsql.check_asserts=on;
DO $$ DECLARE r1 jsonb; r2 jsonb; outro jsonb; sem uuid; com uuid; meta uuid; antes bigint; n integer;
BEGIN
 ASSERT NOT has_function_privilege('anon','public.mensageria_ligar_computador(text)','EXECUTE'),'anon nao liga computador';
 ASSERT NOT has_function_privilege('authenticated','public.mensageria_ligar_computador(text)','EXECUTE'),'usuario logado nao liga computador';
 ASSERT has_function_privilege('service_role','public.mensageria_ligar_computador(text)','EXECUTE'),'service_role liga computador';

 INSERT INTO mensageria.instalacao(nome,token_hash) VALUES('Maquina antiga',sha256(convert_to('x','UTF8'))) RETURNING id INTO com;
 INSERT INTO mensageria.conta(nome,provedor,instalacao_id) VALUES('QR ja ligado','baileys',com);
 INSERT INTO mensageria.conta(nome,provedor) VALUES('QR sem computador','baileys') RETURNING id INTO sem;
 INSERT INTO mensageria.conta(nome,provedor) VALUES('Oficial','meta') RETURNING id INTO meta;
 SELECT epoca INTO antes FROM mensageria.conta WHERE id=sem;

 r1:=public.mensageria_ligar_computador('  Computador do atendimento  ');
 ASSERT length(r1->>'token')=64,'token de 64 caracteres';
 ASSERT (r1->>'numeros_ligados')::int=1,'so o numero de QR sem computador foi ligado';
 ASSERT (SELECT instalacao_id FROM mensageria.conta WHERE id=sem)=(r1->>'id')::uuid,'numero de QR sem computador passou para este';
 ASSERT (SELECT epoca FROM mensageria.conta WHERE id=sem)=antes+1,'epoca sobe ao trocar de computador';
 ASSERT (SELECT instalacao_id FROM mensageria.conta WHERE id=meta) IS NULL,'numero oficial nao ganha computador';
 ASSERT (SELECT instalacao_id FROM mensageria.conta WHERE nome='QR ja ligado')=com,'numero ja ligado continua no computador dele';
 ASSERT (SELECT nome FROM mensageria.instalacao WHERE id=(r1->>'id')::uuid)='Computador do atendimento','nome sem espacos nas pontas';
 ASSERT (SELECT token_hash FROM mensageria.instalacao WHERE id=(r1->>'id')::uuid)=sha256(convert_to(r1->>'token','UTF8')),'guarda so o hash do token';
 ASSERT (public.mensageria_dispositivo(r1->>'token','contas','{}'::jsonb)) ? 'contas','o token devolvido abre a API da maquina';

 r2:=public.mensageria_ligar_computador('computador do ATENDIMENTO');
 ASSERT r2->>'id'=r1->>'id','mesmo nome reaproveita a instalacao';
 ASSERT r2->>'token'<>r1->>'token','rodar de novo troca o token';
 SELECT count(*) INTO n FROM mensageria.instalacao WHERE lower(nome)='computador do atendimento';
 ASSERT n=1,'nao duplica instalacao';
 BEGIN
  PERFORM public.mensageria_dispositivo(r1->>'token','contas','{}'::jsonb);
  ASSERT false,'token antigo deveria ter parado';
 EXCEPTION WHEN insufficient_privilege THEN NULL;
 END;

 outro:=public.mensageria_ligar_computador('Servidor');
 ASSERT outro->>'id'<>r1->>'id','nome diferente cria outra instalacao';
 ASSERT (outro->>'numeros_ligados')::int=0,'sem numero solto, nada muda de computador';

 BEGIN
  PERFORM public.mensageria_ligar_computador('   ');
  ASSERT false,'nome vazio deveria falhar';
 EXCEPTION WHEN invalid_parameter_value THEN NULL;
 END;
END $$;
CREATE OR REPLACE FUNCTION pg_temp.como_usuario(p_uid uuid,p_sql text)
RETURNS jsonb LANGUAGE plpgsql AS $$ DECLARE v jsonb; BEGIN
 PERFORM set_config('request.jwt.claim.sub',p_uid::text,true);
 PERFORM set_config('request.jwt.claims',json_build_object('sub',p_uid,'role','authenticated')::text,true);
 SET LOCAL ROLE authenticated;
 BEGIN EXECUTE p_sql INTO v; EXCEPTION WHEN OTHERS THEN v:=jsonb_build_object('erro',SQLSTATE,'mensagem',SQLERRM); END;
 RESET ROLE; RETURN v;
END $$;
INSERT INTO auth.users(id,email) VALUES ('dddddddd-0000-4000-8000-000000000001','leitor-computador@exemplo.invalid');
INSERT INTO public.usuarios(id,auth_user_id,nome,email,e_dono) VALUES ('dddddddd-1111-4000-8000-000000000001','dddddddd-0000-4000-8000-000000000001','Leitor teste','leitor-computador@exemplo.invalid',false);
INSERT INTO public.usuarios_permissoes(usuario_id,permissao) VALUES ('dddddddd-1111-4000-8000-000000000001','mensageria.read');
DO $$ DECLARE dono uuid:=(SELECT auth_user_id FROM public.usuarios WHERE e_dono AND ativo LIMIT 1); leitor uuid:='dddddddd-0000-4000-8000-000000000001';
 pc jsonb; r jsonb; v_qr uuid;
BEGIN
 ASSERT dono IS NOT NULL,'precisa de um dono para o teste';
 ASSERT NOT has_function_privilege('anon','public.mensageria_remover_computador(uuid)','EXECUTE'),'anon nao remove computador';
 INSERT INTO mensageria.conta(nome,provedor) VALUES('QR para remover','baileys') RETURNING id INTO v_qr;
 pc:=public.mensageria_ligar_computador('Computador para remover');
 ASSERT (SELECT instalacao_id FROM mensageria.conta WHERE id=v_qr)=(pc->>'id')::uuid,'numero ligado antes de remover';

 r:=pg_temp.como_usuario(leitor,format('SELECT public.mensageria_remover_computador(%L)',pc->>'id'));
 ASSERT r->>'erro'='42501','quem so le nao remove computador: '||coalesce(r::text,'');
 ASSERT (SELECT ativa FROM mensageria.instalacao WHERE id=(pc->>'id')::uuid),'continua ativo depois da recusa';

 r:=pg_temp.como_usuario(dono,format('SELECT public.mensageria_remover_computador(%L)',pc->>'id'));
 ASSERT r->>'ok'='true' AND (r->>'numeros_soltos')::int=1,'dono remove e solta o numero: '||coalesce(r::text,'');
 ASSERT NOT (SELECT ativa FROM mensageria.instalacao WHERE id=(pc->>'id')::uuid),'computador desativado';
 ASSERT (SELECT instalacao_id FROM mensageria.conta WHERE id=v_qr) IS NULL,'numero volta a pedir computador';
 BEGIN
  PERFORM public.mensageria_dispositivo(pc->>'token','contas','{}'::jsonb);
  ASSERT false,'token do computador removido deveria parar';
 EXCEPTION WHEN insufficient_privilege THEN NULL;
 END;
 r:=pg_temp.como_usuario(dono,$q$SELECT public.mensageria_api('painel','{}'::jsonb)$q$);
 ASSERT r ? 'instalacoes','painel do dono abriu: '||left(coalesce(r::text,''),200);
 ASSERT NOT (r->'instalacoes') @> jsonb_build_array(jsonb_build_object('id',pc->>'id')),'some da lista da tela';

 r:=pg_temp.como_usuario(dono,format('SELECT public.mensageria_remover_computador(%L)',pc->>'id'));
 ASSERT r->>'erro'='P0002','remover de novo avisa que nao existe';
END $$;
DO $$ DECLARE p record; c uuid; cv uuid;
BEGIN
 ASSERT NOT has_function_privilege('anon','public.mensageria_prova()','EXECUTE'),'anon nao le a prova';
 ASSERT NOT has_function_privilege('authenticated','public.mensageria_prova()','EXECUTE'),'usuario logado nao le a prova';
 ASSERT has_function_privilege('service_role','public.mensageria_prova()','EXECUTE'),'service_role le a prova (hook da Casa)';
 ASSERT (SELECT provolatile FROM pg_proc WHERE oid='public.mensageria_prova()'::regprocedure)='s','prova e STABLE (aceita GET no REST)';
 -- Zera so dentro desta transacao (o arquivo termina em ROLLBACK).
 TRUNCATE mensageria.conta CASCADE;
 SELECT * INTO p FROM public.mensageria_prova();
 ASSERT p.numeros_conectados=0 AND p.tem_enviada=false,'sem conta: 0 e false: '||format('%s conectados, enviada=%s',p.numeros_conectados,p.tem_enviada);
 INSERT INTO mensageria.conta(nome,provedor) VALUES('QR desligado','baileys');
 INSERT INTO mensageria.conta(nome,provedor,estado) VALUES('QR ligado','baileys','conectada') RETURNING id INTO c;
 SELECT * INTO p FROM public.mensageria_prova();
 ASSERT p.numeros_conectados=1 AND p.tem_enviada=false,'so a conectada conta: '||format('%s conectados, enviada=%s',p.numeros_conectados,p.tem_enviada);
 INSERT INTO mensageria.conversa(conta_id,jid) VALUES(c,'5500000000000@s.whatsapp.net') RETURNING id INTO cv;
 INSERT INTO mensageria.mensagem(conta_id,conversa_id,direcao,texto) VALUES(c,cv,'recebida','oi');
 SELECT * INTO p FROM public.mensageria_prova();
 ASSERT p.tem_enviada=false,'mensagem recebida nao prova envio';
 INSERT INTO mensageria.mensagem(conta_id,conversa_id,direcao,texto,provedor_id) VALUES(c,cv,'enviada','teste','x1');
 SELECT * INTO p FROM public.mensageria_prova();
 ASSERT p.numeros_conectados=1 AND p.tem_enviada,'enviada aparece: '||format('%s conectados, enviada=%s',p.numeros_conectados,p.tem_enviada);
END $$;
SELECT pass('mensageria_ligar_computador, remover_computador e mensageria_prova: so service_role liga e le a prova, so quem gerencia remove, token para e numeros voltam a pedir computador');
SELECT * FROM finish();
ROLLBACK;
