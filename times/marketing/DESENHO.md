# Time Marketing: desenho

Fonte de verdade do time Marketing do kit do aluno. Quem constrói segue este arquivo; mudança de regra muda aqui primeiro.

## 1. Pra quem e pra quê

Dono de empresa de 20 a 100 pessoas, não técnico, usando Codex ou Claude Code. O time transforma o que ele já disse no dossiê em persona, identidade visual, tom de voz e logo tratado, guarda os arquivos no projeto e, com o "sim" dele, publica no banco para a tela Marca mostrar. Fala em português simples ("cliente ideal", "as cores da marca", "como a gente fala"), nunca em sigla de pesquisa ou de design.

## 2. O que foi pedido e onde está

| Pedido | Peça |
|---|---|
| A IA monta a persona a partir do dossiê, sem pedir persona pronta; logo, site e redes são opcionais | `marketing-persona` + `dossie_para_persona.py` |
| Identidade visual: paleta, tipografia, tom de voz e manual curto | `marketing-identidade` + `paleta.py`. O manual curto são dois documentos: `identidade-visual.md` e `tom-de-voz.md` |
| Logo: tirar o fundo, SVG quando der, variantes clara e escura, ícone; nunca inventar logo | `marketing-logo` + `logo.py` |
| Arquivos no repositório (`empresa/marca/`, `empresa/publico/`) e no banco (tabela `documentos_publicados`, bucket privado `publicados`) | `aprovacao.py`, `mapa_estado.py` e `publicar_documento.py` |
| A etapa 6 do instalador chama o time | texto em `trechos/PROPOSTAS-CENTRAL.md`, item 2 |

## 3. Fontes

- **Pacote do cargo Analista de pesquisa de mercado (id 59), playbooks de ICP e persona.** Persona sem cliente real é opinião com rosto: sem entrevista ela é proto-persona; todo atributo leva rótulo de origem; campo sem fonte vira hipótese; anti-persona só com dado; sintético nunca entra como achado. Virou: marcas de origem por linha, estado proto-persona, anexo com o relato literal do dono, conferência mecânica e o item M1 a M4 do revisor.
- **Pacote do cargo Gerente de marca (id 50), playbooks de voz e tom e de manual da marca.** Quatro escalas, poucas palavras de tom, traços "somos X, não Y", faça e não faça, exemplos certo e errado, teste com leitores reais, um manual só como fonte única, e as regras de IA (rascunho sim, decisão não; marca não nasce de sintético; ativo de IA pode não ter dono). Virou: `tom-de-voz.md`, `identidade-visual.md` e o item M6.
- **Pacote do cargo Designer gráfico e de marca (id 51), playbooks de cor, tipografia e logo.** Contraste calculado, não visto a olho (WCAG 2.2 AA, 4,5 para texto, 3 para texto grande e componentes); fonte sem licença conferida não entra; logo nunca sai só de geração por IA; versão em uma cor; original preservado. Virou: `paleta.py`, `logo.py` e os itens M5 e M7.
- **Regra de tradução do cargo para workflow, agente, skill ou humano (F3).** Pergunta 0: aprovar é humano, o dono dá o "sim" antes de publicar. Escada: script, depois skill, depois agente, depois humano; o que tem que acontecer sempre é passo de script, não instrução.
- **Skills `polozi-persona-cliente-ideal` e `polozi-identidade-visual` do curso anterior.** Aproveitado: a regra de nunca inventar elemento que a fonte não mostra, prévia inteira antes de gravar e a estrutura de brand book em seções. Não aproveitado: o PDF do manual (depende de reportlab e não foi pedido), os mockups por gerador de imagem, e os nomes antigos de papel (hoje os papéis do Mapa são `publico.persona`, `marca.identidade-visual` e `marca.tom-de-voz`).
- **Contrato de escrita da IA no banco (spec do banco do sistema):** operações `documento-publicar` e `documento-conferir`, upsert por `caminho_origem`, hash para a chave `publicacao_atrasada`, bucket privado `publicados` criado pelo script se faltar.
- **Documentação lida na fonte:** WCAG 2.2 (definição de luminância relativa e de razão de contraste, W3C); PostgREST (upsert com `on_conflict` e `Prefer: resolution=merge-duplicates`); Storage do Supabase (criar bucket, enviar objeto com `x-upsert`); chaves do Supabase (a chave nova `sb_secret_` vai só no cabeçalho `apikey`).

## 4. Peças (regra F3: script > skill > agente > humano)

| Peça | Tipo | Faz |
|---|---|---|
| `aprovacao.py` | script | Grava e confere o "sim" do dono preso ao texto (selo de 12 caracteres do texto sem a linha de aprovação). |
| `mapa_estado.py` | script | Muda o estado de um dos 3 papéis no Mapa; `aprovado` só com o "sim" gravado. |
| `publicar_documento.py` | script | Único publicador: upsert por `caminho_origem`, imagem no bucket privado, `--conferir`. |
| `dossie_para_persona.py` | script | Respostas do dossiê por bloco, lacunas, e conferência de um documento contra o dossiê (inclui `<...>` de modelo que sobrou). |
| `paleta.py` | script | Ficha de cores e razão de contraste de todos os pares. |
| `logo.py` | script | Analisa, tira o fundo, faz ícone, variante e SVG contêiner (Pillow opcional). |
| `marketing-persona` | skill (entrada) | Monta cliente ideal e persona, pergunta no máximo 3 coisas, grava, pede o sim, publica. |
| `marketing-identidade` | skill | Monta identidade visual e tom de voz com o que o dono já tem; propõe onde não tem. |
| `marketing-logo` | skill | Trata o logo do dono. |
| `marketing-revisor` | subagente só leitura | Julga se a origem sustenta cada linha, se nada foi inventado, se o contraste e o logo estão certos. Isso é julgamento sobre texto: não dá por script. `gpt-6.1-sol` high no Codex, `opus` high no Claude, diferente do modelo da sessão do projeto. |
| O dono | humano | Diz o "sim", responde as perguntas, escolhe a paleta quando é proposta, conversa com clientes reais, entrega o logo. |

Invocação implícita: as skills ficam com o padrão do Codex (sem `agents/openai.yaml` desligando a invocação implícita), de propósito. O dono não digita `$marketing-persona`; ele fala "monta minha persona". O risco de escrita fica coberto por três travas: nada vai para o banco sem o "sim" gravado e preso ao texto, os scripts recusam o que a regra não deixa, e o revisor bloqueia antes de o dono ver.

## 5. Regras de negócio

| Regra | Onde mora |
|---|---|
| Persona nasce proto-persona (hipótese do relato do dono). Só vira "validada" com 3 conversas ou mais com clientes reais, com data | `dossie_para_persona.py conferir --estrito` (`MIN_CONVERSAS`) |
| Toda linha de fato tem marca de origem: `(dossiê X.Y)`, `(relato do dono, data)`, `(material do dono: ...)`, `(hipótese)`, `(não consta no dossiê)` ou `(proposta do time)`. Só `respondida` sustenta; `ausente`, `não sei` e `duplicada` não | script (existência e estado) e revisor (a resposta sustenta a linha?) |
| Frase entre aspas só literal do dossiê ou do anexo; relato do dono tem data e fica no anexo | script e revisor M3 |
| No máximo 3 perguntas ao dono, uma por vez, abertas e sem sugerir a resposta (fato sobre o cliente é do dono) | `marketing-persona` |
| O "sim" do dono precisa da palavra inteira "sim" ("ok" e "pode" não valem), vale para ESTE texto e deixa de valer se o texto mudar | `aprovacao.py`, conferido por `mapa_estado.py` e `publicar_documento.py` |
| Estado no Mapa: `rascunho` ao escrever, `em-revisao` enquanto o dono decide, `aprovado` só depois do "sim". O logo não é papel do Mapa: tem o próprio documento aprovado | `mapa_estado.py` |
| Publicar: tipo `persona` só de `empresa/publico/`, tipo `marca` só de `empresa/marca/`, tipo `dossie` só do `contexto/dossie/dossie-completo.md` (chamado pelo `polozi-registrar-dossie`; o sim vale só para publicar e o dossiê segue `fonte`), só `.md`, sem padrão de segredo, sem `<...>` de modelo sobrando, só com "sim" válido, `hash` = sha256 do arquivo, `publicado_em` novo a cada publicação, só https, chave só no cabeçalho | `publicar_documento.py` |
| Imagem: só tipo marca, png, jpg, webp ou svg sem script, cabeçalho do arquivo conferido, bucket privado | `publicar_documento.py` |
| Banco ainda não ligado: o documento fica aprovado no projeto e a publicação espera (saída 2 com `FALTA`). Cobre o dono que pulou a ordem da aula (banco e sistema no ar antes da marca) | `publicar_documento.py` e skills |
| Contraste: texto normal 4,5 : 1, texto grande e componente 3 : 1, razão cortada (não arredondada) em 2 casas; todo par usado como texto é declarado e conferido | `paleta.py` e revisor M5 |
| Tipografia: no máximo 2 famílias mais uma reserva do sistema; fonte sem licença conferida não entra | `marketing-identidade` e revisor M5 |
| Voz: 4 escalas, até 5 palavras de tom, "somos X, não Y", faça e não faça, exemplos em 2 canais, respeita 5.1 e 5.2 do dossiê; teste com leitores reais pendente com data (leitor sintético não conta) | `marketing-identidade` e revisor M6 |
| Logo: parte do arquivo do dono, que fica intacto em `contexto/fontes-originais/`; fundo só sai se for uma cor só (senão recusa); borda suavizada; ícone com `--recorte` quando há símbolo; variante clara ou escura só a pedido; SVG sempre dito "não é vetor"; criar logo não é deste time | `logo.py`, `marketing-logo`, revisor M7 |
| Sem Pillow: imprime o comando exato de instalação e para, sem inventar | `logo.py` |

## 6. O que fica humano

Aprovar cada documento; responder as perguntas; conversar com 3 ou mais clientes reais para validar a persona; escolher a paleta quando ela é proposta do time; entregar o logo (ou contratar quem desenhe); ler a licença de fonte comercial; busca de anterioridade, registro de marca e cessão de direitos; autorizar a instalação do Pillow; ligar o banco (time Tecnologia); publicar fora do sistema (site, redes).

## 7. Limites conhecidos

- Nada foi rodado contra banco real. A API foi lida na fonte e o publicador foi provado com HTTP falso e contra um servidor HTTP de verdade em loopback (o fluxo inteiro, da persona ao logo); a homologação no espelho é o próximo passo.
- A chave nova `sb_secret_` vai só no cabeçalho `apikey` e a chave antiga também em `Authorization`, como a documentação das chaves manda; não foi testado ao vivo.
- A persona do dossiê é hipótese fundamentada, não pesquisa: o dossiê não pergunta quem são os concorrentes nem qual é a dor do cliente, então a skill pergunta ao dono (até 3 perguntas) e o que continuar faltando fica em "O que ainda não sabemos".
- O recorte de fundo é por cor uniforme (preenchimento a partir dos 4 cantos com tolerância e borda suavizada). Não serve para degradê, foto ou sombra; nesses casos recusa. Não é recorte profissional.
- O SVG do `logo.py` embute o PNG. Vetor de verdade só vem do arquivo de quem desenhou o logo.
- O leitor do dossiê entende o formato que o `polozi-registrar-dossie` grava; o teste roda o registrador de verdade e compara.

## 8. Fora de escopo

Benchmark de marca do segmento, entrevistas com clientes, brand book em PDF, mockups por gerador de imagem, tokens de design, templates de peças, criação de logo, publicação das extrações (tipo `extracao`), a tela Marca (já existe) e migration.
