# Disparo em massa pelo WhatsApp local: o que a IA explica antes de montar

Este guia é para a IA que conduz o aluno (Codex ou Claude Code). Quando o aluno pedir disparo em massa, envio para uma lista de contatos ou "mandar para todo mundo", **leia este arquivo e explique os pontos abaixo em linguagem simples antes de montar qualquer rotina**. O pacote não impõe limite de destino nem de volume: a decisão é do aluno, e a conta é dele. Por isso a explicação vem antes.

## O que o aluno precisa saber

1. **Este não é o WhatsApp oficial para empresas.** O motor usa o WhatsApp comum do aluno, ligado ao computador como um "aparelho conectado". O WhatsApp pode entender envio em massa como abuso e **banir o número**, às vezes sem aviso. Se o número for o que o aluno usa com clientes e família, perder esse número dói.
2. **O WhatsApp não publica um limite de mensagens para o aplicativo comum.** Não existe "número seguro" garantido. Qualquer volume citado abaixo é referência de mercado, não regra do WhatsApp e não garantia de que o número não será bloqueado.
3. **O risco depende de como as pessoas reagem.** Muitos bloqueios e denúncias são o que mais derruba um número.

## Boas práticas para reduzir o risco

Nenhuma delas elimina o risco. Juntas, ajudam.

- **Mande só para quem conhece o número e pediu para receber:** clientes, alunos, contatos que salvaram o número do aluno ou que escreveram primeiro. Lista comprada ou contato frio é o caminho mais curto para denúncia (e pode ferir a LGPD).
- **Varie o texto.** Mensagem idêntica para centenas de pessoas é o padrão que o WhatsApp mais associa a spam. Use o nome da pessoa e trechos diferentes, e peça para a IA gerar variações do mesmo recado.
- **Espalhe o envio com intervalo aleatório** entre uma mensagem e outra (de alguns segundos a alguns minutos, sempre variando), nunca em rajada. Rotina que manda tudo de uma vez chama atenção.
- **Comece pouco e aumente aos poucos.** Referência de mercado, sem garantia: quem usa número comum costuma começar com poucas dezenas de mensagens por dia e subir ao longo de semanas, vendo a reação. Número novo ou sem histórico de conversa é mais sensível.
- **Evite link encurtado e anexo em massa.** Link encurtado esconde o destino e parece golpe. Imagem, vídeo e PDF repetidos para muita gente pesam mais no filtro.
- **Ofereça uma saída clara**, como "responda SAIR para não receber mais", e respeite na hora: quem pediu para sair sai da lista.
- **Pare se muita gente bloquear, denunciar ou reclamar.** Esse é o sinal de que a lista ou o texto está errado. Continuar piora.
- **Mensagem útil e esperada vale mais do que técnica.** Aviso de pedido, lembrete de horário e resposta a quem perguntou chamam menos atenção do que promoção para quem não pediu.

## Para campanha de verdade

Se o objetivo é falar com muita gente de forma recorrente (campanha, lançamento, base grande), este motor não é a ferramenta certa. Recomende ao aluno:

1. **Estudar o tema com a IA antes** de montar qualquer coisa: pedir para ela explicar as regras atuais do WhatsApp, o que é opt-in e como medir a reação da lista.
2. **Considerar a API oficial do WhatsApp Business** (paga por mensagem): é feita para esse uso, tem modelos de mensagem aprovados e não arrisca o número pessoal do aluno. Confira os preços e as regras atuais na documentação oficial da Meta, porque mudam.

## Como a IA monta, se o aluno decidir seguir

- Confirme com o aluno a origem da lista, que as pessoas pediram para receber e o texto (e as variações).
- Use `npm run enviar -- <numero> --texto "..."` (ou `--arquivo texto.txt`) dentro da rotina, **um contato por vez**, com pausa aleatória entre eles. O comando devolve `WHATSAPP_SEND_ACCEPTED=<id>` ou um erro; se o erro disser que o WhatsApp está desconectado, pare a rotina e siga a seção "Reconectar" do `GUIA-AGENTE-CODEX-CLAUDE.md`.
- Comece com um lote pequeno, mostre o resultado ao aluno e só então aumente.
- Registre na rotina quem pediu para sair, para nunca mais enviar para essa pessoa.
