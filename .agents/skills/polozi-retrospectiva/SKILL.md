---
name: polozi-retrospectiva
description: "Revisa a semana, anota até 3 lições e propõe até 3 regras pro dono aprovar. Só sob pedido; não serve pra fechar trabalho."
---

# Polozi Retrospectiva

Revisar o que aconteceu na semana (changelog, pendências, tasks concluídas)
e propor até 3 regras novas, no formato de linha do `operacao/DECISOES.md`,
pro dono aprovar. Lê também o registro da vigília (`operacao/vigilancia/`).
Não decide, não aplica, não commita — quem aprova é o dono, e quem aplica é
`$polozi-aplicar-regra`. Roda só quando o dono pede ("hora da retrospectiva"):
o kit não agenda rotina nenhuma para ela.

Ideia das lições adaptada do `continuous-learning-v2` do affaan-m/ECC
(licença MIT), sem o observador em segundo plano: aqui a lição é escrita só
no arquivo da retrospectiva, a pedido, e nunca vira regra sozinha.

## Regras desta skill (nunca conta com o AGENTS.md carregado)

Esta skill pode rodar sem a doc oficial confirmar que o AGENTS.md do
projeto é carregado nesse contexto — por isso as travas moram AQUI, não lá:

- Nunca rode git: quem salva no GitHub é a skill `tecnologia-publicar`.
- Escreva SÓ em `operacao/retrospectivas/` — nenhum outro arquivo muda.
- Nunca escreva em `operacao/vigilancia/`: lá quem escreve é a skill
  `tecnologia-vigiar`.
- No máximo 3 propostas por retrospectiva.
- No máximo 3 lições por retrospectiva, todas no formato fixo da seção "Lições".
- Cota de execução: `nao medido` — não existe comando oficial que devolva
  isso sem credencial; nunca invente um número.
- Nunca leia `credenciais/.env` nem peça chave.

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

1. `<PASTA_ABERTA>/.agents/skills/polozi-retrospectiva/scripts/retrospectiva.py`
2. `~/.agents/skills/polozi-retrospectiva/scripts/retrospectiva.py`
3. cache de plugin, por GLOB — NUNCA escreva a versão do plugin fixa no
   meio do caminho (a doc publicada diz que a versão vale "local", o disco
   de hoje mostra "2.0.0" [24a:plugins/n11] — as duas coisas driftam, então
   varrer com glob, nunca hardcodar). Esse padrão de busca é
   `<PADRAO_GLOB_CACHE>`:
   `~/.codex/plugins/cache/*/polozi-fundacao/*/skills/polozi-retrospectiva/scripts/retrospectiva.py`.
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
vira `<SKILL_DIR>` — a pasta que contém `scripts/retrospectiva.py` (sem o
`scripts/retrospectiva.py` no final).

Nenhum caminho achou → **PARE**: esta skill está instalada incompleta
(falta `scripts/retrospectiva.py`). Mostre ao aluno e peça pra
baixar o zip do kit de novo, descompactar e abrir no aplicativo a pasta que tem o `AGENTS.md` dentro, não a de fora. Não improvise a retrospectiva sem
script, não rode nada relativo, não copie script pra dentro da Casa.

## Rodar

```
<PY> "<SKILL_DIR>/scripts/retrospectiva.py" --casa "<PASTA_ABERTA>"
```

Sem `--casa`, o script não roda (argumento obrigatório). `--dry-run` mostra
o que seria escrito sem gravar nada — use se o dono quiser conferir antes.
O script só conta tasks concluídas pelo arquivo (`operacao/tasks/`). Se
`credenciais/CONEXOES.md` já tiver o banco da empresa conectado, complemente
a contagem consultando o painel — o script não fala com banco nenhum.

## Lições (formato fixo)

Depois de rodar o script, acrescente ao FIM do arquivo criado (nunca em outro
arquivo) a seção `## Lições`, com no máximo 3 lições, cada uma assim:

```
### L-1
- Gatilho: <a situação em que isto vale, em 1 frase>
- Ação: <o que fazer quando o gatilho aparece, em 1 frase>
- Evidência: <onde se viu: tarefa, arquivo, commit ou linha do registro>
- Confiança: baixa | média | alta
```

Regras: lição sem evidência não entra; confiança `alta` só com 3 ou mais
ocorrências com evidência, `média` com 2, `baixa` com 1; sem lição nova,
escreva `Nenhuma lição esta semana.` Lição não é regra: ela só vira regra se o
dono disser `aprova a D-N` e o `$polozi-aplicar-regra` aplicar (a lição aprovada
vira 1 proposta de `operacao/DECISOES.md`, como as outras).

## Fechar

1. Dizer o caminho do arquivo criado (`operacao/retrospectivas/AAAA-MM-DD.md`).
2. Listar cada proposta e cada lição em 1 linha.
3. Perguntar: "quer aprovar alguma? fale `aprova a D-N`."

## Verificar

- O arquivo do dia foi criado e nenhum outro arquivo da Casa mudou.
- No máximo 3 propostas foram listadas.
- A seção `## Lições` existe, com no máximo 3 lições e as 4 linhas (Gatilho, Ação, Evidência, Confiança) em cada uma.
- A seção Vigília aparece, e diz `sem registro de vigília nesta semana`
  quando a pasta não existe.
- Nenhuma chave, senha ou trecho de `credenciais/.env` apareceu na saída.

## Limites

- Nunca rode git — isso é sempre da skill `tecnologia-publicar`.
- Nunca aplique uma proposta ou lição sozinha — isso é sempre do `$polozi-aplicar-regra`, e só depois do sim do dono.
- Nunca escreva fora de `operacao/retrospectivas/`.
- Nunca invente número de cota — escreva `nao medido` e aponte o painel de uso do Codex.
- Nunca peça chave, senha ou token no chat.
- Se o arquivo do dia já existir, não sobrescreva — a skill recusa (exit 2); avise o dono.
