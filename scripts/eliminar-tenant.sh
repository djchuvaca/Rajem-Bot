#!/usr/bin/env bash
# scripts/eliminar-tenant.sh
# Elimina completamente un tenant:
#   - Detiene y elimina el contenedor Docker
#   - Elimina el servicio de docker-compose.yml
#   - Elimina envs/{TENANT_ID}.env
#   - Opcionalmente elimina la BD (BORRAR_DB=1)
#
# Uso: TENANT_ID=tacos-javier [BORRAR_DB=1] bash scripts/eliminar-tenant.sh

set -euo pipefail

RAIZ="$(cd "$(dirname "$0")/.." && pwd)"
COMPOSE="$RAIZ/docker-compose.yml"

[[ -z "${TENANT_ID:-}" ]] && echo "Error: TENANT_ID no definido" && exit 1

echo ""
echo "======================================="
echo "  Eliminando tenant: ${TENANT_ID}"
echo "======================================="
echo ""

# 1. Detener y eliminar contenedor
if docker ps -a --format '{{.Names}}' | grep -qx "${TENANT_ID}"; then
  echo "Deteniendo contenedor ${TENANT_ID}..."
  docker compose -f "$COMPOSE" stop "$TENANT_ID" 2>&1 || true
  docker compose -f "$COMPOSE" rm -f "$TENANT_ID" 2>&1 || true
  echo "Contenedor eliminado."
else
  echo "Contenedor ${TENANT_ID} no estaba corriendo."
fi

# 2. Eliminar servicio de docker-compose.yml
if grep -q "^  ${TENANT_ID}:" "$COMPOSE" 2>/dev/null; then
  echo "Actualizando docker-compose.yml..."
  node -e "
const fs = require('fs');
let content = fs.readFileSync('${COMPOSE}', 'utf8');
// Elimina bloque: comentario opcional + servicio hasta el proximo bloque o fin
const re = new RegExp('\\\\n  # Tenant:[^\\\\n]*\\\\n  ${TENANT_ID}:(?:\\\\n(?:    [^\\\\n]*|))*', 'g');
let updated = content.replace(re, '');
// Si no habia comentario, eliminar solo el bloque del servicio
if (updated === content) {
  const re2 = new RegExp('\\\\n  ${TENANT_ID}:(?:\\\\n(?:    [^\\\\n]*|))*', 'g');
  updated = content.replace(re2, '');
}
fs.writeFileSync('${COMPOSE}', updated);
console.log('docker-compose.yml actualizado.');
" 2>&1
else
  echo "Servicio ${TENANT_ID} no encontrado en docker-compose.yml."
fi

# 3. Eliminar archivo .env del tenant
if [[ -f "$RAIZ/envs/${TENANT_ID}.env" ]]; then
  rm "$RAIZ/envs/${TENANT_ID}.env"
  echo "Archivo envs/${TENANT_ID}.env eliminado."
else
  echo "Archivo .env no encontrado."
fi

# 4. Opcionalmente eliminar la BD
if [[ "${BORRAR_DB:-0}" == "1" ]]; then
  if [[ -f "$RAIZ/data/${TENANT_ID}.db" ]]; then
    rm "$RAIZ/data/${TENANT_ID}.db"
    echo "Base de datos data/${TENANT_ID}.db eliminada."
  else
    echo "Archivo de BD no encontrado."
  fi
else
  echo "BD conservada en data/${TENANT_ID}.db"
fi

echo ""
echo "Tenant ${TENANT_ID} eliminado correctamente."
echo ""
echo "[LISTO]"
