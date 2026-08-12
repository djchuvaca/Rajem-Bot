#!/usr/bin/env bash
# scripts/provisionar-tenant.sh
# Provisiona un nuevo tenant en el mismo repo:
#   - Crea envs/{TENANT_ID}.env con variables de entorno
#   - Registra el tenant en data/tenants.json
#   - Añade el servicio al docker-compose.yml
#   - Arranca el contenedor
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

RAIZ="$(cd "$(dirname "$0")/.." && pwd)"
COMPOSE="$RAIZ/docker-compose.yml"
TENANTS_FILE="$RAIZ/data/tenants.json"
ENVS_DIR="$RAIZ/envs"

# ── 1. Recopilar datos ────────────────────────────────────────────────────────
TENANT_ID=$(get_val "TENANT_ID" "ID del tenant (ej: tacos-pepe-gdl)")
[[ -z "$TENANT_ID" ]]                   && error "El ID no puede estar vacío."
[[ ! "$TENANT_ID" =~ ^[a-z0-9-]+$ ]]   && error "El ID debe ser minúsculas, números y guiones."

# Verificar que no exista ya
if grep -q "^  ${TENANT_ID}:" "$COMPOSE" 2>/dev/null; then
  error "El tenant '${TENANT_ID}' ya existe en docker-compose.yml."
fi
if [[ -f "$ENVS_DIR/${TENANT_ID}.env" ]]; then
  error "Ya existe envs/${TENANT_ID}.env — elimínalo antes de reprovisionar."
fi

NOMBRE=$(get_val    "PROV_NOMBRE"     "Nombre del negocio"      "$TENANT_ID")
CIUDAD=$(get_val    "PROV_CIUDAD"     "Ciudad"                  "")
ESTADO=$(get_val    "PROV_ESTADO"     "Estado"                  "")
GROQ_KEY=$(get_val  "PROV_GROQ_KEY"  "GROQ_API_KEY (gsk_...)"  "")
[[ -z "$GROQ_KEY" ]] && error "La GROQ_API_KEY es requerida."

GRUPO_ID=$(get_val  "PROV_GRUPO_ID"    "GRUPO_ID de WhatsApp (enter para omitir)"  "")
PLAN=$(get_val      "PROV_PLAN"        "Plan (basico / plus / pro)"                "basico")
NOTAS=$(get_val     "PROV_NOTAS"       "Notas (opcional)"                          "")

# Puerto: auto-detectar el siguiente libre
PUERTO_SUGERIDO=3002
if [[ -z "${PROV_PANEL_PORT:-}" ]]; then
  if command -v python3 &>/dev/null && [[ -f "$TENANTS_FILE" ]]; then
    PUERTOS_USADOS=$(python3 -c "
import json
with open('$TENANTS_FILE') as f:
    data = json.load(f)
ports = [t.get('panel_port', 0) for t in data.get('tenants', [])]
print(' '.join(map(str, ports)))
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
  PANEL_SECRET=$(openssl rand -hex 32 2>/dev/null || echo "secreto-$(date +%s)")
  ok "PANEL_SECRET generado automáticamente."
fi

# ── 2. Crear envs/{TENANT_ID}.env ─────────────────────────────────────────────
mkdir -p "$ENVS_DIR"
cat > "$ENVS_DIR/${TENANT_ID}.env" <<EOF
# Generado por provisionar-tenant.sh — $(date)
TENANT_ID=${TENANT_ID}
GROQ_API_KEY=${GROQ_KEY}
GRUPO_ID=${GRUPO_ID}
PANEL_PORT=3000
PANEL_SECRET=${PANEL_SECRET}
EOF
ok "envs/${TENANT_ID}.env creado."

# ── 3. Registrar en data/tenants.json ─────────────────────────────────────────
HOY=$(date +%Y-%m-%d)
mkdir -p "$RAIZ/data"
if command -v python3 &>/dev/null; then
  python3 - <<PYEOF
import json, os
file = '${TENANTS_FILE}'
data = {"tenants": []}
if os.path.exists(file):
    try:
        with open(file) as f:
            data = json.load(f)
    except Exception:
        data = {"tenants": []}
if "tenants" not in data:
    data["tenants"] = []
nuevo = {
    "id": "${TENANT_ID}",
    "nombre": "${NOMBRE}",
    "ciudad": "${CIUDAD}",
    "estado": "${ESTADO}",
    "db_path": "data/${TENANT_ID}.db",
    "logs_path": "logs/",
    "panel_port": ${PANEL_PORT},
    "activo": False,
    "plan": "${PLAN}",
    "desde": "${HOY}",
    "notas": "${NOTAS}"
}
data["tenants"] = [t for t in data["tenants"] if t["id"] != "${TENANT_ID}"]
data["tenants"].append(nuevo)
with open(file, 'w') as f:
    json.dump(data, f, ensure_ascii=False, indent=2)
PYEOF
  ok "Tenant registrado en data/tenants.json."
else
  warn "python3 no disponible — registra el tenant manualmente en data/tenants.json."
fi

# ── 4. Añadir servicio a docker-compose.yml ───────────────────────────────────
info "Añadiendo servicio ${TENANT_ID} a docker-compose.yml..."
cat >> "$COMPOSE" <<EOF

  # ── Tenant: ${NOMBRE} ─────────────────────────────────────────────────────────
  ${TENANT_ID}:
    build: .
    container_name: ${TENANT_ID}
    restart: unless-stopped
    env_file: envs/${TENANT_ID}.env
    environment:
      - TZ=America/Mazatlan
    ports:
      - "${PANEL_PORT}:3000"
    volumes:
      - ./data:/-Rajem-Bot/data
      - ./logs:/-Rajem-Bot/logs
      - ./.wwebjs_auth:/-Rajem-Bot/.wwebjs_auth
      - ./.wwebjs_cache:/-Rajem-Bot/.wwebjs_cache
EOF
ok "Servicio añadido a docker-compose.yml."

# ── 5. Construir y arrancar el contenedor ─────────────────────────────────────
if command -v docker &>/dev/null; then
  info "Construyendo imagen y arrancando contenedor ${TENANT_ID}..."
  docker compose -f "$COMPOSE" up -d --build "$TENANT_ID" \
    && ok "Contenedor arrancado. El bot iniciará en ~30s." \
    || warn "docker compose falló. Arráncalo manualmente:\n   cd $RAIZ && docker compose up -d --build $TENANT_ID"
else
  warn "Docker no encontrado. Arranca el bot manualmente:\n   cd $RAIZ && docker compose up -d --build $TENANT_ID"
fi

# ── Resumen ───────────────────────────────────────────────────────────────────
echo ""
echo "━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━"
ok "Tenant \"${NOMBRE}\" (${TENANT_ID}) provisionado."
echo "━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━"
echo ""
echo -e "  Panel      : ${CYAN}http://TU-IP:${PANEL_PORT}${NC}"
echo -e "  Contenedor : ${CYAN}${TENANT_ID}${NC}"
echo -e "  BD         : ${CYAN}data/${TENANT_ID}.db${NC}"
echo ""
echo -e "${YELLOW}Escanea el QR desde el super admin o con:${NC}"
echo -e "  ${CYAN}docker logs -f ${TENANT_ID}${NC}"
echo ""
echo "[LISTO]"
