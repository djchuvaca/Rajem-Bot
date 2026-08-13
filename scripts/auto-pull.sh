#!/usr/bin/env bash
# scripts/auto-pull.sh
# Deploy pull-based. Ejecutado por cron cada 2 minutos.
# Solo actúa si hay commits nuevos en origin/main.
#
# Instalación:
#   chmod +x scripts/auto-pull.sh
#   crontab -e  →  */2 * * * * /ruta/al/repo/scripts/auto-pull.sh >> /var/log/rajem-pull.log 2>&1

set -euo pipefail

RAIZ="$(cd "$(dirname "$0")/.." && pwd)"
LOCK="$RAIZ/.auto-pull.lock"

# ── Timestamps ────────────────────────────────────────────────────────────────
ts() { date '+%Y-%m-%d %H:%M:%S'; }

# ── Lock: evita ejecuciones concurrentes ─────────────────────────────────────
if [ -f "$LOCK" ]; then
  OLD_PID=$(cat "$LOCK")
  if kill -0 "$OLD_PID" 2>/dev/null; then
    echo "[$(ts)] Deploy en curso (PID $OLD_PID) — saliendo."
    exit 0
  fi
  # Lock huérfano — lo limpiamos
  rm -f "$LOCK"
fi
echo $$ > "$LOCK"
trap 'rm -f "$LOCK"' EXIT

cd "$RAIZ"

# ── Verificar conexión con origin ─────────────────────────────────────────────
if ! git fetch origin main --quiet 2>/dev/null; then
  echo "[$(ts)] WARN: git fetch falló. Sin internet o repo privado sin clave. Reintentando en el próximo ciclo."
  exit 0
fi

LOCAL=$(git rev-parse HEAD)
REMOTE=$(git rev-parse origin/main)

# Sin cambios — silencioso para no llenar el log
[ "$LOCAL" = "$REMOTE" ] && exit 0

echo ""
echo "[$(ts)] ════════════════════════════════════════════"
echo "[$(ts)] Nuevo commit detectado"
echo "[$(ts)]   anterior : ${LOCAL:0:8}"
echo "[$(ts)]   nuevo    : ${REMOTE:0:8}"
echo "[$(ts)] ════════════════════════════════════════════"

# ── Qué archivos cambiaron ────────────────────────────────────────────────────
CHANGED=$(git diff --name-only "$LOCAL" "$REMOTE")
echo "[$(ts)] Archivos:"
echo "$CHANGED" | sed 's/^/           /'

NEEDS_BUILD=false
NEEDS_RECREATE=false
NEEDS_PM2=false

while IFS= read -r f; do
  case "$f" in
    Dockerfile*|package.json|package-lock.json)
      NEEDS_BUILD=true ;;
    src/panel/public/*)
      NEEDS_BUILD=true ;;   # COPY'd en imagen, no volume
    scripts/auto-pull.sh|scripts/webhook-deploy.js)
      NEEDS_PM2=true ;;
    *)
      NEEDS_RECREATE=true ;;
  esac
done <<< "$CHANGED"

# ── Pull ──────────────────────────────────────────────────────────────────────
echo "[$(ts)] git pull..."
git pull origin main --quiet

# ── Deploy ────────────────────────────────────────────────────────────────────
if [ "$NEEDS_BUILD" = true ]; then
  echo "[$(ts)] Cambios en imagen o estáticos — rebuild completo..."
  docker compose up -d --build
elif [ "$NEEDS_RECREATE" = true ]; then
  echo "[$(ts)] Cambios en código fuente — recreando contenedores..."
  docker compose up -d --force-recreate
else
  echo "[$(ts)] Solo scripts/config cambiaron — sin tocar contenedores."
fi

# ── Reiniciar PM2 si el script de deploy cambió ───────────────────────────────
if [ "$NEEDS_PM2" = true ] && command -v pm2 &>/dev/null; then
  echo "[$(ts)] Reiniciando PM2 (scripts de deploy actualizados)..."
  pm2 restart all --silent || true
fi

echo "[$(ts)] ✓ Deploy completado — commit activo: $(git rev-parse --short HEAD)"
echo ""
