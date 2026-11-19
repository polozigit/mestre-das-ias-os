# Etapa 9: Apresentação e aprovação

**Objetivo:** mostrar ao dono o que o estudo descobriu, perguntar se é esse o cliente que ele quer atrair e só então pedir o "sim" para aprovar e publicar.

O dono não recebe um arquivo pronto: recebe as descobertas, o que ele achava ao lado do que o mercado mostra, e é chamado a decidir. Exemplo: a mesma empresa fictícia (Clima Exemplo Ar-Condicionado, Campinas).

## O que ler

1. `empresa/publico/estudo/6-estudo.json`: `abertura`, `descobertas`, `quem`, `sabe`, `mensagem` (a promessa sugerida, as provas e as dúvidas) e `apostas`. É o mesmo conteúdo do `persona.md`, mais curto de ler.
2. `empresa/publico/estudo/8-revisao.md`: se veio BLOCKED, o que foi apontado e corrigido.

## Antes de mostrar

Marque o Mapa como esperando a confirmação dele:
`<PY> .agents/skills/marketing-persona/scripts/mapa_estado.py --papel publico.persona --estado em-revisao`

## Roteiro da apresentação (mensagem 1)

Uma mensagem só, de até 25 linhas, nesta ordem e com estes títulos curtos em negrito. Se não couber, corte nos itens 2 e 5, nunca nas descobertas:

1. **O que eu descobri.** As descobertas (`descobertas.itens`), uma por linha, com o `titulo` em palavras simples.
2. **O que você achava e o que o mercado mostra.** Para as duas descobertas mais fortes, uma linha cada: a evidência `disse` ("Você me disse: ...") ao lado da evidência `pesquisa` ("Na internet, quem compra fala: ..."). Sem pesquisa: "Desta vez não deu para pesquisar na internet; comparei as suas próprias respostas."
3. **Quem é o seu cliente ideal.** O arquétipo e o retrato (`abertura`), e o que mais trava (o peso maior do lado que segura, em `forcas`). Diga o quanto ele já sabe de você pelo degrau em foco (`sabe`), sem dizer "nível de consciência".
4. **O que muda.** A promessa de hoje ao lado da sugerida, uma prova que ele já tem e a resposta pronta para a dúvida que mais trava (`mensagem`).
5. **O que ainda não sabemos.** 1 ou 2 apostas (`apostas`) com o jeito de confirmar, e que esta é uma primeira versão, montada do que ele contou e do que é público na internet, sem ouvir cliente.
6. Se a revisão veio BLOCKED: em 1 frase, o que o revisor apontou e como foi corrigido.
7. Termine com a pergunta: "É esse o cliente que você quer atrair?"

## Regras de decisão

- Se ele responde que sim (com qualquer palavra), mande a mensagem 2: "Está certo? Responda sim para eu aprovar e publicar, ou diga o que mudar."
- Se ele diz que não, ou que o cliente que ele quer é outro: pergunte "O que é diferente no cliente que você quer?", grave a pergunta e a resposta dele no `5-entrevista.md` (motivo `confronto da descoberta N`, a que ele contestou; se ali já há 5 perguntas, não acrescente: tire o que ele contestou ou troque por `hipotese` com a razão "o dono discorda"), ajuste o `6-estudo.json` com a origem `relato AAAA-MM-DD`, rode `<PY> .agents/skills/marketing-persona/scripts/persona_estudo.py montar` e `<PY> .agents/skills/marketing-persona/scripts/estudo.py conferir --etapa 7`, mostre só o que mudou e faça de novo a pergunta "É esse o cliente que você quer atrair?". O revisor não é chamado de novo nesta montagem.
- Só vale o "sim" escrito em resposta à mensagem 2, sobre ESTE texto: "ok", "pode" ou o sim de outro assunto não valem, e "sim, mas muda X" não é sim: faça a mudança, rode a conferência da etapa 7 de novo e pergunte de novo.
- Com o "sim" valendo, siga a seção "Aprovar, publicar e salvar" da `SKILL.md`: ela grava o sim (`aprovacao.py registrar`), marca o Mapa como aprovado, publica e salva.

## Exemplo da mensagem 1

```
**O que eu descobri**
1. Quem chega pelo Google não quer o mais barato: quer saber se o preço vai mudar.
2. Você ganha o cliente com hora marcada e casa limpa, mas não fala disso para quem ainda não te conhece.
3. Quem mora em apartamento pergunta da regra do condomínio, e nenhum concorrente responde.

**O que você achava e o que o mercado mostra**
- Você me disse que o cliente do Google "só quer saber o preço e some". Na internet, quem compra pergunta o que a instalação básica cobre e reclama de material cobrado fora do orçamento.
- Você me disse que o cliente fica pelo horário certo e pela casa limpa. Na internet, as reclamações são justamente de pó de cimento e de técnico que chega horas depois.

**Quem é o seu cliente ideal**
A família do apartamento novo: acabou de pegar as chaves ou de comprar o aparelho e quer instalar antes da primeira onda de calor. O que mais trava é não saber se o material está no preço. Quem chega por indicação já confia em você; quem chega pelo Google ainda está comparando.

**O que muda**
Hoje a promessa é "instalação com hora marcada e casa limpa no fim". A sugerida põe o preço na frente: orçamento fechado, hora marcada e casa limpa no fim. Prova que você já tem: garantia de um ano por escrito. Para "o preço já inclui o material?", a resposta pronta é "sim, o material entra no orçamento".

**O que ainda não sabemos**
Se o cliente do Google some por não saber se o preço vai mudar: dá para confirmar em duas semanas, mandando orçamento fechado aos próximos pedidos e contando quantos respondem. Esta é uma primeira versão, montada do que você me contou e do que é público na internet; nenhum cliente foi ouvido.

Uma revisão independente pediu para eu tirar "sem cobrança extra" da promessa, porque você não garante isso; tirei.

É esse o cliente que você quer atrair?
```

## Conferir

Depois de gravar o sim (seção "Aprovar, publicar e salvar" da `SKILL.md`):

`<PY> .agents/skills/marketing-persona/scripts/estudo.py conferir --etapa 9`

- Saída 0: o estudo terminou. `<PY> .agents/skills/marketing-persona/scripts/estudo.py estado` deve dizer `CONCLUÍDO`.
- Saída 1: falta o sim valendo (o texto mudou depois dele, ou ele não foi gravado). Volte ao começo desta etapa.

## O que dizer ao dono

Só as duas mensagens acima e, depois de publicar, a frase da `SKILL.md` ("Está em Marca, aba Persona."). Palavras dele: "cliente ideal", "o que a gente sabe e o que ainda não sabe", "primeira versão", "o quanto o cliente já sabe de você".

## Nunca

- Mandar o arquivo inteiro em vez do roteiro.
- Pedir o "sim" antes da pergunta "É esse o cliente que você quer atrair?".
- Apresentar a persona como confirmada: é uma primeira versão, sem ouvir cliente.
- Escrever a linha de aprovação à mão, ou mudar o texto depois do sim.
- Usar palavra técnica sem explicar: nada de ICP, JTBD, persona sintética, nível de consciência.
