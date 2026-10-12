#!/usr/bin/env sh
# Abre no ufw as portas do ambiente DEV (tarefa 004): API 3000, app 8080, landing 8081.
# Uso: sudo infra/scripts/firewall-dev.sh
# Pode ser executado mais de uma vez: o ufw ignora regras já existentes.
set -eu

if [ "$(id -u)" -ne 0 ]; then
  echo "Execute com sudo: sudo $0" >&2
  exit 1
fi

for porta in 3000 8080 8081; do
  ufw allow "$porta/tcp" comment 'lista-acoes DEV'
done

ufw status | grep -E '^(Status|To|--)|lista-acoes DEV'
