# Time PMO

Time de agentes que cuida das tarefas da empresa do aluno: ver o quadro, abrir e priorizar, montar a semana, revisar a semana, acompanhar a trilha de 90 dias e mostrar os pontos.

## Skills e subagente

| Nome | O que faz |
|---|---|
| `pmo-quadro` | Ponto de entrada. Mostra o quadro, monta a fila, abre tarefa e prioridade do trimestre, move de coluna e ajusta. É a única que gera escrita de tarefa; concluir tarefa do plano de 90 dias ou prioridade do trimestre exige a conferência do `pmo-conferente`. |
| `pmo-semana` | Planeja a semana: o que já está andando mais o topo da fila até a capacidade de cada pessoa; com o "sim" do dono, marca as tarefas na semana. |
| `pmo-revisao-semanal` | Ritual de 30 minutos (limpar, atualizar, criar) com as prioridades do trimestre e os pontos. Grava o relatório em `operacao/pmo/revisoes/`. Pode rodar agendada, só gerando o relatório. |
| `pmo-trilha` | Curso e plano de 90 dias: progresso por fase, cronograma, prioridades do trimestre e o nível que a trilha leva. No fim do trimestre propõe as próximas 3 a 7 prioridades. |
| `pmo-pontos` | Pontos da empresa e por pessoa, na semana e no total, com a regra explicada. Calculados, nunca gravados. |
| `pmo-conferente` (subagente) | Confere, só lendo, se a prova de uma tarefa do plano de 90 dias ou de uma prioridade do trimestre está cumprida antes de concluir: devolve `CONFERE` ou `NAO_CONFERE` com a evidência de cada critério. |

## Modelo de gestão

Três camadas: o quadro do dia a dia (Kanban, com limite de 3 tarefas em andamento por pessoa), a revisão semanal de 30 minutos (limpar, atualizar, criar) e as prioridades do trimestre (de 3 a 7, "no trilho" ou "fora do trilho", revistas toda semana). Tudo mora na tabela `tarefas` que o sistema já tem, sem tabela nem tela nova. O banco é lido e gravado pelo programa `supabase` já ligado ao projeto (a ligação é feita pelo time Tecnologia); toda gravação passa pelos scripts com `--gravar`, nunca por SQL à mão, e o acesso de leitura do MCP do Supabase serve só para ler. As regras que o agente não pode quebrar ficam nos scripts, provadas por teste. As fontes, as regras de cada coluna e o que foi descartado (Scrum, Shape Up, PMBOK, OKR) estão em [`DESENHO.md`](DESENHO.md).

## Onde moram

- `time.json`: lista de agentes e skills (fonte do time).
- `.agents/skills/<nome>/`: cada skill, com `SKILL.md` e `scripts/`.
- `agentes/`: instruções do subagente.
- `tests/`: testes do time.
- `DESENHO.md`: regras de negócio (fonte de verdade; mudança de regra muda lá primeiro).

## Testes

```
cd 10-mestre-das-ias/chatgpt-work-codex/times/pmo
python3 -m unittest discover -s tests -v
```

## Gerar as saídas

```
python3 ../native-ai/.agents/skills/native-ai-construir/scripts/gerar_saidas.py --raiz .
```

Fonte aninhada: só gera `.codex/agents` e `trechos/`.
