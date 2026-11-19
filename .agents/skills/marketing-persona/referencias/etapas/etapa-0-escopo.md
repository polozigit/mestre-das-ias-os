# Etapa 0: Escopo

**Objetivo:** combinar com o dono, em 1 frase dele, qual oferta a persona vai servir e se o cliente é pessoa, empresa ou os dois.

O exemplo desta etapa (e de todas as outras) é de uma empresa fictícia, a Clima Exemplo Ar-Condicionado, que instala e faz manutenção de ar-condicionado em casas e apartamentos de Campinas. Copie a FORMA do exemplo, nunca o conteúdo.

## O que ler

1. Rode `<PY> .agents/skills/marketing-persona/scripts/dossie_para_persona.py --bloco oferta --bloco empresa --bloco publico` e leia só estas perguntas na saída:
   - **B3** (o que mais vende e o que dá mais lucro). No dossiê antigo: **2.2**.
   - **B2** (vende para pessoas, empresas ou os dois). No dossiê antigo: **2.3**.
   - **A6** (cidade e estado). No dossiê antigo: **1.5**.
2. Nada mais. Não leia outros roteiros.

## O que gravar

`empresa/publico/estudo/0-escopo.md` (crie a pasta `empresa/publico/estudo/` se não existir).

## Molde

```
# Escopo do estudo da persona

- Data: <AAAA-MM-DD de hoje>
- Confirmação do dono: <AAAA-MM-DD> | "<frase literal do dono, copiada do jeito que ele escreveu>"

## Escopo

- Oferta em foco: <uma oferta só, com as palavras do dono> (dossiê B3)
- Tipo de cliente: <pessoa | empresa | os dois>, <detalhe curto se o dono deu> (dossiê B2)
- Onde atende: <cidade e estado> (dossiê A6)
```

## Regras de decisão

- Se B3 cita mais de uma oferta, proponha ao dono a que mais vende em quantidade (a que "mais sai"), não a que dá mais lucro; se ele responder que quer crescer a de mais lucro, fique com a dele. Escreva só ela em "Oferta em foco". A outra fica para outro estudo.
- Se B3 está sem resposta (`ausente` ou `não sei`), pergunte ao dono: "Qual serviço ou produto você quer vender mais nos próximos meses?" e escreva a oferta com `(relato do dono, AAAA-MM-DD)`, a data de hoje, a mesma da linha "Confirmação do dono".
- Se B2 diz "Pessoas", escreva `pessoa`. Se diz "Empresas", escreva `empresa`. Se diz "Os dois", pergunte ao dono qual dos dois esta persona vai servir primeiro e escreva o que ele escolher, com `(relato do dono, AAAA-MM-DD)`.
- Se A6 está sem resposta, escreva `- Onde atende: (não consta no dossiê)`.
- Se o dono corrige a oferta ou o tipo de cliente, troque a linha pelo que ele disse e a marca vira `(relato do dono, AAAA-MM-DD)`.
- A linha "Confirmação do dono" leva a resposta dele, literal, entre aspas. Sem a resposta dele, a etapa não terminou.
- Se o dono não respondeu, não grave o arquivo e espere a resposta: não escreva a confirmação por ele nem siga para a etapa 1. Se a conversa parar aqui, na volta o `estudo.py estado` manda de novo para a etapa 0; mande a mesma pergunta uma vez e espere.
- Só valem três marcas nesta etapa: `(dossiê CÓDIGO)`, `(relato do dono, AAAA-MM-DD)` e `(não consta no dossiê)`.

## Exemplo

```exemplo empresa/publico/estudo/0-escopo.md
# Escopo do estudo da persona

- Data: 2026-11-18
- Confirmação do dono: 2026-11-18 | "Isso, o foco é a instalação em apartamento."

## Escopo

- Oferta em foco: instalação de ar-condicionado split em apartamento (dossiê B3)
- Tipo de cliente: pessoa, famílias (dossiê B2)
- Onde atende: Campinas, SP (dossiê A6)
```

## Conferir

`<PY> .agents/skills/marketing-persona/scripts/estudo.py conferir --etapa 0`

- Saída 0 (`OK`): siga para a etapa 1 e leia só `referencias/etapas/etapa-1-hipotese-do-dono.md`.
- Saída 1: cada linha `PROBLEMA` diz o que corrigir. Corrija o arquivo e rode de novo. Não siga com problema.

## O que dizer ao dono

Uma mensagem só, antes de gravar: "Vou estudar o seu cliente ideal pensando em <oferta>, para <pessoas | empresas> de <cidade>. É isso mesmo, ou você quer que eu foque em outra coisa?"

## Nunca

- Escolher a oferta sem a confirmação do dono, ou escrever a confirmação com palavras suas.
- Estudar duas ofertas ao mesmo tempo.
- Inventar cidade, oferta ou tipo de cliente que o dossiê e o dono não disseram.
