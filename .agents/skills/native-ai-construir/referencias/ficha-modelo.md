# Ficha do desenho (`ficha.json`)

1 ficha por tarefa, em `operacao/tasks/TASK-N/ficha.json`. É o desenho neutro: diz O QUE vai ser construído e com que travas, sem falar de pasta ou campo de plataforma (isso é do `gerar_saidas.py` e do construtor). O `check_ficha.py` lê a ficha e lista cada campo que falhou (exit 1); sem falha, imprime OK. Preenchida no passo 2, com o dono.

## Campos

| Campo | O que é, em linguagem simples | Regra que o `check_ficha.py` confere |
|---|---|---|
| `processo` | o nome do trabalho que vai ser feito | texto obrigatório |
| `resultado` | o que sai no fim, em 1 frase | texto obrigatório |
| `criterio_padrao` | como se sabe que o resultado ficou bom | texto obrigatório |
| `forma` | o degrau escolhido: `prompt` (1 chamada), `workflow` (passos fixos), `agente` (o modelo escolhe os passos), `multiagente` (vários agentes) | um dos 4 |
| `respostas_5` | as 5 perguntas do teste de forma, cada uma com `pergunta` (1 a 5), `resposta` e `motivo`. Nas perguntas 1 a 4, a primeira que resolve encerra a subida (as seguintes ficam "não perguntada", com o motivo); a 5 marca se a unidade se repete e vale reusar | exatamente 5, perguntas 1 a 5 uma vez cada, todas com resposta e motivo |
| `prova_subida` | a comparação com o degrau de baixo: `feita`, `degrau_baixo`, `resultado`, `julgado_por` (quem julgou não pode ser quem desenhou). `null` quando a forma é `prompt` ou `workflow` | `agente` e `multiagente` exigem o objeto; `multiagente` exige `feita: true` |
| `padrao_orquestracao` | como as partes se encadeiam (ex.: encadeamento, roteamento, gerador e crítico) | texto obrigatório |
| `unidades` | cada peça a construir: `nome`, `forma`, `reusavel`, `mecanismo` (`skill`, `subagente`, `hook`, `instrucao`, `script`), `papel`, `objetivo`, `formato_saida`, `ferramentas` (lista), `fronteira` (o que NÃO é dela), `retorno` (o que devolve) | pelo menos 1; `multiagente` exige 2 ou mais; nome sem repetir; unidade sem fronteira falha; fronteira que toca caminho sempre humano sem negar falha |
| `laco` | o ciclo criar e revisar: `criterio` (itens passa ou falha), `tipo`, `revisor` (nunca quem cria), `parada_padrao`, `teto_iteracoes`, `teto_tokens`, `escalonamento` (o que acontece no teto). `null` se não há laço | com laço: tetos inteiros maiores que 0 e todos os campos preenchidos |
| `acoes` | tudo que o desenho pode FAZER, cada uma com `acao`, `risco` (`baixo`, `medio`, `alto`), `mecanismo` e `quem_aprova` | risco alto exige aprovador humano e mecanismo diferente de `instrucao`; ação em caminho sempre humano precisa ser risco alto |
| `caminhos_permitidos` | onde o construtor pode escrever: caminho exato ou padrão com `*` (dentro de uma pasta) e `**` (qualquer profundidade). É a lista que o `trava_lote.py` aplica no passo 5, lida desta ficha aprovada | lista não vazia de textos; sem `..`, sem caminho absoluto e sem cobrir caminho sempre humano, os scripts do time, o registro de erros e acertos nem o `criterio.md` e `casos.md` da tarefa (mesma regra da trava) |
| `nunca` | o que fica humano neste desenho (`item`) e onde o humano decide (`onde_humano_decide`). Parte da lista de `nunca.md` | pelo menos 1; todo item com onde o humano decide, nomeando o humano (dono, CAIO, responsável); agente nunca decide |
| `orcamento_tokens` | teto de tokens da tarefa inteira | inteiro maior que 0 |
| `teto_construcao` | opcional: teto do construtor nesta tarefa, do tamanho do trabalho (ex.: fundação de 25 arquivos pede mais que 1 skill). Ausente, vale 250 mil. Só vale com o gate 1 gravado com `--aprovado-por` humano e a ficha igual à aprovada; a tarefa inteira passa a aceitar o maior entre 700 mil e este teto mais o critério, os casos e o parecer de cada rodada de veredito usada (máximo 1,85 milhão) | inteiro maior que 0 e no máximo 600 mil; acima disso, quebre a tarefa em duas |
| `teto_avaliador` | opcional: tetos do avaliador nesta tarefa, por fase: `{"criterio": N, "casos": N, "parecer": N}` (ex.: o parecer de uma fundação de 35 arquivos gastou 185 mil). Fase ausente vale o padrão: 80 mil, 100 mil e 40 mil. O `parecer` vale por rodada de veredito (até 3 rodadas por tarefa). Mesma regra do `teto_construcao`: só vale com o gate 1 gravado com `--aprovado-por` humano e a ficha igual à aprovada | objeto com `criterio`, `casos` e/ou `parecer`, cada um inteiro maior que 0 e no máximo 150 mil, 200 mil e 300 mil; outra chave ou valor acima do máximo reprova |
| `modelos` | modelo e esforço de cada unidade (`unidade`, `modelo`, `esforco`) | pelo menos 1, campos preenchidos |
| `casos` | caminho do arquivo de casos assinado no passo 1 | texto obrigatório |
| `criterio_sucesso` | caminho do critério assinado no passo 1 | texto obrigatório |
| `reabrir_quando` | o que faz o desenho voltar pra mesa (modelo novo, erro repetido, volume) | texto obrigatório |
| `data` | quando o desenho foi fechado | `AAAA-MM-DD` |

Caminhos sempre humanos (`AGENTS.md`, `CLAUDE.md`, settings, config, hooks, workflows do GitHub, migrations): ver `nunca.md`. Na ficha, mexer neles só aparece como ação de risco alto com aprovador humano, ou como item do `nunca` com a proposta em `trechos/`; nunca em `caminhos_permitidos`.

## Exemplo pequeno e completo

Resumo semanal de vendas: passos fixos (workflow), 1 unidade, laço curto com revisor por script, 1 ação de risco alto. Passa no `check_ficha.py`.

```json
{
  "processo": "Resumo semanal de vendas para o dono",
  "resultado": "Toda segunda, um resumo de 1 página com o total vendido, os 3 maiores pedidos e o que caiu em relação à semana anterior",
  "criterio_padrao": "O total bate com a soma do arquivo de vendas; nenhum nome, e-mail ou telefone de cliente; cabe em 1 página",
  "forma": "workflow",
  "respostas_5": [
    {"pergunta": 1, "resposta": "não", "motivo": "uma chamada só não soma o arquivo com segurança; a soma precisa ser conferida por código"},
    {"pergunta": 2, "resposta": "sim", "motivo": "os passos são sempre os mesmos: ler o arquivo, somar, comparar, redigir"},
    {"pergunta": 3, "resposta": "não perguntada", "motivo": "a pergunta 2 já resolveu"},
    {"pergunta": 4, "resposta": "não perguntada", "motivo": "a pergunta 2 já resolveu"},
    {"pergunta": 5, "resposta": "sim", "motivo": "o mesmo procedimento roda toda semana"}
  ],
  "prova_subida": null,
  "padrao_orquestracao": "encadeamento (passos fixos em série)",
  "unidades": [
    {
      "nome": "resumo-vendas",
      "forma": "workflow",
      "reusavel": true,
      "mecanismo": "skill",
      "papel": "monta o resumo semanal a partir do arquivo de vendas",
      "objetivo": "resumo de 1 página que passa nos 3 itens do critério",
      "formato_saida": "arquivo operacao/resumos/AAAA-MM-DD.md",
      "ferramentas": ["Read", "Write"],
      "fronteira": "só lê o arquivo de vendas e escreve o resumo; não manda mensagem a ninguém",
      "retorno": "caminho do resumo e os itens do critério que falharam"
    }
  ],
  "laco": {
    "criterio": ["o total bate com a soma do arquivo", "sem nome, e-mail ou telefone de cliente", "cabe em 1 página"],
    "tipo": "gerador e crítico",
    "revisor": "script que refaz a soma e procura dado pessoal; o redator não se aprova",
    "parada_padrao": "os 3 itens passam",
    "teto_iteracoes": 2,
    "teto_tokens": 30000,
    "escalonamento": "bateu o teto: mostra ao dono o último rascunho e os itens que falharam"
  },
  "acoes": [
    {"acao": "ler o arquivo de vendas da semana", "risco": "baixo", "mecanismo": "script", "quem_aprova": "ninguém (só leitura)"},
    {"acao": "gravar o resumo em operacao/resumos/", "risco": "baixo", "mecanismo": "script", "quem_aprova": "ninguém (arquivo interno)"},
    {"acao": "mandar o resumo no grupo da equipe", "risco": "alto", "mecanismo": "script", "quem_aprova": "dono, a cada envio"}
  ],
  "caminhos_permitidos": [".agents/skills/resumo-vendas/**"],
  "nunca": [
    {"item": "mandar o resumo pra fora da empresa", "onde_humano_decide": "o dono encaminha, se quiser"},
    {"item": "mudar o AGENTS.md pra chamar o resumo", "onde_humano_decide": "proposta em trechos/AGENTS.md; o CAIO aceita a proposta"}
  ],
  "orcamento_tokens": 40000,
  "modelos": [{"unidade": "resumo-vendas", "modelo": "sonnet", "esforco": "low"}],
  "casos": "operacao/tasks/TASK-7/casos.md",
  "criterio_sucesso": "operacao/tasks/TASK-7/criterio.md",
  "reabrir_quando": "o resumo errar a soma 2 vezes, ou o dono pedir outro formato",
  "data": "2026-10-06"
}
```

Por que cada escolha:
- `workflow` e não `agente`: os passos não mudam de uma semana pra outra (pergunta 2). Por isso `prova_subida` é `null`.
- Revisor é script: a soma e a busca de dado pessoal dá pra checar por código; onde dá pra checar por código, o código decide.
- Mandar no grupo é risco alto (fala pra fora do arquivo, com dado da empresa): aprovação do dono a cada envio, por mecanismo.
- Mudar o `AGENTS.md` é caminho sempre humano: vira proposta em `trechos/AGENTS.md`.
- `caminhos_permitidos` tem só a pasta da skill nova: o construtor não escreve em mais nada, e o `AGENTS.md` fica de fora (é sempre humano).
