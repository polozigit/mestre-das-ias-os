---
name: tecnologia-vigiar
description: "Rotina de saúde do sistema: alertas de segurança e desempenho do Supabase, site no ar, último deploy, e cópia semanal do banco com restauração testada. Use em 'como está o sistema', 'o sistema caiu?', 'faz o backup', e como rotina agendada diária."
metadata:
  origem: polozi
  diretoria: tecnologia
---

# tecnologia-vigiar

Olha o sistema todo dia, tira cópia do banco toda semana e prova todo mês que a cópia volta. Só observa e avisa. Corrigir é com `tecnologia-mudar-banco` (banco) ou `tecnologia-publicar` (código): nunca conserte em produção por aqui.

Fatos do sistema (workflows, plano grátis, hook) em `.agents/skills/tecnologia-sistema/referencias/regras-do-sistema.md`, seções 7, 10 e 11. Comandos rodam da raiz da Casa.

**Pasta principal, nunca worktree.** As cópias do banco e o vínculo do `supabase link` (arquivo local ignorado pelo git, que só existe na pasta onde o link foi feito) moram na pasta principal da Casa. Num worktree, `operacao/backups/` seria apagada junto com ele e o `--linked` não acharia o projeto. Por isso todo bloco que mexe em cópia ou usa `--linked` começa com `CASA=$(dirname "$(git rev-parse --path-format=absolute --git-common-dir)")`: num worktree aponta para a pasta principal; fora dele, para a própria raiz. Use `"$CASA/operacao/backups"` e `(cd "$CASA/sistemas/empresa-os" && supabase ...)`.

## Registro

Tudo vai para `operacao/vigilancia/<AAAA-MM>.md` (um arquivo por mês; crie se não existir). Uma linha por rodada, neste formato:

`AAAA-MM-DD | site: ok, fora ou não verificado | vercel: <estado do deploy de produção> | advisors: <E> erros, <W> avisos (<nomes>) | actions: ok ou falha em <workflow>`

A data vem de `date +%F`. O arquivo só tem nomes e números, nunca valor de segredo nem mensagem de erro inteira. O rascunho `operacao/vigilancia/entrada.json` e a pasta `operacao/backups/` não sobem para o GitHub.

## Diário

1. **Site no ar.** O endereço é a linha `SITE_URL: <endereço>` de `operacao/sistema.md`. Sem a linha, siga o passo 8a da skill `tecnologia-publicar` (nunca invente nem leia `credenciais/`). Depois:
   `python3 .agents/skills/tecnologia-publicar/scripts/checar_producao.py "$(grep -m1 '^SITE_URL:' operacao/sistema.md | sed 's/^SITE_URL:[[:space:]]*//')"`
   Saída 0 = no ar. Saída 1 = o script lista os motivos em português: é achado. Linhas que começam com "Não verificado" (401 ou 403) não são site fora: o endereço pede autorização; registre `site: não verificado` e acerte a linha `SITE_URL` (passo 8a da `tecnologia-publicar`).

2. **Alertas do Supabase** (segurança e desempenho). Com o MCP do Supabase disponível: `get_advisors` com `type` `security` e de novo com `performance`. Sem MCP: `CASA=$(dirname "$(git rev-parse --path-format=absolute --git-common-dir)") && (cd "$CASA/sistemas/empresa-os" && supabase db advisors --linked --type all --level warn)` (flags conferidas com `--help` no CLI local). Antes de qualquer `--linked`, faça o passo 6a da skill `tecnologia-mudar-banco`: confirmar que o projeto ligado é o de produção; se não estiver ligado, pare e diga ao dono que falta ligar (a senha do banco só ele digita), sem ler `credenciais/`. Liste os de nível ERROR e WARN e compare com as linhas anteriores do arquivo do mês (e do mês passado): são "novos" os que não aparecem lá. Só os novos viram aviso ao dono; os antigos ficam na contagem da linha.

3. **Últimas execuções do GitHub e deploy da Vercel.** Um comando para os três fluxos (`ci`, `deploy-db`, `keep-alive`):
   `for w in ci deploy-db keep-alive; do echo "== $w"; gh run list --workflow "$w.yml" --limit 5 --json conclusion,createdAt,url --jq '.[] | "\(.createdAt) \(.conclusion) \(.url)"'; done`
   A execução mais recente de cada um com `failure`, `startup_failure` ou `timed_out` é achado. Falha antiga já seguida de sucesso só entra no registro. `keep-alive` falhando importa: é ele que toca o banco por dia para o projeto grátis não pausar.

   Depois, o deploy de produção da Vercel do último commit da `main` (a mesma consulta de deployments e statuses do passo 9.3 da `tecnologia-publicar`):
   ```bash
   SHA=$(gh api "repos/{owner}/{repo}/commits/main" --jq .sha); if [ -z "$SHA" ]; then echo "PARE: não li o último commit da main"; else DEP=$(gh api "repos/{owner}/{repo}/deployments?sha=$SHA" --jq '.[0].id // empty'); if [ -z "$DEP" ]; then echo "vercel: sem deploy para $SHA"; else gh api "repos/{owner}/{repo}/deployments/$DEP/statuses" --jq '"vercel: \(.[0].state // "pendente")"'; fi; fi
   ```
   `success` = ok. `failure` ou `error` = achado: o site ficou na versão anterior e a `main` tem mudança que não subiu (quem resolve é a `tecnologia-publicar`, passo 10). Sem deploy ou ainda pendente: registre e confira de novo na próxima rodada; o mesmo commit sem `success` em duas rodadas seguidas é achado.

4. **Registrar a linha** do mês. Achado novo: avise o dono (abaixo). Sem achado: não incomode o dono.

## Semanal: cópia do banco com prova

Primeiro o passo 6a da skill `tecnologia-mudar-banco` (confirmar que o projeto ligado é o de produção, ou parar e avisar o dono). Depois um bloco só, com os mesmos comandos do passo 6b, nome `<data>-semanal` no lugar de `<data>-antes-<migration>` e o mínimo de tabelas igual ao total do mapa da `main` do GitHub (o que está em produção):

```bash
CASA=$(dirname "$(git rev-parse --path-format=absolute --git-common-dir)"); B="$CASA/operacao/backups"; A="$B/$(date +%F)-semanal"; D=$(mktemp -d)
mkdir -p "$B" && (cd "$CASA/sistemas/empresa-os" && supabase db dump --linked -f "$A.sql" && supabase db dump --linked --data-only -f "$A-dados.sql") && git fetch origin && git archive origin/main sistemas/empresa-os/supabase/migrations | tar -x -C "$D" && N=$(python3 .agents/skills/tecnologia-sistema/scripts/gerar_mapa_sistema.py --migrations "$D/sistemas/empresa-os/supabase/migrations" | grep -o 'Total de tabelas: [0-9]*' | grep -o '[0-9]*$') && python3 .agents/skills/tecnologia-vigiar/scripts/testar_restauracao.py "$A.sql" --minimo-tabelas "$N" && python3 .agents/skills/tecnologia-vigiar/scripts/testar_restauracao.py "$A-dados.sql" --minimo-tabelas 0 --so-dados
```

Saída 0 nos dois testes = cópia inteira. Saída 1 = a cópia desta semana não serve: é achado, e o motivo vem escrito pelo script. Aviso "Tem segredo no backup" não reprova: o arquivo continua sendo a cópia do dono; não o apague, não o envie, não o suba para o GitHub, e diga ao dono em 1 frase que a cópia tem algo parecido com uma senha e fica só neste computador. Regras do `db dump`: nunca `--dry-run` (imprime a senha), nunca `--password` na linha, nunca apagar backup (só o dono pede). Sem Docker ou sem a senha do banco, diga ao dono o que falta; não finja que fez.

O plano grátis do Supabase não tem backup diário, então esta cópia é a única. A pasta `operacao/backups/` da pasta principal (`$CASA`) fica só neste computador (tem dado real do cliente). Uma cópia no mesmo computador não protege de perder o computador: uma vez por mês, lembre o dono de guardar uma cópia fora dele (disco externo ou nuvem pessoal dele). Você não envia o arquivo para lugar nenhum.

## Mensal: restaurar de verdade num banco de teste

Cópia que nunca foi restaurada é só esperança. Este caminho usa um banco local vazio, nunca o de produção. O script recusa qualquer endereço que não seja este computador e qualquer URL com o `SUPABASE_PROJECT_ID` de produção. A URL vai ao `psql` pelo ambiente, nunca pela linha de comando. Se `SUPABASE_PROJECT_ID` não estiver no ambiente, o script avisa que a única trava foi o endereço ser deste computador: registre o aviso junto do resultado.

Este caminho local depende de Docker e de `psql`. Os comandos abaixo não foram executados na construção desta skill (sem Docker nem rede lá). Na primeira vez que rodar, se algum passo falhar, registre o erro literal e escreva "restauração NÃO provada"; não escreva "restaurado" sem o script ter dado saída 0.

1. Pilha local vazia (sem as migrations do sistema, só o que o Supabase traz). Se a pilha local do próprio sistema estiver no ar (porta 54322 ocupada), pare-a antes com `(cd sistemas/empresa-os && supabase stop)`. Depois:
   ```bash
   CASA=$(dirname "$(git rev-parse --path-format=absolute --git-common-dir)"); mkdir -p "$CASA/operacao/backups/teste-restauracao" && (cd "$CASA/operacao/backups/teste-restauracao" && supabase init --force && supabase start)
   ```
2. Restaurar a estrutura e depois os dados, a partir da cópia semanal mais recente (um bloco só; a URL é a padrão do banco local, sem segredo real):
   ```bash
   CASA=$(dirname "$(git rev-parse --path-format=absolute --git-common-dir)"); A=$(ls -t "$CASA"/operacao/backups/*-semanal.sql | head -1); D=$(mktemp -d); git fetch origin && git archive origin/main sistemas/empresa-os/supabase/migrations | tar -x -C "$D"; N=$(python3 .agents/skills/tecnologia-sistema/scripts/gerar_mapa_sistema.py --migrations "$D/sistemas/empresa-os/supabase/migrations" | grep -o 'Total de tabelas: [0-9]*' | grep -o '[0-9]*$'); U="postgresql://postgres:postgres@127.0.0.1:54322/postgres"
   python3 .agents/skills/tecnologia-vigiar/scripts/testar_restauracao.py "$A" --minimo-tabelas "$N" --restaurar-em "$U" && python3 .agents/skills/tecnologia-vigiar/scripts/testar_restauracao.py "${A%.sql}-dados.sql" --minimo-tabelas 0 --so-dados --restaurar-em "$U"
   ```
   Os dois com saída 0 = restaurou sem erro (o `psql` roda com `ON_ERROR_STOP=1`). Qualquer erro = restauração falhou: é achado.
3. Contar o que voltou: `psql "postgresql://postgres:postgres@127.0.0.1:54322/postgres" -tAc "select count(*) from information_schema.tables where table_type='BASE TABLE' and table_schema in ('public','tarefas','organograma')"`.
4. Registrar em `operacao/vigilancia/BACKUPS.md` a linha `restaurado em AAAA-MM-DD, <N> tabelas` com o número do passo 3 (ou `restauração NÃO provada em AAAA-MM-DD: <erro em 1 linha>`).
5. Desligar e apagar o banco de teste: `CASA=$(dirname "$(git rev-parse --path-format=absolute --git-common-dir)"); (cd "$CASA/operacao/backups/teste-restauracao" && supabase stop --no-backup)`. Isso apaga só os dados desse banco de teste, nunca os backups.

## Quando achar algo: avisar o dono

Em 1 frase, com o que fazer, sem jargão e sem promessa que você não prova:

- Deploy da Vercel falhou: "A última mudança não chegou ao site (a publicação falhou); o site segue na versão anterior. Estou olhando." Quem resolve é a `tecnologia-publicar`.
- Site fora: "O site não está respondendo (<motivo do script>). Vou olhar o último deploy e, se a causa for a última mudança, aciono a volta pelo fluxo de publicação. Não garanto que isso resolva; aviso o resultado." Quem faz a volta é a skill `tecnologia-publicar` (passo 10); mudança de banco que já entrou não volta junto com ela.
- Alerta novo de segurança: "O Supabase avisou que <o que significa, em palavras do negócio>. Proponho corrigir assim: <1 frase>. Posso seguir?"
- Cópia que não serve ou restauração que falhou: "A cópia de segurança desta semana não passou no teste (<motivo>). Vou refazer; até lá, considere que o banco está sem cópia boa."
- Falha do GitHub: "Um teste automático falhou (<qual>). Estou olhando."

Corrigir: banco passa por `tecnologia-mudar-banco`; código e site por `tecnologia-publicar`. Nada de SQL, push ou ajuste direto em produção por esta skill.

## Rotina agendada

Diário: passos 1 a 4 (inclui o deploy da Vercel do passo 3), só avisando o dono se houver achado novo. Semanal: o bloco da cópia. Mensal: o bloco da restauração, mais o lembrete da cópia fora do computador.

## Fontes

- Google SRE, SLO e orçamento de erro: https://sre.google/sre-book/service-level-objectives/ ; postmortem sem culpa: https://sre.google/sre-book/postmortem-culture/ (base para olhar o serviço por números e registrar sem culpa).
- CIS Control 11, Data Recovery: https://www.cisecurity.org/controls/data-recovery . Só o objetivo do controle foi lido na fonte primária; a lista das salvaguardas 11.1 a 11.5 e a marca IG1 NÃO foram confirmadas lá (só em busca de terceiros), então não as cite como fato.
- Supabase, backups: plano grátis sem backup diário, a doc recomenda `db dump` e cópia fora do Supabase: https://supabase.com/docs/guides/platform/backups
- Supabase, `db dump`: https://supabase.com/docs/reference/cli/supabase-db-dump ; advisors (`get_advisors`, `supabase db advisors`): https://supabase.com/docs/guides/database/database-linter
- 3-2-1 (CISA): 3 cópias, 2 mídias, 1 fora do local: https://www.cisa.gov/sites/default/files/publications/data_backup_options.pdf

## Nunca

- Corrigir algo em produção sem passar por `tecnologia-mudar-banco` ou `tecnologia-publicar`.
- `supabase db push`, `apply_migration` ou DDL direto em produção.
- `supabase db dump --dry-run` ou `--password`; apagar backup.
- Restaurar em endereço que não seja banco de teste local (o script recusa produção, mas não confie só nele).
- `--permitir-remoto` no `testar_restauracao.py`.
- Rodar `supabase ... --linked` sem ter confirmado o projeto ligado (passo 6a da `tecnologia-mudar-banco`), ou religar o projeto por conta própria.
- Enviar ou subir para o GitHub o arquivo de backup, mesmo quando o script avisar de segredo nele.
- Escrever "restaurado" sem a saída 0 do `testar_restauracao.py`.
- Ler `credenciais/`.
- Incomodar o dono quando não há achado novo.
