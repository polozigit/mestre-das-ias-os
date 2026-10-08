---
name: tecnologia-sistema
description: "Consulta como o sistema da empresa é feito: banco (schemas, tabelas, regras de RLS e GRANT), GitHub, CI e Vercel. Use antes de mexer em tela, banco ou publicação, e quando perguntarem 'que tabela guarda X', 'como o sistema protege Y', 'por que a tela ficou vazia'. Só leitura."
metadata:
  origem: polozi
  diretoria: tecnologia
---

# tecnologia-sistema

Responde perguntas sobre como o sistema da empresa é construído, sempre a partir dos arquivos do repositório e nunca de memória.

## Quando usar

- Antes de mexer em tela, banco ou publicação, para saber o que já existe e quais regras valem.
- Perguntas como "que tabela guarda X", "como o sistema protege Y", "por que a tela ficou vazia", "quem aplica migration em produção".

## Passo 1: gerar o mapa do banco na hora

```bash
python3 .agents/skills/tecnologia-sistema/scripts/gerar_mapa_sistema.py --migrations sistemas/empresa-os/supabase/migrations
```

O mapa lista cada schema e cada tabela, com a migration que a criou. Ele sai na hora, lendo as migrations atuais. Nunca responda "que tabelas existem" de memória nem a partir de um mapa salvo antes. Com `--saida <arquivo.md>` o mapa vai para um arquivo em vez da tela.

Limite: tabela criada por SQL montado em tempo de execução (por exemplo pela função `public.criar_outbox_inbox`) não aparece no mapa. Se a pergunta for sobre outbox ou inbox de um módulo, leia a migration do módulo.

## Passo 2: ler as regras

Leia `referencias/regras-do-sistema.md` (nesta pasta). Ela reúne as regras do sistema, cada uma com `arquivo:linha`: camadas de segurança, gates do banco, GRANT, RLS, migrations, CI, variáveis, hook e limites dos planos grátis.

## Passo 3: responder citando o arquivo

- Cite o arquivo (e a linha, quando a referência trouxer) de onde saiu cada afirmação.
- Se a referência e o arquivo real divergirem, vale o arquivo real; diga a divergência.
- Se não achar a resposta nos arquivos, diga que não achou. Não invente tabela, coluna, função nem regra.
- Ao falar com o dono, sem jargão: diga o que acontece e o que fazer, não o nome da policy.

## O que esta skill não faz

- Não escreve em nenhum arquivo do sistema (o mapa só vai para arquivo se você pedir `--saida`).
- Não roda SQL em produção nem conecta no banco.
- Não aplica migration, não publica, não mexe em segredo. Para mudar o banco, use a skill `tecnologia-mudar-banco`.
