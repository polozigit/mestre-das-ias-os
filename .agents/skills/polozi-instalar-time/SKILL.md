---
name: polozi-instalar-time
description: "Instala ou remove um time na Casa. Use em \"quero o time de vendas\" ou se faltar um do kit; não use pra acionar time instalado."
---

# Polozi Instalar Time

Conferir, ligar e desligar um time na Casa, sem que ela pague o contexto de
todos os times no boot. O time pode vir de DOIS lugares:

- **Time do kit, que já mora na Casa** (`times/<time>/time.json`, as skills em
  `.agents/skills/`): não tem plugin nem marketplace. `--instalar` confere as
  skills, gera os subagentes do `time.json` em `.codex/agents/` e registra a
  linha `ativo`; `--remover` tira só os subagentes. É o caminho do aluno: os
  times do kit já vêm instalados, e esta skill serve pra conferir
  (`--verificar`) e pra consertar um time que perdeu os agentes.
- **Time de reserva em plugin** (módulo extra): mecanismo de DUAS CAMADAS. (1)
  O PLUGIN do time é habilitado pelo aluno no app: esta skill conduz e
  verifica esse gesto, nunca finge que instalou; (2) os AGENTES do time
  (`agents/*.toml`) são copiados por esta skill pra `.codex/agents/`, único
  caminho de descoberta de subagente de projeto [24a:agentes/f3].

Esta skill nunca instala o plugin sozinha, nunca edita o marketplace, nunca
cria skill e nunca escreve em `~/.codex/config.toml` nem no `AGENTS.md` da
Casa.

## Preparar

1. Resolver o caminho absoluto da pasta ABERTA no Codex — `<PASTA_ABERTA>`.
2. Resolver `<SKILL_DIR>` seguindo o bloco abaixo ANTES de rodar qualquer
   comando `.py`.

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

1. `<PASTA_ABERTA>/.agents/skills/polozi-instalar-time/scripts/instalar_time.py`
2. `~/.agents/skills/polozi-instalar-time/scripts/instalar_time.py`
3. cache de plugin, por GLOB — NUNCA escreva a versão do plugin fixa no
   meio do caminho (a versão real driftou de "local" pro valor do manifest
   [24a:plugins/n11]). Padrão: `<PADRAO_GLOB_CACHE>` =
   `~/.codex/plugins/cache/*/polozi-fundacao/*/skills/polozi-instalar-time/scripts/instalar_time.py`.
   Mais de um caminho? Use o de data de modificação mais recente.

Checar cada candidato com comando portátil (Mac/Windows), NUNCA `ls`/`test -f`:

```
<PY> -c "import pathlib,sys; print('OK' if pathlib.Path(sys.argv[1]).expanduser().is_file() else 'MISSING')" "<candidato>"
```

Pro item 3 (glob):

```
<PY> -c "import glob,os,sys; c=sorted(glob.glob(os.path.expanduser(sys.argv[1])), key=os.path.getmtime, reverse=True); print(c[0] if c else '')" "<PADRAO_GLOB_CACHE>"
```

O primeiro candidato que responder `OK` (ou que o glob devolver não-vazio)
vira `<SKILL_DIR>` — a pasta que contém `scripts/instalar_time.py` (sem o
`scripts/instalar_time.py` no final).

Nenhum caminho achou → **PARE**: esta skill está instalada incompleta.
Peça pra reinstalar o `polozi-fundacao.zip` e reiniciar o app. Não
improvise caminho, não rode nada relativo.

## Comando do Python (faça isto antes de qualquer comando)

Tentar, UM DE CADA VEZ e sem encadear com `||` (cmd/PowerShell não garantem
o encadeamento):

```
python3 --version
py -3 --version
python --version
```

O PRIMEIRO que imprimir `Python 3.` vira `<PY>` — todo comando desta skill,
daqui pra frente, escreve `<PY>` no lugar de "python". Nenhum comando desta
skill pode conter `python3` literal fora desta checagem de versão.

## Fluxo

### P1 — Ver o catálogo

```
<PY> "<SKILL_DIR>/scripts/instalar_time.py" --listar
```

Mostra time, origem (`times/<time>/time.json` da Casa, marketplace ou cache),
agentes e estado real. Com `--gravar`, semeia/atualiza a tabela "Times da empresa" de
`capacidades/PLUGINS.md` — time sem linha ainda entra como "disponível,
não instalado"; time já registrado mantém o Estado que já tinha:

```
<PY> "<SKILL_DIR>/scripts/instalar_time.py" --listar --gravar
```

### P2 — Prévia do time escolhido

```
<PY> "<SKILL_DIR>/scripts/instalar_time.py" --time "<TIME>" --instalar --dry-run
```

Mostra quantos agentes seriam copiados e a projeção do orçamento de
listagem contra o teto de 8.000 chars [24a:skills/f9, skills/f10].

### P3 — Instalar o PLUGIN (gesto do aluno, no APP)

**Só para time de reserva em plugin.** Time do kit (o que aparece com origem
`times/<time>/time.json`) não tem plugin: pule direto pro P4.

A camada 1 (o plugin em si) fica no **app** — a doc de build escopa a CLI a
"authoring and catalog setup" e manda usar o app desktop pra instalar e
testar um plugin LOCAL, que é exatamente o caso deste kit [24a:plugins/n16].
Conduza:

1. Abrir a aba **Plugins** no ChatGPT/Codex desktop.
2. Achar o time (ele aparece porque tem entrada no marketplace de
   repositório [24a:plugins/f3, plugins/f6, plugins/n17]).
3. Selecionar o botão **+** pra instalar [24a:plugins/f12].

Não prometa que nada será pedido na tela: a doc não CONDICIONA a leitura do
marketplace de repositório a confiar na pasta, mas ausência de evidência
não é prova de que o app não pede nada [24a:plugins/n17] — se aparecer um
pedido pra confiar na pasta, confie e siga. Confiar em **hook** é passo À
PARTE e sempre explícito, nunca automático [24a:plugins/f17].

Depois de instalar: **reiniciar o app** [24a:plugins/f8] E **abrir uma
sessão nova** [24a:plugins/f9] — a doc oficial diverge entre as duas
formulações (gap registrado), então faça as duas, nessa ordem. Se a skill
do time ainda não aparecer, reinicie o Codex antes de reportar bug
[24a:skills/f11].

### P4 — Instalar de verdade (camada 2 — agentes)

```
<PY> "<SKILL_DIR>/scripts/instalar_time.py" --time "<TIME>" --instalar
```

Copia os `agents/*.toml` do time pra `.codex/agents/` e marca a linha do
time como `ativo` em `capacidades/PLUGINS.md`. Recusa (exit 3) qualquer
toml com resto de outra plataforma; sai 4 sem copiar nada se o orçamento de
listagem estourar — nesse caso remova um time instalado primeiro (a saída
do comando já lista quais).

**Time do kit** (`times/<time>/time.json`): o comando confere que as skills
do time estão em `.agents/skills/` (faltou alguma, sai 2 e a mensagem diz
quais: a Casa veio incompleta, clone de novo o repositório-modelo, que já
traz o time; esta skill não cria skill), gera os subagentes do `time.json`
(o mesmo texto do gerador do Native AI) e grava só os que faltam ou mudaram.
Aqui NÃO há recusa de "outra plataforma" (o kit serve às duas) nem medida de
orçamento (as skills já estão na Casa e já entram na conta). Rodar de novo
não muda nenhum byte.

### P5 — Espelho no banco (se existir)

Com `credenciais/CONEXOES.md` já mostrando o banco conectado, o comando
acima termina rodando o `sincronizar_catalogo.py` (irmão do
`instalar_time.py`), que espelha agentes, skills e workflows da Casa na tela
do sistema, em lotes. O mesmo vale ao `--remover`. Sem banco ainda, não há
nada a fazer aqui.

Se a saída trouxer `FALTA: o time foi atualizado, mas o catálogo não chegou
ao sistema`, rode à mão e leia a PRIMEIRA linha:

```
<PY> "<SKILL_DIR>/scripts/sincronizar_catalogo.py" --casa "<PASTA_ABERTA>"
```

- `FEITO` (saída 0): o catálogo está no sistema.
- `FALTA` (saída 2): `credenciais/.env` sem `NEXT_PUBLIC_SUPABASE_URL` e
  `SUPABASE_SERVICE_ROLE_KEY`; conecte o banco e rode de novo.
- `PAREI` (saída 3): segredo ou arquivo de credencial dentro de skill ou
  agente da Casa, de um plugin `polozi-*` ou de time do marketplace local; o
  caminho vem na mensagem. Tire o segredo do arquivo e rode de novo. Em plugin
  de terceiro (cache do Codex) a skill ou o agente afetado só fica de fora do
  catálogo, com `AVISO` e o caminho no stderr.
- `PAREI` (saída 4): o banco recusou ou ficou fora do ar; a mensagem diz o lote.
  Rodar de novo completa o que faltou. Endereço `http://` (fora de localhost) é
  recusado: a chave só viaja por `https://`.

Pra só conferir o que iria, sem enviar nada: acrescente `--dry-run`.

### P6 — Fechar

Uma linha pro dono: o que ficou instalado e como chamar
(`$polozi-chamar-time`). Depois de instalar, rode
`<PY> .codex/hooks/registro_trabalho.py reconciliar` (conclui a atividade do plano que o time provou).

## Se travar (caminho ALTERNATIVO, não o fluxo do D1)

Se o time não aparecer na aba Plugins, existe um caminho de CLI —
diagnóstico e alternativo, NUNCA o passo principal, porque a própria doc
manda instalar plugin LOCAL pelo app [24a:plugins/n16]:

```
codex plugin marketplace add "<diretório raiz do marketplace local>"
codex plugin list --json
```

Três ressalvas: (i) isso é plano B, não substitui o P3; (ii) a saída do
`list --json` é CONFERÊNCIA VISUAL — o script `instalar_time.py` NUNCA chama
essa CLI nem parseia a saída dela [24a:plugins/n16]; (iii) a doc de CLI não
fala em reiniciar o app nem em nova sessão depois desses comandos — faça os
dois gestos do P3 do mesmo jeito.

## Onde encaixa um MÓDULO NOVO (contrato pra Etapa 8)

Pra um módulo virar "time instalável" por esta skill, precisa:
- pasta com `.codex-plugin/plugin.json` contendo `name`/`version`/
  `description` [24a:plugins/f4] (único arquivo obrigatório);
- opcional `agents/*.toml` (0..N — módulo só-skill é válido);
- opcional `skills/`;
- entrada no marketplace de repositório com `source` do tipo `local`
  apontando a pasta [24a:plugins/f6], mais `policy.installation`,
  `policy.authentication` e `category` [24a:plugins/f7].

Faltando a entrada E o cache = o módulo não está no zip = **PARE**.

Agente, skill ou time **novo do próprio aluno** não passa por aqui: é com o
time Native AI (`native-ai-construir`).

## Remover (três gestos, três donos — nunca confunda)

**(a) Tirar os agentes da Casa — o que ESTA skill faz, caminho DEFAULT do kit:**

```
<PY> "<SKILL_DIR>/scripts/instalar_time.py" --time "<TIME>" --remover
```

Apaga só os tomls registrados na linha daquele time (e só se baterem byte a
byte com a origem — divergência não apaga nada, sai 5 e mostra a
diferença). O que SAI: os tomls registrados. O que FICA: o plugin
instalado, as skills do time. Isso NÃO desliga nem desinstala o plugin. Num
time do kit a origem é o que o `time.json` gera, e as skills continuam em
`.agents/skills/`; pra ligar o time de novo, `--instalar`.

**(b) Desligar o PLUGIN sem desinstalar:** aperte **Space** no plugin
instalado, dentro do **CLI plugin browser** [24a:plugins/n18] — a doc
escopa esse gesto a esse browser da CLI; não existe hoje gesto documentado
de desligar plugin pela Plugins Directory do app (gap aberto, registrado).
Pode editar `~/.codex/config.toml` (backup antes), mas nunca grave a chave `enabled` como
`false` em lugar nenhum: a doc confirma o ARQUIVO onde o app grava o estado
on/off, NUNCA a chave [24a:plugins/n18].

**(c) Desinstalar:** abra o plugin num plugin browser suportado e selecione
"Uninstall plugin", quando a ação existir — em conta de workspace ela pode
não aparecer, controlada pelo administrador [24a:plugins/n19]. Equivalente
de CLI: `codex plugin remove <plugin[@marketplace]>` [24a:plugins/n16].

**Aviso de segurança, sempre:** desinstalar o plugin remove o bundle, mas o
**conector empacotado continua conectado** até ser gerenciado no ChatGPT
[24a:plugins/n19] — vale hoje pro `polozi-social`, que já declara
`mcpServers` no manifest. Essa ressalva vale mesmo em **conta de
workspace**, onde a própria ação de desinstalar pode nem estar disponível.

## Verificar

- Rodar de novo `--time <TIME> --instalar` não muda nenhum byte nem duplica
  linha na tabela (idempotência).
- `capacidades/PLUGINS.md` nunca é editado à mão — só por esta skill.
- `AGENTS.md` nunca muda com esta skill.

## Limites

- Nunca edita `.agents/plugins/marketplace.json` (dono: Etapa 3/6 do kit) —
  só LÊ.
- Nunca copia `skills/` do time pra dentro da Casa: as skills de um plugin
  vivem no plugin (a descoberta de skill não lê a pasta `plugins/` da Casa
  [24a:skills/f8]); as do time do kit já estão em `.agents/skills/` e o
  `--instalar` só confere.
- Nunca escreve em `.codex/config.toml` da Casa nem em
  `~/.codex/config.toml` do aluno.
- Nunca grava a chave `enabled` como `false` em lugar nenhum [24a:plugins/n18].
- Nunca reescreve `AGENTS.md`.
- Nunca promete cota ou número de mensagens do Plus [24a:agentes/f17].
