# Fluxo de trabalho: como a IA registra e salva

Um agente só trabalha com você. Scripts registram o pedido e salvam; nenhum modelo classifica pedido.
Conversar, perguntar e pedir diagnóstico não muda arquivo nem publica.

Os comandos rodam na raiz da Casa, com o Python registrado em `operacao/INSTALACAO.md` (`<python>` abaixo).
Quem roda é a IA; você só precisa saber o que acontece.

## 1. Registrar o objetivo

Todo pedido aparece no quadro de Tarefas, com área. Quando o pedido vai gerar arquivo, a IA registra o
objetivo uma vez:

```
<python> .codex/hooks/registro_trabalho.py objetivo --sessao <id-da-conversa> --titulo "Título" --objetivo "Resultado" --criterio "Como comprovar" --area tecnologia --tipo codigo
```

- Tipos: `consulta`, `documento`, `codigo`, `publicacao`.
- Objetivo só planejado, sem começar: `--planejado`. Objetivo novo de verdade, na mesma conversa: `--novo`.
  Sem `--novo`, a continuação mantém o vínculo com o objetivo anterior. Continuar, numa conversa nova, o
  objetivo de outra: `--retomar <id-do-objetivo>`. `--ficha` já cria a ficha da tarefa (veja o item 2).
- Área que a IA não reconhece: `geral`.
- Confirmação ("sim", "pode"), compactação e sugestão interna não são objetivo novo.
- O `--sessao` é o id que o hook imprime, numa linha curta, na primeira mensagem da conversa.

A fila local fica em `operacao/tasks/.sessoes/` (o git ignora). Sem banco ou sem chave de servidor, o pedido
espera ali e sobe sozinho quando der. `provar` mostra se está "no banco" ou "na fila":

```
<python> .codex/hooks/registro_trabalho.py provar
```

## 2. Concluir com prova

```
<python> .codex/hooks/registro_trabalho.py concluir --sessao <id-da-conversa> --resumo "Resultado comprovado"
```

- Consulta pronta não pede commit: a resposta é a evidência.
- Documento ou código pede `--arquivo <caminho>` e `--commit <SHA>`; código pede também
  `--verificacao "checagem executada"`. `--arquivo` e `--verificacao` podem repetir.
- Publicação ainda pendente não conclui.
- Fim de resposta nunca conclui sozinho: concluir é decisão do trabalho, com evidência da versão final.
- A ficha `operacao/tasks/TASK-N/TASK.md` só nasce quando o trabalho continua noutra conversa, é do plano
  ou você pede: `registro_trabalho.py ficha --sessao <id-da-conversa>` (ou `objetivo ... --ficha`).
- `registro_trabalho.py sincronizar` manda a fila local pro banco.

## 3. Salvar por marco

Salvar é por marco, nunca por resposta: objetivo com arquivo concluído, "salva aí" ou pausa. Um comando, só
os caminhos deste trabalho:

```
<python> .agents/skills/tecnologia-publicar/scripts/salvar.py -m "Mudança" <caminhos exatos>
```

- Nunca `--tudo` nem `git add -A`: o que é de outro trabalho não entra.
- Resposta sem arquivo novo não gera commit, nem envio, nem publicação.
- Provar que está no GitHub: `salvar.py --provar <caminhos>`. Sem GitHub: "salvo neste computador".
- Salvo, integrado por PR e no ar são estados diferentes; a IA diz qual. Conversa, documento e arquivo de
  agentes não têm publicação.

## 4. O que não muda

Curso e plano de 90 dias mantêm estrutura, provas e limites. Migration, acesso ao banco (RLS), login,
segredos e ações que apagam mantêm todas as travas. Tela nova só vai ao ar com o seu "aprovado" no link do
preview.
