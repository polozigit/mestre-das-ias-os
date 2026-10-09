# Modelos e nível de esforço

Use os nomes disponíveis na interface atual. Se eles mudarem, escolha o equivalente pela finalidade, não apenas pelo nome.

## Modelo

| Necessidade | Escolha sugerida |
|---|---|
| Classificar, extrair, formatar, organizar ou executar tarefa curta e clara | modelo rápido, como Luna |
| Criar documentos, analisar materiais e realizar trabalho empresarial cotidiano | modelo equilibrado, como Terra |
| Resolver ambiguidade, estratégia, arquitetura, pesquisa complexa ou decisão crítica | modelo mais capaz, como Sol |

## Esforço

| Situação | Esforço sugerido |
|---|---|
| Tarefa repetitiva, curta e totalmente especificada | baixo |
| Produção normal com análise moderada | médio |
| Muitas fontes, dependências, revisão ou decisão importante | alto |
| Problema muito ambíguo, crítico ou investigativo | extra alto, quando disponível |

Modelo e esforço não corrigem falta de contexto. Antes de aumentar o esforço, confira se o objetivo, as fontes e o critério de conclusão estão claros.

Não troque o modelo silenciosamente. Oriente o usuário antes de iniciar quando houver ganho relevante de qualidade, velocidade ou economia.

## No dia a dia: deixe o Terra no seletor

O seletor do app vale para a conversa principal. Os agentes do kit têm modelo e esforço fixados no `.toml` de cada um, e esse arquivo vence o seletor (learn.chatgpt.com/docs/agent-configuration/subagents, lida em 09/10/2026). Não recomendamos o Luna como padrão do seletor: a OpenAI indica o Luna para tarefas focadas e repetitivas (resumo, extração, classificação), não para o trabalho geral da conversa (learn.chatgpt.com/docs/models). O kit já usa o Luna onde ele rende: nos agentes de rotina e de conferência e nos subagentes de leitura e busca, que custam cerca de 20 vezes menos por token que o Terra (learn.chatgpt.com/docs/pricing).

Nenhum agente do kit roda em esforço alto. Suba o esforço só em uma tarefa específica, nunca como padrão.

## O que a tela mostra x o que o arquivo grava

| Rótulo na tela | Valor gravado em `model_reasoning_effort` |
|---|---|
| Low | `low` |
| Medium (padrão) | `medium` |
| High | `high` |
| Extra High | `xhigh` |
| Max | não publicado — sem valor de config correspondente documentado |

O mapeamento acima não é 1:1 publicado pela OpenAI; trate como aproximação.
`Terra` (`gpt-5.6-terra`) já vem pinado em `.codex/config.toml`.
