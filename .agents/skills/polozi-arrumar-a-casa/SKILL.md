---
name: polozi-arrumar-a-casa
description: "Audita e arruma a estrutura da Empresa IA: arquivo fora do lugar, MAPA quebrado. Use quando a casa parecer bagunçada."
---

# Polozi Arrumar a Casa

Auditar a estrutura da Empresa IA e corrigir só o que é seguro corrigir sozinho — nunca apagar nada, nunca resolver ambiguidade real por conta própria.

## Preparar

1. Confirmar que a pasta aberta é a Empresa IA (`EMPRESA-IA.md` e `MAPA-DA-EMPRESA-IA.md` existem).
2. Localizar `scripts/arrumar_a_casa.py`.
3. A auditoria olha cinco coisas: papel do `operacao/mapa.json` apontando pra arquivo que não existe; arquivo em `producao/` sem data `AAAA-MM-DD` no nome; pasta nova de 1º nível sem `LEIA-ME.md`; `MAPA-DA-EMPRESA-IA.md` divergente do que `operacao/mapa.json` produziria; arquivo fora de `credenciais/` cujo conteúdo casa padrão de segredo (P1).

## Fazer a prévia

Rodar sem `--aplicar` (padrão é prévia):

```bash
python3 scripts/arrumar_a_casa.py --destino "PASTA_ABSOLUTA" --dry-run
```

Mostrar ao usuário, por seção: papéis do Mapa com estado desatualizado (o JSON não é tocado nesta etapa), renomeações propostas em `producao/`, pastas de 1º nível sem `LEIA-ME.md`, se o MAPA vai ser regenerado, e qualquer achado P1 de segredo (sempre mascarado — nunca o valor completo).

Achado P1 de segredo: tratar como bloqueante. Mostrar o arquivo e a linha ao dono e não commitar nem empurrar nessa pasta até o segredo sair dali: os hooks `.githooks/pre-commit` e `.githooks/pre-push` da Casa bloqueiam padrão de segredo — não é papel desta Skill decidir se o padrão encontrado é um falso positivo.

Pedir uma única confirmação antes de aplicar qualquer correção.

## Aplicar

Depois da confirmação, executar o mesmo comando com `--aplicar`:

```bash
python3 scripts/arrumar_a_casa.py --destino "PASTA_ABSOLUTA" --aplicar
```

O script então:
- Renomeia os arquivos de `producao/` sem data no nome, sempre prefixando a data (nunca sobrescreve um nome já existente).
- Regenera as duas tabelas de `MAPA-DA-EMPRESA-IA.md` a partir de `operacao/mapa.json`, preservando char a char o título, a legenda "## Estados" e o rodapé "## Fora do repositório".
- Grava o relatório completo em `operacao/auditorias/AAAA-MM-DD-arrumacao.md`.

O que ele NUNCA faz sozinho, em nenhum modo: corrigir `operacao/mapa.json`, criar `LEIA-ME.md` numa pasta nova, apagar ou mover qualquer arquivo, ou tratar/gravar o valor de um segredo encontrado.

## Verificar

1. `operacao/auditorias/AAAA-MM-DD-arrumacao.md` existe e cobre as cinco seções.
2. Cada renomeação de `producao/` preservou o conteúdo do arquivo — só o nome mudou.
3. `MAPA-DA-EMPRESA-IA.md` bate com `operacao/mapa.json` (as duas tabelas), e o restante do arquivo ficou idêntico ao de antes.
4. Papel com estado desatualizado no Mapa: reportado, não corrigido — decisão de correção é do usuário (editar `empresa/` ou ajustar `operacao/mapa.json` manualmente).
5. Pasta sem `LEIA-ME.md`: reportada; se for uma área de verdade, o usuário decide o conteúdo do `LEIA-ME.md` (esta Skill não inventa a finalidade de uma área nova).
6. Achado P1: nenhum valor de segredo apareceu por completo no chat nem no relatório — só os 4 últimos caracteres.

## Limites

- Nunca apaga nada. Nunca move ou sobrescreve arquivo existente.
- Nunca corrige `operacao/mapa.json` sozinho — só reporta o estado desatualizado.
- Nunca cria `LEIA-ME.md` sozinho — reporta a ausência e para.
- Nunca escreve o valor de um segredo encontrado; sempre mascarado, só os 4 últimos caracteres.
- Ambiguidade real (dois candidatos plausíveis para o mesmo problema) é só sinalizada no relatório — nunca resolvida por conta própria.
- Renomeação de `producao/` só corrige o nome do arquivo; nunca reescreve seu conteúdo.
- Achado P1 de segredo é sempre bloqueante: nada disso sobe pro GitHub sem passar antes pelo hook `.githooks/pre-push` da Casa, que bloqueia padrão de segredo.
