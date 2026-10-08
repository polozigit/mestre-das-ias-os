# DESIGN.md — como a marca entra no sistema

> Pra IA da empresa. Regra de ouro: **o mockup dita a CARA, o template dita o
> ESQUELETO.** Você traduz o visual aprovado pra tokens; você NUNCA reescreve
> tela, componente ou navegação pra imitar um mockup. É isso que garante que o
> sistema continua funcionando bem depois de qualquer mudança de marca.

## Onde o visual mora

| Arquivo | O que é | Pode editar? |
|---|---|---|
| `src/app/theme.css` | TODOS os tokens de marca (cores, tipo, raio, sombra) | SIM — é o único |
| `src/app/globals.css` | mecânica fixa (mapeamento Tailwind, reset, tabela-card) | NÃO |
| `public/marca/logo.svg` + `favicon.svg` | logo da empresa | SIM (substituir) |
| `config/empresa.ts` | nome/slug/descrição (o nome exibido é `nome + " OS"`) | SIM |
| Componentes (`src/components/**`) | estrutura das telas | NÃO por marca |

Nenhum componente usa cor literal — só classes semânticas (`bg-acento`,
`text-fg-2`, `border-borda`...). Trocar o `theme.css` re-tematiza o sistema
inteiro, claro e escuro.

## Os botões de ajuste (tokens do `theme.css`)

- **`--marca-50..900`** — a escala da cor principal. Gere 10 degraus a partir
  da cor da marca (50 quase branco → 900 quase preto). Derivados:
  `--acento` (500/600), `--acento-hover` (mais escuro), `--acento-suave`
  (fundo lavado), `--acento-texto` (**contraste AA ≥4.5:1 sobre branco — use o
  degrau 700**), `--fg-sobre-acento` (texto em cima do acento).
- **`--neutro-25..900`** — os cinzas. Podem "esquentar" (bege) ou "esfriar"
  (azulado) conforme a marca; mantenha a progressão de claridade.
- **`--ok / --alerta / --erro / --info`** (+ `-suave`) — status. Só mude se a
  marca conflitar (ex.: marca vermelha → escureça o `--erro`).
- **Superfícies claro/escuro** — `--bg`, `--bg-sutil`, `--bg-elevada`,
  `--fg-1..4`, `--borda`. O escuro existe em DOIS blocos do `theme.css` com
  as mesmas atribuições: `:root[data-theme="dark"]` (quando o usuário escolheu
  escuro) e `@media (prefers-color-scheme: dark)` com `:root:not([data-theme])`
  (sem escolha e sem JavaScript). Ajuste os DOIS, sempre iguais.
  **Terceiro lugar:** se a marca muda a cor de fundo (`--bg` claro ou escuro),
  edite também `viewport.themeColor` em `src/app/layout.tsx` (um hex pro claro,
  outro pro escuro, iguais ao `--bg` de cada tema). É a cor da barra do
  navegador no celular e só aceita hex, não token; esquecer deixa a barra
  com a cor antiga do molde.
- **Forma** — `--raio-sm/md/lg` (6/10/16px padrão). Marca geométrica: diminua;
  marca amigável: aumente. Nunca acima de 24px (vira balão).
- **Tipo** — `--fonte-texto` e `--fonte-titulo` (font-stacks). Trocar fonte de
  verdade (webfont) é task de sistema, não ajuste de tema.

## Como o tema claro/escuro funciona

O botão do topo cicla três estados: claro, escuro e sistema (o do aparelho). A
escolha fica no navegador e um script no `<head>` (`src/lib/tema.ts`) a aplica
em `<html data-theme>` antes da primeira pintura, sem piscar. Não crie lógica
de cor fora disso: componente usa só as classes semânticas.

O menu lateral também é estado do navegador: recolhível no desktop
(`data-sidebar` no `<html>`) e gaveta no celular. Isso é estrutura, não marca,
e não se mexe por tema.

## Procedimento: mockup aprovado → tema

1. Extraia do mockup: cor principal, tom dos cinzas, arredondamento, claro ou
   escuro como padrão, estilo de título.
2. Gere a escala `--marca-*` e ajuste os derivados (`--acento-texto` no degrau
   com contraste AA).
3. Edite o `theme.css` (claro + os dois blocos do escuro). Substitua a logo.
4. `npm run dev` → mostre pro dono no navegador, claro E escuro, desktop E
   celular. Ajuste até o "é isso".
5. Commit dos 3 arquivos juntos. Nada mais mudou? Então a tradução foi certa.

Sem mockup? Mesmo procedimento, extraindo direto de
`empresa/marca/identidade-visual.md`.

## O que NUNCA fazer

- Reescrever componente/tela pra "ficar igual ao mockup"
- Cor literal em componente (`bg-[#ff0000]`, `text-red-500`)
- Editar `globals.css` pra mudar aparência
- `--acento-texto` sem checar contraste (texto laranja/amarelo em branco falha)
