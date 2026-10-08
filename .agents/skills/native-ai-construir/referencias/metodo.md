# Método: como conversar com o dono antes de construir

Lido pelos passos 2 e 3 da `native-ai-construir`. Vale pra toda coisa nova (caminho 3).

## A espinha

Cinco fases, nesta ordem, sem pular:

| Fase | O que sai | Quem aprova |
|---|---|---|
| 1. Entender | o pedido reescrito pelo resultado ("o que sai e como se sabe que ficou bom") + glossário | ninguém ainda |
| 2. Desenhar | `ficha.json` que passa no `check_ficha.py` | **gate 1: o dono aprova o desenho** |
| 3. Planejar | `plano.md` curto: arquivos, ordem, como provar cada um | **gate 2: o dono aprova o plano** |
| 4. Construir | arquivos dentro dos caminhos do plano | a trava (`trava_lote.py`) |
| 5. Revisar | prova, fidelidade e veredito do avaliador | o avaliador dá o veredito; o CAIO aceita a proposta |

São 2 gates do dono no meio do caminho (desenho e plano), além da assinatura do critério no começo e do aceite no fim. Nada se constrói antes do gate 2.

## Regras da conversa

1. **Uma pergunta por vez.** Cada pergunta vem com o contexto em 1 ou 2 frases, as opções (quando houver) e a sua recomendação com o motivo. Espere a resposta antes da próxima.
2. **Fato é seu, decisão é dele.** O que dá pra descobrir lendo o repo ou os mapas (`referencias/banco.md`, `referencias/repo.md`), você descobre. Pergunte ao dono só o que é escolha dele.
3. **Nomeie antes de decidir.** Se duas coisas têm nome parecido (ex.: "cliente" e "contato"), pergunte qual é qual antes de seguir.
4. **Linguagem do dono.** Sem jargão técnico na fala. Ver a linha "Na fala com o dono" na seção 5 da SKILL.md.
5. **Recomende sempre.** Nunca devolva uma lista de opções sem dizer qual você escolheria e por quê.
6. **Pare quando não sobrar dúvida.** O entendimento acabou quando toda decisão que o desenho precisa está respondida e nada ficou suposto em silêncio. Aí mostre o resumo e pergunte se está certo.

## Apresentar o desenho

Mostre em blocos curtos, um por vez, e confirme cada um: (a) o que o processo entrega e como se sabe que ficou bom; (b) o jeito de fazer, em nome simples, e o motivo em 1 frase; (c) o que fica com humano; (d) quanto deve custar, em mil, e o limite. Só depois peça a aprovação do desenho.

Nome simples de cada forma (o nome técnico fica na ficha, nunca na fala): `prompt` = "um texto pronto que você usa quando precisar"; `workflow` = "uma sequência fixa de passos"; `agente` = "um assistente que decide os passos"; `multiagente` = "uma equipe de assistentes".

## Glossário da empresa

Durante a fase 1, todo termo do negócio que ficar claro vai pro glossário da empresa, na hora em que fica claro:

- Arquivo: `empresa/GLOSSARIO.md`. Criar só quando o 1º termo for fechado.
- 1 linha por termo: termo, o que significa nesta empresa, o que NÃO é (quando há confusão comum).
- Termo que o dono usa diferente do glossário: apontar na hora ("no glossário, X quer dizer A; você está usando como B. Qual vale?").
- Termo vago ou com 2 sentidos: propor 1 nome preciso e perguntar.
- O glossário entra na proposta de mudança junto com o resto; o dono vê no aceite.

## O plano (fase 3)

Curto, em `plano.md` da tarefa:
- lista de arquivos a criar ou mudar (vira a lista de caminhos permitidos do construtor);
- caminhos sempre humanos ficam fora da lista e viram proposta em `trechos/` (`referencias/nunca.md`);
- ordem de construção;
- como cada arquivo vai ser provado (qual parte do `provar.py`, qual item do critério ele cobre);
- limite de gasto da tarefa (no arquivo, em tokens; na fala com o dono, em mil).

## Crédito

A espinha (entender, desenhar, planejar, construir, revisar, com aprovação do desenho antes do plano e do plano antes de construir, e uma pergunta por vez com recomendação) é adaptada de **obra/superpowers**, de Jesse Vincent, licença MIT (Copyright (c) 2025 Jesse Vincent). A ideia de montar o glossário durante a entrevista, apontando na hora o termo que conflita, é adaptada de **mattpocock/skills** (skills `grilling` e `domain-modeling`), de Matt Pocock, licença MIT (Copyright (c) 2026 Matt Pocock). O texto aqui é reescrito em português e adaptado; nenhum trecho foi copiado literal. A licença MIT dos dois permite uso, cópia e modificação, desde que esta nota de copyright e permissão acompanhe cópias substanciais.
