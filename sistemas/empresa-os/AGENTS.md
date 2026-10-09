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
- **Mudança de tela vai ao ar com o "aprovado" do dono**: CI verde (os testes
  automáticos continuam obrigatórios) → link do preview da Vercel → o DONO abre
  o link, olha a tela que mudou e responde "aprovado" → produção. Não existe QA
  de tela obrigatório, usuário de teste, agente de QA no caminho nem ciclo
  extra. A primeira resposta da IA no preview diz ao dono o único passo dele:
  abrir o link, olhar a tela que mudou e responder "aprovado". Nunca peça para
  criar usuário, convidar membro de teste ou guardar senha.
- **Conferir a tela é opcional e só a tela alterada**: quando a IA quiser
  conferir, usa `?preview_token=` (entra como o DONO por link mágico gerado no
  servidor, sem senha) e olha SÓ a tela que a mudança alterou, nunca todas as
  telas do sistema. Se não rodar, nada trava. O preview usa o banco de
  PRODUÇÃO: a IA só navega e olha (não salva, não exclui, não convida); teste
  que precisa gravar usa um registro `[TESTE]` e apaga no fim. A senha do dono
  NUNCA é digitada pela IA.
- **Visual**: marca no sistema (cores, fontes, logo, ícone) = skill
  `tecnologia-aplicar-marca`, nunca à mão (catálogo em `DESIGN.md`).
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
