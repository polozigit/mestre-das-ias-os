# Migrations do Empresa OS

> Pra IA da empresa. Aplicar no projeto Supabase do dono pelo conector oficial
> (uma migration por vez), NA ORDEM. Cada arquivo termina num smoke test
> (`DO $$`): se ele levantar exceção, a migration FALHOU de verdade — leia a
> mensagem (ela diz a consequência), conserte e reaplique. Não siga adiante
> com erro.

## Ordem e o que cada uma faz

| # | Arquivo | O quê |
|---|---|---|
| 0001 | `0001_gates_seguranca.sql` | 3 gates automáticos: tabela nova nasce com RLS ligado; função nova perde EXECUTE de anon/PUBLIC; função sem search_path ganha um fixo. Fecha também os default privileges de tabela + a porta única do Vault: segredo de integração só entra por `vault.create_secret` e só sai por `public.segredo()` com EXECUTE de `service_role`. |
| 0002 | `0002_empresa.sql` | A empresa (linha única por estrutura, `id = 1`) + função de carimbo `set_atualizada_em()`. Deny-all até a 0004. |
| 0003 | `0003_usuarios_permissoes.sql` | Usuários (dono = `e_dono`, no máximo 1), catálogo `permissoes` (slug `<modulo>.<acao>`) e `usuarios_permissoes`. INSERT de usuário só server-side. |
| 0004 | `0004_rbac_helpers.sql` | Helpers `usuario_atual()`/`e_dono()`/`tem_permissao(slug)`/`sessao_atual()`/`marcar_senha_trocada()` + policies de empresa/usuarios/permissoes + gatilho "`usuarios.manage` só pelo dono". |
| 0005 | `0005_agentes.sql` | Catálogo do time de agentes (espelho do `agentes.json`; só leitura pela tela, escrita pela RPC de sync). |
| 0006 | `0006_tarefas.sql` | Kanban e trilha do aluno (curso, plano de 90 dias, trabalho); UPDATE por coluna; só `trabalho` se cria e apaga pela tela. |
| 0007 | `0007_atividade.sql` | Linha do tempo append-only, autoria não-forjável. |
| 0008 | `0008_seed_funcao.sql` | `seed_empresa(nome, email_dono, nome_dono)`, `semear_tarefas(jsonb)`, `sincronizar_agentes(jsonb)`: idempotentes, só `service_role`. |
| 0009 | `0009_execucoes_agente.sql` | Registro de execuções dos agentes, append-only até pra `service_role`. |
| 0010 | `0010_documentos_publicados.sql` | Dossiê, persona, marca e extrações publicados pela IA; a tela só lê. |
| 0011 | `0011_melhorias.sql` | Melhorias propostas ao time; só vira `aplicada` vinda de `aprovada`, com commit. |
| 0012 | `0012_fundacao_extensao.sql` | Fundação de extensão: catálogo `public.modulo`, gates 1-3 em todo schema de módulo, schema `arquivo`, `atividade.modulo_origem`. |
| 0013 | `0013_modulo_ligavel.sql` | Módulo ligável (ADR-015, ADR-024): `public.modulo` com `classe`, `ligado`, `ligado_em`, `ligado_por_usuario_id`, `modulo_pai`; linha e slugs de todo módulo do catálogo (restritos do ADR-012 item 7); gatilho da P4 (não concede slug de módulo desligado, desligar revoga); RPC `public.ligar_modulo` (`configuracoes.write`); helper `public.criar_outbox_inbox(schema)`. |
| 0014 | `0014_tarefas_plano_modelo.sql` | Onda 2A (ADR-020): colunas `tipo`, `prazo`, `projeto_ref`, `origem_tipo`, `origem_ref`, `estimativa_min` em `public.tarefas`; schema `tarefas` com outbox/inbox; modelo de plano (`plano_modelo`, `plano_etapa_modelo`, `plano_atividade_modelo` com `instrucao` separada de `comando`, `prazo_dias` relativo ao início, `aula_ref`); RPC `tarefas.carregar_modelo_plano` (só `service_role`). |
| 0015 | `0015_nucleo_comum.sql` | Onda 2, núcleo comum sem evento: Parte (pessoa, organização), `tipo_papel`, `papel_parte`, `contato`, `endereco`, `consentimento` (versionado), `documento`, `produto`, `produto_preco`, `calendario`, `politica_sla`, `campo_definicao`; `usuarios.parte_id` e `parte_atual()`; slugs `nucleo.read/write/manage` e o restrito `nucleo.pessoal`; dado pessoal mascarado por coluna, inteiro só por `parte_dados_pessoais()`; escrita só pelas funções públicas; outbox do núcleo. |
| 0016 | `0016_tarefas_plano_instancia.sql` | Onda 2A, parte 2 (ADR-020): `plano_instancia`, `tarefa_plano`; RPCs `tarefas.instanciar_plano` (tela, `tarefas.write`: cria só trilha `trabalho`, em curso/plano90 só liga a tarefa semeada) e `instanciar_plano_servico` (só `service_role`); views `v_tarefa_com_instrucao` e `v_fila_agente`. |
| 0017 | `0017_conexoes.sql` | Inventário de conexões (ADR-025): `public.conexao` (nome do segredo no Vault, nunca o valor; cópias de uso; prova e rotação), módulo `conexoes` (`conexoes.read`/`.manage`); RPCs só `service_role`: `registrar_conexao` e `guardar_segredo`. |
| 0018 | `0018_whatsapp.sql` | Registro das mensagens do WhatsApp local do aluno: `public.whatsapp_mensagem` (telefone e texto; retenção R05; leitura por `whatsapp.read`, do módulo `whatsapp` que a 0013 já cataloga, ligável e desligado de partida); RPCs só `service_role`: `registrar_mensagem_whatsapp` (upsert por `wa_id`) e `atualizar_status_whatsapp` (recibo; status só avança). Não grava em `atividade`. |
| 0019 | `0019_organograma.sql` | Schema `organograma` (ADR-012): as 19 tabelas do organograma de referência (áreas, cargos, processos APQC, pacotes, playbooks, workflows, ondas, biblioteca), mais `posicao` e `posicao_ocupacao` (ocupante pessoa OU agente, sem sobreposição de vigência, sem DELETE); RPC `organograma.carregar` (só `service_role`; recusa apagar cargo com histórico de ocupação); views `v_org_*` e `v_posicao_ocupante` (`security_invoker`); módulo `organograma` (`organograma.read`/`.manage`). Expor o schema `organograma` na Data API. |
| 0020 | `0020_organograma_ocupar_agente.sql` | `organograma.ocupar_posicao_agente(agente, cargo)`: coloca um agente na posição 0 do cargo, idempotente e sem sobrepor outro ocupante; `SECURITY DEFINER`, EXECUTE só `service_role` (o setup não tem INSERT direto na tabela). |
| 0021 | `0021_whatsapp_grupo.sql` | WhatsApp local fala com grupos, mídia e enquete: o CHECK de `telefone` é trocado por um mais largo (aceita tudo que aceitava, mais o id do grupo sem `@g.us`), coluna gerada `destino_tipo` (`numero`\|`grupo`) e `registrar_mensagem_whatsapp` com a MESMA assinatura (o motor antigo continua funcionando) e a validação alargada. Não mexe na 0018 nem em coluna de contrato. |

Depois da 0021: rodar `scripts/setup-inicial.mjs` (LEIA-ME passo 6). Ele carrega o organograma e coloca os agentes instalados nas posições do Time de IA (mapa em `config/agentes-posicao.json`); se ainda não havia agente instalado, rode o setup de novo depois de instalar o time.

## Dado de exemplo e testes

- `seed_exemplo.sql`: só DML, idempotente, e-mails `@exemplo.invalid`, nunca cria dono. Roda no CI (entre as duas rodadas das migrations) e na homologação (`db push --include-seed`). **Nunca vai pra produção** (`deploy-db.yml` não usa `--include-seed`).
- Nota de ambiente: na imagem `supabase/postgres:17.6.1.106`, CHAMAR função sem EXECUTE (como `anon` ou `authenticated`) derruba o servidor (signal 11). Os testes conferem o privilégio no catálogo, não chamam.
- `tests/*.sql` (pgTAP, `supabase test db --local supabase/tests`): `000_arquitetura` (guardas GA-01 a GA-18; a GA-18 tem controle positivo, porque nenhum ligável tem schema ainda), `001_estrutura`, `002_rls_como_usuario` (permissão e negação COMO usuário — pega "tela vazia sem erro"), `003_invariantes`, `004_anon`, `005_modulo_ligavel` (ligar/desligar, gatilho da P4, outbox/inbox), `006_tarefas_plano_modelo` (modelo de plano e campos novos de tarefa), `008_tarefas_plano_instancia` (instanciação do plano), `009_conexoes` (inventário e ida e volta no Vault), `010_whatsapp` (registro de mensagem: leitura COMO usuário, escrita só pelas RPCs, status que só avança), `007_nucleo` (leitura mascarada, restrito, titular, escrita só pela função, consentimento, catálogos), `011_atividade_usuarios` (evento de segurança de usuários gravado e lido por quem não é dono), `013_organograma` (schema `organograma`: permissão e negação COMO usuário, CHECK de um ocupante, EXCLUDE de sobreposição, recarga que não apaga histórico), `014_organograma_ocupar_agente` (privilégio só do `service_role` e idempotência de `ocupar_posicao_agente`) e `015_whatsapp_grupo` (mensagem de grupo: id no lugar do telefone, `destino_tipo` gerada, assinatura antiga intacta). Não há 012: os testes do organograma eram 010 e 012 e viraram 013 e 014 quando a 0018 passou a ser o whatsapp.
- `arquitetura/excecoes.yml`: lista antiga de exceções às guardas; **só diminui**. Item novo exige ADR de `arquitetura/adrs.yml`.
- `scripts/testar-migrations-local.sh`: as duas rodadas + seed + pgTAP no Postgres local (com `IMG=supabase/postgres:17.6.1.106` para usar a imagem oficial).

## Como o banco cresce (um módulo = uma PR)

1. Linha em `public.modulo` (dono, descrição, `schema_nome`).
2. `CREATE SCHEMA <modulo>`: os gates 1-3 já valem; RLS, `REVOKE` e grants mínimos. Depois `SELECT public.criar_outbox_inbox('<modulo>')` (outbox e inbox no padrão único, GA-10). Módulo **ligável** (classe `ligavel`, `ligado = false`): a migration existe no template, mas o schema só é instalado quando a empresa liga o módulo; `public.ligar_modulo` recusa ligar sem o schema (ADR-024).
3. Slugs `<modulo>.read|write|manage` em `public.permissoes` (o prefixo precisa existir em `public.modulo`).
4. Tabelas com `COMMENT` de tabela (`dono=...; retencao=Rnn; ...`) e de coluna (`classe=nenhum|pessoal|sensivel`).
5. pgTAP de permissão e negação como usuário em `tests/NNN_<modulo>.sql` (com os marcadores `-- GA-06 positivo:` e `-- GA-06 negacao:`).
6. Só acrescenta: nada de renomear ou apagar coluna de contrato; slug de permissão nunca muda de sentido.


## Regras que os gates impõem daqui pra frente

- Tabela nova em `public`: nasce com RLS ligado (gate1, que só olha `public`);
  em schema de módulo a migration liga com `ENABLE ROW LEVEL SECURITY`. Em
  qualquer schema, nasce SEM grant — a migration
  do módulo precisa de `GRANT` explícito + policy + smoke que prova o GRANT,
  senão a tela renderiza VAZIA sem erro.
- Função nova: nasce sem EXECUTE de anon (gate2). Conceda a `authenticated`
  explicitamente quando o front chamar via RPC.
- Policy NUNCA subconsulta `usuarios` direto (recursão de RLS) — sempre os
  helpers da 0004 (`usuario_atual()`, `e_dono()`, `tem_permissao()`).

## Segredos (Vault)

- **Cadastrar** (ADR-025, decisão de 06/10/2026): o script da IA guarda pela
  operação fixa `public.guardar_segredo(nome, valor)` (só `service_role`),
  chamada via PostgREST com parâmetro ligado (`POST /rest/v1/rpc/guardar_segredo`),
  lendo o valor de arquivo, nunca do chat. Nunca com o valor literal num SQL: o
  texto do SQL vai para log e `pg_stat_statements`. O dono ainda pode cadastrar
  no SQL Editor (`vault.create_secret`). Depois de guardar, registre a conexão
  com `public.registrar_conexao(...)`: o inventário (`public.conexao`) guarda
  o NOME do segredo e onde há cópia (GitHub, Vercel), nunca o valor.
- `credenciais/.env` é só bootstrap: depois do Vault, fica só com a URL do
  projeto e a chave de serviço.
- **Limite conhecido (disciplina, não tranca):** quem tem a chave de serviço
  também executa `public.segredo()`. O script da IA não tem operação que a
  chame, e o hook bloqueia `segredo(` em chamada da IA.
- **Usar** (dentro de função/trigger/edge com `service_role`):
  ```sql
  SELECT public.segredo('<nome>');
  ```
- **PROIBIDO**: `SELECT ... FROM vault.decrypted_secrets` em migration, em
  código do app ou no chat — a view decifra o valor em texto puro pra
  qualquer papel que alcance ela.
- `.env` do sistema guarda só o que a Vercel precisa em build/runtime; o
  resto (chave de integração, token de API externa) vai pro Vault.
- **A verdade sobre a "tranca" da view** (medido em produção, 18/09/2026): a
  `0001` TENTA revogar o acesso direto de `service_role` à view/tabela do
  Vault, mas no Supabase hospedado o schema `vault` pertence a
  `supabase_admin`, e o papel usado pra aplicar migrations não é membro
  dele — o REVOKE roda sem erro e sem efeito. `service_role` continua
  enxergando `vault.decrypted_secrets` por construção da plataforma; isso
  não é um bug desta migration, é como o Supabase hospedado funciona. A
  view não pode ser trancada pelo dono do projeto no plano hospedado.
  **A porta única e auditável é `public.segredo()`.** Quem segura o Vault
  longe da IA não é a tranca da view: é o MCP rodando em `read_only` sem o
  schema `vault`, e o hook `PreToolUse` que nega qualquer comando citando
  `decrypted_secrets` (peça (a) do E1).

## Kill-switch dos gates (reversível, sem drop)

```sql
ALTER EVENT TRIGGER trg_gate1_rls_auto       DISABLE;
ALTER EVENT TRIGGER trg_gate2_revoke_execute DISABLE;
ALTER EVENT TRIGGER trg_gate3_search_path    DISABLE;
```

Religar: `ENABLE` no lugar de `DISABLE`. Só desligue pra diagnosticar um DDL
que o gate esteja atrapalhando (não deveria: gate nunca derruba DDL, só avisa)
— e religue em seguida. O **GATE 4 não tem kill-switch** (não é event
trigger, é estrutura + privilégio): pra afrouxar é preciso reverter o
`REVOKE`/`GRANT` na mão — ver o rodapé de rollback da `0001`, que também diz
a consequência de fazer isso (no Supabase hospedado comum esse REVOKE já
não tem efeito nenhum, então normalmente não há o que reverter).

## Migration só entra com veredito

O schema deste banco só muda por migration numerada, e migration só entra no
repositório com um veredito `APPROVED` em `operacao/vereditos/<nome>.json`
(mesmo sha256 do arquivo). Use a skill `tecnologia-mudar-banco` pra criar, classificar,
provar e registrar o veredito — o `pre-commit` do modelo bloqueia o commit
sem ele. Quem aplica a migration em produção é a Action do GitHub, nunca a
IA nem o conector MCP.

## Re-aplicar

Todos os arquivos são idempotentes (rodar 2x não quebra nem duplica). O
rollback de cada migration está comentado no rodapé do próprio arquivo.

## Teste local

Duas formas, ambas com Docker:

- `bash scripts/testar-migrations-local.sh` — Postgres puro
  (`postgres:16-alpine`): prova os gates 1-3 e o gate 4 só na estrutura
  (`vault` indisponível nessa imagem).
- `DOCKER_CONTEXT=polozi-vps IMG=supabase/postgres:17.6.1.106 bash scripts/testar-migrations-local.sh`
  — imagem oficial do Supabase, a única com `supabase_vault` disponível: aqui
  o ciclo `vault.create_secret` → `public.segredo()` é provado de verdade.
  A tentativa de REVOKE da view roda também sob `postgres` promovido a
  superuser (necessário pra GATE1-3, que criam event trigger) — isso prova
  que o REVOKE *funciona quando o papel tem privilégio*, não que o Supabase
  hospedado vai trancar (lá não tem superuser). O caminho real do aluno é o
  `RAISE WARNING` do item 6f do smoke, não uma tranca ativa.
