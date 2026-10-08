# Vereditos de migration

Um veredito é o "de acordo" do auditor pra uma mudança no schema do banco.
Sem ele, a migration correspondente não pode entrar no cofre — o
`.githooks/pre-commit` bloqueia o commit.

Cada arquivo `.json` desta pasta é gerado pela skill `tecnologia-mudar-banco`
(`veredito.py gravar`), nunca escrito à mão.

## Contrato (9 chaves)

```json
{
  "migration": "0009_clientes.sql",
  "sha256": "1f2e3d4c5b6a7980...",
  "classe": "acrescenta",
  "achados": [],
  "resultado": "APPROVED",
  "revisor": "tecnologia-revisor-seguranca",
  "aprovado_por_dono": null,
  "nota": "RLS + GRANT conferidos; smoke prova o cenário do módulo.",
  "data": "2026-09-18"
}
```

`migration` é só o nome do arquivo. `classe` é `acrescenta` ou `destrutiva`.
`data` é AAAA-MM-DD.

## Regras

- Migration destrutiva só tem `APPROVED` com `aprovado_por_dono` no formato
  `<nome> em <AAAA-MM-DD>: <frase>`, com a palavra sim depois dos dois pontos.
- Mexeu no `.sql` depois do `APPROVED`? O sha muda e o commit trava de
  novo — é assim mesmo.
- Apagar um arquivo daqui não desfaz nada no banco: desfaz a autorização de
  commitar aquela migration.
