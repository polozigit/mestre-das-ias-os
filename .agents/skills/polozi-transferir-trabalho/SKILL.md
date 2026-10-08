---
name: polozi-transferir-trabalho
description: "Passa trabalho inacabado pra sessão nova: handoff + prompt de continuação. Use se a sessão esticou; não use se já terminou."
---

# Polozi Transferir Trabalho

Preservar o trabalho em andamento e entregar ao dono o caminho exato de continuação — sem concluir, sem perder nada — quando a sessão atual não deve seguir até o fim. A Casa é sempre `main`: não existe branch nem cópia paralela do trabalho do aluno.

## Antes de qualquer comando

### Comando do Python

Ler `comando_python:` do frontmatter de `operacao/INSTALACAO.md` (gravado
pelo `polozi-instalador` na ETAPA 0). Valor diferente de `pendente` → use-o
como `<PY>`. Ainda `pendente`? Tentar, UM DE CADA VEZ e sem encadear com
`||` (cmd/PowerShell do Windows não garantem o encadeamento):

```
python3 --version
py -3 --version
python --version
```

O PRIMEIRO que imprimir `Python 3.` vira `<PY>` — todo comando desta skill,
daqui pra frente, escreve `<PY>` no lugar de "python". Nenhum comando desta
skill pode conter `python3` literal fora desta checagem de versão.

### Resolver `<SKILL_DIR>`

Não existe hoje variável oficial que entregue à skill o próprio caminho;
`$CWD` só serve pra descoberta, não é garantia de onde a skill está
instalada [24a:skills/n09]. `PLUGIN_ROOT` só existe pra hook, não pra skill
[24a:plugins/n10]. Por isso o caminho tem que ser ACHADO, com comando
portátil (nunca `ls`/`test -f`/bashismo — o público majoritário é Windows).

Candidato 0 (opcional): se a listagem inicial do Codex mostrar um "file
path" e ele apontar pra um `SKILL.md` que existe, use a pasta desse
`SKILL.md` como primeiro candidato antes da busca abaixo [24a:skills/n09].

Buscar, NESTA ORDEM, do mais perto pro mais longe, um candidato de cada vez:

1. `<PASTA_ABERTA>/.agents/skills/polozi-transferir-trabalho/assets/modelo-handoff.md`
2. `~/.agents/skills/polozi-transferir-trabalho/assets/modelo-handoff.md`
3. cache de plugin, por GLOB — NUNCA escreva a versão do plugin fixa no
   meio do caminho (a doc publicada diz que a versão vale "local", o disco
   de hoje mostra "2.0.0" [24a:plugins/n11] — as duas coisas driftam, então
   varrer com glob, nunca hardcodar). Esse padrão de busca é
   `<PADRAO_GLOB_CACHE>`:
   `~/.codex/plugins/cache/*/polozi-fundacao/*/skills/polozi-transferir-trabalho/assets/modelo-handoff.md`.
   Se o glob achar mais de um caminho, usar o de data de modificação mais
   recente.

Checar cada candidato com comando portátil (Mac/Windows), NUNCA `ls`/`test -f`:

```
<PY> -c "import pathlib,sys; print('OK' if pathlib.Path(sys.argv[1]).expanduser().is_file() else 'MISSING')" "<candidato>"
```

Pro item 3 (glob), resolver primeiro o candidato mais recente, usando o
padrão de busca já dado acima (`<PADRAO_GLOB_CACHE>`):

```
<PY> -c "import glob,os,sys; c=sorted(glob.glob(os.path.expanduser(sys.argv[1])), key=os.path.getmtime, reverse=True); print(c[0] if c else '')" "<PADRAO_GLOB_CACHE>"
```

O primeiro candidato que responder `OK` (ou que o glob devolver não-vazio)
vira `<SKILL_DIR>` — a pasta que contém `assets/modelo-handoff.md` (sem o
`assets/modelo-handoff.md` no final).

Nenhum caminho achou → **PARE**: esta skill está instalada incompleta
(falta `assets/modelo-handoff.md`). Mostre ao aluno e peça pra reinstalar o
`polozi-fundacao.zip` e reiniciar o app. Não improvise um handoff sem o
modelo, não rode nada relativo, não copie o arquivo pra dentro da Casa.

Depois de achar `<SKILL_DIR>`, procurar `<SKILL_IRMA>` — a skill
`polozi-concluir-trabalho` — NO MESMO diretório de skills onde `<SKILL_DIR>`
foi achado (achou em `~/.agents/skills/polozi-transferir-trabalho`? procure
em `~/.agents/skills/polozi-concluir-trabalho`; achou no cache numa versão
`X`? procure em `.../polozi-fundacao/X/skills/polozi-concluir-trabalho`, a
MESMA `X` que achou esta skill, nunca fixa). Não existir ali → **PARE**, com
a mesma mensagem acima, trocando "modelo-handoff.md" por
"scripts/concluir_trabalho.py".

Todo comando `.py` desta skill, daqui pra frente, é
`<PY> "<SKILL_IRMA>/scripts/concluir_trabalho.py" ...`, com aspas e caminho
absoluto — nunca `python3` seguido de um caminho relativo ao cwd tipo
`scripts/concluir_trabalho.py`.

## Preparar

1. Contar os sinais de acúmulo. Precisa de 2 ou mais verdadeiros: faltam 2+ fases grandes da task · muita tentativa descartada · o próximo passo depende mais do que está salvo em disco do que da conversa · já houve compactação ou perda de detalhe perceptível · seguir nesta sessão arrisca confundir o próximo passo. Menos de 2 → não transferir: proponha continuar (ou concluir, se na verdade já terminou).
2. Ler `EMPRESA-IA.md`, `MAPA-DA-EMPRESA-IA.md`, `operacao/STATUS-ATUAL.md`, `operacao/PENDENCIAS.md` e a task aberta (`operacao/tasks/TASK-N/TASK.md`, ou o registro no banco da empresa quando ele existir em `credenciais/CONEXOES.md`).
3. Confirmar que o trabalho NÃO está concluído. Objetivo atendido + entregáveis validados + sem pendência bloqueante é conclusão, não transferência — nesse caso use `$polozi-concluir-trabalho`.
4. Levantar do chat atual, só o confirmado: o que foi feito, quais arquivos mudaram, decisões já tomadas, pendências abertas e a PRÓXIMA AÇÃO — o primeiro passo concreto e literal de quem retomar.

## Executar

1. NÃO concluir a task. O trabalho segue em andamento, nunca "pronto". Só `main` — o aluno nunca tem branch nem cópia paralela.
2. Checkpoint de segurança: acionar a skill `tecnologia-publicar` para commitar o checkpoint NA MAIN e empurrar, com mensagem em português dizendo o que foi feito até aqui. O hook `.githooks/pre-push` da Casa varre segredo em todo push — se bloquear, corrija antes de subir.
3. Escrever `operacao/tasks/TASK-N/HANDOFF.md` a partir de `<SKILL_DIR>/assets/modelo-handoff.md`: o que foi feito, arquivos alterados, decisões tomadas (só as confirmadas pelo dono), pendências, PRÓXIMA AÇÃO exata e o commit de checkpoint.
4. Atualizar `operacao/STATUS-ATUAL.md` (último trabalho + próximo marco apontando pro handoff) e `operacao/PROXIMA-SESSAO.md` (objetivo = continuar a mesma task; entrada necessária = ler o handoff; critério de conclusão = o da task, não muda).
5. Provar antes de dizer "preservado": rodar, sem `--tarefa`,
   ```
   <PY> "<SKILL_IRMA>/scripts/concluir_trabalho.py" --destino "<CASA>" --provar
   ```
   (as duas skills são do MESMO plugin, o irmão está sempre ao lado; não achou → **PARE**, mesma regra da seção "Resolver `<SKILL_DIR>`"). Exit diferente de `0` NUNCA vira "preservado" — leia a tabela abaixo antes de agir:

   | código | o que o script imprimiu | o que fazer |
   |---|---|---|
   | `0` | (sem prefixo de erro) | siga o passo seguinte |
   | `2` | `RECUSADO:` | NÃO diga "preservado": mostre a lista exata que o script imprimiu e volte pra `tecnologia-publicar` commitar/empurrar; nunca contorne |
   | `3` | `ERRO: falha de arquivo:` | mostre a mensagem e PARE (não é caso de `tecnologia-publicar`) |
   | `4` | `ERRO:` | NÃO diga "preservado" e NÃO mande de volta pra etapa de commit — leia a mensagem, ela diz o que corrigir na Casa |
6. Só com exit 0 do `--provar`, entregar ao dono, literal, pronto pra colar na sessão nova:
   > Continuar TASK-N. Leia o handoff e continue da próxima ação. Não crie task nova.
7. Fechar avisando: "trabalho preservado; esta sessão pode ser arquivada" — nunca "concluído".

## Verificar

- `operacao/tasks/TASK-N/HANDOFF.md` existe, com PRÓXIMA AÇÃO específica (não genérica).
- Checkpoint na main, provado por exit 0 do `--provar` do `<SKILL_IRMA>` — a frase de fecho é a que o script imprimiu ("Sincronizado no GitHub, commit <hash curto>." ou "salvo neste computador, commit <hash curto>.").
- `operacao/STATUS-ATUAL.md` e `operacao/PROXIMA-SESSAO.md` apontam pra continuação, não pra encerramento.
- O prompt de continuação foi entregue literal ao dono, com o número certo da task.

## Limites

- Nunca usar em trabalho concluído — task fechada é `$polozi-concluir-trabalho`.
- Nunca criar branch nem cópia paralela do trabalho durante a transferência.
- Nunca criar task nova na transferência — o handoff é sempre da task já aberta.
- Exit diferente de `0` do `--provar` do `<SKILL_IRMA>` nunca vira "preservado"; só o `2` (`RECUSADO:`) volta pra `tecnologia-publicar` — `3` e `4` (`ERRO:`) nunca são contornados nem mandados pra `tecnologia-publicar`.
- Handoff nunca contém segredo (chave, senha, token, valor de credencial) — se a pendência envolver credencial, descreva o passo sem o valor.
- Menos de 2 sinais de acúmulo: não transferir.
