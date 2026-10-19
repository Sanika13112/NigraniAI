#!/usr/bin/env bash
# Prints fresh values for JWT_SECRET, INTERNAL_API_KEY and ADMIN_PASSWORD.
set -euo pipefail
echo "JWT_SECRET=$(openssl rand -base64 48 | tr -d '\n')"
echo "INTERNAL_API_KEY=$(openssl rand -hex 24)"
echo "ADMIN_PASSWORD=$(openssl rand -base64 18 | tr -d '\n/+=')A1"
