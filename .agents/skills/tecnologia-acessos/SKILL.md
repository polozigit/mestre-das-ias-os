---
name: tecnologia-acessos
description: "Conecta serviço novo e guarda a chave sem expor, mantém o inventário de quem acessa GitHub, Vercel e Supabase, e prepara a saída de pessoa. Use em 'conecta o X', 'coloca a chave do Y', 'quem tem acesso', 'fulano saiu da empresa'."
metadata:
  origem: polozi
  diretoria: tecnologia
---

# tecnologia-acessos

Cuida de três coisas: conectar serviço novo e guardar a chave sem ela passar pelo chat, manter a lista de quem acessa o quê, e preparar a saída de uma pessoa. Revogar acesso e girar chave são ações do dono: você prepara o roteiro com links, ele executa. Só observa, registra e prepara.

Fatos do sistema usados aqui, com `arquivo:linha`, estão em `.agents/skills/tecnologia-sistema/referencias/regras-do-sistema.md` (seções 4, 8 e 10). Comandos rodam da raiz da Casa (a pasta do repositório do aluno).

## Onde cada coisa mora

- `credenciais/.env`: os VALORES das chaves que a Casa usa. Fora do GitHub (`.gitignore` da Casa), nunca no chat. O hook da Casa recusa ler esse arquivo (regra r07).
- `credenciais/CONEXOES.md`: catálogo do que está conectado (serviço, para quê, variável, prova, data). Só o script da skill `polozi-registrar-conexao` escreve nele, depois de uma prova. Pode ser lido.
- `sistemas/empresa-os/conexao.md`: catálogo SEM valores das variáveis que o sistema usa e dos segredos do GitHub (`conexao.md:3-4,22-28`). Variável nova de módulo = linha nova nele, no mesmo commit da mudança que a usa (`conexao.md:18`).
- Painel da Vercel: onde moram os valores de produção (`AGENTS.md:34-35`).
- Segredo que o BANCO usa (função, gatilho): vai para o Vault do Supabase e nunca para o `.env` (`conexao.md:19-20`, `supabase/README.md:65-77`). Limite desta skill: o time não tem script para guardar no Vault; veja o passo 5 de "Conectar".

## Conectar serviço novo e guardar a chave

1. **Ver se já existe.** Leia `credenciais/CONEXOES.md` e `sistemas/empresa-os/conexao.md`. Serviço já conectado e o pedido é TROCAR a chave: não é esta etapa, vá para "Girar chave" (a skill de conexão não troca chave de conexão existente).

2. **Chamar `polozi-registrar-conexao`** (skill da fundação, plugin `polozi-fundacao`) e seguir os passos dela. A ordem de preferência é dela: MCP com login (OAuth) primeiro, `gh` para GitHub, chave de API só em último caso. Ela mesma ensina a achar o Python e o `provar_conexao.py`; não copie os comandos dela para cá e nunca escreva em `credenciais/CONEXOES.md` por fora (só o script grava, e só depois da prova). Quem faz login, cria conta e digita senha é o dono.

3. **Se for chave de API**, o valor chega no `credenciais/.env` pela área de transferência, no comando que a skill de conexão dá (a IA abre o site no Chrome do dono e clica em copiar, via Computer Use). Você nunca digita, cola nem lê o valor. Depois confira, sem abrir o arquivo:
   - **O nome entrou:** `--listar-nomes` da skill de conexão (imprime só os nomes das variáveis).
   - **Prova:** `--ultimos-4 NOME_DA_VARIAVEL` da skill de conexão (imprime só os 4 últimos caracteres). É isso que você mostra ao dono.
   - **O arquivo não sobe para o GitHub:** `git check-ignore -q credenciais/.env && echo ignorado || echo NAO-ignorado`. `NAO-ignorado` = pare, avise o dono e não faça commit nenhum até resolver.
   - **Permissão restrita (macOS e Linux):** `ls -l credenciais/.env` deve começar com `-rw-------`. Se não, a skill de conexão traz o `chmod 600`. No Windows ela traz o `icacls`; não repita aqui.

4. **Se o sistema (a tela, o servidor) precisa da chave:** acrescente a linha em `sistemas/empresa-os/conexao.md` (nome, o que é, onde vive, ambientes), sem valor, junto da mudança que a usa; quem faz o commit é `tecnologia-publicar`. O valor de produção vai para o painel da Vercel (https://vercel.com/dashboard, abrir o projeto, Settings, Environment Variables): a IA abre no Chrome do dono (Computer Use) e usa a área de transferência, sem o valor passar pelo chat. Chave secreta NUNCA com prefixo `NEXT_PUBLIC_`: esse prefixo embute o valor no site que vai para o navegador de todo mundo (fonte: https://nextjs.org/docs/app/guides/environment-variables).

5. **Se o BANCO precisa da chave** (uma função ou gatilho que chama serviço de fora): ela vai para o Vault. A migration `0017` cria `public.guardar_segredo`, mas este time não tem script que a chame, e `vault.decrypted_secrets` e `segredo(` são bloqueados pelo hook (r09). Diga ao dono, sem jargão: "essa chave precisa ir para o cofre do banco, e isso eu ainda não faço sozinho; anotei como pendência". Registre a pendência em `operacao/PENDENCIAS.md` e não guarde a chave em outro lugar para quebrar o galho.

6. **Dizer "conectado" só com prova:** a saída 0 do script da skill de conexão. Frase ao dono: "Conectei o <serviço>. A prova é que a chave termina em <4 caracteres>. O valor ficou no arquivo de chaves, que o GitHub não recebe."

## Inventário: quem acessa o quê

Roda quando o dono pedir, quando alguém entrar ou sair, e como parte da saída de pessoa. Sugestão: uma vez por mês, junto do lembrete da cópia fora do computador da skill `tecnologia-vigiar`.

1. **GitHub, pessoas com acesso ao repositório:**
   `gh api repos/{owner}/{repo}/collaborators --jq '.[] | "\(.login) admin=\(.permissions.admin)"'`
   (`{owner}` e `{repo}` o `gh` preenche sozinho a partir da pasta atual). Falhou com 403 ou 404 = o login do `gh` não é de quem administra o repositório: anote "não verificado" ou abra `<endereço do repositório>/settings/access` no Chrome do dono (Computer Use) e leia a lista, com o endereço de `gh repo view --json url --jq .url`.
2. **GitHub, nomes dos segredos da automação (sem valor):** `gh secret list`.
3. **Vercel:** só rode `vercel teams ls` se `vercel whoami` responder um nome de usuário; senão, não tente login (é do dono). Os MEMBROS de cada time só aparecem no painel: https://vercel.com/dashboard, abrir o time, Settings, Members. Abra no Chrome do dono (Computer Use) e leia a lista, ou anote "não verificado".
4. **Supabase:** os membros da organização só aparecem no painel: https://supabase.com/dashboard, escolher a organização, menu Team (se o nome do menu mudou, procure "Team" ou "Members"). Mesmo tratamento: a IA lê no Chrome do dono, ou "não verificado".
5. **Chaves, só nomes:** `credenciais/CONEXOES.md` e `sistemas/empresa-os/conexao.md` (leitura normal) e `--listar-nomes` da skill de conexão. Se o sistema já tem a tabela `public.conexao` (migration `0017`), as colunas `servico`, `conta`, `estado`, `copias`, `rotacionado_em` e `rotacionar_ate` dizem onde cada chave tem cópia e quando vence; leia só essas colunas, pelo MCP do Supabase (`execute_sql`, só leitura): `select servico, conta, estado, copias, rotacionado_em, rotacionar_ate from public.conexao order by servico, conta;`. Nunca `segredo_ref`, nunca `segredo(`, `vault.secrets` ou `vault.decrypted_secrets` (o hook bloqueia, regra r09). Sem o MCP do Supabase, ou sem permissão para ler, anote "não verificado".
6. **Pessoas do próprio sistema:** a tela Usuários do sistema (permissão `usuarios.manage`, só o dono) lista quem entra nele. Abra a tela no Chrome do dono (Computer Use) e leia, ou anote "não verificado".

**Gravar** em `operacao/acessos.md` (crie se não existir), substituindo o conteúdo anterior, com a data de `date +%F`. Só login ou nome, sem e-mail, sem valor de chave:

```
# Acessos (conferido em AAAA-MM-DD)

## GitHub (repositório <owner>/<repo>)
- <login>: administrador sim ou não

## Vercel
- <nome>: <papel>   ou   não verificado: <motivo>

## Supabase
- <nome>: <papel>   ou   não verificado: <motivo>

## Chaves (só nomes)
| Nome | Serviço | Cópias | Última troca |
|---|---|---|---|

## Mudou desde a conferência anterior
- entrou: ...   saiu: ...   virou administrador: ...
```

Leia o `operacao/acessos.md` antigo (se existir) ANTES de reescrever. A seção "Mudou" lista só a diferença contra ele (quem apareceu, quem sumiu, quem virou administrador). Qualquer um que o dono não reconhece, ou administrador novo, vai ao dono na hora (veja "Como falar com o dono"). O commit do arquivo é do `tecnologia-publicar`.

## Girar chave

O dono cria a chave nova e troca nas cópias; você prepara o roteiro e confere. Para cada chave, na ordem:

1. **Antes:** se a chave mora no `credenciais/.env`, rode `--ultimos-4 NOME_DA_VARIAVEL` da skill de conexão e anote "antes: termina em XXXX" no roteiro.
2. **Criar a nova** no painel do serviço (o dono). Atalhos: GitHub https://github.com/settings/tokens e Supabase https://supabase.com/dashboard/account/tokens (se o link não abrir, use o menu da conta no painel).
3. **Trocar em TODA cópia:** a coluna "Cópias" do inventário e a coluna "Onde vive" do `conexao.md` dizem onde há cópia (arquivo de chaves, segredo do GitHub, variável da Vercel). No `credenciais/.env` o dono abre o arquivo no editor dele e troca o valor da linha existente (não acrescente linha repetida, e você não abre o arquivo).
4. **Provar a troca no arquivo de chaves:** rode `--ultimos-4` de novo. Terminar em outros 4 caracteres = o valor mudou. Terminar igual = não mudou.
5. **Conferir que o sistema segue de pé** (o `checar_producao.py` do passo 4 de "Saída de pessoa") antes de revogar a chave velha.
6. **Revogar a velha** no painel do serviço (o dono). Só depois de 5.

Como a skill `polozi-registrar-conexao` não troca chave de conexão existente, o `credenciais/CONEXOES.md` não é reescrito à mão: se o NOME da variável não mudou, ele continua certo.

## Saída de pessoa

Entrada: o nome ou login da pessoa. Você prepara, o DONO executa: tirar acesso e girar chave afetam o funcionamento do sistema e só ele autoriza.

1. Rode o inventário acima e levante tudo o que a pessoa tem: GitHub, Vercel, Supabase, usuário no sistema e chaves em que ela é a `conta` ou o dono (`credenciais/CONEXOES.md`, `public.conexao` quando existir).
2. Escreva o roteiro em `operacao/saidas/AAAA-MM-DD-<login>.md` (crie a pasta). Cada linha com o que fazer, onde clicar e como confirmar:
   - **Revogar acesso:** GitHub (`<endereço do repositório>/settings/access`, remover a pessoa); Vercel (painel, o time, Settings, Members); Supabase (painel, a organização, Team); sistema (tela Usuários). Se a pessoa tinha acesso a contas compartilhadas, a senha dessas contas também muda.
   - **Girar chave:** toda chave que a pessoa pode ter visto (quem teve acesso à pasta da Casa, ao painel da Vercel ou ao Supabase pode ter visto as chaves de serviço). Siga a receita da seção "Girar chave" uma vez por chave e copie os passos para o roteiro, com o nome da chave e as cópias dela.
3. Entregue ao dono o roteiro em palavras simples, em ordem, e peça o "feito" por item. Não execute nenhum item sozinho.
4. Quando o dono disser que fez: rode o inventário de novo e confirme que a pessoa sumiu da lista de cada serviço; depois de girar chave, confira o site. O endereço segue o passo 8a da skill `tecnologia-publicar`: a linha `SITE_URL: <endereço>` de `operacao/sistema.md`; senão o `environment_url` do último deploy `success`; senão pergunte ao dono UMA vez e grave a linha `SITE_URL: <endereço>` em `operacao/sistema.md` (arquivo sem segredo); nunca invente o endereço nem leia `credenciais/`. Com o endereço: `python3 .agents/skills/tecnologia-publicar/scripts/checar_producao.py "<endereço>"` (exit 0 = o site segue no ar). Quando a linha `SITE_URL:` já existe, um comando só: `python3 .agents/skills/tecnologia-publicar/scripts/checar_producao.py "$(grep -m1 '^SITE_URL:' operacao/sistema.md | sed 's/^SITE_URL:[[:space:]]*//')"`. Item que você não consegue verificar fica como "dito pelo dono, não verificado". Só então diga "acesso removido" e só do que foi visto saindo da lista.

## Como falar com o dono

- Sempre em frase curta, sem jargão, sem valor de chave: "Conectei o X. A prova é que a chave termina em ****."
- Acesso que ele não reconhece: "Tem uma pessoa com acesso ao <serviço> que não reconheço: <login>. Quer que eu monte o roteiro para tirar?"
- Saída de pessoa: "Montei a lista do que precisa mudar quando <nome> sair. Eu não mexo nisso sozinho porque tira acesso e troca chave; a lista tem cada passo e o link."
- Não prometa que "nada vazou" nem que "está seguro": diga o que foi conferido e o que ficou "não verificado".

## Fontes

- Supabase, chaves de API: a chave secreta ignora todas as regras de acesso das tabelas e nunca vai para navegador nem para o repositório: https://supabase.com/docs/guides/api/api-keys
- Next.js, variáveis de ambiente: só as variáveis com prefixo `NEXT_PUBLIC_` são públicas, e entram no pacote do navegador na hora da construção: https://nextjs.org/docs/app/guides/environment-variables
- NIST SP 800-218 (SSDF), PS.1.1: acesso ao código pelo menor privilégio, só para quem precisa: https://nvlpubs.nist.gov/nistpubs/SpecialPublications/NIST.SP.800-218.pdf
- Os comandos `gh api .../collaborators` e `gh secret list` não foram executados na construção desta skill (sem rede). O nome dos campos `login` e `permissions.admin` vem da API REST do GitHub (https://docs.github.com/en/rest/collaborators/collaborators); no primeiro uso, se a saída vier vazia ou com erro, anote "não verificado" e diga o erro literal ao dono.
- Regra do time (spec, linha "Identidade e Acesso"): a lista é automática; revogar acesso e girar chave é humano, por ser ação de alto risco.

## Nunca

- Ler `credenciais/.env` (nem com `cat`, `head`, `sed`; o único acesso ao conteúdo é pelo script da skill de conexão, só `--listar-nomes` e `--ultimos-4`), mostrar valor de chave em voz alta ou colar valor no chat. Só nomes e os 4 últimos caracteres.
- Pedir ao dono para colar a chave no chat, ou digitar a chave ou senha por ele.
- Escrever em `credenciais/CONEXOES.md` à mão.
- Fazer commit de `credenciais/.env` ou de qualquer arquivo com valor de chave.
- Conceder administrador, "owner" ou papel acima do mínimo a ninguém. Acesso novo = o dono convida no painel, com o menor papel que resolve, e você só registra no inventário.
- Revogar acesso, remover membro, girar ou apagar chave por conta própria.
- Consultar `vault.decrypted_secrets`, `vault.secrets` ou chamar `segredo(` (o hook bloqueia; é regra do sistema).
- Usar prefixo `NEXT_PUBLIC_` em chave secreta.
- Dizer "conectado" sem a saída 0 da prova, ou "acesso removido" sem ter conferido a lista de novo.
- Criar conta em serviço no lugar do dono.
