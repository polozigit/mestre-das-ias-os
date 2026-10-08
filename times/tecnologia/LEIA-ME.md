# Time Tecnologia

Time de agentes que cuida do sistema da empresa do aluno (Next.js + Supabase): definir o que construir, construir, mudar o banco com segurança, publicar, vigiar e guardar os acessos.

## Skills e subagente

| Nome | O que faz |
|---|---|
| `tecnologia-sistema` | Consulta como o sistema é feito (banco, regras de acesso, GitHub, CI, Vercel). Só leitura; vem antes de mexer em tela, banco ou publicação. |
| `tecnologia-publicar` | Leva a mudança até o ar: branch, commit, PR, testes, link de teste, merge e conferência da produção, com volta automática se quebrar. O dono nunca vê git. |
| `tecnologia-mudar-banco` | Muda o banco com segurança: escreve e testa a migration, classifica (só acrescenta ou destrutiva), tira cópia, ensaia na homologação e pede o "sim" do dono só quando pode apagar dado. |
| `tecnologia-vigiar` | Rotina de saúde: alertas do Supabase, site no ar, último deploy, cópia semanal do banco e restauração testada todo mês. |
| `tecnologia-acessos` | Conecta serviço novo e guarda a chave sem expor, mantém o inventário de quem acessa GitHub, Vercel e Supabase e prepara a saída de pessoa (o dono revoga e gira as chaves). |
| `tecnologia-definir-o-que` | Transforma o pedido do dono numa tarefa clara: o problema, quem usa, o que aparece na tela e como saber que ficou pronto (`requisito.md`, com o "ok" dele). |
| `tecnologia-construir-tela` | Constrói ou muda tela do sistema seguindo o `DESIGN.md` e as regras de segurança do modelo, e manda publicar com link de teste. |
| `tecnologia-revisor-seguranca` (subagente) | Revisa a mudança antes do merge, só leitura, sem ter construído: responde `APPROVED` ou `BLOCKED` com achados `arquivo:linha`. |

## Onde moram

- `time.json`: lista de agentes e skills (fonte do time).
- `.agents/skills/<nome>/`: cada skill, com `SKILL.md` e `scripts/`.
- `agentes/`: instruções dos subagentes.
- `tests/`: testes do time.

## Testes

```
cd 10-mestre-das-ias/chatgpt-work-codex/times/tecnologia
python3 -m unittest discover -s tests -v
```

## Gerar as saídas

```
python3 ../native-ai/.agents/skills/native-ai-construir/scripts/gerar_saidas.py --raiz .
```

Fonte aninhada: só gera `.codex/agents` e `trechos/`.
