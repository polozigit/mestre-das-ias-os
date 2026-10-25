-- Ordem de recebimento e leitura individual, sem alterar o contrato RPC v1.
-- Duplicatas tecnicas do eco permanecem auditaveis, fora da thread do operador.
ALTER TABLE mensageria.conversa ADD COLUMN IF NOT EXISTS proxima_ordem bigint NOT NULL DEFAULT 0;
ALTER TABLE mensageria.mensagem ADD COLUMN IF NOT EXISTS ordem bigint NOT NULL DEFAULT 0;
ALTER TABLE mensageria.mensagem ADD COLUMN IF NOT EXISTS historica boolean NOT NULL DEFAULT false;
ALTER TABLE mensageria.mensagem ADD COLUMN IF NOT EXISTS duplicada_de uuid REFERENCES mensageria.mensagem(id);
ALTER TABLE mensageria.leitura ADD COLUMN IF NOT EXISTS ultima_ordem bigint NOT NULL DEFAULT 0;
WITH faltantes AS (SELECT id,row_number() OVER(PARTITION BY conversa_id ORDER BY criada_em,id) AS n,conversa_id FROM mensageria.mensagem WHERE ordem=0),
 maximos AS (SELECT conversa_id,max(ordem) AS n FROM mensageria.mensagem GROUP BY conversa_id)
UPDATE mensageria.mensagem m SET ordem=f.n+coalesce(x.n,0) FROM faltantes f LEFT JOIN maximos x ON x.conversa_id=f.conversa_id WHERE m.id=f.id;
UPDATE mensageria.conversa c SET proxima_ordem=greatest(proxima_ordem,coalesce((SELECT max(m.ordem) FROM mensageria.mensagem m WHERE m.conversa_id=c.id),0));
UPDATE mensageria.leitura l SET ultima_ordem=coalesce((SELECT max(m.ordem) FROM mensageria.mensagem m WHERE m.conversa_id=l.conversa_id AND m.criada_em<=l.lida_em),0) WHERE ultima_ordem=0;
CREATE UNIQUE INDEX IF NOT EXISTS mensagem_ordem_unica ON mensageria.mensagem(conversa_id,ordem);
CREATE INDEX IF NOT EXISTS mensagem_thread_ordem ON mensageria.mensagem(conversa_id,criada_em DESC,ordem DESC) WHERE duplicada_de IS NULL;
CREATE OR REPLACE FUNCTION mensageria.fn_mensagem_ordem() RETURNS trigger LANGUAGE plpgsql SECURITY DEFINER SET search_path='' AS $$
BEGIN
 UPDATE mensageria.conversa SET proxima_ordem=proxima_ordem+1 WHERE id=NEW.conversa_id RETURNING proxima_ordem INTO NEW.ordem;
 RETURN NEW;
END $$;
DROP TRIGGER IF EXISTS trg_mensagem_ordem ON mensageria.mensagem;
CREATE TRIGGER trg_mensagem_ordem BEFORE INSERT ON mensageria.mensagem FOR EACH ROW EXECUTE FUNCTION mensageria.fn_mensagem_ordem();
REVOKE ALL ON FUNCTION mensageria.fn_mensagem_ordem() FROM PUBLIC,anon,authenticated;
COMMENT ON FUNCTION mensageria.fn_mensagem_ordem() IS 'motivo: serializa a ordem somente dentro da conversa; nenhum contador de outro numero e exposto.';
COMMENT ON COLUMN mensageria.conversa.proxima_ordem IS 'classe=nenhum; contador interno da propria conversa.';
COMMENT ON COLUMN mensageria.mensagem.ordem IS 'classe=nenhum; desempate de mensagens com o mesmo horario.';
COMMENT ON COLUMN mensageria.mensagem.historica IS 'classe=nenhum; importacao de historico nao gera nao lidas novas.';
COMMENT ON COLUMN mensageria.mensagem.duplicada_de IS 'classe=nenhum; referencia interna ao registro canonico do eco.';
COMMENT ON COLUMN mensageria.leitura.ultima_ordem IS 'classe=nenhum; marcador de leitura individual, sempre crescente.';

CREATE OR REPLACE FUNCTION mensageria.conversa_json(p_id uuid,p_usuario uuid)
RETURNS jsonb LANGUAGE sql STABLE SECURITY DEFINER SET search_path = '' AS $$
 SELECT to_jsonb(c) || jsonb_build_object(
 'ultima_mensagem',(SELECT left(m.texto,180) FROM mensageria.mensagem m WHERE m.conversa_id=c.id AND m.duplicada_de IS NULL ORDER BY m.criada_em DESC,m.ordem DESC LIMIT 1),
 'nao_lidas',(SELECT count(*) FROM mensageria.mensagem m WHERE m.conversa_id=c.id AND m.direcao='recebida' AND NOT m.historica AND NOT m.apagada AND m.duplicada_de IS NULL
 AND m.ordem>coalesce((SELECT l.ultima_ordem FROM mensageria.leitura l WHERE l.conversa_id=c.id AND l.usuario_id=p_usuario),0)))
 FROM mensageria.conversa c WHERE c.id=p_id;
$$;

CREATE OR REPLACE FUNCTION mensageria.enfileirar(p_conta uuid,p_conversa uuid,p_tipo text,p_conteudo jsonb,p_request text,p_autor uuid,p_origem text DEFAULT 'humano',p_contexto bigint DEFAULT NULL,p_politica bigint DEFAULT NULL)
RETURNS jsonb LANGUAGE plpgsql SECURITY DEFINER SET search_path = '' AS $$
DECLARE v mensageria.comando; c mensageria.conta; cv mensageria.conversa; mid uuid; alvo mensageria.mensagem;
BEGIN
 SELECT * INTO c FROM mensageria.conta WHERE id=p_conta FOR UPDATE;
 IF c.id IS NULL THEN RAISE EXCEPTION 'conta inexistente' USING ERRCODE='22023'; END IF;
 SELECT * INTO v FROM mensageria.comando WHERE conta_id=p_conta AND request_id=p_request;
 IF v.id IS NOT NULL THEN RETURN to_jsonb(v); END IF;
 IF p_tipo NOT IN ('pair','logout','send','reaction','edit','delete','read','history','draft') THEN RAISE EXCEPTION 'comando invalido' USING ERRCODE='22023'; END IF;
 IF p_tipo NOT IN ('pair','logout','history') THEN
  SELECT * INTO cv FROM mensageria.conversa WHERE id=p_conversa AND conta_id=p_conta FOR UPDATE;
  IF cv.id IS NULL THEN RAISE EXCEPTION 'conversa da conta nao encontrada' USING ERRCODE='22023'; END IF;
 END IF;
 IF p_tipo IN ('pair','logout','history') AND c.provedor<>'baileys' THEN RAISE EXCEPTION 'acao indisponivel neste canal' USING ERRCODE='22023'; END IF;
 IF p_tipo='draft' AND c.ia_modo='desligada' THEN RAISE EXCEPTION 'IA desligada' USING ERRCODE='22023'; END IF;
 IF p_tipo IN ('send','reaction','edit','delete','read') THEN
  IF c.provedor='meta' AND (cv.grupo OR p_tipo IN ('edit','delete')) THEN RAISE EXCEPTION 'acao indisponivel neste canal' USING ERRCODE='22023'; END IF;
  IF p_tipo='send' THEN
   IF coalesce(p_conteudo->>'tipo','') NOT IN ('text','image','video','audio','voice','document','sticker','poll','location','contact') AND NOT p_conteudo ? 'template' THEN RAISE EXCEPTION 'tipo de mensagem invalido' USING ERRCODE='22023'; END IF;
   IF p_conteudo->>'tipo'='text' AND NOT p_conteudo ? 'template' AND length(trim(coalesce(p_conteudo->>'texto','')))=0 THEN RAISE EXCEPTION 'texto vazio' USING ERRCODE='22023'; END IF;
   IF length(coalesce(p_conteudo->>'texto',''))>20000 THEN RAISE EXCEPTION 'texto muito grande' USING ERRCODE='22023'; END IF;
   IF p_conteudo->>'tipo' IN ('image','video','audio','voice','document','sticker') THEN
    IF p_conteudo->'anexo' IS NULL THEN RAISE EXCEPTION 'anexo obrigatorio' USING ERRCODE='22023'; END IF;
    PERFORM mensageria.validar_anexo(p_conta,p_conteudo->'anexo');
   END IF;
   IF p_conteudo ? 'citada_id' AND NOT EXISTS(SELECT 1 FROM mensageria.mensagem WHERE id=(p_conteudo->>'citada_id')::uuid AND conversa_id=cv.id) THEN RAISE EXCEPTION 'citacao fora da conversa' USING ERRCODE='42501'; END IF;
   IF p_conteudo ? 'encaminhada_id' THEN
    SELECT * INTO alvo FROM mensageria.mensagem WHERE id=(p_conteudo->>'encaminhada_id')::uuid;
    IF alvo.id IS NULL OR alvo.direcao='interna' OR alvo.apagada OR NOT mensageria.acesso(alvo.conta_id) THEN RAISE EXCEPTION 'encaminhamento nao autorizado' USING ERRCODE='42501'; END IF;
   END IF;
   INSERT INTO mensageria.mensagem(conta_id,conversa_id,direcao,tipo,texto,estado,anexo,citada_id,autor_id)
   VALUES(p_conta,cv.id,'enviada',coalesce(p_conteudo->>'tipo','template'),coalesce(p_conteudo->>'texto',''),'pendente',p_conteudo->'anexo',nullif(p_conteudo->>'citada_id','')::uuid,p_autor) RETURNING id INTO mid;
  ELSE
   IF p_tipo='read' AND NOT (p_conteudo ? 'mensagem_id') THEN
    SELECT * INTO alvo FROM mensageria.mensagem WHERE conversa_id=cv.id AND direcao='recebida' AND provedor_id IS NOT NULL AND duplicada_de IS NULL ORDER BY ordem DESC LIMIT 1;
    p_conteudo:=p_conteudo||jsonb_build_object('mensagem_id',alvo.id);
   ELSE
    SELECT * INTO alvo FROM mensageria.mensagem WHERE id=coalesce(nullif(p_conteudo->>'mensagem_id',''),nullif(p_conteudo->>'id',''))::uuid AND conversa_id=cv.id;
   END IF;
   IF alvo.id IS NULL OR alvo.direcao='interna' OR alvo.provedor_id IS NULL THEN RAISE EXCEPTION 'mensagem alvo invalida' USING ERRCODE='22023'; END IF;
   IF p_tipo IN ('edit','delete') AND alvo.direcao<>'enviada' THEN RAISE EXCEPTION 'somente mensagem enviada pode mudar' USING ERRCODE='42501'; END IF;
   p_conteudo:=p_conteudo || jsonb_build_object('provedor_id',alvo.provedor_id,'participante',alvo.participante,'de_mim',alvo.direcao='enviada');
  END IF;
 END IF;
 INSERT INTO mensageria.comando(conta_id,conversa_id,tipo,conteudo,request_id,autor_id,origem,mensagem_id,contexto_versao,politica_versao)
 VALUES(p_conta,p_conversa,p_tipo,p_conteudo,p_request,p_autor,p_origem,mid,p_contexto,p_politica) RETURNING * INTO v;
 IF c.provedor='meta' AND p_tipo='send' AND p_conteudo->>'tipo'='voice' AND coalesce(p_conteudo->'anexo'->>'mime','') !~ '^audio/(ogg|opus)' THEN
  IF c.instalacao_id IS NULL THEN RAISE EXCEPTION 'Associe uma instalacao para preparar audio oficial' USING ERRCODE='22023'; END IF;
  UPDATE mensageria.comando SET estado='aguardando_midia' WHERE id=v.id RETURNING * INTO v;
  UPDATE mensageria.mensagem SET estado='aguardando_midia' WHERE id=mid;
 END IF;
 IF p_origem='humano' AND p_tipo IN ('send','edit','delete') THEN
  UPDATE mensageria.conversa SET versao=versao+1 WHERE id=p_conversa;
  UPDATE mensageria.rascunho SET estado='obsoleto' WHERE conversa_id=p_conversa AND estado='pendente';
 END IF;
 RETURN to_jsonb(v);
END $$;

CREATE OR REPLACE FUNCTION mensageria.comando_json(p_id uuid)
RETURNS jsonb LANGUAGE sql STABLE SECURITY DEFINER SET search_path = '' AS $$
 SELECT to_jsonb(cmd) || jsonb_build_object('jid',cv.jid,'ultima_recebida_em',cv.ultima_recebida_em,
 'referencia',(SELECT jsonb_build_object('provedor_id',m.provedor_id,'jid',mc.jid,'participante',m.participante,'direcao',m.direcao,'tipo',m.tipo,'texto',m.texto,'anexo',m.anexo,'criada_em',m.criada_em)
 FROM mensageria.mensagem mr JOIN mensageria.mensagem m ON m.id=coalesce(mr.duplicada_de,mr.id) JOIN mensageria.conversa mc ON mc.id=m.conversa_id
 WHERE mr.conta_id=cmd.conta_id AND mr.id=coalesce(coalesce(nullif(cmd.conteudo->>'mensagem_id',''),nullif(cmd.conteudo->>'citada_id',''),nullif(cmd.conteudo->>'encaminhada_id',''),nullif(cmd.conteudo->>'id',''))::uuid,CASE WHEN cmd.tipo='history' THEN (SELECT id FROM mensageria.mensagem WHERE conversa_id=cmd.conversa_id AND provedor_id IS NOT NULL AND duplicada_de IS NULL ORDER BY criada_em,ordem LIMIT 1) END)),
 'contexto',CASE WHEN cmd.tipo='draft' THEN jsonb_build_object('conversa_versao',cv.versao,'politica_versao',c.politica_versao,'instrucoes',c.instrucoes,'regras',c.regras,
 'mensagens',coalesce((SELECT jsonb_agg(jsonb_build_object('direcao',x.direcao,'texto',x.texto,'tipo',x.tipo) ORDER BY x.criada_em,x.ordem)
 FROM (SELECT * FROM mensageria.mensagem WHERE conversa_id=cv.id AND direcao<>'interna' AND NOT apagada AND duplicada_de IS NULL ORDER BY criada_em DESC,ordem DESC LIMIT 20) x),'[]'::jsonb)) ELSE NULL END)
 FROM mensageria.comando cmd LEFT JOIN mensageria.conversa cv ON cv.id=cmd.conversa_id JOIN mensageria.conta c ON c.id=cmd.conta_id WHERE cmd.id=p_id;
$$;

CREATE OR REPLACE FUNCTION mensageria.api(p_operacao text,p_dados jsonb DEFAULT '{}')
RETURNS jsonb LANGUAGE plpgsql SECURITY DEFINER SET search_path = '' AS $$
DECLARE u uuid:=public.usuario_atual(); cid uuid:=nullif(p_dados->>'conta_id','')::uuid;
 cv mensageria.conversa; c mensageria.conta; r mensageria.rascunho; idv uuid; tok text; v jsonb; arr jsonb;
 acao text; before_time timestamptz; before_id uuid; v_antes_ordem bigint; v_lida_ordem bigint; v_texto_aprovado text;
BEGIN
 IF u IS NULL OR NOT public.tem_permissao('mensageria.read') THEN RAISE EXCEPTION 'sem acesso a mensageria' USING ERRCODE='42501'; END IF;
 IF p_operacao='painel' THEN
  RETURN jsonb_build_object(
   'contas',coalesce((SELECT jsonb_agg(mensageria.conta_json(x.id,public.e_dono() OR public.tem_permissao('mensageria.manage')) ORDER BY x.nome) FROM mensageria.conta x WHERE mensageria.acesso(x.id)),'[]'::jsonb),
   'conversas',coalesce((SELECT jsonb_agg(mensageria.conversa_json(x.id,u) ORDER BY x.ultima_em DESC,x.id) FROM (SELECT * FROM mensageria.conversa WHERE mensageria.acesso(conta_id) ORDER BY ultima_em DESC,id LIMIT 500) x),'[]'::jsonb),
   'usuarios',coalesce((SELECT jsonb_agg(jsonb_build_object('id',id,'nome',nome) ORDER BY nome) FROM public.usuarios WHERE ativo),'[]'::jsonb),
   'instalacoes',CASE WHEN public.tem_permissao('mensageria.manage') THEN coalesce((SELECT jsonb_agg(jsonb_build_object('id',id,'nome',nome,'ultima_em',ultima_em)) FROM mensageria.instalacao WHERE ativa),'[]'::jsonb) ELSE '[]'::jsonb END);
 END IF;
 IF p_operacao='instalacao_criar' THEN
  IF NOT public.tem_permissao('mensageria.manage') THEN RAISE EXCEPTION 'sem permissao de gerenciar' USING ERRCODE='42501'; END IF;
  tok:=replace(gen_random_uuid()::text,'-','')||replace(gen_random_uuid()::text,'-','');
  INSERT INTO mensageria.instalacao(nome,token_hash) VALUES(trim(p_dados->>'nome'),sha256(convert_to(tok,'UTF8'))) RETURNING id INTO idv;
  RETURN jsonb_build_object('id',idv,'token',tok);
 END IF;
 IF p_operacao='legado' THEN
  IF NOT public.e_dono() THEN RAISE EXCEPTION 'legado sem numero identificado: somente dono' USING ERRCODE='42501'; END IF;
  RETURN jsonb_build_object('mensagens',coalesce((SELECT jsonb_agg(to_jsonb(x)) FROM (SELECT * FROM public.whatsapp_mensagem ORDER BY ocorrida_em DESC,id DESC LIMIT 50 OFFSET least(greatest(coalesce((p_dados->>'offset')::integer,0),0),100000)) x),'[]'::jsonb),'origem','legado sem conta identificada');
 END IF;
 IF p_operacao='conta_salvar' THEN
  IF NOT public.tem_permissao('mensageria.manage') THEN RAISE EXCEPTION 'sem permissao de gerenciar' USING ERRCODE='42501'; END IF;
  cid:=nullif(p_dados->>'id','')::uuid;
  IF cid IS NULL THEN
   INSERT INTO mensageria.conta(nome,provedor,instalacao_id,telefone,meta_phone_id,capacidades)
   VALUES(trim(p_dados->>'nome'),p_dados->>'provedor',nullif(p_dados->>'instalacao_id','')::uuid,p_dados->>'telefone',nullif(p_dados->>'meta_phone_id',''),
   jsonb_build_object('send',true,'text',true,'image',true,'video',true,'audio',true,'voice',true,'document',true,'sticker',true,'reaction',true,'reply',true,'forward',true,'read',true,'draft',false,'edit',p_dados->>'provedor'='baileys','delete',p_dados->>'provedor'='baileys','groups',p_dados->>'provedor'='baileys','history',p_dados->>'provedor'='baileys','poll',p_dados->>'provedor'='baileys','location',true,'contact',true)) RETURNING id INTO cid;
   INSERT INTO mensageria.membro(conta_id,usuario_id) VALUES(cid,u);
  ELSE
   IF NOT mensageria.acesso(cid,'manage') THEN RAISE EXCEPTION 'conta nao autorizada' USING ERRCODE='42501'; END IF;
   UPDATE mensageria.conta SET nome=coalesce(nullif(trim(p_dados->>'nome'),''),nome),telefone=coalesce(p_dados->>'telefone',telefone),
    instalacao_id=CASE WHEN p_dados ? 'instalacao_id' THEN nullif(p_dados->>'instalacao_id','')::uuid ELSE instalacao_id END,
    meta_phone_id=CASE WHEN p_dados ? 'meta_phone_id' THEN nullif(p_dados->>'meta_phone_id','') ELSE meta_phone_id END,
    runtime_id=CASE WHEN p_dados ? 'instalacao_id' THEN NULL ELSE runtime_id END,
    lease_ate=CASE WHEN p_dados ? 'instalacao_id' THEN NULL ELSE lease_ate END,
    epoca=epoca+CASE WHEN p_dados ? 'instalacao_id' THEN 1 ELSE 0 END
   WHERE id=cid;
  END IF;
  RETURN mensageria.conta_json(cid,true);
 END IF;
 IF p_operacao IN ('conversa','atendimento','ler','nota') THEN
  SELECT * INTO cv FROM mensageria.conversa WHERE id=(p_dados->>'conversa_id')::uuid;
  cid:=cv.conta_id;
 END IF;
 IF p_operacao='rascunho_decidir' THEN
  SELECT * INTO r FROM mensageria.rascunho WHERE id=(p_dados->>'rascunho_id')::uuid;
  cid:=r.conta_id;
  SELECT * INTO cv FROM mensageria.conversa WHERE id=r.conversa_id;
 END IF;
 IF p_operacao='autorizar_media' THEN
  cid:=coalesce(cid,nullif(split_part(p_dados->>'path','/',1),'')::uuid);
 END IF;
 acao:=CASE WHEN p_operacao IN ('conversa','autorizar_media','autorizar_conta') THEN coalesce(p_dados->>'acao','read')
 WHEN p_operacao IN ('membros','ia_configurar') OR (p_operacao='comando' AND p_dados->>'tipo' IN ('pair','logout','history')) THEN 'manage'
 WHEN p_operacao='ler' THEN 'read' ELSE 'write' END;
 IF acao NOT IN ('read','write','manage') OR NOT mensageria.acesso(cid,acao) THEN RAISE EXCEPTION 'conta nao autorizada' USING ERRCODE='42501'; END IF;
 IF p_operacao IN ('conversa','autorizar_media','autorizar_conta','ler') THEN
  SELECT * INTO c FROM mensageria.conta WHERE id=cid;
 ELSE
  SELECT * INTO c FROM mensageria.conta WHERE id=cid FOR UPDATE;
  IF cv.id IS NOT NULL THEN SELECT * INTO cv FROM mensageria.conversa WHERE id=cv.id FOR UPDATE; END IF;
  IF r.id IS NOT NULL THEN SELECT * INTO r FROM mensageria.rascunho WHERE id=r.id FOR UPDATE; END IF;
 END IF;
 IF p_operacao='autorizar_conta' THEN RETURN jsonb_build_object('conta',mensageria.conta_json(cid,false)); END IF;
 IF p_operacao='membros' THEN
  IF jsonb_typeof(p_dados->'usuarios')<>'array' THEN RAISE EXCEPTION 'lista de usuarios obrigatoria' USING ERRCODE='22023'; END IF;
  IF EXISTS(SELECT 1 FROM jsonb_array_elements_text(p_dados->'usuarios') x WHERE NOT EXISTS(SELECT 1 FROM public.usuarios WHERE id=x::uuid AND ativo)) THEN RAISE EXCEPTION 'usuario inativo ou desconhecido' USING ERRCODE='22023'; END IF;
  DELETE FROM mensageria.membro WHERE conta_id=cid;
  INSERT INTO mensageria.membro(conta_id,usuario_id) SELECT cid,x::uuid FROM jsonb_array_elements_text(p_dados->'usuarios') x ON CONFLICT DO NOTHING;
  UPDATE mensageria.conversa SET responsavel_id=NULL,versao=versao+1 WHERE conta_id=cid AND responsavel_id IS NOT NULL AND NOT EXISTS(SELECT 1 FROM mensageria.membro m JOIN public.usuarios u2 ON u2.id=m.usuario_id WHERE m.conta_id=cid AND m.usuario_id=responsavel_id AND u2.ativo);
  UPDATE mensageria.rascunho SET estado='obsoleto' WHERE conta_id=cid AND estado='pendente';
  RETURN jsonb_build_object('ok',true);
 END IF;
 IF p_operacao='conversa_criar' THEN
  IF p_dados->>'jid' !~ '^([0-9]{5,30}(-[0-9]+)?@(s[.]whatsapp[.]net|lid|g[.]us))$' THEN RAISE EXCEPTION 'JID invalido' USING ERRCODE='22023'; END IF;
  IF c.provedor='meta' AND p_dados->>'jid' LIKE '%@g.us' THEN RAISE EXCEPTION 'grupos indisponiveis no canal oficial' USING ERRCODE='22023'; END IF;
  INSERT INTO mensageria.conversa(conta_id,jid,nome,grupo) VALUES(cid,p_dados->>'jid',coalesce(p_dados->>'nome',''),p_dados->>'jid' LIKE '%@g.us')
  ON CONFLICT(conta_id,jid) DO UPDATE SET nome=CASE WHEN EXCLUDED.nome<>'' THEN EXCLUDED.nome ELSE mensageria.conversa.nome END RETURNING id INTO idv;
  RETURN mensageria.conversa_json(idv,u);
 END IF;
 IF p_operacao='conversa' THEN
  before_id:=nullif(p_dados->>'antes','')::uuid;
  SELECT criada_em,ordem INTO before_time,v_antes_ordem FROM mensageria.mensagem WHERE id=before_id AND conversa_id=cv.id;
  IF before_id IS NOT NULL AND before_time IS NULL THEN RAISE EXCEPTION 'cursor invalido' USING ERRCODE='22023'; END IF;
  SELECT coalesce(jsonb_agg(to_jsonb(x) ORDER BY x.criada_em,x.ordem),'[]'::jsonb) INTO arr FROM
   (SELECT * FROM mensageria.mensagem m WHERE conversa_id=cv.id AND duplicada_de IS NULL AND (before_id IS NULL OR (m.criada_em,m.ordem)<(before_time,v_antes_ordem)) ORDER BY m.criada_em DESC,m.ordem DESC LIMIT 50) x;
  RETURN jsonb_build_object('conversa',mensageria.conversa_json(cv.id,u),'mensagens',arr,
   'tem_mais',(SELECT count(*)>50 FROM mensageria.mensagem m WHERE conversa_id=cv.id AND duplicada_de IS NULL AND (before_id IS NULL OR (m.criada_em,m.ordem)<(before_time,v_antes_ordem))),
   'rascunhos',coalesce((SELECT jsonb_agg(to_jsonb(x) ORDER BY criada_em) FROM mensageria.rascunho x WHERE conversa_id=cv.id AND estado='pendente'),'[]'::jsonb));
 END IF;
 IF p_operacao='ler' THEN
  IF nullif(p_dados->>'ate_mensagem_id','') IS NOT NULL THEN
   SELECT ordem INTO v_lida_ordem FROM mensageria.mensagem WHERE id=(p_dados->>'ate_mensagem_id')::uuid AND conversa_id=cv.id;
   IF v_lida_ordem IS NULL THEN RAISE EXCEPTION 'mensagem de leitura fora da conversa' USING ERRCODE='42501'; END IF;
  ELSE SELECT coalesce(max(ordem),0) INTO v_lida_ordem FROM mensageria.mensagem WHERE conversa_id=cv.id;
  END IF;
  INSERT INTO mensageria.leitura(conversa_id,usuario_id,lida_em,ultima_ordem) VALUES(cv.id,u,clock_timestamp(),v_lida_ordem)
  ON CONFLICT(conversa_id,usuario_id) DO UPDATE SET lida_em=EXCLUDED.lida_em,ultima_ordem=greatest(mensageria.leitura.ultima_ordem,EXCLUDED.ultima_ordem);
  RETURN jsonb_build_object('ok',true);
 END IF;
 IF p_operacao='atendimento' THEN
  IF p_dados ? 'responsavel_id' AND nullif(p_dados->>'responsavel_id','') IS NOT NULL AND NOT EXISTS(SELECT 1 FROM mensageria.membro m JOIN public.usuarios us ON us.id=m.usuario_id WHERE m.conta_id=cid AND m.usuario_id=(p_dados->>'responsavel_id')::uuid AND us.ativo) THEN RAISE EXCEPTION 'responsavel nao e membro ativo' USING ERRCODE='22023'; END IF;
  UPDATE mensageria.conversa SET estado=coalesce(p_dados->>'estado',estado),responsavel_id=CASE WHEN p_dados ? 'responsavel_id' THEN nullif(p_dados->>'responsavel_id','')::uuid ELSE responsavel_id END,versao=versao+1 WHERE id=cv.id;
  UPDATE mensageria.rascunho SET estado='obsoleto' WHERE conversa_id=cv.id AND estado='pendente';
  RETURN mensageria.conversa_json(cv.id,u);
 END IF;
 IF p_operacao='nota' THEN
  IF length(trim(coalesce(p_dados->>'texto','')))=0 THEN RAISE EXCEPTION 'nota vazia' USING ERRCODE='22023'; END IF;
  INSERT INTO mensageria.mensagem(conta_id,conversa_id,provedor_id,direcao,texto,estado,autor_id) VALUES(cid,cv.id,'nota:'||(p_dados->>'request_id'),'interna',p_dados->>'texto','interna',u)
  ON CONFLICT(conta_id,conversa_id,participante,provedor_id) DO UPDATE SET provedor_id=EXCLUDED.provedor_id RETURNING to_jsonb(mensageria.mensagem) INTO v;
  RETURN v;
 END IF;
 IF p_operacao='comando' THEN
  IF p_dados->>'tipo' IN ('send','reaction','edit','delete','read','draft') AND NOT coalesce((c.capacidades->>CASE p_dados->>'tipo' WHEN 'send' THEN 'send' ELSE p_dados->>'tipo' END)::boolean,false) THEN RAISE EXCEPTION 'funcionalidade indisponivel nesta conta' USING ERRCODE='22023'; END IF;
  RETURN mensageria.enfileirar(cid,nullif(p_dados->>'conversa_id','')::uuid,p_dados->>'tipo',coalesce(p_dados->'conteudo','{}'::jsonb),p_dados->>'request_id',u);
 END IF;
 IF p_operacao IN ('autorizar_media','upload_registrar') THEN
  PERFORM mensageria.validar_path(cid,p_dados->>'path');
  IF p_operacao='upload_registrar' THEN
   INSERT INTO mensageria.arquivo(path,conta_id,conversa_id,nome,mime,bytes) VALUES(p_dados->>'path',cid,nullif(p_dados->>'conversa_id','')::uuid,p_dados->>'nome',p_dados->>'mime',(p_dados->>'bytes')::bigint);
   RETURN jsonb_build_object('path',p_dados->>'path','nome',p_dados->>'nome','mime',p_dados->>'mime','bytes',(p_dados->>'bytes')::bigint);
  END IF;
  IF acao='read' AND NOT EXISTS(SELECT 1 FROM mensageria.arquivo WHERE path=p_dados->>'path' AND conta_id=cid) THEN RAISE EXCEPTION 'arquivo nao registrado' USING ERRCODE='42501'; END IF;
  RETURN jsonb_build_object('conta_id',cid,'path',p_dados->>'path');
 END IF;
 IF p_operacao='ia_configurar' THEN
  IF NOT public.e_dono() THEN RAISE EXCEPTION 'somente dono configura autonomia' USING ERRCODE='42501'; END IF;
  IF jsonb_typeof(coalesce(p_dados->'regras','[]'))<>'array' OR length(coalesce(p_dados->>'instrucoes',''))>100000 THEN RAISE EXCEPTION 'politica invalida' USING ERRCODE='22023'; END IF;
  UPDATE mensageria.conta SET ia_modo=p_dados->>'modo',instrucoes=coalesce(p_dados->>'instrucoes',''),regras=coalesce(p_dados->'regras','[]'),politica_versao=politica_versao+1 WHERE id=cid RETURNING * INTO c;
  INSERT INTO mensageria.politica(conta_id,versao,instrucoes,regras,modo,autor_id) VALUES(cid,c.politica_versao,c.instrucoes,c.regras,c.ia_modo,u);
  UPDATE mensageria.rascunho SET estado='obsoleto' WHERE conta_id=cid AND estado='pendente';
  RETURN mensageria.conta_json(cid,true);
 END IF;
 IF p_operacao='rascunho_decidir' THEN
  IF r.estado<>'pendente' OR r.conversa_versao<>cv.versao OR r.politica_versao<>c.politica_versao THEN RAISE EXCEPTION 'rascunho obsoleto; gere novamente' USING ERRCODE='40001'; END IF;
  IF p_dados->>'decisao' NOT IN ('aprovar','reprovar') THEN RAISE EXCEPTION 'decisao invalida' USING ERRCODE='22023'; END IF;
  v_texto_aprovado:=coalesce(p_dados->>'texto',r.texto);
  INSERT INTO mensageria.feedback(rascunho_id,usuario_id,decisao,texto_aprovado,feedback) VALUES(r.id,u,p_dados->>'decisao',CASE WHEN p_dados->>'decisao'='aprovar' THEN v_texto_aprovado END,left(p_dados->>'feedback',20000));
  UPDATE mensageria.rascunho SET estado=CASE WHEN p_dados->>'decisao'='aprovar' THEN 'aprovado' ELSE 'reprovado' END,decisor_id=u WHERE id=r.id;
  IF p_dados->>'decisao'='aprovar' THEN RETURN mensageria.enfileirar(cid,cv.id,'send',jsonb_build_object('tipo','text','texto',v_texto_aprovado),p_dados->>'request_id',u,'rascunho',cv.versao,c.politica_versao); END IF;
  RETURN jsonb_build_object('ok',true);
 END IF;
 RAISE EXCEPTION 'operacao desconhecida' USING ERRCODE='22023';
END $$;

CREATE OR REPLACE FUNCTION mensageria.maquina(p_instalacao uuid,p_operacao text,p_dados jsonb,p_servico boolean DEFAULT false)
RETURNS jsonb LANGUAGE plpgsql SECURITY DEFINER SET search_path = '' AS $$
DECLARE cid uuid:=nullif(p_dados->>'conta_id','')::uuid; c mensageria.conta; cv mensageria.conversa; q mensageria.comando;
 rt text:=p_dados->>'runtime_id'; ep bigint:=nullif(p_dados->>'epoca','')::bigint;
 v jsonb; m jsonb; rid uuid; mid uuid; total integer:=0; prioridade integer; st text; pv bigint; texto text; ultima text; regra jsonb; automatico boolean:=false;
 cursor_row record; v_eco mensageria.mensagem; v_existente mensageria.mensagem;
BEGIN
 IF p_operacao='contas' THEN
  RETURN jsonb_build_object('contas',coalesce((SELECT jsonb_agg(mensageria.conta_json(id,true)) FROM mensageria.conta WHERE (p_servico AND provedor='meta') OR (instalacao_id=p_instalacao)),'[]'::jsonb));
 END IF;
 IF p_operacao='midias_pendentes' AND NOT p_servico THEN
  IF length(coalesce(rt,'')) NOT BETWEEN 8 AND 100 THEN RAISE EXCEPTION 'runtime invalido' USING ERRCODE='22023'; END IF;
  v:='[]';
  FOR cursor_row IN SELECT cmd.id FROM mensageria.comando cmd JOIN mensageria.conta cc ON cc.id=cmd.conta_id
   WHERE cc.instalacao_id=p_instalacao AND cc.provedor='meta' AND cmd.tipo='send' AND cmd.conteudo->>'tipo'='voice'
   AND (cmd.estado='aguardando_midia' OR (cmd.estado='preparando_midia' AND cmd.midia_ate<clock_timestamp())) ORDER BY cmd.criada_em LIMIT 5 FOR UPDATE OF cmd SKIP LOCKED LOOP
    UPDATE mensageria.comando SET estado='preparando_midia',midia_runtime_id=rt,midia_ate=clock_timestamp()+interval '2 minutes' WHERE id=cursor_row.id RETURNING * INTO q;
    v:=v||jsonb_build_array(jsonb_build_object('id',q.id,'conta_id',q.conta_id,'conteudo',q.conteudo));
  END LOOP;
  RETURN jsonb_build_object('comandos',v);
 END IF;
 SELECT * INTO c FROM mensageria.conta WHERE id=cid FOR UPDATE;
 IF c.id IS NULL OR (NOT p_servico AND c.instalacao_id IS DISTINCT FROM p_instalacao) OR (p_servico AND c.provedor<>'meta') THEN RAISE EXCEPTION 'conta fora da instalacao' USING ERRCODE='42501'; END IF;
 IF c.provedor='meta' AND NOT p_servico AND p_operacao IN ('midia_preparada','midia_falhou','autorizar_media','media_upload') THEN
  IF p_operacao IN ('autorizar_media','media_upload') THEN
   PERFORM mensageria.validar_path(cid,p_dados->>'path');
   IF p_operacao='media_upload' THEN
    INSERT INTO mensageria.arquivo(path,conta_id,nome,mime,bytes) VALUES(p_dados->>'path',cid,p_dados->>'nome',p_dados->>'mime',(p_dados->>'bytes')::bigint) ON CONFLICT(path) DO NOTHING;
    RETURN jsonb_build_object('path',p_dados->>'path','nome',p_dados->>'nome','mime',p_dados->>'mime','bytes',(p_dados->>'bytes')::bigint);
   END IF;
   IF coalesce(p_dados->>'acao','read')='read' AND NOT EXISTS(SELECT 1 FROM mensageria.arquivo WHERE path=p_dados->>'path' AND conta_id=cid) THEN RAISE EXCEPTION 'arquivo nao registrado' USING ERRCODE='42501'; END IF;
   RETURN jsonb_build_object('ok',true);
  END IF;
  SELECT * INTO q FROM mensageria.comando WHERE conta_id=cid AND id=(p_dados->>'comando_id')::uuid FOR UPDATE;
  IF q.id IS NULL OR q.estado<>'preparando_midia' OR q.midia_runtime_id IS DISTINCT FROM rt OR q.midia_ate IS NULL OR q.midia_ate<=clock_timestamp() THEN RAISE EXCEPTION 'preparacao expirada' USING ERRCODE='40001'; END IF;
  IF p_operacao='midia_preparada' THEN
   PERFORM mensageria.validar_anexo(cid,p_dados->'anexo');
   IF p_dados->'anexo'->>'mime' <> 'audio/ogg' THEN RAISE EXCEPTION 'audio precisa de OGG Opus' USING ERRCODE='22023'; END IF;
   UPDATE mensageria.comando SET conteudo=jsonb_set(conteudo,'{anexo}',p_dados->'anexo'),estado='pendente',midia_ate=NULL WHERE id=q.id;
   UPDATE mensageria.mensagem SET anexo=p_dados->'anexo',estado='pendente' WHERE id=q.mensagem_id;
  ELSE
   UPDATE mensageria.comando SET estado='falhou',erro=left(p_dados->>'erro',500) WHERE id=q.id;
   UPDATE mensageria.mensagem SET estado='falhou' WHERE id=q.mensagem_id;
  END IF;
  RETURN jsonb_build_object('ok',true);
 END IF;
 IF p_operacao IN ('contexto','propor_rascunho') THEN
  SELECT * INTO cv FROM mensageria.conversa WHERE id=(p_dados->>'conversa_id')::uuid AND conta_id=cid FOR UPDATE;
  IF cv.id IS NULL THEN RAISE EXCEPTION 'conversa fora da instalacao' USING ERRCODE='42501'; END IF;
  IF p_operacao='contexto' THEN
   RETURN jsonb_build_object('conversa_versao',cv.versao,'politica_versao',c.politica_versao,'ia_modo',c.ia_modo,'instrucoes',c.instrucoes,
    'mensagens',coalesce((SELECT jsonb_agg(to_jsonb(x) ORDER BY x.criada_em,x.ordem) FROM (SELECT id,direcao,tipo,texto,criada_em,ordem FROM mensageria.mensagem WHERE conversa_id=cv.id AND direcao<>'interna' AND NOT apagada AND duplicada_de IS NULL ORDER BY criada_em DESC,ordem DESC LIMIT 20) x),'[]'::jsonb));
  END IF;
  IF c.ia_modo='desligada' OR cv.versao IS DISTINCT FROM (p_dados->>'conversa_versao')::bigint OR c.politica_versao IS DISTINCT FROM (p_dados->>'politica_versao')::bigint THEN RAISE EXCEPTION 'IA desligada ou contexto obsoleto' USING ERRCODE='40001'; END IF;
  IF length(trim(coalesce(p_dados->>'texto',''))) NOT BETWEEN 1 AND 4096 THEN RAISE EXCEPTION 'rascunho invalido' USING ERRCODE='22023'; END IF;
  INSERT INTO mensageria.rascunho(conta_id,conversa_id,conversa_versao,politica_versao,texto,sensivel,estado) VALUES(cid,cv.id,cv.versao,c.politica_versao,p_dados->>'texto',true,'pendente') RETURNING id INTO rid;
  RETURN jsonb_build_object('id',rid,'estado','pendente','automatico',false);
 END IF;
 IF c.provedor='meta' AND NOT p_servico THEN RAISE EXCEPTION 'dispositivo nao despacha mensagens oficiais' USING ERRCODE='42501'; END IF;
 IF p_operacao='lease' THEN
  IF rt IS NULL OR length(rt) NOT BETWEEN 8 AND 100 THEN RAISE EXCEPTION 'runtime invalido' USING ERRCODE='22023'; END IF;
  IF c.lease_ate>clock_timestamp() AND c.runtime_id IS DISTINCT FROM rt THEN RAISE EXCEPTION 'conta ocupada por outro runtime' USING ERRCODE='40001'; END IF;
  UPDATE mensageria.conta SET runtime_id=rt,epoca=epoca+CASE WHEN runtime_id IS DISTINCT FROM rt OR lease_ate IS NULL OR lease_ate<=clock_timestamp() THEN 1 ELSE 0 END,lease_ate=clock_timestamp()+interval '90 seconds' WHERE id=cid RETURNING * INTO c;
  RETURN jsonb_build_object('epoca',c.epoca,'ate',c.lease_ate);
 END IF;
 -- Meta webhooks são eventos autenticados pela assinatura, não assumem lease de envio.
 IF NOT (p_servico AND p_operacao IN ('evento','recibo','media_upload','autorizar_media')) THEN
  IF rt IS NULL OR ep IS NULL OR c.runtime_id IS DISTINCT FROM rt OR c.epoca<>ep OR c.lease_ate IS NULL OR c.lease_ate<=clock_timestamp() THEN RAISE EXCEPTION 'lease expirado ou substituido' USING ERRCODE='40001'; END IF;
 END IF;
 IF p_operacao='liberar_lease' THEN
  IF EXISTS(SELECT 1 FROM mensageria.comando WHERE conta_id=cid AND estado='processando' AND runtime_id=rt AND epoca=ep) THEN RAISE EXCEPTION 'comando ainda em execucao' USING ERRCODE='40001'; END IF;
  UPDATE mensageria.conta SET lease_ate=clock_timestamp() WHERE id=cid;
  RETURN jsonb_build_object('ok',true);
 END IF;
 IF p_operacao='estado' THEN
  IF coalesce(p_dados->>'estado','') NOT IN ('desconectada','conectando','qr','conectada','pausada','erro','aguardando_qr') THEN RAISE EXCEPTION 'estado invalido' USING ERRCODE='22023'; END IF;
  UPDATE mensageria.conta SET estado=p_dados->>'estado',telefone=coalesce(p_dados->>'telefone',telefone),qr=left(p_dados->>'qr',20000),erro=left(p_dados->>'erro',500),capacidades=coalesce(p_dados->'capacidades',capacidades) WHERE id=cid;
  RETURN jsonb_build_object('ok',true);
 END IF;
 IF p_operacao='auth_ler' THEN
  RETURN coalesce((SELECT jsonb_build_object('versao',versao,'dados',dados) FROM mensageria.auth_estado WHERE conta_id=cid),jsonb_build_object('versao',0,'dados',NULL));
 END IF;
 IF p_operacao='auth_salvar' THEN
  IF p_dados->'dados' IS NULL OR coalesce(p_dados->'dados'->>'v','')<>'1' OR coalesce(length(p_dados->'dados'->>'iv'),0)<>16 OR coalesce(length(p_dados->'dados'->>'tag'),0)<>24 OR coalesce(p_dados->'dados'->>'data','')='' OR octet_length((p_dados->'dados')::text)>10485760 THEN RAISE EXCEPTION 'estado cifrado invalido' USING ERRCODE='22023'; END IF;
  INSERT INTO mensageria.auth_estado(conta_id,versao,dados) VALUES(cid,0,'null') ON CONFLICT DO NOTHING;
  UPDATE mensageria.auth_estado SET versao=versao+1,dados=p_dados->'dados',atualizada_em=clock_timestamp() WHERE conta_id=cid AND versao=(p_dados->>'versao')::bigint RETURNING versao INTO pv;
  IF pv IS NULL THEN RAISE EXCEPTION 'versao de auth obsoleta' USING ERRCODE='40001'; END IF;
  RETURN jsonb_build_object('versao',pv);
 END IF;
 IF p_operacao='claim' THEN
  UPDATE mensageria.comando SET estado='incerto',erro='runtime interrompido; reconciliar antes de reenviar' WHERE conta_id=cid AND estado='processando' AND (runtime_id IS DISTINCT FROM rt OR epoca IS DISTINCT FROM ep OR claim_em<clock_timestamp()-interval '90 seconds');
  UPDATE mensageria.mensagem m SET estado='incerto' FROM mensageria.comando cmd WHERE cmd.conta_id=cid AND cmd.estado='incerto' AND cmd.mensagem_id=m.id AND m.estado IN ('pendente','processando');
  v:='[]';
  FOR cursor_row IN SELECT id FROM mensageria.comando WHERE conta_id=cid AND estado='pendente' ORDER BY criada_em,id LIMIT 10 FOR UPDATE SKIP LOCKED LOOP
   UPDATE mensageria.comando SET estado='processando',runtime_id=rt,epoca=ep,claim_em=clock_timestamp() WHERE id=cursor_row.id;
   BEGIN
    m:=mensageria.validar_despacho(cursor_row.id,rt,ep);
    v:=v||jsonb_build_array(m);
   EXCEPTION WHEN serialization_failure OR insufficient_privilege THEN
    UPDATE mensageria.comando SET estado='cancelado',erro='autorizacao ou contexto mudou antes do envio' WHERE id=cursor_row.id;
    UPDATE mensageria.mensagem SET estado='cancelado' WHERE id=(SELECT mensagem_id FROM mensageria.comando WHERE id=cursor_row.id);
   END;
  END LOOP;
  RETURN jsonb_build_object('comandos',v);
 END IF;
 IF p_operacao='validar_comando' THEN
  IF NOT EXISTS(SELECT 1 FROM mensageria.comando WHERE id=(p_dados->>'comando_id')::uuid AND conta_id=cid) THEN RAISE EXCEPTION 'comando fora da conta' USING ERRCODE='42501'; END IF;
  RETURN mensageria.validar_despacho((p_dados->>'comando_id')::uuid,rt,ep);
 END IF;
 IF p_operacao='resultado' THEN
  SELECT * INTO q FROM mensageria.comando WHERE id=(p_dados->>'comando_id')::uuid AND conta_id=cid FOR UPDATE;
  IF q.id IS NULL THEN RAISE EXCEPTION 'comando fora desta conta' USING ERRCODE='42501'; END IF;
  IF q.runtime_id IS DISTINCT FROM rt OR q.epoca IS DISTINCT FROM ep THEN
   -- ACK já durável no spool sobrevive a reinício. Nunca volta a enviar o comando.
   IF q.estado IN ('processando','incerto') AND p_dados->>'estado'='enviado' AND length(coalesce(p_dados->>'provedor_id',''))>0 THEN
    UPDATE mensageria.comando SET estado='processando',runtime_id=rt,epoca=ep,erro=NULL WHERE id=q.id RETURNING * INTO q;
   ELSE RETURN jsonb_build_object('ok',true,'reconciliado',true);
   END IF;
  END IF;
  st:=p_dados->>'estado';
  IF st NOT IN ('enviado','falhou','incerto','cancelado') THEN RAISE EXCEPTION 'resultado invalido' USING ERRCODE='22023'; END IF;
  IF q.estado<>'processando' THEN
   IF q.estado=st AND q.provedor_id IS NOT DISTINCT FROM p_dados->>'provedor_id' THEN RETURN jsonb_build_object('ok',true); END IF;
   RAISE EXCEPTION 'comando ja finalizado' USING ERRCODE='40001';
  END IF;
  UPDATE mensageria.comando SET estado=st,provedor_id=p_dados->>'provedor_id',erro=left(p_dados->>'erro',500) WHERE id=q.id;
  IF q.mensagem_id IS NOT NULL THEN
   SELECT * INTO v_eco FROM mensageria.mensagem WHERE conta_id=cid AND conversa_id=q.conversa_id AND provedor_id=p_dados->>'provedor_id' AND direcao='enviada' AND id<>q.mensagem_id AND duplicada_de IS NULL ORDER BY ordem DESC LIMIT 1;
   IF v_eco.id IS NOT NULL THEN UPDATE mensageria.mensagem SET provedor_id=NULL,duplicada_de=q.mensagem_id WHERE id=v_eco.id; END IF;
   UPDATE mensageria.mensagem AS target SET estado=CASE st WHEN 'enviado' THEN coalesce((SELECT rc.estado FROM mensageria.recibo rc JOIN mensageria.conversa cc ON cc.conta_id=rc.conta_id AND cc.jid=rc.jid WHERE cc.id=q.conversa_id AND rc.provedor_id=p_dados->>'provedor_id'),'enviada') ELSE st END,
    provedor_id=p_dados->>'provedor_id',participante=coalesce(v_eco.participante,target.participante),anexo=coalesce(v_eco.anexo,target.anexo),
    texto=CASE WHEN coalesce(v_eco.apagada,false) THEN '' WHEN coalesce(v_eco.editada,false) THEN v_eco.texto ELSE target.texto END,
    editada=target.editada OR coalesce(v_eco.editada,false),apagada=target.apagada OR coalesce(v_eco.apagada,false) WHERE id=q.mensagem_id;
   IF st='enviado' THEN UPDATE mensageria.conversa SET ultima_em=clock_timestamp(),versao=versao+1 WHERE id=q.conversa_id; END IF;
  END IF;
  IF st='enviado' AND q.tipo IN ('edit','delete') THEN
   UPDATE mensageria.mensagem AS target SET texto=CASE WHEN q.tipo='edit' THEN coalesce(q.conteudo->>'texto',target.texto) ELSE '' END,editada=q.tipo='edit' OR editada,apagada=q.tipo='delete' OR apagada WHERE conta_id=cid AND conversa_id=q.conversa_id AND provedor_id=q.conteudo->>'provedor_id';
  END IF;
  RETURN jsonb_build_object('ok',true);
 END IF;
 IF p_operacao IN ('autorizar_media','media_upload') THEN
  PERFORM mensageria.validar_path(cid,p_dados->>'path');
  IF p_operacao='media_upload' THEN
   INSERT INTO mensageria.arquivo(path,conta_id,nome,mime,bytes) VALUES(p_dados->>'path',cid,p_dados->>'nome',p_dados->>'mime',(p_dados->>'bytes')::bigint) ON CONFLICT(path) DO NOTHING;
   RETURN jsonb_build_object('path',p_dados->>'path','nome',p_dados->>'nome','mime',p_dados->>'mime','bytes',(p_dados->>'bytes')::bigint);
  END IF;
  IF coalesce(p_dados->>'acao','read')='read' AND NOT EXISTS(SELECT 1 FROM mensageria.arquivo WHERE path=p_dados->>'path' AND conta_id=cid) THEN RAISE EXCEPTION 'arquivo nao registrado' USING ERRCODE='42501'; END IF;
  RETURN jsonb_build_object('conta_id',cid,'path',p_dados->>'path');
 END IF;
 IF p_operacao='recibo' THEN
  st:=p_dados->>'estado'; prioridade:=CASE st WHEN 'falhou' THEN 0 WHEN 'enviada' THEN 1 WHEN 'entregue' THEN 2 WHEN 'lida' THEN 3 ELSE -1 END;
  IF prioridade<0 OR coalesce(p_dados->>'provedor_id','')='' OR coalesce(p_dados->>'jid','')='' THEN RAISE EXCEPTION 'recibo invalido' USING ERRCODE='22023'; END IF;
  INSERT INTO mensageria.recibo(conta_id,jid,provedor_id,estado,prioridade) VALUES(cid,p_dados->>'jid',p_dados->>'provedor_id',st,prioridade)
  ON CONFLICT(conta_id,jid,provedor_id) DO UPDATE SET estado=EXCLUDED.estado,prioridade=EXCLUDED.prioridade WHERE EXCLUDED.prioridade>mensageria.recibo.prioridade;
  UPDATE mensageria.mensagem m SET estado=r.estado FROM mensageria.recibo r JOIN mensageria.conversa cc ON cc.conta_id=r.conta_id AND cc.jid=r.jid
  WHERE m.conversa_id=cc.id AND m.conta_id=cid AND m.provedor_id=r.provedor_id AND m.direcao='enviada' AND r.provedor_id=p_dados->>'provedor_id';
  RETURN jsonb_build_object('ok',true);
 END IF;
 IF p_operacao='evento' THEN
  IF length(coalesce(p_dados->>'evento_id','')) NOT BETWEEN 1 AND 300 OR jsonb_typeof(p_dados->'mensagens')<>'array' OR jsonb_array_length(p_dados->'mensagens')>500 THEN RAISE EXCEPTION 'evento invalido' USING ERRCODE='22023'; END IF;
  INSERT INTO mensageria.evento(conta_id,evento_id) VALUES(cid,p_dados->>'evento_id') ON CONFLICT DO NOTHING;
  IF NOT FOUND THEN RETURN jsonb_build_object('ok',true,'duplicado',true); END IF;
  IF p_dados->>'jid' !~ '^([0-9]{5,30}(-[0-9]+)?@(s[.]whatsapp[.]net|lid|g[.]us))$' THEN RAISE EXCEPTION 'JID invalido' USING ERRCODE='22023'; END IF;
  INSERT INTO mensageria.conversa(conta_id,jid,nome,grupo) VALUES(cid,p_dados->>'jid',left(coalesce(p_dados->>'nome',''),180),p_dados->>'jid' LIKE '%@g.us')
  ON CONFLICT(conta_id,jid) DO UPDATE SET nome=CASE WHEN EXCLUDED.nome<>'' THEN EXCLUDED.nome ELSE mensageria.conversa.nome END RETURNING * INTO cv;
  FOR m IN SELECT value FROM jsonb_array_elements(p_dados->'mensagens') LOOP
   IF coalesce(m->>'provedor_id',m->>'id','')='' THEN RAISE EXCEPTION 'id de provedor ausente' USING ERRCODE='22023'; END IF;
   PERFORM mensageria.validar_anexo(cid,m->'anexo');
   IF m->>'direcao'='enviada' THEN
    SELECT * INTO v_existente FROM mensageria.mensagem WHERE conta_id=cid AND conversa_id=cv.id AND provedor_id=coalesce(m->>'provedor_id',m->>'id') AND direcao='enviada' AND duplicada_de IS NULL ORDER BY ordem LIMIT 1;
    IF v_existente.id IS NOT NULL THEN
     UPDATE mensageria.mensagem AS target SET participante=coalesce(m->>'participante',target.participante),anexo=coalesce(nullif(m->'anexo','null'::jsonb),target.anexo),
      texto=CASE WHEN coalesce((m->>'apagada')::boolean,false) THEN '' WHEN coalesce((m->>'editada')::boolean,false) THEN coalesce(m->>'texto',target.texto) ELSE target.texto END,
      editada=target.editada OR coalesce((m->>'editada')::boolean,false),apagada=target.apagada OR coalesce((m->>'apagada')::boolean,false) WHERE id=v_existente.id;
     IF coalesce((m->>'editada')::boolean,false) OR coalesce((m->>'apagada')::boolean,false) THEN
      UPDATE mensageria.conversa SET versao=versao+1 WHERE id=cv.id;
      UPDATE mensageria.rascunho SET estado='obsoleto' WHERE conversa_id=cv.id AND estado='pendente';
     END IF;
     CONTINUE;
    END IF;
   END IF;
   INSERT INTO mensageria.mensagem(conta_id,conversa_id,provedor_id,participante,direcao,tipo,texto,estado,anexo,criada_em,editada,apagada,historica)
   VALUES(cid,cv.id,coalesce(m->>'provedor_id',m->>'id'),coalesce(m->>'participante',''),coalesce(m->>'direcao','recebida'),coalesce(m->>'tipo','text'),coalesce(m->>'texto',''),CASE WHEN m->>'direcao'='enviada' THEN coalesce((SELECT r.estado FROM mensageria.recibo r WHERE r.conta_id=cid AND r.jid=cv.jid AND r.provedor_id=coalesce(m->>'provedor_id',m->>'id')),'enviada') ELSE 'recebida' END,m->'anexo',coalesce((m->>'criada_em')::timestamptz,clock_timestamp()),coalesce((m->>'editada')::boolean,false),coalesce((m->>'apagada')::boolean,false),coalesce((p_dados->>'historico')::boolean,false))
   ON CONFLICT(conta_id,conversa_id,participante,provedor_id) DO NOTHING RETURNING id INTO mid;
   IF mid IS NOT NULL THEN
    total:=total+1;
    UPDATE mensageria.conversa SET versao=versao+1,ultima_em=greatest(ultima_em,coalesce((m->>'criada_em')::timestamptz,clock_timestamp())),
    ultima_recebida_em=CASE WHEN coalesce(m->>'direcao','recebida')='recebida' THEN greatest(coalesce(ultima_recebida_em,'-infinity'),coalesce((m->>'criada_em')::timestamptz,clock_timestamp())) ELSE ultima_recebida_em END,
    estado=CASE WHEN estado='resolvida' AND coalesce(m->>'direcao','recebida')='recebida' THEN 'aberta' ELSE estado END WHERE id=cv.id;
    UPDATE mensageria.rascunho SET estado='obsoleto' WHERE conversa_id=cv.id AND estado='pendente';
    IF coalesce(m->>'direcao','recebida')='recebida' AND NOT coalesce((m->>'apagada')::boolean,false) AND c.ia_modo<>'desligada' AND NOT coalesce((p_dados->>'historico')::boolean,false) AND coalesce((c.capacidades->>'draft')::boolean,false) THEN
     PERFORM mensageria.enfileirar(cid,cv.id,'draft','{}','draft:'||mid::text,NULL,'sistema');
    END IF;
   ELSIF coalesce((m->>'editada')::boolean,false) OR coalesce((m->>'apagada')::boolean,false) THEN
    UPDATE mensageria.mensagem AS target SET texto=CASE WHEN coalesce((m->>'apagada')::boolean,false) THEN '' ELSE coalesce(m->>'texto',target.texto) END,
    editada=coalesce((m->>'editada')::boolean,false) OR editada,apagada=coalesce((m->>'apagada')::boolean,false) OR apagada
    WHERE conta_id=cid AND conversa_id=cv.id AND provedor_id=coalesce(m->>'provedor_id',m->>'id') AND participante=coalesce(m->>'participante','');
    UPDATE mensageria.conversa SET versao=versao+1 WHERE id=cv.id;
    UPDATE mensageria.rascunho SET estado='obsoleto' WHERE conversa_id=cv.id AND estado='pendente';
   END IF;
  END LOOP;
  RETURN jsonb_build_object('ok',true,'inseridas',total,'conversa_id',cv.id);
 END IF;
 IF p_operacao='rascunho' THEN
  SELECT * INTO cv FROM mensageria.conversa WHERE id=(p_dados->>'conversa_id')::uuid AND conta_id=cid FOR UPDATE;
  IF cv.id IS NULL OR cv.versao<>(p_dados->>'conversa_versao')::bigint OR c.politica_versao<>(p_dados->>'politica_versao')::bigint OR c.ia_modo='desligada' THEN RAISE EXCEPTION 'contexto ou politica obsoletos' USING ERRCODE='40001'; END IF;
  texto:=p_dados->>'texto';
  SELECT m2.texto INTO ultima FROM mensageria.mensagem m2 WHERE conversa_id=cv.id AND direcao='recebida' AND NOT apagada AND NOT historica AND duplicada_de IS NULL ORDER BY ordem DESC LIMIT 1;
  SELECT value INTO regra FROM jsonb_array_elements(c.regras) WHERE value->>'id'=p_dados->>'regra_id' AND value->>'habilitada'='true' AND value->>'automatica'='true' LIMIT 1;
  automatico:=c.ia_modo='automatica' AND cv.estado='aberta' AND cv.responsavel_id IS NULL AND coalesce(p_dados->>'sensivel','true')='false' AND regra IS NOT NULL
   AND length(trim(regra->>'padrao'))>=4 AND lower(trim(regexp_replace(regra->>'padrao','\s+',' ','g')))=lower(trim(regexp_replace(ultima,'\s+',' ','g')))
   AND trim(regra->>'resposta_aprovada')=trim(texto)
   AND coalesce(ultima,'') !~* '(pre[cç]o|compr|vend|pagament|descont|cart[aã]o|pix|contrat|cancel|sa[uú]de|doen[cç]|senh|token|cpf|jur[ií]dic|processo|reclama[cç]|reembol|amea[cç]|suic[ií]d|emerg[eê]ncia)';
  INSERT INTO mensageria.rascunho(conta_id,conversa_id,conversa_versao,politica_versao,texto,sensivel,regra_id,estado)
  VALUES(cid,cv.id,cv.versao,c.politica_versao,texto,coalesce((p_dados->>'sensivel')::boolean,true),p_dados->>'regra_id',CASE WHEN coalesce(automatico,false) THEN 'automatico' ELSE 'pendente' END) RETURNING id INTO rid;
  IF coalesce(automatico,false) THEN PERFORM mensageria.enfileirar(cid,cv.id,'send',jsonb_build_object('tipo','text','texto',texto),'automatico:'||rid::text,NULL,'automatica',cv.versao,c.politica_versao); END IF;
  RETURN jsonb_build_object('id',rid,'automatico',coalesce(automatico,false));
 END IF;
 RAISE EXCEPTION 'operacao de maquina desconhecida' USING ERRCODE='22023';
END $$;
