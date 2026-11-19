# Tasks

O dia a dia do registro mora no banco (tela Tarefas) e numa fila local que o hook mantém
sozinho em `operacao/tasks/.sessoes/` (ignorada pelo git). Você não precisa criar arquivo
nenhum por pedido: o hook guarda o pedido, o agente registra o objetivo e conclui com prova
(`manual/fluxo-operacional.md`).

Esta pasta só tem `TASK-N/TASK.md` quando o trabalho precisa continuar noutra conversa, é do
plano, ou você pede ("cria a ficha"). Aí vale: uma pasta por trabalho, com objetivo, critérios
de pronto (ID, resultado, evidência da versão final), `## Checkpoint` com o próximo passo exato e,
na transferência, `HANDOFF.md` ao lado. O formato vem de `TEMPLATE-TASK.md`; não mude os bullets
do topo: quem fecha a ficha é a habilidade polozi-concluir-trabalho, que procura a linha `- Status:`.

Correção: 1 revisão e 1 correção por etapa. Se o mesmo critério falhar de novo, pare, anote em
`operacao/PENDENCIAS.md` e peça ajuda ao dono; não fique em laço.
