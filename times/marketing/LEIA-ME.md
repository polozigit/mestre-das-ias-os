# Time Marketing

Time de agentes que monta, a partir do dossiê da empresa do aluno e da pesquisa pública na internet, o cliente ideal e a persona, a identidade da marca completa e o tom de voz, e trata o logo que o dono entregou. Os documentos ficam em `empresa/publico/` e `empresa/marca/` e, com o "sim" do dono, vão para o banco e aparecem em Marca no sistema.

## Skills e subagentes

| Nome | O que faz |
|---|---|
| `marketing-persona` | Ponto de entrada. Trabalha como um especialista contratado, em 10 etapas com roteiro pronto (`referencias/etapas/`, um por etapa, com molde, regras de decisão e exemplo) e conferência por script (`estudo.py`) antes da etapa seguinte: escopo, hipótese do dono, pesquisa de mercado (pesquisador UMA vez, três frentes, até 10 páginas), análise em 7 moldes e descobertas (o que o dono não sabia), as duas no `marketing-analista`, entrevista de confronto (até 5 perguntas), montagem da persona, plano de mensagem, revisão e apresentação. SEM pedir persona pronta nem planilha de clientes. Cada linha cita de onde veio (dossiê, relato do dono, pesquisa com link, ou análise apoiada nelas); nada é inventado. A persona é proto-persona: nenhum cliente foi ouvido. Grava `empresa/publico/estudo/` e `empresa/publico/persona.md`; com o "sim" do dono, aprova no Mapa e publica. Sem busca o fluxo segue e diz o que faltou. |
| `marketing-identidade` | Faz uma pergunta só (site, Instagram, apresentação, logo; tudo opcional), audita o que o dono já tem e monta `empresa/marca/identidade-visual.md` (plataforma, personalidade e arquétipo, logo, cores, tipografia, imagem, aplicações, regras de ouro, fontes) e `empresa/marca/tom-de-voz.md` (como a marca fala), cada um com o bloco `marca-dados` que a tela Marca mostra por divisão. Gera `empresa/marca/tokens.json` (DTCG) para a etapa de aplicar a marca no sistema. O que o dono já tem manda; onde ele não tem nada, o time propõe duas opções e ele escolhe. O contraste das cores é calculado, não visto a olho. |
| `marketing-logo` | Trata o logo que o dono entregou: PNG com fundo transparente, ícone quadrado, variantes clara e escura (só se ele pedir) e, se quiser, um SVG que apenas embute o PNG (não é vetor). Nunca cria nem redesenha logo. |
| `marketing-pesquisador` (subagente) | Pesquisa até 10 páginas públicas sobre o tipo de cliente em três frentes (alternativas e o que cada concorrente promete; voz do cliente; dúvidas e reclamações), em avaliações, sites de reclamação, páginas e anúncios de concorrentes e perguntas em fóruns e redes (nunca perfil de pessoa), e devolve até 50 trechos (até 5 por página), cada um com link `https://` da página aberta, data, trecho copiado, frente e tema. Só lê e busca; sem busca devolve vazio. |
| `marketing-analista` (subagente) | Faz as etapas 3 e 4 do estudo da persona numa chamada só: lê o dossiê inteiro, o escopo, a hipótese do dono e a pesquisa, procura a tensão que o dono nunca juntou (o que ele quer e como opera, o que tem e não usa, o que atribui ao cliente e pode ser dele, o que a venda de hoje seleciona) e devolve um JSON com a análise e as descobertas prontas para a skill gravar e conferir. Só lê e sem internet. É o único agente do time no modelo forte (`gpt-6.2-astra` com esforço alto no Codex, `opus` alto no Claude), por decisão de 19/11/2026: com o modelo comum seguindo o roteiro, três ensaios deram nota 5 de 10 em ensinar ao dono algo que ele não sabia, e o estudo escrito com o modelo forte foi aprovado. Sem ele, a skill faz as duas etapas pelos moldes e avisa o dono. |
| `marketing-revisor` (subagente) | Confere cada documento contra o dossiê (e, na persona, contra as fichas da pesquisa) antes de o dono ver, só lendo e sem internet, sem ter escrito: responde `APPROVED` ou `BLOCKED` com achados `arquivo:linha`. Persona sem origem em cada linha, cliente inventado, proto-persona vendida como confirmada, par de cores que não se lê e logo gerado por IA bloqueiam. |

## Como o fluxo anda

1. O dossiê (`polozi-registrar-dossie`) vem primeiro.
2. `marketing-persona` estuda o dossiê, pesquisa na internet, passa a análise e as descobertas ao `marketing-analista`, pergunta ao dono o que faltou (até 5 perguntas), monta a persona e o plano de mensagem e apresenta; o dono responde sim; ela é aprovada e publicada. Se a sessão cair, `estudo.py estado` diz em que etapa retomar.
3. `marketing-identidade` audita o site, o Instagram, a apresentação e o logo do dono e monta a identidade e o tom de voz em cima da persona e do que ele já tem.
4. `marketing-logo`, se o dono tem um logo.
5. Cada documento só vira "verdade da empresa" (estado `aprovado` no Mapa) com o "sim" do dono, gravado no próprio arquivo e preso ao texto que ele viu: mudou o texto depois do sim, o publicador recusa.
6. Banco ainda não ligado? Os documentos ficam aprovados no projeto e a publicação espera (basta pedir "publica a persona" depois).

## Dependência opcional: Pillow

Só o tratamento do logo usa o Pillow (biblioteca de imagem do Python). As outras skills não precisam dele. Sem o Pillow, `logo.py` não faz nada e imprime o comando de instalação:

```
python3 -m pip install --user Pillow
```

(no Mac com Homebrew pode pedir `--break-system-packages`; no Windows costuma ser `py -3 -m pip install --user Pillow`). Instalar muda o computador do dono, então a skill pede o "sim" dele antes. Os testes de imagem pulam sozinhos quando o Pillow não está instalado.

## Onde moram

- `time.json`: lista de agentes e skills (fonte do time).
- `.agents/skills/<nome>/`: cada skill, com `SKILL.md`, `scripts/` e `referencias/` (os modelos dos documentos).
- `agentes/`: instruções dos 3 subagentes (pesquisador e revisor no modelo barato, analista no forte).
- `tests/`: testes do time.
- `DESENHO.md`: as regras de negócio e as fontes (mudança de regra muda lá primeiro).

Scripts (Python 3.10 ou mais novo, sem dependência além do Pillow opcional; saída 0 ok, 1 recusa ou achado, 2 uso errado ou falta de credencial ou de Pillow, 3 segredo no texto, 4 erro de banco ou de rede, 5 sem o "sim" do dono):

| Script | Faz |
|---|---|
| `marketing-persona/scripts/dossie_para_persona.py` | Lê o dossiê e devolve JSON por bloco (empresa, público, dor, oferta, concorrência, tom) com as lacunas e, em `dimensoes`, de que perguntas sai cada dimensão da persona, o texto de cada pergunta com a resposta e se há resposta (`--so-dimensoes` traz só essa lista, para a etapa 1); com `conferir`, confere um documento contra o dossiê (marca de origem em cada linha, pergunta que existe e foi respondida, fonte `[n]` da pesquisa com link e data, cada referência dentro de `(análise: ...)`, data dos dados de clientes em persona antiga, frase entre aspas que está de verdade no dossiê ou no Anexo, nenhum `<...>` do modelo que ficou sem preencher e, na persona, todas as dimensões do modelo na seção 2, a oferta em foco, as Descobertas e o Plano de mensagem). |
| `marketing-persona/scripts/estudo.py` | `conferir --etapa N` confere cada uma das 10 etapas do estudo da persona (arquivos em `empresa/publico/estudo/`, depois a persona e o sim) e lista o que corrigir; `estado` diz em que etapa retomar. |
| `marketing-persona/scripts/clientes_para_persona.py` | Planilha de clientes em CSV (modelo em `referencias/planilha-clientes-modelo.csv`) vira resumo agregado em JSON, sem dado pessoal: `modelo` grava o cabeçalho padrão, `resumir` conta, agrupa e mostra os compradores recentes. Recusa coluna de nome, e-mail, telefone, CPF e similares e troca esses dados em texto livre por `[removido]`. A planilha fica fora da pasta do projeto. Sem uso desde 18/11/2026: a `marketing-persona` não pede mais planilha (remoção é tarefa seguinte). |
| `marketing-persona/scripts/aprovacao.py` | Grava e confere o "sim" do dono, preso ao texto. |
| `marketing-persona/scripts/mapa_estado.py` | Muda o estado de um dos 3 papéis no Mapa (rascunho, em revisão, aprovado). `aprovado` só com o "sim" gravado. |
| `marketing-persona/scripts/publicar_documento.py` | O único publicador: grava o documento aprovado (persona, marca ou o dossiê que o `polozi-registrar-dossie` manda; e a imagem do logo, no armazenamento privado) no banco da empresa, ou confere se o banco está em dia. Recusa antes de enviar: segredo no texto, texto de modelo sem preencher, "sim" que não vale mais. |
| `marketing-identidade/scripts/paleta.py` | Ficha das cores e tabela de contraste (WCAG 2.2, nível AA). |
| `marketing-identidade/scripts/material.py` | `site` lê um site público (1 página e até 8 CSS do mesmo endereço, sem cookie nem login) e `pptx` lê uma apresentação (tema, fontes, textos, mídias): devolve cores, fontes e textos como dado. Saída 1 = rede falhou ou site bloqueado (abrir no navegador da sessão). |
| `marketing-identidade/scripts/marca_dados.py` | `validar` e `conferir` o bloco `marca-dados` e as marcas de origem (`[n]` em Fontes, aspas, `<...>`), `tokens` grava `empresa/marca/tokens.json` (com `--check`) e `extrair` imprime o bloco. |
| `marketing-logo/scripts/logo.py` | Analisa, tira o fundo, faz o ícone, as variantes e o SVG contêiner. |

## Testes

```
cd 10-mestre-das-ias/chatgpt-work-codex/times/marketing
python3 -m unittest discover -s tests -v
```

Além de cada script isolado, `tests/test_fluxo_completo.py` percorre a persona, a identidade e o logo na ordem em que as skills mandam (scripts chamados da raiz do projeto, sem `--casa`), publicando num servidor HTTP local, e `tests/test_publicar_http_real.py` confere o que o `urllib` de verdade manda.

Prova por mutação das guardas (da raiz do repositório; muda os arquivos no lugar e restaura, então não commite enquanto roda; precisa do Pillow):

```
python3 scripts/qa/mutacao.py --lote 10-mestre-das-ias/chatgpt-work-codex/times/marketing/tests/lote_mutacao_marketing.json
```

## Gerar as saídas

```
python3 ../../scripts/gerador_times/gerar_saidas.py --raiz .
```

Fonte aninhada: só gera `.codex/agents` e `trechos/`.
