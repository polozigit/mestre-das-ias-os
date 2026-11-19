---
name: polozi-concluir-trabalho
description: "Fecha o trabalho: registra, salva em 1 commit e conclui a tarefa. Use ao terminar; não use se ainda falta trabalho."
---

# Polozi Concluir Trabalho

Fechar o trabalho da sessão atual com UM commit só: validar critérios de conclusão, atualizar a memória operacional, salvar os arquivos do trabalho e da memória juntos, registrar o recibo e concluir a tarefa. Sem "publicar, carimbar, publicar de novo": nada é escrito depois do commit. Quem decide se o trabalho acabou é a prova do git, nunca o agente.

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
baixar o zip do kit de novo, descompactar e abrir no aplicativo a pasta que tem o `AGENTS.md` dentro, não a de fora. Não improvise um
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
2. Verificar os 5 critérios de conclusão. Só prossiga se TODOS forem verdade:
   - objetivo atendido;
   - entregáveis validados (cada critério C1, C2... com a evidência da versão final);
   - sem pendência bloqueante;
   - o commit será feito nesta conclusão (passo "Salvar", um só);
   - `operacao/` será atualizada por esta conclusão.
   Faltou algum? Não conclua: diga o que falta ou proponha `$polozi-transferir-trabalho`.
3. Identificar no chat atual: resultado entregue, arquivos envolvidos, estados que mudaram, pendências, próximo objetivo, decisões explicitamente confirmadas pelo usuário e o id da sessão que o hook mostrou no início do trabalho (é o `--sessao` do passo "Registrar").
4. Listar os caminhos EXATOS deste trabalho (arquivos e pastas que você criou ou mudou). Alteração de outro trabalho aberto na mesma Casa não entra: é de outro objetivo.
5. Verificar os arquivos envolvidos. Se não for possível identificar o resultado com segurança, pedir uma descrição curta do trabalho concluído.
6. Não aceitar inferências como decisão. Não mover, renomear, apagar, criar saída empresarial nem criar papel novo no Mapa.

## Prévia

Criar um arquivo temporário fora da Empresa IA com base em `<SKILL_DIR>/assets/modelo-plano-encerramento.json`. Incluir apenas mudanças relevantes. NÃO preencher `tarefa.numero`: o carimbo de `TASK.md` não faz parte deste fluxo (a conclusão vai pelo registro, abaixo). Executar:

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
2. O script só atualiza papéis já existentes no Mapa quando o arquivo correspondente existe; preserva o histórico de Changelog, Decisões e Pendências (uma pendência resolvida muda de estado, nunca é apagada); atualiza `capacidades/PLUGINS.md` apenas quando a sessão instalou um plugin novo (não é o catálogo de Skills, esse morreu).
3. `--aplicar` NUNCA fecha a TASK e não commita. Anote os arquivos de `operacao/` (e o Mapa) que a prévia listou: vão no MESMO commit do trabalho, no passo seguinte.

## Salvar (1 commit)

Um comando só, com os caminhos do trabalho MAIS os arquivos que o `--aplicar` escreveu (a skill `tecnologia-publicar` descreve o `salvar.py` e a tabela de saídas dele):

```
<PY> .agents/skills/tecnologia-publicar/scripts/salvar.py -m "<o que foi entregue, em português>" <caminho do trabalho> [<caminho> ...] operacao/STATUS-ATUAL.md [<outros escritos pelo --aplicar>]
```

- Nunca `--tudo` nem `git add -A`: o `salvar.py` recusa. Só os caminhos deste trabalho.
- O pre-commit e o pre-push varrem segredo; se bloquear, tire o segredo e repita. Nunca contorne.
- Casa com sistema no ar e na `main`: o `salvar.py` sai 3. Siga o fluxo completo da `tecnologia-publicar` (branch + PR) e volte aqui com o SHA do commit.
- O recibo do envio fica em cache local ignorado pelo git (`operacao/tasks/.sessoes/`), nunca num arquivo versionado. Por isso não existe segundo commit.
- Guarde o SHA: `git rev-parse HEAD`.

## Registrar e provar

1. Concluir no registro, com a evidência (consulta pronta não exige `--commit` nem `--arquivo`; documento exige os dois; código exige também `--verificacao`; publicação só com `--commit` igual ao SHA do merge e o recibo `operacao/tasks/.sessoes/publicacao-recibo.json` gravado pela `tecnologia-publicar` depois de provar "no ar"):
   ```
   <PY> .codex/hooks/registro_trabalho.py concluir --sessao <id da sessão> --resumo "<resultado comprovado>" --commit <SHA> --arquivo <caminho> [--arquivo <caminho> ...] [--verificacao "<checagem executada>"]
   ```
   Saída `Registro pendente: ...` = faltou evidência ou o objetivo não foi registrado: leia a mensagem e corrija, sem editar `TASK.md` na mão. Sem credencial do banco, a conclusão fica na fila local e sobe sozinha depois; diga "registrado na fila", não "no banco".
2. Provar só o escopo (outro trabalho sujo na Casa não atrapalha):
   ```
   <PY> .agents/skills/tecnologia-publicar/scripts/salvar.py --provar <os mesmos caminhos do Salvar>
   ```

   | código | o que o script imprimiu | o que fazer |
   |---|---|---|
   | `0` | `SINCRONIZADO <hash>` ou, sem GitHub do dono, `SALVO_LOCAL <hash>` | siga para o fecho |
   | `1` | lista de arquivos fora do commit ou commit que não subiu (RECUSADO como conclusão) | mostre a lista exata ao dono e salve o que faltou com o `salvar.py`; nunca contorne nem invente frase de fecho |
   | `5` | uso errado (caminho fora da Casa, sem caminho) | corrija o comando |

   Saídas `2`, `3`, `4` e `6` do `salvar.py` têm a tabela completa na `tecnologia-publicar`; nenhuma delas é "pronto".
3. Frase de fecho, só com saída `0`, copiando a linha do script: `SINCRONIZADO` = "Sincronizado no GitHub, commit <hash curto>."; `SALVO_LOCAL` = "salvo neste computador, commit <hash curto>.". Diga também em qual estado ficou: salvo na branch, integrado por PR ou no ar são coisas diferentes.
4. Informar ao usuário o que foi registrado e o próximo passo.
5. Tarefa do plano de 90 dias ou do curso: rode `<PY> .codex/hooks/registro_trabalho.py reconciliar`; só nesse caso o quadro fecha pela reconciliação. Trabalho comum já fechou no passo 1 (`concluir`); não há fechamento automático no fim do turno.

## Verificar

1. O `salvar.py --provar` saiu com 0 antes de qualquer frase de fecho.
2. O `registro_trabalho.py concluir` imprimiu a confirmação (banco ou fila) com o SHA e os arquivos.
3. `STATUS-ATUAL.md`, `CHANGELOG.md`, `DECISOES.md`, `PENDENCIAS.md` e `PROXIMA-SESSAO.md` atualizados conforme a prévia, no mesmo commit.
4. Nenhum arquivo foi escrito depois do commit (git `status` do escopo limpo).

## Limites

- Nunca dizer "trabalho salvo" ou "concluído" sem saída 0 do `salvar.py --provar` e sem a confirmação do `concluir`.
- Saída 1 da prova = mostrar a lista exata (arquivos sujos, commits não enviados) e salvar o que faltou; nunca contornar, nunca inventar uma frase de fecho.
- Nunca fazer um segundo commit para "carimbar" ou "registrar" a conclusão: o recibo vai para o cache e para o banco.
- Nunca usar `--tudo`, `git add -A` ou `git add .`; nunca salvar alteração de outro trabalho.
- Nunca marcar tarefa como concluída editando `TASK.md` na mão: só o `registro_trabalho.py concluir`.
- Nunca copiar o script ou o plano de encerramento para dentro da Casa.
- Nunca escrever sem prévia e confirmação.
- Nunca registrar decisão não confirmada explicitamente.
- Nunca apagar, mover ou reorganizar arquivos.
- Nunca criar papel novo no Mapa durante o encerramento.
- Nunca copiar transcrições, entregas inteiras, credenciais ou dados sensíveis para a memória operacional.
- Nunca apagar uma pendência resolvida: ela muda de estado (`aberta` para `resolvida`), a linha fica para histórico.
- Nunca concluir com algum dos 5 critérios em aberto: proponha `$polozi-transferir-trabalho` em vez disso.
