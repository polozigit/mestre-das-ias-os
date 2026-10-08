# Handoff — {{TASK_ID}}

> Gerado por `$polozi-transferir-trabalho` em {{DATA_ATUAL}}. Quem retomar lê
> isto primeiro, antes de perguntar qualquer coisa no chat.

**Task:** {{OBJETIVO_RESUMIDO}} — critério de pronto em `operacao/tasks/{{TASK_ID}}/TASK.md`.

## O que foi feito

{{RESUMO_DO_FEITO}}

## Arquivos alterados

{{LISTA_DE_ARQUIVOS}}

## Decisões tomadas

{{DECISOES_CONFIRMADAS_PELO_DONO}}

## Pendências

{{PENDENCIAS_ABERTAS}}

## Próxima ação

{{PROXIMA_ACAO_EXATA_E_LITERAL}}

## Onde está o trabalho

- Ramo: `{{RAMO}}` (`main` com o sistema fora do ar; com o sistema no ar, a branch curta da task: abra essa branch antes de continuar, nunca a `main`)
- Commit de checkpoint: `{{SHA_CURTO}}` — provado sincronizado no GitHub

## Prompt de continuação

Cole isto na sessão nova:

> Continuar {{TASK_ID}}. Leia o handoff e continue da próxima ação. Não
> crie task nova.
