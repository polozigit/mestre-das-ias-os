# Time PMO: desenho (07/10/2026)

Fonte de verdade do time PMO do kit do aluno (turma de 09/10). Quem constrói segue este arquivo; mudança de regra muda aqui primeiro.

## 1. Pra quem e pra quê

Dono de empresa de 20 a 100 pessoas, não técnico, usando Claude Code ou Codex na Casa. O time cuida das tarefas da empresa dele: abrir, priorizar, montar a semana, revisar a semana, acompanhar a trilha de 90 dias e mostrar os pontos. Fala em português simples, sem jargão ("quadro", "semana", "prioridade do trimestre"), nunca "WIP", "Kanban" ou "SQL" com o dono.

## 2. Modelo de gestão (decisão do Polozi, 07/10/2026: Rocks)

Três camadas, cada uma com fonte oficial (lidas em 07/10/2026):

| Camada | O que é | Fonte |
|---|---|---|
| Quadro (dia a dia) | Kanban: tudo visível em 5 colunas, limite de tarefas em andamento por pessoa, idade de cada tarefa em andamento | The Kanban Guide v2025.5, https://kanbanguides.org (mínimo de 4 medidas de fluxo: em andamento, concluídas por período, idade do item, tempo de ciclo) |
| Semana (ritual) | Revisão semanal de 30 minutos em 3 blocos: limpar (o que entrou), atualizar (o que andou, o que parou), criar (o que entra na semana) | GTD Weekly Review, https://gettingthingsdone.com (get clear, get current, get creative) |
| Trimestre (prioridade) | Rocks: 3 a 7 prioridades de 90 dias da empresa, cada uma feita ou não feita, revistas toda semana como "no trilho" ou "fora do trilho" | EOS, https://www.eosworldwide.com/rocks/ |

Descartados pra este público: Scrum (Scrum Guide 2020: sprint de até 1 mês, 5 eventos, time de até 10 pessoas dedicado ao produto), Shape Up (ciclo de 6 semanas e 2 de pausa, feito pra time de produto de software), PMBOK 7 (PMI, julho de 2021: 12 princípios e 8 domínios; é referência de adaptação, não rotina) e OKR (whatmatters.com: 1 objetivo e 3 a 5 resultados medidos com nota de 0 a 1; pede métrica que o aluno ainda não mede no D3; volta no Nível 4).

## 3. Tudo no banco que já existe (nenhuma migration)

Tabela `public.tarefas` (migrations 0006, 0014, 0016 do `empresa-os-template`). O agente lê e grava pelo Supabase CLI ligado ao projeto (`supabase db query --linked`, executado pelos scripts; a ligação é feita pelo time Tecnologia, no passo de ligar o banco do `tecnologia-mudar-banco`). O MCP do Supabase da Casa é só leitura (`read_only` ligado em `conexoes-e-seguranca.md`): serve no máximo para LER enquanto o banco não estiver ligado; gravação é sempre pelo script, com `--gravar`, nunca por SQL à mão nem pelo MCP. O CLI roda com o papel do banco que ignora RLS e GRANT: por isso as guardas moram nos scripts do time (no WHERE do próprio SQL) e são provadas por teste e mutação.

| Conceito | Onde mora | Regra |
|---|---|---|
| Coluna do quadro | `status` | BACKLOG, EM_ANDAMENTO, REVISAO, CONCLUIDA, CANCELADA. Transições = espelho de `TRANSICOES` em `src/lib/tarefas/status.ts` (teste de consistência trava a simetria). |
| Concluída | `status` + `concluida_em` | CONCLUIDA carimba `concluida_em` no MESMO update; sair de CONCLUIDA limpa o carimbo (igual à tela). |
| Corrida | `WHERE id = ... AND status = '<atual>' AND trilha = '<lida>' AND tipo = '<lido>'` | O que o script conferiu na leitura tem de ser verdade no banco. Update que afeta 0 linha = "não gravou: a tarefa mudou, li de novo". |
| Início do trabalho | `metadata.iniciada_em` (ISO) | Gravado na 1ª ida pra EM_ANDAMENTO; nunca sobrescrito. Sem ele, a idade usa `atualizada_em` e o relatório marca "aproximado". |
| Limite em andamento | calculado | 3 por responsável (`dono_id`, senão `agente_id`, senão "sem responsável"), contados por id e conferidos na própria instrução de gravação (subconsulta no WHERE). O 4º é recusado; o dono escolhe o que volta pro backlog. Passar do limite só com `--passar-do-limite "<motivo>"`, que vai pra linha do tempo. Trocar o responsável de tarefa em andamento também respeita o limite da pessoa nova. Limite conhecido: duas gravações no MESMO instante podem passar juntas (a contagem não trava a tabela); fechar isso pede trava no banco (migration), fora do escopo de hoje. Na prática, 1 dono e 1 agente por vez. |
| Bloqueada | `depende_de` | Bloqueada = `depende_de` aponta pra tarefa fora de CONCLUIDA e CANCELADA. Não entra em EM_ANDAMENTO. |
| Prioridade | `metadata.prioridade` | `alta`, `normal` (padrão) ou `baixa`. Ordem da fila: atrasada, depois alta, depois Rock ou trilha (curso, plano90), depois prazo mais perto, depois a mais antiga. Bloqueada sai da fila de "pode puxar". |
| Prazo | `prazo`, ou `prazo_previsto_em` de `tarefas.tarefa_plano` | Prazo efetivo = `prazo_previsto_em` se houver, senão `prazo`. Atrasada = prazo efetivo antes de hoje e não CONCLUIDA nem CANCELADA. |
| Semana | `metadata.semana` (`AAAA-Www`, ISO) | Marcada no planejamento; a revisão compara planejado com feito. |
| Rock | `tipo = 'rock'`, `trilha = 'trabalho'` | Exige `criterio_pronto` e `prazo` (fim do trimestre). No máximo 7 abertos, conferido no banco ao abrir, ao virar Rock e ao reabrir. Critério de Rock não muda depois de aberto (é o que o conferente confere): desistiu, cancele e abra outro. Rock não vira tarefa comum. Tarefa filha aponta pro Rock em `metadata.rock_id`. |
| Rocks do 1º trimestre | trilha `plano90` | As 5 fases do plano90 (clareza, fundacao, ativacao, aplicacao, escala) SÃO os Rocks do 1º trimestre, calculados das tarefas da fase; não se cria tarefa `rock` duplicada. Fase feita = todas as tarefas CONCLUIDA ou CANCELADA (com pelo menos 1 CONCLUIDA). Fora do trilho = alguma tarefa da fase atrasada. |
| Nível | só leitura | Cada fase do plano90 leva ao alvo de um nível (clareza 1, fundacao 2, ativacao 3, aplicacao 4, escala 5; tabela mestra de `visao-niveis/01-niveis-1-5.md`). O PMO diz "a trilha te leva ao nível N"; o nível MEDIDO é do módulo Maturidade. O PMO nunca afirma o nível da empresa. |
| Pontos | calculados, nunca gravados | Só CONCLUIDA conta: tarefa de trabalho 1, curso 2, plano90 3, Rock 5; mais 1 se concluiu até o prazo efetivo. Reabriu, deixa de contar. Semana dos pontos = semana ISO de `concluida_em`. |
| Linha do tempo | `public.atividade` | Toda escrita do PMO grava 1 linha (`tipo` `tarefa_criada` ou `tarefa_movida` ou `tarefa_ajustada`, `modulo_origem = 'tarefas'`) na mesma instrução SQL (CTE), como a tela. |

Nunca: DELETE em tarefa; UPDATE em `trilha`, `fase`, `ordem`, `chave`, `comando`, `prova`, `depende_de`, `origem`, `origem_tipo`, `origem_ref`; criar tarefa fora da trilha `trabalho`; concluir tarefa de `plano90` ou Rock sem o `CONFERE` do `pmo-conferente`.

Sem banco (Casa sem `credenciais/CONEXOES.md` apontando o Supabase): o quadro lê `operacao/tasks/TASK-N/TASK.md` (só leitura: `Status: aberta` vira EM_ANDAMENTO, `concluída` vira CONCLUIDA, `cancelada` vira CANCELADA, o resto BACKLOG) e quem escreve continua sendo o `polozi-gerente-de-trabalho`.

## 4. Peças (regra F3: script > skill > agente > humano)

| Peça | Tipo | Faz |
|---|---|---|
| `pmo-quadro` | skill (entrada) | Ver o quadro, abrir tarefa ou Rock, priorizar, mover, cancelar. Única que gera escrita de tarefa. |
| `pmo-semana` | skill | Planejar a semana: o que já está em andamento + o topo da fila até a capacidade; o dono aprova; marca `metadata.semana`. |
| `pmo-revisao-semanal` | skill | Ritual semanal (agendável): relatório em `operacao/pmo/revisoes/AAAA-Www.md` com concluídas, paradas, atrasadas, bloqueadas, Rocks no trilho ou fora, pontos e o planejado contra o feito. Modo agendado só escreve o relatório. |
| `pmo-trilha` | skill | Curso e plano de 90 dias: progresso por fase, cronograma (prazos), Rocks do trimestre, nível alvo; no fim do trimestre propõe os próximos 3 a 7 Rocks. |
| `pmo-pontos` | skill | Pontos da empresa e por pessoa, na semana e no total, com a regra explicada. |
| `pmo-conferente` | subagente só leitura | Confere a prova de tarefa de plano90 ou Rock antes de concluir. Motivo da independência: pontos e nível dão incentivo pra marcar feito sem prova, e na Casa quem faz não se aprova. Ferramentas Read, Grep, Glob; sandbox read-only (no Codex lê com `cat`, `sed -n`, `head`, `grep`, `rg`, `ls`, `git diff`, `git show`, `git log`, nunca com comando que escreva, instale ou chame a rede); opus medium no Claude e `gpt-6.1-sol` medium no Codex, diferente do `gpt-5.6-terra` da sessão da Casa (mesma exceção do avaliador em `native-ai-construir/referencias/plataformas.md`: quem confere não usa o modelo de quem fez). Exceção registrada no Claude: a Casa não fixa o modelo da sessão, então lá a troca de modelo não é garantida; a independência vem do contexto separado e das ferramentas só de leitura. Para tirar a exceção, a Casa teria de fixar `model` no `.claude/settings.json` (proposta, não aplicada). |

Invocação implícita: as skills ficam com o padrão do Codex (sem `agents/openai.yaml` com `allow_implicit_invocation: false`), exceção escrita aqui de propósito. O dono não técnico não digita `$pmo-quadro`; ele fala "o que tem pra fazer". O risco de escrita fica coberto por 3 travas: toda gravação no banco pede o "sim" explícito do dono, o script recusa o que a regra não deixa, e a revisão agendada só escreve o relatório.

Scripts (só stdlib, Python 3.10+, sem rede, saída 0 ok, 1 recusa ou achado, 2 uso errado; mensagens em pt-BR):

- `.agents/skills/pmo-quadro/scripts/nucleo.py`: biblioteca (carregar tarefas, transições, prazo efetivo, bloqueio, idade, fila, pontos, Rocks do plano90, SQL seguro). Os outros scripts importam daqui.
- `.agents/skills/pmo-quadro/scripts/quadro.py`: `consulta` (imprime o SELECT, ou grava o resultado com `--gravar-em ARQ --sistema DIR`), `ver`, `fila`, `achar` (id da tarefa ou da pessoa por trecho do nome), `abrir`, `mover`, `ajustar` (com `--gravar --sistema DIR` gravam pelo CLI e imprimem `Gravado: <id>`; sem `--gravar` só imprimem o SQL).
- `.agents/skills/pmo-semana/scripts/semana.py`
- `.agents/skills/pmo-revisao-semanal/scripts/revisao.py`
- `.agents/skills/pmo-trilha/scripts/trilha.py`
- `.agents/skills/pmo-pontos/scripts/pontos.py`

## 5. Fora de escopo (07/10)

Pacotes W1-W15 dos cargos de PMO (19/11, pela `modelar-cargo`), tela nova, migration, tabela de pontos, módulo de gamificação, nível medido.
