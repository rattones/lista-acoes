#!/usr/bin/env sh
# Destaques da landing (tarefa 034). Uso, na VPS, na raiz do clone (cron diário às 06:00):
#   infra/scripts/destaques.sh
# Gera o trecho com os 5 ativos de maior nota da execução anterior a hoje (D-1) no volume
# "destaques", que o Nginx da landing inclui por SSI. Sem execução, o trecho fica vazio.
set -eu

RAIZ="${DESTAQUES_RAIZ:-$(cd "$(dirname "$0")/../.." && pwd)}"
cd "$RAIZ"

docker compose -f infra/docker-compose.prod.yml run --rm --no-deps backend node dist/database/cli.js destaques /app/destaques
