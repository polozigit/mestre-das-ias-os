# Método da identidade da marca

De onde vem cada parte da identidade que a `marketing-identidade` monta. Nada aqui é estrutura inventada pelo time: cada bloco cita a referência publicada que o sustenta. Fontes lidas em 08/10/2026; a lista com link está no fim (§9).

## 1. Quem faz o quê (cargos de referência)

Numa empresa grande, a identidade passa por quatro cadeiras. O Gerente de marca é dono da plataforma, da voz e do manual inteiro, e não escolhe cor nem fonte. O Designer de marca propõe e executa a parte visual (logo, cor, tipografia, imagem, aplicações) e não aprova a própria linha. O Diretor de arte aprova a linha visual. O CMO aprova o posicionamento com o CEO [1]. Na empresa do aluno, o dono acumula as cadeiras que aprovam: o time propõe, o dono diz "sim".

## 2. Comece pelo que já existe (auditoria)

"Corrigir antes de redesenhar": inventariar o que a marca já usa, ver o que é inconsistente entre os canais e preservar o que funciona [1][2]. No visual, logo e cor primeiro [1]. O que o dono já usa (cor do logo, letra do site, jeito de escrever no Instagram) vira regra da identidade, não é trocado "para melhorar".

Onde olhar em cada material [3]:
- **Site:** cores e variáveis do CSS, fontes carregadas (inclusive Google Fonts), a cor `theme-color`, o ícone e o logo do topo, os textos de título e "sobre".
- **Instagram:** não tem CSS. Amostrar as cores dos últimos posts por print (os 9 últimos como bloco mostram a deriva), ler a bio e o tom das legendas.
- **Apresentação PowerPoint:** o tema guarda a paleta (slots `dk1`, `lt1`, `dk2`, `lt2`, `accent1` a `accent6`) e as duas fontes (títulos e texto) [4]. Os textos dos slides mostram as mensagens que a empresa já usa.
- **Logo:** as cores dominantes do arquivo.

## 3. Plataforma da marca

Componentes que se repetem em três ou mais referências [5][6][7][8][9]:
- **Propósito** (por que a empresa existe além do lucro) [9].
- **Posicionamento** pelos 5 componentes de April Dunford: alternativas que o cliente tem, atributos únicos, valor que esses atributos entregam (com prova), cliente-alvo e categoria. A frase de posicionamento é saída, não ponto de partida [5][1].
- **Promessa e proposta de valor** (benefícios funcionais, emocionais e de autoexpressão) [7].
- **Valores** (até 4) e **o que a marca não é** [6][1].
- **Essência** em poucas ideias (núcleo de 3 a 5 ideias de Aaker; mantra de Keller) [7][8].
Missão e visão só entram se o dono já tem (aparecem em poucas fontes) [6].

## 4. Personalidade e arquétipo

Personalidade: 3 a 5 palavras, ligadas ao dossiê e à persona [6]. Arquétipo: os 12 de Margaret Mark e Carol Pearson ("O Herói e o Fora-da-lei", 2001), agrupados em 4 motivações [10]:

| Motivação | Arquétipos |
|---|---|
| Estabilidade e controle | Criador, Prestativo, Governante |
| Pertencimento e prazer | Cara comum, Amante, Bobo da corte |
| Risco e maestria | Herói, Fora da lei, Mago |
| Independência e realização | Inocente, Explorador, Sábio |

Limites publicados: a teoria foi construída com evidência norte-americana e o teste no Brasil foi exploratório [10]; "um arquétipo principal e um secundário" é convenção de quem aplica, não regra do livro. Por isso o arquétipo entra como linguagem para descrever a personalidade, sempre `(proposta do time)`, nunca como fato.

## 5. Sistema visual

- **Logo:** versões (principal, ícone, positiva e negativa para fundo claro e escuro), área de proteção medida pelo próprio logo, tamanho mínimo, usos proibidos (esticar, girar, trocar cor, compor com outro desenho) [11][1].
- **Cores:** função de cada cor (principal, apoio, destaque, fundo, texto) com HEX, RGB e CMYK aproximado [1]. Contraste por número, WCAG 2.2: texto normal 4,5 : 1, texto grande e componente 3 : 1 [12]. Proporção de uso 60-30-10 (base, secundária, destaque) é orientação, não medida [13].
- **Tipografia:** no máximo duas famílias (títulos e texto) e uma reserva do sistema; licença conferida (Google Fonts tem licença aberta) [1].
- **Imagem e elementos:** estilo de foto, ícones e grafismos; imagem por IA só como rascunho, nunca o logo [1].
- **Aplicações:** cada regra com exemplo certo e errado; um manual "só de logo" não é manual [1].

## 6. Tom de voz

- **Quatro escalas** de Nielsen Norman Group: formal ou casual, sério ou engraçado, respeitoso ou irreverente, factual ou entusiasmado. Escolher a posição em cada uma, listar poucas palavras de tom e as de anti-tom, testar com leitores reais [14].
- **Voz constante, tom que muda** com a situação e o estado do leitor (boas-vindas, venda, reclamação, cobrança) [15][16].
- **Traços com limite:** "somos X, mas não Y" [17][15].
- **Vocabulário:** palavras a usar e a evitar (jargão, termo frio em erro) [17][18].
- **Exemplos certo e errado** por canal [17].

## 7. Tokens para o sistema

A identidade sai também em `empresa/marca/tokens.json`, no formato do W3C Design Tokens Community Group, versão estável 2025.10 (28/10/2025; é relatório de grupo comunitário, não padrão W3C). Cor: `$type: "color"` e `$value` com `colorSpace` "srgb", `components` de 0 a 1 e `hex` de 6 dígitos [19][20]. É esse arquivo que a etapa de aplicar a marca no sistema lê.

## 8. Marcas de origem

Cada linha diz de onde veio: `(dossiê X.Y)`, `(persona)`, `(site [n])`, `(instagram [n])`, `(apresentação [n])`, `(logo [n])`, `(pesquisa [n])`, `(proposta do time)` ou `(hipótese)`. O `[n]` aponta para a seção Fontes do documento, com o endereço ou arquivo e a data em que foi visto.

## 9. Fontes

- [1] Pacotes dos cargos Gerente de marca, Designer gráfico e de marca, Diretor de arte e CMO (onda marketing do Mestre das IAs, 07/10/2026), playbooks de auditoria, plataforma, voz e tom, cor, tipografia, logo e manual.
- [2] Frontify. Brand audit. https://www.frontify.com/en/blog/brand-audit. Acessado em 2026-10-07.
- [3] ScrapeGraphAI. Extract branding data from any website. https://scrapegraphai.com/blog/extract-branding-data-from-any-website. Acessado em 2026-10-08.
- [4] python-pptx. DML color analysis. https://python-pptx.readthedocs.io/en/latest/dev/analysis/dml-color.html. Acessado em 2026-10-08.
- [5] April Dunford. A quickstart guide to positioning. https://www.aprildunford.com/post/a-quickstart-guide-to-positioning. Acessado em 2026-10-07.
- [6] Frontify. Brand platforms. https://www.frontify.com/en/guide/brand-platforms. Acessado em 2026-10-07.
- [7] Umbrex. Aaker Brand Identity Model. https://umbrex.com/resources/frameworks/marketing-frameworks/aaker-brand-identity-model/. Acessado em 2026-10-08.
- [8] Branding Strategy Insider. The language of branding: brand essence. https://brandingstrategyinsider.com/the-language-of-4/. Acessado em 2026-10-08.
- [9] Simon Sinek. Golden Circle. https://simonsinek.com/golden-circle/. Acessado em 2026-10-08.
- [10] Daniel Kamlot e Pedro de Queiroz Calmon. Os arquétipos na gestão de uma marca. Intercom 40(1), 2017. https://scielo.br/j/interc/a/LjBTGmfHC8LXykHck3nnjHf/?lang=en. Acessado em 2026-10-08.
- [11] Atlassian Design System. Logos. https://atlassian.design/foundations/logos. Acessado em 2026-10-08.
- [12] W3C. WCAG 2.2, critérios 1.4.3 e 1.4.11. https://www.w3.org/TR/WCAG22/#contrast-minimum. Acessado em 2026-10-08.
- [13] freeCodeCamp. The 60-30-10 rule in design. https://www.freecodecamp.org/news/the-60-30-10-rule-in-design/. Acessado em 2026-10-08.
- [14] Kate Moran, Nielsen Norman Group. The four dimensions of tone of voice (2016, revisado em 2023). https://www.nngroup.com/articles/tone-of-voice-dimensions/. Acessado em 2026-10-08.
- [15] Mailchimp Content Style Guide. Voice and tone. https://styleguide.mailchimp.com/voice-and-tone/. Acessado em 2026-10-08.
- [16] Atlassian Design System. Voice and tone. https://atlassian.design/foundations/content/voice-tone. Acessado em 2026-10-08.
- [17] Shopify Polaris. Voice and tone. https://shopify.dev/docs/apps/design/content/voice-and-tone. Acessado em 2026-10-08.
- [18] GOV.UK. A to Z style guide. https://guidance.publishing.service.gov.uk/writing-to-gov-uk-standards/style-guides/a-to-z-style-guide/. Acessado em 2026-10-08.
- [19] W3C Design Tokens Community Group. Design Tokens Format Module 2025.10. https://www.w3.org/community/reports/design-tokens/CG-FINAL-format-20251028/. Acessado em 2026-10-07.
- [20] Design Tokens Community Group. Color Module 2025.10. https://www.designtokens.org/tr/2025.10/color/. Acessado em 2026-10-08.
