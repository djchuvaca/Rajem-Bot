#!/usr/bin/env bash
# scripts/eliminar-tenant.sh
# Elimina completamente un tenant (bare-metal / PM2):
#   - Detiene y elimina el proceso PM2 del tenant
#   - Elimina la entrada de data/tenants.json
#   - Elimina envs/{TENANT_ID}.env
#   - Elimina la base de datos data/{TENANT_ID}.db
#   - Elimina los backups data/backups/{TENANT_ID}_*.db
#   - Elimina la sesión WhatsApp .wwebjs_auth/session-{TENANT_ID}/
#
# Uso: TENANT_ID=tacos-javier bash scripts/eliminar-tenant.sh

set -euo pipefail

RAIZ="$(cd "$(dirname "$0")/.." && pwd)"

[[ -z "${TENANT_ID:-}" ]] && echo "Error: TENANT_ID no definido" && exit 1

echo ""
echo "======================================="
echo "  Eliminando tenant: ${TENANT_ID}"
echo "======================================="
echo ""

# 1. Detener y eliminar proceso PM2
if command -v pm2 &>/dev/null && pm2 list --no-color 2>/dev/null | grep -q " ${TENANT_ID} "; then
  echo "Deteniendo proceso PM2 '${TENANT_ID}'..."
  pm2 delete "${TENANT_ID}" 2>&1 || true
  pm2 save 2>&1 || true
  echo "Proceso PM2 eliminado."
else
  echo "Proceso PM2 '${TENANT_ID}' no estaba corriendo."
fi

# 2. Eliminar de data/tenants.json
if [[ -f "$RAIZ/data/tenants.json" ]] && command -v python3 &>/dev/null; then
  python3 - <<PYEOF
import json
file = '${RAIZ}/data/tenants.json'
try:
    with open(file) as f: data = json.load(f)
    data['tenants'] = [t for t in data.get('tenants', []) if t['id'] != '${TENANT_ID}']
    with open(file, 'w') as f: json.dump(data, f, ensure_ascii=False, indent=2)
    print("data/tenants.json actualizado.")
except Exception as e:
    print(f"Advertencia: no se pudo actualizar tenants.json: {e}")
PYEOF
else
  echo "tenants.json no encontrado o python3 no disponible."
fi

# 3. Eliminar archivo .env del tenant
if [[ -f "$RAIZ/envs/${TENANT_ID}.env" ]]; then
  rm "$RAIZ/envs/${TENANT_ID}.env"
  echo "Archivo envs/${TENANT_ID}.env eliminado."
else
  echo "Archivo .env no encontrado."
fi

# 4. Eliminar datos del tenant (BD, backups, sesión WA)
if [[ -f "$RAIZ/data/${TENANT_ID}.db" ]]; then
  rm "$RAIZ/data/${TENANT_ID}.db"
  echo "Base de datos data/${TENANT_ID}.db eliminada."
else
  echo "Base de datos no encontrada."
fi

BACKUPS=("$RAIZ/data/backups/${TENANT_ID}_"*.db)
if [[ -f "${BACKUPS[0]}" ]]; then
  rm -f "$RAIZ/data/backups/${TENANT_ID}_"*.db
  echo "Backups de data/backups/${TENANT_ID}_*.db eliminados."
else
  echo "Sin backups que eliminar."
fi

WA_SESSION="$RAIZ/.wwebjs_auth/session-${TENANT_ID}"
if [[ -d "$WA_SESSION" ]]; then
  rm -rf "$WA_SESSION"
  echo "Sesión WhatsApp .wwebjs_auth/session-${TENANT_ID}/ eliminada."
else
  echo "Sin sesión WhatsApp que eliminar."
fi

echo ""
echo "Tenant ${TENANT_ID} eliminado correctamente."
echo ""
echo "[LISTO]"
