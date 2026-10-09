# Time Marketing

Time de agentes que monta, a partir do dossiê da empresa do aluno, o cliente ideal e a persona, a identidade da marca completa e o tom de voz, e trata o logo que o dono entregou. Os documentos ficam em `empresa/publico/` e `empresa/marca/` e, com o "sim" do dono, vão para o banco e aparecem em Marca no sistema.

## Skills e subagente

| Nome | O que faz |
|---|---|
| `marketing-persona` | Ponto de entrada. Lê o dossiê gravado e monta o cliente ideal e a persona SEM pedir persona pronta: cada linha cita a pergunta do dossiê de onde veio, o que falta vira pergunta ao dono (no máximo 3) e nada é inventado. A persona nasce como proto-persona, a validar com clientes reais. Grava `empresa/publico/persona.md`; com o "sim" do dono, aprova no Mapa e publica. |
| `marketing-identidade` | Faz uma pergunta só (site, Instagram, apresentação, logo; tudo opcional), audita o que o dono já tem e monta `empresa/marca/identidade-visual.md` (plataforma, personalidade e arquétipo, logo, cores, tipografia, imagem, aplicações, regras de ouro, fontes) e `empresa/marca/tom-de-voz.md` (como a marca fala), cada um com o bloco `marca-dados` que a tela Marca mostra por divisão. Gera `empresa/marca/tokens.json` (DTCG) para a etapa de aplicar a marca no sistema. O que o dono já tem manda; onde ele não tem nada, o time propõe duas opções e ele escolhe. O contraste das cores é calculado, não visto a olho. |
| `marketing-logo` | Trata o logo que o dono entregou: PNG com fundo transparente, ícone quadrado, variantes clara e escura (só se ele pedir) e, se quiser, um SVG que apenas embute o PNG (não é vetor). Nunca cria nem redesenha logo. |
| `marketing-revisor` (subagente) | Confere cada documento contra o dossiê antes de o dono ver, só lendo, sem ter escrito: responde `APPROVED` ou `BLOCKED` com achados `arquivo:linha`. Persona sem origem em cada linha, cliente inventado, proto-persona vendida como confirmada, par de cores que não se lê e logo gerado por IA bloqueiam. |

## Como o fluxo anda

1. O dossiê (`polozi-registrar-dossie`) vem primeiro.
2. `marketing-persona` monta a persona; o dono responde sim; ela é aprovada e publicada.
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
- `agentes/`: instruções do subagente.
- `tests/`: testes do time.
- `DESENHO.md`: as regras de negócio e as fontes (mudança de regra muda lá primeiro).

Scripts (Python 3.10 ou mais novo, sem dependência além do Pillow opcional; saída 0 ok, 1 recusa ou achado, 2 uso errado ou falta de credencial ou de Pillow, 3 segredo no texto, 4 erro de banco ou de rede, 5 sem o "sim" do dono):

| Script | Faz |
|---|---|
| `marketing-persona/scripts/dossie_para_persona.py` | Lê o dossiê e devolve JSON por bloco (empresa, público, dor, oferta, concorrência, tom) com as lacunas; com `conferir`, confere um documento contra o dossiê (marca de origem em cada linha, pergunta que existe e foi respondida, frase entre aspas que está de verdade no dossiê, nenhum `<...>` do modelo que ficou sem preencher). |
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
python3 ../native-ai/.agents/skills/native-ai-construir/scripts/gerar_saidas.py --raiz .
```

Fonte aninhada: só gera `.codex/agents` e `trechos/`.
