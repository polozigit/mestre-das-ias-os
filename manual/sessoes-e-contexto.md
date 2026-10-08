# Sessões e contexto

Use uma conversa para cada resultado distinto. Continue na mesma conversa enquanto o objetivo, as fontes e as decisões permanecerem relacionados.

## Abra outra conversa quando

- a entrega atual terminou;
- o próximo pedido tem outro objetivo;
- muitos arquivos e assuntos não relacionados foram acumulados;
- decisões antigas começaram a ser confundidas;
- perguntas ou correções estão se repetindo;
- o trabalho chegou a um ponto natural de validação.

Não existe uma porcentagem universal que indique o momento exato. Use os sinais de clareza e continuidade.

## Antes de encerrar

Atualize `operacao/STATUS-ATUAL.md`, registre mudanças em `operacao/CHANGELOG.md`, guarde decisões em `operacao/DECISOES.md` e prepare `operacao/PROXIMA-SESSAO.md` quando houver continuação.

A próxima conversa deve receber um objetivo claro e consultar o Mapa. Não copie toda a conversa anterior para o novo chat. Registre nos arquivos somente o que precisa persistir.

## Agendar a retrospectiva semanal

A retrospectiva (`$polozi-retrospectiva`) é melhor como tarefa agendada do
app, pra rodar sozinha sem alguém abrir o chat. Passo a passo:

1. No app desktop (a interface de agendamento existe lá e na web, não no CLI).
2. Projeto: a pasta desta Casa.
3. Modo de execução: **Local** — a outra opção cria uma cópia separada da pasta, e o que ela escrever lá não aparece na sua Casa.
4. Repetição: toda segunda, 07:00.
5. Prompt: exatamente `$polozi-retrospectiva`.
6. Permissão: gravação na pasta do projeto, nunca acesso total.
7. O computador precisa estar ligado, com o app aberto e a pasta no disco
   na hora marcada.
8. Depois que ela rodar, a próxima sessão vai achar a Casa com um arquivo
   novo ainda não salvo — é normal: a verificação de início de sessão vê, e
   a `tecnologia-publicar` salva.

## Agendar a vigília diária

A vigília (`tecnologia-vigiar`) também é melhor como tarefa agendada,
1×/dia, criada do mesmo jeito acima, com o prompt `$tecnologia-vigiar` — no
app desktop, Modo de execução
**Local** (a outra opção cria uma cópia separada da pasta, que não enxerga
o histórico já salvo nem o que a vigília gravou antes). O limite é o
mesmo, dito na cara: com o app fechado, ela não roda
[24a:cli_automacoes/f9, n23 (d), n23 (e)]. Sem número de frequência/cota —
`nao medido` (gate T-agendada).
