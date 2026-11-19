---
name: polozi-planejar-trabalho
description: "Pergunta e planeja por marcos antes de construir trabalho grande. Use no 'planeja antes'; pedido pequeno não passa aqui."
---

# Polozi Planejar Trabalho

Antes de construir algo grande, entender o que o dono quer de verdade e combinar o caminho. Serve só para trabalho grande: várias partes, vários arquivos, ou que segue em outra conversa. Pedido pequeno (um texto, uma consulta, um ajuste) a IA faz direto, com 5 linhas de combinado na conversa e sem passar por aqui.

## 1. Leia antes de perguntar

Leia o que o dono já deu: o pedido, os arquivos citados, o `MAPA-DA-EMPRESA-IA.md` e o `LEIA-ME.md` da área onde vai escrever. Não pergunte o que já está escrito.

## 2. Pergunte, uma de cada vez

- Uma pergunta por mensagem. Espere a resposta antes da próxima.
- Primeiro o porquê: para que serve isso e quem vai usar.
- Depois, quando houver caminhos diferentes, dê 2 ou 3 opções, cada uma com o custo (tempo, dinheiro, risco) e a sua recomendação.
- Só pergunte o que muda o que será feito. Se qualquer resposta levaria ao mesmo trabalho, não pergunte.
- Falou de dinheiro, apagar arquivo ou publicar para fora? Isso o dono decide, e você diz o que está em jogo.

## 3. Trabalho grande: grave o desenho e o plano

1. Abra a ficha do trabalho em `operacao/tasks/TASK-N/TASK.md` (N é o próximo número livre; formato em `operacao/tasks/TEMPLATE-TASK.md`). Ela existe porque o trabalho continua em outras conversas.
2. Na ficha, escreva o desenho curto: o que será entregue, o que fica de fora, as decisões tomadas.
3. Divida em marcos. Cada marco tem um resultado que dá pra conferir (arquivo pronto, número batendo, tela abrindo), com critério de pronto (C1, C2...). Nada de passo vago como "melhorar o texto".
4. Registre o objetivo e a ficha como em `manual/fluxo-operacional.md` (`objetivo ... --ficha`).
5. Mostre ao dono o desenho e os marcos em linguagem simples e peça o "ok". Sem o "ok", não construa nada.

## 4. Depois do "ok"

Construa marco por marco, provando cada critério com a evidência da versão final. Ao fechar um marco, atualize `## Checkpoint` com o próximo passo exato, para a próxima conversa retomar sem perguntar de novo. Pausa ou fim de conversa: `$polozi-transferir-trabalho`.

## Limites

- Plano e conversa não autorizam mudar arquivo, sistema ou publicar: isso só vem do "ok" do dono nesta conversa.
- Nada de rotina, equipe de agentes ou teste por marco: o plano é um só, enxuto.
- 1 revisão + 1 correção por etapa, nunca loop; falhou de novo, pare, anote em `operacao/PENDENCIAS.md` e diga ao dono o que precisa.

Ideias adaptadas de obra/superpowers (MIT): perguntar antes de construir, desenho aprovado antes de começar, plano por marcos.
