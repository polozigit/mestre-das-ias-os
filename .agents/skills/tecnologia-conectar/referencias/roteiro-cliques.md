# Roteiro clique a clique (plano B)

Use só quando a skill `tecnologia-conectar` falhou 2 vezes no mesmo passo. Cada seção tem o endereço, os passos numerados com o nome do botão entre aspas e o resultado esperado. Os nomes de botão podem mudar: as marcas `<!-- rotulo: confirmar no ensaio -->` dizem onde conferir. Quem clica é o dono; a IA espera o "pronto".

## Projeto na Vercel a mão

Endereço: https://vercel.com/new

1. Entre na Vercel com a conta da empresa.
2. Em "Import Git Repository", escolha o repositório da Casa e clique em "Import". <!-- rotulo: confirmar no ensaio -->
3. Em "Project Name", escreva o `slug_os` (o valor de `slug_os:` em `operacao/INSTALACAO.md`). O nome tem que ser exatamente esse. <!-- rotulo: confirmar no ensaio -->
4. Em "Root Directory", clique em "Edit" e escolha `sistemas/empresa-os`. <!-- rotulo: confirmar no ensaio -->
5. Clique em "Deploy". O primeiro deploy pode falhar porque as variáveis do banco ainda não existem: isso é esperado, a primeira publicação do instalador substitui esse deploy.
6. Resultado esperado: o projeto aparece na lista da Vercel com o nome `slug_os`. Avise a IA ("pronto") e ela segue pelo passo (e2).

## Redirect URLs a mão

Endereço: https://supabase.com/dashboard (abra o projeto da empresa).

1. No menu da esquerda, abra "Authentication" e depois "URL Configuration". <!-- rotulo: confirmar no ensaio -->
2. Em "Site URL", escreva `https://<DOMINIO>` (o endereço de produção, com `https://`) e clique em "Save changes".
3. Em "Redirect URLs", clique em "Add URL" e adicione as duas linhas abaixo, uma de cada vez:
   - `https://<DOMINIO>/**`
   - `https://*-<TIME>.vercel.app/**` (`<TIME>` é o apelido do time da Vercel; esta linha libera os links de teste)
4. Não apague as linhas que já estavam (por exemplo `http://localhost:3000/**`).
5. Resultado esperado: as duas linhas aparecem na lista. Avise a IA ("pronto") e ela confere rodando o `provar`.

## CLI da Vercel no Windows

1. Abra o PowerShell.
2. Instale a CLI: `npm i -g vercel`
3. Se o PowerShell disser que `npm.ps1` não pode ser carregado porque a execução de scripts está desabilitada, rode `Set-ExecutionPolicy -ExecutionPolicy RemoteSigned`, responda "S" e repita o passo 2 [24a:windows/f13].
4. Entre na conta: `vercel login` (o navegador abre; confirme lá).
5. Confira: `vercel whoami` mostra o nome da conta.
6. Sem instalar nada, `npx vercel` também funciona no lugar de `vercel`.
7. Resultado esperado: `vercel whoami` responde. Avise a IA ("pronto") e ela repete o passo que falhou.
