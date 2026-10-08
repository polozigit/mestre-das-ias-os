# Envio para teste no Windows

## O que enviar

Caso normal: envie o kit `polozi-fundacao.zip` atualizado. A Casa criada por ele já traz este pacote em `sistemas/whatsapp/` (código do motor local, lockfile do npm, testes e o guia para Codex ou Claude Code). Não precisa de Docker: só Node.js 20+. Serve inclusive para Windows Home com 4 GB de RAM, que é exatamente o caso que mais vale testar.

Alternativa para quem já tem uma Casa antiga (sem `sistemas/whatsapp/`): envie somente `whatsapp-local.zip`, que a pessoa anexa no chat.

O pacote não deve conter `node_modules`, QR, sessão do WhatsApp, chave local, token, arquivo `.env` ou dados do seu computador. O colega instalará as dependências localmente com `npm ci` (cerca de 60 MB); a sessão e a chave dele serão criadas fora do repositório, no próprio Windows.

## Onde a pessoa coloca

O teste roda dentro de uma Casa, o mesmo tipo de projeto de empresa criado pelo Kit `polozi-fundacao` que o aluno final vai usar. Com o kit novo a pasta `sistemas\whatsapp\` já existe. Exemplo:

~~~text
C:\Users\colega\empresa-teste\
├── AGENTS.md
├── MAPA-DA-EMPRESA-IA.md
├── credenciais\CONEXOES.md
├── operacao\CHANGELOG.md
└── sistemas\whatsapp\
    ├── GUIA-AGENTE-CODEX-CLAUDE.md
    ├── package.json
    └── src\
~~~

Ela não cria um projeto separado nem mistura o laboratório com nenhum produto dela fora dessa Casa de teste. O laboratório funciona a partir de `sistemas/whatsapp/`.

## O que ela faz

1. Abre a Casa de teste (a pasta do projeto acima) no Codex Desktop ou no Claude Code local.
2. Escreve no chat: **"Conecta meu WhatsApp."** A IA da Casa lê o `AGENTS.md`, que manda seguir `sistemas/whatsapp/GUIA-AGENTE-CODEX-CLAUDE.md`.
3. Aprova apenas: instalação do Node.js (se faltar), leitura do QR pelo seu WhatsApp e primeiro envio para o próprio número.

Casa antiga (sem `sistemas/whatsapp/package.json`): ela anexa `whatsapp-local.zip` no chat e cola a instrução da seção "Alternativa" de `INSTRUCAO-UNICA-PARA-O-ALUNO.md`; o agente extrai para `sistemas/whatsapp/` sozinho (Passo 1 do guia). Se o cliente usado não aceitar anexo, extraia manualmente para essa mesma pasta antes; nunca em Downloads nem como projeto à parte.

## O que deve voltar para você

Peça somente este registro, sem capturas de QR ou segredos:

~~~text
Windows e versão (Home, Pro):
RAM total do computador:
Node detectado:
QR exibido: sim ou não
WhatsApp conectado: sim ou não
Mensagem de teste recebida: sim ou não
Início automático (npm run autostart:ligar) subiu o WhatsApp e o assistente depois de reiniciar o Windows: sim ou não
Cliente testado: Codex ou Claude Code
Computador ficou lento durante o uso: sim ou não
Erro exato, se houver:
~~~

## Depois do teste

O colega pode parar o motor com `npm run stop`. Isso preserva a sessão local dele. Para uma limpeza posterior, a sessão fica fora do repositório em `%APPDATA%\Polozi\whatsapp-local`; não apagar esse diretório durante o primeiro teste.
