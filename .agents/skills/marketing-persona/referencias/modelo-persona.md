# Molde do estudo do cliente ideal

Você escreve `empresa/publico/estudo/6-estudo.json` neste molde (etapas 6 e 7). O `empresa/publico/persona.md` sai dele pelo script: `<PY> .agents/skills/marketing-persona/scripts/persona_estudo.py montar`. Nunca escreva o `persona.md` à mão.

O script preenche sozinho, e você NÃO escreve: `versao`, `documento`, `empresa`, `oferta`, `tipo_cliente`, `onde_atende`, `abertura.versao` e `fontes`.

## Peças que se repetem

- **Origem** (uma por afirmação): `{"tipo": "disse", "refs": ["B5a", "relato 2026-11-18"]}` (o que o dono disse: código do dossiê ou relato da etapa 5); `{"tipo": "pesquisa", "refs": ["[3]"]}` (o trecho n da pesquisa); `{"tipo": "leitura", "refs": ["C3", "[5]", "relato 2026-11-18"]}` (a sua conclusão, com TODAS as refs que você juntou); `{"tipo": "hipotese", "razao": "por que você aposta nisso, até 200 letras"}` (sem refs). De 1 a 8 refs.
- **Afirmação**: `{"texto": "...", "origem": {...}}`.
- **Evidência** (lista `evidencias`, o "De onde tirei"): `{"tipo": "disse" ou "pesquisa", "refs": [1 a 4 refs], "texto": "o que foi dito ou mostrado, até 240 letras"}`. Nunca conclusão.
- **Recomendação** (`o_que_fazer`, `o_que_pede`, `como_chegar`, `o_que_dizer`, `como_confirmar`, `acao`...): o que fazer; não leva origem.
- Todo texto: numa linha só, sem parênteses, sem `<` `>`, sem travessão. Idade só como faixa ("de 30 a 45 anos") e só com origem `disse` ou `pesquisa`. Frase entre aspas só se literal.
- Chave que você não sabe preencher com evidência ou leitura: não escreva. Capítulo sem dado: não escreva a chave do capítulo.

## Molde (entre parênteses de ângulo, o que escrever; o número é o teto de letras)

```
{
  "abertura": {
    "arquetipo": {"texto": "<nome do grupo como manchete, 90>", "enfase": "<trecho literal do arquétipo, 40>"},
    "retrato": {"texto": "<o cliente em uma frase: momento, o que quer, o que faz escolher, 280>", "origem": <leitura>}
  },
  "descobertas": {
    "itens": [{"titulo": "<200>", "corpo": "<a explicação da etapa 4, 800>", "por_que_importa": "<400>", "o_que_fazer": "<400>", "origem": <leitura>, "evidencias": [<1 a 6>]}],
    "extra": {"texto": "<a linha Texto da seção Mais uma da etapa 4, só a descoberta, sem E mais uma nem o capítulo, 360>", "capitulo": "<quem | pensa | quer | forcas | decide | onde | sabe | mensagem | nao>", "origem": <origem>}
  },
  "quem": {
    "momento": <afirmação, 280>,
    "perfil": [<até 6 afirmações, 240: a família ou a empresa certa>],
    "pessoa": [<até 6 afirmações, 240: quem decide>],
    "grupo_compra": {"papeis": [{"papel": "<60>", "funcao": "<decide | influencia | usa>", "nivel": <0 a 3>, "texto": "<240>", "origem": <origem>}], "nota": <afirmação, 400>},
    "evidencias": [<até 8>]
  },
  "pensa": {
    "acredita": [<até 5 afirmações, 200>], "teme": [<até 5>], "deseja": [<até 5>],
    "espelho": {"paragrafos": ["<600>"], "origem": <hipotese>, "evidencias": [<1 a 6>]},
    "evidencias": [<até 8>]
  },
  "quer": {
    "pratico": {"enunciado": "<240>", "origem": <origem>, "o_que_pede": "<240>"},
    "ser_visto": {...}, "sentir": {...},
    "evidencias": [<até 8>]
  },
  "forcas": {
    "empurra": [{"texto": "<120>", "peso": <1 a 3>, "ausente": true, "origem": <origem>}],
    "segura": [{"texto": "<120>", "peso": <1 a 3>, "origem": <origem>}],
    "inclinacao": "<empurra | segura | equilibrio>",
    "leitura": <afirmação, 400>,
    "como_virar": [{"titulo": "<60>", "texto": "<300>"}],
    "evidencias": [<até 8>]
  },
  "decide": {
    "caminho": {"pontos": [{"etapa": "<40>", "texto": "<200>", "estado": "<atua | fora | vazamento>", "alerta": "<200, obrigatório no vazamento>", "origem": <origem>}]},
    "posicao": {
      "eixo_x": {"esq": "<30>", "dir": "<30>"}, "eixo_y": {"baixo": "<30>", "cima": "<30>"},
      "pontos": [{"nome": "<40>", "x": <0 a 100>, "y": <0 a 100>, "nosso": true, "origem": <disse, pesquisa ou leitura>}],
      "leitura": <afirmação, 700>, "ressalva": "<300>", "evidencias": [<até 8>]
    },
    "criterios": [{"termo": "<30>", "significado": "<200>", "origem": <origem>}],
    "evidencias": [<até 8>]
  },
  "onde": {
    "zonas": [{"tipo": "<cruza | informa | compara | escuta>", "lugares": [<1 a 5 afirmações, 220>], "como_chegar": "<300>"}],
    "nao_alcancado": "<400>",
    "evidencias": [<até 8>]
  },
  "sabe": {
    "degraus": [{"nivel": <1 a 5>, "sinal": "<160>", "onde": "<140>", "o_que_dizer": "<260>"}],
    "foco": <1 a 5>,
    "leitura": {"paragrafos": ["<400>"], "origem": <leitura>},
    "evidencias": [<até 8>]
  },
  "nao": {"perfis": [{"perfil": "<120>", "porque": "<300>", "origem": <origem>}]},
  "apostas": {
    "itens": [{"aposta": "<200>", "por_que": "<240>", "como_confirmar": "<240>", "tempo": "<1-hora | 1-dia | 1-semana | 2-semanas | 1-mes>"}],
    "roteiro": {"conversas": <3 a 10>, "minutos": <10 a 60>, "com_quem": "<300>", "perguntas": ["<3 a 5, 200>"]}
  },
  "mensagem": {
    "promessa_hoje": <afirmação disse, 280>,
    "promessa_sugerida": {"texto": "<até 20 palavras, 160>", "motivos": ["<até 4, 200>"], "origem": <origem>, "evidencias": [<até 6>]},
    "risco": {"titulo": "<160>", "texto": "<700>", "origem": <origem>, "teste": "<300>"},
    "onde_quando": <afirmação, 300>,
    "provas_tem": [<até 6 afirmações disse, 220>],
    "provas_faltam": [{"texto": "<220>"}],
    "duvidas": [{"duvida": "<160>", "origem_duvida": <disse ou pesquisa>, "resposta": "<400>", "origem_resposta": <nunca hipotese>, "pendencia": "<200>"}],
    "evidencias": [<até 8>]
  },
  "semana": {"acoes": [{"acao": "<240>", "resolve": "<200>"}]}
}
```

`mensagem` e `semana` entram na etapa 7. Listas: `descobertas.itens` de 1 a 3; `grupo_compra.papeis` de 2 a 6, pelo menos um no nível 0 e no máximo 2 por nível; `caminho.pontos` de 3 a 8; `posicao.pontos` de 2 a 7, exatamente um com `"nosso": true`; `onde.zonas` de 1 a 4, sem repetir o tipo; `sabe.degraus` sempre os 5; `nao.perfis` de 1 a 6; `apostas.itens` de 1 a 10; `semana.acoes` de 3 a 5.

## O documento que o script gera

`# Estudo do cliente ideal - <empresa>`, o cabeçalho (estado, versão, fonte, oferta em foco, tipo de cliente, fontes usadas, origem do estudo, como ler as marcas), uma seção por capítulo com conteúdo (Em uma frase, Descobertas, Quem é, Como pensa, O que quer resolver, O que empurra e o que segura, Como decide, Onde está, O quanto já sabe, O que dizer, Quem não é o cliente, O que ainda é aposta, O que fazer esta semana), as Fontes da pesquisa, o Anexo com as respostas do dono e os trechos, e no fim `## Dados para o sistema` com o bloco `persona-dados`. Cada linha de afirmação termina na marca de origem: `(dossiê B5a)`, `(relato do dono, 2026-11-18)`, `(pesquisa [3])`, `(análise: dossiê C3 + pesquisa [5])`, `(hipótese: razão)`.
