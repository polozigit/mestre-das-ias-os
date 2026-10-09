# Regras de cor da tecnologia-aplicar-marca

Para a IA explicar um ajuste ao dono em palavras simples. O dono não vê esta página e nunca ouve "token", "OKLCH" nem número de contraste: ele ouve "passa na leitura" ou "ajustei para dar leitura". Quem faz a conta é o `scripts/aplicar_marca.py`; aqui está o porquê de cada regra.

## Fontes (lidas em 09/10/2026; perecíveis, reconfirmar depois de 08/11/2026)

- WCAG 2.2, critério 1.4.3 (contraste mínimo): texto precisa de 4,5 para 1; texto grande (18 pt, ou 14 pt em negrito) precisa de 3 para 1.
- WCAG 2.2, critério 1.4.11 (contraste de não-texto): componentes de interface, ícones e o indicador de foco precisam de 3 para 1 contra o fundo.
- O limiar NÃO arredonda: 4,499 reprova. A luminância é a relativa do sRGB padrão (a mesma do `paleta.py` da `marketing-identidade`).
- Tokens de design no formato DTCG (Design Tokens Community Group, Format Module 2025.10, relatório da comunidade, não é padrão do W3C): é o formato do `empresa/marca/tokens.json`.
- DESIGN.md no formato Google Labs (`version: alpha`): front matter com cores, tipografia e cantos, mais o texto da justificativa. Não é padrão W3C e nenhum agente é obrigado a ler; o `AGENTS.md` do sistema aponta para ele.

## O que o script garante, nos dois temas (claro e escuro)

| O que | Mínimo |
|---|---|
| texto principal, secundário e de apoio sobre o fundo, o fundo sutil e o fundo elevado | 4,5 |
| texto auxiliar (cinza mais fraco) sobre o fundo | 3 |
| cor dos botões sobre o fundo (e, por ela, o anel de foco) | 3 |
| texto dos links sobre o fundo, o fundo sutil e o fundo elevado | 4,5 |
| texto dentro do botão sobre a cor do botão e sobre a cor do botão em hover | 4,5 |

Os dois blocos escuros do `theme.css` (o do usuário que escolheu escuro e o do aparelho em modo escuro) têm de ser idênticos, e a cor da barra do navegador em `config/marca.ts` tem de ser igual ao fundo claro e ao fundo escuro do `theme.css`. O `conferir` relê o disco e recusa se algo divergir.

## Como a cor da marca vira o tema

- A cor principal vira uma escala de 10 tons (do quase branco ao quase preto). O tom de luminosidade mais próxima da cor da marca recebe a cor EXATA da marca (fidelidade). Os outros nascem da mesma cor, com menos intensidade perto do branco e do preto.
- Cor dos botões: a da marca, se o texto do botão (branco ou quase preto) der leitura e a cor se destacar do fundo. Senão, o primeiro tom da escala (do médio para o escuro) que dá. Frase para o dono: "sua cor não dá leitura como botão, então os botões usam um tom um pouco mais escuro dela".
- Cor dos links: a da marca, se der leitura como texto sobre os três fundos; senão o primeiro tom mais escuro que dá. Frase: "sua cor amarela não dá leitura em texto: os links usam o tom mais escuro dela". Amarelo, laranja claro e verde-limão são os casos comuns.
- Versão escura: desenhada, não invertida. Os botões e os links usam tons mais claros da mesma cor e o texto dentro do botão pode virar escuro. Frase: "na versão escura a cor fica um pouco mais clara para ter leitura sobre o fundo escuro".
- Cinzas da interface: mesma luminosidade dos cinzas do modelo; matiz da marca com um toque bem leve de cor. Se a cor da marca é quase cinza (pouca cor), ou se o dono pede `--neutros cinza`, os cinzas ficam sem cor nenhuma.
- Fundo da marca (ex.: creme): só entra se for claro e pouco colorido (fundo de tela). Fundo escuro ou forte é ignorado com aviso. Fundo creme escurece um pouco o cinza do texto de apoio para manter a leitura.
- Cor de texto, de apoio e de destaque da marca NÃO viram cor da interface: a escada de cinzas garante a leitura e o botão de ação é um só. Elas ficam registradas no `DESIGN.md`.
- Cores de status (ok, alerta, erro, info) e sombras ficam como estão. Marca vermelha perto do vermelho de erro gera um aviso (mensagens de erro e botões da marca podem se confundir); o script não muda a cor sozinho, decide o dono.
- Cantos: ficam como estão, a menos que o dono peça `--forma` (geometrica 4, 6 e 10 px; padrao 6, 10 e 16 px; amigavel 8, 14 e 20 px; nunca acima de 24 px).
- Fonte: só do Google Fonts (família da identidade com licença conferida), no máximo 2 famílias; fonte do computador entra só no nome da pilha. Fonte própria fica fora desta versão.

## Logo e ícone

- Logo principal (fundo claro) e logo claro (para fundo escuro): extensão igual à do arquivo de origem. Sem logo claro, o principal serve nos dois fundos.
- Ícone da aba: PNG ou JPG da identidade; WEBP ou ausência geram um ícone com a inicial do nome sobre a cor dos botões (esse ícone é um SVG escrito pelo próprio script). SVG vindo do aluno não é usado, nem como logo nem como ícone: o script avisa, ignora e nada dele é copiado. O aluno fornece PNG pelo `marketing-logo`.
