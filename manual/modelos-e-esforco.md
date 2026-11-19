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

Não troque o modelo silenciosamente. Oriente o usuário quando houver ganho relevante de qualidade, velocidade ou economia.

## Quem escolhe é você

O modelo e o esforço da conversa principal são escolha sua, no seletor do app. A Casa não fixa nenhum dos dois
(o `.codex/config.toml` não tem `model` nem `model_reasoning_effort`), e a IA não troca o próprio modelo.

- Planejar trabalho grande, decidir arquitetura ou analisar muita coisa: escolha o modelo mais forte (Sol).
- Executar o que já está planejado: o padrão do app.
- Tarefa repetitiva e totalmente especificada: vale virar uma rotina agendada.
- Nada disso é regra de mensagem: a IA sugere quando houver ganho claro, e você decide.

O seletor vale para a conversa principal. Os agentes do kit têm modelo e esforço fixados no `.toml` de cada um,
e esse arquivo vence o seletor (learn.chatgpt.com/docs/agent-configuration/subagents, lida em 09/10/2026). O kit
usa o Luna onde ele rende, nos agentes de rotina e de conferência, que custam cerca de 20 vezes menos por token
(learn.chatgpt.com/docs/pricing). O Sol fica só no revisor de segurança, em esforço médio.

Nenhum agente do kit roda em esforço alto. Suba o esforço só em uma tarefa específica, nunca como padrão.

## O que a tela mostra x o que o arquivo grava

| Rótulo na tela | Valor gravado em `model_reasoning_effort` |
|---|---|
| Low | `low` |
| Medium (padrão) | `medium` |
| High | `high` |
| Extra High | `xhigh` |
| Max | não publicado, sem valor de config correspondente documentado |

O mapeamento acima não é 1:1 publicado pela OpenAI; trate como aproximação. Quando você escolhe no seletor,
ele vale para a conversa; o arquivo de configuração só entra se alguém o fixar.
