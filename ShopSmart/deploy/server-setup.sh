#!/usr/bin/env bash
# One-time setup of a fresh Ubuntu 24.04 server (AWS EC2) for ShopSmart.
#   bash deploy/server-setup.sh
set -euo pipefail

echo "== Installing Docker =="
if ! command -v docker >/dev/null 2>&1; then
  sudo apt-get update -y
  sudo apt-get install -y ca-certificates curl unzip
  sudo install -m 0755 -d /etc/apt/keyrings
  sudo curl -fsSL https://download.docker.com/linux/ubuntu/gpg -o /etc/apt/keyrings/docker.asc
  sudo chmod a+r /etc/apt/keyrings/docker.asc
  echo "deb [arch=$(dpkg --print-architecture) signed-by=/etc/apt/keyrings/docker.asc] https://download.docker.com/linux/ubuntu $(. /etc/os-release && echo "$VERSION_CODENAME") stable" \
    | sudo tee /etc/apt/sources.list.d/docker.list >/dev/null
  sudo apt-get update -y
  sudo apt-get install -y docker-ce docker-ce-cli containerd.io docker-buildx-plugin docker-compose-plugin
  sudo usermod -aG docker "$USER"
fi

echo "== Adding 4 GB of swap (protects the server while the 9 services build and start) =="
if ! swapon --show | grep -q /swapfile; then
  sudo fallocate -l 4G /swapfile
  sudo chmod 600 /swapfile
  sudo mkswap /swapfile
  sudo swapon /swapfile
  echo '/swapfile none swap sw 0 0' | sudo tee -a /etc/fstab >/dev/null
fi

echo "== Opening ports 80 and 443 in the server firewall (needed on Oracle Cloud images) =="
if sudo iptables -L INPUT -n 2>/dev/null | grep -q "REJECT"; then
  for port in 443 80; do
    sudo iptables -C INPUT -p tcp --dport $port -m state --state NEW -j ACCEPT 2>/dev/null \
      || sudo iptables -I INPUT 5 -p tcp --dport $port -m state --state NEW -j ACCEPT
  done
  sudo DEBIAN_FRONTEND=noninteractive apt-get install -y iptables-persistent >/dev/null
  sudo netfilter-persistent save
fi

echo "== Automatic security updates =="
sudo apt-get install -y unattended-upgrades >/dev/null
sudo timedatectl set-timezone Asia/Kolkata || true

echo
echo "Done. Log out (type: exit) and log in again so Docker works without sudo."
