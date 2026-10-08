# Sistemas — aprofundamento

Este arquivo só entra na cadeia quando a sessão abre DENTRO de `sistemas/`.
Ele APROFUNDA o AGENTS.md da raiz, nunca contradiz — os invariantes de
segurança já estão na raiz em 1 linha cada; aqui vai o detalhe operacional.

## Antes de mexer

Leia a spec do sistema em `sistemas/<nome>/` antes de tocar código. Mudou
comportamento? Atualize a spec ANTES de dizer que terminou — spec
desatualizada é a mesma coisa que código sem documentação.

- Faça só o pedido: nada de recurso, opção ou abstração que ninguém pediu.
- Mexa só nas linhas que o pedido exige; siga o estilo do código que já existe.
- Antes de codar, diga como vai provar que funcionou (teste, ou o que o dono vê na tela); "pronto" só depois da prova.
- Achou código morto ou problema fora do pedido? Avise, não conserte junto.

## WhatsApp (já vem na Casa)

`sistemas/whatsapp/` veio pronto com a Casa. "Conecta meu WhatsApp" ou "reconecta meu WhatsApp": em `whatsapp/` rode `npm run conectar` (reconecta: `-- --reconectar`) e repasse só o resultado; se falhar, veja a seção do erro em `whatsapp/GUIA-AGENTE-CODEX-CLAUDE.md`. "Disparo em massa": leia `whatsapp/DISPARO-EM-MASSA.md` antes.

## Banco

Toda tabela nova nasce com RLS. Migration é sempre versionada e validada
pelo time de sistema. Nunca alterar schema por painel — o schema só muda
por migration, nunca clicando numa tela de administração.

## Do commit à produção

Fluxo fixo: commit → preview → `polozi-sistema-qa` testa no navegador com o
token de preview (páginas + console + página vazia por permissão) →
APPROVED → produção. Sem esse APPROVED, nada sobe.

## Chaves

No navegador do cliente, só chave pública, e só com RLS ligado no banco. A
chave de servidor nunca chega ao front — se aparecer numa tela do
navegador, é um bug de segurança, não um detalhe de implementação.

## Code Review Rules

A única prática de revisão de código recomendada oficialmente
(learn.chatgpt.com/docs/third-party/github). Regras concisas, cada uma com
o comportamento a sinalizar:

- Toda tabela nova tem RLS.
- Toda mudança de schema é uma migration versionada, nunca alteração direta por painel.
- Nenhuma chave de servidor aparece no diff.

Isto AJUDA a revisão — não substitui teste, proteção de branch nem
aprovação; quem aprova produção continua sendo o `polozi-sistema-qa`.
