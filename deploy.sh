#!/usr/bin/env bash
# Build the plugin and deploy plugin + RustDesk server to the BBB host.
#   ./deploy.sh              (uses deploy.env)
# deploy.env:
#   SSH_TARGET=root@164.68.96.170      # ssh target with root (or passwordless sudo)
#   RUSTDESK_HOST=164.68.96.170        # must reach the server DIRECTLY (not via Cloudflare proxy)
#   PLUGIN_BASE_URL=https://sst-egy.co/plugins/remote-control
#   REQUEST_ROLES=moderator            # moderator | all
set -euo pipefail
cd "$(dirname "$0")"
# shellcheck disable=SC1091
source ./deploy.env
: "${SSH_TARGET:?}" "${RUSTDESK_HOST:?}" "${PLUGIN_BASE_URL:?}" "${REQUEST_ROLES:=moderator}"
SSH=(ssh ${SSH_OPTS:-} "$SSH_TARGET")
SUDO="${SUDO:-}"   # set SUDO="sudo" if SSH_TARGET is not root

echo "==> build plugin"
(cd plugin && npm ci --no-audit --no-fund >/dev/null && npm run -s build >/dev/null)

echo "==> RustDesk server"
tar -C server -cf - . | "${SSH[@]}" "mkdir -p /tmp/rc-server && tar -C /tmp/rc-server -xf - && $SUDO /tmp/rc-server/install-rustdesk-server.sh" | tee /tmp/rc-deploy.out
PUBKEY=$(sed -n 's/^PUBKEY=//p' /tmp/rc-deploy.out | tail -1)
[ -n "$PUBKEY" ] || { echo "no public key" >&2; exit 1; }

echo "==> config.json"
python3 - "$RUSTDESK_HOST" "$PUBKEY" "$REQUEST_ROLES" > plugin/dist/config.json <<'PY'
import base64, json, sys
host, key, roles = sys.argv[1:4]
payload = json.dumps({"host": host, "relay": "", "api": "", "key": key}, separators=(",", ":"))
# RustDesk "import server config" string = base64url(JSON) reversed
config_string = base64.urlsafe_b64encode(payload.encode()).decode()[::-1]
print(json.dumps({
    "rustdeskHost": host,
    "rustdeskKey": key,
    "configString": config_string,
    "windowsExeName": f"rustdesk-host={host},key={key},.exe",
    "downloadUrl": "https://rustdesk.com/download",
    "requestRoles": roles,
}, indent=2))
PY

echo "==> upload plugin"
tar -C plugin/dist -cf - RemoteControlPlugin.js manifest.json config.json | "${SSH[@]}" "$SUDO mkdir -p /var/www/bigbluebutton-default/assets/plugins/remote-control && $SUDO tar -C /var/www/bigbluebutton-default/assets/plugins/remote-control -xf - && $SUDO chmod -R a+rX /var/www/bigbluebutton-default/assets/plugins/remote-control"

echo "==> enable in bbb-web (pluginManifests)"
"${SSH[@]}" "$SUDO python3 - '$PLUGIN_BASE_URL/manifest.json'" <<'PY'
import json, re, sys
url = sys.argv[1]
f = '/etc/bigbluebutton/bbb-web.properties'
s = open(f).read()
m = re.search(r'^pluginManifests=(.*)$', s, re.M)
items = json.loads(m.group(1)) if m and m.group(1).strip() else []
if not any(i.get('url') == url for i in items):
    items.append({'url': url})
line = 'pluginManifests=' + json.dumps(items)
s = re.sub(r'^pluginManifests=.*$', line, s, flags=re.M) if m else s.rstrip('\n') + '\n' + line + '\n'
open(f, 'w').write(s)
print(line)
PY
"${SSH[@]}" "$SUDO systemctl restart bbb-web && sleep 5 && systemctl is-active bbb-web"
echo "==> done. New meetings load the plugin (running meetings must be restarted)."
