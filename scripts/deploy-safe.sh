#!/usr/bin/env bash
set -Eeuo pipefail

ROOT="$(cd "$(dirname "$0")/.." && pwd)"
LOCK="$ROOT/.deploy-safe.lock"
OLD_COMMIT=""
UPDATED=false

log() { echo "[$(date '+%Y-%m-%d %H:%M:%S')] $*"; }

rollback() {
  local code=$?
  if [[ "$UPDATED" == true && -n "$OLD_COMMIT" ]]; then
    log "ERROR: deploy falló; restaurando $OLD_COMMIT"
    git reset --hard "$OLD_COMMIT"
    npm ci --omit=dev --silent
    node scripts/actualizar-tenants.js --no-restart || true
    pm2 restart all --update-env || true
    pm2 save || true
  fi
  exit "$code"
}
trap rollback ERR

exec 9>"$LOCK"
flock -n 9 || { log 'Otro deploy está en curso'; exit 0; }
cd "$ROOT"

if ! git diff --quiet || ! git diff --cached --quiet; then
  log 'Árbol de trabajo con cambios rastreados; deploy cancelado para no sobrescribirlos'
  exit 1
fi

git fetch origin main --quiet
OLD_COMMIT="$(git rev-parse HEAD)"
TARGET="$(git rev-parse origin/main)"
[[ "$OLD_COMMIT" == "$TARGET" ]] && { log 'Repositorio ya actualizado'; exit 0; }

log "Respaldando bases antes de ${OLD_COMMIT:0:8} → ${TARGET:0:8}"
node scripts/backup-all-db.js
git merge --ff-only origin/main
UPDATED=true

if ! git diff --quiet "$OLD_COMMIT" "$TARGET" -- package.json package-lock.json; then
  npm ci --omit=dev --silent
fi
npm test

# Los tenants viven en directorios independientes para aislar sus datos y
# sesiones. Copiarles el código nuevo antes del restart es indispensable:
# reiniciar PM2 por sí solo conserva la versión antigua de cada directorio.
node scripts/actualizar-tenants.js --no-restart
pm2 restart all --update-env
sleep 3
curl --fail --silent --max-time 10 http://127.0.0.1:${SUPERADMIN_PORT:-3001}/health >/dev/null
curl --fail --silent --max-time 10 http://127.0.0.1:${WEBHOOK_PORT:-4000}/health >/dev/null
pm2 save
UPDATED=false
log "Deploy saludable en ${TARGET:0:8}"
