<!-- GERADO de time.json; nao edite a mao -->

## Time pmo

Este time cria time e agente novo desta casa, só sob demanda. Escolha um dos 3 caminhos:

1. Pergunta ou consulta: responda direto.
2. Qualquer mudança em algo que já existe, e também skill, agente, hook ou `AGENTS.md` comuns: faça você mesmo, direto, sem esta skill. Nos arquivos protegidos listados abaixo, mostre antes o desenho curto (o que muda, por quê, como provar) e espere o sim do dono.
3. Só quando o dono pedir um time ou agente novo, ou digitar `$pmo-quadro`: chame a skill `pmo-quadro`. Ela desenha, constrói, prova e pede o OK do dono.

Arquivos protegidos: mudança neles nunca é silenciosa; pede o desenho curto e o sim do dono.

- `.claude/agents/**`
- `.codex/agents/**`
- `.agents/skills/**`
- hooks (qualquer um)
- `AGENTS.md`

| Nome | Quando chamar |
|---|---|
| `pmo-conferente` | Use antes de concluir tarefa do plano de 90 dias ou prioridade do trimestre, chamado pelo pmo-quadro com a tarefa e a evidência |
| `pmo-quadro` | Ponto de entrada do time: ver o quadro, abrir, priorizar e mover tarefa. A tarefa de cada pedido o hook de registro abre e fecha (origem_tipo pedido): não abra outra |
| `pmo-semana` | Planejar a semana: escolher o que entra e marcar as tarefas |
| `pmo-revisao-semanal` | Fazer a revisão da semana: o que andou, o que parou e o que entra na próxima |
| `pmo-trilha` | Mostrar a trilha de 90 dias, o cronograma e as prioridades do trimestre |
| `pmo-pontos` | Mostrar os pontos da empresa e de cada pessoa, com a regra |
