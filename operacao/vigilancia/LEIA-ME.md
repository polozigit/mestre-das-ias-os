# Vigília

A skill `tecnologia-vigiar` olha o sistema todo dia e escreve aqui, só ela: um
arquivo por mês (`AAAA-MM.md`) com uma linha por rodada, neste formato:

`AAAA-MM-DD | site: ok, fora ou não verificado | vercel: <estado do deploy> | advisors: <E> erros, <W> avisos (<nomes>) | actions: ok ou falha em <workflow>`

- `BACKUPS.md` é a prova VERSIONADA de que a cópia do banco foi restaurada num
  banco de teste. A cópia em si fica em `operacao/backups/`, que também NÃO sobe
  pro GitHub (é dado real de cliente).
- `entrada.json` é o rascunho local da leitura dos alertas do banco; não sobe
  pro GitHub (git-ignored) e não é lido pela retrospectiva.

A vigília NÃO corrige nada sozinha, não aplica migration e não publica: achado
vira aviso ao dono e proposta na `$polozi-retrospectiva`.
