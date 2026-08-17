#!/usr/bin/env bash
# scripts/setup.sh
# Genera el .env raíz con secretos aleatorios en una instalación nueva.
# No sobreescribe un .env existente.
#
# Uso:
#   bash scripts/setup.sh
#   npm run setup

set -euo pipefail

RAIZ="$(cd "$(dirname "$0")/.." && pwd)"
ENV_FILE="$RAIZ/.env"

# ── Guardia: no pisar config existente ────────────────────────────────────────
if [[ -f "$ENV_FILE" ]]; then
  echo ""
  echo "⚠️  Ya existe un archivo .env en $ENV_FILE"
  echo "   Si quieres regenerarlo, elimínalo primero y vuelve a correr este script."
  echo ""
  exit 0
fi

# ── Verificar que openssl esté disponible ─────────────────────────────────────
if ! command -v openssl &>/dev/null; then
  echo "Error: openssl no está instalado. Instálalo y vuelve a intentarlo." >&2
  exit 1
fi

# ── Generar secretos ──────────────────────────────────────────────────────────
WEBHOOK_SECRET=$(openssl rand -hex 32)
SUPERADMIN_SECRET=$(openssl rand -hex 32)
SUPERADMIN_INITIAL_PASSWORD=$(openssl rand -base64 18 | tr -d '/+=')

# ── Escribir .env ─────────────────────────────────────────────────────────────
cat > "$ENV_FILE" <<EOF
# Generado automáticamente por scripts/setup.sh — $(date '+%Y-%m-%d %H:%M:%S')
# Edita este archivo para ajustar puertos o agregar variables opcionales.

SUPERADMIN_PORT=3001
SUPERADMIN_SECRET=${SUPERADMIN_SECRET}
SUPERADMIN_INITIAL_PASSWORD=${SUPERADMIN_INITIAL_PASSWORD}

WEBHOOK_PORT=4000
WEBHOOK_SECRET=${WEBHOOK_SECRET}
WEBHOOK_HOST=localhost

# COOKIE_SECURE=1       # Descomentar cuando esté detrás de HTTPS
# SENTRY_DSN=           # Opcional — activa Sentry si se define
EOF

# ── Resumen ───────────────────────────────────────────────────────────────────
echo ""
echo "✅ .env creado en $ENV_FILE"
echo ""
echo "━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━"
echo "  Guarda esta contraseña — no volverá a mostrarse:"
echo ""
echo "  Usuario superadmin : rajem"
echo "  Contraseña inicial : ${SUPERADMIN_INITIAL_PASSWORD}"
echo ""
echo "━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━"
echo ""
echo "Siguiente paso:"
echo "  pm2 start ecosystem.config.js --only superadmin,webhook-deploy"
echo "  pm2 save && pm2 startup"
echo ""
