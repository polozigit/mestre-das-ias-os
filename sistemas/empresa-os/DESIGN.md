---
version: alpha
name: "Empresa OS"
description: "Tema padrão do molde. A marca da empresa entra pela skill tecnologia-aplicar-marca."
colors:
  primary: "#4F46E5"
  primary-hover: "#4338CA"
  on-primary: "#FFFFFF"
  primary-text: "#4338CA"
  surface: "#FCFCFD"
  surface-dark: "#111114"
  on-surface: "#111114"
  neutral: "#6A6A78"
  error: "#B5371F"
typography:
  titulos:
    fontFamily: "system-ui"
    fontWeight: 600
  texto:
    fontFamily: "system-ui"
    fontWeight: 400
rounded:
  sm: "6px"
  md: "10px"
  lg: "16px"
---
# DESIGN.md — como a marca entra no sistema

> Pra IA da empresa. Regra de ouro: **o mockup dita a CARA, o template dita o
> ESQUELETO.** A marca entra pela skill `tecnologia-aplicar-marca`; você NUNCA
> reescreve tela, componente ou navegação pra imitar um mockup. É isso que
> garante que o sistema continua funcionando bem depois de qualquer mudança de marca.

## Onde o visual mora

| Arquivo | O que é | Pode editar? |
|---|---|---|
| `src/app/theme.css` | TODOS os tokens de marca (cores, tipo, raio, sombra) | SÓ pela skill `tecnologia-aplicar-marca` |
| `src/app/globals.css` | mecânica fixa (mapeamento Tailwind, reset, tabela-card) | NÃO |
| `public/marca/logo.*` (+ `logo-fundo-escuro.*`) | logo da empresa, claro e escuro | SÓ pela skill `tecnologia-aplicar-marca` |
| `src/app/icon.*` | ícone da aba do navegador | SÓ pela skill `tecnologia-aplicar-marca` |
| `config/marca.ts` | logo claro/escuro, fonte do Google e cor da barra do navegador | SÓ pela skill `tecnologia-aplicar-marca` |
| `config/empresa.ts` | nome/slug/descrição (o nome exibido é `nome + " OS"`) | SIM |
| Componentes (`src/components/**`) | estrutura das telas | NÃO por marca |

Nenhum componente usa cor literal — só classes semânticas (`bg-acento`,
`text-fg-2`, `border-borda`...). Trocar o `theme.css` re-tematiza o sistema
inteiro, claro e escuro.

## Marca aplicada

<!-- marca:inicio -->
Ainda não aplicada: o sistema usa o tema padrão do molde. Para trocar pela marca da empresa, rode a skill `tecnologia-aplicar-marca`.
<!-- marca:fim -->

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
  A cor da barra do navegador no celular vem de `config/marca.ts`, igual ao
  `--bg` de cada tema; a skill grava os dois juntos.
- **Forma** — `--raio-sm/md/lg` (6/10/16px padrão). Marca geométrica: diminua;
  marca amigável: aumente. Nunca acima de 24px (vira balão).
- **Tipo** — `--fonte-texto` e `--fonte-titulo` (font-stacks). Família do
  Google Fonts entra por `config/marca.ts`; fonte própria é task de sistema.

## Como o tema claro/escuro funciona

O botão do topo cicla três estados: claro, escuro e sistema (o do aparelho). A
escolha fica no navegador e um script no `<head>` (`src/lib/tema.ts`) a aplica
em `<html data-theme>` antes da primeira pintura, sem piscar. Não crie lógica
de cor fora disso: componente usa só as classes semânticas.

O menu lateral também é estado do navegador: recolhível no desktop
(`data-sidebar` no `<html>`) e gaveta no celular. Isso é estrutura, não marca,
e não se mexe por tema.

## Procedimento: aplicar a marca

Rode a skill `tecnologia-aplicar-marca` em conversa nova. Ela mostra o mockup
das telas principais em claro E escuro e só aplica depois do "sim" do dono (um
ajuste se ele reprovar). Depois de aplicar, o link de teste é aprovado pelo dono
antes do merge. Não edite os arquivos da tabela acima à mão.

## O que NUNCA fazer

- Reescrever componente/tela pra "ficar igual ao mockup"
- Cor literal em componente (`bg-[#ff0000]`, `text-red-500`)
- Editar `globals.css` pra mudar aparência
- `--acento-texto` sem checar contraste (texto laranja/amarelo em branco falha)
