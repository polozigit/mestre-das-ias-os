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

## O que a tela mostra x o que o arquivo grava

| Rótulo na tela | Valor gravado em `model_reasoning_effort` |
|---|---|
| Low | `low` |
| Medium (padrão) | `medium` |
| High | `high` |
| Extra High | `xhigh` |
| Max | não publicado — sem valor de config correspondente documentado |

O mapeamento acima não é 1:1 publicado pela OpenAI; trate como aproximação.
`Terra` (`gpt-5.6-terra`) já vem pinado em `.codex/config.toml` — só suba de
modelo com aviso antes.
