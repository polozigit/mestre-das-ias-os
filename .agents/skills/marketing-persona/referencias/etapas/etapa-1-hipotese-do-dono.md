# Etapa 1: Hipótese do dono

**Objetivo:** escrever o retrato do cliente do jeito que o dono o vê, uma linha por dimensão, só com o que ele respondeu no dossiê.

Isto é a hipótese do dono, não a persona. As etapas seguintes comparam esta hipótese com o mercado. Exemplo: a mesma empresa fictícia (Clima Exemplo Ar-Condicionado, Campinas).

## O que ler

1. Rode `<PY> .agents/skills/marketing-persona/scripts/dossie_para_persona.py --so-dimensoes`. A saída traz só a lista `dimensoes`: cada item tem `dimensao`, a `situacao` (`respondida` ou `lacuna`) e as `perguntas`.
2. Cada item de `perguntas` traz `codigo`, `estado`, `pergunta` (o texto da pergunta) e `respostas` (o que o dono respondeu). Pergunta sem resposta vem com `respostas` vazia e `sem_resposta: true`. Tudo o que esta etapa precisa está aí: não abra o dossiê nem outra saída.
3. Se o dossiê tem o bloco "Pesquisas respondidas antes do dossiê", ignore: ele fala do uso de IA do dono, não do cliente dele.

## De onde sai cada item

A lista `dimensoes` já traz esta tabela pronta, com o estado de cada pergunta. Código do dossiê novo (página do dossiê no app) e, entre parênteses, o equivalente no dossiê antigo (gravado por áudio). A coluna "Se faltar" diz que etapa cobre a lacuna.

| Dimensão | Perguntas do dossiê | Se faltar |
|---|---|---|
| Perfil do cliente | B5a, B2 (2.4, 2.3) | não consta |
| Perfil da empresa cliente (só se vende para empresa) | B5a, B2 (2.4, 2.3) | não consta |
| Quem decide e quem participa da compra | o dossiê não pergunta | pergunta da etapa 5 (só se vende para empresa) |
| Contexto | B5a (2.4) | hipótese |
| O que quer alcançar | B5b, D5 (sem equivalente) | hipótese |
| O que puxa (resultado esperado) | D6, C10 (5.1) | hipótese |
| O que empurra (dores) | B5b (sem equivalente) | pesquisa (etapa 2) |
| Gatilho de compra | o dossiê não pergunta | pergunta da etapa 5 |
| Objeções e ansiedades | C7 (12.3) | pesquisa (etapa 2) |
| Hábito que segura | o dossiê não pergunta | pergunta da etapa 5 |
| Alternativas reais | B8 (4.2) | pesquisa (etapa 2) e pergunta da etapa 5 |
| Critérios de decisão | B8 (4.2) | pesquisa (etapa 2) |
| Jornada e canais | C1, C2, C8, C9 (11.1, 2.6, 11.2, 12.4, 12.5, 2.7, 12.6) | não consta |
| Nível de consciência | sinais em C2 e C7 (11.2, 12.3) | pesquisa (etapa 2) |
| Linguagem do cliente | D6, C7 (12.3) | pesquisa (etapa 2) e pergunta da etapa 5 |
| Quem não é o cliente ideal | C6 (12.1) | pergunta da etapa 5 |

"Sofisticação de mercado" fica fora: o método a marca como incompleta nas fontes.

**Pesquisas respondidas antes do dossiê.** Se o dossiê tem o bloco "Pesquisas respondidas antes do dossiê" (Workshop e pré-evento), ele fala do uso de IA do dono, não do cliente dele: não vira fato da persona, não sustenta marca `(dossiê ...)` e não vai para a busca.

## O que gravar

`empresa/publico/estudo/1-hipotese-do-dono.md`

## Molde

Uma linha para CADA uma das 16 dimensões, nesta ordem, com o rótulo exatamente assim:

```
# Hipótese do dono

- Data: <AAAA-MM-DD>
- O que é: o retrato do cliente segundo o que o dono respondeu no dossiê. Ainda não foi comparado com o mercado.

## Hipótese do dono

- Perfil do cliente: <resposta> (dossiê B5a)
- Perfil da empresa cliente: <resposta, ou "não se aplica, a empresa vende para pessoas"> (dossiê B2)
- Quem decide e quem participa da compra: <resposta> (dossiê CÓDIGO) ou (não consta no dossiê)
- Contexto: <resposta> (dossiê B5a)
- O que quer alcançar: <resposta> (dossiê B5b)
- O que puxa (resultado esperado): <resposta> (dossiê D6)
- O que empurra (dores): <resposta> (dossiê B5b)
- Gatilho de compra: (não consta no dossiê)
- Objeções e ansiedades: <resposta> (dossiê C7)
- Hábito que segura: (não consta no dossiê)
- Alternativas reais: <resposta> (dossiê B8)
- Critérios de decisão: <resposta> (dossiê B8)
- Jornada e canais: <resposta> (dossiê C1); <resposta> (dossiê C9)
- Nível de consciência: <resposta> (dossiê C2); <resposta> (dossiê C7)
- Linguagem do cliente: "<frase literal que está no dossiê>" (dossiê D6)
- Quem não é o cliente ideal: <resposta> (dossiê C6) ou (não consta no dossiê)
```

## Regras de decisão

- Se a `situacao` da dimensão é `lacuna`, escreva só `(não consta no dossiê)` depois do rótulo. Única exceção: a resposta de uma pergunta de OUTRA dimensão da mesma saída diz isso com todas as letras. Aí escreva o que ela diz com o código dela. Exemplo: "Quem decide e quem participa da compra" é sempre `lacuna` (o dossiê não pergunta), mas se B5a diz "quem chama normalmente é o casal", escreva isso com `(dossiê B5a)`, como no exemplo abaixo. Se precisa deduzir ("devem ser os sócios"), não é com todas as letras: `(não consta no dossiê)`.
- Se a pergunta tem resposta, escreva o que a resposta DIZ, com as palavras dela ou bem perto, e termine com `(dossiê CÓDIGO)`. Duas perguntas na mesma linha: `(dossiê C1)` depois de uma parte e `(dossiê C9)` depois da outra.
- Se a resposta é uma opção marcada que não descreve o cliente (por exemplo "Temos uma ideia" em C6), escreva `(não consta no dossiê)`.
- Se a pergunta está `duplicada` (dossiê antigo), não escolha: escreva `(não consta no dossiê)` e anote a dúvida para a etapa 5.
- Se o dossiê é o antigo (códigos com ponto, como 2.4), use o código antigo: o campo `codigos_v1` da dimensão diz qual.
- Se for copiar uma frase do dono entre aspas, copie letra por letra. Frase entre aspas que não está no dossiê reprova.
- Só valem duas marcas nesta etapa: `(dossiê CÓDIGO)` e `(não consta no dossiê)`. Nada de hipótese, pesquisa ou conclusão sua aqui.

## Exemplo

```exemplo empresa/publico/estudo/1-hipotese-do-dono.md
# Hipótese do dono

- Data: 2026-11-18
- O que é: o retrato do cliente segundo o que o dono respondeu no dossiê. Ainda não foi comparado com o mercado.

## Hipótese do dono

- Perfil do cliente: família que acabou de comprar o aparelho ou mudou para um apartamento novo (dossiê B5a); vende para pessoas (dossiê B2)
- Perfil da empresa cliente: não se aplica, a empresa vende para pessoas (dossiê B2)
- Quem decide e quem participa da compra: quem chama normalmente é o casal (dossiê B5a)
- Contexto: quer instalar antes do calor (dossiê B5a)
- O que quer alcançar: instalar o ar sem quebrar a parede errada, sem sujeira e sem faltar no trabalho esperando técnico (dossiê B5b)
- O que puxa (resultado esperado): a casa limpa no fim da instalação (dossiê D6)
- O que empurra (dores): medo de sujeira, de parede quebrada no lugar errado e de perder o dia esperando (dossiê B5b)
- Gatilho de compra: (não consta no dossiê)
- Objeções e ansiedades: se o preço já inclui o material, se precisa quebrar a parede, e acham caro perto do técnico do bairro (dossiê C7)
- Hábito que segura: (não consta no dossiê)
- Alternativas reais: técnicos autônomos dos grupos do bairro e lojas que vendem o aparelho com instalação junto (dossiê B8)
- Critérios de decisão: horário certo e casa limpa, segundo o dono (dossiê B8)
- Jornada e canais: chega mais por indicação e também pela busca do Google e pelo mapa (dossiê C1); depois da instalação recebe foto do serviço pronto (dossiê C9)
- Nível de consciência: a empresa só anuncia o serviço, sem ensinar nada antes (dossiê C2); o cliente chega perguntando preço e material (dossiê C7)
- Linguagem do cliente: "foi a primeira instalação em que ninguém precisou passar pano depois" (dossiê D6)
- Quem não é o cliente ideal: (não consta no dossiê)
```

## Conferir

`<PY> .agents/skills/marketing-persona/scripts/estudo.py conferir --etapa 1`

- Saída 0: siga para a etapa 2 e leia só `referencias/etapas/etapa-2-pesquisa.md`.
- Saída 1: corrija cada `PROBLEMA` (código que não existe, pergunta sem resposta, dimensão que falta, marca que não vale aqui) e rode de novo.

## O que dizer ao dono

Nada nesta etapa. É trabalho de mesa: não interrompa o dono.

## Nunca

- Completar uma dimensão com o que "costuma ser" no setor. Sem resposta, é `(não consta no dossiê)`.
- Pular uma das 16 linhas.
- Usar as pesquisas respondidas antes do dossiê como fato sobre o cliente.
