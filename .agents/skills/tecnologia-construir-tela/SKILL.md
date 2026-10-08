---
name: tecnologia-construir-tela
description: "Constrói ou muda tela do sistema da empresa (Next.js) seguindo o DESIGN.md e as regras de segurança do modelo, e manda publicar com link de teste. Use depois de tecnologia-definir-o-que, em 'faz a tela', 'muda a tela de', 'adiciona um botão'."
metadata:
  origem: polozi
  diretoria: tecnologia
---

# tecnologia-construir-tela

Decide o COMO e escreve a tela: o que o dono aprovou no `requisito.md` vira código, com o visual do `DESIGN.md`, o acesso protegido no servidor e um teste para a regra nova. Depois manda publicar e você mesmo exercita o link de teste contra cada critério de aceite, antes do merge. O dono aprovou o QUÊ (o requisito) na `tecnologia-definir-o-que`; ele não aprova cada publicação, só é avisado quando já está no ar. O dono não vê código.

Fatos do sistema, com `arquivo:linha`, estão em `.agents/skills/tecnologia-sistema/referencias/regras-do-sistema.md` (seções 1, 3, 4 e 9). Caminhos `sistemas/empresa-os/...` são relativos à raiz da Casa; dentro do sistema, os comandos de Node rodam em `(cd sistemas/empresa-os && ...)`.

## Passos

1. **Entrada.** Procure `operacao/tasks/TASK-N/requisito.md` da tarefa. Três casos:
   - **Requisito aprovado** (linha `Aprovado pelo dono em ...` no topo): siga.
   - **Mudança simples** (texto, rótulo, ordem de itens, cor pelo `theme.css`, um botão que só chama o que já existe; nada de dado, permissão ou comportamento novo) e sem requisito: NÃO chame a `tecnologia-definir-o-que`. Abra a pasta da tarefa como no passo 2 daquela skill (próximo `TASK-N`, `TASK.md` a partir do template) e escreva você mesmo `operacao/tasks/TASK-N/requisito.md` mínimo: a primeira linha `Mudança simples, sem conversa: <o que muda, em 1 frase>`, a linha `Pedido do dono em AAAA-MM-DD: "<frase literal do pedido>"` (data de `date +%F`) e UM critério `- [ ] Quando <ação>, então <resultado visível>`. O próprio pedido do dono é a aprovação.
   - **Não é simples e não há requisito aprovado:** pare e chame `tecnologia-definir-o-que`. Isso acontece UMA vez: ela devolve com o requisito aprovado e você segue.
   Se, no meio de uma mudança simples, aparecer necessidade de dado novo, permissão nova ou comportamento novo, pare e chame `tecnologia-definir-o-que` (ela escreve o requisito completo, e daí não volta a ser "simples").
   Depois leia `sistemas/empresa-os/AGENTS.md` e `sistemas/empresa-os/DESIGN.md`, e siga a skill `tecnologia-sistema` (mapa do banco na hora e as regras): você precisa saber o que já existe antes de criar.

2. **Branch antes de editar.** O hook da Casa recusa editar `sistemas/` na branch principal quando já há produção publicada (regra r11). Rode `git branch --show-current`; se vier `main` ou `master`, crie a branch com um nome curto do assunto, por exemplo `git switch -c feat/tela-clientes`.

3. **Precisa de tabela, coluna ou permissão nova?** Chame `tecnologia-mudar-banco` ANTES de escrever a tela. A tela só lê o que o banco já entrega, e a permissão nova (`<modulo>.<acao>`) nasce na migration. Só volte aqui com a migration pronta, testada e com veredito.

4. **Escrever no molde do sistema.** Abra uma tela parecida e copie a estrutura, em vez de inventar: o módulo `sistemas/empresa-os/src/app/(app)/tarefas/` mostra o padrão (`layout.tsx` com a guarda de acesso, `page.tsx` que lê o banco, `actions.ts` que grava). Reuse os componentes de `src/components/ui/` (Button, Card, Empty, Sheet, ResponsiveTable...).
   - **Módulo novo** (rota nova): 3 lugares, juntos no mesmo commit. A permissão e a rota em `src/lib/auth/permissoes.ts` (`Modulo`, `PERMISSAO_MODULO`, `MODULO_ROTA`); o item de menu em `src/lib/nav.ts` (`NAV_GRUPOS`); e a guarda no `layout.tsx` do módulo (`requireAcesso("<modulo>")`). O `nav.ts` diz isso no comentário do topo.
   - **Visual (`DESIGN.md`):** só classes semânticas (`bg-acento`, `text-fg-2`, `border-borda`, `bg-bg-elevada`). NUNCA cor literal (`bg-[#ff0000]`, `text-red-500`, `style={{ color: ... }}`). NÃO edite `src/app/globals.css` nem os componentes base de `src/components/ui/`; se faltar um comportamento, crie um componente novo ao lado, na pasta do módulo. Tema e marca só em `src/app/theme.css` (e isso é outra tarefa). Teste visual: claro e escuro, computador e celular.

5. **Dados e segurança (3 camadas: RLS no banco, guarda no servidor, tela escondendo botão; a tela é cosmética, nunca a defesa).**
   - Leia e grave pelo cliente do servidor que usa a sessão da pessoa: `createClient()` de `@/lib/supabase/server`. Quem decide o que a pessoa vê é a regra de acesso do banco (RLS).
   - A chave de serviço (`SUPABASE_SERVICE_ROLE_KEY`, `createServiceClient()` de `@/lib/supabase/service`) ignora a RLS. Só em código de servidor, só depois de checar a permissão da rota, e só se o requisito exigir (no modelo, os usos são convite de usuário, listagem de usuários e a imagem da Marca). NUNCA em componente com `"use client"` e NUNCA em variável com prefixo `NEXT_PUBLIC_` (esse prefixo embute o valor no navegador de todo mundo).
   - **Checar a permissão no servidor, não só esconder o botão.** Página: `requireAcesso("<modulo>")` no `layout.tsx`. Server Action (ação que grava): `assertAcesso("<modulo>")` e, para escrita, `podeEscrever(sessao, "<modulo>.write")` antes de gravar (veja `tarefas/actions.ts`). O banco decide pelo `tem_permissao(slug)` na RLS. Server Action é alcançável por POST direto de fora da tela: a verificação vai DENTRO de cada ação (fonte: https://nextjs.org/docs/app/guides/data-security).
   - Valide o que chega de fora (parâmetro de URL, campo de formulário) antes de usar, como a `tarefas/page.tsx` faz com os filtros.
   - Next.js 16: `params` e `searchParams` são Promise (`await`), `cookies()` é `await` (`AGENTS.md:44-45`). Em dúvida, leia `sistemas/empresa-os/node_modules/next/dist/docs/` em vez de confiar na memória.

6. **Teste para a regra nova.** Tudo que decide "pode" ou "não pode", filtra, valida ou calcula vai numa função pura em `src/lib/<modulo>/<assunto>.ts`, com um teste do lado: `<assunto>.test.ts` (padrão de `src/lib/format.test.ts`: `import test from "node:test"`, `import assert from "node:assert/strict"`, `import { ... } from "./<assunto>.ts"`). O `npm test` já pega `src/**/*.test.ts`. Prove que o teste vale: escreva o teste, rode e veja VERMELHO; implemente e veja VERDE; depois estrague a regra de propósito (inverta a condição) e confira que o teste fica vermelho de novo; desfaça.

7. **Rodar tudo, em um subshell:** `(cd sistemas/empresa-os && npm run lint && npx tsc --noEmit && npm test)`. O `npm test` inclui o `tokens-proibidos.test.ts`, que reprova alguns padrões de cor literal. Ele NÃO pega tudo (por exemplo `text-red-500`), então rode também:
   `grep -rnE "\b(text|bg|border|ring|fill|stroke|from|to|via|divide|outline|shadow)-(red|green|blue|yellow|orange|gray|grey|slate|zinc|neutral|stone|amber|lime|emerald|teal|cyan|sky|indigo|violet|purple|fuchsia|pink|rose)-[0-9]{2,3}\b" sistemas/empresa-os/src && echo "ACHOU cor literal: troque por classe semantica" || echo limpo`
   e a conferência da chave de serviço no navegador (o resultado deve ser VAZIO; no modelo, só aparecem arquivos de servidor):
   `for f in $(grep -rlE "SUPABASE_SERVICE_ROLE_KEY|supabase/service|createServiceClient" sistemas/empresa-os/src); do grep -l "use client" "$f"; done` (cada arquivo achado é testado um a um; se a primeira busca não achar nada, o laço não roda e a saída fica vazia do mesmo jeito).
   Vermelho em qualquer um = corrija e rode tudo de novo. Não siga com vermelho.

8. **Publicar até o link de teste.** Chame `tecnologia-publicar` e diga a ele o `TASK-N` (a chamada vem da construção de tela). Ele roda a revisão de segurança, abre a PR, espera as checagens e para no link de teste, ANTES do merge, devolvendo o controle a você. BLOCKED do revisor volta para você: corrija, rode o passo 7 de novo e publique de novo.

9. **Provar cada critério antes do merge (você, sem o dono).** Regra do sistema: nada mergeia sem teste, e a senha do dono nunca é digitada pela IA (`AGENTS.md:29-31`). Para cada critério do `requisito.md`, escolha UMA das três provas e marque na linha dele:
   - **Visto no link de teste:** `- [x] ... (sim, visto no teste em AAAA-MM-DD)` (data de `date +%F`).
   - **Provado por teste automático:** `- [x] ... (provado por teste <arquivo>)`.
   - **Não provado:** `- [ ] ... (não: <o que apareceu ou por que não deu para provar>)`.

   Só marque `[x]` do que foi visto ou do que um teste verde prova. Não marque por dedução do código.

   **9a. Como o link de teste é aberto (e por que o valor do token nunca passa por você).** O preview da Vercel aceita `?preview_token=` só em ambiente de preview e entra com um usuário de teste SOMENTE LEITURA (`src/lib/supabase/proxy.ts:49-66`; `conexao.md:13-14`, "crie um membro visualizador dedicado"). O mecanismo documentado: a seção "Primeira vez neste sistema" da `tecnologia-publicar` (o script `.agents/skills/tecnologia-publicar/scripts/instalar_guardas.py`) gera o `PREVIEW_TEST_TOKEN`, guarda em `credenciais/.env` e publica na Vercel com `vercel env add PREVIEW_TEST_TOKEN preview`, valor por arquivo (`empresa-os-template/LEIA-ME.md`, passos 7 e 9); quem monta a URL é o agente `polozi-sistema-qa` da Casa, por script que lê `credenciais/.env` (`polozi-sistema-qa.toml:8-10`). Você chama o agente com o link e o que conferir (todas as telas do módulo, console sem erro, página não vazia por regra de acesso: `AGENTS.md:29-31`) e recebe o veredito; nunca lê, mostra nem monta o token.
   O mesmo script publica o usuário de teste (`PREVIEW_QA_EMAIL` e `PREVIEW_QA_PASSWORD`) quando o dono já o guardou em `credenciais/.env`. O usuário em si é um membro só de leitura que só o dono cria na tela Usuários: o convite não aceita senha (quem abre o e-mail a define), então nenhum script o cria. Por isso existe uma configuração ÚNICA, do dono, e uma marca dela em `operacao/sistema.md` (arquivo sem segredo, o mesmo do `SITE_URL`):
   - **Linha `PREVIEW_QA: configurado em AAAA-MM-DD`:** use o `polozi-sistema-qa` normalmente. Se ele não conseguir entrar, troque a linha por `PREVIEW_QA: pendente, avisado em AAAA-MM-DD` e siga o caso abaixo.
   - **Sem a linha, ou `pendente`:** avise o dono UMA vez (se a linha ainda não diz `avisado`), em palavras simples, sem esperar resposta, com este passo a passo:
     1. "Para eu testar as telas sozinho falta uma configuração que só você faz, uma vez só. Enquanto isso eu provo por teste automático e sigo."
     2. "No sistema, abra a tela Usuários e convide um membro só de leitura para testes, com um e-mail que você consiga abrir. Abra o e-mail e defina a senha dele pelo link."
     3. "Copie o e-mail desse membro e me diga \"copiei\". Depois copie a senha e me diga \"copiei\" de novo. Eu guardo os dois no arquivo de chaves sem ver o valor." (O guardar é o caminho de chave de uma linha da `tecnologia-acessos`, passo 3 de "Conectar": o comando da área de transferência grava no `credenciais/.env`; você nunca digita, cola nem lê a senha.)
     4. "Não me mande a senha pelo chat. Eu publico os dois no ambiente de teste da Vercel e te aviso."
     Grave `PREVIEW_QA: pendente, avisado em AAAA-MM-DD`. NÃO é portão: siga com prova só por teste (veja abaixo). Quando o dono disser que fez e o par estiver guardado, rode `python3 .agents/skills/tecnologia-publicar/scripts/instalar_guardas.py --casa "<pasta principal da Casa>" --so usuario_qa` e confira só os nomes: `vercel env ls preview | grep -E "PREVIEW_TEST_TOKEN|PREVIEW_QA_EMAIL|PREVIEW_QA_PASSWORD"` deve mostrar os três; então grave `PREVIEW_QA: configurado em AAAA-MM-DD`. Se o comando pedir login ou falhar, diga "não verificado" e peça ao dono que confirme os três nomes no painel da Vercel.

   **9b. Critério que o link de teste não prova por desenho.** O usuário de teste só lê. Critério de GRAVAR (salvar, apagar, "quem não tem permissão não grava") ou de negação de acesso não se prova clicando. Cubra no MESMO commit/PR com teste: regra pura em `node --test` (passo 6) ou, se há migration/policy, teste pgTAP de permissão e negação COMO usuário em `sistemas/empresa-os/supabase/tests/` (molde: `tecnologia-mudar-banco`). Marque `- [x] ... (provado por teste <arquivo>)` depois de ver o teste verde (passo 7, ou o job `banco` do CI para pgTAP). Esses critérios NÃO entram no ciclo de 3 tentativas: se o teste está vermelho, corrija como qualquer erro do passo 7. Sem como cobrir por teste nem pelo link, deixe `[ ] (não: <por quê>)`, siga sem esperar e conte ao dono UMA vez, no aviso do passo 10, que esse critério ficou sem prova.

   **9c. O que fazer com o resultado.**
   - **Todos os critérios provados** (visto ou por teste): devolva o controle ao `tecnologia-publicar` para seguir do passo 8 em diante (merge, deploy, conferência da produção). O dono NÃO precisa responder nada.
   - **Critério de tela visto no link falhou:** corrija, volte ao passo 7 e depois ao 8 (a mesma PR recebe o novo commit e o link se atualiza) e exercite de novo. Na terceira tentativa sem fechar o mesmo critério, pare antes do merge e conte ao dono, em palavras simples, o que não deu certo (único caso em que ele entra antes).
   - **Sem como abrir o link** (`PREVIEW_QA` pendente, ou o agente de QA indisponível): prove por teste tudo o que um teste cobre. O critério só visual (aparência, celular, tema escuro) fica `[ ] (não visto no navegador: teste de preview não configurado)` e NÃO bloqueia o merge; ele vai listado no aviso do passo 10. Não faça o merge se algum critério que um teste cobriria estiver sem teste verde.

10. **Avisar o dono depois.** Quando o `tecnologia-publicar` provar que está no ar (passo 11 dele), diga: "Está no ar: <o que mudou, em 1 frase>. Link: <endereço do site ou da tela>". O dono pode responder, mas não precisa. Se algum critério ficou sem prova (`[ ]`), acrescente uma frase: "Não consegui conferir: <critério>." Mensagem única, sem esperar resposta. Quem fecha a TASK é a skill `polozi-concluir-trabalho`; esta skill só marca os critérios.

## Como falar com o dono

- Depois de no ar, uma frase: "Está no ar: <o que mudou>. Link: <link>." Sem pedir permissão para publicar: o requisito que ele aprovou já cobre isso.
- Falha que não se resolve em 3 tentativas: "O critério <tal> não passou: <o que apareceu>. Parei antes de colocar no ar. O que você prefere?"
- Sem jargão: nada de RLS, slug, Server Action. Diga "só quem tem permissão enxerga e grava".
- Não prometa "está seguro": diga o que foi testado (a revisão e os testes) e o que ficou por conferir.

## Fontes

- `sistemas/empresa-os/DESIGN.md` (regra de ouro e "O que NUNCA fazer"), `AGENTS.md:10-15,21-22,34-45`, `src/lib/tokens-proibidos.test.ts` (o que ele pega), `src/lib/auth/guards.ts` e `src/lib/auth/permissoes.ts` (as guardas e `podeEscrever`), `src/lib/supabase/server.ts` e `service.ts` (os dois clientes).
- Next.js, Server Actions e acesso a dados: verificar autenticação e autorização dentro de cada ação, pois ela pode ser chamada por POST direto: https://nextjs.org/docs/app/guides/data-security
- Next.js, variáveis de ambiente (`NEXT_PUBLIC_` vai para o navegador): https://nextjs.org/docs/app/guides/environment-variables
- Supabase, chaves de API (chave secreta nunca em navegador nem repositório): https://supabase.com/docs/guides/api/api-keys
- Definition of Done (Scrum Guide 2020), base dos critérios de aceite: https://scrumguides.org/scrum-guide.html

## Nunca

- Construir sem `requisito.md` aprovado (vale como aprovado: o requisito com a linha `Aprovado pelo dono ...`, e o requisito mínimo de mudança simples que você mesmo escreveu com o pedido do dono entre aspas), ou mudar o escopo no meio sem mostrar ao dono.
- Cor literal, `style` com cor, edição de `globals.css` ou de componente base de `src/components/ui/`.
- `SUPABASE_SERVICE_ROLE_KEY` em componente `"use client"` ou em variável `NEXT_PUBLIC_`.
- Proteger só escondendo o botão: a checagem de permissão vai no servidor, dentro de cada ação.
- Escrever migration ou SQL por aqui: banco é com `tecnologia-mudar-banco`.
- Editar `sistemas/` na `main` com produção publicada (o hook recusa) ou fazer push direto dessa mudança: publicar é com `tecnologia-publicar`.
- Marcar critério como sim sem ter visto o resultado no link de teste ou o teste verde.
- Pedir "ok" ao dono a cada publicação, ou mandar a conversa de volta para `tecnologia-definir-o-que` quando a mudança é simples.
- Fazer o merge sem ter provado, por link ou por teste, cada critério que dá para provar.
- Digitar a senha do dono ou pedir que ele a cole no chat.
- Seguir com lint, tipos, testes ou as duas conferências do passo 7 em vermelho.
- Dizer "pronto" com algum critério em `[ ]` sem avisar o dono qual ficou sem prova.
- Ler, mostrar ou montar o `PREVIEW_TEST_TOKEN`, ou digitar a senha do usuário de teste.
- Tratar a configuração do preview como portão: sem ela, siga com prova por teste e avise uma vez.
