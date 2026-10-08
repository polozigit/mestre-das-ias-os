---
name: polozi-chamar-time
description: "Aciona um time já instalado pelo nome, um por vez, com objetivo e formato. Use em \"chama o time de vendas\"; não instala time."
---

# Polozi Chamar Time

Porteiro, não fluxo: garante que o time de área pedido está instalado antes
de delegar, e delega pelo NOME do agente — nunca por caminho de arquivo.
Cada time já traz as próprias skills (ex.: o time `marketing` traz
`marketing-persona`, `marketing-identidade` e `marketing-logo`); esta skill NÃO
reimplementa esse fluxo — só barra a chamada de time não instalado, impõe
um por vez e exige objetivo + formato de saída.

## Preparar

Resolver `<SKILL_IRMA>` = `polozi-instalar-time` NO MESMO diretório de
skills onde esta skill foi achada — achou esta skill em
`~/.agents/skills/polozi-chamar-time`? procure a irmã em
`~/.agents/skills/polozi-instalar-time`; achou no cache numa versão `X`?
procure a irmã em `.../polozi-fundacao/X/skills/polozi-instalar-time`, a
MESMA `X`, nunca fixa. As duas skills compartilham um único script — assim
não duplica código. Não achou a irmã → **PARE**, peça pra reinstalar o
`polozi-fundacao.zip`.

## Comando do Python (faça isto antes de qualquer comando)

Tentar, UM DE CADA VEZ e sem encadear com `||`:

```
python3 --version
py -3 --version
python --version
```

O PRIMEIRO que imprimir `Python 3.` vira `<PY>`. Nenhum comando desta skill
pode conter `python3` literal fora desta checagem.

## Pré-checagem OBRIGATÓRIA (antes de qualquer delegação)

```
<PY> "<SKILL_IRMA>/scripts/instalar_time.py" --verificar "<TIME>"
```

- Exit 0: o time está instalado — siga pra "Delegar" abaixo.
- Exit 2: **PARE**. Não delega. Responda ao dono que o time não está
  instalado e que o caminho é `$polozi-instalar-time`.

Nunca pule esta checagem, mesmo se o dono disser "tenho certeza que já
instalei" — o disco decide, não a memória da conversa.

## Delegar

1. Acionar o agente PELO NOME (o diretor do time) — a doc só reconhece
   acionamento por nome de papel, via pedido direto ou via instrução de
   AGENTS.md/skill que peça delegação [24a:agentes/n02]. Nunca por caminho
   de arquivo.
2. UM time por vez — coerente com `max_concurrent_threads_per_session = 1`
   já commitado no `.codex/config.toml` da Casa v3 [24a:agentes/f5] e com
   `[agents] enabled = true`, que mantém o multi-agente ligado
   [24a:agentes/f8].
3. A mensagem de delegação tem os 2 campos que o "Ciclo de trabalho" do
   AGENTS.md v3 exige: objetivo e formato de saída (o AGENTS.md não fala
   em "insumos" — não são 3 campos). Na prática, o que o agente precisa
   ler entra dentro do objetivo, não como um campo à parte.

## Onde estão os nomes

A tabela "Times da empresa" de `capacidades/PLUGINS.md`, coluna Agentes —
leia esse arquivo quando precisar; é por isso que o `AGENTS.md` não carrega
a lista de times (custo de catálogo de agentes não é quantificado por
nenhuma página oficial [24a:agentes/n04], então o kit mantém o `AGENTS.md`
enxuto).

## Depois da entrega

Se a peça sai da empresa (publicação, entrega externa), a própria skill
orquestradora do time já manda passar pelo auditor daquele time — esta
skill não reimplementa isso, só lembra em 1 linha.

## Avisos honestos

- Fluxo com subagente consome MAIS token que fazer sozinho — a própria doc
  oficial repete esse aviso mais de uma vez [24a:agentes/f10].
- Nenhum número de cota ou de mensagens do Plus é prometido: a doc não
  publica isso [24a:agentes/f17].
- O subagente herda o sandbox e o modo de permissão da sessão pai quando o
  toml do agente não define o próprio [24a:agentes/f13] — delegar não
  "reduz" risco de escrita.

## Limites

- Não instala nada, não copia arquivo.
- Não chama 2 times na mesma mensagem.
- Não inventa nome de agente que não esteja em `capacidades/PLUGINS.md`.
- Não liga, desliga nem desinstala plugin — "não quero mais esse time" cai
  em `$polozi-instalar-time --remover`; desligar/desinstalar o PLUGIN são
  gestos do CLI plugin browser / plugin browser suportado, descritos lá
  [24a:plugins/n18, plugins/n19].
