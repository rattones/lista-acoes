#!/bin/sh
# Certificado AUTOASSINADO para testes locais e CI (tarefa 006), com os mesmos nomes
# e caminho do certificado real da Let's Encrypt. Roda dentro do container
# certificado-teste (perfil "teste" do docker-compose.prod.yml):
#   docker compose -f infra/docker-compose.prod.yml --profile teste run --rm certificado-teste
# Nunca sobrescreve um certificado real (emitido pelo certbot).
set -eu

DOMINIO=listadecompras.net
DESTINO=/etc/letsencrypt/live/$DOMINIO

if [ -e "/etc/letsencrypt/renewal/$DOMINIO.conf" ]; then
  echo "Já existe um certificado da Let's Encrypt para $DOMINIO; nada a fazer." >&2
  exit 1
fi

mkdir -p "$DESTINO"
openssl req -x509 -nodes -newkey rsa:2048 -days 30 \
  -subj "/CN=$DOMINIO" \
  -addext "subjectAltName=DNS:$DOMINIO,DNS:www.$DOMINIO,DNS:app.$DOMINIO,DNS:api.$DOMINIO" \
  -keyout "$DESTINO/privkey.pem" -out "$DESTINO/fullchain.pem" 2>/dev/null

echo "Certificado autoassinado de teste gravado em $DESTINO (válido por 30 dias)."
