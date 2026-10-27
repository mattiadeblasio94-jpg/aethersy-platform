#!/usr/bin/env bash
# 01-hardening.sh — Fase 1
# Scopo: creare l'utente `deploy`, chiudere SSH e attivare firewall + fail2ban.
# Prerequisiti: 00-bootstrap.sh eseguito; la tua chiave pubblica SSH pronta.
#   Uso: sudo ./01-hardening.sh "ssh-ed25519 AAAA... utente@macchina"
# Effetto: utente deploy con sudo, PasswordAuthentication no, PermitRootLogin no,
#          ufw default deny (allow 22/80/443), fail2ban jail sshd.
set -euo pipefail

PUBKEY="${1:-}"
DEPLOY_USER="deploy"

if [[ "${EUID}" -ne 0 ]]; then
  echo "ERRORE: esegui come root (sudo $0 \"ssh-ed25519 AAAA... comment\")" >&2
  exit 1
fi

if [[ -z "${PUBKEY}" ]]; then
  echo "ERRORE: manca la chiave pubblica SSH come primo argomento." >&2
  echo "Uso: sudo $0 \"ssh-ed25519 AAAA... utente@macchina\"" >&2
  exit 1
fi

echo "==> [1/6] Utente ${DEPLOY_USER}"
if ! id -u "${DEPLOY_USER}" >/dev/null 2>&1; then
  adduser --disabled-password --gecos "" "${DEPLOY_USER}"
fi
usermod -aG sudo "${DEPLOY_USER}"
# Membro del gruppo docker: gli script (backup.sh, 04-smoke-test.sh) invocano
# `docker compose` senza sudo. Il gruppo esiste dopo 00-bootstrap.sh.
if getent group docker >/dev/null 2>&1; then
  usermod -aG docker "${DEPLOY_USER}"
fi
# sudo senza password per l'utente di deploy (chiave SSH gia' protetta).
echo "${DEPLOY_USER} ALL=(ALL) NOPASSWD:ALL" > "/etc/sudoers.d/90-${DEPLOY_USER}"
chmod 440 "/etc/sudoers.d/90-${DEPLOY_USER}"

echo "==> [2/6] Chiave pubblica SSH"
install -d -m 700 -o "${DEPLOY_USER}" -g "${DEPLOY_USER}" "/home/${DEPLOY_USER}/.ssh"
AUTH_KEYS="/home/${DEPLOY_USER}/.ssh/authorized_keys"
touch "${AUTH_KEYS}"
grep -qF "${PUBKEY}" "${AUTH_KEYS}" || echo "${PUBKEY}" >> "${AUTH_KEYS}"
chmod 600 "${AUTH_KEYS}"
chown "${DEPLOY_USER}:${DEPLOY_USER}" "${AUTH_KEYS}"

echo "==> [3/6] Hardening SSH"
SSHD_CONF="/etc/ssh/sshd_config.d/99-hardening.conf"
cat > "${SSHD_CONF}" <<'EOF'
PermitRootLogin no
PasswordAuthentication no
PubkeyAuthentication yes
ChallengeResponseAuthentication no
KbdInteractiveAuthentication no
X11Forwarding no
MaxAuthTries 3
ClientAliveInterval 300
ClientAliveCountMax 2
EOF

# Verifica la config prima di ricaricare: un errore qui chiude fuori tutti.
if ! sshd -t; then
  echo "ERRORE: configurazione sshd non valida, ripristino." >&2
  rm -f "${SSHD_CONF}"
  exit 1
fi

echo "==> [4/6] Firewall (ufw)"
ufw default deny incoming
ufw default allow outgoing
ufw allow 22/tcp   comment 'SSH'
ufw allow 80/tcp   comment 'HTTP'
ufw allow 443/tcp  comment 'HTTPS'
ufw --force enable

echo "==> [5/6] fail2ban (jail sshd)"
cat > /etc/fail2ban/jail.d/sshd.local <<'EOF'
[sshd]
enabled = true
port    = ssh
maxretry = 5
findtime = 10m
bantime  = 1h
EOF
systemctl enable --now fail2ban
systemctl restart fail2ban

echo "==> [6/6] Verifica"
ufw status verbose
systemctl is-active fail2ban

echo
echo "Hardening completato."
echo "IMPORTANTE: da un'altra sessione verifica 'ssh ${DEPLOY_USER}@<IP>' PRIMA di chiudere questa shell."
