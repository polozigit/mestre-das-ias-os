---
name: polozi-criar-empresa-ia
description: "Cria a estrutura da Empresa IA na pasta aberta, com git local e agentes. Use só na primeira instalação."
---

# Polozi Criar Empresa IA

Inicializar a Casa da Empresa IA (v3) na pasta principal já aberta: estrutura de pastas, `AGENTS.md`, MAPA, os agentes-núcleo e git local com commit inicial. Perguntar somente nome da empresa e nome do dono — nunca dado do futuro dossiê.

## Preparar

1. Obter o nome da empresa e o nome do dono. Se o usuário já informou os dois, não perguntar de novo.
2. Resolver e informar o caminho absoluto da pasta principal atual — é ela que vira a Casa; nunca criar pasta filha.
3. Não pedir atividade, cidade, produto ou qualquer fato que pertença ao dossiê (etapa seguinte da jornada).
4. Localizar `scripts/criar_empresa_ia.py` dentro desta Skill.

## Prévia

Executar primeiro, sem alterar nada e sem tocar em git:

```bash
python3 scripts/criar_empresa_ia.py --nome "NOME" --dono "DONO" --destino "PASTA_ABSOLUTA" --dry-run
```

Mostrar: caminho absoluto, se a pasta está vazia, a árvore que será criada (inclusive `.codex/`, já pronto no modelo) e o aviso de que a etapa seguinte roda `git init`. Interromper se a pasta já tiver `AGENTS.md`/`EMPRESA-IA.md`/`MAPA-DA-EMPRESA-IA.md` ou já for um repositório git (`.git` existe) — a Casa já nasceu, não crie de novo. Caso contrário, pedir uma única confirmação antes de escrever.

## Aplicar

Após confirmação, executar:

```bash
python3 scripts/criar_empresa_ia.py --nome "NOME" --dono "DONO" --destino "PASTA_ABSOLUTA"
```

Se a pasta não estiver vazia e o usuário tiver confirmado explicitamente o uso dela, acrescentar `--permitir-pasta-nao-vazia`. Essa opção nunca autoriza sobrescrita — arquivo já existente com o mesmo nome bloqueia a execução.

Nessa ordem, o script: (1) copia `assets/modelo-empresa-ia-v3/` INCLUSIVE `.codex/` (config.toml + os agentes-núcleo já prontos), substituindo `{{NOME_EMPRESA}}`, `{{NOME_DONO}}` e `{{DATA_ATUAL}}` em todo `.md`; (2) cria `credenciais/.env` vazio com permissão 600 (a chave em si nunca nasce aqui — isso é trabalho de `polozi-registrar-conexao`); (3) NÃO gera agente nenhum — os `.toml` são versionados no modelo, fonte `assets/agents-spec/agentes.json`, regerados por `gerar_agentes.py --destino` e provados por `--check`; (4) roda `git init` + `git branch -M main` + `git config core.hooksPath .githooks` + `git add -A` + `git commit -m "casa inicial da NOME IA"`.

## Verificar

1. Confirmar `AGENTS.md`, `EMPRESA-IA.md`, `MAPA-DA-EMPRESA-IA.md` e `operacao/STATUS-ATUAL.md`, com nome da empresa e nome do dono já preenchidos — nenhum `{{` sobrando em nenhum `.md`.
2. Confirmar que `.git` existe, `git branch --show-current` retorna `main`, `git config core.hooksPath` retorna `.githooks` e `git log --oneline` mostra o commit "casa inicial da NOME IA".
3. Confirmar os agentes-núcleo em `.codex/agents/*.toml`: `polozi-gerente-de-trabalho` e `polozi-sistema-qa` (a lista exata vem de `assets/agents-spec/agentes.json`).
4. Confirmar que `.codex/config.toml` existe no destino.
5. Confirmar que `credenciais/.env` existe, vazio, permissão 600 — nunca ler o conteúdo em voz alta nem colar no chat.
6. Confirmar que nenhum arquivo empresarial fictício (dossiê, persona, identidade visual) foi criado — todos os papéis nascem `ausente` no MAPA (`operacao/mapa.json`).
7. Informar quantos arquivos e diretórios nasceram e que o próximo passo da jornada (etapa 4) é o GitHub — `polozi-criar-github`.

## Limites

- Nunca executar `Aplicar` sem prévia e confirmação.
- Nunca alterar nem remover um arquivo existente na pasta de destino.
- Nunca escolher outro destino sem autorização do usuário; nunca criar em subpasta.
- Nunca preencher conteúdo que pertence ao dossiê, à marca ou a Skills futuras.
- Nunca editar `.codex/agents/*.toml` à mão — a fonte é `assets/agents-spec/agentes.json`; mudou o agente, regenere com `gerar_agentes.py --destino <modelo>` e confira com `--check`.
- Nunca imprimir o conteúdo de `credenciais/.env` no chat — a prova de que existe é o `chmod 600`, não o texto.
- Pasta com `.git` ou marcadores da Casa já presentes: não force reinicialização — isso é reinstalação, fora do escopo desta Skill.
