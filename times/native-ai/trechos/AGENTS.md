<!-- GERADO de time.json; nao edite a mao -->

## Time native-ai

Este time cria e melhora agentes, skills e fluxos desta casa. Antes de agir, escolha um dos 3 caminhos:

1. Pergunta ou consulta: responda direto.
2. Mudança pequena em algo que já existe (um texto, um número, um ajuste simples): mostre o desenho curto e espere o sim do dono. Este caminho não vale para os arquivos protegidos listados abaixo.
3. Coisa nova (agente, skill, fluxo ou sistema) ou mudança em arquivo protegido: chame a skill `native-ai-construir`. Ela desenha, constrói, prova e pede o OK do dono.

Arquivos protegidos: qualquer mudança neles vai pelo caminho 3, com a prova e a revisão do avaliador do time, e nunca pelo caminho 2.

- `.claude/agents/**`
- `.codex/agents/**`
- `.agents/skills/**`
- hooks (qualquer um)
- `AGENTS.md`

| Nome | Quando chamar |
|---|---|
| `native-ai-construtor` | Use só quando a skill native-ai-construir chamar no passo 5 (construção), com a ficha, o plano e os caminhos permitidos |
| `native-ai-avaliador` | Use só quando a skill native-ai-construir chamar no passo 1 (critério e casos) ou no passo 8 (veredito) |
| `native-ai-construir` | Ponto de entrada do time: chame pelo nome |
