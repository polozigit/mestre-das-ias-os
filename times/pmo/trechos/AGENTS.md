<!-- GERADO de time.json; nao edite a mao -->

## Time pmo

Este time cria e melhora agentes, skills e fluxos desta casa. Antes de agir, escolha um dos 3 caminhos:

1. Pergunta ou consulta: responda direto.
2. Mudança pequena em algo que já existe (um texto, um número, um ajuste simples): mostre o desenho curto e espere o sim do dono. Este caminho não vale para os arquivos protegidos listados abaixo.
3. Coisa nova (agente, skill, fluxo ou sistema) ou mudança em arquivo protegido: chame a skill `pmo-quadro`. Ela desenha, constrói, prova e pede o OK do dono.

Arquivos protegidos: qualquer mudança neles vai pelo caminho 3, com a prova e a revisão do avaliador do time, e nunca pelo caminho 2.

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
