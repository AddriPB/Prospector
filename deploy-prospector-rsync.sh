#!/usr/bin/env bash
set -euo pipefail

ROOT="/Users/adri/Codex/Apps/Prospector"
PI_HOST="adri@pi-3b.local"
PI_DIR="/home/adri/bots/prospector"
PROCESS_NAME="prospector-bot"

if [[ "$(pwd)" != "$ROOT" ]]; then
  echo "Ce script doit etre lance depuis $ROOT" >&2
  exit 1
fi

DESCRIPTION="${1:-}"
if [[ -z "$DESCRIPTION" ]]; then
  echo "Usage: ./deploy-prospector-rsync.sh \"Description courte\"" >&2
  exit 1
fi

npm test
node --check src/cli.js
git status --short || true

ssh "$PI_HOST" "mkdir -p '$PI_DIR' '$PI_DIR/data' '$PI_DIR/logs' '$PI_DIR/exports'"

rsync -az --delete \
  --exclude '.git/' \
  --exclude '.DS_Store' \
  --exclude 'CODEX_PROJECT_CONTEXT.md' \
  --exclude '/node_modules/' \
  --exclude '/dist/' \
  --exclude '/build/' \
  --exclude '/coverage/' \
  --exclude '/.cache/' \
  --exclude '/.tmp/' \
  --exclude '/tmp/' \
  --exclude '/logs/' \
  --exclude '/data/' \
  --exclude '/exports/' \
  --exclude '/config/*.local.json' \
  --exclude '/.local-prospector-output/' \
  --exclude '/.local-prospector-cache/' \
  --exclude '*.log' \
  --exclude '*.sqlite' \
  --exclude '*.db' \
  --exclude '*.xlsx' \
  ./ "$PI_HOST:$PI_DIR/"

ssh "$PI_HOST" "
  set -e
  cd '$PI_DIR'
  npm install
  npm run build --if-present
  npm run scoring:recalculate-v2
  if pm2 describe '$PROCESS_NAME' >/dev/null 2>&1; then
    pm2 restart '$PROCESS_NAME' --update-env
  else
    pm2 start npm --name '$PROCESS_NAME' -- start
  fi
  pm2 save
  pm2 status
  pm2 logs '$PROCESS_NAME' --lines 30 --nostream
"

echo "Deploy termine: $DESCRIPTION"
