# Etapa 4: Descobertas

**Objetivo:** achar de 1 a 3 coisas que o dono não sabia sobre o cliente dele, cada uma com o que ele disse ao lado do que o mercado mostra, por que importa e o que fazer.

Descoberta é o coração do estudo: é o que faz o dono ver o próprio cliente de outro jeito. Exemplo: a mesma empresa fictícia (Clima Exemplo Ar-Condicionado, Campinas).

## Quem faz esta etapa

O subagente `marketing-analista`, na mesma chamada da etapa 3 (decisão de 19/11/2026: o raciocínio das etapas 3 e 4 roda com o modelo mais forte; o resto do estudo fica com você). Ele já devolveu o campo `descobertas_md`, e você já gravou o texto em `empresa/publico/estudo/4-descobertas.md` e rodou as duas conferências no passo 3 do roteiro da etapa 3.

1. Não chame o analista de novo para esta etapa: a resposta da etapa 3 vale para as duas.
2. Rode `<PY> .agents/skills/marketing-persona/scripts/estudo.py conferir --etapa 4`. Saída 0: siga.
3. Saída 1 e a correção do analista ainda não foi usada: devolva os PROBLEMAS ao analista UMA vez, como no passo 4 do roteiro da etapa 3, grave os dois campos de novo e rode as conferências 3 e 4. Correção já usada: corrija você só a linha que cada PROBLEMA aponta, pelas regras abaixo. São no máximo 2 chamadas por estudo.
4. Não troque, corte nem reescreva as descobertas do analista além do que um PROBLEMA aponta.

**Plano B: o analista faltou ou falhou na etapa 3.** Você faz esta etapa pelo molde e pelas regras abaixo (o dono já foi avisado em 1 frase na etapa 3; não avise de novo).

O resto deste roteiro é o que o analista segue e o que você segue no plano B ou para corrigir um PROBLEMA que sobrou.

## O que ler

1. `empresa/publico/estudo/1-hipotese-do-dono.md`
2. `empresa/publico/estudo/2-pesquisa.json` (`n`, `trecho`, `frente`, `tema`)
3. `empresa/publico/estudo/3-analise.md`
4. Para os cruzamentos: a mesma saída de `<PY> .agents/skills/marketing-persona/scripts/dossie_para_persona.py --bloco publico --bloco dor --bloco oferta --bloco tom` da etapa 3, só os códigos que cada cruzamento cita.

## O que gravar

`empresa/publico/estudo/4-descobertas.md`

## Como achar uma descoberta: três buscas, nesta ordem

Faça as três buscas. Cada uma pode render uma descoberta. Fique com as 3 mais fortes (a que muda mais o que a empresa faz amanhã).

1. **Onde dono e mercado discordam.** Para cada linha da hipótese do dono (etapa 1), procure fichas que digam outra coisa sobre o mesmo assunto. Exemplo de pergunta a se fazer: "o dono diz que o cliente quer X; os trechos mostram que o cliente fala de Y?". Se acha, o tipo é `dono e mercado discordam`.
2. **O que o cliente fala e a empresa não.** Junte os `tema` das fichas de `voz_do_cliente` e `duvidas_e_reclamacoes`. Para cada tema que aparece em 2 fichas ou mais, veja se o dono fala disso ao cliente (C2, D1, D5). Se o cliente fala e a empresa não comunica, o tipo é `o cliente fala e a empresa não`. Sem ficha de `voz_do_cliente`, use só as de `duvidas_e_reclamacoes`; se o `o_que_sustenta` delas começa por "Um artigo diz que", o trecho é de quem escreveu a página, não do cliente: em "O que o mercado mostra" escreva "artigos sobre o assunto dizem", nunca "o cliente fala".
3. **A dúvida que nenhum concorrente responde.** Pegue cada dúvida das fichas de `duvidas_e_reclamacoes`. Procure a resposta nas fichas de `alternativas` (as páginas e anúncios dos concorrentes). Se nenhuma responde, o tipo é `dúvida que nenhum concorrente responde`.

**Caça a descoberta: os cruzamentos**

As três buscas comparam o dono com o mercado. Falta o que mais ensina ao dono: pôr lado a lado duas coisas que ele disse em perguntas diferentes e nunca juntou. Teste os 8 cruzamentos, um por um, nesta ordem. Em cada um, leia os dois lados e responda: o que isso significa para a venda? o que o dono não está vendo?

1. **X1. O cliente ideal x como vende hoje.** Quem ele diz que é o cliente ideal (B5a, C6) ao lado de como ele vende hoje e quanto vale a compra (C1, C3, B4). Exemplo de descoberta: o cliente ideal compra em volume ou para várias pessoas, e o jeito de vender de hoje fecha uma unidade por vez.
2. **X2. A dúvida que trava x o que ele se recusa a prometer.** C7 ao lado de C11. Se a dúvida que mais trava é justamente o que ele não promete, ela não é uma objeção qualquer: é a pergunta central da compra.
3. **X3. A prova que tem x a prova que usa.** O que prova o serviço (D6, C10, C9, o jeito como a própria empresa trabalha em A2) ao lado do que ele mostra antes de vender (C2, D5).
4. **X4. O que deseja para si x o que atribui ao cliente.** O que o dono preza (D4, D5) ao lado do que ele diz que o cliente quer (B5b, B8). Igual demais é o teste do espelho da etapa 3.
5. **X5. O canal que traz cliente x o cliente que ele quer.** C1 e C3 ao lado de B5a. O canal traz o cliente ideal ou outro?
6. **X6. O que o concorrente promete x o que só ele tem.** As fichas de `alternativas` e B8 ao lado de C10. Sem pesquisa, só B8 e C10.
7. **X7. Quem não compra x quanto custa trazer cada um.** C8 (o que acontece com quem não fecha) ao lado de C1 e C3 (de onde vem o interessado e o que custa trazê-lo).
8. **X8. O que dá mais lucro x onde ele põe o esforço.** B3 e B6 ao lado de C1, C2 e C9.

Conta como descoberta: os dois lados, lidos juntos, mostram uma venda que se ganha ou se perde e que o dono não nomeou, e isso muda o que ele faz amanhã. É só resumo: um lado repete o outro, os dois dizem a mesma coisa, ou a conclusão precisa de um fato que nenhum lado traz (número, prazo, nome). Resumo não vira descoberta.

Escreva o resultado de cada cruzamento na seção `## Cruzamentos testados` (molde abaixo), sempre as 8 linhas, mesmo as sem dado. O cruzamento que virou descoberta disputa as 3 vagas com as três buscas: fique com as que mudam mais o que a empresa faz amanhã.

**Sem pesquisa** (2-pesquisa.json com `busca_disponivel: false` ou sem fichas): faça só esta busca: **duas respostas do dono que não batem**. Compare as respostas do dossiê entre si (por exemplo, B8 "por que o cliente escolhe você" contra C2 "o que você ensina antes de vender", ou B5a contra C6). Se duas respostas puxam para lados diferentes, é uma descoberta do tipo `duas respostas do dono não batem`. Sem nenhuma, escreva uma descoberta sobre a lacuna mais importante da etapa 1 ("o dossiê não diz o que faz o cliente procurar vocês") com o mesmo tipo e `(análise: dossiê CÓDIGO)`.

## Molde

```
# Descobertas

- Data: <AAAA-MM-DD>
- Houve pesquisa: <sim | não, só do dossiê>

## Cruzamentos testados

- X1 O cliente ideal x como vende hoje: <virou a descoberta N | virou a Mais uma | só resumo: por quê | sem dado: o que falta> (marca)
- X2 A dúvida que trava x o que ele se recusa a prometer: <...> (marca)
- <uma linha para cada um dos 8, de X1 a X8, com o nome do roteiro>

## Descoberta 1: <frase curta, que o dono entende sem explicação> (análise: dossiê CÓDIGO + pesquisa [n])

- Explicação em até 4 frases: <o que o dono disse, ao lado do que o mercado mostra, e o que isso quer dizer>
- O que o dono disse: <resumo da resposta do dono> (dossiê CÓDIGO)
- O que o mercado mostra: <resumo dos trechos> (pesquisa [n]) (pesquisa [n])
- Por que importa: <a venda que isso faz ganhar ou perder>
- O que fazer: <uma ação concreta que a empresa pode fazer já> (análise: ...)
- Tipo: <dono e mercado discordam | o cliente fala e a empresa não | dúvida que nenhum concorrente responde | duas respostas do dono não batem>
```

Achou uma quarta descoberta, mais curta, que aponta para outra parte do estudo? Ela não entra como Descoberta 4: vai no fim, assim (no máximo uma):

```
## Mais uma

- Texto: <a descoberta em uma ou duas frases, sem "E mais uma" nem o nome do capítulo: o documento já escreve os dois> (análise: ...)
- Capítulo: <quem | pensa | quer | forcas | decide | onde | sabe | mensagem | nao>
```

Sem pesquisa, a linha do mercado fica sempre assim:

```
- O que o mercado mostra: só do dossiê, sem pesquisa na internet (não consta no dossiê)
```

## Regras de decisão

- A frase da descoberta é sua: termina SEMPRE com `(análise: ...)`, citando a resposta do dono e os trechos que a sustentam.
- "Explicação em até 4 frases" é a sua leitura, escrita para o dono: comece pelo que ele disse ("Você diz que..."), ponha ao lado o que o mercado mostra ("Mas...") e termine dizendo o que isso quer dizer ("O que parece X é Y"). Sem marca (a do título vale para ela), sem parênteses, sem frase entre aspas. Se a explicação só repete o que o dono disse, ainda não é descoberta: procure o que muda quando as duas coisas são lidas juntas.
- "Por que importa" diz a venda que se ganha ou se perde por causa disso, em uma ou duas frases, sem marca e sem parênteses. Se você não consegue dizer que venda muda, a descoberta não é das 3 mais fortes.
- "O que o dono disse" leva só o que o dono disse: `(dossiê CÓDIGO)`. Nunca escreva ali uma conclusão sua.
- "O que o mercado mostra" leva só o que os trechos mostram: `(pesquisa [n])`, uma marca por trecho. Frase entre aspas ali tem de estar no `trecho` de uma das fichas que a própria linha cita: o conferidor reprova aspas de uma ficha atribuídas a outra.
- "O que fazer" é uma ação, não um conselho geral. Certo: "mandar orçamento fechado antes de falar o valor". Errado: "melhorar a comunicação". Se a ação depende de uma informação que você não tem, escreva "perguntar ao dono ..." com `(hipótese)`: a etapa 5 pergunta.
- Se achou mais de 3, fique com as 3 que mudam mais o que a empresa faz; a quarta, se apontar para outra parte do estudo (por exemplo, um vazamento do caminho), vai em "Mais uma", com o capítulo para onde aponta. Se achou 0 com pesquisa, releia a busca 2 com os temas que aparecem uma vez só.
- Se a descoberta precisa de um número, nome de concorrente ou frase de cliente que nenhuma evidência traz, ela não entra.

## Exemplo

```exemplo empresa/publico/estudo/4-descobertas.md
# Descobertas

- Data: 2026-11-18
- Houve pesquisa: sim

## Cruzamentos testados

- X1 O cliente ideal x como vende hoje: virou a descoberta 1, quem chega pelo Google não é o cliente que já confia e compara o que o preço inclui (análise: dossiê B5a + dossiê C1 + dossiê C3)
- X2 A dúvida que trava x o que ele se recusa a prometer: só resumo: a dúvida é do preço e da parede, e o que ele não promete é instalar no mesmo dia; os dois lados não se tocam (análise: dossiê C7 + dossiê C11)
- X3 A prova que tem x a prova que usa: virou a descoberta 2, os elogios de casa limpa não aparecem antes da venda (análise: dossiê D6 + dossiê C9 + dossiê C2)
- X4 O que deseja para si x o que atribui ao cliente: só resumo: hora marcada é o que ele preza e o que ele diz que prende o cliente; foi para o teste do espelho da etapa 3 (análise: dossiê D5 + dossiê B8)
- X5 O canal que traz cliente x o cliente que ele quer: só resumo: a indicação já traz a família do apartamento novo (análise: dossiê C1 + dossiê B5a)
- X6 O que o concorrente promete x o que só ele tem: virou a descoberta 3, a loja e o técnico falam de preço e rapidez e ninguém fala do condomínio (análise: dossiê C10 + pesquisa [1] + pesquisa [2])
- X7 Quem não compra x quanto custa trazer cada um: só resumo: quem some recebe uma tentativa só, e isso já está no vazamento do orçamento da etapa 3 (análise: dossiê C3 + dossiê C8)
- X8 O que dá mais lucro x onde ele põe o esforço: virou a Mais uma (análise: dossiê B3 + dossiê C9)

## Descoberta 1: o cliente do Google não quer o mais barato, quer saber se o preço vai mudar (análise: dossiê C3 + pesquisa [5] + pesquisa [7])

- Explicação em até 4 frases: Você diz que quem chega pelo Google só quer saber o preço e some. Mas as dúvidas públicas sobre instalação são sobre o que o preço básico cobre, e as reclamações são de material cobrado fora do orçamento. O que parece caça ao menor preço é medo de o preço crescer depois.
- O que o dono disse: o cliente do Google só quer saber o preço e some (dossiê C3)
- O que o mercado mostra: as dúvidas públicas são sobre o que a instalação básica cobre e as reclamações são de material cobrado fora do orçamento (pesquisa [5]) (pesquisa [7])
- Por que importa: Se a resposta ao primeiro contato é só um número, ele compara com o técnico do bairro, que sempre parece mais barato, e some.
- O que fazer: mandar orçamento fechado, dizendo o que está incluído, antes de falar o valor (análise: dossiê C7 + pesquisa [5])
- Tipo: dono e mercado discordam

## Descoberta 2: a empresa ganha por hora marcada e casa limpa, mas não fala disso para quem ainda não a conhece (análise: dossiê B8 + dossiê C2 + pesquisa [3])

- Explicação em até 4 frases: O cliente fica com você porque você marca horário certo e deixa tudo limpo. As reclamações públicas contra quem instala são exatamente de pó de cimento e de técnico que chega horas depois. Mesmo assim, o que a empresa mostra antes da venda é só o serviço.
- O que o dono disse: o cliente fica porque ele marca horário certo e deixa tudo limpo (dossiê B8); a empresa só anuncia o serviço (dossiê C2)
- O que o mercado mostra: as reclamações públicas são de pó de cimento e de técnico que chega horas depois (pesquisa [3]) (pesquisa [4])
- Por que importa: O seu maior diferencial só aparece depois da compra. Para quem chega pelo Google, você é mais um instalador.
- O que fazer: abrir o primeiro contato com hora marcada e casa limpa (análise: dossiê D5 + pesquisa [3])
- Tipo: o cliente fala e a empresa não

## Descoberta 3: quem mora em apartamento pergunta da regra do condomínio, e nenhuma alternativa responde (análise: dossiê B5a + pesquisa [6] + pesquisa [1] + pesquisa [2])

- Explicação em até 4 frases: O seu melhor cliente acabou de mudar para um apartamento novo. Em fórum, a dúvida de onde a parte de fora do aparelho pode ficar aparece; na página da loja e no anúncio do técnico do bairro, não.
- O que o dono disse: o melhor cliente mudou para um apartamento novo (dossiê B5a)
- O que o mercado mostra: a dúvida sobre a condensadora na fachada aparece no fórum e não aparece na loja nem no anúncio do técnico (pesquisa [6]) (pesquisa [1]) (pesquisa [2])
- Por que importa: É uma dúvida que trava a decisão e que nenhuma alternativa responde.
- O que fazer: perguntar ao dono como ele resolve a regra do condomínio, antes de prometer qualquer coisa (hipótese)
- Tipo: dúvida que nenhum concorrente responde

## Mais uma

- Texto: a limpeza anual é o serviço que mais dá lucro, e quase nunca é lembrada (análise: dossiê B3 + dossiê C9)
- Capítulo: decide
```

## Conferir

`<PY> .agents/skills/marketing-persona/scripts/estudo.py conferir --etapa 4`

- Saída 0: siga para a etapa 5 e leia só `referencias/etapas/etapa-5-entrevista.md`.
- Saída 1: com o analista, o passo 3 de "Quem faz esta etapa"; no plano B, corrija cada `PROBLEMA` e rode de novo.

## O que dizer ao dono

Nada ainda. As descobertas aparecem para ele na etapa 9, junto com a persona. Nesta hora, só se ele perguntar: "Estou comparando o que você me contou com o que achei na internet. Daqui a pouco te faço algumas perguntas."

## Nunca

- Chamar o `marketing-analista` só para esta etapa, ou mais de 2 vezes no estudo (a primeira e UMA de correção).
- Escrever as descobertas você mesmo quando o analista devolveu o texto, fora do plano B.
- Apresentar uma conclusão sua como se o dono tivesse dito.
- Inventar discordância: se dono e mercado dizem a mesma coisa, não é descoberta.
- Passar de 3 descobertas, ou pôr mais de uma em "Mais uma".
- Contar as descobertas ao dono antes de fazer as perguntas da etapa 5 (isso induz a resposta dele).
