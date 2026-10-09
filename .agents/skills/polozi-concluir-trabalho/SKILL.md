---
name: polozi-concluir-trabalho
description: "Fecha a sessão: registra, prova que subiu pro GitHub e conclui a task. Use ao terminar; não use se ainda falta trabalho."
---

# Polozi Concluir Trabalho

Fechar o trabalho da sessão atual: validar critérios de conclusão, atualizar a memória operacional, delegar o commit à skill `tecnologia-publicar` e só então marcar a TASK como concluída — depois que o próprio git provar que está sincronizado. Quem decide se o trabalho acabou é o `--provar`, nunca o agente.

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

1. `<PASTA_ABERTA>/.agents/skills/polozi-concluir-trabalho/scripts/concluir_trabalho.py`
2. `~/.agents/skills/polozi-concluir-trabalho/scripts/concluir_trabalho.py`
3. cache de plugin, por GLOB — NUNCA escreva a versão do plugin fixa no
   meio do caminho (a doc publicada diz que a versão vale "local", o disco
   de hoje mostra "2.0.0" [24a:plugins/n11] — as duas coisas driftam, então
   varrer com glob, nunca hardcodar). Esse padrão de busca é
   `<PADRAO_GLOB_CACHE>`:
   `~/.codex/plugins/cache/*/polozi-fundacao/*/skills/polozi-concluir-trabalho/scripts/concluir_trabalho.py`.
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
vira `<SKILL_DIR>` — a pasta que contém `scripts/concluir_trabalho.py` (sem
o `scripts/concluir_trabalho.py` no final).

Nenhum caminho achou → **PARE**: esta skill está instalada incompleta
(falta `scripts/concluir_trabalho.py`). Mostre ao aluno e peça pra
reinstalar o `polozi-fundacao.zip` e reiniciar o app. Não improvise um
encerramento sem script, não rode nada relativo, não copie o script pra
dentro da Casa.

Todo comando `.py` desta skill, daqui pra frente, é
`<PY> "<SKILL_DIR>/scripts/concluir_trabalho.py" ...`, com aspas e caminho
absoluto — nunca `python3` seguido de um caminho relativo ao cwd tipo
`scripts/concluir_trabalho.py` (era exatamente isso que fazia a skill
parecer "não instalada" na TASK-7: o script e o asset nunca estiveram
ausentes, o caminho é que era relativo ao cwd errado).

## Preparar

1. Ler `EMPRESA-IA.md`, consultar `MAPA-DA-EMPRESA-IA.md` e abrir `operacao/LEIA-ME.md`.
2. Ler `credenciais/CONEXOES.md` para saber se o banco da empresa (Supabase) já está conectado — isso decide, depois da prova, se o carimbo da TASK vai pro banco ou pro arquivo.
3. Verificar os 5 critérios de conclusão. Só prossiga se TODOS forem verdade:
   - objetivo atendido;
   - entregáveis validados;
   - sem pendência bloqueante;
   - commit feito (ou será feito nesta conclusão, via `tecnologia-publicar`);
   - `operacao/` será atualizada por esta conclusão.
   Faltou algum? Não conclua — diga o que falta ou proponha `$polozi-transferir-trabalho`.
4. Identificar no chat atual: resultado entregue, arquivos envolvidos, estados que mudaram, pendências, próximo objetivo, decisões explicitamente confirmadas pelo usuário e o número da TASK em andamento (se houver).
5. Verificar os arquivos envolvidos. Se não for possível identificar o resultado com segurança, pedir uma descrição curta do trabalho concluído.
6. Não aceitar inferências como decisão. Não mover, renomear, apagar, criar saída empresarial nem criar papel novo no Mapa.

## Prévia

Criar um arquivo temporário fora da Empresa IA com base em `<SKILL_DIR>/assets/modelo-plano-encerramento.json`. Incluir apenas mudanças relevantes — o campo `tarefa.numero`, quando a sessão trabalhou numa TASK, só entra como referência mostrada na prévia; ele não fecha nada aqui — e executar:

```
<PY> "<SKILL_DIR>/scripts/concluir_trabalho.py" \
  --destino "PASTA_EMPRESA_IA" \
  --plano "PLANO_TEMPORARIO.json" \
  --registro-em "AAAA-MM-DD_HHMMSS" \
  --dry-run
```

Mostrar o trabalho, os arquivos verificados, estados do Mapa, registros operacionais que serão atualizados e pendências de organização. Se não houver atualização relevante, encerrar sem escrever.

Pedir uma única confirmação antes de gravar.

## Aplicar

1. Depois da confirmação, executar o mesmo comando com `--aplicar`, sempre com `<PY>` e `<SKILL_DIR>`.
2. O script só atualiza papéis já existentes no Mapa quando o arquivo correspondente existe; preserva o histórico de Changelog, Decisões e Pendências (uma pendência resolvida muda de estado, nunca é apagada); atualiza `capacidades/PLUGINS.md` apenas quando a sessão instalou um plugin novo (não é o catálogo de Skills — esse morreu).
3. `--aplicar` NUNCA fecha a TASK. Se o plano tinha `tarefa.numero`, o script imprime `FALTA A PROVA: rode --provar --tarefa N depois do commit e do push` — é assim mesmo; a TASK só fecha na seção "Provar" abaixo.
4. Commit e push: acione a skill `tecnologia-publicar`. O hook `.githooks/pre-push` da Casa varre segredo em todo push — se bloquear, corrija e não suba.

## Provar (o que decide se acabou)

1. Confirme que a skill `tecnologia-publicar` já commitou e empurrou o que o `--aplicar` gravou (o hook de push varre segredo antes; se bloquear, corrige e não sobe).
2. Rodar, sem `--plano`:
   ```
   <PY> "<SKILL_DIR>/scripts/concluir_trabalho.py" --destino "PASTA_EMPRESA_IA" --provar --tarefa N
   ```
   (omita `--tarefa N` quando a sessão não estava fechando uma TASK). O script roda `git status --porcelain` e `git log origin/main..HEAD` na Casa e decide pelo código de saída — leia a tabela abaixo antes de agir sobre qualquer resultado diferente de `0`.

   | código | o que o script imprimiu | o que fazer |
   |---|---|---|
   | `0` | (sem prefixo de erro) | siga o passo seguinte |
   | `2` | `RECUSADO:` | git não aprovou (árvore suja, commit não enviado, ou `origin` sem `origin/main`) — mostre a lista exata ao dono e volte pra `tecnologia-publicar` commitar/empurrar; nunca contorne |
   | `3` | `ERRO: falha de arquivo:` | problema de disco/permissão — mostre a mensagem e PARE (não é caso de `tecnologia-publicar`) |
   | `4` | `ERRO:` | estado ou uso errado da Casa — LEIA a mensagem, ela diz o que falta; se ela citar `operacao/tasks/TEMPLATE-TASK.md`, o `TASK.md` daquela tarefa está fora do formato da Casa: copie os bullets do topo do template pro `TASK.md` preservando objetivo e critério, e rode de novo; NUNCA mande isso de volta pra etapa de commit e NUNCA marque concluída a mão |

3. Exit 0 e veio `--tarefa N`? Três casos, e NENHUM diz que terminou:
   - (a) o script carimbou `operacao/tasks/TASK-N/TASK.md` com `Status: concluída`, `Concluída em:` e `Commit:` — a última linha é `FALTA A PROVA FINAL`; vá pro passo 4 (o carimbo é escrita nova, precisa commitar/empurrar antes da prova final).
   - (b) `credenciais/CONEXOES.md` já tem o banco conectado: não tocou arquivo nenhum e imprimiu a instrução pro `polozi-gerente-de-trabalho` já com o hash provado — a última linha também é `FALTA A PROVA FINAL`; vá pro passo 4 mesmo sem ter escrito nada (é a prova final que ainda falta).
   - (c) a TASK já estava carimbada: o script avisa `já estava carimbada` e a última linha é `Já carimbada; rode --provar (sem --tarefa) pra prova final.` — não há carimbo novo pra commitar; pule direto pro `--provar` sem `--tarefa` do passo 4.
4. Se algo novo foi escrito no carimbo (caso a), acione a skill `tecnologia-publicar` para commitar e empurrar antes de rodar a prova final; nos casos (b) e (c) não há escrita nova pra commitar. Em qualquer caso, rode a prova final sem `--tarefa`:
   ```
   <PY> "<SKILL_DIR>/scripts/concluir_trabalho.py" --destino "PASTA_EMPRESA_IA" --provar
   ```
5. A frase de fecho é sempre a da rodada SEM `--tarefa`, copiada literal do stdout do SCRIPT — nunca uma paráfrase do agente e nunca a de uma rodada com `--tarefa`: com `origin` sincronizado, `Sincronizado no GitHub, commit <hash curto>.`; sem `origin` (GitHub ainda não existe), `salvo neste computador, commit <hash curto>.`.

## Verificar

1. O `--provar` (e o `--provar --tarefa N`, quando houve TASK) saiu com exit 0 antes de qualquer frase de fecho ser dita ao usuário.
2. TASK fechada — no banco (confirmação do `polozi-gerente-de-trabalho`) ou em `operacao/tasks/TASK-N/TASK.md`, com `Commit:` preenchido.
3. `STATUS-ATUAL.md`, `CHANGELOG.md`, `DECISOES.md`, `PENDENCIAS.md` e `PROXIMA-SESSAO.md` atualizados conforme a prévia.
4. Informar ao usuário o que foi registrado e o próximo passo, fechando com a frase que o script imprimiu — nunca uma frase escrita de próprio punho.
5. Rodar `<PY> .codex/hooks/registro_trabalho.py reconciliar` e dizer que a tarefa do quadro (ligada pelo `- Quadro:` do `TASK.md`) fecha sozinha no fim do turno; não feche à mão.

## Limites

- Nunca dizer "trabalho salvo" ou "concluído" sem exit 0 do `--provar` SEM `--tarefa` — a rodada com `--tarefa` nunca diz fecho, mesmo em exit 0.
- `RECUSADO:` (exit 2) = mostrar a lista exata (arquivos sujos, commits não enviados) e voltar pra `tecnologia-publicar` — nunca contornar, nunca inventar uma frase de fecho.
- Exit 3 ou exit 4 NUNCA são tratados como `RECUSADO:` nem mandados pra `tecnologia-publicar` — leia a tabela de códigos e siga o remédio específico de cada um.
- Nunca criar ou corrigir um bullet de `TASK.md` pra "destravar" o script sem que a mensagem de exit 4 tenha mandado — e, mesmo quando mandou, só os bullets do topo (nunca escrever o valor `concluída` na mão).
- Nunca copiar o script ou o plano de encerramento pra dentro da Casa.
- Nunca marcar a TASK como concluída editando `TASK.md` na mão — só o `--provar --tarefa N`, depois de exit 0, carimba.
- Nunca fazer commit ou push você mesmo — sempre passar pela skill `tecnologia-publicar`.
- Nunca escrever sem prévia e confirmação.
- Nunca registrar decisão não confirmada explicitamente.
- Nunca apagar, mover ou reorganizar arquivos.
- Nunca criar papel novo no Mapa durante o encerramento.
- Nunca copiar transcrições, entregas inteiras, credenciais ou dados sensíveis para a memória operacional.
- Nunca apagar uma pendência resolvida — ela muda de estado (`aberta` → `resolvida`), a linha fica para histórico.
- Nunca fechar a TASK no arquivo se o banco já existir em `credenciais/CONEXOES.md` — nesse estágio o banco é a fonte oficial.
- Nunca concluir com algum dos 5 critérios em aberto — proponha `$polozi-transferir-trabalho` em vez disso.
