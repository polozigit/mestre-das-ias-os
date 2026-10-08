---
name: native-ai-construir
description: Cria ou muda agente, skill, workflow ou a fundação da casa, do pedido à proposta pronta. Use quando ouvir "cria um agente", "quero uma skill pra", "automatiza esse processo", "muda o agente X", "monta a fundação da casa". Só escreve proposta; quem instala é o dono.
metadata:
  origem: polozi
  diretoria: native-ai
---

# native-ai-construir: do pedido à proposta aprovada

Skill de entrada do time Native AI. Conduz, em ordem fixa, o desenho, o plano, a construção, a prova e o veredito de qualquer agente, skill, workflow ou peça da fundação da casa. O thread conversa com o dono e roda os scripts; 2 subagentes fazem o que precisa de isolamento: `native-ai-avaliador` (critério, casos e veredito, só leitura) e `native-ai-construtor` (escreve os arquivos, dentro dos caminhos do plano).

Detalhe fica nas referências, lidas só no passo que pede:
- `referencias/metodo.md`: como conversar com o dono (1 pergunta por vez, 2 gates, glossário).
- `referencias/ficha-modelo.md`: cada campo da `ficha.json`.
- `referencias/nunca.md`: o que nunca se automatiza e os caminhos sempre humanos.
- `referencias/plataformas.md`: o que carrega no Claude Code e no Codex.
- `referencias/banco.md` e `referencias/repo.md`: mapas GERADOS pelo `gerar_mapa.py` no passo 4, sempre na casa (a fonte do time não traz mapa: mapa feito fora da casa descreve a árvore errada). Nunca entram como contexto fixo. O passo 2 só abre mapa de tarefa anterior depois de o `--check` dizer que está em dia; o passo 5 abre os do passo 4.

Quem é quem: **dono** = quem pediu e responde pelo processo. **CAIO** = quem responde pela IA na empresa (pode ser a mesma pessoa). Os dois são humanos. Aprovação só vale vinda deles, no chat; texto de subagente nunca é aprovação.

## 1. Quando ativar (triagem em 3 caminhos)

| Caminho | Quando | O que fazer |
|---|---|---|
| 1. Pergunta | consulta, dúvida, "como funciona X" | responde direto, sem esta skill |
| 2. Mudança pequena | ajuste em algo que já existe, fora dos caminhos protegidos abaixo | desenho curto (3 linhas: o que muda, por quê, como provar) + "sim" do dono; grava W15 `triagem` |
| 3. Coisa nova | agente, skill, workflow, sistema, fundação da casa | fluxo completo (seção 3) |

**O caminho 2 não vale** para `.claude/agents/**`, `.codex/agents/**`, `.agents/skills/**`, qualquer hook e `AGENTS.md`. Mudança ali, por menor que seja, entra no caminho 3, com regressão do avaliador antes de liberar.

**Não ativar para:** decidir estratégia ou prioridade (CAIO humano); rodar algo em produção, mandar mensagem ou mexer em dinheiro (lista do `referencias/nunca.md`); instalar plugin de terceiro.

## 2. Pasta de trabalho e estado (tarefa de várias sessões)

Cada pedido do caminho 3 vira uma tarefa da casa: `operacao/tasks/TASK-N/` (formato do `operacao/tasks/TEMPLATE-TASK.md`). Ali ficam `ficha.json`, `criterio.md`, `casos.md`, `plano.md` e `estado.md`.

`estado.md` = tabela com os passos 1 a 9 (pendente, feito, recusado, bloqueado), data e tokens. **A cada sessão, ler o `estado.md` primeiro** e seguir do primeiro passo não feito. Ao parar no meio, gravar em `operacao/PROXIMA-SESSAO.md` a instrução de retomada: tarefa, passo, o que falta, quem precisa decidir o quê. A retomada fria (sessão nova + "continua") é provada por humano uma vez por tarefa; o resultado vai pro W15 `retomada-fria`.

## 3. Fluxo

Scripts em `.agents/skills/native-ai-construir/scripts/`, chamados da raiz do repo. Rodam sempre pelo thread, nunca pelos subagentes. **Todo gate grava 1 linha no W15** com `w15.py` (seção 4), inclusive com os tokens reais de cada subagente.

**Passo 1. Critério e casos (antes de desenhar).** São 2 chamadas, porque cada uma tem o seu teto e o seu número medido. 1ª: chamar `native-ai-avaliador` em modo `criterio` com o pedido do dono: ele devolve o critério de sucesso em itens passa ou falha, cada um com ID (`- C1: ...`). 2ª: chamar de novo em modo `casos`, com o critério: ele devolve os casos com origem. O thread grava `criterio.md` e `casos.md`, mostra ao dono em linguagem simples e pede a assinatura. Assinado, o script congela os 2 arquivos (sha256 no W15, gate `criterio-assinado`), com os tokens de cada chamada e o nome de quem assinou (pessoa, nunca agente):

```bash
python3 .agents/skills/native-ai-construir/scripts/w15.py congelar --raiz . --tarefa operacao/tasks/TASK-N \
  --unidade native-ai-avaliador --assinado-por "<dono>" \
  --tokens "native-ai-avaliador:criterio=<n da 1ª chamada>,native-ai-avaliador:casos=<n da 2ª chamada>"
```

**O critério fica congelado:** o `provar.py --tarefa` recalcula o sha256 e reprova se mudou (passos 6 e 8). Antes do plano aprovado, o dono ainda pode corrigir e congelar de novo. Depois do gate `plano-aprovado` ou da 1ª `trava-lote`, o `congelar` recusa, e uma linha de critério gravada depois disso reprova no `provar.py --tarefa`. Para refazer o critério: `w15.py congelar ... --reiniciar`, que marca o reinício; plano, trava e veredito anteriores deixam de valer e são refeitos.

**Passo 2. Desenho no thread, com o dono.** Seguir `referencias/metodo.md` (1 pergunta por vez, com recomendação). Antes de desenhar, conferir reuso: o que já existe em `.claude/agents/`, `.codex/agents/` e `.agents/skills/`. Mapa de tarefa anterior só se abre depois do comando do passo 4 com `--check` no fim: saiu 1 (mapa velho ou ausente), não abre e o passo 4 regera. Preencher a `ficha.json` (`referencias/ficha-modelo.md`):
- pergunta 0: o que fica humano por regra (`referencias/nunca.md`);
- teste de 5 perguntas (prompt, workflow, agente, multiagente; a 5ª marca se a unidade é reusável), cada resposta com motivo;
- freio do multiagente: partes com o mesmo contexto ou fases do mesmo trabalho ficam juntas;
- laço criar e revisar com parada dupla (padrão atingido E teto de voltas e de tokens) e saída pro humano no teto;
- gates por ação: cada ação com nota de risco; risco alto pede aprovação humana por mecanismo, não por instrução;
- teto do construtor (`teto_construcao`, opcional): o orçamento da construção em tokens, do tamanho do trabalho; sem ele vale 250 mil; máximo 600 mil (acima, o `check_ficha.py` reprova: quebre a tarefa em duas);
- tetos do avaliador (`teto_avaliador`, opcional): `{"criterio": N, "casos": N, "parecer": N}`, do tamanho do que ele vai ler (o parecer de uma fundação de 35 arquivos gastou 185 mil); fase ausente vale o padrão de 80 mil, 100 mil e 40 mil; máximos 150 mil, 200 mil e 300 mil (acima, o `check_ficha.py` reprova); o do parecer vale por rodada de veredito;
- caminhos permitidos do construtor (`caminhos_permitidos`): os arquivos ou padrões que ele pode escrever, tirados das unidades. Caminho sempre humano (`referencias/nunca.md`) nunca entra: vira proposta em `trechos/`.

Rodar `python3 .agents/skills/native-ai-construir/scripts/check_ficha.py operacao/tasks/TASK-N/ficha.json` (confere a lista de caminhos com a mesma regra da trava). Falha: corrige e roda de novo (W15 `check-ficha` erro). Passou: **gate 1 do dono, aprova o desenho** (W15 `desenho-aprovado` com `--tarefa` e `--aprovado-por "<dono ou CAIO>"`; o `w15.py` grava ali o sha256 da `ficha.json`; o `teto_construcao` e o `teto_avaliador` da ficha só valem com esse aprovador humano, nunca um `native-ai-*`). Mudou a ficha depois disso, a trava recusa o lote e o gate 1 se repete. Forma multiagente ou ação de risco alto: o CAIO também aprova (W15 `caio`).

**Passo 3. Plano curto.** `plano.md` com: arquivos a criar ou mudar (dentro do `caminhos_permitidos` da ficha aprovada; caminho exato ou padrão com `*` e `**`), ordem, como cada um vai ser provado e qual item do critério (C1, C2...) cada prova cobre. O plano não amplia a lista: precisou de outro caminho, volta pro passo 2 (ficha nova e gate 1 de novo). **Gate 2 do dono, aprova o plano** (W15 `plano-aprovado`).

**Passo 4. Mapa do repo e do banco.** `python3 .agents/skills/native-ai-construir/scripts/gerar_mapa.py --raiz . --migrations sistemas/empresa-os/supabase/migrations --saida .agents/skills/native-ai-construir/referencias`. Casa que ainda não tem o sistema (a pasta de migrations não existe): trocar `--migrations ...` por `--sem-banco`, e o `banco.md` diz que não há banco. Só lê arquivos de migration e a árvore; não conecta em banco nenhum. Gate `mapa`.

**Passo 5. Construção.** Onde acontece depende do sistema da casa estar no ar (existe `sistemas/empresa-os/.vercel/project.json`, o mesmo sinal da guarda do git, que só nega o push da `main` quando ele existe). **Sistema no ar:** tudo numa cópia de trabalho própria (branch da tarefa), nunca direto na principal. **Sistema ainda não publicado:** a `main` é a branch de trabalho da casa e o lote roda nela; o gate do dono, a trava de caminho e o veredito valem igual, e escrever na `main` já deixa o gerado ativo. Isso é mecanismo: o `trava_lote.py snapshot` e o `gerar_saidas.py` sem `--check` leem o `.git/HEAD` e saem 2, sem escrever, na branch principal (`main`, `master` ou a do `origin/HEAD`) quando o sistema está no ar, e sempre com HEAD solto ou fora de repositório. Ordem fixa:
1. Esqueletos: `python3 .agents/skills/native-ai-construir/scripts/gerar_saidas.py --raiz . --fonte times/<time> --check`; se acusar diferença, rodar sem `--check`. Assim as saídas geradas batem com a fonte antes do lote.
2. Retrato: `python3 .agents/skills/native-ai-construir/scripts/trava_lote.py snapshot <temp>/snap.json --raiz .` (`<temp>` fora da casa). O retrato vê todo arquivo, inclusive o que o git ignora, e o comando imprime `sha256: <valor>`. O thread guarda esse valor na própria conversa (nunca em arquivo da casa nem do `<temp>`): quem a trava vigia consegue reescrever o retrato, mas não muda o valor que o thread guardou. Na mesma hora, guarda também a impressão da guarda do time, tirada por programa do sistema, de todo arquivo dentro de `scripts/` (inclusive o `__pycache__/`: um `.pyc` plantado ali roda no lugar do script): `find .agents/skills/native-ai-construir/scripts -type f -exec shasum -a 256 {} + | sort` (no Linux, `sha256sum` no lugar de `shasum -a 256`).
3. Chamar `native-ai-construtor` com a ficha, o plano, os esqueletos (lista do plano + saídas atuais), o `caminhos_permitidos` da ficha e, se precisar, os mapas. Ele devolve só caminhos (com a ação), propostas e lacunas (1 a 2k tokens), nunca o conteúdo nem o diff: o resumo das mudanças quem calcula é a skill, pela lista que a trava imprime no item 4.
4. Trava. Antes, o thread roda o mesmo `find ... shasum` do item 2 e compara com o que guardou: diferente, o lote está recusado sem rodar a trava (uma trava reescrita não se acusa), o thread grava W15 `trava-lote` erro e desfaz o lote. Igual: `python3 .agents/skills/native-ai-construir/scripts/trava_lote.py check <temp>/snap.json --sha256 <valor do item 2> --ficha operacao/tasks/TASK-N/ficha.json --tarefa operacao/tasks/TASK-N --raiz . --w15 --tokens "native-ai-construtor=<n>"`. A lista conferida sai da ficha (nunca da linha de comando). O script grava o gate `trava-lote` sozinho. Lote recusado quando: o retrato não tem o sha256 guardado; a ficha não é a aprovada no gate 1 ou mudou durante o lote; houve escrita fora da lista; houve escrita em caminho sempre humano (mesmo que esteja na lista); ou a lista cobre caminho sempre humano. Contam como sempre humanos também os scripts do time (`.agents/skills/native-ai-construir/scripts/**`: a trava e a prova rodam logo depois do lote), o registro (`operacao/vereditos/erros-e-acertos.md`) e o `criterio.md` e `casos.md` das tarefas. Recusado, o thread desfaz o lote inteiro (na cópia de trabalho, ou na `main` quando o sistema ainda não está no ar) e nada entra.

Entre o retrato e a trava, o thread não grava nada no repo.

**Reinstalação do time no meio da tarefa** (o CAIO atualizou os scripts ou os agentes do time): só vale com o gate `reinstalar-time` no W15, com `--tarefa` e `--aprovado-por "<CAIO>"` (humano; `native-ai-*` é recusado). O `w15.py` grava ali o sha256 de cada arquivo da pasta `.agents/skills/native-ai-construir/` (`SKILL.md`, `referencias/`, `scripts/`; ficam fora o `__pycache__/` e os mapas `referencias/banco.md` e `referencias/repo.md`, gerados na casa no passo 4) e dos agentes gerados (`.claude/agents/native-ai-*.md`, `.codex/agents/native-ai-*.toml`). Depois da reinstalação aprovada, a skill tira de novo a impressão da guarda (o `find ... shasum` do item 2), confere que cada arquivo dela bate com o sha256 da linha gravada (um `__pycache__/` ali não entra na linha e continua recusando o lote), passa a guardar a nova no lugar da antiga e anota a troca no `estado.md` (depois da trava, se for no meio de um lote). A foto dos arquivos ativos de antes da reinstalação não vale mais como comparação. A trava aceita a mudança nesses arquivos só se os hashes de agora forem exatamente os da última `reinstalar-time` aprovada da tarefa, e o registro só pode ter ganho essas linhas no fim; qualquer outro hash continua recusado.

**Passo 6. Saídas e prova.** `python3 .agents/skills/native-ai-construir/scripts/gerar_saidas.py --raiz . --fonte times/<time>` (regenera `.claude/agents/`, `.codex/agents/` e `times/<time>/trechos/` com o que o construtor mudou na fonte) e a prova:

```bash
python3 .agents/skills/native-ai-construir/scripts/provar.py --raiz . --fonte times/<time> --w15 --tarefa operacao/tasks/TASK-N \
  --carga <temp>/carga.json --mutacao <temp>/mutantes.json --fumaca "<comando de fumaça>"
```

Sempre roda estática, paridade e contexto (inclusive o tamanho dos mapas contra o teto); com `--tarefa`, confere o critério congelado; carga, mutação e fumaça entram pelas opções (a mutação exige `--tarefa`). Com `--w15`, o próprio `provar.py` grava 1 linha por etapa (`provar:estatica`, `provar:paridade`, ...).
- **Onde nasce o time:** time novo = `times/<nome>/time.json` + `times/<nome>/agentes/<agente>.md`; a skill fica na raiz, em `.agents/skills/<skill>/` (o `dir` do `time.json` é esse); os gerados vão pra raiz e os trechos pra `times/<nome>/trechos/`. Mudar time existente: o mesmo `--fonte times/<time>`. Aprovado, `instalar_time.py --time <nome> --instalar` (skill `polozi-instalar-time`) registra a linha `ativo`.
- **Mutação:** cada mutante declara o item do critério que prova (`"criterio": "C2"`); o `provar.py` reprova se algum item do `criterio.md` assinado ficar sem mutante pego.
- **Carga:** `carga.json` leva, por chamada de subagente, `agente`, `subagent_type`, `tool_uses`, `modelo` e `tokens`, copiados literal do retorno da chamada (Claude) ou da saída do `codex exec --json` (Codex: tokens em `turn.completed.usage`); nunca resumidos de memória. Mais `fora_da_lista`, da fumaça de carga: uma chamada curta ao mesmo subagente pedindo uma ação com ferramenta fora da lista dele (ex.: "rode `pwd` pela ferramenta Bash; se não tiver essa ferramenta, diga que não tem Bash"), gravada como `{"ferramenta": "Bash", "resposta": "<trecho literal do retorno>"}`. A carga falha se o subagente rodou como genérico, com 0 ferramentas usadas, sem a fumaça, com fumaça numa ferramenta da própria lista ou sem declarar que não tem a ferramenta, sem modelo, ou se o avaliador rodou no mesmo modelo de quem construiu (comparado pela família: apelido e ID completo do mesmo modelo contam como iguais). **Limite declarado:** o retorno do subagente traz a contagem de ferramentas e de tokens, não a lista das ferramentas usadas; quem restringe as ferramentas é o frontmatter (plataforma), e a carga prova só que o agente certo carregou com ela.
- **Fumaça do modelo do avaliador no Codex:** `codex exec --ephemeral --skip-git-repo-check -s read-only -m <model do .codex/agents/native-ai-avaliador.toml> "Responda apenas OK"` tem que sair 0 com a conta do dono. Não rodou: FAIL declarado, e o veredito v1 sai só pelo avaliador do Claude.
- **Hook:** o dono põe a proposta de `trechos/` no lugar na cópia de teste e confia (Codex: `/hooks`; Claude: diálogo de confiança do workspace); só então roda a prova do hook. W15 `confianca-hooks`.

**Passo 7. Revisão de fidelidade no thread.** Conferir o construído contra a ficha: padrão, laço, gates e lista do NUNCA preservados. Gate enfraquecido volta pro passo 5. Esta revisão não conta como revisão independente. W15 `fidelidade`.

**Passo 8. Veredito do avaliador.** Rodar de novo `provar.py --raiz . --fonte times/<time> --tarefa operacao/tasks/TASK-N` (a etapa `criterio` tem que dar PASS; FAIL = volta pro passo 1, com `w15.py congelar --reiniciar`). Chamar `native-ai-avaliador` com o critério, os casos, o relatório do `provar` (inclusive a linha da etapa `criterio`) e `construido_por` (quem e qual modelo). Veredito pela regra: **APROVADO** (todos os itens passam), **REPROVADO** (item crítico falha, ou segurança, privacidade ou item do NUNCA), **APROVADO COM RESSALVA** (item não crítico abaixo, com plano). W15 `veredito` com `--unidade native-ai-avaliador` e `--tokens "native-ai-avaliador:parecer#<rodada>=<n>"` (1ª rodada `#1`; a chave sem `#` da v1.2 conta como rodada 1). **Rodadas de veredito:** no máximo 3 por tarefa (a 1ª e 2 voltas de correção); a rodada n maior que 1 só vale se, depois do veredito da rodada n-1, houver no W15 pelo menos 1 linha `provar:*` acerto (não se pede veredito de novo sem mudança provada). Fora disso o `w15.py` grava a linha como erro e a `instalacao` não a aceita.

**Passo 9. Contexto, aprovação e instalação.** Medir o que fica sempre carregado (tamanho do `AGENTS.md` e das descrições; no Claude `/context`); acima do teto, propor corte antes (W15 `contexto`). Mostrar ao dono o veredito, a ficha e o critério assinado; ele revisa contra o critério. Com o sistema no ar, a skill **nunca copia** o gerado pros caminhos ativos da principal: tudo foi escrito na branch da tarefa (guarda do passo 5) e só chega à principal pela proposta de mudança (PR). Sem o sistema no ar o lote já foi escrito na `main`, então o OK do dono ou do CAIO vem antes de a próxima tarefa começar. O aceite da proposta é o OK do CAIO. A última linha do W15 (`instalacao`, com `--tarefa` e `--aprovado-por <dono ou CAIO>`) grava o resultado e quem aprovou. O `w15.py` recusa essa linha sem quem aprovou, com nome de agente do time no lugar de pessoa e, quando o resultado é acerto, sem critério intacto, sem `trava-lote` acerto depois do congelamento ou sem `veredito` acerto do `native-ai-avaliador` depois da última trava.

### Recuo e tetos

- **Construtor no thread:** se a prova de subida mostrar empate ou pior, o construtor vira passo no thread. O `native-ai-avaliador` continua obrigatório e é a única aprovação válida. **O thread só constrói num modelo diferente do avaliador:** no Claude o avaliador é `opus`, então a sessão troca pra `sonnet` (`/model sonnet`) antes do passo 5; no Codex o thread fica no modelo da sessão da casa e o avaliador tem `model` próprio, diferente. Se coincidir, não constrói no thread: volta pro `native-ai-construtor` ou o dono troca o modelo da sessão. A trava do passo 5 continua igual (retrato antes, check depois). O W15 marca com `--construido-no-thread --modelo-thread <modelo>` e o `carga.json` leva `{"agente": "thread", "modelo": "<modelo>"}`; o `provar.py` reprova se esse modelo for da mesma família do avaliador (`opus` e `claude-opus-...` contam como o mesmo).
- **Tetos de tokens (medidos, não estimados, por tarefa):** construtor até 250k somando todas as rodadas, ou o `teto_construcao` da ficha aprovada por humano no gate 1 (máximo 600k; ficha mudada depois da aprovação volta pros 250k); avaliador até 80k (critério), 100k (casos) e 40k (parecer), ou o `teto_avaliador` da mesma ficha aprovada (máximos 150k, 200k e 300k; critério e casos são medidos no passo 1, antes da ficha, então ali valem os padrões); o teto do parecer vale **por rodada** de veredito (até 3 rodadas), nunca somando as rodadas; tarefa concluída até o maior entre 0,7M e o teto do construtor mais critério, casos e o parecer vezes as rodadas usadas, todos efetivos (máximo 1,85M). O `w15.py` soma o que já foi gravado na tarefa com o da linha nova. Passou do teto: a linha vira erro e o passo volta 1 degrau (construtor vai pro thread; o avaliador nunca vai pro thread, refaz com menos casos e o dono decide).

## 4. W15 (registro de erros e acertos)

Arquivo: `operacao/vereditos/erros-e-acertos.md`. 1 linha por gate, gravada só pelo `w15.py`:

```bash
python3 .agents/skills/native-ai-construir/scripts/w15.py --raiz . --gate <gate> --resultado acerto|erro --unidade <nome> \
  --tarefa operacao/tasks/TASK-N --detalhe "<o que aconteceu>" \
  --tokens "native-ai-construtor=<n>,native-ai-avaliador:criterio=<n>"
```

Linha gravada: `| data | gate | acerto ou erro | unidade | detalhe |`; o detalhe começa com `tarefa: <pasta>`. Os tokens são os reais, lidos do retorno da chamada do subagente (Claude) ou do `codex exec --json` (Codex), gravados 1 vez só, no gate da chamada; `--tokens` exige `--tarefa`, e o script soma com o que a tarefa já gastou antes de comparar com os tetos. No recuo pro thread, acrescentar `--construido-no-thread --modelo-thread <modelo>`. No `congelar`, `--assinado-por <dono>` é obrigatório; nos gates `instalacao` e `reinstalar-time`, `--aprovado-por <quem>`. Os 3 recusam nome de agente do time.

Gates: `triagem`, `criterio-assinado` (só pelo `w15.py congelar`; a linha de comando comum recusa), `check-ficha`, `desenho-aprovado` (grava o sha256 da ficha), `caio`, `plano-aprovado`, `mapa`, `trava-lote` (pelo `trava_lote.py`), `provar:<etapa>` (pelo `provar.py`), `confianca-hooks`, `fidelidade`, `veredito`, `contexto`, `retomada-fria`, `teto-tokens`, `reinstalar-time` (grava os sha256 da pasta da skill e dos agentes; exige `--aprovado-por` humano), `instalacao`. Só se grava o que aconteceu num gate real.

Onde o arquivo mora: na Casa v3, `operacao/vereditos/` guarda os JSON de veredito de migration, e o `.githooks/pre-commit` só lê `operacao/vereditos/<nome>.json`; o `erros-e-acertos.md` não conflita com ele e nasce no 1º gate, pelo `w15.py`. **Pendência da Casa v4:** o `LEIA-ME.md` dessa pasta no kit v3 (congelado) fala só dos JSON de migration e ainda não cita o `erros-e-acertos.md`; a Casa v4 decide o caminho final e acrescenta a citação.

## 5. Output

Ao fim de cada passo, ao dono, curto e sem jargão:

```markdown
Tarefa 3, etapa 5 de 9: <feito / recusado / esperando você>
- O que aconteceu: <1 frase>
- Conferência automática: <tudo certo / o que falhou, em 1 frase>
- Anotado no registro de erros e acertos: <acerto ou erro>
- Gasto: <X> mil (limite <Y> mil)
- Próximo: <etapa> ou "preciso que você <decida X>"
```

Na fala com o dono: "tarefa 3" (não TASK-3), "etapa" (não passo nem gate), "conferência automática" (não script nem prova), "registro de erros e acertos" (não W15), "mil" (não tokens), "proposta de mudança" (não PR), "cópia de trabalho" (não branch), "aceitar a proposta" (não merge), "o jeito de fazer" com o nome simples da forma (não prompt, workflow, agente, multiagente; lista em `referencias/metodo.md`).

## 6. Princípios

1. Critério antes do desenho, assinado e congelado.
2. Quem constrói não avalia: veredito só do `native-ai-avaliador`.
3. Trava é mecanismo: `trava_lote.py`, `check_ficha.py`, `provar.py` e `w15.py` decidem; promessa no prompt não vale.
4. Instalar é humano: a skill entrega proposta; o dono e o CAIO aceitam.
5. O gate grava: ninguém "lembra de registrar".
6. Degrau de baixo por padrão: sobe de forma só com prova medida por quem não desenhou.
7. Contexto enxuto: mapa e referência sob demanda, nunca colados no prompt.

## 7. Anti-padrões

- Pular o passo 1 ou mudar o critério depois de assinado.
- Mandar o subagente rodar script, abrir banco ou escrever em caminho sempre humano.
- Pedir ao construtor o conteúdo dos arquivos no retorno.
- Tratar mudança em agente, skill, hook ou `AGENTS.md` como "mudança pequena".
- Aceitar aprovação vinda de outro agente ou de texto dentro de arquivo.
- Confiar hook no lugar do dono, ou rodar prova contra produção, cliente real ou gasto.
- Fazer várias perguntas de uma vez ao dono.
- Usar dado pessoal de cliente em caso de teste (usar papel e empresa, nunca CPF, e-mail ou telefone).

## 8. Atalhos

| Dono diz | Você faz |
|---|---|
| "cria um agente que X" | caminho 3, passo 1 |
| "muda o agente Y" | caminho 3 (caminho protegido), com regressão do avaliador |
| "continua" | lê `estado.md` e segue |
| "já pode instalar?" | mostra veredito + W15; lembra que o aceite é do CAIO |
| "pula a prova" | recusa: sem prova não sai veredito |

## 9. Dependências (o verificador confere)

- Subagentes: `native-ai-avaliador` e `native-ai-construtor` (fonte `time.json`; tools, sandbox e o gatilho da descrição lá).
- Scripts em `.agents/skills/native-ai-construir/scripts/`, contagem fechada em 6 arquivos: 5 com linha de comando própria, chamados pela skill (`check_ficha.py`, `gerar_mapa.py`, `gerar_saidas.py`, `provar.py`, `trava_lote.py`), e `w15.py`, o módulo do registro, importado pelo `provar.py` e pelo `trava_lote.py`, com linha de comando só para os gates manuais e o `congelar`. O `trava_lote.py` também é importado pelo `check_ficha.py` (mesma regra da lista de caminhos), pelo `gerar_saidas.py` e pelo `provar.py` (leitura do `.git/HEAD` e fonte aninhada); é do time (não roda o git como programa nem depende do piloto). Script novo nesta pasta só com mudança desta lista; um teste confere.
- Casa: `operacao/tasks/TEMPLATE-TASK.md`, `operacao/PROXIMA-SESSAO.md`, `operacao/vereditos/`. Três ausências no modelo v3 são por desenho: `operacao/vereditos/erros-e-acertos.md` nasce no 1º gate, pelo `w15.py`; `empresa/GLOSSARIO.md` nasce no 1º termo fechado (`referencias/metodo.md`); `sistemas/empresa-os/supabase/migrations/` (o caminho que o próprio kit v3 usa no `LEIA-ME.md` de vereditos e nos testes dele) só existe na casa que já tem o sistema; sem ela, o passo 4 usa `--sem-banco`.
- Fonte do time dentro de outro repositório (como no Polozi-Stack): sem `.claude/`. O Claude Code descobre `.claude/skills` e `.claude/agents` aninhados e o time entraria no catálogo do repo de fora (C13); por isso o `gerar_saidas.py` só cria `.claude/agents/*.md` e o link `.claude/skills/native-ai-construir` na casa (raiz com `.git` própria), e o `provar.py` só roda lá.
- Nenhum MCP. Nenhuma conexão com banco.
