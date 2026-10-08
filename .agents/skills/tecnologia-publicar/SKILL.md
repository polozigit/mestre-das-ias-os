---
name: tecnologia-publicar
description: "Salva a Casa no GitHub por script e publica o sistema (PR, merge, volta). Use em 'salva', checkpoint, 'publica', 'manda pro ar' e na primeira vez que o sistema vai ao ar."
metadata:
  origem: polozi
  diretoria: tecnologia
---

# tecnologia-publicar

Leva a mudança do computador até o ar e prova que chegou. O dono nunca vê git, branch nem PR: ele ouve frases curtas ("salvei", "está no ar", "voltei a versão anterior"). Quem faz o git, o `gh` e as conferências é você.

## Fatos do sistema que esta skill usa

Detalhes e `arquivo:linha` em `.agents/skills/tecnologia-sistema/referencias/regras-do-sistema.md` (seções 7, 9 e 10).

- O hook da Casa recusa push na `main` (regra r02) só quando o sistema já está publicado em produção, sinal: existe `sistemas/empresa-os/.vercel/project.json`. Sem esse arquivo a `main` é a branch de trabalho e pode ser salva direto. O hook também recusa `vercel --prod/promote/rollback` (r04), `supabase db push` (r03) e, com produção publicada, editar `sistemas/` na branch principal (r11).
- Quem aplica migration em produção é a Action `deploy-db.yml`, ao entrar na `main`. Nunca a IA e nunca na mão.
- Branch gera preview na Vercel; merge na `main` gera produção.
- A `main` do repositório privado no plano grátis não obriga check verde. Por isso o passo 6 espera os checks por conta própria antes do merge.

## Salvar (Casa sem sistema no ar)

Quando o dono diz "salva", pede um checkpoint, ou a sessão abre com árvore suja, e a Casa NÃO tem produção publicada: um comando só, sem subagente e sem revisor. O script faz commit, push e a prova.

```bash
python3 .agents/skills/tecnologia-publicar/scripts/salvar.py -m "<o que mudou, em português>" <caminho> [<caminho> ...]
python3 .agents/skills/tecnologia-publicar/scripts/salvar.py -m "<mensagem>" --tudo   # só para salvar a árvore suja inteira (começo de sessão)
python3 .agents/skills/tecnologia-publicar/scripts/salvar.py --provar                 # só confere, não salva
```

Rode na raiz da Casa, com o Python de `operacao/INSTALACAO.md` (campo `comando_python`; no Windows costuma ser `py -3`) no lugar de `python3`. Prefira os caminhos exatos do que você mudou; `--tudo` é a única exceção à regra de nunca usar `git add -A`.

| Saída | Significa | O que fazer |
|---|---|---|
| 0 com `SINCRONIZADO <hash>` | commit e push feitos, nada sobrando | Diga ao dono: "Sincronizado no GitHub, commit <hash curto>." |
| 0 com `SALVO_LOCAL <hash>` | a Casa não tem GitHub ligado: sem `origin`, ou o `origin` ainda é o repositório-modelo do curso (o script commita e não empurra; a etapa 4 do instalador troca o `origin`) | Diga: "Salvo neste computador." Não diga "no GitHub". `SALVO_LOCAL` com saída 1: o commit foi feito, mas sobrou arquivo fora dele (veja a saída 1). |
| 1 | sobrou arquivo fora do commit, ou commit que não subiu (com o `origin` no repositório-modelo o `--provar` sempre dá 1: não há GitHub do dono para provar) | Leia a lista, salve o que faltou ou explique por que ficou. Não diga "salvo". |
| 2 | a trava de segredo barrou, ou o push foi recusado | Tire o segredo ou o arquivo e tente de novo. Nunca contorne a trava. Se uma chave vazou, chame `tecnologia-acessos` (Girar chave). |
| 3 | sistema em produção e a branch é a `main` | Siga o fluxo completo (`## Passos` abaixo). Nada foi commitado. |
| 4 | travas de segredo desligadas | Se `.githooks/pre-commit` e `.githooks/pre-push` existem, religue com `git config core.hooksPath .githooks` e rode de novo; se sumiram, avise o dono e não salve. Nada foi commitado. |
| 5 | uso errado (fora da raiz, sem mensagem, caminho fora do repositório, HEAD solto) | Corrija o comando. |
| 6 | o GitHub tem mudança que conflita com a local; o merge foi desfeito | Mostre os dois lados ao dono, em palavras simples, e deixe ele escolher. Não resolva sozinho. |

Só diga "Sincronizado no GitHub" com exit 0 e a linha `SINCRONIZADO`. Esta seção não troca de branch, não abre PR e não coloca nada no ar: se o dono quer link de teste ou a mudança é de `sistemas/` com produção publicada, vá aos `## Passos`.

## Passos

O fluxo completo é para Casa com produção publicada (marcador acima), ou quando o dono pede um link de teste. Casa sem sistema no ar salva pela seção acima. A ordem importa: primeiro o commit local, depois as checagens sobre o que foi commitado, depois o push. Com trabalho ainda não commitado, `git diff --no-renames origin/main...HEAD` sai vazio e as checagens passariam em branco.

Variável de shell não passa de um comando para outro. Por isso cada bloco abaixo recalcula o que precisa (número da PR, commit do merge) a partir do nome da branch, que você escreve por extenso no lugar de `<branch>`. Valor vazio = o bloco imprime `PARE:` e não segue. Nunca continue com valor vazio.

1. **Conferir o estado.** Rode `git fetch origin`, `git status --porcelain` e `git branch --show-current`. Se estiver na `main`, ou numa branch cuja PR já foi mesclada (`gh pr list --head <branch> --state merged --json number --jq length` maior que 0), crie a branch nova a partir da `main` do GitHub: `git switch -c <tipo>/<assunto-curto> origin/main` (por exemplo `feat/tela-clientes`); as edições soltas vão junto. Anote o nome: é o `<branch>` dos passos seguintes. O hook da Casa recusa push na `main` quando há produção publicada.

2. **Commit local.** Commit com os caminhos exatos dos arquivos (nunca `git add -A`), mensagem em português dizendo o que mudou. Se a mudança tem migration (`sistemas/*/supabase/migrations/*.sql`), o veredito dela, `operacao/vereditos/<nome-sem-.sql>.json`, entra no MESMO commit: o `pre-commit` da Casa confere o veredito da migration que vai no commit, e o revisor do passo 5 lê esse arquivo. Termine a mensagem com a linha de coautoria do modelo que está rodando, se o repositório usar esse costume. Ainda não faça push. Depois liste o que vai subir: `git diff --name-only --no-renames origin/main...HEAD`. O `--no-renames` é obrigatório em toda lista de arquivos: sem ele, arquivo movido ou renomeado aparece só com o nome novo, e mover `AGENTS.md` para `NOTAS.md` ou `.github/workflows/x.yml` para `docs/` sumiria da conferência do 3a. As checagens 3, 4 e 5 usam essa lista; se ela vier vazia mas havia trabalho, pare e descubra por quê.

3. **Arquivos protegidos e migrations.**

   **3a. Arquivos protegidos.** `git diff --name-only --no-renames origin/main...HEAD | python3 .agents/skills/tecnologia-publicar/scripts/arquivos_protegidos.py`. Saída 0 = nenhum; siga para o 3b. Saída 1 = a mudança mexe em arquivo protegido (o script lista quais). Apagar, mover ou renomear um protegido também conta: o nome antigo vem na lista. Protegidos, em qualquer pasta: `AGENTS.md`, `CLAUDE.md`, `.githooks/`, `.codex/hooks/`, `.codex/config.toml`, `.claude/settings*.json` e `.github/`. Eles decidem o que a IA pode fazer e o que os testes automáticos e a publicação fazem. Só para eles você pergunta ao dono antes:
   - Diga em palavras simples o que cada um faz e o que muda. `AGENTS.md` e `CLAUDE.md` = "as regras que a IA segue"; `.githooks/`, `.codex/hooks/`, `.codex/config.toml` e `.claude/settings*.json` = "as travas que impedem a IA de fazer coisa perigosa"; `.github/` = "os testes automáticos e a publicação do GitHub". Pergunte exatamente: "Posso mudar isso? Responda sim ou não."
   - Só o "sim" explícito vale (a mesma regra da migration destrutiva). Grave a frase literal no formato `<nome> em <AAAA-MM-DD>: <frase literal>`, com a data de `date +%F`. Ela vai para o revisor (passo 5, campo `ok_do_dono`) e para o texto da PR (passo 6), que é onde o OK fica registrado.
   - "Não", ou sem resposta: não publique esses arquivos. Pergunte se o dono quer seguir só com o resto; se sim, desfaça só esses arquivos no commit (arquivo que já existia: `git checkout origin/main -- <arquivo>`; arquivo novo: `git rm <arquivo>`), faça o commit de novo (passo 2) e volte ao 3a.

   **3b. Migrations.** Se a lista toca `sistemas/*/supabase/migrations/*.sql`, para cada arquivo rode os dois, e guarde a saída e o código de saída de cada um para o passo 5: `python3 .agents/skills/tecnologia-mudar-banco/scripts/classificar_migration.py <sql>` (0 = acrescenta, 1 = destrutiva; o 1 só informa a classe, não é erro) e `python3 .agents/skills/tecnologia-mudar-banco/scripts/veredito.py conferir <sql>`. Qualquer problema (sem veredito, sha diferente, BLOCKED, destrutiva sem o "sim" do dono) = pare e chame a skill `tecnologia-mudar-banco`. Não siga.

4. **Testes locais.** Se a lista toca `sistemas/empresa-os/`, rode num subshell para não mudar a pasta de trabalho: `(cd sistemas/empresa-os && npm run lint && npx tsc --noEmit && npm test)`. Vermelho = pare, corrija, commite de novo (passo 2) e repita desde o passo 3.

5. **Revisão independente.** Só se a lista do passo 2 toca `sistemas/` ou o 3a deu saída 1 (arquivo protegido); senão pule este passo (o subagente começa sem contexto e custa tokens; documento e operação não passam por ele). Chame o subagente `tecnologia-revisor-seguranca` passando `chamado_por: tecnologia-publicar`, a lista do passo 2, o texto do diff (`git diff --no-renames origin/main...HEAD`), a saída do `arquivos_protegidos.py` (passo 3a, campo `arquivos_protegidos`), o `ok_do_dono` do 3a quando houver, e, para cada migration da lista, o caminho, a classificação (`classificar_migration.py`) e a saída, com o código de saída, do `veredito.py conferir` do passo 3b. O revisor só lê e não roda comando: sem esses dados ele devolve BLOCKED. BLOCKED = corrija, commite de novo e repita os passos 3, 4 e 5 (a correção pode mudar o sha da migration e quebrar o veredito). Nunca siga com BLOCKED.

6. **Push, PR e checks.**
   - `git push -u origin HEAD`.
   - PR: `gh pr create --fill --base main`. Se houve OK do passo 3a, crie com texto próprio para o OK ficar registrado: escreva num arquivo temporário (`T=$(mktemp)`, no mesmo comando) o resumo da mudança, a lista dos arquivos protegidos e a linha `OK do dono para arquivo protegido: <nome> em <AAAA-MM-DD>: <frase literal>`, e rode `gh pr create --base main --title "<o que mudou>" --body-file "$T"`.
   - Espere os checks. Logo depois de criar a PR, o GitHub pode responder "no checks reported" porque os checks ainda não começaram; o bloco tenta de novo:
     ```bash
     B=<branch>; N=$(gh pr list --head "$B" --state open --json number --jq '.[0].number // empty')
     if [ -z "$N" ]; then echo "PARE: nenhuma PR aberta para $B"; else
       for i in 1 2 3 4 5 6; do gh pr checks "$N" 2>&1 | grep -q "no checks reported" || break; sleep 10; done
       gh pr checks "$N" --watch; echo "PR $N: checks saída $?"
     fi
     ```
     Saída 0 = todos verdes. Ainda "no checks reported" depois das 6 tentativas = os testes automáticos do GitHub não começaram: não faça merge; diga ao dono "os testes automáticos do GitHub não começaram; estou olhando".
   - Check vermelho: pegue o id da execução que falhou com `gh run list --branch <branch> --status failure --limit 1 --json databaseId --jq '.[0].databaseId'` e leia com `gh run view <id> --log-failed`. Corrija, commite (passo 2) e volte ao passo 3. Só avance com todos verdes.

7. **Avisar o dono.** Sem esperar resposta, diga em 1 frase, com o link do preview da Vercel (comentário do bot na PR: `gh pr view <branch> --json comments`): "Estou colocando no ar. Se quiser ver antes, o link de teste é: <link>". Exceção: se a mudança veio de `tecnologia-construir-tela`, a chamada dela informa o `TASK-N`. Então pare aqui e devolva o controle a ela: ela exercita o link de teste contra os critérios de `operacao/tasks/TASK-N/requisito.md` e, com todos em sim, devolve a você para seguir do passo 8, sem esperar resposta do dono.

8. **Foto da produção e merge.**

   **8a. A produção já está boa antes do merge?** Só se a lista do passo 2 toca `sistemas/` (senão, vá ao 8b). Ache o endereço do site (`SITE_URL`), nesta ordem:
   - a linha `SITE_URL: <endereço>` em `operacao/sistema.md`;
   - senão o `environment_url` do último deploy de produção que deu certo: `S=$(git rev-parse origin/main); D=$(gh api "repos/{owner}/{repo}/deployments?sha=$S" --jq '.[0].id // empty'); [ -n "$D" ] && gh api "repos/{owner}/{repo}/deployments/$D/statuses" --jq '.[0] | "\(.state) \(.environment_url)"'` (vale só com `success`);
   - senão pergunte ao dono UMA vez e grave a linha `SITE_URL: <endereço>` em `operacao/sistema.md` (arquivo sem segredo).

   Prefira sempre o `SITE_URL`: o `environment_url` pode ser o endereço de um deploy protegido, que responde 401. Nunca invente o endereço e nunca leia `credenciais/` (o hook bloqueia). O `conexao.md` só tem nomes de variáveis, sem valores.

   Rode `python3 .agents/skills/tecnologia-publicar/scripts/checar_producao.py "<SITE_URL>"` e guarde a saída: é a foto de ANTES.
   - Saída 0: siga.
   - Saída 1 com motivo que não começa com "Não verificado": a produção JÁ está com problema, antes desta mudança. Diga ao dono em 1 frase ("O site já estava com problema antes desta mudança: <motivo>. Vou seguir e aviso se piorar.") e siga. No passo 9, esse mesmo motivo não é razão para voltar a mudança.
   - Linhas "Não verificado" (401 ou 403): o endereço pede autorização e não é o do site. Troque pelo `SITE_URL` do `operacao/sistema.md` ou pergunte ao dono, como acima.

   **8b. Merge.**
   ```bash
   B=<branch>; N=$(gh pr list --head "$B" --state open --json number --jq '.[0].number // empty')
   if [ -z "$N" ]; then echo "PARE: nenhuma PR aberta para $B"; else gh pr merge "$N" --squash --delete-branch; gh pr view "$N" --json state --jq .state; fi
   ```
   Vale o `state`, não o código de saída do `gh pr merge`: num worktree ele pode dar erro DEPOIS do merge feito (ao tentar trocar a pasta para a `main`, aberta em outra pasta). `MERGED` = mesclado; outra coisa = não mesclou, leia a mensagem. Não use `--auto` (o plano grátis não tem check obrigatório; por isso o passo 6 já esperou). Exceção: PR com migration `destrutiva` só entra depois do "sim" do dono gravado no veredito (o passo 3b garante isso), e PR com arquivo protegido só com o OK do passo 3a no texto da PR. Sem isso, não faça merge.

9. **Esperar o deploy certo e conferir a produção.** Checar logo depois do merge pode pegar a versão antiga ou um deploy ainda em construção. Se a lista do passo 2 NÃO toca `sistemas/` (só documento, operação ou instrução), não há site novo: faça só o 9.1 e vá ao passo 11 ("salvo"). Cada bloco recalcula o commit a partir de `<branch>` (na volta do passo 10, `<branch>` é a `volta/...`).
   1. Commit do merge:
      ```bash
      B=<branch>; N=$(gh pr list --head "$B" --state merged --json number --jq '.[0].number // empty'); SHA=$(gh pr list --head "$B" --state merged --json mergeCommit --jq '.[0].mergeCommit.oid // empty')
      if [ -n "$N" ] && [ -n "$SHA" ]; then echo "PR $N SHA $SHA"; else echo "PARE: não achei a PR mesclada de $B ou o commit dela"; fi
      ```
      Anote o `SHA` impresso (o passo 10 e o 11 usam). Vazio = pare: sem o commit, a consulta de deploy devolve o deploy de qualquer commit, e um sucesso antigo viraria um falso "no ar".
      Catálogo de IA: se a lista do passo 2 toca `.codex/agents/`, `.agents/skills/`, `capacidades/AUTOMACOES.md` ou `sistemas/*/.github/workflows/`, rode `python3 <polozi-instalar-time>/scripts/sincronizar_catalogo.py --casa .` e confira que a primeira linha é `FEITO`; a tela "Agentes, skills e workflows" passa a mostrar a versão nova. `<polozi-instalar-time>` é a pasta da skill irmã (`.agents/skills/polozi-instalar-time` na Casa, ou `~/.codex/plugins/cache/*/polozi-fundacao/*/skills/polozi-instalar-time`). `FALTA` = banco sem credencial em `credenciais/.env`; `PAREI` = leia a mensagem (segredo no arquivo citado, ou banco recusou) e conte ao dono.
   2. **Só se a PR tocou `sistemas/empresa-os/supabase/migrations/**`:** a Action `deploy-db.yml` roda na `main`. Espere a execução desse commit:
      ```bash
      B=<branch>; SHA=$(gh pr list --head "$B" --state merged --json mergeCommit --jq '.[0].mergeCommit.oid // empty')
      if [ -z "$SHA" ]; then echo "PARE: sem o commit do merge de $B"; else
        ID=""; for i in 1 2 3 4 5 6; do ID=$(gh run list --workflow deploy-db.yml --json databaseId,headSha --jq ".[] | select(.headSha==\"$SHA\") | .databaseId" | head -1); [ -n "$ID" ] && break; sleep 10; done
        if [ -z "$ID" ]; then echo "PARE: a Action deploy-db não apareceu para $SHA"; else gh run watch "$ID" --exit-status; echo "deploy-db: saída $?"; fi
      fi
      ```
      Saída diferente de 0 = não confira o site; vá ao passo 10. `PARE` = diga ao dono "a atualização do banco ainda não começou; estou olhando" e consulte de novo mais tarde.
   3. Deploy da Vercel desse commit (repete a cada 30 segundos, no máximo 20 vezes, 10 minutos; deploy que ainda não existe conta como pendente e é procurado de novo a cada volta):
      ```bash
      B=<branch>; SHA=$(gh pr list --head "$B" --state merged --json mergeCommit --jq '.[0].mergeCommit.oid // empty')
      if [ -z "$SHA" ]; then echo "PARE: sem o commit do merge de $B"; else
        ESTADO=pendente
        for i in $(seq 1 20); do
          DEP=$(gh api "repos/{owner}/{repo}/deployments?sha=$SHA" --jq '.[0].id // empty')
          if [ -n "$DEP" ]; then ESTADO=$(gh api "repos/{owner}/{repo}/deployments/$DEP/statuses" --jq '.[0].state // "pendente"'); fi
          case "$ESTADO" in success|failure|error) break;; esac
          sleep 30
        done
        echo "deploy da Vercel para $SHA: $ESTADO"
      fi
      ```
      `success`: siga. `failure` ou `error`: o site continua na versão anterior, mas a `main` ficou com mudança que não sobe; vá ao passo 10. Ainda pendente no fim: diga ao dono "ainda estou esperando o site atualizar", não volte a mudança e não diga que está no ar; rode o bloco de novo mais tarde.
   4. Só agora: `python3 .agents/skills/tecnologia-publicar/scripts/checar_producao.py "<SITE_URL do 8a>" --tentativas 6 --intervalo 10`. Saída 0 = no ar. Saída 1: compare com a foto de ANTES (8a).
      - Todas as linhas começam com "Não verificado": o endereço pede autorização. Diga ao dono "não consegui conferir o site (o endereço pede autorização)" e acerte o `SITE_URL` (8a). Nunca volte a mudança por isso.
      - Os mesmos motivos da foto de ANTES: o problema já existia. Não volte; diga ao dono que o site segue com o mesmo problema de antes e que não foi esta mudança.
      - Motivo novo: vá ao passo 10.

10. **Quebrou? Volta.** Use o `SHA` impresso no 9.1, escrito por extenso.
    - `git fetch origin && git switch -c volta/<assunto> origin/main && git revert --no-edit <SHA>` (o merge foi squash, então é um commit só).
    - Antes do push, rode o 3a na volta: `git diff --name-only --no-renames origin/main...HEAD | python3 .agents/skills/tecnologia-publicar/scripts/arquivos_protegidos.py`.
      - Saída 0: `gh pr create --fill --base main`.
      - Saída 1 (a mudança voltada mexia em arquivo protegido): regra simples, a volta leva a aprovação da original. Pegue a linha `OK do dono para arquivo protegido: ...` do texto da PR original (`gh pr view <N do 9.1> --json body --jq .body`) e crie a PR da volta com `--body-file` contendo `Volta da PR #<N>`, a lista dos arquivos protegidos e essa MESMA linha de OK. A volta só desfaz o que o dono já aprovou, então não pergunta de novo. Se a PR original não tem a linha (o protegido entrou sem OK), não faça a volta automática: pare e conte ao dono em palavras simples, como no 3a.
    - Publique a volta com `<branch>` = `volta/<assunto>`: `git push -u origin HEAD`, a PR acima, o bloco de checks do passo 6 e o bloco de merge do 8b. Sem `--auto`.
    - Depois do merge, repita o passo 9 com `<branch>` = `volta/<assunto>`: o 9.1 acha o número e o commit da PR de volta (outro `SHA`), e o 9.3 e o 9.4 conferem esse commit.
    - Avise o dono em palavras simples, dizendo o que a mudança fazia: "Aquela mudança (<o que ela fazia, em 1 frase>) deu problema no site e eu voltei para a versão anterior."
    - Se o revert der conflito, ou a PR de volta também falhar (checks vermelhos, deploy falho, site ainda fora): pare, diga ao dono em palavras simples o que aconteceu e o que está fora do ar, e não faça mais nenhuma ação automática.
    - Se a PR original tinha migration: o revert apaga o arquivo `.sql`, mas NÃO desfaz o que a migration já fez no banco. Diga isso ao dono ("o banco já tinha sido atualizado e isso não volta sozinho") e chame `tecnologia-mudar-banco` para escrever a migration de correção (que passa por veredito como qualquer outra).

11. **Só dizer "salvo" ou "no ar" com prova.** Rode `git fetch origin` antes de comparar.
    - "Salvo" depois do merge: o `state` do 8b deu `MERGED`, `git merge-base --is-ancestor <SHA do 9.1> origin/main && echo "está na main"` imprime a frase e `git status --porcelain` sai vazio (nada ficou fora do commit). Não troque a pasta para a `main`: num worktree ela pode estar aberta em outra pasta. O próximo trabalho começa no passo 1, com branch nova a partir de `origin/main`.
    - "Salvo" com a branch ainda sem merge: `git status --porcelain` vazio e `git log origin/<branch>..HEAD` vazio (diga "salvei, falta colocar no ar").
    - "No ar": o deploy desse commit com `state` `success` (passo 9.3) e `checar_producao.py` com saída 0 depois disso.
    - Sem a prova, diga o que falta em palavras simples: "Ainda estou esperando o site atualizar".

## Primeira vez neste sistema

Faça isto uma vez, quando o sistema ainda não foi ao ar (não existe `sistemas/empresa-os/.vercel/project.json`) ou quando o dono pedir "liga a publicação". É a passagem de "Casa sem sistema no ar" para "Casa com produção publicada": depois dela o hook passa a recusar push na `main` (r02) e edição de `sistemas/` na `main` (r11), e o fluxo dos `## Passos` vale daí em diante. Quem liga tudo é o script `instalar_guardas.py`; você não roda `vercel env add` nem `gh secret set` na mão, porque o valor de chave nunca pode passar pelo chat nem pela linha de comando.

**Pasta principal, nunca cópia de trabalho.** O vínculo da Vercel e o `credenciais/.env` (ignorados pelo git) só existem na pasta principal da Casa. Todo bloco abaixo calcula `CASA=$(dirname "$(git rev-parse --path-format=absolute --git-common-dir)")`: numa cópia de trabalho aponta para a pasta principal; fora dela, para a própria raiz.

**Antes de rodar**, sem abrir `credenciais/.env`:

- `vercel` e `gh` instalados e `gh auth status` logado. O script confere e para com a instrução se faltar.
- O sistema montado em `sistemas/empresa-os/` e o banco ligado (passo de ligar o projeto da `tecnologia-mudar-banco`); sem isso o passo dos secrets para pedindo a chave.
- A árvore limpa: salve o que estiver pendente antes (seção "Salvar"). Depois do vínculo com a Vercel o `salvar.py` recusa a `main` (saída 3).
- O `SUPABASE_ACCESS_TOKEN`, a senha do banco e a referência do projeto em `credenciais/.env`. Faltou algum: chame `tecnologia-acessos` (chave de API, pela área de transferência) e volte aqui. Quem cria o token é o dono, no painel da Supabase (Account, Access Tokens), com validade "Never" e escopo mínimo.

**1. Ensaio, que só lê:**

```bash
CASA=$(dirname "$(git rev-parse --path-format=absolute --git-common-dir)"); python3 .agents/skills/tecnologia-publicar/scripts/instalar_guardas.py --casa "$CASA" --dry-run
```

Use o Python de `operacao/INSTALACAO.md` (campo `comando_python`; no Windows costuma ser `py -3`) no lugar de `python3`. O ensaio lista os passos e confere `vercel` e `gh`.

**2. Instalar** (o mesmo comando sem `--dry-run`). Cada passo é idempotente: pode rodar de novo sem duplicar nada, ou só um passo com `--so <passo>`. O script faz, nesta ordem:

| Passo | O que faz |
|---|---|
| `vincular_projeto` | `vercel link --yes` em `sistemas/empresa-os`. Cria o `.vercel/project.json`, o sinal de "sistema publicado". |
| `conectar_git` | `vercel git connect`: branch gera link de teste, `main` gera produção. |
| `gerar_token_qa`, `publicar_token_na_vercel` | Gera o `PREVIEW_TEST_TOKEN`, guarda em `credenciais/.env` (modo 600) e publica no ambiente preview da Vercel, com o valor num arquivo temporário. |
| `usuario_qa` | Publica `PREVIEW_QA_EMAIL` e `PREVIEW_QA_PASSWORD` no preview, do mesmo jeito, SE o dono já guardou o par em `credenciais/.env`. Sem o par o passo fica `NAO-MEDIDO` e a instalação segue. |
| `conferir_integracao_supabase` | Confere pelos NOMES (`vercel env ls`) que a integração Supabase para Vercel trouxe as três variáveis. Nunca imprime valor. |
| `copiar_guardas` | Copia os workflows e o `dependabot.yml` de `sistemas/empresa-os/.github/` para o `.github/` da raiz, o único lugar onde o GitHub os lê (`ci`, `deploy-db`, `deploy-db-homologacao`, `gitleaks`, `keep-alive`, `backup-db`). |
| `gravar_secrets` | `gh secret set` dos três segredos da automação, sempre por arquivo temporário. |
| `ligar_dependabot` | Liga alerta de vulnerabilidade e correção automática no repositório. |

O resumo, sem nenhum valor de segredo, vai para `operacao/INSTALACAO.md` (bloco `DEPLOY`; se o bloco não existir o script o cria no fim do arquivo). Saída 0 = tudo provado ou registrado como `NAO-MEDIDO`; saída 2 = parou num passo, e a mensagem diz o que falta (leia, resolva e rode de novo). Nunca diga "ligado" com saída diferente de 0.

**3. O que só o dono faz**, em palavras simples, sem esperar uma resposta para seguir com o resto:

- **Integração Supabase para Vercel (2 cliques).** "No Supabase, abra Settings, depois Integrations, instale a Vercel e autorize. Na Vercel, confirme que o app Vercel for GitHub está no repositório." Você só confere os nomes depois (`conferir_integracao_supabase`); nunca cadastra essas variáveis no painel.
- **Usuário de teste do preview.** O preview entra com um membro só de leitura, que só o dono cria: "No sistema, abra Usuários, convide um membro chamado Teste de QA com um e-mail que você consiga abrir, dê só as permissões de leitura e defina a senha pelo link do e-mail. Depois me diga pronto." O convite do sistema não aceita senha (quem abre o e-mail a define), por isso este script não cria esse usuário. Quando o dono disser pronto, guarde o par em `credenciais/.env` pelo mesmo caminho de chave de uma linha da `tecnologia-acessos` (passo 3 de "Conectar"): o dono copia o e-mail, você roda o comando da área de transferência para `PREVIEW_QA_EMAIL`; o mesmo para `PREVIEW_QA_PASSWORD`. Você nunca digita, cola nem lê a senha. Em seguida rode `--so usuario_qa`, confira os três nomes (`vercel env ls preview | grep -E "PREVIEW_TEST_TOKEN|PREVIEW_QA_EMAIL|PREVIEW_QA_PASSWORD"`) e grave `PREVIEW_QA: configurado em AAAA-MM-DD` em `operacao/sistema.md`, como descreve o passo 9a da `tecnologia-construir-tela`. Enquanto o par não existe, o QA do preview vira prova só por teste e isso não trava nada.

**4. Salvar o que o script mudou.** O script grava `.github/` e `operacao/INSTALACAO.md`, e como a Casa já tem produção publicada o caminho é o dos `## Passos`: branch curta, commit só desses caminhos, PR e merge. `.github/` é arquivo protegido: faça o passo 3a (diga que são "os testes automáticos e a publicação do GitHub" e pergunte "Posso mudar isso? Responda sim ou não."). Sem o "sim" gravado, não publique esses arquivos.

**5. Provar o backup uma vez**, depois do merge: `gh workflow run backup-db.yml`, depois `gh run list --workflow backup-db.yml --limit 1` e `gh run watch <id>`. O workflow recusa repositório público (a cópia tem dado de cliente) e só guarda o arquivo como artefato por 14 dias. Run vermelho: o motivo está no log (`gh run view <id> --log-failed`), conte ao dono sem prometer cópia que não existe. O `deploy-db.yml` ainda NÃO chama o backup antes de migrar; isso entra só depois de um run verde.

Não faz: criar o usuário de teste, mexer em ruleset ou proteção de branch (o plano grátis do repositório privado não impõe check; por isso o passo 6 dos `## Passos` espera os checks sozinho), girar chave e publicar em produção.

## Nunca

- `git push --force` ou `--force-with-lease`.
- `git reset --hard`.
- Push na `main` com sistema publicado (o `salvar.py` já recusa, saída 3).
- `vercel --prod`, `vercel promote`, `vercel rollback`.
- `supabase db push` (só a Action aplica migration).
- Seguir com o revisor em BLOCKED.
- `git add -A` ou `git add .`. Única exceção: `salvar.py --tudo`.
- `gh pr merge --auto`.
- Ler `credenciais/` para achar o endereço do site.
- Dizer "salvo" ou "no ar" sem a prova do passo 11.
- Dizer ao dono "nada foi perdido" (não dá para garantir, principalmente com migration).
- Mergear mudança em arquivo protegido (`AGENTS.md`, `CLAUDE.md`, `.githooks/`, `.codex/hooks/`, `.codex/config.toml`, `.claude/settings*.json`, `.github/`) sem o "sim" do dono gravado no texto da PR (passo 3a).
- Seguir um bloco com `PARE:` na saída, ou com número de PR ou commit vazio.
- Voltar a mudança por "Não verificado" (401 ou 403) ou por problema que já existia antes do merge (foto do 8a).
