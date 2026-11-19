# Etapa 6: Montagem do estudo

**Objetivo:** escrever o estudo do cliente ideal em `empresa/publico/estudo/6-estudo.json`, com a SUA leitura em cada parte, e gerar `empresa/publico/persona.md` pelo script.

Exemplo: a mesma empresa fictícia (Clima Exemplo Ar-Condicionado, Campinas). Nesta etapa o estudo fica sem as chaves `mensagem` e `semana`: quem as escreve é a etapa 7.

Você escreve só o JSON. O documento legível e a seção "Dados para o sistema" saem do script, do mesmo conteúdo: nunca escreva nem edite o `persona.md` à mão.

## O que ler

1. O molde: `.agents/skills/marketing-persona/referencias/modelo-persona.md` (a forma de cada chave, os tetos e o que o script preenche). Copie e preencha; não invente chave.
2. `empresa/publico/estudo/3-analise.md`, `4-descobertas.md` e `5-entrevista.md`. Os outros arquivos do estudo o script lê sozinho.
3. Se `empresa/publico/persona.md` já existe e está aprovada: pergunte ao dono se é para atualizar (mostre o que mudaria) ou só consultar. Atualizar sobe a versão: rode o `montar` com `--versao` e o número novo (de 1.0 para 1.1).

## O que gravar

1. `empresa/publico/estudo/6-estudo.json`, no molde.
2. Gere o documento: `<PY> .agents/skills/marketing-persona/scripts/persona_estudo.py montar`. Com `PROBLEMA`, ele não grava nada: corrija o JSON e rode de novo.
3. Registre no Mapa: `<PY> .agents/skills/marketing-persona/scripts/mapa_estado.py --papel publico.persona --estado rascunho`

## O que o script preenche (não escreva)

`versao`, `documento`, `empresa`, `oferta`, `tipo_cliente`, `onde_atende`, `abertura.versao` e `fontes`. Eles vêm do dossiê, do `0-escopo.md`, do `2-pesquisa.json` e do `5-entrevista.md`, letra por letra. Se você escrever, o script troca.

## Como escrever cada afirmação

Toda afirmação sobre o cliente é `{"texto": "...", "origem": {...}}`. A origem é UMA, e tem 4 tipos. Converta a marca da etapa 3 assim:

| Na etapa 3 (ou na resposta da etapa 5) | Origem no JSON |
|---|---|
| `(dossiê B5a)` | `{"tipo": "disse", "refs": ["B5a"]}` |
| `(relato do dono, 2026-11-18)` | `{"tipo": "disse", "refs": ["relato 2026-11-18"]}` |
| `(dossiê C11)` e a resposta da etapa 5 juntos | `{"tipo": "disse", "refs": ["relato 2026-11-18", "C11"]}` |
| `(pesquisa [3])` | `{"tipo": "pesquisa", "refs": ["[3]"]}` |
| `(dossiê B8)` e `(pesquisa [3])` na mesma frase | `{"tipo": "leitura", "refs": ["B8", "[3]"]}` |
| `(análise: dossiê C3 + pesquisa [5])` | `{"tipo": "leitura", "refs": ["C3", "[5]"]}` |
| `(hipótese: razão)` | `{"tipo": "hipotese", "razao": "a mesma razão, em uma linha"}` |
| `(não consta no dossiê)` | não escreva a linha |

"De onde tirei" (`evidencias`) é o que o dono disse ou o que a página mostra, resumido: tipo `disse` ou `pesquisa`, de 1 a 4 refs, nunca conclusão.

## De onde sai cada parte

| Chave | Sai de |
|---|---|
| `abertura.arquetipo` | a "Persona principal" da etapa 3, num nome de grupo (nunca nome de gente); `enfase` é um trecho literal dele |
| `abertura.retrato` | a sua leitura do cliente em uma frase: o momento, o que ele quer e o que faz escolher; `leitura` com 3 ou mais refs |
| `descobertas.itens` | as descobertas da etapa 4, na mesma ordem: `titulo` é a frase do título, `corpo` a explicação, `por_que_importa`, `o_que_fazer`; `evidencias` são "O que o dono disse" e "O que o mercado mostra" |
| `descobertas.extra` | a seção "Mais uma" da etapa 4 (só se ela existe), com `capitulo`; `texto` é só a descoberta, sem "E mais uma" nem o nome do capítulo, que o documento e a tela já escrevem |
| `quem.momento` | "O que dispara" e a época (B7), como leitura |
| `quem.perfil` | a família ou a empresa certa: B5a, B7 e o grupo da persona principal; vende para empresa, o porte e o setor |
| `quem.pessoa` | quem decide, a rotina dele e o que ele já viveu; idade só como faixa e só com `disse` ou `pesquisa` |
| `quem.grupo_compra` | as linhas "Quem pesa" da etapa 3, com os papéis que a etapa 5 trouxe; o papel que o dossiê não cita entra como `hipotese` pelo tipo de negócio, com a razão |
| leituras da venda | as linhas "O que isso muda na venda" e "O que o dono não está vendo" dos blocos 2, 3 e 7 da etapa 3 entram no capítulo do bloco como afirmação `leitura` ou `hipotese`: as do bloco 2 em `quem.pessoa` ou na `nota` do `grupo_compra`; as do bloco 3 no `alerta` do ponto do caminho onde a venda se perde; as do bloco 7 como lugar da zona de que falam |
| `pensa` | o bloco 6 da etapa 3; `espelho` só se o teste do espelho deu "bate demais" |
| `quer` | os três trabalhos do bloco 3, cada um com `o_que_pede` |
| `forcas` | o bloco 4: `empurra` = Empurra, Puxa e Puxa ausente (este com `"ausente": true`); `segura` = Medo e Costume; `leitura` = a frase da inclinação |
| `decide.caminho` | os "Ponto do caminho" da etapa 3, na ordem, com o alerta de cada vazamento |
| `decide.posicao` | o mapa do bloco 1: eixos, um ponto por alternativa, `"nosso": true` na empresa, a leitura do mapa |
| `decide.criterios` | as palavras vagas do bloco 3: `termo` com inicial maiúscula e `significado` |
| `onde` | o bloco 7: uma zona por rótulo (`cruza`, `informa`, `compara`, `escuta`), cada lugar com origem; onde o dossiê e a pesquisa não mostram, o lugar é `hipotese` pelo tipo de negócio, com a razão |
| `sabe` | a escada do bloco 5: os 5 degraus, `foco` e, em `leitura`, o porquê do foco |
| `nao` | "Quem não é cliente" da etapa 3 e a resposta da etapa 5 |
| `apostas` | molde abaixo |

## Molde das apostas

Cada `(hipótese: razão)` que sobrou na etapa 3, e cada "O que fazer" da etapa 4 que ficou em `(hipótese)` sem resposta na etapa 5, vira uma aposta:

```
{"aposta": "<a frase da hipótese, afirmada>", "por_que": "<a razão>", "como_confirmar": "<uma checagem simples>", "tempo": "<1-hora | 1-dia | 1-semana | 2-semanas | 1-mes>"}
```

- `como_confirmar`: um número que o dono já tem (contar pedidos, olhar o mapa) ou uma pergunta da conversa com cliente.
- `tempo`: `1-hora` se é olhar um número que ele já tem; `1-dia` se é juntar o número; `1-semana` se depende das conversas; `2-semanas` se depende de novos pedidos chegarem; `1-mes` se precisa de volume.
- Até 10, as que mudam mais a venda primeiro.
- `roteiro`: as perguntas que não couberam nas 5 da etapa 5, mais as que confirmam apostas em conversa. De 3 a 5 perguntas abertas, sobre o que JÁ aconteceu ("O que estava acontecendo quando você decidiu?"), nunca "você compraria se...". `conversas` 5, `minutos` 15, `com_quem` diz que clientes ouvir. O estudo não ouve cliente: quem conversa é o dono, depois.

## Regras de decisão

- **Leitura antes de evidência.** O `texto` de cada parte é o que VOCÊ concluiu. Se ele só repete uma resposta do dono, reescreva: o que essa resposta quer dizer ao lado de outra resposta ou de um trecho? Escreva isso como `leitura`, e a resposta vai em `evidencias`. Copiar a resposta como texto principal é proibido.
- Todo capítulo tem pelo menos uma afirmação `leitura` ou `hipotese`; o script recusa capítulo só com `disse` e `pesquisa`. O `retrato` é sempre `leitura` ou `hipotese`; descoberta é sempre `leitura`.
- **Capítulos de fatos** (`quem`, `decide`, `onde`): no máximo metade das afirmações pode ser `disse`; o resto é `leitura` ou `hipotese` com a razão, e o script recusa o capítulo que passa disso. Para cada fato, antes de escrever, responda: o que isso significa para a venda? o que o dono não está vendo? A resposta é o `texto`; o fato vai em `evidencias`. Exemplo: em vez de só "Mora em apartamento novo", escreva "Mora em prédio com regra para a parte de fora do aparelho: é uma dúvida que trava a decisão e que nenhum concorrente responde", como `leitura` com B5a e a ficha do fórum.
- **Onde o dossiê não diz** (zonas de `onde`, papéis do `grupo_compra`): não deixe ralo nem genérico. Afirme uma hipótese pelo tipo de negócio, com a razão dizendo de que tipo de compra você partiu e o que confirmaria ("o dossiê não diz quem mais participa; é a primeira pergunta a fazer a quem já comprou").
- Se a etapa 5 confirmou uma hipótese da etapa 3, a origem passa a ter o `relato AAAA-MM-DD` e a hipótese sai das apostas. Se a etapa 5 respondeu um "O que fazer" de descoberta, troque-o pela ação que a resposta permite, e ponha o relato nas refs e nas evidências da descoberta.
- Se uma alternativa do mapa não tem `disse` nem `pesquisa`, ela não entra. Se a empresa não tem `"nosso": true`, o script recusa.
- `forcas.inclinacao` igual à da etapa 3; o script refaz a conta dos pesos (o `ausente` não conta).
- Sem pesquisa (`busca_disponivel: false`): nenhum `[n]`, nenhuma origem nem evidência `pesquisa`.
- Vende para empresa: `perfil` descreve a empresa cliente, `grupo_compra` diz quem pede, quem aprova e quem paga.
- Capítulo sem dado nenhum: não escreva a chave. Nunca preencha para não ficar vazio.
- Nos textos: sem parênteses, sem `<` `>`, sem travessão; número só com fonte; idade só como faixa ("de 30 a 45 anos") e só com `disse` ou `pesquisa`; frase entre aspas só se está, letra por letra, no dossiê, numa resposta do dono ou no trecho de uma ficha citada no mesmo item.
- Escreva para o dono ler: "você" é o dono; nunca escreva nome de sistema, de método ou de autor.

## Exemplo

```exemplo empresa/publico/estudo/6-estudo.json
{
  "abertura": {
    "arquetipo": {"texto": "A família do apartamento novo que não quer surpresa no preço nem na parede.", "enfase": "não quer surpresa"},
    "retrato": {"texto": "Casal que acabou de comprar o aparelho ou de pegar as chaves, quer instalar antes do calor e escolhe quem diz o preço inteiro antes, marca a hora e deixa tudo limpo.", "origem": {"tipo": "leitura", "refs": ["B5a", "C7", "[5]", "[7]", "relato 2026-11-18"]}}
  },
  "descobertas": {
    "itens": [
      {"titulo": "O cliente do Google não quer o mais barato: quer saber se o preço vai mudar.", "corpo": "Você diz que quem chega pelo Google só quer saber o preço e some. Mas as dúvidas públicas sobre instalação são sobre o que o preço básico cobre, e as reclamações são de material cobrado fora do orçamento. E quando você explica que o material está incluído, muitos fecham. O que parece caça ao menor preço é medo de o preço crescer depois.", "por_que_importa": "Se a resposta ao primeiro contato é só um número, ele compara com o técnico do bairro, que sempre parece mais barato, e some.", "o_que_fazer": "Mandar orçamento fechado, dizendo o que está incluído, antes de falar o valor.", "origem": {"tipo": "leitura", "refs": ["C3", "[5]", "[7]", "relato 2026-11-18"]}, "evidencias": [{"tipo": "disse", "refs": ["C3"], "texto": "Quem chega pelo Google só quer saber o preço e some."}, {"tipo": "disse", "refs": ["relato 2026-11-18"], "texto": "Depois de dizer que está caro, o cliente pergunta se o material está no preço; quando ouve que está, muitos fecham."}, {"tipo": "pesquisa", "refs": ["[5]"], "texto": "Num fórum, a dúvida é quantos metros de tubo a instalação básica cobre."}, {"tipo": "pesquisa", "refs": ["[7]"], "texto": "Reclamação de material cobrado fora do orçamento."}]},
      {"titulo": "Você ganha por hora marcada e casa limpa, mas só quem já te conhece sabe disso.", "corpo": "O cliente fica com você porque você marca horário certo e deixa tudo limpo. As reclamações públicas contra quem instala são exatamente de pó de cimento e de técnico que chega horas depois. Mesmo assim, o que a empresa mostra antes da venda é só o serviço.", "por_que_importa": "O seu maior diferencial só aparece depois da compra. Para quem chega pelo Google, você é mais um instalador.", "o_que_fazer": "Abrir o primeiro contato com hora marcada e casa limpa, com a foto do serviço pronto.", "origem": {"tipo": "leitura", "refs": ["B8", "C2", "[3]", "[4]"]}, "evidencias": [{"tipo": "disse", "refs": ["B8"], "texto": "O cliente fica porque o horário é certo e tudo fica limpo."}, {"tipo": "disse", "refs": ["C2"], "texto": "Antes de vender, a empresa só anuncia o serviço."}, {"tipo": "pesquisa", "refs": ["[3]"], "texto": "Avaliação de cliente contando furo no lugar errado e pó de cimento no sofá."}, {"tipo": "pesquisa", "refs": ["[4]"], "texto": "Avaliação de cliente que esperou a manhã toda pelo técnico."}]},
      {"titulo": "Quem mora em apartamento pergunta da regra do condomínio, e nenhuma alternativa responde.", "corpo": "O seu melhor cliente acabou de mudar para um apartamento novo. Em fórum, a dúvida de onde a parte de fora do aparelho pode ficar aparece; na página da loja e no anúncio do técnico do bairro, não. Você já pede a regra do condomínio antes da visita.", "por_que_importa": "É uma dúvida que trava a decisão e que só você responde. Hoje ela fica escondida no seu processo.", "o_que_fazer": "Dizer logo no primeiro contato que a regra do condomínio é pedida antes da visita.", "origem": {"tipo": "leitura", "refs": ["B5a", "[6]", "[1]", "[2]", "relato 2026-11-18"]}, "evidencias": [{"tipo": "disse", "refs": ["B5a"], "texto": "O melhor cliente mudou para um apartamento novo."}, {"tipo": "disse", "refs": ["relato 2026-11-18"], "texto": "A regra do condomínio é pedida antes da visita, e a instalação segue o que o síndico deixa."}, {"tipo": "pesquisa", "refs": ["[6]"], "texto": "Dúvida em fórum sobre a condensadora na fachada do prédio."}, {"tipo": "pesquisa", "refs": ["[1]", "[2]"], "texto": "A página da loja e o anúncio do técnico falam de preço e rapidez, não de condomínio."}]}
    ],
    "extra": {"texto": "A limpeza anual é o serviço que mais dá lucro, e quase nunca é lembrada.", "capitulo": "decide", "origem": {"tipo": "leitura", "refs": ["B3", "C9"]}}
  },
  "quem": {
    "momento": {"texto": "Está entre comprar o aparelho e a primeira onda de calor: tem pressa, mas ainda tem tempo de escolher.", "origem": {"tipo": "leitura", "refs": ["B5a", "B7", "relato 2026-11-18"]}},
    "perfil": [
      {"texto": "Família que acabou de comprar o aparelho ou mudou para um apartamento novo.", "origem": {"tipo": "disse", "refs": ["B5a"]}},
      {"texto": "Mora em Campinas, em prédio com regra para a parte de fora do aparelho.", "origem": {"tipo": "leitura", "refs": ["A6", "B5a", "[6]"]}},
      {"texto": "Procura de outubro a março; em junho e julho quase ninguém chama.", "origem": {"tipo": "disse", "refs": ["B7"]}}
    ],
    "pessoa": [
      {"texto": "Quem decide é o casal; normalmente é ele que chama.", "origem": {"tipo": "disse", "refs": ["B5a"]}},
      {"texto": "Trabalha fora no horário comercial e não pode perder o dia esperando.", "origem": {"tipo": "leitura", "refs": ["B5b", "[4]"]}},
      {"texto": "Já ouviu história de instalação que deixou a casa suja ou a parede furada errado.", "origem": {"tipo": "hipotese", "razao": "As reclamações públicas são desse tipo; falta ouvir de um cliente se ele chegou com esse medo."}}
    ],
    "grupo_compra": {"papeis": [{"papel": "O casal", "funcao": "decide", "nivel": 0, "texto": "Decide junto e paga.", "origem": {"tipo": "disse", "refs": ["B5a"]}}, {"papel": "Quem indicou", "funcao": "influencia", "nivel": 1, "texto": "Um conhecido que já instalou com você.", "origem": {"tipo": "disse", "refs": ["C1"]}}, {"papel": "O síndico", "funcao": "influencia", "nivel": 2, "texto": "A regra do condomínio diz onde o aparelho pode ficar.", "origem": {"tipo": "leitura", "refs": ["[6]", "relato 2026-11-18"]}}, {"papel": "O grupo do prédio", "funcao": "influencia", "nivel": 3, "texto": "Onde aparece o técnico mais barato.", "origem": {"tipo": "disse", "refs": ["relato 2026-11-18"]}}], "nota": {"texto": "Quem indica pesa mais do que parece: o cliente que chega por indicação já chega quase decidido.", "origem": {"tipo": "leitura", "refs": ["C1"]}}},
    "evidencias": [
      {"tipo": "disse", "refs": ["B5a"], "texto": "Família que comprou o aparelho ou mudou de apartamento; quem chama é o casal; quer tudo limpo."},
      {"tipo": "disse", "refs": ["B7"], "texto": "Outubro a março é correria; junho e julho quase param."},
      {"tipo": "disse", "refs": ["C1"], "texto": "Cliente novo chega por indicação, que é o principal, e pela busca do Google e pelo mapa."}
    ]
  },
  "pensa": {
    "acredita": [
      {"texto": "Que todo instalador cobra um preço e depois aparece material a mais.", "origem": {"tipo": "leitura", "refs": ["C7", "[1]", "[7]"]}},
      {"texto": "Que o técnico do grupo do prédio resolve igual e sai mais barato.", "origem": {"tipo": "disse", "refs": ["relato 2026-11-18"]}}
    ],
    "teme": [
      {"texto": "Quebrar a parede no lugar errado.", "origem": {"tipo": "disse", "refs": ["B5b"]}},
      {"texto": "Pó e sujeira pela casa depois da obra.", "origem": {"tipo": "pesquisa", "refs": ["[3]"]}},
      {"texto": "Cobrança extra que não estava no orçamento.", "origem": {"tipo": "pesquisa", "refs": ["[7]"]}}
    ],
    "deseja": [
      {"texto": "Ar funcionando antes do calor, sem faltar no trabalho.", "origem": {"tipo": "disse", "refs": ["B5b"]}},
      {"texto": "Chegar ao fim do dia com a casa como estava.", "origem": {"tipo": "disse", "refs": ["B5a", "D6"]}}
    ],
    "espelho": {"paragrafos": ["Hora marcada é o que você mais preza: é como você quer ser lembrado. É natural supor que é também o que o cliente mais preza.", "A pesquisa confirma a reclamação de espera, mas o que mais aparece nas dúvidas e nas queixas é o preço que muda depois. Pode ser que, para o cliente, o preço fechado venha antes da hora marcada."], "origem": {"tipo": "hipotese", "razao": "Nenhum cliente foi ouvido; a ordem do que pesa mais é dedução das suas respostas e de poucos trechos públicos."}, "evidencias": [{"tipo": "disse", "refs": ["D5", "D4"], "texto": "Quer ser lembrado como quem cumpre o horário; sempre fala em hora marcada."}, {"tipo": "pesquisa", "refs": ["[4]"], "texto": "Uma reclamação de espera."}, {"tipo": "pesquisa", "refs": ["[5]", "[7]"], "texto": "Uma dúvida e uma reclamação sobre o que o preço inclui."}]},
    "evidencias": [
      {"tipo": "disse", "refs": ["B5b"], "texto": "Instalar sem quebrar a parede errada, sem sujeira e sem faltar no trabalho."},
      {"tipo": "disse", "refs": ["C7"], "texto": "Perguntam se o preço já inclui o material e se precisa quebrar a parede."}
    ]
  },
  "quer": {
    "pratico": {"enunciado": "Ter o ar funcionando antes do calor, com a parede certa e sem surpresa no preço.", "origem": {"tipo": "leitura", "refs": ["B5b", "C7"]}, "o_que_pede": "Dizer antes da visita o que entra no preço e o que pode mudar."},
    "ser_visto": {"enunciado": "Como quem resolveu bem a casa nova, sem cair no barato que sai caro.", "origem": {"tipo": "hipotese", "razao": "A escolha entre você e o técnico do grupo do prédio acontece à vista dos vizinhos."}, "o_que_pede": "Dar a ele um orçamento claro, que ele possa mostrar ao parceiro e comparar."},
    "sentir": {"enunciado": "Tranquilidade de que ninguém vai sujar a casa nem cobrar a mais.", "origem": {"tipo": "leitura", "refs": ["D6", "[3]", "[7]"]}, "o_que_pede": "Tom calmo e concreto, com a foto do serviço pronto."},
    "evidencias": [
      {"tipo": "disse", "refs": ["D6"], "texto": "Mensagens de clientes agradecendo porque a casa ficou limpa."}
    ]
  },
  "forcas": {
    "empurra": [
      {"texto": "Calor chegando", "peso": 3, "origem": {"tipo": "disse", "refs": ["B7"]}},
      {"texto": "Aparelho novo parado na caixa", "peso": 2, "origem": {"tipo": "disse", "refs": ["B5a"]}},
      {"texto": "Histórias de instalação suja", "peso": 1, "origem": {"tipo": "pesquisa", "refs": ["[3]"]}},
      {"texto": "Saber o preço inteiro antes de decidir", "peso": 3, "ausente": true, "origem": {"tipo": "leitura", "refs": ["C3", "[5]", "relato 2026-11-18"]}}
    ],
    "segura": [
      {"texto": "Não saber se o preço vai mudar", "peso": 3, "origem": {"tipo": "disse", "refs": ["C7"]}},
      {"texto": "Técnico do grupo do prédio mais barato", "peso": 2, "origem": {"tipo": "disse", "refs": ["relato 2026-11-18"]}},
      {"texto": "Medo de quebrar a parede errada", "peso": 2, "origem": {"tipo": "disse", "refs": ["B5b"]}}
    ],
    "inclinacao": "segura",
    "leitura": {"texto": "Para quem chega pelo Google, a balança pende para o lado que segura: o maior peso é a dúvida do preço, e a resposta que ele recebe é só um número.", "origem": {"tipo": "leitura", "refs": ["C3", "C7"]}},
    "como_virar": [
      {"titulo": "Tirar peso da dúvida", "texto": "Mandar o orçamento fechado, com o material incluído, antes do valor."},
      {"titulo": "Pôr o peso que falta", "texto": "Mostrar a foto do serviço pronto e a garantia de um ano no primeiro contato."},
      {"titulo": "Responder a parede", "texto": "Dizer que a visita vem antes justamente para não furar no lugar errado."}
    ],
    "evidencias": [
      {"tipo": "disse", "refs": ["C10"], "texto": "Garantia de um ano por escrito e janela de duas horas."},
      {"tipo": "disse", "refs": ["C11"], "texto": "Nunca promete instalar no mesmo dia, porque depende de ver o local."}
    ]
  },
  "decide": {
    "caminho": {"pontos": [{"etapa": "Primeiro incômodo", "texto": "Compra o aparelho ou pega as chaves do apartamento.", "estado": "fora", "origem": {"tipo": "disse", "refs": ["B5a"]}}, {"etapa": "O fato que faz agir", "texto": "A primeira onda de calor.", "estado": "fora", "origem": {"tipo": "disse", "refs": ["relato 2026-11-18"]}}, {"etapa": "Busca", "texto": "Pergunta a um conhecido ou procura no Google e no mapa.", "estado": "atua", "origem": {"tipo": "disse", "refs": ["C1"]}}, {"etapa": "Orçamento", "texto": "Pede o preço e pergunta do material.", "estado": "vazamento", "alerta": "Quem chega pelo Google pede preço e some, e a empresa volta a falar uma vez só.", "origem": {"tipo": "leitura", "refs": ["C3", "C7", "C8"]}}, {"etapa": "Visita", "texto": "Você vê o local antes de instalar.", "estado": "atua", "origem": {"tipo": "disse", "refs": ["C11"]}}, {"etapa": "Instalação", "texto": "Hora marcada, casa limpa e foto do serviço pronto.", "estado": "atua", "origem": {"tipo": "disse", "refs": ["C9", "C10"]}}, {"etapa": "Limpeza anual", "texto": "Um ano depois, o cliente devia voltar para a limpeza.", "estado": "vazamento", "alerta": "Quase nunca dá tempo de lembrar, e é o serviço que mais dá lucro.", "origem": {"tipo": "leitura", "refs": ["B3", "C9"]}}]},
    "posicao": {"eixo_x": {"esq": "Menor preço", "dir": "Preço fechado"}, "eixo_y": {"baixo": "Quando der", "cima": "Hora marcada"}, "pontos": [{"nome": "Clima Exemplo", "x": 80, "y": 85, "nosso": true, "origem": {"tipo": "disse", "refs": ["B8", "C10", "relato 2026-11-18"]}}, {"nome": "Técnico do bairro", "x": 15, "y": 30, "origem": {"tipo": "pesquisa", "refs": ["[2]", "[4]"]}}, {"nome": "Loja com instalação básica", "x": 35, "y": 45, "origem": {"tipo": "pesquisa", "refs": ["[1]"]}}], "leitura": {"texto": "O técnico do bairro disputa preço e rapidez; a loja inclui só a instalação básica e cobra o material à parte. O canto de preço fechado com hora marcada aparece só com você. E a alternativa mais comum continua sendo adiar e passar o calor sem ar.", "origem": {"tipo": "leitura", "refs": ["B8", "[1]", "[2]", "C10"]}}, "ressalva": "Posição pelos trechos coletados, não pelo serviço inteiro de cada concorrente.", "evidencias": [{"tipo": "disse", "refs": ["B8"], "texto": "Concorre com técnicos autônomos dos grupos do bairro e com lojas que vendem com instalação."}, {"tipo": "pesquisa", "refs": ["[1]"], "texto": "Loja: instalação básica de brinde, material adicional à parte."}, {"tipo": "pesquisa", "refs": ["[2]"], "texto": "Técnico do bairro: instala hoje mesmo, menor preço da região."}]},
    "criterios": [
      {"termo": "Caro", "significado": "Não saber o que está incluído no preço.", "origem": {"tipo": "leitura", "refs": ["C7", "[5]", "relato 2026-11-18"]}},
      {"termo": "Confiável", "significado": "Chega na hora marcada e não deixa sujeira.", "origem": {"tipo": "leitura", "refs": ["B8", "[3]", "[4]"]}},
      {"termo": "Rápido", "significado": "Instalar antes do calor, não no mesmo dia.", "origem": {"tipo": "hipotese", "razao": "Você nunca promete o mesmo dia e mesmo assim o cliente fica; falta confirmar se rápido quer dizer antes do calor."}}
    ],
    "evidencias": [
      {"tipo": "disse", "refs": ["C8"], "texto": "Volta a falar com o cliente quando lembra: uma tentativa antes de desistir."},
      {"tipo": "disse", "refs": ["B3"], "texto": "A limpeza anual de quem já instalou é o que dá mais lucro."}
    ]
  },
  "onde": {
    "zonas": [
      {"tipo": "cruza", "lugares": [{"texto": "Clientes que já instalaram e indicam conhecidos. É o canal principal.", "origem": {"tipo": "disse", "refs": ["C1"]}}, {"texto": "Quem instalou há um ano e não foi lembrado da limpeza: às vezes volta sozinho.", "origem": {"tipo": "leitura", "refs": ["B6", "C9"]}}], "como_chegar": "Pedir a indicação na hora de mandar a foto do serviço pronto, com uma mensagem pronta para o cliente encaminhar."},
      {"tipo": "informa", "lugares": [{"texto": "A busca do Google e o mapa.", "origem": {"tipo": "disse", "refs": ["C1"]}}, {"texto": "Páginas de avaliação de instaladores da cidade.", "origem": {"tipo": "pesquisa", "refs": ["[3]", "[4]"]}}], "como_chegar": "Pedir a quem instalou uma avaliação no mapa contando a hora marcada e a casa limpa."},
      {"tipo": "compara", "lugares": [{"texto": "Fóruns com dúvidas sobre o que a instalação inclui.", "origem": {"tipo": "pesquisa", "refs": ["[5]", "[6]"]}}, {"texto": "A loja que vende o aparelho com instalação básica.", "origem": {"tipo": "pesquisa", "refs": ["[1]"]}}], "como_chegar": "Publicar o que o seu orçamento inclui, com a resposta sobre o condomínio, no perfil do mapa."},
      {"tipo": "escuta", "lugares": [{"texto": "O conhecido que indicou.", "origem": {"tipo": "disse", "refs": ["C1"]}}, {"texto": "O grupo do prédio.", "origem": {"tipo": "disse", "refs": ["relato 2026-11-18"]}}, {"texto": "O síndico.", "origem": {"tipo": "hipotese", "razao": "A regra do condomínio passa por ele; o dossiê não diz se ele recomenda instalador."}}], "como_chegar": "Oferecer ao síndico de dois prédios novos uma folha com o que a regra pede e como você instala."}
    ],
    "nao_alcancado": "O material não mostrou em que grupos do prédio o cliente pede indicação nem se a loja do aparelho recomenda instalador.",
    "evidencias": [
      {"tipo": "disse", "refs": ["C1"], "texto": "Indicação, busca do Google e mapa."}
    ]
  },
  "sabe": {
    "degraus": [
      {"nivel": 1, "sinal": "Acha que dá para aguentar o calor sem ar.", "o_que_dizer": "Nada de serviço: o que muda no primeiro verão com o ar instalado direito."},
      {"nivel": 2, "sinal": "Comprou o aparelho ou mudou e não sabe quem chamar.", "onde": "Busca no Google e no mapa", "o_que_dizer": "Nomear o medo da parede e da sujeira e mostrar que existe instalação sem isso."},
      {"nivel": 3, "sinal": "Compara o preço com o técnico do bairro e a loja.", "onde": "Quem chega pelo Google", "o_que_dizer": "O que o preço inclui, antes do valor, e por que a visita vem antes."},
      {"nivel": 4, "sinal": "Chega sabendo o nome da empresa.", "onde": "Quem chega por indicação", "o_que_dizer": "Tirar a dúvida do material e marcar a data."},
      {"nivel": 5, "sinal": "Pergunta a data e a forma de pagamento.", "onde": "Depois da visita", "o_que_dizer": "Confirmar a janela de duas horas, sem reexplicar nada."}
    ],
    "foco": 3,
    "leitura": {"paragrafos": ["A venda que você perde está no degrau 3: quem chega pelo Google compara e recebe só um número.", "Quem chega por indicação já está no degrau 4 e fecha quase sozinho."], "origem": {"tipo": "leitura", "refs": ["C1", "C3", "C7"]}},
    "evidencias": [
      {"tipo": "disse", "refs": ["C3"], "texto": "Pelo Google, o cliente só quer saber o preço e some."}
    ]
  },
  "nao": {
    "perfis": [
      {"perfil": "Quem quer instalar no mesmo dia, sem visita", "porque": "Dá mais trabalho do que retorno, e é o que você nunca promete.", "origem": {"tipo": "disse", "refs": ["relato 2026-11-18", "C11"]}},
      {"perfil": "Quem escolhe só pelo menor preço", "porque": "Você nunca diz que é o mais barato, e o técnico do bairro sempre vai ganhar nesse critério.", "origem": {"tipo": "leitura", "refs": ["D4", "[2]"]}},
      {"perfil": "Quem só chama quando já deu problema com outro", "porque": "Chega com a parede furada errado e espera que você conserte pelo preço de uma instalação.", "origem": {"tipo": "hipotese", "razao": "Você contou que muitos chamam o técnico do prédio e só te chamam quando deu problema; falta saber se esse conserto compensa."}}
    ]
  },
  "apostas": {
    "itens": [
      {"aposta": "O cliente do Google some porque não sabe se o preço vai mudar, não porque achou mais barato.", "por_que": "As dúvidas e reclamações públicas são sobre o que o preço inclui.", "como_confirmar": "Mandar orçamento fechado aos próximos pedidos do Google e contar quantos respondem.", "tempo": "2-semanas"},
      {"aposta": "Para o cliente, preço fechado pesa mais que hora marcada.", "por_que": "Mais trechos falam de preço que muda do que de espera.", "como_confirmar": "Nas conversas: o que quase fez desistir da compra.", "tempo": "1-semana"},
      {"aposta": "A regra do condomínio trava a decisão em apartamento.", "por_que": "A dúvida aparece no fórum e nenhum concorrente responde.", "como_confirmar": "Contar, nos próximos orçamentos, quantos perguntam do condomínio.", "tempo": "1-mes"},
      {"aposta": "Quem instalou volta para a limpeza se for lembrado.", "por_que": "Às vezes o cliente volta sozinho, e quase nunca é lembrado.", "como_confirmar": "Mandar o lembrete a quem instalou há um ano e contar quantos marcam.", "tempo": "2-semanas"},
      {"aposta": "Rápido quer dizer antes do calor, não no mesmo dia.", "por_que": "Você nunca promete o mesmo dia e o cliente fica.", "como_confirmar": "Nas conversas: quando ele queria o ar funcionando.", "tempo": "1-semana"}
    ],
    "roteiro": {"conversas": 5, "minutos": 15, "com_quem": "Com clientes que instalaram de outubro para cá, de preferência quem chegou pelo Google.", "perguntas": ["O que estava acontecendo na sua casa quando você decidiu instalar?", "Com quem mais você falou antes de escolher?", "O que quase fez você desistir?", "O que você queria saber do preço antes de fechar?", "Onde você procurou e o que leu antes de chamar?"]}
  }
}
```

## Conferir

`<PY> .agents/skills/marketing-persona/scripts/estudo.py conferir --etapa 6`

Ela confere o `persona.md` pelo contrato (forma, origens, contas da balança), contra o dossiê e o estudo (cada código e relato existe, cada `[n]` é ficha da pesquisa, frase entre aspas é literal, as mesmas descobertas da etapa 4), vê se ele foi montado do `6-estudo.json` de agora, sem mudança à mão, e se tem as descobertas, o capítulo de quem é e as apostas.

- Saída 0: siga para a etapa 7 e leia só `referencias/etapas/etapa-7-plano-de-mensagem.md`.
- Saída 1: corrija o `6-estudo.json` (ache a origem de verdade, ou troque por `hipotese` com a razão; nunca apague a origem só para passar), rode o `montar` e a conferência de novo.

## O que dizer ao dono

Nada nesta etapa. O estudo só vai para ele na etapa 9, depois da revisão.

## Nunca

- Escrever ou editar o `persona.md` à mão.
- Inventar idade, renda, profissão, hábito, frase de cliente, número ou concorrente.
- Dar nome de gente ao arquétipo ("Ana, 34 anos"): é um rótulo para a equipe, como "a família do apartamento novo".
- Copiar a resposta do dono como texto principal de uma parte.
- Gravar nome, telefone, e-mail ou CPF de cliente real, ou nome de quem escreveu um comentário.
- Marcar `aprovado` no Mapa nesta etapa.
