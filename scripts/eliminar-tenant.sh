#!/usr/bin/env bash
# scripts/eliminar-tenant.sh
# Elimina completamente un tenant:
#   - Detiene y elimina el contenedor Docker
#   - Elimina el servicio de docker-compose.yml
#   - Elimina envs/{TENANT_ID}.env
#   - Elimina la base de datos data/{TENANT_ID}.db
#
# Uso: TENANT_ID=tacos-javier bash scripts/eliminar-tenant.sh

set -euo pipefail

RAIZ="$(cd "$(dirname "$0")/.." && pwd)"
COMPOSE="$RAIZ/docker-compose.yml"
OVERRIDE="$RAIZ/docker-compose.override.yml"

[[ -z "${TENANT_ID:-}" ]] && echo "Error: TENANT_ID no definido" && exit 1

echo ""
echo "======================================="
echo "  Eliminando tenant: ${TENANT_ID}"
echo "======================================="
echo ""

# 1. Detener y eliminar contenedor (docker directo — no docker compose, para no afectar otros servicios)
if docker ps -a --format '{{.Names}}' | grep -qx "${TENANT_ID}"; then
  echo "Deteniendo contenedor ${TENANT_ID}..."
  docker stop "${TENANT_ID}" 2>&1 || true
  docker rm -f "${TENANT_ID}" 2>&1 || true
  echo "Contenedor eliminado."
else
  echo "Contenedor ${TENANT_ID} no estaba corriendo."
fi

# 2. Eliminar servicio de docker-compose.override.yml
if [[ -f "$OVERRIDE" ]] && grep -q "^  ${TENANT_ID}:" "$OVERRIDE" 2>/dev/null; then
  echo "Actualizando docker-compose.override.yml..."
  node -e "
const fs = require('fs');
let content = fs.readFileSync('${OVERRIDE}', 'utf8');
// Elimina bloque: comentario opcional + servicio hasta el proximo bloque o fin
const re = new RegExp('\\\\n  # Tenant:[^\\\\n]*\\\\n  ${TENANT_ID}:(?:\\\\n(?:    [^\\\\n]*|))*', 'g');
let updated = content.replace(re, '');
// Si no habia comentario, eliminar solo el bloque del servicio
if (updated === content) {
  const re2 = new RegExp('\\\\n  ${TENANT_ID}:(?:\\\\n(?:    [^\\\\n]*|))*', 'g');
  updated = content.replace(re2, '');
}
fs.writeFileSync('${OVERRIDE}', updated);
console.log('docker-compose.override.yml actualizado.');
" 2>&1
else
  echo "Servicio ${TENANT_ID} no encontrado en docker-compose.override.yml."
fi

# 3. Eliminar archivo .env del tenant
if [[ -f "$RAIZ/envs/${TENANT_ID}.env" ]]; then
  rm "$RAIZ/envs/${TENANT_ID}.env"
  echo "Archivo envs/${TENANT_ID}.env eliminado."
else
  echo "Archivo .env no encontrado."
fi

# 4. Eliminar base de datos
if [[ -f "$RAIZ/data/${TENANT_ID}.db" ]]; then
  rm "$RAIZ/data/${TENANT_ID}.db"
  echo "Base de datos data/${TENANT_ID}.db eliminada."
else
  echo "Base de datos no encontrada."
fi

echo ""
echo "Tenant ${TENANT_ID} eliminado correctamente."
echo ""
echo "[LISTO]"
