<!-- GERADO de time.json; nao edite a mao -->

## Time marketing

Este time cria e melhora agentes, skills e fluxos desta casa. Antes de agir, escolha um dos 3 caminhos:

1. Pergunta ou consulta: responda direto.
2. Mudança pequena em algo que já existe (um texto, um número, um ajuste simples): mostre o desenho curto e espere o sim do dono. Este caminho não vale para os arquivos protegidos listados abaixo.
3. Coisa nova (agente, skill, fluxo ou sistema) ou mudança em arquivo protegido: chame a skill `marketing-persona`. Ela desenha, constrói, prova e pede o OK do dono.

Arquivos protegidos: qualquer mudança neles vai pelo caminho 3, com a prova e a revisão do avaliador do time, e nunca pelo caminho 2.

- `.claude/agents/**`
- `.codex/agents/**`
- `.agents/skills/**`
- hooks (qualquer um)
- `AGENTS.md`

| Nome | Quando chamar |
|---|---|
| `marketing-revisor` | Use antes de publicar persona, identidade visual, tom de voz ou logo, chamado pelas skills marketing-persona, marketing-identidade e marketing-logo com o documento e o dossiê |
| `marketing-persona` | Ponto de entrada do time: montar o cliente ideal e a persona a partir do dossiê da empresa |
| `marketing-identidade` | Montar a identidade da marca completa e o tom de voz, a partir do dossiê, da persona e do site, Instagram ou apresentação do dono |
| `marketing-logo` | Tratar o logo que o dono entregou: fundo transparente, ícone e variantes |
