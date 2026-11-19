# Etapa 8: Revisão

**Objetivo:** passar o estudo pela conferência mecânica e por UMA revisão independente do `marketing-revisor`, antes de o dono ver.

Quem escreve não se aprova. Exemplo: a mesma empresa fictícia (Clima Exemplo Ar-Condicionado, Campinas).

## O que ler

Nada novo. Você vai juntar o que já existe e mandar ao revisor.

## Passo 1: conferência mecânica

`<PY> .agents/skills/marketing-persona/scripts/persona_estudo.py conferir`

Ele confere sem opinar: a forma de cada parte, a origem de cada afirmação, cada código do dossiê com resposta, cada relato com a data de uma resposta do dono, cada `[n]` como ficha da pesquisa, as fontes iguais às fichas, frase entre aspas literal, a balança coerente com os pesos, as palavras que não vão para o dono, e o `persona.md` em dia com o bloco. Depois, as marcas linha a linha do documento:

`<PY> .agents/skills/marketing-persona/scripts/dossie_para_persona.py conferir --arquivo empresa/publico/persona.md --estrito`

Saída 1 em qualquer dos dois: corrija o `6-estudo.json`, rode o `montar` (etapa 6) e confira os dois de novo. Só siga com `OK`.

## Passo 2: chamar o revisor UMA vez

Chame o subagente `marketing-revisor` com:

```
{
  "chamado_por": "marketing-persona",
  "documento": "empresa/publico/persona.md",
  "dossie": "contexto/dossie/dossie-completo.md",
  "conferencia_mecanica": "<a saída dos dois comandos do passo 1, com o código de saída 0>",
  "relatos_do_dono": [{"data": "<AAAA-MM-DD>", "pergunta": "<pergunta da etapa 5>", "resposta": "<frase literal>"}],
  "fichas_da_pesquisa": <o conteúdo do empresa/publico/estudo/2-pesquisa.json; sem pesquisa, lista vazia>
}
```

O revisor só lê e não roda comando nem abre a internet: sem esses dados ele devolve BLOCKED.

## Passo 3: ler a PRIMEIRA linha da resposta

- `APPROVED`: grave o arquivo da revisão e siga.
- `BLOCKED`: corrija os achados UMA vez no `6-estudo.json`, rode o `montar` e de novo a conferência mecânica do passo 1 (script, sem custo de modelo) e siga para a etapa 9. NUNCA chame o revisor de novo na mesma montagem (sem loop): é no máximo 1 chamada por montagem (teto de 1 revisão e 1 correção, nunca em loop).
- Se a conferência mecânica ainda reprovar depois da correção, pare e mostre ao dono o que falta.

## O que gravar

`empresa/publico/estudo/8-revisao.md`

```
# Revisão

- Data: <AAAA-MM-DD>
- Conferência mecânica: OK (persona_estudo.py conferir e dossie_para_persona.py conferir --estrito, saída 0)
- Chamadas do revisor: 1
- Veredito do revisor: <APPROVED | BLOCKED>
- O que o revisor apontou: <só se BLOCKED: o achado, em 1 frase simples>
- Correção feita: <só se BLOCKED: o que mudou no arquivo, em 1 frase>
- Conferência depois da correção: <só se BLOCKED: OK>
```

Com `APPROVED`, as três últimas linhas saem.

## Regras de decisão

- Se o revisor aponta afirmação sem origem que a sustente: ache a origem de verdade ou troque por `hipotese` com a razão. Nunca apague a origem só para passar.
- Se aponta leitura que diz mais do que as refs sustentam: corte a parte que sobra, ou troque a origem por `hipotese` com a razão e leve a aposta para `apostas`.
- Se aponta número sem fonte: tire o número, ou diga de onde ele vem (a resposta do dossiê ou o trecho).
- Se aponta alternativa do mapa que nenhuma fonte cita pelo nome ou pelo tipo: tire o ponto do mapa.
- Se aponta balança ou escada que desmentem a leitura (a leitura diz que o medo pesa mais e os pesos dizem o contrário, ou o degrau em foco não é onde a venda se perde): acerte os pesos ou o foco, ou reescreva a leitura.
- Se aponta frase inventada entre aspas: apague as aspas e a frase, ou troque pela frase literal do dossiê ou do Anexo.
- Se aponta algo que você não sabe corrigir sem perguntar ao dono, vire uma aposta (com por que, como confirmar e tempo) e diga isso no resumo da etapa 9.
- Se a correção muda uma linha que veio da análise ou de uma descoberta (por exemplo, uma conclusão que virou `(hipótese)`), faça a mesma mudança em `empresa/publico/estudo/3-analise.md` e `empresa/publico/estudo/4-descobertas.md`, para a análise não ficar diferente do estudo. Depois rode `<PY> .agents/skills/marketing-persona/scripts/estudo.py conferir --etapa 3` e `<PY> .agents/skills/marketing-persona/scripts/estudo.py conferir --etapa 4`, e a conferência mecânica do passo 1. Isso não chama o revisor de novo.

## Exemplo

```exemplo empresa/publico/estudo/8-revisao.md
# Revisão

- Data: 2026-11-18
- Conferência mecânica: OK (persona_estudo.py conferir e dossie_para_persona.py conferir --estrito, saída 0)
- Chamadas do revisor: 1
- Veredito do revisor: BLOCKED
- O que o revisor apontou: a linha da promessa dizia "sem cobrança extra", e nenhuma resposta do dono garante isso
- Correção feita: a promessa ficou "orçamento fechado, hora marcada e casa limpa no fim", que o dossiê e a pesquisa sustentam
- Conferência depois da correção: OK
```

## Conferir

`<PY> .agents/skills/marketing-persona/scripts/estudo.py conferir --etapa 8`

- Saída 0: siga para a etapa 9 e leia só `referencias/etapas/etapa-9-apresentacao.md`.
- Saída 1: corrija o que falta (o estudo precisa passar de novo na conferência mecânica) e rode de novo, sem chamar o revisor outra vez.

## O que dizer ao dono

Se veio BLOCKED, conte na etapa 9, em 1 frase, o que o revisor apontou e como foi corrigido. Exemplo: "Uma revisão independente pediu para eu tirar 'sem cobrança extra' da promessa, porque você não garante isso; tirei."

## Nunca

- Chamar o `marketing-revisor` mais de uma vez na mesma montagem, repetir a revisão depois de BLOCKED ou discutir o veredito com ele em vez de corrigir uma vez.
- Esconder do dono o que o BLOCKED apontou.
- Escrever "Chamadas do revisor: 1" sem ter chamado.
