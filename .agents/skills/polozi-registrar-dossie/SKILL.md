---
name: polozi-registrar-dossie
description: "Registra o dossiê (71 perguntas) como fonte e, com o sim do dono, publica em Marca. Use em 'registra o dossiê'."
---

# Polozi Registrar Dossiê

Transformar uma única transcrição em fonte estruturada e, se o dono quiser, mostrá-la no sistema. Não entrevistar, não gravar áudio, não resumir respostas e não criar fatos aprovados da empresa.

## Preparar

Dossiê já registrado e o dono pediu "registra o dossiê" sem anexar transcrição nova? Pule para "Publicar na tela". Sem dossiê registrado, siga os passos abaixo, que pedem a transcrição.

1. Ler `EMPRESA-IA.md`. Consultar o Mapa e abrir apenas `contexto/LEIA-ME.md` e `operacao/LEIA-ME.md`.
2. Confirmar que a pasta principal possui `EMPRESA-IA.md`, `MAPA-DA-EMPRESA-IA.md`, `contexto/` e `operacao/`. Caso contrário, orientar o usuário a usar `Polozi Criar Empresa IA`.
3. Aceitar uma transcrição colada ou um único arquivo `.txt`, `.md`, `.docx` ou `.pdf`. Para texto colado, salvar somente uma cópia temporária fora do projeto e tratá-la como `texto-colado`.
4. Não aceitar áudio, vídeo, links, vários arquivos ou PDF sem texto extraível. Pedir uma transcrição compatível, sem tentar OCR ou inferir conteúdo.
5. Localizar `scripts/registrar_dossie.py`. O questionário canônico está em `assets/questionario-dossie-v1.json`.

## Fazer a prévia

Gerar uma data-hora única `AAAA-MM-DD_HHMMSS` e executar sem escrita:

```bash
python3 scripts/registrar_dossie.py \
  --destino "PASTA_ABSOLUTA" \
  --arquivo "TRANSCRICAO" \
  --registro-em "AAAA-MM-DD_HHMMSS" \
  --dry-run
```

Para texto colado, apontar `--arquivo` para a cópia temporária e acrescentar `--rotulo-origem texto-colado`.

Mostrar: formato, códigos encontrados, ausentes, duplicados, ambíguos, trechos fora do roteiro, arquivos de destino e eventual arquivo que será arquivado. Não associar resposta a código ausente, inválido ou ambíguo.

Se não houver nenhum código válido, interromper e pedir uma transcrição gravada com `Pergunta 1.1`, `Pergunta 1,1` ou `Pergunta 1 ponto 1`.

Pedir uma única confirmação antes da escrita.

## Registrar

Após confirmação explícita, executar o mesmo comando com `--aplicar`. Se já existir `contexto/dossie/dossie-completo.md`, acrescentar também `--confirmar-atualizacao`.

```bash
python3 scripts/registrar_dossie.py \
  --destino "PASTA_ABSOLUTA" \
  --arquivo "TRANSCRICAO" \
  --registro-em "AAAA-MM-DD_HHMMSS" \
  --aplicar
```

O script preserva a fonte original, cria o dossiê canônico e o relatório. Em atualização, arquiva antes o dossiê anterior. Nunca apaga fonte anterior nem escreve em `empresa/`, `metodos/`, `producao/` ou `sistemas/`.

## Verificar

1. Confirmar que o Mapa marcou `contexto.dossie` como `fonte` — na tabela `MAPA-DA-EMPRESA-IA.md` e em `operacao/mapa.json` (a fonte de onde a tabela é gerada), quando esse arquivo existir.
2. Confirmar que o dossiê contém as 71 perguntas e somente respostas transcritas, sem diagnóstico ou resumo.
3. Confirmar a atualização de `STATUS-ATUAL.md`, `CHANGELOG.md`, `PENDENCIAS.md` (nova linha na tabela) e `PROXIMA-SESSAO.md`.
4. Informar códigos ausentes, duplicados, ambíguos e trechos não classificados para revisão humana.
5. Informar que o próximo trabalho é revisar lacunas e validar quais documentos empresariais podem ser derivados.

## Publicar na tela

A aba Dossiê de Marca, no sistema, só mostra o dossiê depois de publicado: é o que a tela promete a quem pede "registra o dossiê". Publicar é decisão do dono, porque quem tem acesso a Marca passa a ler a transcrição inteira. Faça estes passos logo após Verificar e também quando o dono pedir "registra o dossiê" de novo, sem transcrição nova (o dossiê já está registrado). Os comandos usam `python3`; no Windows, `py -3` (o campo `comando_python` de `operacao/INSTALACAO.md` diz qual).

1. Conferir o time Marketing: o publicador é `.agents/skills/marketing-persona/scripts/publicar_documento.py`, na pasta principal. Ausente: diga em 1 frase que a aba Dossiê fica vazia até o time `marketing` ser instalado (`$polozi-instalar-time`), anote em `operacao/PENDENCIAS.md` (origem `descoberta-ia`) e pare. Não publique de outro jeito e não escreva o conteúdo da aba.
2. Ver se já existe o sim do dono para este texto: `python3 .agents/skills/marketing-persona/scripts/aprovacao.py conferir --arquivo "contexto/dossie/dossie-completo.md" --casa "PASTA_ABSOLUTA"`. `OK` = vá ao passo 4. `PROBLEMA` = faça o passo 3.
3. Pedir o sim, em 1 frase: "Quer que o dossiê apareça no sistema, em Marca, aba Dossiê? Quem tem acesso a Marca vai poder ler o texto inteiro. Responda sim para eu publicar." Só vale o "sim" escrito sobre esta pergunta: "ok", "pode" e "sim, mas muda X" não valem. Sem sim, pare: o dossiê fica só na pasta. Com o sim, grave-o preso ao texto: `python3 .agents/skills/marketing-persona/scripts/aprovacao.py registrar --arquivo "contexto/dossie/dossie-completo.md" --casa "PASTA_ABSOLUTA" --frase "TRECHO_DO_SIM"` (só o trecho do sim, literal). A linha `Aprovado pelo dono` entra logo abaixo do título; o Mapa não muda: `contexto.dossie` continua `fonte`. Nunca escreva essa linha à mão.
4. Publicar: primeiro o ensaio, com `--dry-run`; depois o mesmo comando sem ele.

```bash
python3 .agents/skills/marketing-persona/scripts/publicar_documento.py \
  --tipo dossie \
  --titulo "Dossiê da empresa" \
  --arquivo "contexto/dossie/dossie-completo.md" \
  --casa "PASTA_ABSOLUTA" \
  --dry-run
```

5. Ler a saída do comando sem `--dry-run`:
   - **0** = publicado. Confirme com `python3 .agents/skills/marketing-persona/scripts/publicar_documento.py --tipo dossie --arquivo "contexto/dossie/dossie-completo.md" --casa "PASTA_ABSOLUTA" --conferir` (precisa dar `EM DIA`) e diga ao dono: "Está em Marca, aba Dossiê, no sistema."
   - **2 com `FALTA`** = o banco ainda não foi ligado (comum na instalação, antes do sistema no ar). O sim e o dossiê ficam salvos no projeto: diga em 1 linha que a publicação espera o sistema e que depois é só pedir "registra o dossiê" de novo.
   - **3** = há algo parecido com chave ou segredo na transcrição: mostre ao dono a linha que o script apontou, não publique e não edite a transcrição à mão.
   - **4** = erro de rede ou do banco: repita uma vez; se persistir, conte ao dono sem jargão e anote em `operacao/PENDENCIAS.md` (origem `descoberta-ia`).
   - **5** = o texto mudou depois do sim, ou não há sim: volte ao passo 3.

## Limites

- Nunca escrever sem prévia e confirmação.
- Nunca inferir a ordem de respostas sem código.
- Nunca transformar a transcrição em fato aprovado. O sim de publicar não muda isso: o dossiê continua `fonte`.
- Nunca publicar o dossiê sem o sim do dono sobre a pergunta de publicar, nem por outro caminho que não o `publicar_documento.py` do time Marketing (sem SQL, sem chave no chat).
- Nunca sobrescrever fonte ou dossiê anterior sem arquivamento e confirmação explícita.
- Nunca guardar a transcrição fora da Empresa IA, exceto a cópia temporária necessária ao processamento de texto colado.
