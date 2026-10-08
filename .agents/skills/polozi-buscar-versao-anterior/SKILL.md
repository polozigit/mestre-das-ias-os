---
name: polozi-buscar-versao-anterior
description: "Recupera versões anteriores de arquivos no histórico do GitHub. Use em 'apaguei sem querer' ou 'como estava antes'."
---

# Buscar Versão Anterior (a máquina do tempo do GitHub)

Todo salvamento é uma foto no GitHub. Esta skill acha a foto certa e recupera, sempre mostrando antes de restaurar.

## Preparar

1. Entender O QUE recuperar (arquivo ou pasta) e DE QUANDO ("ontem", "antes da mudança X", "a versão que eu mandei pro cliente").
2. Confirmar que o arquivo já foi versionado alguma vez (`git log -- <arquivo>` não vazio). Nunca foi salvo? Não existe versão anterior — avise e pare aqui.

## Executar

1. Mostrar o histórico traduzido, nunca hash cru:
   ```bash
   git log --oneline --date=format:'%d/%m %H:%M' --pretty='%h  %ad  %s' -- <arquivo>
   ```
   Apresentar como lista humana: "ontem 18h02: dossiê atualizado" — não "a4f21c9".
2. Mostrar ANTES de restaurar, sempre: `git show <hash>:<arquivo>` (ou o diff) — o dono confirma que é essa a versão.
3. A versão ATUAL do arquivo nunca foi salva? Oferecer guardar uma cópia (`<arquivo>.hoje.md`) antes de restaurar — sem isso ela se perde.
4. Restaurar com confirmação explícita:
   - Recuperar arquivo apagado ou voltar arquivo específico: `git checkout <hash> -- <arquivo>` — avisar que a versão ATUAL do arquivo será substituída (a atual continua recuperável pelo histórico, se foi salva).
5. Fechar o ciclo: registre a restauração no CHANGELOG e salve (commit) avisando em 1 linha.

## Verificar

1. `git status` confirma a mudança antes do commit de fechamento; depois, o histórico mostra o commit da restauração.
2. `operacao/CHANGELOG.md` tem a linha nova (o quê foi restaurado, de quando, por quê).
3. Se o pedido era recuperar arquivo apagado, confirme que ele existe de novo no disco.

## Limites

- Nunca `git reset --hard`, `git push --force` ou reescrita de histórico — se o caso parecer exigir isso, parar e explicar que precisa de ajuda técnica humana.
- Só restaurar com confirmação explícita depois de mostrar a versão — nunca sobrescrever calado.
- Arquivo nunca foi salvo (sem commit)? Não existe versão anterior — não inventar uma.

## Quando você tiver sócio (não é aula, é referência)

Com 2 pessoas no mesmo GitHub, o fluxo ganha uma etapa de revisão: cada um trabalha numa cópia (branch), propõe a mudança (`gh pr create`), o outro lê e aprova (merge). O commit da restauração, e esse fluxo de branch e PR quando chegar a hora, passam pela skill `tecnologia-publicar`.
