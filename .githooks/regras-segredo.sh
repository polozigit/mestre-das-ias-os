# Regras de segredo da Empresa IA, num lugar só.
# Não roda sozinho: o pre-commit e o pre-push fazem `. regras-segredo.sh`.
# Só usa o que há em todo git (sh, grep, sed): funciona no Mac e no Git Bash do
# Windows. O .gitleaks.toml (varredura do GitHub) espelha o padrão de chave daqui.

# --- 1. Padrão de chave/segredo (grep -E) -----------------------------------
# Uma alternativa por tipo de chave. O sk- exige que nada alfanumérico venha
# antes: sem isso "risk-management" e "task-planning" viravam chave. Mexeu aqui? Mexa também no .gitleaks.toml.
PADRAO_SEGREDO='((^|[^A-Za-z0-9])sk-[A-Za-z0-9]{8,}|ghp_[A-Za-z0-9]{8,}|sb_secret_[A-Za-z0-9]|AKIA[0-9A-Z]{12,}|-----BEGIN [A-Z ]*PRIVATE KEY|sk_live_[A-Za-z0-9]{8,}|github_pat_[A-Za-z0-9_]{20,}|xox[baprs]-[A-Za-z0-9-]{10,}|AIza[0-9A-Za-z_-]{35}|sk-(proj|ant|svcacct|admin)-[A-Za-z0-9_-]{20,})'

# Lê o texto no stdin; sai 0 se tem padrão de chave.
texto_tem_segredo() {
  grep -aqE "$PADRAO_SEGREDO"
}

# --- 2. Caminhos que nunca entram no git ------------------------------------
_minusculas() {
  printf '%s\n' "$1" | sed 'y/ABCDEFGHIJKLMNOPQRSTUVWXYZ/abcdefghijklmnopqrstuvwxyz/'
}

# caminho_proibido <caminho relativo>: sai 0 se o arquivo não pode ir pro git.
#   - credenciais/: só os .md (catálogo) passam; o resto é valor de chave
#   - .env, .env.*, *.env (o modelo de variáveis sem valor passa)
#   - *.pem, *.key, *.p12, *.pfx, id_rsa*, id_ed25519* (menos a chave pública .pub)
#   - operacao/backups/ (dado real de cliente), *.dump, *.pgdump
caminho_proibido() {
  case "$1" in
    *[A-Z]*) _cp_baixo=$(_minusculas "$1") ;;
    *) _cp_baixo=$1 ;;
  esac
  _cp_nome=${_cp_baixo##*/}
  _cp_x="/$_cp_baixo"
  case "$_cp_x" in
    */credenciais/*)
      _cp_resto=${_cp_x#*/credenciais/}
      case "$_cp_resto" in
        */*) return 0 ;;
        *.md) ;;
        *) return 0 ;;
      esac
      ;;
    */operacao/backups/*) return 0 ;;
  esac
  case "$_cp_nome" in
    .env.exampl[e]) ;;
    .env|.env.*|*.env) return 0 ;;
    *.pem|*.key|*.p12|*.pfx) return 0 ;;
    *.pub) ;;
    id_rsa*|id_ed25519*) return 0 ;;
    *.dump|*.pgdump) return 0 ;;
  esac
  return 1
}

# --- 3. Dado pessoal em massa -----------------------------------------------
# Um arquivo com 20 ou mais e-mails distintos, ou 20 ou mais CPFs distintos, é
# lista de clientes (dump), não texto da empresa. E-mail de exemplo não conta.
LIMITE_DADO_PESSOAL=20

# Lê no stdin uma ocorrência por linha; sai 0 se há LIMITE ou mais distintas.
_distintos_atingem_limite() {
  _dl_lista="|"
  _dl_n=0
  _dl_lidas=0
  while IFS= read -r _dl_item; do
    _dl_lidas=$((_dl_lidas + 1))
    [ "$_dl_lidas" -gt 50000 ] && return 1
    case "$_dl_lista" in
      *"|$_dl_item|"*) ;;
      *)
        _dl_lista="$_dl_lista$_dl_item|"
        _dl_n=$((_dl_n + 1))
        [ "$_dl_n" -ge "$LIMITE_DADO_PESSOAL" ] && return 0
        ;;
    esac
  done
  return 1
}

# texto_tem_dado_pessoal_em_massa <objeto do git>: ex. ":caminho" (índice) ou
# "<sha>:caminho" (commit). Sai 0 se o conteúdo parece lista de pessoas.
texto_tem_dado_pessoal_em_massa() {
  # Porta barata: quase todo arquivo não tem "@" nem CPF, e aí não vale abrir
  # o resto do cano (cada passo é um processo a mais por arquivo).
  git show "$1" 2>/dev/null | grep -aqE '@|[0-9]{3}\.[0-9]{3}\.[0-9]{3}-[0-9]{2}' || return 1
  if git show "$1" 2>/dev/null \
    | grep -aoE '[A-Za-z0-9._%+-]+@[A-Za-z0-9.-]+\.[A-Za-z]{2,}' \
    | grep -viE '@([a-z0-9-]+\.)*example\.(com|org|net)$|\.(test|invalid|local)$|exemplo' \
    | sed 'y/ABCDEFGHIJKLMNOPQRSTUVWXYZ/abcdefghijklmnopqrstuvwxyz/' \
    | _distintos_atingem_limite; then
    return 0
  fi
  if git show "$1" 2>/dev/null \
    | grep -aoE '[0-9]{3}\.[0-9]{3}\.[0-9]{3}-[0-9]{2}' \
    | _distintos_atingem_limite; then
    return 0
  fi
  return 1
}
