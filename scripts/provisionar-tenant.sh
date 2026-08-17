#!/usr/bin/env bash
# scripts/provisionar-tenant.sh
# Provisiona un nuevo tenant en el mismo repo (bare-metal / PM2):
#   - Crea envs/{TENANT_ID}.env con variables de entorno
#   - Registra el tenant en data/tenants.json
#   - Arranca el bot del tenant con PM2
#
# Modo interactivo (terminal):
#   bash scripts/provisionar-tenant.sh
#
# Modo no-interactivo (desde super admin / webhook-deploy):
#   PROV_NON_INTERACTIVE=1 TENANT_ID=tacos-pepe bash scripts/provisionar-tenant.sh

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
TENANTS_FILE="$RAIZ/data/tenants.json"
ENVS_DIR="$RAIZ/envs"

# Nginx — configurables via variables de entorno
DOMINIO="${DOMINIO:-}"
NGINX_CONF="${NGINX_CONF:-/etc/nginx/sites-available/batiast}"

# ── 1. Recopilar datos ────────────────────────────────────────────────────────
TENANT_ID=$(get_val "TENANT_ID" "ID del tenant (ej: tacos-pepe-gdl)")
[[ -z "$TENANT_ID" ]]                   && error "El ID no puede estar vacío."
[[ ! "$TENANT_ID" =~ ^[a-z0-9-]+$ ]]   && error "El ID debe ser minúsculas, números y guiones."

# Verificar que no exista ya en PM2
if command -v pm2 &>/dev/null && pm2 list --no-color 2>/dev/null | grep -q " ${TENANT_ID} "; then
  error "El tenant '${TENANT_ID}' ya está corriendo en PM2. Detenlo primero con: pm2 delete ${TENANT_ID}"
fi
if [[ -f "$ENVS_DIR/${TENANT_ID}.env" ]]; then
  error "Ya existe envs/${TENANT_ID}.env — elimínalo antes de reprovisionar."
fi

NOMBRE=$(get_val    "PROV_NOMBRE"     "Nombre del negocio"      "$TENANT_ID")
CIUDAD=$(get_val    "PROV_CIUDAD"     "Ciudad"                  "")
ESTADO=$(get_val    "PROV_ESTADO"     "Estado"                  "")
GRUPO_ID=$(get_val        "PROV_GRUPO_ID"         "GRUPO_ID de WhatsApp (enter para omitir)"           "")
GROQ_API_KEY=$(get_val    "PROV_GROQ_API_KEY"     "GROQ_API_KEY (enter para omitir)"                  "")
BUSINESS_TYPE=$(get_val   "PROV_BUSINESS_TYPE"    "Giro de negocio (taqueria/pizzeria/hamburgueseria)"  "taqueria")
SECCION_TAQUERIA=$(get_val "PROV_SECCION_TAQUERIA" "Sección taquería (ambas/carnitas/asada)"            "ambas")
PLAN=$(get_val            "PROV_PLAN"             "Plan (basico / plus / pro)"                         "basico")
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
          ss -tlnp 2>/dev/null | grep -q ":${PUERTO_SUGERIDO} "; do
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

PANEL_INITIAL_PASSWORD=$(get_val "PROV_PANEL_INITIAL_PASSWORD" "Contraseña inicial del panel (vacío = generar automático)" "")
if [[ -z "$PANEL_INITIAL_PASSWORD" ]]; then
  PANEL_INITIAL_PASSWORD=$(openssl rand -base64 24 2>/dev/null | tr -dc 'A-Za-z0-9' | head -c 20 || true)
  [[ ${#PANEL_INITIAL_PASSWORD} -lt 12 ]] && PANEL_INITIAL_PASSWORD="Cambiar-${PANEL_SECRET:0:12}"
  ok "Contraseña inicial del panel generada automáticamente."
fi

# ── 2. Crear envs/{TENANT_ID}.env ─────────────────────────────────────────────
mkdir -p "$ENVS_DIR"
cat > "$ENVS_DIR/${TENANT_ID}.env" <<EOF
# Generado por provisionar-tenant.sh — $(date)
TENANT_ID=${TENANT_ID}
NOMBRE_NEGOCIO=${NOMBRE}
GRUPO_ID=${GRUPO_ID}
PANEL_PORT=${PANEL_PORT}
PANEL_SECRET=${PANEL_SECRET}
BUSINESS_TYPE=${BUSINESS_TYPE}
SECCION_TAQUERIA_INICIAL=${SECCION_TAQUERIA}
PLAN_ACTIVO=${PLAN}
PANEL_INITIAL_PASSWORD=${PANEL_INITIAL_PASSWORD}

# ── Pagos (opcional) ──────────────────────────────────────────────────────────
$(if [[ -n "$DOMINIO" ]]; then echo "APP_URL=https://${TENANT_ID}.${DOMINIO}"; else echo "# APP_URL=https://mi-servidor.com        # Requerido si MP/Stripe/Conekta está activo"; fi)
# MERCADOPAGO_ACCESS_TOKEN=APP_USR-...   # Activa pagos con link de MercadoPago
# STRIPE_SECRET_KEY=sk_live_...          # Activa pagos con Stripe (Plan Plus)
# CONEKTA_PRIVATE_KEY=key_...            # Activa pagos con Conekta (Plan Plus)

# ── NLU / IA (opcional) ───────────────────────────────────────────────────────
# GROQ_API_KEY=gsk_...                   # Fallback NLU con Groq (llama-3.3-70b)
EOF
[[ -n "$GROQ_API_KEY" ]] && echo "GROQ_API_KEY=${GROQ_API_KEY}" >> "$ENVS_DIR/${TENANT_ID}.env"
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

# ── 4. Crear configuración PM2 y arrancar ─────────────────────────────────────
TMP_CONF="/tmp/${TENANT_ID}-pm2.json"
if command -v python3 &>/dev/null; then
  python3 - <<PYEOF
import json
env = {
    "NODE_ENV": "production",
    "TENANT_ID": "${TENANT_ID}",
    "PANEL_PORT": "${PANEL_PORT}",
    "PANEL_SECRET": "${PANEL_SECRET}",
    "PANEL_INITIAL_PASSWORD": "${PANEL_INITIAL_PASSWORD}",
    "NOMBRE_NEGOCIO": "${NOMBRE}",
    "BUSINESS_TYPE": "${BUSINESS_TYPE}",
    "SECCION_TAQUERIA_INICIAL": "${SECCION_TAQUERIA}",
    "PLAN_ACTIVO": "${PLAN}",
}
if "${GRUPO_ID}":     env["GRUPO_ID"]     = "${GRUPO_ID}"
if "${GROQ_API_KEY}": env["GROQ_API_KEY"] = "${GROQ_API_KEY}"
if "${DOMINIO}":      env["APP_URL"]      = "https://${TENANT_ID}.${DOMINIO}"

config = {
    "apps": [{
        "name": "${TENANT_ID}",
        "script": "${RAIZ}/index.js",
        "cwd": "${RAIZ}",
        "autorestart": True,
        "watch": False,
        "max_memory_restart": "1G",
        "restart_delay": 15000,
        "max_restarts": 10,
        "min_uptime": "30s",
        "out_file":        "${RAIZ}/logs/bot-out.log",
        "error_file":      "${RAIZ}/logs/bot-err.log",
        "log_date_format": "YYYY-MM-DD HH:mm:ss",
        "merge_logs": True,
        "env": env
    }]
}
with open("${TMP_CONF}", "w") as f:
    json.dump(config, f, indent=2)
print("Configuracion PM2 lista.")
PYEOF
fi

if command -v pm2 &>/dev/null; then
  info "Arrancando bot '${TENANT_ID}' con PM2..."
  if pm2 start "$TMP_CONF"; then
    pm2 save
    rm -f "$TMP_CONF"
    # Marcar como activo en tenants.json
    if command -v python3 &>/dev/null; then
      python3 - <<PYEOF
import json
file = '${TENANTS_FILE}'
with open(file) as f: data = json.load(f)
for t in data['tenants']:
    if t['id'] == '${TENANT_ID}': t['activo'] = True
with open(file, 'w') as f: json.dump(data, f, ensure_ascii=False, indent=2)
PYEOF
      ok "Tenant marcado como activo."
    fi
    ok "Bot arrancado. Iniciará en ~30s y mostrará el QR en el super admin."

    # ── Registrar subdominio en Nginx ─────────────────────────────────────────
    if [[ -n "$DOMINIO" && -f "$NGINX_CONF" ]]; then
      if grep -q "${TENANT_ID}\.${DOMINIO}" "$NGINX_CONF"; then
        ok "Subdominio ${TENANT_ID}.${DOMINIO} ya existía en Nginx."
      else
        sudo sed -i "/default[[:space:]]*0;/i\\    ${TENANT_ID}.${DOMINIO}  ${PANEL_PORT};" "$NGINX_CONF"
        if sudo nginx -t &>/dev/null; then
          sudo systemctl reload nginx
          ok "Subdominio https://${TENANT_ID}.${DOMINIO} registrado en Nginx."
        else
          warn "Error en configuración de Nginx — agrega manualmente: ${TENANT_ID}.${DOMINIO}  ${PANEL_PORT};"
          sudo sed -i "/${TENANT_ID}\.${DOMINIO}/d" "$NGINX_CONF"
        fi
      fi
    elif [[ -n "$DOMINIO" ]]; then
      warn "Nginx no encontrado en ${NGINX_CONF} — agrega manualmente: ${TENANT_ID}.${DOMINIO}  ${PANEL_PORT};"
    fi
  else
    warn "pm2 start falló. Intenta manualmente: pm2 start ${TMP_CONF}"
  fi
else
  warn "pm2 no encontrado en PATH. Arranca el bot manualmente:"
  warn "  pm2 start ${TMP_CONF}"
fi

# ── Resumen ───────────────────────────────────────────────────────────────────
echo ""
echo "━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━"
ok "Tenant \"${NOMBRE}\" (${TENANT_ID}) provisionado."
echo "━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━"
echo ""
if [[ -n "$DOMINIO" ]]; then
  echo -e "  Panel tenant : ${CYAN}https://${TENANT_ID}.${DOMINIO}${NC}"
else
  echo -e "  Panel tenant : ${CYAN}http://TU-IP:${PANEL_PORT}${NC}"
fi
echo -e "  Usuario panel: ${CYAN}admin${NC}"
echo -e "  Contraseña   : ${CYAN}${PANEL_INITIAL_PASSWORD}${NC}  (cambiar en el primer ingreso)"
echo -e "  Proceso PM2  : ${CYAN}pm2 logs ${TENANT_ID}${NC}"
echo -e "  BD           : ${CYAN}data/${TENANT_ID}.db${NC}"
echo ""
echo -e "${YELLOW}Escanea el QR desde el super admin (sección QR del tenant).${NC}"
echo ""
echo "[LISTO]"
