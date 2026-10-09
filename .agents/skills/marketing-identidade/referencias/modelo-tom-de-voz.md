# Tom de voz - <Nome da empresa>

- Estado: rascunho
- Versão: 1.0 (<AAAA-MM-DD>)
- Fonte: dossiê da empresa, registro <AAAA-MM-DD_HHMMSS>; persona <aprovada em AAAA-MM-DD, ou ainda não feita>; materiais do dono: os da seção 9. Fontes, ou nenhum
- Como ler as marcas: (dossiê 4.2) é o que o dono respondeu na pergunta 4.2; (persona) vem da persona aprovada; (site [1]), (instagram [2]) e (apresentação [3]) vêm do material do próprio dono, e o número aponta a linha da seção 9. Fontes; (pesquisa [5]) é referência pública; (proposta do time) é escolha de redação que o dono pode trocar; (hipótese) é dedução que ainda precisa de confirmação.
- Dados para o sistema: o bloco no fim do documento é lido pela tela Marca; ele é conferido por marca_dados.py.

## 1. Como a marca soa

Posição de 1 a 5: 1 fica no primeiro lado do nome da escala (formal), 5 no segundo (casual).

| Escala | Posição | Por quê |
|---|---|---|
| Formal ou casual | <1 a 5> | <motivo> (dossiê 2.3) |
| Sério ou leve | <1 a 5> | <motivo> (dossiê 10.1) |
| Respeitoso ou irreverente | <1 a 5> | <motivo> (hipótese) |
| Factual ou entusiasmado | <1 a 5> | <motivo> (dossiê 4.2) |

- Palavras de tom (até 5): <palavras> (dossiê 10.1)
- Palavras de anti-tom (como a marca NÃO soa, até 5): <palavras> (hipótese)

## 2. Traços de voz

- Somos <X>, mas não <Y>. Exemplo: "<frase de exemplo>" (proposta do time)
- Somos <X>, mas não <Y>. Exemplo: "<frase de exemplo>" (proposta do time)

## 3. Tom por situação

A voz é a mesma; o tom muda com o momento do cliente.

### Boas-vindas

- Tom: <como soar> (hipótese)
- Exemplo: "<mensagem de exemplo>" (proposta do time)

### Venda

- Tom: <como soar> (hipótese)
- Exemplo: "<mensagem de exemplo>" (proposta do time)

### Reclamação

- Tom: <como soar> (hipótese)
- Exemplo: "<mensagem de exemplo>" (proposta do time)

### Cobrança

- Tom: <como soar> (hipótese)
- Exemplo: "<mensagem de exemplo>" (proposta do time)

## 4. Faça e não faça

| Faça | Não faça |
|---|---|
| <regra verificável> (proposta do time) | <regra verificável> (proposta do time) |

## 5. Vocabulário

- Use: <palavras que o dono usa> (dossiê 4.2)
- Evite: <palavras, jargões e termos banidos> (proposta do time)

## 6. Exemplos certo e errado por canal

### WhatsApp

- Certo: "<mensagem de exemplo>" (proposta do time)
- Errado: "<mensagem de exemplo>" (proposta do time)

### Instagram

- Certo: "<legenda de exemplo>" (proposta do time)
- Errado: "<legenda de exemplo>" (proposta do time)

### E-mail

- Certo: "<mensagem de exemplo>" (proposta do time)
- Errado: "<mensagem de exemplo>" (proposta do time)

## 7. O que nunca prometemos

- <o que o dono disse que a empresa nunca promete> (dossiê 5.2)

## 8. Teste com leitores reais

- Pendente: mostrar 3 mensagens escritas neste tom a 3 clientes e anotar o que eles acharam, até <AAAA-MM-DD>. Resultado: ainda não feito.

## 9. Fontes

- [1] site: <https://endereço> Visto em <AAAA-MM-DD>.

## Anexo

- <AAAA-MM-DD> | Pergunta do time: <pergunta> | Resposta do dono: "<frase literal>"
- [1] "<trecho literal do material, com 4 palavras ou mais, que sustenta uma linha do documento>"

## Dados para o sistema

```marca-dados
{"documento":"voz","versao":1,
 "escalas":[{"eixo":"formal-casual","posicao":3,"origem":"<origem>"},{"eixo":"serio-engracado","posicao":3,"origem":"<origem>"},{"eixo":"respeitoso-irreverente","posicao":3,"origem":"<origem>"},{"eixo":"factual-entusiasmado","posicao":3,"origem":"<origem>"}],
 "palavras":["<palavra>"],"anti":["<palavra>"]}
```
