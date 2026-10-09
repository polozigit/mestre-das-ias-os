---
name: tecnologia-aplicar-marca
description: "Aplica a marca aprovada no sistema: cores, fontes, logo e ícone, com mockup antes. Use após a identidade. Não use pra tela nova."
metadata:
  origem: polozi
  diretoria: tecnologia
---

# tecnologia-aplicar-marca

Leva a identidade visual que o dono já aprovou (`empresa/marca/tokens.json`, gerado pela `marketing-identidade`) para o sistema da empresa: cores, fontes, logo claro e escuro, ícone da aba e o `DESIGN.md`. A conta de cor e de leitura é de um script só, `scripts/aplicar_marca.py`, que prova o próprio resultado; modelo não calcula contraste. Rodar de novo é seguro: mesmo resultado, mesmos bytes.

O dono aprova duas vezes, e só duas: o mockup (antes de mexer em qualquer arquivo) e o link de teste (antes do merge). Nada vai para o sistema sem o primeiro "sim".

## Quando usar

- Depois que a identidade visual está aprovada e o sistema está instalado. Costuma vir da atividade `sistema-com-marca` do plano.
- Não use para tela nova, botão novo ou mudança de comportamento: isso é da `tecnologia-construir-tela`.
- Não use para refazer a identidade (cores, fonte, logo da marca): isso é da `marketing-identidade` e da `marketing-logo`. Aqui só se aplica o que já foi aprovado.
- Não publique por conta própria: a publicação é da `tecnologia-publicar`.

## Antes de qualquer comando

- `<PY>` é o `comando_python:` de `operacao/INSTALACAO.md` (no Windows costuma ser `py -3` ou `python`).
- Rode os comandos da raiz da Casa, com o PowerShell no Windows. Um comando por chamada: sem `&&`, sem `cd` e sem subshell. Onde o passo disser "no sistema", mude o diretório de trabalho da chamada para `sistemas/empresa-os`, nunca encadeie.
- Conversa nova para esta etapa e no máximo 1 revisão do mockup mais 1 correção depois do link de teste. Sem loop: passou disso, pare e explique (cada rodada gasta a cota do dono).
- Fale como o dono fala: "cor dos botões", "cor dos links", "fundo", "versão escura", "ícone da aba do navegador". Nunca diga token, OKLCH, número de contraste, "escala" nem nome de variável. Detalhes das frases em `referencias/fala-com-o-dono.md`; as regras de cor, só para explicar um ajuste, em `referencias/regras-de-cor.md`.

## Passos

### 0. Pré-requisitos

1. A identidade precisa estar aprovada: `empresa/marca/identidade-visual.md` no estado `aprovado` no Mapa (papel `marca.identidade-visual`, em `MAPA-DA-EMPRESA-IA.md`). Sem isso, pare e mande o dono rodar a `marketing-identidade`.
2. Os tokens precisam estar em dia. Rode o `marca_dados.py` da `marketing-identidade` com `tokens --arquivo empresa/marca/identidade-visual.md --check`. Saída 1: rode o mesmo comando sem `--check` para regravar e siga.
3. O sistema precisa estar instalado (`sistemas/empresa-os/`) e ser da versão com leitura da marca: tem `src/components/marca/LogoMarca.tsx` e o `src/app/layout.tsx` importa `config/marca`. Sem isso, PARE e explique, sem improvisar a atualização aqui. Se a pasta `sistemas/empresa-os/` não existe: "Seu sistema ainda não foi instalado (Etapa 8 do manual). Instale primeiro e volte aqui. Não mexi em nada." Se existe mas é do molde antigo: "Seu sistema foi instalado antes dessa etapa e precisa de uma atualização do modelo primeiro. Não mexi em nada."
4. Confira a entrada:

```
<PY> .agents/skills/tecnologia-aplicar-marca/scripts/aplicar_marca.py ler --casa .
```

Saída 0 e a linha `OK`. Logo em SVG não é usado: o script avisa e ignora; peça o PNG à `marketing-logo` (a versão para fundo escuro é o papel "claro"). Saída 1: leia a lista (logo que não existe, fonte com nome estranho) e resolva com a skill dona (`marketing-logo`, `marketing-identidade`); não siga com 1. Para ver as cores da paleta aprovada (as únicas que o dono pode escolher como cor dos botões), acrescente `--json`.

### 1. Mockup (obrigatório, antes de mexer no sistema)

```
<PY> .agents/skills/tecnologia-aplicar-marca/scripts/aplicar_marca.py mockup --casa .
```

Grava `operacao/marca/mockup-sistema.html`: as telas principais do sistema (menu com logo e nome, cabeçalho, botão principal e secundário, link, selo de status, cartão, tabela, campo com foco, aviso de erro) em versão CLARA e ESCURA, no tamanho de computador e de celular. Não grava nada em `sistemas/`.

1. Abra o arquivo no navegador da sessão (o Browser do app), sem pedir licença, e olhe você mesmo antes de mostrar: logo visível nos dois fundos, texto legível, nada cortado no celular.
2. Conte ao dono, em 5 linhas: cor dos botões, cor dos links, fundo, fonte e logo (claro e escuro). Se o script imprimiu linhas `AJUSTE:`, diga cada uma em palavras simples (por exemplo: "sua cor amarela não dá leitura em texto: os links usam um tom mais escuro dela").
3. Pergunte UMA vez, exatamente: **"É assim que você quer o sistema? Responda sim, ou diga o que mudar."**
4. Só vale um "sim" escrito sobre ESTE mockup. "Sim, mas muda X" NÃO é sim: trate como pedido de mudança.
5. Reprovou: faça UM ajuste com o que o dono apontou e mostre o mockup de novo (A41, sem loop). Os ajustes que o script aceita (repita o mesmo comando acrescentando a opção; ela fica gravada em `operacao/marca/escolhas.json` e a aplicação usa a mesma):
   - `--acento '#HEX'`: outra cor dos botões, SÓ entre as cores da paleta aprovada (a lista vem do `ler --json`). Cor fora da paleta o script recusa.
   - `--neutros cinza`: cinzas sem cor (o padrão é `--neutros marca`, cinzas com um toque da cor da marca).
   - `--forma geometrica` (cantos mais retos), `padrao` ou `amigavel` (cantos mais redondos).
6. Reprovou de novo: PARE, sem aplicar nada. Anote em `operacao/DECISOES.md` (crie se não existir) o que o dono apontou e sugira rever a identidade com a `marketing-identidade`.

### 2. Branch

A regra r11 do hook recusa editar `sistemas/` na branch principal quando já há produção publicada. Rode `git branch --show-current`; se vier `main` ou `master`:

```
git switch -c feat/marca-no-sistema
```

### 3. Aplicar

```
<PY> .agents/skills/tecnologia-aplicar-marca/scripts/aplicar_marca.py aplicar --casa . --sistema sistemas/empresa-os
```

Com `--dry-run` só lista o que gravaria. Grava só: `src/app/theme.css`, `config/marca.ts`, `public/marca/logo.*` (e `logo-fundo-escuro.*`), `src/app/icon.*` (e `apple-icon.png`) e o front matter e a seção "Marca aplicada" do `DESIGN.md`; apaga o logo e o ícone antigos que sobraram. Qualquer outro arquivo do sistema fica como está. Saída 1: nada foi gravado; leia a lista e resolva. Se disser que o sistema é antigo, volte ao passo 0.3.

### 4. Conferir

```
<PY> .agents/skills/tecnologia-aplicar-marca/scripts/aplicar_marca.py conferir --sistema sistemas/empresa-os
```

Saída 0 obrigatória; saída 1 lista cada par de cor que não passa na leitura ou arquivo fora do contrato, e você NUNCA segue com 1 (rode o passo 3 de novo; se persistir, pare e explique sem inventar saída). Depois, só se existir `sistemas/empresa-os/node_modules`, rode os três comandos abaixo, UM por chamada, com o diretório de trabalho em `sistemas/empresa-os`:

```
npx tsc --noEmit
npm test
npm run build
```

Sem `node_modules` (a instalação não faz `npm install` completo), a prova desses três é o CI do PR (lint, tipos e testes) e o build da Vercel na `tecnologia-publicar`. Não instale tudo só para isto.

### 5. Autor dos commits

```
<PY> .agents/skills/tecnologia-aplicar-marca/scripts/aplicar_marca.py autor --casa . --corrigir
```

Lê a conta do GitHub (`gh api user`) e, se o e-mail dos commits desta Casa não é o da conta nem o `<id>+<login>@users.noreply.github.com`, grava o noreply no `git config` LOCAL e avisa em 1 linha. Sem isso a Vercel Hobby bloqueia a prévia por autor desconhecido. Saída 1 (sem `gh` logado): peça ao dono `gh auth login` e rode de novo; não siga para a publicação com saída 1.

### 6. Publicar com prévia

Chame a `tecnologia-publicar` (PR, CI, revisor de segurança, link de teste). Quando o link de teste existir, VOCÊ abre: a tela de login e uma tela interna, em claro e em escuro, com 375 px de largura e com a tela do computador; confira logo, ícone da aba, nome e cores. Algo errado: UMA correção (A41), novo commit, o link novo; segunda falha, pare e explique.

Mostre o link ao dono: **"Está no ar para teste neste link. Responda sim para publicar."** Só o "sim" dele autoriza o merge, e "sim" é mesmo de publicar (não do mockup). Ao receber o sim, registre-o e deixe a `tecnologia-publicar` levar o registro junto no merge: o `aprovacao.py registrar --arquivo sistemas/empresa-os/DESIGN.md --frase "<frase literal do dono>"` da `marketing-persona`, se ela estiver instalada; senão, uma linha `Aprovado pelo dono em AAAA-MM-DD: "<frase>"` no `operacao/tasks/TASK-N/TASK.md` da tarefa. Depois do merge e da conferência da produção, diga: "Seu sistema está no ar com a sua marca."

## Se falhar

- Entrada ou aplicação com saída 1: o script não grava nada nesse caso; leia a lista, resolva ou pare. Nunca edite `theme.css`, `config/marca.ts` nem o logo à mão para "passar": a marca no sistema muda só por esta skill.
- `autor` sem o `gh`: o passo 5 não é opcional.
- Mockup reprovado duas vezes, sistema antigo, PAT/GitHub fora do ar: pare, diga em uma frase o que falta e quem resolve.
- Logo sumido no escuro (logo escuro sem versão clara): o mockup mostra; o conserto é pedir a versão clara na `marketing-logo`, não é automático.

## Plataforma e limites

Hoje esta skill roda no Codex. Chame pelo nome: `$tecnologia-aplicar-marca`. Ela não dispara sozinha (`allow_implicit_invocation: false`), porque grava arquivos do sistema. O script só usa a biblioteca padrão do Python e não faz chamada de rede; a única rede desta skill é o `gh api user` do passo 5, o CI e a Vercel, que são da `tecnologia-publicar`. A fonte do Google entra por `config/marca.ts`; fonte própria, cor de apoio ou destaque como cor da interface e modo escuro padrão ficam fora desta versão.

Outra plataforma: esta seção ganha a parte dela quando o kit tiver o adaptador.
