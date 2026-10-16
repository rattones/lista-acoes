#!/usr/bin/env sh
# Restauração de um backup do SQLite em PROD (tarefa 028). Na VPS, como deploy:
#   infra/scripts/restaurar-backup.sh ~/backups/monitor-AAAA-MM-DD_HHMM.db.gz          # só confere
#   infra/scripts/restaurar-backup.sh ~/backups/monitor-AAAA-MM-DD_HHMM.db.gz --sim    # restaura
#
# 1. Confere o .sha256 (se houver) e a integridade da cópia, sem tocar no banco.
# 2. Sem --sim, para aqui. Com --sim:
# 3. Guarda o banco atual em data/backups/antes-da-restauracao-<data>.db (no volume).
# 4. Para a API, troca o arquivo (removendo -wal e -shm, que são do banco antigo) com o
#    usuário da imagem, para o dono do arquivo continuar certo, e sobe a API (--wait).
# A API fica fora do ar por alguns segundos; o app e a landing continuam.
#
# Variáveis: RESTAURAR_RAIZ (raiz do repositório), RESTAURAR_DATA (testes).
set -eu

ARQUIVO="${1:-}"
CONFIRMA="${2:-}"
RAIZ="${RESTAURAR_RAIZ:-$(cd "$(dirname "$0")/../.." && pwd)}"
DATA="${RESTAURAR_DATA:-$(date +%Y-%m-%d_%H%M)}"
COMPOSE="docker compose -f infra/docker-compose.prod.yml"

if [ -z "$ARQUIVO" ] || [ ! -f "$ARQUIVO" ]; then
  echo "Uso: $0 <backup monitor-*.db.gz> [--sim]" >&2
  exit 1
fi

PASTA="$(cd "$(dirname "$ARQUIVO")" && pwd)"
BASE="$(basename "$ARQUIVO")"
NOME="${BASE%.gz}"
ANTES="data/backups/antes-da-restauracao-$DATA.db"

if [ -f "$PASTA/$BASE.sha256" ]; then
  if ! (cd "$PASTA" && sha256sum -c --quiet "$BASE.sha256" > /dev/null 2>&1); then
    echo "O checksum de $BASE não confere: cópia corrompida ou incompleta. Nada foi alterado." >&2
    exit 1
  fi
else
  echo "Aviso: sem $BASE.sha256; seguindo só com a verificação de integridade."
fi

if [ "$NOME" != "$BASE" ]; then
  gunzip -kf "$ARQUIVO"
  trap 'rm -f "$PASTA/$NOME"' EXIT
fi

cd "$RAIZ"
COPIA="$COMPOSE run --rm --no-deps -v $PASTA:/restaurar:ro backend"

echo "==> Conferindo $NOME"
if ! $COPIA node dist/database/cli.js verificar "/restaurar/$NOME"; then
  echo "A cópia não passou na verificação de integridade. Nada foi alterado." >&2
  exit 1
fi

if [ "$CONFIRMA" != "--sim" ]; then
  echo "Cópia conferida. Para restaurar (a API fica fora por alguns segundos): $0 $ARQUIVO --sim"
  exit 0
fi

echo "==> Guardando o banco atual em $ANTES"
$COMPOSE exec -T backend node dist/database/cli.js backup "$ANTES"

echo "==> Restaurando"
$COMPOSE stop backend
$COPIA sh -c "rm -f data/monitor.db-wal data/monitor.db-shm && cp /restaurar/$NOME data/monitor.db"

if ! $COMPOSE up -d --no-build --wait backend; then
  echo "A API não subiu com o banco restaurado. O banco anterior está em $ANTES (no volume)." >&2
  echo "Para voltar: $COMPOSE run --rm --no-deps backend sh -c 'rm -f data/monitor.db-wal data/monitor.db-shm && cp $ANTES data/monitor.db' e $COMPOSE up -d backend" >&2
  exit 1
fi

echo "Restaurado: $NOME. O banco anterior ficou em $ANTES (no volume dados)."
