CREATE OR REPLACE FUNCTION mensageria.grupos_atualizar(p_instalacao uuid,p_dados jsonb)
RETURNS jsonb LANGUAGE plpgsql SECURITY DEFINER SET search_path='' AS $$
DECLARE c mensageria.conta; total integer;
BEGIN
 SELECT * INTO c FROM mensageria.conta WHERE id=(p_dados->>'conta_id')::uuid FOR UPDATE;
 IF c.id IS NULL OR c.provedor<>'baileys' OR c.instalacao_id IS DISTINCT FROM p_instalacao THEN RAISE EXCEPTION 'conta fora da instalacao' USING ERRCODE='42501'; END IF;
 IF c.runtime_id IS DISTINCT FROM p_dados->>'runtime_id' OR c.epoca IS DISTINCT FROM (p_dados->>'epoca')::bigint OR c.lease_ate IS NULL OR c.lease_ate<=clock_timestamp() THEN RAISE EXCEPTION 'lease expirado ou substituido' USING ERRCODE='40001'; END IF;
 IF jsonb_typeof(p_dados->'grupos') IS DISTINCT FROM 'array' OR jsonb_array_length(p_dados->'grupos')>500 THEN RAISE EXCEPTION 'lista de grupos invalida' USING ERRCODE='22023'; END IF;
 WITH nomes AS (
  SELECT DISTINCT ON (value->>'jid') value->>'jid' AS jid,left(trim(value->>'nome'),180) AS nome
  FROM jsonb_array_elements(p_dados->'grupos') WITH ORDINALITY AS entrada(value,ordem)
  WHERE value->>'jid' ~ '^[0-9]{5,30}(-[0-9]+)?@g[.]us$' AND length(trim(coalesce(value->>'nome','')))>0
  ORDER BY value->>'jid',ordem DESC
 ) UPDATE mensageria.conversa cv SET nome=nomes.nome FROM nomes
 WHERE cv.conta_id=c.id AND cv.grupo AND cv.jid=nomes.jid AND cv.nome IS DISTINCT FROM nomes.nome;
 GET DIAGNOSTICS total=ROW_COUNT;
 RETURN jsonb_build_object('atualizadas',total);
END $$;
REVOKE ALL ON FUNCTION mensageria.grupos_atualizar(uuid,jsonb) FROM PUBLIC,anon,authenticated;
COMMENT ON FUNCTION mensageria.grupos_atualizar(uuid,jsonb) IS 'motivo: somente o dispositivo com instalacao e lease validos atualiza nomes oficiais de grupos existentes na propria conta.';

CREATE OR REPLACE FUNCTION mensageria.dispositivo(p_token text,p_operacao text,p_dados jsonb DEFAULT '{}')
RETURNS jsonb LANGUAGE plpgsql SECURITY DEFINER SET search_path='' AS $$
DECLARE iid uuid;
BEGIN
 IF p_token IS NULL OR length(p_token)<>64 THEN RAISE EXCEPTION 'instalacao nao autorizada' USING ERRCODE='42501'; END IF;
 SELECT id INTO iid FROM mensageria.instalacao WHERE ativa AND token_hash=sha256(convert_to(p_token,'UTF8'));
 IF iid IS NULL THEN RAISE EXCEPTION 'instalacao nao autorizada' USING ERRCODE='42501'; END IF;
 UPDATE mensageria.instalacao SET ultima_em=clock_timestamp() WHERE id=iid;
 IF p_operacao='grupos_atualizar' THEN RETURN mensageria.grupos_atualizar(iid,p_dados); END IF;
 RETURN mensageria.maquina(iid,p_operacao,p_dados,false);
END $$;

CREATE OR REPLACE FUNCTION mensageria.conversa_json(p_id uuid,p_usuario uuid)
RETURNS jsonb LANGUAGE sql STABLE SECURITY DEFINER SET search_path = '' AS $$
 SELECT to_jsonb(c) || jsonb_build_object(
 'ultima_mensagem',(SELECT coalesce(nullif(left(m.texto,180),''),CASE m.tipo WHEN 'document' THEN 'Arquivo: '||coalesce(m.anexo->>'nome','Documento') WHEN 'voice' THEN 'Mensagem de voz' WHEN 'audio' THEN 'Áudio' WHEN 'image' THEN 'Imagem' WHEN 'video' THEN 'Vídeo' WHEN 'sticker' THEN 'Figurinha' ELSE 'Mensagem' END) FROM mensageria.mensagem m WHERE m.conversa_id=c.id AND m.duplicada_de IS NULL ORDER BY m.criada_em DESC,m.ordem DESC LIMIT 1),
 'nao_lidas',(SELECT count(*) FROM mensageria.mensagem m WHERE m.conversa_id=c.id AND m.direcao='recebida' AND NOT m.historica AND NOT m.apagada AND m.duplicada_de IS NULL
 AND m.ordem>coalesce((SELECT l.ultima_ordem FROM mensageria.leitura l WHERE l.conversa_id=c.id AND l.usuario_id=p_usuario),0)))
 FROM mensageria.conversa c WHERE c.id=p_id;
$$;
