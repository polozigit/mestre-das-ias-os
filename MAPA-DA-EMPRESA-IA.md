# Mapa da Empresa IA - {{NOME_EMPRESA}}

Índice vivo: as habilidades pedem pelo PAPEL, nunca por caminho inventado.
Abra o ARQUIVO apontado, nunca a área inteira. Arquivo movido = corrigir aqui
(fonte: `operacao/mapa.json`; a tabela é gerada, não edite à mão).

## Estados

`ausente` não existe · `coletando` sendo obtido · `fonte` material original ·
`rascunho` hipótese · `em-revisao` aguarda confirmação · `aprovado` referência
oficial · `externo` vive em serviço conectado · `desatualizado` precisa revisão.

## Papéis empresariais

| Papel | Caminho | O que tem | Estado | Quem cria |
|---|---|---|---|---|
| contexto.dossie | `contexto/dossie/dossie-completo.md` | transcrição íntegra das 71 perguntas | ausente | polozi-registrar-dossie |
| marca.identidade-visual | `empresa/marca/identidade-visual.md` | cores, tipografia, uso do logo | ausente | identidade visual (marketing) |
| marca.tom-de-voz | `empresa/marca/tom-de-voz.md` | como a marca fala; palavras banidas | ausente | identidade visual (marketing) |
| publico.persona | `empresa/publico/persona.md` | cliente ideal | ausente | persona (marketing) |
| oferta.catalogo | `empresa/oferta/catalogo.md` | o que vendemos | ausente | aprovação humana |
| oferta.preco | `empresa/oferta/tabela-preco.md` | preço vigente — ÚNICA fonte | ausente | aprovação humana |
| comercial.processo-vendas | `empresa/comercial/processo-de-vendas.md` | como vendemos | ausente | time de vendas |
| operacao-empresa.processos | `empresa/processos/processos.md` | processos da operação | ausente | time de gestão |
| pessoas.estrutura | `empresa/pessoas/estrutura.md` | organograma humano | ausente | aprovação humana |

## Papéis operacionais

| Papel | Caminho | Autoridade |
|---|---|---|
| operacao.status | `operacao/STATUS-ATUAL.md` | concluir/transferir-trabalho |
| operacao.pendencias | `operacao/PENDENCIAS.md` | qualquer sessão |
| operacao.decisoes | `operacao/DECISOES.md` | decisão do dono |
| operacao.changelog | `operacao/CHANGELOG.md` | concluir-trabalho |
| operacao.proxima-sessao | `operacao/PROXIMA-SESSAO.md` | transferir-trabalho |
| operacao.instalacao | `operacao/INSTALACAO.md` | polozi-instalador |
| capacidades.plugins | `capacidades/PLUGINS.md` | catálogo |
| capacidades.automacoes | `capacidades/AUTOMACOES.md` | catálogo |
| credenciais.conexoes | `credenciais/CONEXOES.md` | polozi-registrar-conexao — nunca valores |
| operacao.vigilancia | `operacao/vigilancia/` | tecnologia-vigiar: uma linha por rodada diária; o dump fica fora do Git |

## Fora do repositório

| O quê | Onde vive |
|---|---|
| plugins e habilidades do curso | conta (Plugins → Pessoais) — catálogo em capacidades/PLUGINS.md |
| chaves e senhas | `credenciais/.env` (chaves, fora do GitHub) · gerenciador do Chrome (senhas) |
| tasks (com banco criado) | banco da empresa — tela Tarefas do sistema |
| sistema publicado | endereço registrado em `sistemas/<nome>/` |
