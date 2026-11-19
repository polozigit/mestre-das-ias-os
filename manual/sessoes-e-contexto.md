# Sessões e contexto

Use uma conversa para cada resultado distinto. Continue na mesma conversa enquanto o objetivo, as fontes e as decisões permanecerem relacionados.

## Abra outra conversa quando

- começou uma nova etapa do curso (regra fixa: cada etapa, conversa nova);
- a entrega atual terminou;
- o próximo pedido tem outro objetivo;
- muitos arquivos e assuntos não relacionados foram acumulados;
- decisões antigas começaram a ser confundidas;
- perguntas ou correções estão se repetindo;
- o trabalho chegou a um ponto natural de validação.

Não existe uma porcentagem universal que indique o momento exato. Use os sinais de clareza e continuidade.

Por que isso pesa no seu limite: a cada mensagem o Codex reenvia o histórico da conversa. Uma conversa que atravessa várias etapas fica enorme e consome o limite semanal do plano muito mais rápido (no teste de 08/10/2026, uma conversa única de um dia inteiro passou de 150 milhões de tokens). A OpenAI orienta "um chat por unidade de trabalho" e lista usar um chat para o projeto inteiro como erro comum (learn.chatgpt.com/guides/best-practices, lida em 09/10/2026).

## Antes de encerrar

Salve o que já é entregável (`salvar.py` com os caminhos do trabalho, veja `fluxo-operacional.md`). Atualize `operacao/STATUS-ATUAL.md`, registre mudanças em `operacao/CHANGELOG.md`, guarde decisões em `operacao/DECISOES.md` e prepare `operacao/PROXIMA-SESSAO.md` quando houver continuação.

A próxima conversa deve receber um objetivo claro e consultar o Mapa. Não copie toda a conversa anterior para o novo chat. Registre nos arquivos somente o que precisa persistir.

## Compactar em marco

Chegou a um marco (entregável pronto, decisão tomada) e a conversa continua sobre o mesmo trabalho? Compacte
a conversa nesse ponto, para a IA carregar o resumo em vez do histórico inteiro. Mudou de assunto? Abra conversa nova.

## Retrospectiva e vigília: só quando você pede

A retrospectiva (`$polozi-retrospectiva`) e a vigília (`tecnologia-vigiar`) rodam quando você pede, na conversa.
O kit não agenda nenhuma das duas. Quer agendar mesmo assim? Peça: no app desktop, modo de execução **Local**
(a outra opção cria uma cópia separada da pasta, e o que ela escrever lá não aparece na sua Casa), com o app
aberto e o computador ligado na hora marcada [24a:cli_automacoes/f9, n23 (d), n23 (e)]. Depois que a rotina
rodar, a conversa seguinte acha um arquivo novo ainda não salvo; é normal, e a `tecnologia-publicar` salva.
