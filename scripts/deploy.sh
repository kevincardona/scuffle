#!/usr/bin/env bash
# Deploys to a plain Linux box running the app under systemd (unit: scuffle, code in /opt/scuffle).
# Usage: DEPLOY_HOST=user@your.server ./scripts/deploy.sh
# The server has no npm, so production node_modules are installed locally and copied over.
set -euo pipefail
: "${DEPLOY_HOST:?set DEPLOY_HOST, e.g. root@example.com}"
DIR=/opt/scuffle
TMP=$(mktemp -d)
trap 'rm -rf "$TMP"' EXIT

echo "==> tests + build"
npm test
npm run build

echo "==> production dependencies"
cp package.json package-lock.json "$TMP/"
(cd "$TMP" && npm ci --omit=dev --ignore-scripts)

echo "==> checking nobody is mid-game (a restart ends every game)"
PLAYERS=$(ssh "$DEPLOY_HOST" "curl -fsS localhost:3001/api/stats" | sed -n 's/.*"players":\([0-9]*\).*/\1/p')
if [ "${PLAYERS:-0}" != "0" ] && [ "${FORCE:-}" != "1" ]; then
  echo "$PLAYERS player(s) are connected right now. Re-run when it's quiet, or with FORCE=1 to deploy anyway."; exit 1
fi

echo "==> backup on server"
BACKUP="$DIR.bak-$(date +%Y%m%d%H%M)"
ssh "$DEPLOY_HOST" "cp -a $DIR $BACKUP && echo $BACKUP"

echo "==> upload"
rsync -a --delete build server "$DEPLOY_HOST:$DIR/"
ssh "$DEPLOY_HOST" "mkdir -p $DIR/src"
rsync -a src/constants "$DEPLOY_HOST:$DIR/src/"
rsync -a package.json package-lock.json "$DEPLOY_HOST:$DIR/"
rsync -a --delete "$TMP/node_modules" "$DEPLOY_HOST:$DIR/"

echo "==> restart + health check"
ssh "$DEPLOY_HOST" "chmod -R a+rX $DIR/build $DIR/server $DIR/src $DIR/node_modules && systemctl restart scuffle && sleep 3 && systemctl is-active scuffle && curl -fsS localhost:3001/healthz"
echo; echo "Done. Roll back with: ssh $DEPLOY_HOST 'rm -rf $DIR && mv $BACKUP $DIR && systemctl restart scuffle'"
