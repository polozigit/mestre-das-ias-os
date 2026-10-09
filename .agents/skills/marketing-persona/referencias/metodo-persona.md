# Referência: como montar a persona (cliente ideal) de uma PME

Este documento serve de referência para o especialista de IA que monta a persona da empresa do aluno: um dono de empresa brasileira com 20 a 100 funcionários e sem time de pesquisa. A data de referência é 2026-10-08.

O texto usa só afirmações que passaram por verificação adversarial. Quando a regra é síntese ou inferência nossa e não do autor, o trecho traz a marca "(inferência nossa)". Os números entre colchetes remetem à lista de fontes no fim.

Antes de usar, considere o grau de confiança de cada fonte:
- **Fontes primárias** (texto do próprio autor ou do próprio instituto): NN/g, Revella/BPI, Dunford (site), Ulwick/Strategyn, Moesta/Spiek, Hall e o texto de Cooper sobre a origem das personas, lido em espelho de terceiro.
- **Fontes secundárias:** os níveis de consciência de Schwartz (o livro não foi aberto, só duas páginas modernas que concordam entre si), parte de Cooper (Wikipedia, Smashing, Michigan) e a resenha do livro de Dunford.
- **Lacunas:** nenhuma fonte confirmada define "anti-persona" como dimensão. Também não há os níveis de sofisticação de mercado de Schwartz, nem as etapas formais do processo de Cooper.

---

## 1. Especialistas e por que entram

| Especialista | Por que entra | Evidência de autoridade |
|---|---|---|
| Alan Cooper (Goal-Directed Design) | Originou a técnica de personas: arquétipo por objetivo, não por demografia | Texto do próprio Cooper sobre a origem da técnica [1]; primeira persona a partir de entrevistas com 7 a 8 usuários, desde 1983 [3] |
| Nielsen Norman Group (NN/g) | Separa a persona em três abordagens (proto, qualitativa e estatística) e trata validação e revisão | Artigos de Dykes (2025) [6] e Laubheimer (2020) [7]; pesquisa própria com 156 profissionais sobre revisão de personas [9] |
| Adele Revella / Buyer Persona Institute | Persona da decisão de compra (5 anéis), feita a partir de entrevistas com compradores recentes | Buyer Persona Manifesto [13] e ebook [14] publicados pelo instituto; serviço de validação por survey [15] |
| April Dunford | Cliente de melhor ajuste (best-fit) derivado do posicionamento e das alternativas reais | Método publicado no próprio site [17][18][19][21]; autora de Obviously Awesome (resenha [20]); ligou para 100 clientes para entender o uso [17] |
| Clayton Christensen (com Hall, Dillon, Duncan) | Jobs to Be Done: descreve o cliente pela situação e pelo progresso buscado | Artigo no MIT Sloan [24], caso do milkshake na HBS Working Knowledge [25], livro Competing Against Luck [26] |
| Anthony Ulwick (Strategyn) | Outcome-Driven Innovation: resultados desejados mensuráveis e lacuna entre importância e satisfação | A página biográfica descreve o desenvolvimento do método com conjoint, análise fatorial e de cluster [30]; artigo do próprio autor [31] |
| Bob Moesta e Chris Spiek (Re-Wired Group) | Switch Interview e 4 forças: o que empurra, puxa e segura a troca | Site JTBD Radio dos autores [33] e palestra de Moesta no Business of Software Europe 2024 [36] |
| Eugene Schwartz | Cinco níveis de consciência do cliente | Atribuído a Breakthrough Advertising (1966) por duas fontes secundárias que concordam [38][39]; o livro não foi aberto |
| Erika Hall (Mule Design) | Pesquisa enxuta orientada a decisão, com entrevista e síntese | Autora de Just Enough Research, 2a edição anunciada pela A Book Apart [44]; artigos próprios [40][41][42] |

---

## 2. Dimensões de uma persona completa

Regras gerais desta seção:
- Use poucos atributos e mantenha só os que mudam uma decisão. Detalhe irrelevante é anti-padrão [6], e descrições com muitos atributos descrevem poucas pessoas reais [3].
- Cada campo da persona registra a fonte e o status: hipótese do dono, dado do CRM ou fala de cliente (inferência nossa).

| Dimensão | O que responde | De qual método vem | Fonte de dados típica numa PME |
|---|---|---|---|
| Perfil da pessoa (papel e comportamento) | Que papel a pessoa tem no uso ou na compra, como se comporta e qual o nível de experiência com o tipo de solução | Cooper: papel de uso e comportamento, nível de habilidade [1]. NN/g: ocupação, nível de experiência, contexto de uso [6] | Dossiê do dono; cargo ou papel no CRM; conversas de venda |
| Perfil da empresa (B2B) | Setor, região e porte, refinados até um traço concreto ("pequenas empresas" não basta) | Dunford [18] | CRM ou planilha; site e perfis públicos da empresa cliente |
| Decisor e grupo de compra | Quem iniciou a busca, quem participou, quem assina e quem tem peso real | Revella, Buyer's Journey: o ecossistema de pessoas, e quem está no topo pesa menos do que o vendedor supõe [13]. Moesta: quem iniciou pode não ser quem assina [36] | Pergunta ao dono ou ao vendedor; entrevista com o comprador |
| Contexto (circunstância) | Onde, quando e com quem surge a necessidade | Christensen: o job só se define em relação à circunstância [23]; a unidade de análise é a situação [24]. NN/g: contexto de uso [6] | Registros de venda (dia, horário, canal) como ponto de partida [25]; entrevistas |
| Job (progresso desejado) | Que progresso o cliente busca naquela situação, nas dimensões funcional, social e emocional | Christensen [22][23][24]; Ulwick [27] | Entrevistas; motivo de compra registrado no CRM |
| Objetivos e resultados esperados (ganhos) | O que o cliente quer alcançar e como mede o sucesso | Cooper: objetivos acima de funcionalidades [2][4]. Revella, Success Factors: o resultado operacional ou pessoal que o comprador espera [13]. Ulwick: resultados desejados com sintaxe fixa [28][29] | Entrevistas; mini-pesquisa de importância e satisfação [29][31] |
| Situação que empurra (dores) | O que tornou o jeito atual inaceitável | Moesta: push [34]. NN/g: preocupações e necessidades [6]. Ulwick: resultado importante e pouco satisfeito [29] | Conversas de WhatsApp e de venda; reclamações |
| Gatilhos de compra | Por que agora, e o que diferencia quem compra de quem fica no status quo | Revella, Priority Initiatives (não é o mesmo que dor) [13]. Moesta: eventos na linha do tempo [33] | Entrevista com a pergunta "o que aconteceu no dia em que decidiu buscar" [13]; datas do CRM |
| Objeções, ansiedades e hábito | Por que o cliente acha que você não é a melhor opção, que dúvida a novidade traz e que hábito puxa de volta | Revella, Perceived Barriers [13]. Moesta: ansiedade [34] e hábito do presente [35]. Schwartz: objeções no estágio Product Aware [38] | Tickets de suporte [38]; negócios perdidos; perguntas feitas antes da compra |
| Alternativas reais | O que o cliente faria se você não existisse, incluindo planilha, processo manual ou nada | Dunford [17]. Christensen: a concorrência é definida pelo job; atenção às gambiarras [22][24] | Entrevistas; motivo de perda; anúncios de concorrentes [38] |
| Critérios de decisão | O que o cliente compara, o que espera de cada ponto e o que termos vagos como "fácil de usar" significam para ele | Revella, Decision Criteria [13] | Entrevistas; propostas perdidas |
| Jornada (e canais dentro dela) | Etapas da avaliação, do primeiro pensamento à compra, e como o cliente achou e afunilou as opções | Revella [13]; Moesta: First Thought, Passive Looking, Event 1, Active Looking, Event 2, Purchase [33][36]. Nenhuma fonte confirmada trata canal como dimensão própria. Schwartz só diz que canais diferentes podem estar em estágios diferentes [38] | Datas e origem no CRM; entrevista |
| Nível de consciência | O que o cliente já sabe sobre o problema, as soluções e o seu produto | Schwartz [38][39]; equivalente em Moesta: passive looking e active looking [36] | Linguagem do cliente, perguntas pré-compra, anúncios de concorrentes [38] (ver seção 3) |
| Sofisticação de mercado (incompleta) | Quantas promessas parecidas o mercado já ouviu | Schwartz, citado sem definição dos níveis [38] | Anúncios de concorrentes. Marcar como "não definido nas fontes" |
| Linguagem do cliente | Termos e frases exatas, citações literais | Hall [42]; Revella: voz composta e citação literal [13]; NN/g: citação representativa [6]; Schwartz: nomear a dor nas palavras do cliente [38] | WhatsApp, reviews, comentários, mensagens diretas, transcrições [38] |

Fica fora da tabela:
- **Anti-persona:** nenhuma fonte confirmada a define como dimensão. Há regras vizinhas: casos de borda não viram foco [3], o segmento ideal é quem se importa muito com o valor diferenciado [18], e resultados superatendidos pedem redução de custo [31]. Se o especialista registrar "quem não é cliente", marque como inferência nossa.
- **Demografia como explicação:** ver a seção 8.

---

## 3. Níveis de consciência

Ressalva: as fontes são secundárias e concordam entre si [38][39]. A coluna "como reconhecer" é inferência nossa a partir das definições, salvo onde há citação.

| Nível | Definição [38][39] | Como reconhecer nos dados da PME | O que a comunicação deve fazer [38] |
|---|---|---|---|
| Unaware | Não percebe que tem um problema | Raro na base de clientes. Aparece em quem chega sem relatar dor nenhuma (inferência nossa) | Abrir com afirmação surpreendente ou história que revele o problema sem citar o produto; emoção antes de funcionalidade |
| Problem Aware | Sente a dor, mas não sabe que existe solução | Descreve a dor com as próprias palavras, não cita alternativas e pergunta se aquilo "tem jeito" (inferência nossa) | Nomear a dor nas palavras do cliente e sugerir que há solução |
| Solution Aware | Sabe que existem soluções, mas não escolheu | Cita concorrentes ou alternativas e pergunta como funciona (inferência nossa) | Explicar o mecanismo e por que as alternativas falham; o "como" pesa mais que a promessa |
| Product Aware | Conhece a marca, mas não se comprometeu | Pergunta sobre a sua empresa e traz objeções específicas. Tickets de suporte são fonte de objeções reais [38] | Tratar as objeções de frente, com prova em vez de promessa |
| Most Aware | Está pronto e só precisa da oferta certa | Pergunta preço, prazo, pagamento ou condição (inferência nossa) | Começar pela oferta (preço, urgência, garantia), sem reexplicar o produto |

Regras de uso:
1. **Atribuir o estágio por segmento**, e por produto ou canal quando for o caso. Nunca dar um estágio único à empresa inteira. Os estágios não são funil fechado e compradores pulam etapas [38].
2. **Não chutar.** Quem chuta tende a cair nos estágios 3 e 4 [38]. O método é identificar qual crença o leitor precisa já ter para a mensagem fazer sentido [38].
3. **Uma mensagem não serve a todos os estágios.** Anúncio de produto para quem não sabe do problema, ou desconto para quem não está pronto, é desalinhamento [39].
4. **Usar a linha do tempo de Moesta como sinal complementar de prontidão.** No passive looking a pessoa tem espaço mental sem solução; no active looking ela busca ativamente [36].
5. **Validar medindo a conversão por peça, não por conta.** Desalinhamento costuma aparecer depois do clique [38]. Peça de estágio inicial não deve ser julgada por ROAS de último clique [38].

---

## 4. Etapas consolidadas do processo

**Ponto em que todos convergem:**
- a persona nasce de dados reais e de conversa com quem comprou [1][6][13][24][36][42];
- a hipótese interna é só ponto de partida [4][7];
- agrupa-se por padrão, não por história isolada [12][46];
- valida-se e revisa-se [9][18].

A sequência pedida não tem uma etapa de conversa com clientes. Como ela é o centro de todos os métodos, entra aqui como etapa 5. Se a empresa não fizer nenhuma conversa, a persona fica no máximo como "parcialmente validada" (seção 6).

### Etapa 1. Dossiê do dono, que vira proto-persona
- **Entra:** as 71 respostas do questionário.
- **Faz:**
  - Escrever primeiro as perguntas que a persona precisa responder, e só depois escolher fontes [41].
  - Preencher as dimensões da seção 2 como hipótese. A proto-persona usa o conhecimento e as suposições do time e deve ser tratada como hipótese a validar [7]. Persona feita com informação de segunda mão é provisória [4].
  - Priorizar as lacunas por risco e oportunidade [46].
- **Sai:** proto-persona com cada campo marcado como "hipótese do dono" e lista priorizada de lacunas.
- **Risco:** virar câmara de eco das premissas do dono [7].

### Etapa 2. Pesquisa pública
- **Entra:** setor, oferta e concorrentes citados no dossiê.
- **Faz:**
  - Ler o que já existe antes de qualquer pesquisa original [41]. Literatura ajuda a preencher lacunas [28].
  - Mapear as alternativas reais, incluindo o status quo, e descartar concorrentes que nunca aparecem nas vendas [17].
  - Coletar anúncios de concorrentes para ver em que estágio a categoria está saturada [38].
  - Coletar a linguagem pública de clientes (reviews, comentários) [38].
- **Sai:** mapa de alternativas, hipótese de estágio de consciência por segmento e banco de linguagem pública.
- **Limite:** relato de praticante indica que só 20% a 40% dos critérios importantes dos compradores aparecem nos sites das empresas [16]. Pesquisa pública não substitui a conversa com cliente.

### Etapa 3. Dados de clientes (CRM ou planilha)
- **Entra:** export do CRM ou a planilha padrão da seção 5.
- **Faz:**
  - Buscar padrões de quando, como e com quem a compra acontece. No caso do milkshake, os registros mostraram 40% das vendas de manhã e apontaram o que investigar [25].
  - Separar negócios ganhos e perdidos, incluindo os perdidos para "sem decisão" (cerca de 25% no B2B, segundo Dunford) [17].
  - Agrupar por similaridade em vários atributos [12].
  - Testar se cada segmento candidato tem comportamento claramente diferente e tamanho relevante [10].
  - Listar os compradores recentes [13].
- **Sai:** segmentos candidatos, lista de compradores recentes para conversa e números de base para a validação.
- **Limite:** dado de comportamento mostra o padrão, não a causa. Demografia correlaciona mas não explica a compra [25].

### Etapa 4. Perguntas ao dono (lacunas)
- **Entra:** as lacunas que sobraram das etapas 1 a 3.
- **Faz:**
  - Perguntar só o que importa: quem comprou recentemente, quem decidiu e quem mais participou [13]. Para achar candidatos, começar pelos vendedores [13].
  - Usar a pergunta de prioridade de Dunford: se o futuro da empresa dependesse de vender o máximo neste mês, em quem focariam e por quê [18].
  - Fazer perguntas abertas e não indutoras [42].
- **Sai:** lacunas fechadas ou marcadas como "não sabido" e contatos autorizados para conversa.

### Etapa 5. Conversas com clientes recentes
- **Entra:** 6 a 10 compradores que decidiram nos últimos meses [13].
- **Faz:**
  - Conversas abertas de cerca de 30 minutos, com follow-ups e gravação [13]. Moesta usa cerca de 45 minutos de conversa [36].
  - Reconstruir a linha do tempo de uma compra real [37]. Perguntar o que aconteceu no dia em que decidiu buscar, como achou e afunilou opções e quem mais participou [13].
  - Ajustar o roteiro depois de cerca de 6 entrevistas [13].
  - Não tomar o que o cliente declara como se fosse o comportamento dele [36].
- **Divisão de papéis (inferência nossa):** a IA prepara o roteiro, transcreve e analisa; quem conversa é o dono ou alguém da equipe.
- **Sai:** transcrições e citações literais.

### Etapa 6. Montagem
- **Entra:** saídas das etapas 1 a 5.
- **Faz:**
  - Revisar as entrevistas juntas, achar temas, anotar a linguagem exata e agrupar por tipo de cliente [42].
  - Organizar os achados nos 5 anéis [13], no job funcional, social e emocional com a circunstância [23] e nas 4 forças [33].
  - Separar padrão recorrente de história individual [46].
  - Dividir ou unir personas comparando os anéis [14].
  - Ter uma persona principal [2] e proibir a "persona elástica" [3].
  - Atribuir estágio de consciência por segmento [38].
  - Registrar como e por que a persona foi criada e que decisões ela deve informar [8].
- **Sai:** persona(s) com evidência e status em cada campo.

### Etapa 7. Validação
Ver a seção 6.
- **Sai:** status (proto, parcial ou validada), data da versão e gatilhos de revisão.

---

## 5. Fontes de dados e o que extrair

| Fonte | O que extrair | Base |
|---|---|---|
| Dossiê do dono | Hipóteses para todas as dimensões; quem são os compradores recentes | [7][13] |
| Site, redes e reviews públicos | Linguagem do cliente, objeções públicas | [38] |
| Anúncios de concorrentes | Estágio de consciência saturado na categoria; pistas de sofisticação | [38] |
| CRM ou planilha | Padrões de quando e como compram, ganhos e perdidos, segmentação por persona para validar | [6][9][17][25] |
| Conversas de WhatsApp e de venda | Dores com as palavras do cliente, perguntas pré-compra, objeções | [38][13] |
| Tickets de suporte e reclamações | Objeções reais; validação da persona | [38][9] |
| Pesquisa pós-compra ou mini-survey | Linguagem; importância e satisfação; filtro para recrutar entrevistados | [38][31][37] |
| Entrevistas com compradores recentes | Fonte central: gatilho, barreiras, critérios, jornada, linguagem | [13][36][42][7] |
| Vendedores | Indicação de candidatos para entrevista (nunca como substituto da entrevista) | [13] |

### Colunas mínimas da planilha padrão de clientes

Ficam fora da planilha (regra do produto, inferência nossa):
- nome, CPF ou CNPJ, telefone, e-mail e endereço. O contato fica no CRM e a planilha usa um código;
- qualquer dado pessoal sensível: saúde, religião, origem, orientação, opinião política, biometria.

| Coluna | Por que | Base |
|---|---|---|
| `id_cliente` (código) | Contar quantos clientes repetem cada padrão sem expor a pessoa | Operacional (inferência nossa) |
| `tipo_cliente` (PF ou PJ) | Separar persona de pessoa e de empresa B2B | Operacional |
| `setor` (PJ) | Traço amplo de segmento, a refinar depois | [18] |
| `porte_faixa_funcionarios` (PJ) | Idem | [18] |
| `regiao` (cidade/UF) | Idem | [18] |
| `papel_decisor` e `papel_iniciador` (função, não nome) | Grupo de compra: quem iniciou pode não ser quem assina | [13][36] |
| `produto_ou_oferta` | Persona de escopo estreito dá dados mais ricos | [8] |
| `data_primeiro_contato` | Linha do tempo da compra e tempo de ciclo | [33] |
| `data_compra` ou `data_perda` | Identificar compradores recentes para entrevistar | [13] |
| `origem` (como conheceu) | Jornada; o estágio de consciência pode variar por canal | [13][38] |
| `status` (ativo, recomprou, cancelou, perdido, sem_decisao) | Analisar ganhos e perdidos, incluindo "sem decisão" | [17] |
| `motivo_compra` (texto livre, palavras do cliente) | Gatilho e push; banco de linguagem | [13][34][42] |
| `alternativa_anterior` (o que usava ou usaria) | Alternativas reais, incluindo gambiarra e status quo | [17][24] |
| `objecao_principal` | Barreiras percebidas e ansiedade | [13][34] |
| `motivo_perda_ou_cancelamento` | Barreiras; perdas para o status quo | [13][17] |
| `valor_faixa` | Verificar se o segmento tem comportamento diferente | [10] |
| `satisfacao` (nota simples) | Resenha secundária: best-fit são os mais satisfeitos [20]; base para importância contra satisfação [29] | [20][29] |
| `reclamacoes_tema` | Objeções reais; validação por dados de suporte | [38][9] |
| `persona_atribuida` | Segmentar dados por persona para validar; cliente sem persona indica persona nova | [6][9] |
| `estagio_consciencia_entrada` | Diagnóstico de consciência por segmento | [38] |
| `aceita_conversa` (sim/não) | Recrutar compradores recentes para entrevista | [13] |

---

## 6. Validação

### Proto-persona e persona validada

| Status | Quando se aplica | Base |
|---|---|---|
| Proto (hipótese) | Feita só com dossiê do dono e/ou pesquisa pública | [4][7] |
| Parcialmente validada | Proto confrontada com o CRM ou planilha, mas sem conversas com clientes | [6][9][10] (inferência nossa sobre o rótulo) |
| Validada (qualitativa) | Cumpre o critério mínimo abaixo | Síntese nossa das fontes citadas |
| Monitorada | Validada e com dados segmentados por persona de forma contínua | [6][9] |

### Critério mínimo para "validada"
Síntese nossa; cada item tem fonte.
1. Pelo menos 6 conversas com compradores recentes. Revella fala em 6 a 10 [13], o ebook em 6 a 8 [14], e a NN/g em 5 a 30, até as novas trarem pouco de novo [7].
2. O padrão se repete entre as conversas e não depende de uma história isolada [46].
3. O CRM confirma: o segmento tem comportamento diferente e tamanho relevante [10], e não sobra grupo grande de clientes sem persona [9].
4. A persona funciona como ferramenta de decisão: a equipe consegue perguntar "o que ela faria" diante de uma escolha [1].
5. Cada campo tem evidência e status; detalhes que não mudam decisão foram removidos [6].
6. A persona tem data de versão e gatilhos de revisão: mudança no negócio, no produto, nos concorrentes ou na base [9][18].

### Reforços opcionais
- **Mini-pesquisa de importância e satisfação** de 5 a 15 resultados. A fórmula é oportunidade = importância + (importância - satisfação), na escala de 1 a 5; a partir de 10 o resultado é subatendido [31]. Ulwick usa de 180 a 1.200 respondentes [31], então numa PME o resultado é só indicativo e deve ser declarado assim (inferência nossa).
- **Survey cruzado com entrevista ou com dado de comportamento.** Um survey ruim não avisa que é ruim [43].
- **Comunicação:** testar o posicionamento em conversas reais de venda [18]. Bom posicionamento faz o comprador presumir coisas verdadeiras [17]. Medir a conversão por peça para validar o estágio de consciência [38].

### Cautelas
- A literatura aponta que não existe procedimento reproduzível para derivar personas [3]. Manter poucos atributos.
- Quando a persona e os dados não batem, o problema pode ser de oferta ou de desenho, e não persona velha. Pesquisar antes de revisar [9].

---

## 7. Anti-padrões

1. **Persona elástica:** cada pessoa da equipe redefine "o cliente" do jeito que lhe convém [3].
2. **Foco em caso de borda** em vez do arquétipo principal [3].
3. **Persona como retrato biográfico** (aparência, hobbies) que não diz nada útil [13].
4. **Demografia como explicação.** Ela correlaciona, mas não explica a compra [25]. Segmentar por características do cliente ou do produto prevê mal o comportamento [24].
5. **Preencher a persona com o palpite do time comercial** em vez de entrevistar [13]. Basear-se em opinião interna [6]. Decidir por opinião, pensamento de grupo ou wishful thinking [45].
6. **Proto-persona tratada como verdade:** vira câmara de eco [7].
7. **Persona no lugar de teste com cliente real**, detalhe irrelevante e slogan "esperto" demais [6].
8. **Persona criada e não usada**, sem apoio da liderança, feita em silo ou usada para um fim diferente daquele para o qual foi feita [11].
9. **Concorrentes fantasma:** listar todo concorrente possível em vez das alternativas que aparecem nas vendas [17].
10. **Segmento amplo demais** ou preso ao mercado de origem [18].
11. **Tratar a persona ou o posicionamento como "feito e acabado"** e confundir posicionamento com mensagem [18][21].
12. **Confiar no que o cliente declara** sem olhar o comportamento [36].
13. **Entrevista com pergunta indutora ou fechada**, entrevistador falando de si, insistir em sessão improdutiva [42].
14. **Survey mal desenhado.** Amostra grande não garante resultado certo; o que importa é a amostra ser representativa [43].
15. **Focus group** [44].
16. **Pesquisa só para constar** (research theater) [45]. Começar pela atividade antes de definir a pergunta [41].
17. **Não definir o que é necessidade do cliente**, o que faz a segmentação por necessidade falhar [32]. Falar em "necessidade latente": definida como resultado mensurável, ela pode ser perguntada [28].
18. **Chutar o estágio de consciência**, dar um estágio único à marca inteira ou julgar todos os estágios por uma métrica só [38].

---

## 8. Divergências entre os especialistas e escolha recomendada

| Ponto | Divergência | Recomendação |
|---|---|---|
| Unidade de descrição | Pessoa arquetípica (Cooper [1], NN/g [6]); decisão de compra (Revella [13]); situação e job (Christensen [24], Ulwick [27]); segmento derivado do valor (Dunford [18]) | Persona = pessoa ou decisor ancorado em job, circunstância e decisão de compra. A seção 2 combina as três camadas |
| Demografia | A NN/g lista nome, idade e foto como atributos típicos [6]; Revella condena o retrato biográfico [13]; Christensen nega a demografia como causa [25]; Cooper segmentou por objetivo, tarefa e habilidade [1] | Dados demográficos e firmográficos só servem para encontrar e reconhecer o cliente, nunca para explicar a compra |
| Ponto de partida | Dunford começa pelas alternativas e deriva o cliente ideal na etapa 4 [17][18]; a resenha do livro dá ordem diferente [20]; os demais partem do cliente | Seguir a ordem do site de Dunford [17] dentro da etapa 2 (alternativas) e usar o "quem se importa muito" como filtro na montagem |
| Survey | Ulwick: quantitativo de 180 a 1.200 respondentes [31]; NN/g estatística com 100 ou mais [7]; BPI valida por survey [15]; Hall: a ferramenta mais perigosa [43]; Spiek: survey só para recrutar [37] | Numa PME, sem survey grande. Mini-pesquisa opcional, declarada indicativa e cruzada com entrevista |
| Quantas entrevistas | Cooper 7 a 8 [3]; NN/g 5 a 30, até saturar [7]; Revella 6 a 10 [13] ou 6 a 8 [14] | Mínimo de 6, alvo de 8 a 10, parar quando as novas pararem de trazer novidade |
| Duração da entrevista | Revella cerca de 30 min [13]; Moesta cerca de 45 min de conversa numa sessão de 1h [36] | 30 a 45 min, começando pela reconstrução da linha do tempo |
| Quem entrevistar | Revella: quem decidiu nos últimos meses [13]; Moesta: quem já comprou, não prospects, e quem iniciou a mudança [36]; NN/g: usuários em geral [7] | Compradores recentes, incluindo quem iniciou e quem assinou; perdidos via motivo de perda no CRM |
| Número de personas | Cooper: projetar para uma persona específica [2]; NN/g: o número sai dos clusters, sem número fixo [8], e o workshop gera de 3 a 6 [7]; Revella: dividir ou unir comparando os anéis [14] | Uma persona principal por oferta; dividir só quando os anéis diferem de fato |
| Forma de validação | Uso como ferramenta de decisão (Cooper [1]); analytics (NN/g [6][9]); survey (BPI [15]); estatística (Ulwick [31]); teste em venda (Dunford [18]); conversão por peça (Schwartz [38]) | Critério mínimo da seção 6 (padrão nas conversas + CRM), com teste em venda e conversão por peça como reforço |
| Revisão | NN/g: por gatilho, sem calendário fixo, e quem revisava trimestralmente ou mais avaliava melhor o impacto [9]; Dunford: datar e revisitar [18]; Revella: nunca parar de entrevistar [13] | Revisar por gatilho de negócio ou de base e, no mínimo, a cada trimestre, com data de versão |

---

## 9. Afirmações refutadas (não repetir)

1. **Não afirmar** que Cooper admitiu que criar personas exige "semanas de estudo e meses de prática" ou que falta um guia completo. As frases parecem ser do crítico Lombardi, não de Cooper.
2. **Não afirmar** que o artigo de Dykes (NN/g, 2025) tem 4 passos começando por "pesquisar usuários". O artigo descreve 5 passos de criação (identificar características, agrupar, fundir ou descartar, definir papéis distintos, acrescentar detalhes), e a pesquisa é uma fase anterior.
3. **Não atribuir ao ebook de Revella e Ross** os anti-padrões "não corrigir o entrevistado" e "não presumir que o que importa à empresa importa ao comprador". Essas ideias estão no Manifesto. O ebook só sustenta que a primeira resposta é a que você já conhecia e que o insight vem dos follow-ups.
4. **Não atribuir ao ebook** a frase de que segmentar por insight exige metade das personas. Ela está no Manifesto. O ebook só critica segmentar por setor ou porte e propõe segmentar pela forma de persuasão.
5. **Não afirmar** que Revella define o recorte como "grau de consideração, não B2B contra B2C" nem usar o exemplo da "revista no caixa". O ebook só diz que o método é mais fácil com compradores que investiram tempo considerável e dá o exemplo do livro na Amazon.
6. **Não ligar "entrevistar tarde demais" a viés de recência em Moesta.** Ele liga viés de recência a entrevistar perto demais do evento e recomenda entrevistar compras pequenas mais perto da compra.
7. **Não chamar a edição de 2024 de Just Enough Research de "2a edição (Mule Books)".** A 2a edição é de 2019, pela A Book Apart. A de 2024 é uma reedição pela Mule Books.

---

## Fontes

1. Alan Cooper, "The Origin of Personas" (espelho de terceiro). https://www.strehle.de/tim/?p=264. Texto de 2003/2008; acessado em 2026-10-08.
2. University of Michigan, página de curso citando Cooper. https://pne.people.si.umich.edu/kellogg/033b.html. Acessado em 2026-10-08.
3. Wikipedia, "Persona (user experience)". https://en.wikipedia.org/wiki/Persona_(user_experience). Acessado em 2026-10-08.
4. Smashing Magazine, "A Closer Look at Personas, Part 1". https://www.smashingmagazine.com/2014/08/06/a-closer-look-at-personas-part-1/. 2014-08; acessado em 2026-10-08.
5. University of Calgary, material de curso sobre personas. https://saul.cpsc.ucalgary.ca/pmwiki.php/HCIResources/LecturesPersonas. Acessado em 2026-10-08.
6. NN/g (Dykes), "Personas". https://www.nngroup.com/articles/persona/. 2025-10-03; acessado em 2026-10-08.
7. NN/g (Laubheimer), "Persona Types". https://www.nngroup.com/articles/persona-types/. 2020-06-21; acessado em 2026-10-08.
8. NN/g, "Persona Scope". https://www.nngroup.com/articles/persona-scope/. 2020-01-12; acessado em 2026-10-08.
9. NN/g, "Revising Personas". https://www.nngroup.com/articles/revising-personas/. 2016-02-14; acessado em 2026-10-08.
10. NN/g, "Analytics and Persona Segments". https://www.nngroup.com/articles/analytics-persona-segment/. 2014-11-30; acessado em 2026-10-08.
11. NN/g, "Why Personas Fail". https://www.nngroup.com/articles/why-personas-fail/. 2018-01-28; acessado em 2026-10-08.
12. NN/g, vídeo "Creating Personas: Sorting Rocks". https://www.nngroup.com/videos/creating-personas-sorting-rocks/. 2018-09-21; acessado em 2026-10-08.
13. Adele Revella, Buyer Persona Manifesto, 2a ed. (PDF). https://www.buyerpersona.com/wp-content/uploads/2016/02/Buyer-Persona-Manifesto-2016.pdf. 2016; acessado em 2026-10-08.
14. Revella e Ross, ebook de content marketing (PDF). https://www.buyerpersona.com/wp-content/uploads/2016/02/Content-Marketing-eBook-0116.pdf. 2016; acessado em 2026-10-08.
15. Buyer Persona Institute, página inicial. https://www.buyerpersona.com/. Acessado em 2026-10-08.
16. Blog do BPI, relato de praticante sobre personas B2B. https://buyerpersona.com/blog/practitioner-perspective-the-6-most-important-surprising-things-ive-learned-from-doing-b2b-buyer-personas. Data de publicação não confirmada; acessado em 2026-10-08.
17. April Dunford, "A Quickstart Guide to Positioning". https://www.aprildunford.com/post/a-quickstart-guide-to-positioning. Data de publicação não confirmada; acessado em 2026-10-08.
18. April Dunford, "A Product Positioning Exercise". https://www.aprildunford.com/post/a-product-positioning-exercise. Acessado em 2026-10-08.
19. April Dunford, "Positioning vs Strategy vs Vision". https://www.aprildunford.com/post/positioning-vs-strategy-vs-vision. Acessado em 2026-10-08.
20. Yevgeniy Brikman, resenha de Obviously Awesome. https://www.ybrikman.com/blog/2020/01/12/obviously-awesome/. 2020-01-12; acessado em 2026-10-08.
21. April Dunford, "Everything You Know About Positioning Is Wrong". https://www.aprildunford.com/post/everything-you-know-about-positioning-is-wrong. Acessado em 2026-10-08.
22. Founding Fuel, "Clayton Christensen on innovation: finding the jobs to be done". https://foundingfuel.com/article/clayton-christensen-on-innovation-finding-the-jobs-to-be-done. Acessado em 2026-10-08.
23. Porchlight Books, excerto de Competing Against Luck. https://porchlightbooks.com/blog/excerpts/competing-against-luck-the-story-of-innovation-and-customer-choice. Acessado em 2026-10-08.
24. Christensen, Anthony, Berstell e Nitterhouse, MIT Sloan Management Review. https://sloanreview.mit.edu/?p=3096. Publicado em 2007 (segundo o levantamento); acessado em 2026-10-08.
25. HBS Working Knowledge, "Clay Christensen's Milkshake Marketing". https://www.library.hbs.edu/working-knowledge/clay-christensens-milkshake-marketing. Acessado em 2026-10-08.
26. Apple Books, Competing Against Luck. https://books.apple.com/us/book/competing-against-luck/id1080332425. Acessado em 2026-10-08.
27. Strategyn, "Jobs-to-be-Done". https://strategyn.com/jobs-to-be-done/. Acessado em 2026-10-08.
28. Strategyn, artigo sobre resultados desejados. https://strategyn.com/?p=17230. Acessado em 2026-10-08.
29. Strategyn, "Customer Needs Through a Jobs-to-be-Done Lens". https://strategyn.com/customer-needs-through-a-jobs-to-be-done-lens/. Acessado em 2026-10-08.
30. Strategyn, página biográfica de Tony Ulwick. https://strategyn.com/tony-ulwick/. Acessado em 2026-10-08.
31. Anthony Ulwick, "What Unmet Needs Should Be Targeted for Growth?", CustomerThink. https://customerthink.com/what-unmet-needs-should-be-targeted-for-growth/. 2016-08-03; acessado em 2026-10-08.
32. Strategyn, "Needs-Based Segmentation". https://strategyn.com/needs-based-segmentation/. Acessado em 2026-10-08.
33. JTBD Radio (Moesta e Spiek), página inicial. https://jobstobedone.org/. Sem data de publicação; acessado em 2026-10-08.
34. JTBD Radio, "Pull and Anxiety". https://jobstobedone.org/radio/pull-and-anxiety/. Sem data de publicação; acessado em 2026-10-08.
35. JTBD Radio, "Forces Friday: Habit of the Present". https://jobstobedone.org/radio/forces-friday-habit-of-the-present/. Sem data de publicação; acessado em 2026-10-08.
36. Bob Moesta, palestra no Business of Software Europe 2024. https://businessofsoftware.org/?p=17159. 2024; acessado em 2026-10-08.
37. JTBD Radio, artigo sobre a Switch Interview. https://jobstobedone.org/?p=887. Sem data de publicação; acessado em 2026-10-08.
38. Selzee, "Eugene Schwartz 5 Levels of Awareness" (fonte secundária). https://selzee.com/eugene-schwartz-5-levels-of-awareness. Acessado em 2026-10-08.
39. Optimize Smart, "Schwartz Five Stages of Awareness in Marketing" (fonte secundária). https://optimizesmart.com/blog/schwartz-five-stages-of-awareness-in-marketing/. Acessado em 2026-10-08.
40. Erika Hall, "You Need More Enough", blog da Mule Design. https://www.muledesign.com/blog/you-need-more-enough. Acessado em 2026-10-08.
41. Erika Hall, "Quick Tips for Picking Design Research Activities", blog da Mule Design. https://www.muledesign.com/blog/quick-tips-for-picking-design-research-activities. Acessado em 2026-10-08.
42. Erika Hall, "Interviewing Humans", A List Apart. https://alistapart.com/article/interviewing-humans/. Acessado em 2026-10-08.
43. Mule Books, amostra de Just Enough Research. https://www.mulebooks.com/just-enough-research/sample. Acessado em 2026-10-08.
44. A Book Apart, anúncio da 2a edição de Just Enough Research. https://abookapart.com/blogs/press/just-enough-research-2nd-edition-is-now-available.html. Acessado em 2026-10-08.
45. Mule Design, "Design Research Right". https://www.muledesign.com/design-research-right. Acessado em 2026-10-08.
46. Mule Design, "Team Research Experience". https://www.muledesign.com/team-research-experience. Acessado em 2026-10-08.

[1]: https://www.strehle.de/tim/?p=264
[2]: https://pne.people.si.umich.edu/kellogg/033b.html
[3]: https://en.wikipedia.org/wiki/Persona_(user_experience)
[4]: https://www.smashingmagazine.com/2014/08/06/a-closer-look-at-personas-part-1/
[5]: https://saul.cpsc.ucalgary.ca/pmwiki.php/HCIResources/LecturesPersonas
[6]: https://www.nngroup.com/articles/persona/
[7]: https://www.nngroup.com/articles/persona-types/
[8]: https://www.nngroup.com/articles/persona-scope/
[9]: https://www.nngroup.com/articles/revising-personas/
[10]: https://www.nngroup.com/articles/analytics-persona-segment/
[11]: https://www.nngroup.com/articles/why-personas-fail/
[12]: https://www.nngroup.com/videos/creating-personas-sorting-rocks/
[13]: https://www.buyerpersona.com/wp-content/uploads/2016/02/Buyer-Persona-Manifesto-2016.pdf
[14]: https://www.buyerpersona.com/wp-content/uploads/2016/02/Content-Marketing-eBook-0116.pdf
[15]: https://www.buyerpersona.com/
[16]: https://buyerpersona.com/blog/practitioner-perspective-the-6-most-important-surprising-things-ive-learned-from-doing-b2b-buyer-personas
[17]: https://www.aprildunford.com/post/a-quickstart-guide-to-positioning
[18]: https://www.aprildunford.com/post/a-product-positioning-exercise
[19]: https://www.aprildunford.com/post/positioning-vs-strategy-vs-vision
[20]: https://www.ybrikman.com/blog/2020/01/12/obviously-awesome/
[21]: https://www.aprildunford.com/post/everything-you-know-about-positioning-is-wrong
[22]: https://foundingfuel.com/article/clayton-christensen-on-innovation-finding-the-jobs-to-be-done
[23]: https://porchlightbooks.com/blog/excerpts/competing-against-luck-the-story-of-innovation-and-customer-choice
[24]: https://sloanreview.mit.edu/?p=3096
[25]: https://www.library.hbs.edu/working-knowledge/clay-christensens-milkshake-marketing
[26]: https://books.apple.com/us/book/competing-against-luck/id1080332425
[27]: https://strategyn.com/jobs-to-be-done/
[28]: https://strategyn.com/?p=17230
[29]: https://strategyn.com/customer-needs-through-a-jobs-to-be-done-lens/
[30]: https://strategyn.com/tony-ulwick/
[31]: https://customerthink.com/what-unmet-needs-should-be-targeted-for-growth/
[32]: https://strategyn.com/needs-based-segmentation/
[33]: https://jobstobedone.org/
[34]: https://jobstobedone.org/radio/pull-and-anxiety/
[35]: https://jobstobedone.org/radio/forces-friday-habit-of-the-present/
[36]: https://businessofsoftware.org/?p=17159
[37]: https://jobstobedone.org/?p=887
[38]: https://selzee.com/eugene-schwartz-5-levels-of-awareness
[39]: https://optimizesmart.com/blog/schwartz-five-stages-of-awareness-in-marketing/
[40]: https://www.muledesign.com/blog/you-need-more-enough
[41]: https://www.muledesign.com/blog/quick-tips-for-picking-design-research-activities
[42]: https://alistapart.com/article/interviewing-humans/
[43]: https://www.mulebooks.com/just-enough-research/sample
[44]: https://abookapart.com/blogs/press/just-enough-research-2nd-edition-is-now-available.html
[45]: https://www.muledesign.com/design-research-right
[46]: https://www.muledesign.com/team-research-experience
