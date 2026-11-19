# Como trabalhar com a Empresa IA

## Começar

1. Abra a pasta principal da Empresa IA no projeto local.
2. Defina um resultado por conversa, por exemplo: criar a persona, revisar uma proposta ou analisar vendas.
3. Chame explicitamente a Skill adequada quando houver uma capacidade específica.
4. Informe o resultado, o contexto especial, as restrições e como saber que terminou.
5. Revise a saída antes de aprovar ou compartilhar.

Exemplo de pedido:

```text
Quero criar a persona principal da empresa. Use somente informações registradas,
marque dúvidas e considere concluído quando houver um documento para eu validar.
```

As Skills começam por `AGENTS.md`, consultam o Mapa e abrem apenas os documentos necessários. O usuário não precisa repetir caminhos de arquivos.

Um agente só é o padrão: a IA trabalha sozinha, sem gerente e sem avaliador
em pedido comum (criar uma skill, por exemplo, é 1 agente). Subagente só para
parte grande e independente, ou revisão de risco prevista numa Skill, sempre
pelo NOME do agente.

## Pedido grande: peça o plano antes

Trabalho com várias partes ou que segue em outra conversa? Diga "planeja
antes": a IA usa `$polozi-planejar-trabalho`, pergunta uma coisa por vez, grava
o desenho e os marcos e espera o seu "ok" antes de construir. Pedido pequeno
a IA faz direto.

## Quando pedir orientação

Peça ajuda quando não souber qual Skill, modelo, esforço ou conversa usar. A orientação deve consultar somente o capítulo correspondente deste manual. Não é necessário reler todos os capítulos.

## Revisar

Confirme fatos, números, promessas, nomes, prazos e destinos. Conteúdo ainda não aprovado deve permanecer como rascunho. Uma boa entrega informa quais fontes foram usadas, onde foi salva e o que ainda precisa de decisão.

## O `$` e o `@`

Neste manual e no AGENTS.md as habilidades aparecem como `$nome`, que é o
que a IA emite. Na tela do app você também pode escolher digitando `@` e
clicando na lista. É a mesma habilidade.

## Loop de melhoria

Uma regra nova nasce da retrospectiva que você pede ("hora da retrospectiva")
ou de uma pendência anotada em `operacao/PENDENCIAS.md`; fica como linha
`proposta` em `operacao/DECISOES.md`. A IA não propõe regra por conta própria.
Você APROVA falando no chat ("aprova
a D-N"), a IA APLICA com `$polozi-aplicar-regra`. Você nunca edita o
AGENTS.md a mão.
