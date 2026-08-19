#!/usr/bin/env bash
# shellcheck shell=bash
set -Eeuo pipefail

ROOT="$(cd "$(dirname "$0")/.." && pwd)"
LOCK="$ROOT/.deploy-safe.lock"
OLD_COMMIT=""
UPDATED=false

log() { echo "[$(date '+%Y-%m-%d %H:%M:%S')] $*"; }

tenant_apps() {
  pm2 jlist | node -e '
    let raw = "";
    process.stdin.on("data", chunk => { raw += chunk; });
    process.stdin.on("end", () => {
      const apps = JSON.parse(raw || "[]");
      for (const app of apps) {
        const env = app.pm2_env || {};
        const execPath = String(env.pm_exec_path || "").replace(/\\/g, "/");
        const esTenant = Boolean(env.TENANT_ID || env.env?.TENANT_ID)
          || (execPath.endsWith("/index.js") && app.name !== "superadmin" && app.name !== "webhook-deploy");
        if (esTenant) process.stdout.write(`${app.name}\n`);
      }
    });
  '
}

restart_tenants_clean() {
  local apps=()
  mapfile -t apps < <(tenant_apps)
  if [[ ${#apps[@]} -eq 0 ]]; then
    log 'No hay procesos tenant registrados en PM2'
    return 0
  fi

  for app in "${apps[@]}"; do
    log "Reinicio limpio del tenant $app"
    pm2 stop "$app" >/dev/null
    pm2 start "$app" --update-env >/dev/null
    local pid
    pid="$(pm2 pid "$app" | tail -n 1 | tr -d '[:space:]')"
    [[ "$pid" =~ ^[1-9][0-9]*$ ]] || { log "ERROR: $app no quedó en ejecución"; return 1; }
    log "Tenant $app iniciado con PID $pid"
  done
}

restart_control_plane() {
  log 'Reiniciando Superadmin'
  pm2 restart superadmin --update-env >/dev/null
  sleep 3
  curl --fail --silent --max-time 10 "http://127.0.0.1:${SUPERADMIN_PORT:-3001}/health" >/dev/null
}

schedule_webhook_restart() {
  # El webhook es el padre que lanzó este script. Reiniciarlo de forma
  # sincrónica cerraría stdout a mitad del deploy. Se agenda ya sin trabajo
  # pendiente y con toda la salida desacoplada.
  ( sleep 2; pm2 restart webhook-deploy --update-env >/dev/null 2>&1; pm2 save >/dev/null 2>&1 ) >/dev/null 2>&1 &
}

rollback() {
  local code=$?
  if [[ "$UPDATED" == true && -n "$OLD_COMMIT" ]]; then
    log "ERROR: deploy falló; restaurando $OLD_COMMIT"
    git reset --hard "$OLD_COMMIT"
    npm ci --omit=dev --silent
    restart_tenants_clean || true
    restart_control_plane || true
    pm2 save || true
    schedule_webhook_restart
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

git fetch origin --quiet
OLD_COMMIT="$(git rev-parse HEAD)"
TARGET="$(git rev-parse origin/main)"
if [[ "$OLD_COMMIT" == "$TARGET" ]]; then
  log "Repositorio ya actualizado en ${TARGET:0:8}; sin cambios nuevos, omitiendo reinicios"
  exit 0
else
  log "Respaldando bases antes de ${OLD_COMMIT:0:8} → ${TARGET:0:8}"
  node scripts/backup-all-db.js
  git merge --ff-only origin/main
  UPDATED=true

  if ! git diff --quiet "$OLD_COMMIT" "$TARGET" -- package.json package-lock.json; then
    npm ci --omit=dev --silent
  fi
fi

restart_tenants_clean
restart_control_plane
pm2 save
UPDATED=false
log "Deploy saludable en ${TARGET:0:8}"
log 'Webhook-deploy se reiniciará al finalizar esta ejecución'
schedule_webhook_restart
