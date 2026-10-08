# O que carrega em cada plataforma

Lido nos passos 5, 6 e 9. Fonte: pesquisa P22 do Mestre das IAs, seções (e), (m), (m.2) e (m.3), prova num repo real em 05 e 06/10/2026 (Codex CLI 0.146.1), e pacote do Engenheiro de Harness (4.2 e 4.4). Fato de plataforma vence rápido: confira de novo se tiver mais de 7 dias.

## Tabela curta

| Peça | Claude Code | Codex local (CLI, pasta confiável) | Codex na nuvem |
|---|---|---|---|
| `AGENTS.md` na raiz | lê sozinho (PASS na nuvem, m item 1); `CLAUDE.md` só se precisar de algo exclusivo, com `@AGENTS.md` | PASS (m.2 item 1) | FAIL nativo; PASS parcial só com instrução na habilidade de inicialização do ambiente (m.3) |
| Skill (fonte em `.agents/skills/`) | via link simbólico em `.claude/skills/` (PASS na nuvem, m item 2); o link só nasce na casa, nunca na fonte do time guardada dentro de outro repo (C13) | PASS em `.agents/skills/` (m.2 item 2) | não aparece na lista; só usada se o pedido apontar o caminho (m.3) |
| Subagente | `.claude/agents/<nome>.md` (PASS, m item 3) | `.codex/agents/<nome>.toml` (PASS, m.2 item 3), registrado no `.codex/config.toml` | não nativo; só lendo o `.toml` por instrução (m.3) |
| Hook | em `.claude/settings.json`, exit 2 bloqueia (PASS na nuvem, m item 4, com 1 repo por sessão) | `.codex/hooks.json` **só no formato `{"hooks": {"PreToolUse": [...]}}`** e com o hook confiado (m.2 item 4) | FAIL (m.3): guarda vai pra camada comum |
| Config do repo | `env` do `.claude/settings.json` (PASS, m item 5) | `.codex/config.toml` (PASS, m.2 item 5) | FAIL (m.3) |

Fora do v1: Codex na nuvem. O time roda em Claude Code e Codex local.

## Confiança humana (passo que só o dono faz)

- **Claude Code:** o diálogo de confiança do workspace segura os hooks de settings e as permissões de projeto. Quem aceita é o dono, na máquina dele.
- **Codex local:** o projeto precisa estar como confiável e cada hook precisa ser confiado por quem usa (no modo interativo, `/hooks`). Hook sem confiança não roda. A saída `--dangerously-bypass-hook-trust` existe no `codex exec`, mas não serve pro dono e nunca é usada pela skill.
- O formato antigo do Codex, com os eventos no topo do arquivo (`"PreToolUse": [...]` fora de `"hooks"`), faz o CLI avisar `unknown field PreToolUse` e **o hook não roda**. O `provar.py` precisa reprovar esse formato.

## Agentes do time em cada lado

| Campo | Claude (`.claude/agents/*.md`) | Codex (`.codex/agents/*.toml`) |
|---|---|---|
| Instrução | corpo do arquivo | `developer_instructions` |
| Modelo | apelido + esforço escritos (`sonnet`/`medium`, `opus`/`high`) | os dois com `model` escrito (construtor Terra, avaliador Sol); esforço escrito (`model_reasoning_effort`) |
| Ferramentas | lista exata: construtor `Read, Grep, Glob, Write, Edit`; avaliador `Read, Grep, Glob` | `sandbox_mode`: construtor `workspace-write`; avaliador `read-only` |
| MCP | nenhum | nenhum |

Os dois agentes declaram `model` no Codex. O construtor declara `gpt-5.6-terra`, o mesmo que o `.codex/config.toml` da Casa pina (decisão I32 de 07/10; antes ele não declarava e herdava da sessão, e o toml sem `model` caía no `default_subagent_model`). O avaliador declara um `model` próprio, diferente do construtor, pra não julgar com o mesmo modelo de quem construiu. O `provar.py` lê o `model` do toml do construtor (sem ele, o `.codex/config.toml` da casa) e reprova se o avaliador cair no mesmo modelo. O ID precisa rodar com conta ChatGPT e com o Codex em versão nova: na P22 (codex-cli 0.146.x), `gpt-6.1-sol` deu "not supported when using Codex with a ChatGPT account" e `gpt-5.6-terra` rodou (m.2 achado 3). Em 07/10/2026, na codex-cli 0.160.1 e com a conta do Polozi, `codex exec -m gpt-6.1-sol -s read-only "Responda só a palavra: ok"` respondeu `ok` (21.572 tokens; doc 24a, modelos f3). Por isso o avaliador passou a declarar `gpt-6.1-sol` (decisão I32 de 07/10) no lugar do `gpt-5.6-sol`, e o kit pede o Codex 0.160 ou mais novo (o preflight do instalador confere). Conferir de novo na casa do aluno pela fumaça do passo 6; se a plataforma não aceitar o modelo declarado, a paridade registra FAIL declarado e o veredito sai só pelo avaliador do Claude.

## Limites que afetam o desenho

- **Descrição de skill curta, gatilho na frente.** O Codex corta descrições quando a lista de skills passa do orçamento ("Exceeded skills context budget of 2%", m.2 achado 4); o Claude corta em 1.536 caracteres.
- **SKILL.md com campos do padrão** (`name`, `description`, `metadata`, e se preciso `license`, `compatibility`, `allowed-tools`). Campo só do Claude (ex.: `disable-model-invocation`) vai como variante do Claude.
- **1 repo por sessão no Claude na nuvem:** com 2 repos, o hook não carrega (m achado 2).
- **Cota do avaliador no Codex com conta Plus (turma de 19/11):** o Sol tem a menor cota do Plus entre Sol, Terra e Luna: no GPT-5.6, de 10 a 100 mensagens locais por janela de 5 horas (Terra 25 a 200, Luna 250 a 2.000; fato f8 de `redesign-2026-08/24a-fatos-codex-verificados-2026-09-04.md`, learn.chatgpt.com/docs/pricing, lido em 04/09/2026). Esses números são do `gpt-5.6-sol`: a cota do `gpt-6.1-sol` e do `gpt-6-luna` não foi medida, e o f8 está marcado "a reconferir" desde 07/10/2026 (conferir antes do congelamento do kit). A auditoria da turma 4 (`22-auditoria-friccao-turma-4-ago27.md`) já tirou o Sol do uso no Plus. Efeito no time: as 3 chamadas do avaliador no Codex por tarefa (critério, casos, veredito) saem dessa janela curta, junto com o resto do uso do dia, e o aluno no Plus pode parar no meio da tarefa. Cota acabou: vale a mesma saída da fumaça que falha, o veredito v1 sai só pelo avaliador do Claude. Trocar o modelo do avaliador no Codex é decisão do CAIO, nunca para a família do construtor.
- **Toda guarda de produção mora na camada comum** (regras do GitHub, CI, função do banco). Hook de agente é cinto: varia por plataforma e, na nuvem, pode não carregar (seção e).
