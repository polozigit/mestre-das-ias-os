<!-- GERADO de time.json; nao edite a mao -->

## Time marketing

Este time cria time e agente novo desta casa, só sob demanda. Escolha um dos 3 caminhos:

1. Pergunta ou consulta: responda direto.
2. Qualquer mudança em algo que já existe, e também skill, agente, hook ou `AGENTS.md` comuns: faça você mesmo, direto, sem esta skill. Nos arquivos protegidos listados abaixo, mostre antes o desenho curto (o que muda, por quê, como provar) e espere o sim do dono.
3. Só quando o dono pedir um time ou agente novo, ou digitar `$marketing-persona`: chame a skill `marketing-persona`. Ela desenha, constrói, prova e pede o OK do dono.

Arquivos protegidos: mudança neles nunca é silenciosa; pede o desenho curto e o sim do dono.

- `.claude/agents/**`
- `.codex/agents/**`
- `.agents/skills/**`
- hooks (qualquer um)
- `AGENTS.md`

| Nome | Quando chamar |
|---|---|
| `marketing-revisor` | Use antes de publicar persona, identidade visual, tom de voz ou logo, chamado pelas skills marketing-persona, marketing-identidade e marketing-logo com o documento e o dossiê |
| `marketing-pesquisador` | Use só na etapa 2 da skill marketing-persona (pesquisa de mercado em três frentes: alternativas, voz do cliente, dúvidas e reclamações); devolve até 50 trechos de até 10 páginas, cada um com link, data, trecho literal, frente e tema |
| `marketing-analista` | Use só nas etapas 3 e 4 da skill marketing-persona, uma chamada por estudo e no máximo uma volta de correção; lê dossiê, escopo, hipótese do dono e pesquisa e devolve um JSON com a análise e as descobertas |
| `marketing-persona` | Ponto de entrada do time: montar o cliente ideal e a persona a partir do dossiê da empresa |
| `marketing-identidade` | Montar a identidade da marca completa e o tom de voz, a partir do dossiê, da persona e do site, Instagram ou apresentação do dono |
| `marketing-logo` | Tratar o logo que o dono entregou: fundo transparente, ícone e variantes |
