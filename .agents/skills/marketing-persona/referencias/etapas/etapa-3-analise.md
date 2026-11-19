# Etapa 3: Análise

**Objetivo:** cruzar a hipótese do dono com a pesquisa em 7 moldes, sempre nesta ordem, e tirar leituras que digam de onde vieram.

Exemplo: a mesma empresa fictícia (Clima Exemplo Ar-Condicionado, Campinas).

Análise é interpretação. Em cada bloco, a linha que importa é a SUA leitura: o que as respostas do dono e os trechos da internet querem dizer quando lidos juntos, ou a aposta que você faz e por quê. A resposta do dono é evidência, não conclusão: se a linha só repete o que ele disse, ela ainda não é análise.

## Quem faz esta etapa

As etapas 3 e 4 são o raciocínio do estudo e rodam no subagente `marketing-analista`, com o modelo mais forte (decisão de 19/11/2026: em três ensaios com o modelo comum seguindo este roteiro, o estudo tirou nota 5 de 10 em ensinar ao dono algo que ele não sabia; o escrito com o modelo forte foi aprovado). Você não escreve a análise: chama o analista, grava o que ele devolveu e confere. Uma resposta dele serve às duas etapas.

1. Chame o subagente `marketing-analista` UMA vez, com este pedido, e espere a resposta antes de seguir:

```
{
  "chamado_por": "marketing-persona",
  "hoje": "<AAAA-MM-DD>",
  "dossie": "contexto/dossie/dossie-completo.md",
  "escopo": "empresa/publico/estudo/0-escopo.md",
  "hipotese_do_dono": "empresa/publico/estudo/1-hipotese-do-dono.md",
  "pesquisa": "empresa/publico/estudo/2-pesquisa.json",
  "correcao": null
}
```

2. A resposta é um JSON. Grave o campo `analise_md` em `empresa/publico/estudo/3-analise.md` e o campo `descobertas_md` em `empresa/publico/estudo/4-descobertas.md`, inteiros, sem mudar uma letra. Se veio texto antes ou depois do JSON, use só o objeto `{ ... }`. Os outros campos (`fora_dos_cruzamentos`, `limites`) não vão para arquivo nenhum.
3. Rode as duas conferências: `<PY> .agents/skills/marketing-persona/scripts/estudo.py conferir --etapa 3` e `<PY> .agents/skills/marketing-persona/scripts/estudo.py conferir --etapa 4`.
4. Alguma deu saída 1: devolva os PROBLEMAS ao analista UMA vez, com o mesmo pedido e `"correcao": {"problemas": "<a saída inteira das duas conferências>"}`. Grave de novo os dois campos e rode as duas conferências. Se ainda sobrar PROBLEMA, corrija você só a linha que cada PROBLEMA aponta, pelas regras deste roteiro e do da etapa 4, sem chamar o analista outra vez. São no máximo 2 chamadas por estudo: a primeira e UMA de correção.
5. Não reescreva a leitura do analista para "melhorar" nem resuma o que ele escreveu: o texto dele é a análise do estudo.

**Plano B: o analista não está disponível ou falhou.** O subagente não existe nesta instalação, deu erro, a resposta não é um JSON, veio `"status": "incompleto"` ou um dos dois textos veio vazio: faça você as etapas 3 e 4 pelos moldes, como este roteiro e o da etapa 4 ensinam abaixo, e avise o dono com a frase do plano B em "O que dizer ao dono". Não chame o analista de novo para tentar outra vez.

O resto deste roteiro (o que ler, as marcas, o molde, as regras e o exemplo) é o que o analista segue e o que você segue no plano B ou para corrigir um PROBLEMA que sobrou.

## O que ler

1. `empresa/publico/estudo/0-escopo.md`
2. `empresa/publico/estudo/1-hipotese-do-dono.md`
3. `empresa/publico/estudo/2-pesquisa.json`: para cada ficha, só `n`, `trecho`, `frente` e `tema`.
4. A saída de `<PY> .agents/skills/marketing-persona/scripts/dossie_para_persona.py --bloco publico --bloco dor --bloco oferta --bloco tom`. Ela traz todas as perguntas que os moldes abaixo citam: B3, B5a, B5b, B6, B7, B8, C1, C2, C3, C6, C7, C8, C9, C10, C11, D4, D5 e D6. Leia só essas. No dossiê antigo, os mesmos blocos trazem os códigos com ponto.
5. Pergunta que o molde cita e que está `"não sei"`, `ausente`, com `sem_resposta: true`, ou que não existe na saída ("pergunta não consta neste dossiê"): não cite o código, o conferidor reprova. Escreva a linha com outra evidência, ou com `(hipótese: razão)` pelo tipo de negócio, ou deixe `(não consta no dossiê)`.
6. Resposta que pede cuidado: cortada no meio da frase (termina em vírgula, ou em "que", "e", "de" sem ponto); com duas partes sem rótulo que diga o que é cada uma (o `rotulo` de `partes`, como "Qual é o principal?", diz; sem ele, não adivinhe qual vale); ou duas respostas do dono que se desmentem (por exemplo, C1 lista três canais e C3 diz que só usa um). Use só o pedaço inteiro e certo, não conclua nada do resto e anote numa linha da seção `## O que ainda não sabemos` (no fim do molde). O conferidor acusa resposta cortada que não estiver lá; a etapa 5 transforma cada linha dessa seção em pergunta ao dono.

## O que gravar

`empresa/publico/estudo/3-analise.md`

## As marcas desta etapa (e só estas)

- **Evidência:** o que o dono disse ou a página mostra. `(dossiê B5a)` ou `(pesquisa [3])`.
- **Análise:** leitura sua tirada de evidências. `(análise: dossiê C3 + pesquisa [5])`. Depois de `análise:` vem pelo menos uma referência: `dossiê CÓDIGO`, `pesquisa [n]` ou `relato AAAA-MM-DD`, separadas por ` + `. Cada referência tem de existir e ter resposta; o conferidor confere uma por uma.
- **Hipótese:** aposta sua sem evidência direta, SEMPRE com a razão: `(hipótese: adiar é sempre uma alternativa real)`. Hipótese sem razão é reprovada.
- Sem nada para dizer na linha: `(não consta no dossiê)`.
- Linhas de recomendação (`- O que isso pede:`, `- Como virar:`, `- Como chegar:`, `- O material não alcançou:`) não levam marca: são o que fazer, não afirmação sobre o cliente.

Como escolher a marca, linha por linha:
- Se a linha repete o que UMA resposta ou UM trecho diz, use a evidência: `(dossiê CÓDIGO)` ou `(pesquisa [n])`.
- Se a linha junta duas ou mais evidências numa conclusão nova, use `(análise: ...)` com TODAS as que você usou.
- Se a linha não se apoia em nenhuma resposta nem trecho, use `(hipótese: razão)`, dizendo em uma frase por que aposta nisso.
- Se você quer escrever um número, um nome de concorrente ou uma frase entre aspas e não acha a evidência, não escreva.
- Ficha cujo `o_que_sustenta` começa por "Um artigo diz que" é opinião de quem escreveu a página, não fala do cliente: pode sustentar `(pesquisa [n])`, mas a linha diz "um artigo diz", nunca "o cliente diz".
- Cada bloco precisa de pelo menos uma linha com `(análise: ...)` ou `(hipótese: razão)`. Bloco só com respostas do dono copiadas é reprovado.

**Depois dos fatos, duas perguntas.** Em todo bloco, depois de escrever o que o dono disse e o que os trechos mostram, responda: o que isso significa para a venda? o que o dono não está vendo? A resposta é a linha que ensina; o fato é só a evidência dela. Como passar do fato para a leitura:
- Fato: o cliente pergunta se o preço inclui o material. Leitura: o que parece caça ao menor preço é medo de o preço crescer depois.
- Fato: o cliente compara a empresa com uma alternativa mais cara que ele já usa. Leitura: ele já paga por isso, então o preço não é a primeira barreira; a barreira é outra.
- Fato: quem compra decide por uma família ou uma equipe. Leitura: quem decide não é só quem vai usar, e a venda precisa de algo que ele possa mostrar aos outros.
- Fato: quem pede orçamento recebe uma tentativa só. Leitura: cada pedido que o anúncio traz vale uma chance, e a venda se perde antes da visita, não depois.
Nos blocos 2, 3 e 7 (os de fatos: quem é, como decide, onde está), as duas respostas vão nas linhas `- O que isso muda na venda:` e `- O que o dono não está vendo:`, sempre com `(análise: ...)` ou `(hipótese: razão)`; o conferidor reprova as duas linhas com marca só de evidência. Na etapa 6, capítulo de fatos com mais da metade das afirmações copiadas do dono é recusado pelo script: a leitura tem de nascer aqui.

**Antes de gravar, para cada `[n]` que você citou** (sozinho ou dentro de `(análise: ...)`): ache a ficha de mesmo `n` no `2-pesquisa.json`, releia o `trecho` e confira que ele fala do assunto da linha. Se não fala, troque pelo `n` certo ou tire a referência. O conferidor só vê se a ficha existe; se ela diz o que a linha conclui, quem confere é você.

## Molde

Os 7 blocos, nesta ordem, com estes títulos e estes rótulos. Rótulo que pode repetir (uma linha por item) diz "uma por linha".

```
# Análise

- Data: <AAAA-MM-DD>
- Como ler: (dossiê, pesquisa, relato) é evidência; (análise: ...) é leitura do especialista apoiada nas referências citadas; (hipótese: razão) é aposta do especialista, com a razão.

## 1. Valor diferenciado

- Alternativas reais do cliente: <o que o cliente faria sem a empresa, inclusive não fazer nada> (marca)
- O que só a empresa tem: <o que nenhuma alternativa oferece> (marca)
- O valor disso para o cliente: <o que o cliente ganha com isso, nas palavras dele> (análise: ...)
- Quem mais liga para esse valor: <que tipo de cliente sente mais falta disso> (análise: ...)
- Eixo horizontal: <polo da esquerda> a <polo da direita> (análise: ...)
- Eixo vertical: <polo de baixo> a <polo de cima> (análise: ...)
- <nome da própria empresa>: x <0 a 100>, y <0 a 100> (a própria empresa) (marca)
- <alternativa>: x <0 a 100>, y <0 a 100> (marca de onde ela apareceu)
- Leitura do mapa: <o que o mapa mostra, inclusive não fazer nada> (análise: ...)

## 2. Grupos por comportamento

- Comportamento 1: <um jeito de agir> ou <o jeito oposto> (marca)
- Comportamento 2: <...> ou <...> (marca)
- Grupo A: <combinação de comportamentos> (marca)
- Grupo B: <outra combinação> (marca)
- Persona principal: <o grupo escolhido e por quê> (marca)
- Quem não é cliente: <quem a empresa não deve atrair> (marca)
- O que isso muda na venda: <o que esses grupos mudam no jeito de vender> (análise: ...)
- O que o dono não está vendo: <o que os grupos mostram e o dono não disse> (análise: ...)

## 3. Decisão de compra

- O que dispara: <o acontecimento que faz o cliente procurar agora> (marca)
- Resultado que espera: <como ele mede que deu certo> (marca)
- O que barra: <o que faz ele desistir ou adiar> (marca)
- O que compara: <o que ele põe lado a lado antes de escolher> (marca)
- O que as palavras vagas querem dizer: "<palavra vaga>" quer dizer <o que ela significa para ele> (marca), uma por linha
- Caminho e quem influencia: <do primeiro pensamento à compra, e quem pesa na decisão> (marca)
- Ponto do caminho: <etapa>, <atua | fora | vazamento>: <o que acontece>. Alerta: <só no vazamento: onde e por que perde gente> (marca), de 3 a 8, na ordem
- Quem pesa: <papel>, <decide | influencia | usa>, anel <0 a 3>: <o que faz na compra> (marca), de 2 a 6
- Trabalho prático: <o resultado concreto que ele quer> (marca)
- O que isso pede: <o que isso pede da empresa>
- Trabalho ser visto: <como ele quer ser visto pelos outros> (marca)
- O que isso pede: <...>
- Trabalho sentir: <como ele quer se sentir> (marca)
- O que isso pede: <...>
- O que isso muda na venda: <onde a venda se ganha ou se perde nesse caminho> (análise: ...)
- O que o dono não está vendo: <o que o caminho mostra e o dono não disse> (análise: ...)

## 4. Forças

- Empurra: <incômodo com o jeito de hoje>, peso <1 a 3> (marca), uma por linha
- Puxa: <o que atrai na empresa>, peso <1 a 3> (marca), uma por linha
- Puxa ausente: <o que atrairia e a empresa ainda não mostra>, peso <1 a 3> (análise: ...)
- Medo: <o que dá medo na troca>, peso <1 a 3> (marca), uma por linha
- Costume que segura: <o hábito que puxa de volta ao jeito antigo>, peso <1 a 3> (marca)
- Inclinação: <empurra | segura | equilíbrio>: <a leitura da balança em uma frase> (análise: ...)
- Como virar: <título curto>: <o passo que muda o peso>, até 3

## 5. Nível de consciência por grupo

| Degrau | Sinal que mostra | Quem da empresa está aqui | O que a mensagem deve fazer |
|---|---|---|---|
| 1 não percebe o problema | <sinal> (marca) | <público, ou "nenhum público identificado"> | <o que dizer> |
| 2 sente a dor, não conhece a saída | <sinal> (marca) | <público> | <o que dizer> |
| 3 conhece saídas, não escolheu | <sinal> (marca) | <público> | <o que dizer> |
| 4 conhece a empresa, não decidiu | <sinal> (marca) | <público> | <o que dizer> |
| 5 pronto para comprar | <sinal> (marca) | <público> | <o que dizer> |

- Degrau em foco: <1 a 5>, <por que é a maior oportunidade> (análise: ...)

## 6. Como pensa

- Acredita: <o que ele acha que é verdade sobre o assunto> (marca), até 5
- Teme: <o que ele tem medo de que aconteça> (marca), até 5
- Deseja: <o que ele quer que aconteça> (marca), até 5
- Teste do espelho: <bate demais | não bate>: <a comparação do que ele deseja com o que o dono preza em si mesmo> (marca)

## 7. Onde está

- Já cruza com você: <onde o cliente já encontra a empresa> (marca)
- Como chegar: <o que fazer ali>
- Onde se informa: <onde ele procura informação> (marca)
- Como chegar: <...>
- Onde aprende e compara: <onde ele compara opções> (marca)
- Como chegar: <...>
- Quem escuta: <de quem ele ouve recomendação> (marca)
- Como chegar: <...>
- O que isso muda na venda: <o que esses lugares mudam em onde e como falar com ele> (análise: ...)
- O que o dono não está vendo: <um lugar ou uma pessoa que pesa e a empresa não usa> (análise: ...)
- O material não alcançou: <o que o dossiê e a pesquisa não mostraram sobre onde ele está>

## O que ainda não sabemos

- Resposta cortada: <código>, <o assunto que ficou pela metade>
- Respostas que não batem: <código> e <código>, <o que uma diz e a outra desmente>
```

A seção "O que ainda não sabemos" só vai quando há o que pôr nela; as linhas não levam marca.

## Regras de decisão, bloco por bloco

**1. Valor diferenciado** (método de April Dunford)
- Alternativas: junte as de B8 (dossiê) e as fichas de `frente` "alternativas". Se nenhuma fonte cita "não fazer nada" ou "adiar", acrescente-o com `(hipótese: adiar é sempre uma alternativa real)`.
- O que só a empresa tem: só o que o dono disse (B8, C10, D5). Se uma alternativa da pesquisa promete a mesma coisa, isso NÃO é só da empresa: tire da linha.
- O valor: traduza o "o que só a empresa tem" para o ganho do cliente, apoiado no problema que ele relata (B5b ou fichas de "voz_do_cliente"). Marca `(análise: ...)`.
- Quem mais liga: o tipo de cliente que mais sofre com o problema que o valor resolve. Marca `(análise: ...)`.
- **Mapa de posição.** Os dois eixos são os dois critérios que mais pesam para o cliente: tire-os do que ele compara (bloco 3) e das dúvidas (C7 e fichas de `duvidas_e_reclamacoes`). Cada eixo vai do polo fraco ao forte ("Menor preço a Preço fechado"), até 30 letras por polo.
- Uma linha por alternativa, com x e y de 0 a 100 (0 = polo da esquerda ou de baixo). Só entra alternativa que o dono citou (B8) ou que a pesquisa mostrou pelo nome ou pelo tipo, com a marca de onde ela apareceu; nunca `(hipótese)`. A empresa entra com `(a própria empresa)`, uma vez só. "Não fazer nada" não vira ponto: vai na leitura.
- Se a empresa fica num canto onde nenhuma alternativa está, a leitura diz isso. Se fica no meio das outras, a leitura diz que ela ainda não se diferencia nesses dois critérios.

**2. Grupos por comportamento** (método de Alan Cooper e Kim Goodwin)
- Escreva de 2 a 4 comportamentos em que os clientes DIFEREM, cada um com dois polos ("procura por indicação ou procura sozinho no Google"). Nunca idade, renda ou sexo: comportamento.
- Monte os grupos combinando os polos que aparecem juntos nas evidências. Um grupo por linha "Grupo A", "Grupo B".
- Se só há evidência para um grupo, escreva só o Grupo A e diga isso na linha da persona principal.
- Persona principal: o grupo em que a empresa mais ganha ou mais perde venda hoje (olhe C3 e C7). Quem não é cliente: use C6, C11 ou fichas de reclamação; sem evidência, `(hipótese: razão)`.
- O que isso muda na venda: compare o grupo que o dono descreve como ideal com o grupo que o canal de hoje traz (C1, C3). Se não são o mesmo, isso é a leitura.

**3. Decisão de compra** (métodos de Adele Revella e de Bob Moesta)
- O que dispara: o acontecimento, não a dor. Sem evidência, `(hipótese: razão)`: a etapa 5 pergunta ao dono.
- O que barra: C7 e as fichas de `frente` "duvidas_e_reclamacoes".
- Palavras vagas: para cada palavra vaga que o cliente usa ("caro", "rápido", "confiável"), diga o que ela quer dizer PARA ELE, juntando evidências: `(análise: ...)`. Se nenhuma evidência explica, escreva o significado provável com `(hipótese: razão)`. Até 6.
- **Caminho.** De 3 a 8 pontos, na ordem: o primeiro incômodo, o fato que faz agir, a busca, a escolha e o que vem depois da compra (C1, C3, C8, C9, B5a). Para cada ponto, escolha UM estado:
  - a empresa faz alguma coisa ali (anuncia, responde, visita, instala): `atua`;
  - acontece antes de o cliente falar com a empresa e ela não tem como estar lá: `fora`;
  - o dono conta que perde cliente ali, ou que deveria agir e não age (C3 "some", C8 "volto quando lembro", C9 "devia lembrar"): `vazamento`, com `Alerta:` dizendo onde e por que perde gente.
- **Quem pesa.** Quase nenhuma compra é de uma pessoa só. Anel 0 é quem decide e paga (B5a, ou a resposta da etapa 5 em empresa); anel 1 quem mais influencia; anel 3 quem pesa de longe. Para família também: o casal decide, quem indicou influencia, o síndico ou o vizinho pesa de fora. Até 2 papéis por anel. Quando o dossiê não diz quem mais participa, não deixe só o anel 0: pelo tipo de negócio, escreva quem costuma pesar numa compra assim (em empresa, o sócio, o financeiro ou o contador e quem vai usar; em família, o parceiro e quem indicou) com `(hipótese: razão)`, a razão dizendo de que tipo de compra você partiu e que é a primeira coisa a perguntar a quem já comprou.
- **Três trabalhos.** O prático é o resultado concreto (B5b). Ser visto e sentir quase nunca estão ditos: deduza das reclamações, dos elogios (D6) e de quem está em volta, com `(análise: ...)`, ou afirme com `(hipótese: razão)`. Logo abaixo de cada um, `- O que isso pede:` diz o que a empresa precisa fazer para entregar aquele trabalho.

**4. Forças** (método de Bob Moesta)
- Empurra e Medo vêm de B5b, C7 e das fichas de reclamação. Puxa vem de D5, C10 e B8. Costume que segura vem de B8 ou das fichas de "alternativas". Linha sem evidência: `(hipótese: razão)`.
- **Peso**, sempre antes da marca: 3 se a força aparece em mais de uma fonte ou o dono diz que é o que mais trava; 2 se aparece numa fonte com clareza; 1 se é sinal fraco ou de um trecho só.
- **Puxa ausente**: o que atrairia o cliente e a empresa ainda não mostra (por exemplo, uma descoberta que o cliente procura e não acha). Não entra na soma.
- **Inclinação**: some Empurra e Puxa (sem o ausente) e some Medo e Costume. Se o lado que segura soma igual ou mais, escreva `segura`; se o que empurra soma mais, `empurra`; se a diferença é de 1 ou menos e você não sabe dizer, `equilíbrio`. O conferidor refaz a conta. Depois dos dois-pontos, a leitura: por que pende para lá, em uma frase.
- **Como virar**: até 3 passos, cada um tirando peso de um medo ou pondo o peso que falta.

**5. Nível de consciência** (método de Eugene Schwartz): a escada tem SEMPRE os 5 degraus.
- Sinal de cada degrau: o que mostra que alguém está ali, com as palavras do negócio. Sem evidência, `(hipótese: razão)`.
- Quem da empresa está aqui: o grupo do bloco 2 ou o canal (C1) que mostra esse sinal. Use o sinal para escolher:
  - fala do problema, não cita solução: degrau **2**;
  - cita alternativas ou compara opções e preços: **3**;
  - chega sabendo o nome da empresa (indicação): **4**;
  - pergunta preço, prazo ou pagamento, pronto para fechar: **5**;
  - não relata problema nenhum: **1**.
  Degrau sem público: escreva "nenhum público identificado". Nunca um degrau só para a empresa inteira.
- O que a mensagem deve fazer: degrau 1, mostrar o que muda com a solução, sem vender; 2, nomear a dor com as palavras do cliente; 3, mostrar por que as alternativas falham; 4, tirar a dúvida que trava com prova; 5, ir direto à oferta.
- Degrau em foco: o degrau onde a empresa mais perde venda hoje (C3 e o vazamento do caminho), com a leitura `(análise: ...)`.

**6. Como pensa**
- Acredita: o que o cliente acha que é verdade sobre o assunto, mesmo que não seja (por exemplo, "todo instalador cobra a mais depois"). Sai das dúvidas e reclamações juntas: `(análise: ...)`.
- Teme e Deseja: B5b, C7, D6 e as fichas. Até 5 de cada. Sem ficha de `voz_do_cliente`, o que vem da pesquisa é de quem escreve sobre o assunto: escreva "artigos dizem" e prefira o que o dono ouve do cliente (C7). Não reescreva o que o dono já sabe ("acha difícil"): diga o que isso faz com a compra.
- **Teste do espelho.** Compare o "Deseja" e o critério que você pôs no alto do mapa com o que o dono preza em si mesmo: D4, D5 e a parte de B8 que diz por que ele acha que o cliente o escolhe. Se o que você diz que o cliente mais quer é igual ao que o dono mais preza, e as evidências do cliente são poucas, escreva `bate demais:` e o alerta, com `(hipótese: razão)`. Se não bate, escreva `não bate:` e por quê, com `(análise: ...)`.
- Teste do espelho sem D4 nem D5 (`"não sei"`, `ausente` ou fora da saída): compare só com o que existir entre D4, D5 e B8 e diga com qual comparou. Sem nenhum dos três, escreva `não bate: sem resposta do dono sobre o que ele preza, o teste fica em aberto` com `(hipótese: razão)`.

**7. Onde está**: as 4 zonas, da mais perto à mais longe.
- Já cruza com você: onde o cliente já encontra a empresa hoje (C1, B6). Onde se informa: onde ele procura (C1 e fichas). Onde aprende e compara: fóruns, lojas, páginas de comparação (fichas). Quem escuta: de quem ele ouve recomendação (C1, e quem pesa do bloco 3).
- Zona que o dossiê e a pesquisa não mostram: não deixe rala nem genérica ("blogs", "redes sociais"). Pelo tipo de negócio, diga onde esse cliente costuma estar e quem ele escuta (a associação do setor, o fornecedor que ele já usa, o grupo de vizinhos, o evento da área), com `(hipótese: razão)`, a razão dizendo de que tipo de negócio você partiu. O que falta confirmar vai em `- O material não alcançou:`.
- Logo depois de cada zona, `- Como chegar:` com UMA ação concreta naquele lugar.
- `- O material não alcançou:` diz o que nem o dossiê nem a pesquisa mostraram (por exemplo, em que grupos ele pede indicação).

## Exemplo

```exemplo empresa/publico/estudo/3-analise.md
# Análise

- Data: 2026-11-18
- Como ler: (dossiê, pesquisa, relato) é evidência; (análise: ...) é leitura do especialista apoiada nas referências citadas; (hipótese: razão) é aposta do especialista, com a razão.

## 1. Valor diferenciado

- Alternativas reais do cliente: chamar o técnico autônomo do bairro (dossiê B8), comprar o aparelho na loja que já inclui a instalação básica (pesquisa [1]) ou adiar e passar o calor sem ar (hipótese: adiar é sempre uma alternativa real e nenhuma fonte fala dela)
- O que só a empresa tem: horário marcado com janela de duas horas e garantia de um ano por escrito (dossiê C10); casa limpa no fim (dossiê B8)
- O valor disso para o cliente: não perder o dia esperando e não limpar a casa depois da obra (análise: dossiê B5b + pesquisa [3] + pesquisa [4])
- Quem mais liga para esse valor: quem mora em apartamento novo e trabalha fora no horário comercial (análise: dossiê B5a + dossiê B5b)
- Eixo horizontal: Menor preço a Preço fechado (análise: dossiê C7 + pesquisa [5] + pesquisa [7])
- Eixo vertical: Quando der a Hora marcada (análise: dossiê B8 + pesquisa [4])
- Clima Exemplo: x 80, y 85 (a própria empresa) (dossiê B8 e C10)
- Técnico do bairro: x 15, y 30 (pesquisa [2]) (pesquisa [4])
- Loja com instalação básica: x 35, y 45 (pesquisa [1])
- Leitura do mapa: o técnico do bairro disputa preço e rapidez e a loja cobra o material à parte; o canto de preço fechado com hora marcada só tem a empresa, e a alternativa mais comum continua sendo adiar (análise: dossiê B8 + dossiê C10 + pesquisa [1] + pesquisa [2])

## 2. Grupos por comportamento

- Comportamento 1: procura por indicação de conhecido ou procura sozinho no Google (dossiê C1)
- Comportamento 2: compara pelo preço ou compara pelo que o preço inclui (análise: dossiê C3 + pesquisa [5])
- Comportamento 3: instala no aparelho recém-comprado ou troca um aparelho antigo (hipótese: o dossiê só fala de aparelho novo, e a troca pode ser outro cliente)
- Grupo A: chega por indicação, já confia e quer marcar a data (análise: dossiê C1 + dossiê B5a)
- Grupo B: chega pelo Google, compara preços e pergunta o que está incluído (análise: dossiê C3 + pesquisa [5])
- Persona principal: o grupo B, porque é onde o dono perde a venda hoje (análise: dossiê C3)
- Quem não é cliente: quem só quer o menor preço e aceita instalar no mesmo dia sem visita (análise: dossiê C11 + pesquisa [2])
- O que isso muda na venda: o grupo B decide pelo que o preço inclui, então a primeira resposta a ele já decide a venda (análise: dossiê C3 + dossiê C7 + pesquisa [5])
- O que o dono não está vendo: o grupo A fecha quase sozinho, e é o grupo B que pede trabalho de venda, e hoje recebe só um número (análise: dossiê C1 + dossiê C3)

## 3. Decisão de compra

- O que dispara: a chegada do calor depois da compra do aparelho ou da mudança (análise: dossiê B5a + dossiê B7)
- Resultado que espera: ar funcionando, parede certa e casa limpa no mesmo dia da instalação (dossiê B5b)
- O que barra: não saber se o preço vai mudar com o material (dossiê C7); medo de cobrança extra (pesquisa [7])
- O que compara: preço com o técnico do bairro (dossiê C7) e o que a instalação básica cobre (pesquisa [5])
- O que as palavras vagas querem dizer: "caro" quer dizer não saber o que está incluído no preço (análise: dossiê C7 + pesquisa [5] + pesquisa [7])
- O que as palavras vagas querem dizer: "confiável" quer dizer chegar na hora marcada e não deixar sujeira (análise: dossiê B8 + pesquisa [3] + pesquisa [4])
- O que as palavras vagas querem dizer: "rápido" quer dizer instalar antes do calor, não no mesmo dia (hipótese: o dono nunca promete o mesmo dia e mesmo assim o cliente fica)
- Caminho e quem influencia: o casal decide junto (dossiê B5a); quem indica pesa na escolha (dossiê C1)
- Ponto do caminho: Primeiro incômodo, fora: compra o aparelho ou pega as chaves do apartamento (dossiê B5a)
- Ponto do caminho: O fato que faz agir, fora: a chegada do calor (análise: dossiê B5a + dossiê B7)
- Ponto do caminho: Busca, atua: pergunta a um conhecido ou procura no Google e no mapa (dossiê C1)
- Ponto do caminho: Orçamento, vazamento: pede o preço e pergunta do material. Alerta: quem chega pelo Google pede preço e some, e a empresa volta a falar uma vez só (análise: dossiê C3 + dossiê C7 + dossiê C8)
- Ponto do caminho: Visita, atua: a empresa vê o local antes de instalar (dossiê C11)
- Ponto do caminho: Instalação, atua: hora marcada, casa limpa e foto do serviço pronto (dossiê C9 e C10)
- Ponto do caminho: Limpeza anual, vazamento: um ano depois o cliente devia voltar para a limpeza. Alerta: quase nunca dá tempo de lembrar, e é o serviço que mais dá lucro (análise: dossiê B3 + dossiê C9)
- Quem pesa: O casal, decide, anel 0: decide junto e paga (dossiê B5a)
- Quem pesa: Quem indicou, influencia, anel 1: um conhecido que já instalou com a empresa (dossiê C1)
- Quem pesa: O síndico, influencia, anel 2: a regra do condomínio diz onde o aparelho pode ficar (pesquisa [6])
- Trabalho prático: ter o ar funcionando antes do calor, com a parede certa e sem surpresa no preço (análise: dossiê B5b + dossiê C7)
- O que isso pede: dizer antes da visita o que entra no preço e o que pode mudar
- Trabalho ser visto: como quem resolveu bem a casa nova, sem cair no barato que sai caro (hipótese: a escolha entre a empresa e o técnico do grupo acontece à vista dos vizinhos)
- O que isso pede: um orçamento claro, que ele possa mostrar ao parceiro e comparar
- Trabalho sentir: tranquilidade de que ninguém vai sujar a casa nem cobrar a mais (análise: dossiê D6 + pesquisa [3] + pesquisa [7])
- O que isso pede: tom calmo e concreto, com a foto do serviço pronto
- O que isso muda na venda: a venda se perde no orçamento, antes da visita, e não na instalação, onde a empresa é forte (análise: dossiê C3 + dossiê C8 + dossiê C10)
- O que o dono não está vendo: quem pede orçamento e some recebe uma tentativa só, então cada pedido do Google vale uma chance (análise: dossiê C3 + dossiê C8)

## 4. Forças

- Empurra: calor chegando, peso 3 (dossiê B7)
- Empurra: aparelho novo parado na caixa, peso 2 (dossiê B5a)
- Empurra: histórias de instalação suja, peso 1 (pesquisa [3])
- Puxa ausente: saber o preço inteiro antes de decidir, peso 3 (análise: dossiê C3 + pesquisa [5])
- Medo: não saber se o preço vai mudar, peso 3 (dossiê C7)
- Medo: quebrar a parede no lugar errado, peso 2 (dossiê B5b)
- Costume que segura: chamar o técnico do grupo do bairro porque é mais barato, peso 2 (dossiê B8)
- Inclinação: segura: para quem chega pelo Google, o maior peso é a dúvida do preço, e a resposta que ele recebe é só um número (análise: dossiê C3 + dossiê C7)
- Como virar: Tirar peso da dúvida: mandar o orçamento fechado, com o material incluído, antes do valor
- Como virar: Pôr o peso que falta: mostrar a foto do serviço pronto e a garantia de um ano no primeiro contato
- Como virar: Responder a parede: dizer que a visita vem antes justamente para não furar no lugar errado

## 5. Nível de consciência por grupo

| Degrau | Sinal que mostra | Quem da empresa está aqui | O que a mensagem deve fazer |
|---|---|---|---|
| 1 não percebe o problema | acha que dá para aguentar o calor sem ar (hipótese: nenhuma fonte fala de quem ainda não pensa em instalar) | nenhum público identificado | nada de serviço: o que muda no primeiro verão com o ar instalado direito |
| 2 sente a dor, não conhece a saída | comprou o aparelho ou mudou e não sabe quem chamar (dossiê B5a) | quem busca no Google e no mapa | nomear o medo da parede e da sujeira e mostrar que existe instalação sem isso |
| 3 conhece saídas, não escolheu | compara o preço com o técnico do bairro e a loja (dossiê C3) | quem chega pelo Google | o que o preço inclui, antes do valor, e por que a visita vem antes |
| 4 conhece a empresa, não decidiu | chega sabendo o nome da empresa (dossiê C1) | quem chega por indicação | tirar a dúvida do material e marcar a data |
| 5 pronto para comprar | pergunta a data e a forma de pagamento (hipótese: o dossiê não descreve o fechamento) | depois da visita | confirmar a janela de duas horas, sem reexplicar nada |

- Degrau em foco: 3, porque a venda que a empresa perde está ali: quem chega pelo Google compara e recebe só um número, e quem chega por indicação já está no 4 e fecha quase sozinho (análise: dossiê C1 + dossiê C3 + dossiê C7)

## 6. Como pensa

- Acredita: que todo instalador cobra um preço e depois aparece material a mais (análise: dossiê C7 + pesquisa [1] + pesquisa [7])
- Teme: quebrar a parede no lugar errado (dossiê B5b)
- Teme: pó e sujeira pela casa depois da obra (pesquisa [3])
- Teme: cobrança extra que não estava no orçamento (pesquisa [7])
- Deseja: ar funcionando antes do calor, sem faltar no trabalho (dossiê B5b)
- Deseja: chegar ao fim do dia com a casa como estava (dossiê B5a e D6)
- Teste do espelho: bate demais: hora marcada é o que o dono mais preza e como quer ser lembrado, e é natural supor que é também o que o cliente mais preza; mas as dúvidas e queixas públicas falam mais do preço que muda do que da espera (hipótese: nenhum cliente foi ouvido e a ordem do que pesa mais sai das respostas do dono e de poucos trechos)

## 7. Onde está

- Já cruza com você: clientes que já instalaram e indicam conhecidos, o canal principal (dossiê C1); quem instalou há um ano e não foi lembrado da limpeza às vezes volta sozinho (análise: dossiê B6 + dossiê C9)
- Como chegar: pedir a indicação na hora de mandar a foto do serviço pronto, com uma mensagem pronta para o cliente encaminhar
- Onde se informa: a busca do Google e o mapa (dossiê C1); páginas de avaliação de instaladores da cidade (pesquisa [3]) (pesquisa [4])
- Como chegar: pedir a quem instalou uma avaliação no mapa contando a hora marcada e a casa limpa
- Onde aprende e compara: fóruns com dúvidas sobre o que a instalação inclui (pesquisa [5]) (pesquisa [6]); a loja que vende o aparelho com instalação básica (pesquisa [1])
- Como chegar: publicar o que o orçamento inclui, com a resposta sobre o condomínio, no perfil do mapa
- Quem escuta: o conhecido que indicou (dossiê C1); o síndico (hipótese: a regra do condomínio passa por ele, e o dossiê não diz se ele recomenda instalador)
- Como chegar: oferecer ao síndico de dois prédios novos uma folha com o que a regra pede e como a empresa instala
- O que isso muda na venda: onde o cliente compara, os fóruns e o perfil do mapa, é onde a dúvida do preço aparece, e a empresa não fala dela ali (análise: dossiê C2 + pesquisa [5] + pesquisa [6])
- O que o dono não está vendo: no apartamento novo, o síndico e o grupo do prédio pesam antes de o cliente procurar instalador (hipótese: num prédio novo, a regra do condomínio e a indicação dos vizinhos chegam antes de qualquer busca)
- O material não alcançou: em que grupos do prédio o cliente pede indicação e se a loja do aparelho recomenda instalador
```

## Conferir

`<PY> .agents/skills/marketing-persona/scripts/estudo.py conferir --etapa 3`

- Saída 0: siga para a etapa 4 e leia só `referencias/etapas/etapa-4-descobertas.md`.
- Saída 1 com o analista: o passo 4 de "Quem faz esta etapa" (os PROBLEMAS voltam a ele UMA vez).
- Saída 1 no plano B, ou PROBLEMA que sobrou depois da correção do analista: corrija cada `PROBLEMA`. Referência que não existe dentro de `(análise: ...)`: tire a referência; se não sobrar nenhuma, a linha vira `(hipótese: razão)`. Inclinação que desmente os pesos: refaça a conta antes de mudar a inclinação.

## O que dizer ao dono

Nada quando o analista respondeu: é trabalho de mesa.

- Plano B (o analista faltou ou falhou), em 1 frase, uma vez só no estudo: "Desta vez a análise saiu sem o modelo de IA mais forte: segue as mesmas regras e as mesmas fontes, mas pode trazer menos descobertas."

## Nunca

- Escrever a análise você mesmo quando o `marketing-analista` respondeu com os dois textos.
- Chamar o `marketing-analista` mais de 2 vezes no estudo (a primeira e UMA de correção), ou chamá-lo de novo depois de ele faltar ou falhar.
- Mudar o texto que o analista devolveu além da linha que um `PROBLEMA` aponta.

- Mudar a ordem dos blocos ou pular um.
- Escrever conclusão sua com marca de evidência: conclusão é `(análise: ...)`.
- Escrever `(hipótese)` sem a razão.
- Pôr numa `(análise: ...)` uma referência que não diz nada do que a linha conclui.
- Pôr no mapa uma alternativa que nenhuma fonte cita.
- Segmentar por idade, renda ou sexo.
- Dar um nível de consciência só para a empresa inteira.
