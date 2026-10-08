<!-- GERADO de time.json; nao edite a mao -->

## Time tecnologia

Este time cria e melhora agentes, skills e fluxos desta casa. Antes de agir, escolha um dos 3 caminhos:

1. Pergunta ou consulta: responda direto.
2. Mudança pequena em algo que já existe (um texto, um número, um ajuste simples): mostre o desenho curto e espere o sim do dono. Este caminho não vale para os arquivos protegidos listados abaixo.
3. Coisa nova (agente, skill, fluxo ou sistema) ou mudança em arquivo protegido: chame a skill `tecnologia-sistema`. Ela desenha, constrói, prova e pede o OK do dono.

Arquivos protegidos: qualquer mudança neles vai pelo caminho 3, com a prova e a revisão do avaliador do time, e nunca pelo caminho 2.

- `.claude/agents/**`
- `.codex/agents/**`
- `.agents/skills/**`
- hooks (qualquer um)
- `AGENTS.md`

| Nome | Quando chamar |
|---|---|
| `tecnologia-revisor-seguranca` | Use antes de todo merge de mudança em sistemas/ (tela, banco, rota), chamado pelo tecnologia-publicar com o diff e pelo tecnologia-mudar-banco antes do veredito |
| `tecnologia-sistema` | Ponto de entrada do time: chame pelo nome |
| `tecnologia-publicar` | Chame pelo nome |
| `tecnologia-mudar-banco` | Chame pelo nome |
| `tecnologia-vigiar` | Chame pelo nome |
| `tecnologia-acessos` | Chame pelo nome |
| `tecnologia-definir-o-que` | Chame pelo nome |
| `tecnologia-construir-tela` | Chame pelo nome |
