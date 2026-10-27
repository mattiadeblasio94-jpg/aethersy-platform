#!/usr/bin/env bash
# 00-bootstrap.sh — Fase 1
# Scopo: preparazione base di un VPS Ubuntu 24.04 pulito.
# Prerequisiti: esecuzione come root (o via sudo).
# Effetto: aggiorna i pacchetti, imposta timezone, swap 2 GB, unattended-upgrades,
#          installa Docker Engine + Compose v2 dal repo ufficiale.
# Idempotente: puo' essere rieseguito senza danni.
set -euo pipefail

if [[ "${EUID}" -ne 0 ]]; then
  echo "ERRORE: esegui come root (sudo $0)" >&2
  exit 1
fi

echo "==> [1/7] Aggiornamento pacchetti"
export DEBIAN_FRONTEND=noninteractive
apt-get update -y
apt-get upgrade -y

echo "==> [2/7] Pacchetti base"
apt-get install -y \
  ca-certificates curl gnupg lsb-release jq git \
  ufw fail2ban unattended-upgrades apt-listchanges \
  htop ncdu

echo "==> [3/7] Timezone Europe/Rome"
timedatectl set-timezone Europe/Rome

echo "==> [4/7] Swap 2 GB (file)"
if [[ ! -f /swapfile ]]; then
  fallocate -l 2G /swapfile
  chmod 600 /swapfile
  mkswap /swapfile
  swapon /swapfile
  grep -q '/swapfile' /etc/fstab || echo '/swapfile none swap sw 0 0' >> /etc/fstab
  echo 'vm.swappiness=10' > /etc/sysctl.d/99-swappiness.conf
  sysctl -p /etc/sysctl.d/99-swappiness.conf
else
  echo "    /swapfile gia' presente, salto."
fi

echo "==> [5/7] Aggiornamenti di sicurezza automatici"
dpkg-reconfigure -f noninteractive unattended-upgrades || true

echo "==> [6/7] Docker Engine + Compose v2 (repo ufficiale)"
install -m 0755 -d /etc/apt/keyrings
if [[ ! -f /etc/apt/keyrings/docker.asc ]]; then
  curl -fsSL https://download.docker.com/linux/ubuntu/gpg -o /etc/apt/keyrings/docker.asc
  chmod a+r /etc/apt/keyrings/docker.asc
fi
echo \
  "deb [arch=$(dpkg --print-architecture) signed-by=/etc/apt/keyrings/docker.asc] https://download.docker.com/linux/ubuntu \
  $(. /etc/os-release && echo "${VERSION_CODENAME}") stable" \
  > /etc/apt/sources.list.d/docker.list
apt-get update -y
apt-get install -y docker-ce docker-ce-cli containerd.io docker-buildx-plugin docker-compose-plugin

echo "==> [7/7] Verifica"
systemctl enable --now docker
swapon --show || true
docker --version
docker compose version
docker run --rm hello-world >/dev/null && echo "    hello-world OK"

echo
echo "Bootstrap completato. Passo successivo: scripts/01-hardening.sh"
