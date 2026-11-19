# Etapa 7: Plano de mensagem

**Objetivo:** acrescentar ao estudo o que dizer ao cliente (a promessa de hoje ao lado da sugerida, o risco, as provas que tem e as que faltam, a resposta pronta para cada dúvida) e as ações da semana.

É a parte que o dono usa no dia seguinte: no anúncio, no WhatsApp, no orçamento. Exemplo: a mesma empresa fictícia (Clima Exemplo Ar-Condicionado, Campinas).

## O que ler

1. `empresa/publico/estudo/6-estudo.json`: `descobertas`, `forcas`, `decide`, `sabe` e `apostas`.
2. `empresa/publico/estudo/5-entrevista.md`
3. Na saída de `<PY> .agents/skills/marketing-persona/scripts/dossie_para_persona.py --bloco oferta`, só **C10** (o que garante), **C11** (o que nunca promete), **D5** (promessa da marca) e **D6** (resultado de que se orgulha). No dossiê antigo: 5.1 e 5.2.

## O que gravar

As chaves `mensagem` e `semana` no MESMO `empresa/publico/estudo/6-estudo.json`, depois de `nao` e `apostas`, neste molde (as formas e os tetos estão em `.agents/skills/marketing-persona/referencias/modelo-persona.md`):

```
"mensagem": {
  "promessa_hoje": {"texto": "<a promessa do dono, D5>", "origem": {"tipo": "disse", "refs": ["D5"]}},
  "promessa_sugerida": {"texto": "<até 20 palavras>", "motivos": ["<por que trocar>"], "origem": {"tipo": "leitura", "refs": ["D5", "..."]}, "evidencias": []},
  "risco": {"titulo": "<o que pode desmentir a promessa>", "texto": "<por que, e o que falta saber>", "origem": {...}, "teste": "<como testar>"},
  "onde_quando": {"texto": "<canais e momento>", "origem": {...}},
  "provas_tem": [{"texto": "<fato que o dono já tem>", "origem": {"tipo": "disse", "refs": ["C10"]}}],
  "provas_faltam": [{"texto": "<prova que ainda não existe>"}],
  "duvidas": [{"duvida": "<dúvida do cliente>", "origem_duvida": {...}, "resposta": "<resposta pronta>", "origem_resposta": {...}, "pendencia": "<o que falta confirmar>"}]
},
"semana": {"acoes": [{"acao": "<o que fazer>", "resolve": "<que aposta ou vazamento resolve>"}]}
```

Depois gere o documento de novo: `<PY> .agents/skills/marketing-persona/scripts/persona_estudo.py montar`

## Regras de decisão

Antes de cada parte, olhe o que o estudo já tem e responda: o que isso significa para a venda? o que o dono não está vendo? A promessa sugerida, o risco e as ações saem dessas respostas, não de reescrever a promessa de hoje com outras palavras. Se a descoberta mais forte mostra que o cliente pergunta uma coisa e a promessa fala de outra, a troca é essa.

**Promessa de hoje e promessa sugerida**
- Promessa de hoje: a de D5, como o dono escreveu, com origem `disse`. Sem D5, não escreva.
- Promessa sugerida: parta da de hoje e ajuste pela descoberta mais forte (a primeira). Origem `leitura` com D5 e as refs da descoberta. Até 20 palavras.
- `motivos`: até 4, cada um dizendo o que a troca resolve ("Põe na frente o que o cliente do Google mais pergunta").
- Se a promessa diz algo que C11 diz que a empresa nunca promete, corte. Se ela garante algo que C10 não garante (prazo, preço, "sem cobrança extra"), corte.

**Risco na promessa**
- Se a promessa sugerida depende de algo que o dono ainda não disse (o que entra no preço, o prazo), escreva o risco: `titulo` em uma frase, `texto` com o porquê, origem `hipotese` com a razão, e `teste` com um jeito de medir em poucas semanas. Se não há risco, não escreva a chave.

**Provas que tem e provas que faltam**
- `provas_tem`: só fato do dono (C10, D6, C9, B8 ou resposta da etapa 5), origem `disse`. Hipótese não é prova. Frase de cliente entre aspas só se está literal no dossiê.
- `provas_faltam`: a prova que tornaria a promessa crível e ainda não existe (foto de antes e depois, avaliação no mapa, uma contagem). Origem só se ela se apoia em algo que o dono disse.

**Onde e quando falar**
- Onde: os canais de C1, começando pelo do degrau em foco (`sabe.foco`). Quando: o fato que faz agir (caminho) e a época de B7. Origem `leitura`.

**Dúvidas com resposta pronta**
- Dúvidas: as de C7 e as das fichas de `duvidas_e_reclamacoes`, com `origem_duvida` `disse` ou `pesquisa`. De 1 a 8.
- Resposta: só o que o dono disse (dossiê ou etapa 5), ou uma leitura tirada só disso. `origem_resposta` nunca `hipotese`: se ninguém respondeu, a dúvida não entra aqui, vira aposta ou pergunta do roteiro.
- `pendencia`: o que ainda falta o dono confirmar na resposta (por exemplo, quantos metros de tubo entram).

**Ações da semana**
- De 3 a 5, nesta ordem: primeiro as que confirmam as apostas mais caras (as que mudam a promessa ou o preço), depois as que fecham os vazamentos do caminho, por último as que juntam as provas que faltam.
- Cada ação é algo que o dono faz em uma semana, com verbo no começo ("Escrever", "Mandar", "Listar"). `resolve` diz qual aposta, vazamento ou prova ela resolve.
- Ação que se apoia num fato do dono leva `origem` `disse` com o código. Ação que testa uma aposta não leva origem: o `resolve` diz qual aposta ela confirma.

## Exemplo

O exemplo abaixo são as duas chaves que entram no `6-estudo.json` do exemplo da etapa 6:

```exemplo-mesclar empresa/publico/estudo/6-estudo.json
{
  "mensagem": {
    "promessa_hoje": {"texto": "Instalação com hora marcada e casa limpa no fim.", "origem": {"tipo": "disse", "refs": ["D5"]}},
    "promessa_sugerida": {"texto": "Orçamento fechado, hora marcada e casa limpa no fim.", "motivos": ["Põe na frente o que o cliente do Google mais pergunta.", "Mantém o que já faz o cliente ficar com você.", "Responde ao medo de cobrança extra."], "origem": {"tipo": "leitura", "refs": ["D5", "C10", "[7]", "relato 2026-11-18"]}, "evidencias": [{"tipo": "disse", "refs": ["D5"], "texto": "Promessa atual da marca."}, {"tipo": "pesquisa", "refs": ["[7]"], "texto": "Reclamação de material fora do orçamento."}]},
    "risco": {"titulo": "Orçamento fechado só vale se o preço não mudar depois da visita.", "texto": "Se a visita descobrir tubo a mais e o preço subir, a promessa vira a mesma reclamação dos concorrentes. O dossiê não diz quantos metros de tubo entram no preço.", "origem": {"tipo": "hipotese", "razao": "O que o orçamento inclui ainda não foi dito por você."}, "teste": "Dizer no orçamento quantos metros entram e quanto custa o metro a mais, e ver em um mês se o fechamento muda."},
    "onde_quando": {"texto": "Na busca do Google e no mapa, de setembro a março, antes da primeira onda de calor.", "origem": {"tipo": "leitura", "refs": ["C1", "B7", "relato 2026-11-18"]}},
    "provas_tem": [
      {"texto": "Garantia de um ano por escrito e janela de duas horas.", "origem": {"tipo": "disse", "refs": ["C10"]}},
      {"texto": "Uma cliente escreveu que \"foi a primeira instalação em que ninguém precisou passar pano depois\".", "origem": {"tipo": "disse", "refs": ["D6"]}},
      {"texto": "Foto do serviço pronto, mandada a cada cliente.", "origem": {"tipo": "disse", "refs": ["C9"]}}
    ],
    "provas_faltam": [
      {"texto": "Foto de antes e depois da parede e do chão."},
      {"texto": "Avaliações no mapa contando a hora marcada e a casa limpa."},
      {"texto": "Quantas instalações terminaram sem cobrança extra.", "origem": {"tipo": "disse", "refs": ["D6"]}}
    ],
    "duvidas": [
      {"duvida": "O preço já inclui o material?", "origem_duvida": {"tipo": "disse", "refs": ["C7"]}, "resposta": "Sim, o material entra no orçamento.", "origem_resposta": {"tipo": "disse", "refs": ["relato 2026-11-18"]}, "pendencia": "Dizer quantos metros de tubo entram."},
      {"duvida": "Precisa quebrar a parede?", "origem_duvida": {"tipo": "disse", "refs": ["C7"]}, "resposta": "Só dá para dizer depois de ver o local; por isso a visita vem antes da instalação.", "origem_resposta": {"tipo": "leitura", "refs": ["C11"]}},
      {"duvida": "A parte de fora pode ficar na fachada do prédio?", "origem_duvida": {"tipo": "pesquisa", "refs": ["[6]"]}, "resposta": "A regra do condomínio é pedida antes da visita, e a instalação segue o que o síndico deixa.", "origem_resposta": {"tipo": "disse", "refs": ["relato 2026-11-18"]}},
      {"duvida": "Por que mais caro que o técnico do grupo do prédio?", "origem_duvida": {"tipo": "disse", "refs": ["C7"]}, "resposta": "Porque o preço já inclui o material, a hora é marcada com janela de duas horas e a garantia é de um ano por escrito.", "origem_resposta": {"tipo": "leitura", "refs": ["C10", "relato 2026-11-18"]}}
    ],
    "evidencias": [
      {"tipo": "disse", "refs": ["C11"], "texto": "Nunca promete instalar no mesmo dia."}
    ]
  },
  "semana": {
    "acoes": [
      {"acao": "Escrever o orçamento fechado: o que entra, quantos metros de tubo e o preço do metro a mais.", "resolve": "A dúvida que faz o cliente do Google sumir."},
      {"acao": "Mandar esse orçamento, antes do valor, a todo pedido que chegar pelo Google.", "resolve": "O vazamento no orçamento."},
      {"acao": "Listar quem instalou há cerca de um ano e mandar o lembrete da limpeza.", "resolve": "O vazamento da limpeza anual, o serviço que mais dá lucro.", "origem": {"tipo": "disse", "refs": ["B3", "C9"]}},
      {"acao": "Pedir a cinco clientes recentes uma avaliação no mapa e marcar as cinco conversas.", "resolve": "As provas que faltam e as apostas sobre preço e condomínio."}
    ]
  }
}
```

## Conferir

`<PY> .agents/skills/marketing-persona/scripts/estudo.py conferir --etapa 7`

Ela confere o estudo inteiro de novo, agora exigindo a promessa de hoje, a sugerida, pelo menos uma dúvida com resposta e de 3 a 5 ações.

- Saída 0: siga para a etapa 8 e leia só `referencias/etapas/etapa-8-revisao.md`.
- Saída 1: corrija o `6-estudo.json`, rode o `montar` e a conferência de novo.

## O que dizer ao dono

Nada nesta etapa. O plano vai para ele na etapa 9.

## Nunca

- Prometer o que o dono não garante (C10) ou o que ele diz que nunca promete (C11).
- Usar hipótese como prova.
- Escrever resposta pronta que o dono não deu.
- Editar o `persona.md` à mão em vez de rodar o `montar`.
