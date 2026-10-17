#!/usr/bin/env sh
# Deploy em PROD (tarefa 027). Uso, na VPS, na raiz do clone do repositório:
#   infra/scripts/deploy.sh
#
# 1. Confere infra/.env, backend/.env e agentes/.env e que não há alterações locais.
# 2. git pull --ff-only.
# 3. Marca as imagens em uso como :anterior (para o rollback).
# 4. Build das imagens novas. Se falhar, os containers em execução continuam.
# 5. Migrations com a imagem nova, num container avulso, antes de trocar os containers.
#    As migrations só avançam: o rollback volta o código, não o schema.
# 6. Sobe os containers novos (--wait: espera os healthchecks).
# 7. Confere a saúde da API em HTTPS. Se 6 ou 7 falharem, volta às imagens anteriores.
#
# Variáveis (para testes e casos especiais):
#   DEPLOY_SAUDE_URL   endereço da verificação (padrão: https://api.listadecompras.net/v1/health)
#   DEPLOY_TENTATIVAS  tentativas da verificação (padrão: 10)
#   DEPLOY_INTERVALO   segundos entre as tentativas (padrão: 6)
#   DEPLOY_RAIZ        raiz do repositório (padrão: a deste script)
set -eu

RAIZ="${DEPLOY_RAIZ:-$(cd "$(dirname "$0")/../.." && pwd)}"
SAUDE_URL="${DEPLOY_SAUDE_URL:-https://api.listadecompras.net/v1/health}"
TENTATIVAS="${DEPLOY_TENTATIVAS:-10}"
INTERVALO="${DEPLOY_INTERVALO:-6}"
COMPOSE="docker compose -f infra/docker-compose.prod.yml"
IMAGENS="lista-acoes-backend lista-acoes-frontend lista-acoes-agentes"

cd "$RAIZ"

for arquivo in infra/.env backend/.env agentes/.env; do
  if [ ! -f "$arquivo" ]; then
    echo "Falta $arquivo (veja o INSTALL.md, \"Primeira subida na VPS\")." >&2
    exit 1
  fi
done

if [ -n "$(git status --porcelain --untracked-files=no)" ]; then
  echo "Há alterações não commitadas no repositório da VPS; o deploy só aplica o que está no git." >&2
  git status --short --untracked-files=no >&2
  exit 1
fi

COMMIT_ANTERIOR="$(git rev-parse --short HEAD)"

echo "==> git pull"
git pull --ff-only
COMMIT_NOVO="$(git rev-parse --short HEAD)"

echo "==> Marcando as imagens em uso como :anterior"
TEM_ANTERIOR=1
for imagem in $IMAGENS; do
  if docker image inspect "$imagem:latest" > /dev/null 2>&1; then
    docker tag "$imagem:latest" "$imagem:anterior"
  else
    TEM_ANTERIOR=0
  fi
done
if [ "$TEM_ANTERIOR" = 0 ]; then
  echo "Sem imagens anteriores (primeiro deploy): não haverá rollback automático."
fi

echo "==> Build"
if ! $COMPOSE build; then
  echo "Build falhou: os containers em execução continuam com o commit $COMMIT_ANTERIOR." >&2
  exit 1
fi

echo "==> Migrations"
if ! $COMPOSE run --rm --no-deps backend node dist/database/cli.js migrate; then
  echo "Migrations falharam: os containers em execução continuam com o commit $COMMIT_ANTERIOR." >&2
  exit 1
fi

saudavel() {
  i=1
  while [ "$i" -le "$TENTATIVAS" ]; do
    if curl -fsS --max-time 10 "$SAUDE_URL" > /dev/null; then
      return 0
    fi
    sleep "$INTERVALO"
    i=$((i + 1))
  done
  return 1
}

reverter() {
  echo "$1" >&2
  if [ "$TEM_ANTERIOR" = 0 ]; then
    echo "Sem imagens anteriores para voltar. Veja: $COMPOSE logs" >&2
    exit 1
  fi
  echo "==> Voltando às imagens anteriores" >&2
  for imagem in $IMAGENS; do
    docker tag "$imagem:anterior" "$imagem:latest"
  done
  if $COMPOSE up -d --no-build --wait --wait-timeout 180; then
    echo "Containers de volta às imagens anteriores. O código da VPS está no commit $COMMIT_NOVO;" >&2
    echo "para alinhar: git checkout $COMMIT_ANTERIOR (e corrija antes do próximo deploy)." >&2
  else
    echo "O rollback falhou também. Veja: $COMPOSE ps e $COMPOSE logs" >&2
  fi
  exit 1
}

echo "==> Subindo os containers"
if ! $COMPOSE up -d --no-build --wait --wait-timeout 180; then
  reverter "Os containers novos não ficaram saudáveis."
fi

echo "==> Verificando $SAUDE_URL"
if ! saudavel; then
  reverter "A API não respondeu em $SAUDE_URL."
fi

echo "Deploy concluído: commit $COMMIT_NOVO (antes: $COMMIT_ANTERIOR)."
