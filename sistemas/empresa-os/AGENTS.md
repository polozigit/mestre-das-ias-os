# O sistema da empresa: instruções técnicas desta pasta

Escopo: SÓ esta pasta (`sistemas/empresa-os/`). As regras da empresa moram no
AGENTS.md da raiz da Casa. Instalação do zero: `LEIA-ME.md`.

## O que é isto

O sistema da empresa: Next.js + Supabase, telas Início, Cronograma, Tarefas
(kanban e tabela), Organograma, Time de Agentes (com uma página por agente, em `/agentes/<name>`), Marca, Atividade, Usuários e
Configurações. Permissão por slug `<modulo>.<acao>` (dono tem todas): no banco
`tem_permissao(slug)` decide e `sessao_atual()` entrega a sessão com a lista de
slugs; no código, `src/lib/auth/permissoes.ts` mapeia módulo para slug e
`getSessao()` (`src/lib/auth/sessao.ts`) chama a RPC uma vez por request.
Segurança em 3 camadas (RLS no banco > guards no servidor > UI escondendo
link — a UI é cosmética, nunca a defesa).

## Comandos

- Rodar local: gere `.env.local` das vars do `conexao.md` (valores em
  `credenciais/.env` da Casa) e `npm run dev`
- Conferir tipos: `npx tsc --noEmit` · Testes: `npm test` · Lint: `npm run lint`
- ANTES de todo push: os três acima verdes

## Regras duras

- **Migration nova**: seguir o molde de `supabase/migrations/` (RLS + REVOKE +
  GRANT mínimo + policy + smoke que prova o GRANT). O especialista de banco do
  time de sistema valida ANTES de aplicar; nunca aplicar direto em produção.
- **Nada mergeia sem QA**: preview da Vercel com `?preview_token=`, exercitar
  como usuário (todas as telas + console limpo + cheque de página-vazia-por-RLS)
  e APPROVED. A senha do dono NUNCA é digitada pela IA.
- **Visual**: mexa SÓ em `src/app/theme.css` (catálogo em `DESIGN.md`).
  Estrutura de tela não muda sem task aprovada pelo dono.
- **Segredo nunca no repo**: produção = painel da Vercel; catálogo de quais
  variáveis existem = `conexao.md`; valores = `credenciais/.env` da Casa.
- **Schema mudou?** Regere `src/types/supabase.gen.ts` (tipos gerados do banco)
  no MESMO commit. `src/types/database.ts` só re-exporta os gerados e dá nomes
  curtos (`Tarefa`, `Agente`...): não escreva tipo de tabela à mão ali.
- **Schema de módulo novo** (`tarefas`, `organograma`...) precisa estar em
  Project Settings > Data API > Exposed schemas do Supabase, senão a consulta
  falha com `PGRST106`.
- **Tema**: a escolha do usuário vai em `<html data-theme>`; o `theme.css`
  tem o escuro em DOIS blocos (ver `DESIGN.md`).
- Next.js 16 diverge do seu treino: `params`/`searchParams` são Promise
  (`await`), `cookies()` é `await`. Em dúvida, leia `node_modules/next/dist/docs/`.

## Deploy

Branch → preview automático da Vercel · merge → produção sozinha · deu errado →
`$polozi-buscar-versao-anterior` (rollback de 1 comando).
