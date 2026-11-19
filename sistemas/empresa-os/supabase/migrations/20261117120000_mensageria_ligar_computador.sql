-- Ligar o computador do WhatsApp sem token na tela (17/11/2026).
-- Antes, o dono criava a "instalação" em Configurações > Números do WhatsApp, copiava um token e
-- entregava à IA. Agora a IA roda `npm run mensageria:ligar` em sistemas/whatsapp: o comando chama
-- esta função com a chave de serviço da Casa (só nessa chamada; ela não fica guardada no conector),
-- recebe o token e grava direto na configuração privada do conector. Ninguém vê o token.
--
-- - Mesmo nome de computador já ativo: troca o token (rodar de novo no mesmo computador não duplica).
-- - Números de QR Code ainda sem computador passam para este (a tela não pede mais para escolher).
-- - Só service_role executa. O runtime do conector continua usando só o token da instalação.

-- Lógica dentro do módulo (regra de arquitetura GA-04/GA-09); a porta pública só repassa,
-- igual a public.mensageria_dispositivo.
CREATE OR REPLACE FUNCTION mensageria.ligar_computador(p_nome text)
RETURNS jsonb LANGUAGE plpgsql SECURITY DEFINER SET search_path = '' AS $$
DECLARE
 v_nome text := trim(coalesce(p_nome, ''));
 v_token text;
 v_id uuid;
 v_ligados integer;
BEGIN
 IF length(v_nome) NOT BETWEEN 1 AND 120 THEN
  RAISE EXCEPTION 'nome do computador invalido' USING ERRCODE = '22023';
 END IF;
 v_token := replace(gen_random_uuid()::text, '-', '') || replace(gen_random_uuid()::text, '-', '');

 SELECT id INTO v_id FROM mensageria.instalacao
  WHERE ativa AND lower(nome) = lower(v_nome)
  ORDER BY criada_em DESC LIMIT 1 FOR UPDATE;

 IF v_id IS NULL THEN
  INSERT INTO mensageria.instalacao(nome, token_hash)
  VALUES (v_nome, sha256(convert_to(v_token, 'UTF8'))) RETURNING id INTO v_id;
 ELSE
  UPDATE mensageria.instalacao SET token_hash = sha256(convert_to(v_token, 'UTF8')) WHERE id = v_id;
 END IF;

 -- Mesmo efeito de conta_salvar trocando a instalação: solta o lease e sobe a época.
 UPDATE mensageria.conta
    SET instalacao_id = v_id, runtime_id = NULL, lease_ate = NULL, epoca = epoca + 1
  WHERE provedor = 'baileys' AND instalacao_id IS NULL;
 GET DIAGNOSTICS v_ligados = ROW_COUNT;

 RETURN jsonb_build_object('id', v_id, 'token', v_token, 'numeros_ligados', v_ligados);
END $$;
REVOKE ALL ON FUNCTION mensageria.ligar_computador(text) FROM PUBLIC, anon, authenticated;

CREATE OR REPLACE FUNCTION public.mensageria_ligar_computador(p_nome text)
RETURNS jsonb LANGUAGE sql SECURITY DEFINER SET search_path = '' AS $$ SELECT mensageria.ligar_computador(p_nome) $$;

REVOKE ALL ON FUNCTION public.mensageria_ligar_computador(text) FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.mensageria_ligar_computador(text) TO service_role;
-- Remover computador pela tela (dono ou quem gerencia o WhatsApp): desativa a instalação, o token dela
-- para na hora, e os números de QR Code dela voltam a pedir "Ligar o computador". Nada é apagado.
CREATE OR REPLACE FUNCTION mensageria.remover_computador(p_id uuid)
RETURNS jsonb LANGUAGE plpgsql SECURITY DEFINER SET search_path = '' AS $$
DECLARE v_soltos integer;
BEGIN
 IF NOT public.tem_permissao('mensageria.manage') THEN
  RAISE EXCEPTION 'sem permissao de gerenciar' USING ERRCODE = '42501';
 END IF;
 UPDATE mensageria.instalacao SET ativa = false WHERE id = p_id AND ativa;
 IF NOT FOUND THEN RAISE EXCEPTION 'computador nao encontrado' USING ERRCODE = 'P0002'; END IF;
 UPDATE mensageria.conta
    SET instalacao_id = NULL, runtime_id = NULL, lease_ate = NULL, epoca = epoca + 1
  WHERE instalacao_id = p_id;
 GET DIAGNOSTICS v_soltos = ROW_COUNT;
 RETURN jsonb_build_object('ok', true, 'numeros_soltos', v_soltos);
END $$;
REVOKE ALL ON FUNCTION mensageria.remover_computador(uuid) FROM PUBLIC, anon, authenticated;

CREATE OR REPLACE FUNCTION public.mensageria_remover_computador(p_id uuid)
RETURNS jsonb LANGUAGE sql SECURITY DEFINER SET search_path = '' AS $$ SELECT mensageria.remover_computador(p_id) $$;
REVOKE ALL ON FUNCTION public.mensageria_remover_computador(uuid) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.mensageria_remover_computador(uuid) TO authenticated;

-- Prova do passo "Conectar o WhatsApp" do plano (hook registro_trabalho.py da Casa, com service_role):
-- o schema mensageria não está no REST, então o hook lê só este resumo. EXISTS, sem varrer as mensagens.
CREATE OR REPLACE FUNCTION mensageria.prova()
RETURNS TABLE(numeros_conectados integer, tem_enviada boolean)
LANGUAGE sql STABLE SECURITY DEFINER SET search_path = '' AS $$
 SELECT (SELECT count(*)::integer FROM mensageria.conta WHERE estado = 'conectada'),
        EXISTS(SELECT 1 FROM mensageria.mensagem WHERE direcao = 'enviada')
$$;
REVOKE ALL ON FUNCTION mensageria.prova() FROM PUBLIC, anon, authenticated;

CREATE OR REPLACE FUNCTION public.mensageria_prova()
RETURNS TABLE(numeros_conectados integer, tem_enviada boolean)
LANGUAGE sql STABLE SECURITY DEFINER SET search_path = '' AS $$ SELECT * FROM mensageria.prova() $$;
REVOKE ALL ON FUNCTION public.mensageria_prova() FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.mensageria_prova() TO service_role;

COMMENT ON FUNCTION public.mensageria_prova() IS
 'Resumo so de leitura para a prova do passo do WhatsApp: numeros com estado conectada e se ja houve mensagem enviada. So service_role.';

COMMENT ON FUNCTION public.mensageria_ligar_computador(text) IS
 'Cria ou renova a instalacao do conector pelo nome do computador e devolve o token uma vez. So service_role (npm run mensageria:ligar).';
