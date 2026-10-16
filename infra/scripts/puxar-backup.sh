#!/usr/bin/env sh
# Cópia externa dos backups de PROD (tarefa 028). Roda no casa-ratton (cron), puxando da VPS:
#   infra/scripts/puxar-backup.sh
#
# Usa a chave dedicada ~/.ssh/lista-acoes-backup, que na VPS só pode ler a pasta de
# backups (rrsync -ro). Se a VPS for invadida, o atacante não alcança esta cópia.
# Traz só monitor-*.db.gz e os .sha256, confere os checksums e mantém as
# $BACKUP_MANTER_EXTERNO cópias mais recentes (padrão 26, ~6 meses).
#
# Variáveis: BACKUP_ORIGEM (padrão deploy@129.121.39.182), BACKUP_PORTA (22022),
# BACKUP_CHAVE, BACKUP_DESTINO (padrão ~/backups/lista-acoes), BACKUP_MANTER_EXTERNO.
set -eu

ORIGEM="${BACKUP_ORIGEM:-deploy@129.121.39.182}"
PORTA="${BACKUP_PORTA:-22022}"
CHAVE="${BACKUP_CHAVE:-$HOME/.ssh/lista-acoes-backup}"
DESTINO="${BACKUP_DESTINO:-$HOME/backups/lista-acoes}"
MANTER="${BACKUP_MANTER_EXTERNO:-26}"

mkdir -p "$DESTINO"
chmod 700 "$DESTINO"
registrar() {
  echo "$(date '+%Y-%m-%d %H:%M:%S') $*" >> "$DESTINO/puxar.log"
}

# Com o rrsync na VPS, o caminho remoto é relativo à pasta de backups.
if ! rsync -a '--include=monitor-*.db.gz' '--include=monitor-*.db.gz.sha256' '--exclude=*' \
  -e "ssh -i $CHAVE -p $PORTA -o BatchMode=yes -o IdentitiesOnly=yes" \
  "$ORIGEM:./" "$DESTINO/"; then
  registrar "falhou: rsync"
  echo "Falha ao puxar os backups de $ORIGEM." >&2
  exit 1
fi

cd "$DESTINO"
for soma in monitor-*.db.gz.sha256; do
  [ -e "$soma" ] || continue
  if ! sha256sum -c --quiet "$soma" > /dev/null 2>&1; then
    registrar "falhou: checksum de ${soma%.sha256} não confere"
    echo "O checksum de ${soma%.sha256} não confere: cópia corrompida ou incompleta." >&2
    exit 1
  fi
done

ls -1 monitor-*.db.gz 2> /dev/null | sort -r | tail -n +"$((MANTER + 1))" |
  while read -r antigo; do
    rm -f "$antigo" "$antigo.sha256"
  done

TOTAL="$(ls -1 monitor-*.db.gz 2> /dev/null | wc -l | tr -d ' ')"
registrar "ok $TOTAL cópia(s) em $DESTINO"
echo "Backups conferidos: $TOTAL cópia(s) em $DESTINO"
