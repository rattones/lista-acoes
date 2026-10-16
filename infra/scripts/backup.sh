#!/usr/bin/env sh
# Backup semanal do SQLite de PROD (tarefa 028). Roda na VPS, como deploy (cron):
#   infra/scripts/backup.sh
#
# 1. O CLI do banco grava, dentro do container, uma cópia consistente com a API no ar
#    (API online do SQLite) e confere a integridade (PRAGMA integrity_check).
# 2. A cópia é trazida para $BACKUP_DIR, compactada (gzip) e ganha um .sha256.
# 3. Retenção: ficam as $BACKUP_MANTER cópias mais recentes (pela data no nome).
# 4. Cada execução vai para $BACKUP_DIR/backup.log.
# A cópia externa é puxada pelo casa-ratton (puxar-backup.sh).
#
# Variáveis: BACKUP_DIR (padrão ~/backups), BACKUP_MANTER (padrão 8, ~2 meses),
# BACKUP_RAIZ (raiz do repositório; padrão: a deste script), BACKUP_DATA (testes).
set -eu

RAIZ="${BACKUP_RAIZ:-$(cd "$(dirname "$0")/../.." && pwd)}"
DIR="${BACKUP_DIR:-$HOME/backups}"
MANTER="${BACKUP_MANTER:-8}"
DATA="${BACKUP_DATA:-$(date +%Y-%m-%d_%H%M)}"
NOME="monitor-$DATA.db"
COMPOSE="docker compose -f infra/docker-compose.prod.yml"

mkdir -p "$DIR"
chmod 700 "$DIR"
registrar() {
  echo "$(date '+%Y-%m-%d %H:%M:%S') $*" >> "$DIR/backup.log"
}

falhou() {
  rm -f "$DIR/$NOME" "$DIR/$NOME.gz" "$DIR/$NOME.gz.sha256"
  registrar "falhou $NOME: $1"
  echo "Backup falhou: $1" >&2
  exit 1
}

cd "$RAIZ"

$COMPOSE exec -T backend node dist/database/cli.js backup "data/backups/$NOME" \
  || falhou "backup ou verificação de integridade"
$COMPOSE cp "backend:/app/backend/data/backups/$NOME" "$DIR/$NOME" \
  || falhou "cópia para fora do container"
$COMPOSE exec -T backend rm -f "data/backups/$NOME" || true

gzip -9 "$DIR/$NOME" || falhou "compactação"
(cd "$DIR" && sha256sum "$NOME.gz" > "$NOME.gz.sha256") || falhou "checksum"

# Retenção: o nome tem a data (AAAA-MM-DD_HHMM), então a ordem alfabética é a cronológica.
(cd "$DIR" && ls -1 monitor-*.db.gz 2> /dev/null | sort -r | tail -n +"$((MANTER + 1))") |
  while read -r antigo; do
    rm -f "$DIR/$antigo" "$DIR/$antigo.sha256"
    registrar "removido $antigo (retenção de $MANTER)"
  done

TAMANHO="$(wc -c < "$DIR/$NOME.gz" | tr -d ' ')"
registrar "ok $NOME.gz ($TAMANHO bytes)"
echo "Backup gravado: $DIR/$NOME.gz"
