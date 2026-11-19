<!-- GERADO de time.json; nao edite a mao -->

## Time tecnologia

Este time cria time e agente novo desta casa, só sob demanda. Escolha um dos 3 caminhos:

1. Pergunta ou consulta: responda direto.
2. Qualquer mudança em algo que já existe, e também skill, agente, hook ou `AGENTS.md` comuns: faça você mesmo, direto, sem esta skill. Nos arquivos protegidos listados abaixo, mostre antes o desenho curto (o que muda, por quê, como provar) e espere o sim do dono.
3. Só quando o dono pedir um time ou agente novo, ou digitar `$tecnologia-sistema`: chame a skill `tecnologia-sistema`. Ela desenha, constrói, prova e pede o OK do dono.

Arquivos protegidos: mudança neles nunca é silenciosa; pede o desenho curto e o sim do dono.

- `.claude/agents/**`
- `.codex/agents/**`
- `.agents/skills/**`
- hooks (qualquer um)
- `AGENTS.md`

| Nome | Quando chamar |
|---|---|
| `tecnologia-revisor-seguranca` | Use só quando o diff toca migration, login ou autorização, arquivo protegido ou padrão de segredo, chamado pelo tecnologia-publicar com o diff e pelo tecnologia-mudar-banco antes do veredito |
| `tecnologia-sistema` | Ponto de entrada do time: chame pelo nome |
| `tecnologia-publicar` | Chame pelo nome |
| `tecnologia-mudar-banco` | Chame pelo nome |
| `tecnologia-vigiar` | Chame pelo nome |
| `tecnologia-acessos` | Chame pelo nome |
| `tecnologia-definir-o-que` | Chame pelo nome |
| `tecnologia-construir-tela` | Chame pelo nome |
| `tecnologia-conectar` | Chame pelo nome |
| `tecnologia-aplicar-marca` | Chame pelo nome |
