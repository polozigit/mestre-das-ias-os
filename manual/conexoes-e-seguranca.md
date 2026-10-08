# Conexões e segurança

Ordem dos 3 caminhos, sempre nesta prioridade: primeiro MCP remoto oficial com OAuth (Supabase, Vercel), depois `gh` pro GitHub, e chave de API só em último caso. O dono conecta Supabase e Vercel no app desktop do ChatGPT, aba de plugins, botão `+`. Nem todo plugin pede login nesse momento — alguns autenticam na instalação, outros só no primeiro uso [24a:plugins/n28]: não pediu login agora? **Não é falha, não reinstale** — use o plugin normalmente e autorize quando a tela pedir, no primeiro uso. Quando pedir, é login na tela do app (Sign in with ChatGPT, se aparecer na sua conta — é rollout em beta; senão, siga o OAuth normal do plugin) [24a:conectores_mcp/f06, n28] — o MCP é GLOBAL, mora na sua máquina (`~/.codex/config.toml`); a Casa só registra e prova. Travou no app? `codex mcp add <id> --url <url>` e `codex mcp login <id>` no terminal, como diagnóstico. Máquina nova não herda o MCP — a Casa volta do GitHub, a conexão não: repita o gesto e rode a prova de novo.

## Registrar uma conexão

Registre em `credenciais/CONEXOES.md` somente:

- serviço;
- para que serve;
- tipo (plugin do app, MCP global, login navegador ou chave de API);
- nome da variável de ambiente, quando existir;
- prova (o comando que provou a conexão);
- data em que foi conectado.

Nunca registre o valor de senha, token, chave, cookie ou credencial. Segredos devem permanecer no serviço autorizado, gerenciador de segredos ou ambiente seguro do sistema que executa a integração.

O token do `gh` fica no cofre de credenciais do sistema; numa máquina sem esse cofre, ele grava o token num arquivo de texto puro — pra saber onde o seu ficou, rode `gh auth status`; nunca force o armazenamento inseguro da CLI.

Cada MCP ligado soma contexto em toda mensagem e gasta cota — ligue só o que usa; esse custo foi aceito em troca da simplicidade de ter a conexão valendo pra qualquer pasta (D24-18). Desinstalar o plugin não desconecta o conector sozinho — isso se resolve no gerenciamento de conectores do ChatGPT.

Se uma credencial aparecer em conversa ou arquivo, interrompa o uso, avise que ela deve ser revogada e substituída e não a reproduza novamente.

Integrações com código, banco, site ou automação devem ter uma especificação em `sistemas/<nome>/`. O registro descreve finalidade, dados, permissões, falhas e operação, mas não contém segredos.

## O MCP que a vigília usa

A `tecnologia-vigiar` lê os alertas do banco pelo MCP da Supabase (a ferramenta
`get_advisors`); o padrão exigido dessa conexão é: `read_only` ligado, `project_ref` só do seu
projeto (nunca "todos os projetos"), e `features` no mínimo que a vigília
precisa; o schema `vault` fica FORA da conexão.

Isso NÃO entra no `.codex/config.toml` do modelo — o mesmo motivo já vale
aqui: o dono conecta pelo app desktop, aba de plugins, botão `+`; é o
próprio ChatGPT que guarda o estado ligado/desligado em
`~/.codex/config.toml` [24a:plugins/n18]; a IA PROVA a conexão, nunca
escreve config; e cada MCP ligado pesa em toda mensagem [24a:plugins/f12].

Fallback escrito, só se travar no app: `codex mcp add <id> --url <url>`
[24a:conectores_mcp/n12] ou um bloco `[mcp_servers.<id>]` com `url` no
config da Casa [24a:conectores_mcp/f01] — e só com a pasta confiada
[24a:config/f2, conectores_mcp/n14]. O servidor da Supabase é
remoto/OAuth (`https://mcp.supabase.com/mcp`), não stdio
[24a:conectores_mcp/f11, f13].

Os três parâmetros existem com esses nomes na doc oficial, como query
string do endereço remoto [24a:supabase/n60]: `read_only=true` ("Execute
all queries as a read-only Postgres user"), `project_ref=<id>` ("Scope to
a specific project (disables account tools)") e `features=<groups>`
("Enable only specific tool groups"). O mínimo que a vigília precisa é o
grupo `debugging` — é onde moram `get_advisors` e `query_logs`
[24a:supabase/n61]:

```
https://mcp.supabase.com/mcp?project_ref=<ref>&read_only=true&features=debugging
```

Deixar `database` de FORA não é detalhe: é o grupo do `execute_sql`, a
única ferramenta dessa lista que alcançaria uma view do `vault`. A doc
publica exemplo com dois parâmetros juntos, não com os três — a linha
acima é montagem nossa a partir de parâmetros documentados um a um
[24a:supabase/n60]. Se a tela de conexão do app mostrar outra coisa, vale
a tela: copie o que ela der, nunca invente parâmetro novo.

Nada disso TRANCA o cofre: o que existe de verdade é a função
`public.segredo(text)` restrita ao `service_role` + este MCP sem o schema
`vault` + a regra do guarda que nega `decrypted_secrets`
[24a:supabase/n56].
