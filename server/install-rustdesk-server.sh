#!/usr/bin/env bash
# Run on the BBB server as root. Installs/starts the RustDesk server in /opt/rustdesk,
# opens its ports in UFW, and prints the public key.
set -euo pipefail
DIR=/opt/rustdesk
SRC="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
mkdir -p "$DIR/data"
cp "$SRC/docker-compose.yml" "$DIR/docker-compose.yml"
cd "$DIR"
docker compose pull -q
docker compose up -d
for _ in $(seq 1 30); do [ -s data/id_ed25519.pub ] && break; sleep 1; done
[ -s data/id_ed25519.pub ] || { echo "public key not generated" >&2; exit 1; }
if command -v ufw >/dev/null && ufw status | grep -q 'Status: active'; then
  ufw allow 21115:21117/tcp comment 'rustdesk' >/dev/null
  ufw allow 21116/udp comment 'rustdesk' >/dev/null
fi
echo "PUBKEY=$(cat data/id_ed25519.pub)"
