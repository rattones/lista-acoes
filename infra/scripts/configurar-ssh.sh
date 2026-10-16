#!/usr/bin/env sh
# Acesso à VPS pela chave SSH, sem senha (tarefa 027). Roda na sua máquina:
#   infra/scripts/configurar-ssh.sh <host> [--so-chave]
#
# 1. Gera a chave ed25519 ~/.ssh/lista-acoes-vps, se ainda não existir.
# 2. Instala a chave pública na VPS (ssh-copy-id pede a senha de root uma última vez).
# 3. Testa o login só pela chave (BatchMode: sem senha).
# 4. Com --so-chave, e só se o teste passou: desliga o login por senha no sshd
#    (o root continua entrando, mas só com chave), valida a configuração e recarrega.
#
# Variáveis: SSH_PORTA (padrão 22022), SSH_USUARIO (padrão root), SSH_CHAVE.
set -eu

HOST="${1:-}"
OPCAO="${2:-}"
PORTA="${SSH_PORTA:-22022}"
USUARIO="${SSH_USUARIO:-root}"
CHAVE="${SSH_CHAVE:-$HOME/.ssh/lista-acoes-vps}"

if [ -z "$HOST" ]; then
  echo "Uso: $0 <host> [--so-chave]   (ex.: $0 129.121.39.182)" >&2
  exit 1
fi

if [ -f "$CHAVE" ]; then
  echo "Usando a chave existente $CHAVE."
else
  echo "==> Gerando a chave $CHAVE"
  mkdir -p "$(dirname "$CHAVE")"
  ssh-keygen -t ed25519 -a 100 -f "$CHAVE" -C "lista-acoes-vps"
fi

echo "==> Instalando a chave pública em $USUARIO@$HOST:$PORTA (pede a senha)"
ssh-copy-id -i "$CHAVE.pub" -p "$PORTA" "$USUARIO@$HOST"

SSH="ssh -i $CHAVE -p $PORTA -o BatchMode=yes -o IdentitiesOnly=yes $USUARIO@$HOST"

echo "==> Testando o login só pela chave"
if ! $SSH true; then
  echo "O login pela chave não funcionou; nada foi alterado no sshd." >&2
  exit 1
fi
echo "Login pela chave funcionando."

if [ "$OPCAO" = "--so-chave" ]; then
  echo "==> Desligando o login por senha no sshd"
  # Arquivo próprio em sshd_config.d (lido antes do resto no AlmaLinux 9); valida antes
  # de recarregar, para um erro de sintaxe não derrubar o SSH.
  $SSH "printf 'PasswordAuthentication no\nKbdInteractiveAuthentication no\nPermitRootLogin prohibit-password\n' > /etc/ssh/sshd_config.d/00-lista-acoes.conf && sshd -t && systemctl reload sshd"
  echo "Login por senha desligado. Mantenha esta sessão de teste aberta e confira um novo login antes de sair."
fi

cat <<EOF

Para entrar: ssh -i $CHAVE -p $PORTA $USUARIO@$HOST
Ou, no ~/.ssh/config:
  Host lista-acoes-vps
    HostName $HOST
    Port $PORTA
    User $USUARIO
    IdentityFile $CHAVE
    IdentitiesOnly yes
EOF
