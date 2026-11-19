---
name: polozi-transferir-trabalho
description: "Passa trabalho inacabado pra sessão nova: handoff + prompt de continuação. Use se a sessão esticou; não use se já terminou."
---

# Polozi Transferir Trabalho

Preservar o trabalho em andamento e entregar ao dono o caminho exato de continuação, sem concluir e sem perder nada, quando a sessão atual não deve seguir até o fim. Onde o trabalho fica guardado depende de o sistema já estar no ar (existe `sistemas/empresa-os/.vercel/project.json`, o mesmo sinal da guarda do git e do `salvar.py`): fora do ar a Casa trabalha na `main`, sem branch nem cópia paralela; no ar a `main` publica, então o trabalho fica numa branch curta e esta skill nunca o coloca em produção.

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
(falta `assets/modelo-handoff.md`). Mostre ao aluno e peça pra
baixar o zip do kit de novo, descompactar e abrir no aplicativo a pasta que tem o `AGENTS.md` dentro, não a de fora. Não improvise um handoff sem o
modelo, não rode nada relativo, não copie o arquivo pra dentro da Casa.

O salvamento e a prova do checkpoint usam o `salvar.py` da skill `tecnologia-publicar`, que já está na Casa (`.agents/skills/tecnologia-publicar/scripts/salvar.py`, a partir da raiz): não precisa localizar nada.

## Preparar

1. O dono pediu pra parar ("vou parar por aqui", "pausa", "passa pra outra conversa")? É pedido direto: pule a contagem e siga pro passo 2. Sem pedido dele, contar os sinais de acúmulo. Precisa de 2 ou mais verdadeiros: faltam 2+ fases grandes da task · muita tentativa descartada · o próximo passo depende mais do que está salvo em disco do que da conversa · já houve compactação ou perda de detalhe perceptível · seguir nesta sessão arrisca confundir o próximo passo. Menos de 2 → não transferir: proponha continuar (ou concluir, se na verdade já terminou).
2. Ler `EMPRESA-IA.md`, `MAPA-DA-EMPRESA-IA.md`, `operacao/STATUS-ATUAL.md`, `operacao/PENDENCIAS.md` e a task aberta (`operacao/tasks/TASK-N/TASK.md`, ou o registro no banco da empresa quando ele existir em `credenciais/CONEXOES.md`).
3. Confirmar que o trabalho NÃO está concluído. Objetivo atendido + entregáveis validados + sem pendência bloqueante é conclusão, não transferência — nesse caso use `$polozi-concluir-trabalho`.
4. Levantar do chat atual, só o confirmado: o que foi feito, quais arquivos mudaram, decisões já tomadas, pendências abertas e a PRÓXIMA AÇÃO — o primeiro passo concreto e literal de quem retomar.

## Executar

1. NÃO concluir a task. O trabalho segue em andamento, nunca "pronto". Descubra onde ele fica: rode o comando `is_file` do bloco "Resolver `<SKILL_DIR>`" no caminho `<CASA>/sistemas/empresa-os/.vercel/project.json` (`OK` = sistema no ar). Fora do ar, só `main`: nunca branch nem cópia paralela. No ar, uma branch curta (`git branch --show-current` diz qual; estando na `main`, crie-a a partir de `origin/main`, como no passo 1 da `tecnologia-publicar`), nunca a `main`.
2. Checkpoint de segurança: acionar a skill `tecnologia-publicar`, com mensagem em português dizendo o que foi feito até aqui e SÓ os caminhos exatos deste trabalho (o que você criou ou mudou, mais a ficha `TASK.md`, o `HANDOFF.md` e os arquivos de `operacao/` dos passos 3 e 4: faça este commit depois deles, para irem juntos). Nunca `--tudo` nem `git add -A`: alteração de outro trabalho aberto na Casa fica de fora. Fora do ar, commitar o checkpoint NA MAIN e empurrar (a seção "Salvar" dela, pelo `salvar.py`). No ar, o `salvar.py` recusa a `main` (saída 3) e o hook da Casa também (regra r02): commitar na branch curta (passo 2 do fluxo completo dela) e rodar `git push -u origin HEAD`, e parar aí. NÃO mesclar PR e NÃO colocar no ar, porque o trabalho está inacabado. O hook `.githooks/pre-push` da Casa varre segredo em todo push: se bloquear, corrija antes de subir.
3. Criar a ficha da tarefa antes de passar a conversa: `<PY> .codex/hooks/registro_trabalho.py ficha --sessao <id da sessão que o hook mostrou no início>` (cria `operacao/tasks/TASK-N/TASK.md`; o `N` dela é o da TASK abaixo). Depois escrever `operacao/tasks/TASK-N/HANDOFF.md` a partir de `<SKILL_DIR>/assets/modelo-handoff.md`: o que foi feito, arquivos alterados, decisões tomadas (só as confirmadas pelo dono), pendências, PRÓXIMA AÇÃO exata, onde o trabalho está (`main`, ou o nome da branch curta com o sistema no ar) e o commit de checkpoint.
4. Atualizar `operacao/STATUS-ATUAL.md` (último trabalho + próximo marco apontando pro handoff) e `operacao/PROXIMA-SESSAO.md` (objetivo = continuar a mesma task; entrada necessária = ler o handoff; critério de conclusão = o da task, não muda).
5. Provar antes de dizer "preservado", com o escopo do checkpoint (vale fora do ar e no ar: o script compara com o upstream da branch em que você está, não com a `main`; outro trabalho sujo na Casa não atrapalha):
   ```
   <PY> .agents/skills/tecnologia-publicar/scripts/salvar.py --provar <os mesmos caminhos do passo 2>
   ```
   Saída diferente de `0` NUNCA vira "preservado". Leia a tabela antes de agir:

   | código | o que o script imprimiu | o que fazer |
   |---|---|---|
   | `0` | `SINCRONIZADO <hash>` ou, sem GitHub do dono, `SALVO_LOCAL <hash>` | siga o passo seguinte |
   | `1` | lista de arquivos fora do commit ou commits que não subiram (RECUSADO como preservado) | NÃO diga "preservado": mostre a lista exata e volte ao passo 2; nunca contorne |
   | `5` | uso errado (caminho fora da Casa, sem caminho) | corrija o comando |

   Com o `origin` ainda no repositório-modelo do curso, o `--provar` sai 1 mesmo com tudo commitado (não há GitHub do dono para provar): nesse caso diga só "salvo neste computador", nunca "no GitHub".
6. Só com a prova feita (exit 0 do `--provar` do passo 5), entregar ao dono, literal, pronto pra colar na sessão nova:
   > Continuar TASK-N. Leia o handoff e continue da próxima ação. Não crie task nova.
7. Fechar avisando: "trabalho preservado; esta sessão pode ser arquivada" — nunca "concluído".

## Verificar

- `operacao/tasks/TASK-N/HANDOFF.md` existe, com PRÓXIMA AÇÃO específica (não genérica).
- Checkpoint guardado e provado pelo exit 0 do `salvar.py --provar <caminhos>`: fora do ar, na `main` ("Sincronizado no GitHub, commit <hash curto>." ou "salvo neste computador, commit <hash curto>."); no ar, na branch curta ("salvei, falta colocar no ar").
- `operacao/STATUS-ATUAL.md` e `operacao/PROXIMA-SESSAO.md` apontam pra continuação, não pra encerramento.
- O prompt de continuação foi entregue literal ao dono, com o número certo da task.

## Limites

- Nunca usar em trabalho concluído — task fechada é `$polozi-concluir-trabalho`.
- Fora do ar, nunca criar branch nem cópia paralela do trabalho durante a transferência. No ar, só a branch curta da task, nunca a `main`, e nunca mesclar PR nem colocar no ar um trabalho inacabado.
- Nunca criar task nova na transferência — o handoff é sempre da task já aberta.
- Exit diferente de `0` do `salvar.py --provar` nunca vira "preservado"; o `1` (RECUSADO) volta ao passo 2 do checkpoint, o `5` é erro de uso do comando: nunca contorne.
- Nunca usar `--tudo` nem `git add -A` no checkpoint: só os caminhos deste trabalho.
- Handoff nunca contém segredo (chave, senha, token, valor de credencial) — se a pendência envolver credencial, descreva o passo sem o valor.
- Menos de 2 sinais de acúmulo: não transferir.
