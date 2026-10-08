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

Trabalhar sozinho é o padrão: a IA não delega por conta própria. Delegar é
exceção pedida pelo dono ou prevista em instrução do `AGENTS.md`/de uma
Skill — sempre pelo NOME do agente, um por vez.

## Quando pedir orientação

Peça ajuda quando não souber qual Skill, modelo, esforço ou conversa usar. A orientação deve consultar somente o capítulo correspondente deste manual. Não é necessário reler todos os capítulos.

## Revisar

Confirme fatos, números, promessas, nomes, prazos e destinos. Conteúdo ainda não aprovado deve permanecer como rascunho. Uma boa entrega informa quais fontes foram usadas, onde foi salva e o que ainda precisa de decisão.

## O `$` e o `@`

Neste manual e no AGENTS.md as habilidades aparecem como `$nome`, que é o
que a IA emite. Na tela do app você também pode escolher digitando `@` e
clicando na lista — é a mesma habilidade.

## Loop de melhoria

A IA PROPÕE (linha `proposta` em `operacao/DECISOES.md`, vinda de um erro
repetido ou da retrospectiva semanal), você APROVA falando no chat ("aprova
a D-N"), a IA APLICA com `$polozi-aplicar-regra`. Você nunca edita o
AGENTS.md a mão.
