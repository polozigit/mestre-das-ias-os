---
name: tecnologia-mudar-banco
description: "Muda o banco do sistema com segurança: escreve a migration no padrão do modelo, testa, classifica (só acrescenta ou destrutiva), tira cópia, ensaia na homologação e pede o 'sim' do dono só quando pode apagar dado. Use quando a mudança precisar de tabela, coluna, regra de acesso ou função nova, ou quando o instalador pedir o banco."
metadata:
  origem: polozi
  diretoria: tecnologia
---

# tecnologia-mudar-banco

Toda mudança no banco passa por aqui. O dono não lê SQL: ele ouve o que vai mudar, e só é perguntado quando a mudança pode apagar dado dele.

Dois tipos de migration (regra da casa, definida em `.agents/skills/tecnologia-mudar-banco/scripts/classificar_migration.py`):

- **Acrescenta**: tabela, coluna, índice, função, regra de acesso novos. Segue sem perguntar.
- **Destrutiva**: pode perder dado (`DROP TABLE`, `DROP COLUMN` ou só `DROP <coluna>` dentro de `ALTER TABLE`, `DROP SEQUENCE`, `DROP OWNED`, `TRUNCATE`, `DELETE`, `UPDATE`, renomear, trocar tipo de coluna e afins). Só segue com o "sim" explícito do dono.

Fatos do sistema usados aqui, com `arquivo:linha`, estão em `.agents/skills/tecnologia-sistema/referencias/regras-do-sistema.md` (seções 2 a 6, 10). Comandos abaixo rodam da raiz da Casa (a pasta do repositório do aluno).

## Passos

1. **Ler o sistema antes de escrever.** Siga a skill `tecnologia-sistema`: gere o mapa do banco na hora e leia as regras. Veja o que já existe antes de criar tabela ou função nova (não duplique).

2. **Escrever a migration** em `sistemas/empresa-os/supabase/migrations/<NNNN>_<assunto>.sql`.
   - Número: o próximo livre. `ls sistemas/empresa-os/supabase/migrations | sort | tail -3` mostra as últimas; some 1 à maior.
   - **Idempotente**: rodar 2 vezes não quebra nem duplica (`IF NOT EXISTS`, `CREATE OR REPLACE`, `DROP POLICY IF EXISTS` seguido de `CREATE POLICY`, `ON CONFLICT`). O CI roda todas as migrations duas vezes, a segunda já com dado.
   - **GRANT explícito**: tabela nova nasce com RLS ligado e SEM permissão. Sem `GRANT` para `authenticated` (e `service_role` quando uma função do servidor lê), a tela abre VAZIA e sem erro. Função nova nasce sem EXECUTE para `anon`; conceda a `authenticated` só se a tela chamar essa função.
   - **Policy com os helpers da 0004**: `usuario_atual()`, `e_dono()`, `tem_permissao('<modulo>.<acao>')`. Nunca faça subconsulta direta em `usuarios` dentro de policy (recursão).
   - **Smoke no fim**: um bloco `DO $$ ... $$` que prova o que a migration criou; exceção ali = a migration FALHOU.
   - **Rollback comentado** no rodapé do próprio arquivo (como comentário, nunca como comando solto).
   - **Teste pgTAP** em `sistemas/empresa-os/supabase/tests/NNN_<assunto>.sql` (próximo número livre da pasta) provando o GRANT e a negação COMO usuário: quem pode, lê; quem não pode, não lê nem escreve; `anon` não vê nada.
   - Schema novo (fora de `public`): além da migration, precisa ser exposto no painel do projeto (Project Settings, Data API, Exposed schemas), senão a consulta falha com `PGRST106`. A IA faz isso no painel do Supabase, no Chrome do dono (Computer Use).
   - **Regerar os tipos** no mesmo commit (o CI confere): com a pilha local no ar (passo 3), `(cd sistemas/empresa-os && supabase gen types typescript --local --schema public,tarefas,organograma > src/types/supabase.gen.ts)`. Se criou schema novo, inclua o nome dele na lista `--schema`.

3. **Testar local.** Primeiro veja se há Docker: `docker info > /dev/null 2>&1 && echo com-docker || echo sem-docker`.
   - `com-docker`: `(cd sistemas/empresa-os && bash scripts/testar-migrations-local.sh)`. Vermelho = corrija a migration e rode de novo. Não siga com vermelho.
   - `sem-docker`: diga ao dono, sem jargão, "não consegui testar no meu computador; vou confiar no teste automático do GitHub antes de colocar no ar". Não invente que testou. O job `banco` do CI roda as migrations duas vezes e os testes pgTAP.

4. **Classificar.** `python3 .agents/skills/tecnologia-mudar-banco/scripts/classificar_migration.py sistemas/empresa-os/supabase/migrations/<NNNN>_<assunto>.sql`. Saída 0 = acrescenta; 1 = destrutiva (lista o que achou); 2 = erro de uso. A classificação vale para o arquivo como está: se editar a migration depois, classifique de novo.

5. **Se for destrutiva, pergunte ao dono.** Rode o classificador com `--json` ou leia a lista que ele imprime e mostre sem jargão o que vai sumir: qual tabela ou coluna e, se souber, quantas linhas. Só conte linhas se já tiver um caminho de leitura sem credencial (por exemplo o MCP do Supabase só para `SELECT count(*)`); senão diga "não sei quantos registros há". Depois pergunte exatamente: "Posso apagar? Responda sim ou não."
   - Só o "sim" explícito do dono vale. "Ok", silêncio, "pode seguir" sobre outro assunto ou o "sim" de outra migration não valem. Dúvida = pergunte de novo.
   - Guarde duas coisas para o passo 7: a frase literal (formato `<nome> em <AAAA-MM-DD>: <frase literal>`, com a data de hoje de `date +%F`) e a lista exata do que foi mostrado ao dono (cada achado do classificador).
   - Não prometa que dá para recuperar. Diga: "Vou tirar uma cópia antes e testar que ela abre, mas desfazer depois dá trabalho e não é garantido."
   - "Não" do dono: pare, não grave veredito APPROVED, ofereça outro caminho (por exemplo acrescentar a coluna nova e manter a antiga).

6. **Cópia antes.** Faça antes de chamar `tecnologia-publicar`: em produção a migration entra assim que a PR é aceita.

   **Pasta principal, nunca worktree.** O vínculo do `supabase link` (arquivo local ignorado pelo git, que só existe na pasta onde o link foi feito) e a pasta `operacao/backups/` moram na pasta principal da Casa. Num worktree, o `--linked` não acharia o projeto e a cópia seria apagada junto com o worktree. Por isso os blocos do passo 6 e do passo 8 começam com `CASA=$(dirname "$(git rev-parse --path-format=absolute --git-common-dir)")` (num worktree aponta para a pasta principal; fora dele, para a própria raiz) e usam `"$CASA/operacao/backups"` e `(cd "$CASA/sistemas/empresa-os" && supabase ...)`.

   **6a. Confirmar que o projeto ligado é o de PRODUÇÃO** (não o de homologação). Todo comando `supabase ... --linked` age no projeto ligado à pasta `sistemas/empresa-os/supabase` da pasta principal, por isso todos rodam dentro dela, num subshell `(cd "$CASA/sistemas/empresa-os" && ...)`.
   - `CASA=$(dirname "$(git rev-parse --path-format=absolute --git-common-dir)") && (cd "$CASA/sistemas/empresa-os" && supabase projects list)`: a linha marcada na coluna LINKED é o projeto ligado a esta pasta (formato da saída não conferido aqui, sem rede); nenhuma linha marcada = não ligado.
   - O ref de produção fica na linha `SUPABASE_PROJECT_REF: <ref>` de `operacao/sistema.md` (arquivo sem segredo). Se a linha existe, o ref ligado tem de ser igual a ela. Se não existe, mostre ao dono o nome e o ref do projeto ligado e pergunte: "Este é o banco do sistema que seus clientes usam de verdade, e não o de testes? Responda sim ou não." Com "sim", grave a linha `SUPABASE_PROJECT_REF: <ref>` em `operacao/sistema.md`.
   - Ref diferente, ou "não": pare. Não religue por conta própria e não adivinhe qual projeto é qual.
   - Não ligado: pare. Ligar pede a senha do banco, que só o dono digita. Monte você a linha, com a pasta principal e o ref já preenchidos (`cd "<valor de $CASA>/sistemas/empresa-os" && supabase link --project-ref <ref>`; o ref é o da linha `SUPABASE_PROJECT_REF` ou o da lista acima), e mande ao dono este passo a passo, sem explicar o comando:
     1. "Falta ligar este computador ao banco do sistema. É uma vez só, e pede a senha do banco, que só você digita."
     2. "Abra o aplicativo Terminal. No Mac: aperte Command e Espaço, escreva Terminal e aperte Enter. No Windows: abra o menu Iniciar, escreva PowerShell e aperte Enter."
     3. "Copie a linha abaixo, cole no Terminal e aperte Enter." (no Windows, troque `&&` por `;` na linha que você manda)
     4. "Quando ele pedir a senha do banco, digite e aperte Enter. O que você digita não aparece na tela; é assim mesmo. Se não lembrar a senha, no site do Supabase abra o projeto, entre nas configurações do banco (Database) e use a opção de trocar a senha do banco (Reset database password)."
     5. "Quando terminar, me diga pronto."
     Depois do "pronto", refaça o 6a desde o começo. Você nunca digita nem lê essa senha.

   **6b. Tirar e provar a cópia.** Um bloco só (as variáveis não passam de uma chamada para outra). Troque `0022_assunto` pelo nome real da migration, sem `.sql`. O mínimo de tabelas é o total do mapa da `main` do GitHub, que é o que está em produção (a migration nova ainda não entrou), porque o backup é de antes dela.
   ```bash
   MIG=0022_assunto; CASA=$(dirname "$(git rev-parse --path-format=absolute --git-common-dir)"); B="$CASA/operacao/backups"; A="$B/$(date +%F)-antes-$MIG"; D=$(mktemp -d)
   mkdir -p "$B" && (cd "$CASA/sistemas/empresa-os" && supabase db dump --linked -f "$A.sql" && supabase db dump --linked --data-only -f "$A-dados.sql") && git fetch origin && git archive origin/main sistemas/empresa-os/supabase/migrations | tar -x -C "$D" && N=$(python3 .agents/skills/tecnologia-sistema/scripts/gerar_mapa_sistema.py --migrations "$D/sistemas/empresa-os/supabase/migrations" | grep -o 'Total de tabelas: [0-9]*' | grep -o '[0-9]*$') && python3 .agents/skills/tecnologia-vigiar/scripts/testar_restauracao.py "$A.sql" --minimo-tabelas "$N" && python3 .agents/skills/tecnologia-vigiar/scripts/testar_restauracao.py "$A-dados.sql" --minimo-tabelas 0 --so-dados
   ```
   - O comando lê o banco de produção (só leitura) e precisa de Docker (o `pg_dump` roda num contêiner). Se o CLI pedir a senha do banco ou não achar Docker: pare e diga ao dono em 1 frase o que falta. Não leia `credenciais/` (o hook bloqueia) e nunca passe a senha com `--password` (ela aparece na lista de processos).
   - **Nunca use `--dry-run`**: ele imprime o script com a senha na tela.
   - `operacao/backups/` (da pasta principal, `$CASA`) não vai para o GitHub (é dado real do cliente; o `.gitignore` da Casa já cobre). Não mova esses arquivos para outra pasta.
   - Saída 0 nos dois testes = a cópia está inteira. Saída 1 = não serve (o script diz por quê). Se faltarem tabelas, leia o mapa e o arquivo antes de concluir; não baixe o número só para passar. Migration destrutiva sem cópia boa: não siga.
   - Sem cópia possível e a migration só acrescenta (pelo classificador): diga ao dono que não conseguiu tirar a cópia e por quê, e que a mudança só acrescenta; siga só se ele aceitar.
   - Se o script avisar "Tem segredo no backup" (o dado do cliente tem algo parecido com uma chave): NÃO apague o arquivo, ele continua sendo a cópia do dono. Diga ao dono em 1 frase: "Achei algo parecido com uma senha dentro dos seus dados; a cópia fica só neste computador e eu não envio nem subo para o GitHub." Siga com a mudança, e nunca faça commit nem envio desse arquivo.
   - Anote o nome do arquivo (`ls -t "$(dirname "$(git rev-parse --path-format=absolute --git-common-dir)")/operacao/backups" | head -1` mostra o mais recente) e o resultado dos dois testes: entram no `--nota` do passo 7.

7. **Revisão e veredito.** Chame o subagente `tecnologia-revisor-seguranca` no formato de entrada dele: `chamado_por: tecnologia-mudar-banco`; `arquivos: ["sistemas/empresa-os/supabase/migrations/<NNNN>_<assunto>.sql", "sistemas/empresa-os/supabase/tests/<NNN>_<assunto>.sql", "sistemas/empresa-os/src/types/supabase.gen.ts"]` (a migration, o teste pgTAP e os tipos regerados do passo 2); `migrations: [{"arquivo": "<o .sql>", "classificacao": "<saída do passo 4>", "veredito_conferir": "ainda não gravado"}]` (o veredito nasce depois da resposta dele); e em `mapa` o que o mapa diz sobre as tabelas tocadas. Sem a lista `arquivos` ele devolve BLOCKED. Ele devolve APPROVED ou BLOCKED.
   - APPROVED, acrescenta: `python3 .agents/skills/tecnologia-mudar-banco/scripts/veredito.py gravar sistemas/empresa-os/supabase/migrations/<NNNN>_<assunto>.sql --revisor tecnologia-revisor-seguranca --resultado APPROVED --nota 'backup: <nome do arquivo>; restauração: saída 0'`
   - APPROVED, destrutiva: o mesmo comando, mais `--aprovado-por-dono '<nome> em <AAAA-MM-DD>: <frase literal do passo 5>'`, e a `--nota` fica `'backup: <nome do arquivo>; restauração: saída 0; mostrado ao dono: <lista exata do passo 5>'`. Sem a frase do dono, ou com uma frase sem a palavra "sim" depois dos dois pontos, o script recusa (saída 2).
   - Aspas: use aspas SIMPLES nessas duas opções e escreva a data de verdade (nada de `$(date)` dentro delas). Se a frase do dono tiver um apóstrofo, troque cada `'` por `'\''` (fecha a aspa, apóstrofo protegido, abre de novo). Exemplo: a frase `não d'água` vira `'não d'\''água'`.
   - BLOCKED: grave com `--resultado BLOCKED --nota '<motivo em 1 frase>'`, corrija a migration UMA vez, volte ao passo 3 e chame o revisor UMA vez só para conferir os achados corrigidos. BLOCKED de novo = PARE, não faça merge, registre o motivo em `operacao/PENDENCIAS.md` e conte ao dono em 1 linha. Nunca faça uma 3ª chamada ao revisor (teto do kit: 1 revisão + 1 correção por etapa, nunca em loop). Nunca siga com BLOCKED. Depois da correção, classifique de novo (passo 4): se a lista de achados destrutivos mudou (item novo ou diferente do que o dono viu), pergunte ao dono de novo e use a nova frase; o "sim" antigo só cobre a lista que ele viu. Lista igual = o "sim" anterior continua valendo.
   - O veredito vale para o arquivo exato (sha256). Editou a migration depois? Regrave o veredito (o `pre-commit` da Casa bloqueia o commit com sha diferente). O arquivo fica em `operacao/vereditos/<nome>.json` e vai no MESMO commit da migration (passo 2 da `tecnologia-publicar`).

8. **Publicar.** Antes de chamar, confira se a cópia ainda é recente: `find "$(dirname "$(git rev-parse --path-format=absolute --git-common-dir)")/operacao/backups" -name '*-antes-<NNNN>_<assunto>.sql' -mmin -1440 | grep -q . && echo recente || echo velha`. Se a cópia tem mais de 24 horas, ou se chegou dado novo desde então (o dono avisou, ou o sistema está em uso), refaça o passo 6b logo antes do merge. Se o `tecnologia-publicar` ficar parado esperando (check vermelho, dono sem responder) e o merge ficar para depois de 24 horas, pare antes do merge e refaça a cópia também. Então chame a skill `tecnologia-publicar`: o ensaio na homologação roda na PR (`deploy-db-homologacao.yml`, com o dado de exemplo); a produção só muda depois do merge, pela Action `deploy-db.yml`. Quem confere e fala "no ar" é o `tecnologia-publicar`, com prova.

## Como falar com o dono

- Acrescenta: "Vou acrescentar <o quê, em palavras do negócio>. Nada que já existe é apagado." Só diga isso se o classificador deu exit 0 e a revisão passou.
- Destrutiva: a pergunta do passo 5. Nada de nome de tabela técnica sem explicar o que ela guarda.
- Falha: diga o que não andou e o que você faz agora, em 1 ou 2 frases.

## Fontes

- Migrations como único caminho de mudança de schema: https://supabase.com/docs/guides/deployment/database-migrations
- `supabase db dump` (flags `--linked`, `--data-only`, `--file`; `--dry-run` imprime o script): https://supabase.com/docs/reference/cli/supabase-db-dump (as flags foram conferidas também com `supabase db dump --help` no CLI local)
- Plano grátis sem backup diário; a doc recomenda `db dump` e cópia fora do Supabase: https://supabase.com/docs/guides/platform/backups
- NIST SP 800-218 (SSDF), PW.8.1 e PW.8.2 (testar o código executável) e PO.5.1 (separar e proteger cada ambiente): https://nvlpubs.nist.gov/nistpubs/SpecialPublications/NIST.SP.800-218.pdf
- OWASP LLM Top 10 2025, LLM06 Excessive Agency (aprovação humana em ação de alto impacto): https://genai.owasp.org/llmrisk/llm062025-excessive-agency/
- A divisão acrescenta/destrutiva é regra da casa; não há fonte oficial que a defina. O "sim" do dono apoia-se na mitigação do OWASP acima.

## Nunca

- `supabase db push`, `apply_migration` ou SQL de DDL direto em produção (o hook bloqueia; só a Action aplica migration).
- Mudar o banco pelo painel do Supabase.
- Apagar backup.
- Seguir com migration destrutiva sem o "sim" explícito do dono gravado no veredito.
- Usar o "sim" de uma migration em outra.
- Editar a migration depois do veredito sem regravar o veredito.
- `supabase db dump --dry-run` ou `--password` na linha de comando.
- `--permitir-remoto` no `testar_restauracao.py` (a restauração é só em banco local de teste).
- Rodar `supabase ... --linked` sem ter confirmado o projeto ligado (passo 6a), ou religar o projeto por conta própria.
- Apagar ou enviar o arquivo de backup, mesmo quando o script avisar de segredo nele.
- Ler `credenciais/` para achar senha do banco.
- Prometer ao dono que nada será perdido ou que dá para desfazer.
