---
name: tecnologia-definir-o-que
description: "Transforma o pedido do dono numa tarefa clara do sistema: o problema, quem usa, o que aparece na tela e como saber que ficou pronto. Use antes de construir tela ou mudar o sistema, em 'quero uma tela de', 'o sistema podia', 'preciso controlar X'."
metadata:
  origem: polozi
  diretoria: tecnologia
---

# tecnologia-definir-o-que

Define O QUÊ antes de qualquer construção, e deixa o "como" para quem constrói (`tecnologia-construir-tela`, `tecnologia-mudar-banco`). O dono não é técnico: ele responde sobre o negócio ("quem usa", "o que precisa aparecer", "como eu sei que deu certo") e aprova um resumo em português. Nada é construído antes do "ok" dele.

Fatos do sistema (permissões por slug, schemas, o que já existe) vêm de `.agents/skills/tecnologia-sistema/referencias/regras-do-sistema.md` e do mapa do banco. Comandos rodam da raiz da Casa.

## Quando pular

Mudança simples (trocar um texto, um rótulo, a ordem de dois itens, uma cor pelo `theme.css`, um botão que só chama o que já existe) que NÃO toca dado, permissão nem comportamento não passa por esta conversa. Siga direto para `tecnologia-construir-tela`: ela mesma escreve um `requisito.md` mínimo com 1 critério, marcado "mudança simples, sem conversa", e segue. Dúvida se toca dado, permissão ou comportamento = faça o requisito completo aqui.

## Passos

1. **Saber o que já existe.** Siga a skill `tecnologia-sistema`: gere o mapa do banco na hora e leia as regras. Veja se já existe tabela, tela ou permissão parecida antes de propor outra (reusar antes de criar).

2. **Abrir a pasta da tarefa.** Se o pedido já veio com um `TASK-N`, use esse. Senão, crie o próximo número (a pasta `operacao/tasks/` já existe na Casa):
   ```bash
   U=$(ls operacao/tasks | grep -o '^TASK-[0-9]*' | grep -o '[0-9]*$' | sort -n | tail -1); N=$((10#${U:-0} + 1)); mkdir -p "operacao/tasks/TASK-$N" && cp operacao/tasks/TEMPLATE-TASK.md "operacao/tasks/TASK-$N/TASK.md" && echo "TASK-$N"
   ```
   O comando imprime o número; use-o nos passos abaixo. No `TASK.md` preencha título, `Aberta em` (com `date +%F`), o objetivo em 1 frase e, como critério de pronto, "Todos os critérios de aceite do `requisito.md` marcados sim". Não mude os bullets do topo do `TASK.md` (quem fecha a tarefa procura a linha `- Status:`).

3. **Perguntar o mínimo: no máximo 3 perguntas, UMA por vez, cada uma com uma sugestão sua.** Formato: a pergunta, "Eu sugiro <X>, serve?" e espere a resposta antes da próxima. Só pergunte o que o pedido não respondeu, nesta ordem de prioridade:
   1. Qual problema isso resolve e quem vai usar?
   2. O que essa pessoa precisa ver e fazer na tela?
   3. Como você vai saber que ficou pronto, e o que fica de fora?

   Não pergunte nada técnico (tabela, permissão, biblioteca): isso você decide e explica em palavras do negócio. Terminou as 3 perguntas e ainda falta algo: escreva como "suposição" no `requisito.md` e mostre ao dono no passo 5, sem fazer a quarta pergunta.

4. **Escrever `operacao/tasks/TASK-N/requisito.md`** com estas seções, nesta ordem:
   - **Problema:** 1 frase.
   - **Quem usa e com que permissão:** o papel em palavras e o slug no formato `<modulo>.<acao>` (`read`, `write` ou `manage`). Veja os mais comuns que já existem: `grep -rhoE "\('[a-z_]+\.(read|write|manage)'" sistemas/empresa-os/supabase/migrations | sort -u` (alguns módulos têm ações próprias, como `juridico.denuncia`; o mapa do banco e as migrations do módulo são a fonte). Slug novo exige o módulo cadastrado no banco e é mudança de banco (`tecnologia-mudar-banco`). Quem não tem a permissão não pode ver nem gravar: escreva isso como critério.
   - **O que a tela mostra e faz:** os campos, os botões, e o que aparece quando não há dado e quando dá erro.
   - **Dados:** a tabela existente que a tela lê ou grava (nome vindo do mapa do passo 1), ou "tabela nova" (então a construção chama `tecnologia-mudar-banco` antes). Diga se tem dado pessoal de cliente ou de funcionário (sim ou não e qual).
   - **Critérios de aceite:** cada um é uma linha de checklist `- [ ] Quando <ação>, então <resultado visível>`, de sim ou não, que alguém consegue verificar (quem constrói marca `[x]` só depois de ver o resultado). Sempre inclua estes (cortando só o que não se aplica, e dizendo por quê):
     - quem tem a permissão vê a tela com dado, e a tela não aparece vazia sem explicação;
     - quem NÃO tem a permissão não vê o conteúdo nem consegue gravar (teste com um usuário sem a permissão);
     - a tela abre bem no celular e no tema escuro;
     - lint, tipos e testes do sistema passam.
   - **Fora do escopo:** o que não será feito agora.
   - **Suposições e dúvidas em aberto:** o que você assumiu sem confirmar.

   Base dos critérios: a Definition of Done do Scrum Guide 2020 ("descrição formal do estado do incremento quando atende às medidas de qualidade exigidas", https://scrumguides.org/scrum-guide.html). Não achamos fonte oficial única para "critério de aceite"; o formato acima é regra da casa.

5. **Mostrar ao dono e só seguir com o "ok".** Mostre um resumo de 6 a 8 linhas em português simples (problema, quem usa, o que aparece, como saberemos que ficou pronto, o que fica de fora, suposições), não o arquivo inteiro. Termine com: "Está certo? Responda ok, ou diga o que mudar."
   - Só vale um "ok" explícito sobre ESTE resumo. Silêncio, "pode seguir" sobre outro assunto ou o "ok" de outra tarefa não valem.
   - Pediu mudança: ajuste o `requisito.md` e mostre de novo só o que mudou.
   - Com o "ok", grave no topo do `requisito.md` a linha `Aprovado pelo dono em AAAA-MM-DD: "<frase literal do dono>"` (data de `date +%F`).
   - Se o dono mudar de ideia depois do "ok" e o que mudou altera critério, dado ou permissão: edite o requisito, mostre a diferença e peça o "ok" de novo antes de continuar.

6. **Passar adiante.** Tela nova ou mudança de tela: chame `tecnologia-construir-tela` com o caminho do `requisito.md`. O "ok" do dono vale para o requisito (o QUÊ) e libera a construção E a publicação: depois dele a construção testa e publica sem pedir outro "ok" por publicação; o dono só é avisado quando já está no ar. Só banco: `tecnologia-mudar-banco`. Quem escolhe COMO fazer (componente, arquivo, consulta) é a construção, não esta skill.

## Como falar com o dono

- Pergunta curta, uma por vez, com a sua sugestão. Nada de lista numerada de perguntas.
- Sem jargão: não diga "RLS", "slug" nem "migration"; diga "quem pode ver", "quem pode editar", "precisa guardar uma informação nova no banco".
- Não prometa prazo. Diga o que vai acontecer a seguir: "Depois do seu ok eu construo, testo e publico, e te aviso quando estiver no ar".

## Nunca

- Construir, editar tela ou mexer em banco por esta skill.
- Fazer mais de 3 perguntas, ou mais de uma de uma vez.
- Perguntar ao dono algo técnico que você mesmo decide.
- Seguir sem o "ok" explícito do dono, ou aproveitar o "ok" de outra tarefa.
- Escrever critério que não dá para verificar com sim ou não ("fica bonito", "é rápido").
- Inventar tabela, permissão ou tela que o mapa já tem; se o mapa não mostra, diga que não achou.
- Decidir o "como" (qual componente, qual arquivo): fica para a construção.
- Mudar um requisito aprovado sem mostrar a mudança ao dono.
