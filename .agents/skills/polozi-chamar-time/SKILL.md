---
name: polozi-chamar-time
description: "Confere o time instalado e segue a skill dele na conversa. Use em \"chama o time de vendas\"; não instala time."
---

# Polozi Chamar Time

Porteiro, não fluxo: confere que o time pedido está instalado e manda a
CONVERSA PRINCIPAL seguir a skill dele. Esta skill não chama subagente. Cada
time traz as próprias skills (ex.: o time `marketing` traz `marketing-persona`,
`marketing-identidade` e `marketing-logo`); aqui não se reimplementa esse fluxo.

## Preparar

Resolver `<SKILL_IRMA>` = `polozi-instalar-time` NO MESMO diretório de
skills onde esta skill foi achada (ex.: achou esta em
`<PASTA_ABERTA>/.agents/skills/polozi-chamar-time`? a irmã está em
`<PASTA_ABERTA>/.agents/skills/polozi-instalar-time`). As duas compartilham
um único script. Não achou a irmã → **PARE**: faltam skills da fundação na
pasta. Peça pra baixar o zip do kit de novo, descompactar e abrir no
aplicativo a pasta que tem o `AGENTS.md` dentro, não a de fora.

## Comando do Python (faça isto antes de qualquer comando)

Tentar, UM DE CADA VEZ e sem encadear com `||`:

```
python3 --version
py -3 --version
python --version
```

O PRIMEIRO que imprimir `Python 3.` vira `<PY>`. Nenhum comando desta skill
pode conter `python3` literal fora desta checagem.

## Pré-checagem OBRIGATÓRIA (antes de seguir qualquer skill do time)

```
<PY> "<SKILL_IRMA>/scripts/instalar_time.py" --verificar "<TIME>"
```

- Exit 0: o time está instalado — siga pra "Seguir a skill do time" abaixo.
- Exit 2: **PARE**. Responda ao dono que o time não está
  instalado e que o caminho é `$polozi-instalar-time`.

Nunca pule esta checagem, mesmo se o dono disser "tenho certeza que já
instalei" — o disco decide, não a memória da conversa.

## Seguir a skill do time

1. A conversa principal faz o trabalho, lendo e seguindo a skill do time.
   Nenhum subagente é chamado por esta skill.
2. Escolher a skill: abra `times/<TIME>/time.json` e olhe a lista `skills`.
   Use a que tem `"entrada": true` quando o pedido é o começo do trabalho da
   área; senão a que o campo `quando` (ou a `description` do `SKILL.md` dela,
   em `.agents/skills/<nome>/`) diz que atende o pedido. Nenhuma serve? Diga
   ao dono o que o time oferece, não improvise.
3. Revisor ou conferente do time (lista `agents` do `time.json`) só entra
   quando a própria skill do time manda, no gatilho dela. Nunca como chefe do
   time e nunca por iniciativa desta skill.
4. Um time por vez: pediu dois, termine um e siga pro outro.

## Onde estão os nomes

A tabela "Times da empresa" de `capacidades/PLUGINS.md` e o `time.json` de
cada time. Não invente nome de skill nem de agente que não esteja lá.

## Depois da entrega

Se a peça sai da empresa (publicação, entrega externa), a skill do time já
manda passar pelo revisor daquele time: esta skill só lembra em 1 linha.

## Aviso honesto

Subagente consome MAIS token que fazer sozinho, e a doc oficial repete isso
[24a:agentes/f10]: por isso aqui a conversa principal trabalha.

## Limites

- Não instala nada, não copia arquivo.
- Não chama subagente nem 2 times na mesma mensagem.
- Não liga, desliga nem desinstala plugin: "não quero mais esse time" cai em
  `$polozi-instalar-time --remover`.
