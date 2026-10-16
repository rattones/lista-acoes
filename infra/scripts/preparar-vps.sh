#!/usr/bin/env sh
# Preparação da VPS de PROD (tarefa 027): AlmaLinux 9, como root. Idempotente.
#   sh preparar-vps.sh        (SSH_PORTA=22022 e USUARIO=deploy por padrão)
#
# 1. git e firewalld; Docker CE + Compose, só se o Compose ainda não existir.
# 2. Usuário de deploy (sem senha) no grupo docker, com as chaves autorizadas do root.
#    Atenção: o grupo docker equivale a root no host; o usuário existe para o deploy não
#    usar a conta root, não como barreira de segurança.
# 3. firewalld: só a porta do SSH, HTTP e HTTPS. A porta do SSH é liberada antes de
#    qualquer remoção e da recarga, para a sessão atual não cair.
set -eu

SSH_PORTA="${SSH_PORTA:-22022}"
USUARIO="${USUARIO:-deploy}"
CHAVES_ROOT="${CHAVES_ROOT:-/root/.ssh/authorized_keys}"

if [ "$(id -u)" != "0" ]; then
  echo "Rode como root (sudo sh $0)." >&2
  exit 1
fi

echo "==> Pacotes"
dnf -y install git firewalld

if docker compose version > /dev/null 2>&1; then
  echo "Docker e Compose já instalados."
else
  echo "==> Docker CE"
  dnf -y install dnf-plugins-core
  dnf config-manager --add-repo https://download.docker.com/linux/rhel/docker-ce.repo
  dnf -y install docker-ce docker-ce-cli containerd.io docker-buildx-plugin docker-compose-plugin
fi
systemctl enable --now docker

echo "==> Usuário $USUARIO"
if getent passwd "$USUARIO" > /dev/null; then
  echo "Usuário $USUARIO já existe."
else
  useradd -m -s /bin/bash "$USUARIO"
fi
usermod -aG docker "$USUARIO"
if [ -f "$CHAVES_ROOT" ]; then
  install -d -m 700 -o "$USUARIO" -g "$USUARIO" "/home/$USUARIO/.ssh"
  install -m 600 -o "$USUARIO" -g "$USUARIO" "$CHAVES_ROOT" "/home/$USUARIO/.ssh/authorized_keys"
  echo "Chaves autorizadas do root copiadas para $USUARIO."
else
  echo "Sem $CHAVES_ROOT: rode antes o configurar-ssh.sh na sua máquina." >&2
fi

echo "==> Firewall (SSH $SSH_PORTA, HTTP e HTTPS)"
systemctl enable --now firewalld
firewall-cmd --permanent --add-port="$SSH_PORTA/tcp"
firewall-cmd --permanent --add-service=http
firewall-cmd --permanent --add-service=https
if [ "$SSH_PORTA" != "22" ]; then
  firewall-cmd --permanent --remove-service=ssh || true
fi
firewall-cmd --reload

echo "VPS pronta. Próximo passo: entrar como $USUARIO e clonar o repositório (INSTALL.md)."
