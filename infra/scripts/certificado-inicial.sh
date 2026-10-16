#!/usr/bin/env sh
# Emissão inicial do certificado da Let's Encrypt em PROD (tarefa 006).
# Uso, na raiz do repositório, na VPS:
#   infra/scripts/certificado-inicial.sh   (LETSENCRYPT_EMAIL no infra/.env ou no shell)
# LETSENCRYPT_STAGING=1 usa o ambiente de testes da Let's Encrypt (certificado
# não confiável, sem limite de emissões): bom para ensaiar.
#
# Pré-requisitos: DNS dos quatro nomes apontando para a VPS e porta 80 livre.
# O certbot sobe sozinho na porta 80 (--standalone) para o desafio HTTP-01, então
# o proxy é parado durante a emissão. Depois, a renovação é automática (serviço certbot).
set -eu

COMPOSE="docker compose -f infra/docker-compose.prod.yml"
DOMINIO=listadecompras.net

# LETSENCRYPT_EMAIL e LETSENCRYPT_STAGING podem vir do infra/.env (as do shell têm precedência).
if [ -f infra/.env ]; then
  EMAIL_SHELL="${LETSENCRYPT_EMAIL:-}"
  STAGING_SHELL="${LETSENCRYPT_STAGING:-}"
  set -a
  . infra/.env
  set +a
  LETSENCRYPT_EMAIL="${EMAIL_SHELL:-${LETSENCRYPT_EMAIL:-}}"
  LETSENCRYPT_STAGING="${STAGING_SHELL:-${LETSENCRYPT_STAGING:-0}}"
fi

if [ -z "${LETSENCRYPT_EMAIL:-}" ]; then
  echo "Defina LETSENCRYPT_EMAIL (e-mail para os avisos de vencimento da Let's Encrypt)." >&2
  exit 1
fi

STAGING=""
if [ "${LETSENCRYPT_STAGING:-0}" = "1" ]; then
  STAGING="--staging"
  echo "Usando o ambiente de testes (staging) da Let's Encrypt."
fi

# Remove o certificado autoassinado de teste, se houver: o certbot não emite em
# cima de uma pasta live/ que não é dele.
$COMPOSE run --rm --no-deps --entrypoint sh certbot -c "
  if [ ! -e /etc/letsencrypt/renewal/$DOMINIO.conf ]; then
    rm -rf /etc/letsencrypt/live/$DOMINIO
  fi"

RENOVACAO="/etc/letsencrypt/renewal/$DOMINIO.conf"
eh_staging() {
  $COMPOSE run --rm --no-deps --entrypoint sh certbot -c "grep -qs acme-staging $RENOVACAO"
}

# Emissão real sobre um certificado de staging (o ensaio): com os mesmos domínios, o certbot
# o manteria ("not yet due for renewal"). Ele é apagado para emitir o de produção.
if [ -z "$STAGING" ] && eh_staging; then
  echo "Apagando o certificado de testes (staging) para emitir o de produção."
  $COMPOSE run --rm --no-deps --entrypoint certbot certbot delete --non-interactive --cert-name "$DOMINIO"
fi

$COMPOSE stop proxy

if ! $COMPOSE run --rm --no-deps -p 80:80 --entrypoint certbot certbot \
  certonly --standalone --non-interactive --agree-tos \
  --email "$LETSENCRYPT_EMAIL" $STAGING \
  --cert-name "$DOMINIO" \
  -d "$DOMINIO" -d "www.$DOMINIO" -d "app.$DOMINIO" -d "api.$DOMINIO"; then
  echo "A emissão falhou. Subindo a stack de novo; veja: $COMPOSE logs certbot" >&2
  $COMPOSE up -d --wait || true
  exit 1
fi

$COMPOSE up -d --wait

if [ -z "$STAGING" ] && eh_staging; then
  echo "O certificado ainda é de testes (staging): a emissão real não aconteceu." >&2
  exit 1
fi
echo "Certificado emitido. Verifique com: npm run verifica:https"
