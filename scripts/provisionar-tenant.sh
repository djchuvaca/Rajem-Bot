#!/usr/bin/env bash
# scripts/provisionar-tenant.sh
# Provisiona un nuevo tenant: directorio, .env, tenants.json, Docker.
#
# Modo interactivo (terminal):
#   bash scripts/provisionar-tenant.sh
#
# Modo no-interactivo (desde super admin / webhook-deploy):
#   PROV_NON_INTERACTIVE=1 TENANT_ID=tacos-pepe PROV_GROQ_KEY=gsk_... bash scripts/provisionar-tenant.sh

set -euo pipefail

RED='\033[0;31m'; GREEN='\033[0;32m'; YELLOW='\033[1;33m'; CYAN='\033[0;36m'; NC='\033[0m'
info()  { echo -e "${CYAN}▶ $*${NC}"; }
ok()    { echo -e "${GREEN}✔ $*${NC}"; }
warn()  { echo -e "${YELLOW}⚠ $*${NC}"; }
error() { echo -e "${RED}✖ $*${NC}"; exit 1; }

ask() {
  local prompt="$1" default="${2:-}"
  if [[ -n "$default" ]]; then
    echo -en "${CYAN}? ${prompt}${NC} [${default}]: "
  else
    echo -en "${CYAN}? ${prompt}${NC}: "
  fi
  read -r REPLY
  echo "${REPLY:-${default}}"
}

# Devuelve el valor de una variable de entorno si existe,
# o pregunta al usuario (solo en modo interactivo).
get_val() {
  local env_var="$1" prompt="$2" default="${3:-}"
  local current="${!env_var:-}"
  if [[ -n "$current" ]]; then
    echo "$current"
  elif [[ "${PROV_NON_INTERACTIVE:-}" == "1" ]]; then
    echo "$default"
  else
    ask "$prompt" "$default"
  fi
}

echo ""
echo "━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━"
echo "   Rajem's Technology — Provisionar nuevo tenant"
echo "━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━"
echo ""

# ── 1. Recopilar datos ────────────────────────────────────────────────────────
TENANT_ID=$(get_val "TENANT_ID" "ID del tenant (ej: tacos-pepe-gdl)")
[[ -z "$TENANT_ID" ]]                   && error "El ID no puede estar vacío."
[[ ! "$TENANT_ID" =~ ^[a-z0-9-]+$ ]]   && error "El ID debe ser minúsculas, números y guiones."

NOMBRE=$(get_val    "PROV_NOMBRE"     "Nombre del negocio"      "$TENANT_ID")
CIUDAD=$(get_val    "PROV_CIUDAD"     "Ciudad"                  "")
ESTADO=$(get_val    "PROV_ESTADO"     "Estado"                  "")
GROQ_KEY=$(get_val  "PROV_GROQ_KEY"  "GROQ_API_KEY (gsk_...)"  "")
[[ -z "$GROQ_KEY" ]] && error "La GROQ_API_KEY es requerida."

GRUPO_ID=$(get_val  "PROV_GRUPO_ID"    "GRUPO_ID de WhatsApp (enter para omitir)"  "")
PLAN=$(get_val      "PROV_PLAN"        "Plan (basico / plus / pro)"                "basico")
NOTAS=$(get_val     "PROV_NOTAS"       "Notas (opcional)"                          "")

# Puerto: auto-detectar el siguiente libre si no se especificó
RAIZ="$(cd "$(dirname "$0")/.." && pwd)"
TENANTS_FILE="$RAIZ/data/tenants.json"

PUERTO_SUGERIDO=3002
if [[ -z "${PROV_PANEL_PORT:-}" ]] && [[ "${PROV_NON_INTERACTIVE:-}" != "1" ]]; then
  if command -v python3 &>/dev/null && [[ -f "$TENANTS_FILE" ]]; then
    PUERTOS_USADOS=$(python3 -c "
import json
with open('$TENANTS_FILE') as f: data=json.load(f)
ports=[t.get('panel_port',0) for t in data.get('tenants',[])]
print(' '.join(map(str,ports)))
" 2>/dev/null || echo "")
    while echo "$PUERTOS_USADOS" | grep -qw "$PUERTO_SUGERIDO" || \
          ss -tlnp 2>/dev/null | grep -q ":$PUERTO_SUGERIDO "; do
      PUERTO_SUGERIDO=$((PUERTO_SUGERIDO + 1))
    done
  fi
fi
PANEL_PORT=$(get_val "PROV_PANEL_PORT" "Puerto del panel" "$PUERTO_SUGERIDO")

PANEL_SECRET=$(get_val "PROV_PANEL_SECRET" "PANEL_SECRET (vacío = generar automático)" "")
if [[ -z "$PANEL_SECRET" ]]; then
  PANEL_SECRET=$(openssl rand -hex 32 2>/dev/null || echo "secreto-$(date +%s)-$(cat /proc/sys/kernel/random/uuid 2>/dev/null | tr -d '-' || echo random)")
  ok "PANEL_SECRET generado automáticamente."
fi

# ── 2. Directorio destino ─────────────────────────────────────────────────────
DESTINO="$(cd "$RAIZ/.." && pwd)/$TENANT_ID"
info "Directorio destino: $DESTINO"
[[ -d "$DESTINO" ]] && error "Ya existe la carpeta: $DESTINO"

# ── 3. Copiar código fuente ───────────────────────────────────────────────────
info "Copiando código fuente..."
EXCLUIR=(node_modules .wwebjs_auth .wwebjs_cache data logs .env analisis capturas backups)
if command -v rsync &>/dev/null; then
  RSYNC_EX=()
  for e in "${EXCLUIR[@]}"; do RSYNC_EX+=(--exclude="$e"); done
  rsync -a "${RSYNC_EX[@]}" "$RAIZ/" "$DESTINO/"
else
  cp -r "$RAIZ" "$DESTINO"
  for e in "${EXCLUIR[@]}"; do rm -rf "$DESTINO/$e"; done
fi
ok "Código copiado."

# ── 4. Crear carpetas de datos ────────────────────────────────────────────────
for d in data logs; do
  mkdir -p "$DESTINO/$d"
  touch "$DESTINO/$d/.gitkeep"
done
ok "Carpetas de datos creadas."

# ── 5. Generar .env ───────────────────────────────────────────────────────────
cat > "$DESTINO/.env" <<EOF
# Generado por provisionar-tenant.sh — $(date)
TENANT_ID=$TENANT_ID
GROQ_API_KEY=$GROQ_KEY
GRUPO_ID=$GRUPO_ID
PANEL_PORT=$PANEL_PORT
PANEL_SECRET=$PANEL_SECRET
EOF
ok ".env generado."

# ── 6. Registrar en tenants.json ──────────────────────────────────────────────
HOY=$(date +%Y-%m-%d)
if [[ -f "$TENANTS_FILE" ]] && command -v python3 &>/dev/null; then
  python3 - <<PYEOF
import json
with open('$TENANTS_FILE', 'r') as f:
    data = json.load(f)
nuevo = {
    "id": "$TENANT_ID", "nombre": "$NOMBRE",
    "ciudad": "$CIUDAD", "estado": "$ESTADO",
    "db_path": "data/tacos_javier.db", "logs_path": "logs/",
    "panel_port": $PANEL_PORT, "activo": False,
    "plan": "$PLAN", "desde": "$HOY", "notas": "$NOTAS"
}
data['tenants'] = [t for t in data['tenants'] if t['id'] != '$TENANT_ID']
data['tenants'].append(nuevo)
with open('$TENANTS_FILE', 'w') as f:
    json.dump(data, f, ensure_ascii=False, indent=2)
PYEOF
  ok "Tenant registrado en tenants.json."
else
  warn "No se pudo actualizar tenants.json. Regístralo manualmente desde el super admin."
fi

# ── 7. Instalar dependencias ──────────────────────────────────────────────────
info "Instalando dependencias..."
cd "$DESTINO"
npm install --omit=dev --silent && ok "Dependencias instaladas." \
  || warn "npm install falló. Ejecútalo manualmente en: $DESTINO"

# ── 8. Ajustar puerto en docker-compose.yml ───────────────────────────────────
COMPOSE="$DESTINO/docker-compose.yml"
if [[ -f "$COMPOSE" ]]; then
  # Reemplazar el mapeo de puerto del panel (3000 interno → PANEL_PORT externo)
  sed -i "s|\"3000:3000\"|\"${PANEL_PORT}:3000\"|g" "$COMPOSE"
  # Reemplazar nombre de servicio y contenedor
  sed -i "s|tacos-javier-tepic|${TENANT_ID}|g" "$COMPOSE"
  ok "docker-compose.yml ajustado."
fi

# ── 9. Construir y arrancar contenedor ───────────────────────────────────────
if command -v docker &>/dev/null; then
  info "Construyendo imagen Docker y arrancando contenedor..."
  docker compose -f "$COMPOSE" up -d --build \
    && ok "Contenedor arrancado. El bot iniciará en ~30s." \
    || warn "docker compose falló. Arráncalo manualmente:\n   cd $DESTINO && docker compose up -d --build"
else
  warn "Docker no encontrado. Arranca el bot manualmente:\n   cd $DESTINO && npm start"
fi

# ── Resumen ───────────────────────────────────────────────────────────────────
echo ""
echo "━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━"
ok "Tenant \"$NOMBRE\" ($TENANT_ID) provisionado."
echo "━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━"
echo ""
echo -e "  Panel      : ${CYAN}http://TU-IP:${PANEL_PORT}${NC}"
echo -e "  Contenedor : ${CYAN}${TENANT_ID}${NC}"
echo ""
echo -e "${YELLOW}Escanea el QR desde el super admin o con:${NC}"
echo -e "  ${CYAN}docker logs -f ${TENANT_ID}${NC}"
echo ""
echo "[LISTO]"
