#!/usr/bin/env bash
# scripts/provisionar-tenant.sh
# Provisiona un nuevo tenant: crea directorio, .env, imagen Docker y lo registra en tenants.json.
# Uso: bash scripts/provisionar-tenant.sh
# Requisito: ejecutar desde la raíz del proyecto en el VPS.

set -euo pipefail

# ── Colores ───────────────────────────────────────────────────────────────────
RED='\033[0;31m'; GREEN='\033[0;32m'; YELLOW='\033[1;33m'; CYAN='\033[0;36m'; NC='\033[0m'
info()    { echo -e "${CYAN}▶ $*${NC}"; }
ok()      { echo -e "${GREEN}✔ $*${NC}"; }
warn()    { echo -e "${YELLOW}⚠ $*${NC}"; }
error()   { echo -e "${RED}✖ $*${NC}"; exit 1; }
ask()     { echo -en "${CYAN}? $1${NC} [${2:-}]: "; read -r REPLY; echo "${REPLY:-${2:-}}"; }

echo ""
echo "━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━"
echo "   Rajem's Technology — Provisionar nuevo tenant"
echo "━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━"
echo ""

# ── 1. Recopilar datos ────────────────────────────────────────────────────────
TENANT_ID=$(ask "ID del tenant (ej: tacos-pepe-gdl, carnitas-norte)")
[[ -z "$TENANT_ID" ]]                   && error "El ID no puede estar vacío."
[[ ! "$TENANT_ID" =~ ^[a-z0-9-]+$ ]]   && error "El ID debe ser minúsculas, números y guiones. Ej: tacos-pepe"

NOMBRE=$(ask "Nombre del negocio" "$TENANT_ID")
CIUDAD=$(ask "Ciudad" "")
ESTADO=$(ask "Estado" "")

# Puerto: buscar el siguiente disponible a partir de 3002
PUERTO_SUGERIDO=3002
TENANTS_JSON="$(dirname "$0")/../data/tenants.json"
if command -v python3 &>/dev/null && [ -f "$TENANTS_JSON" ]; then
  PUERTOS_USADOS=$(python3 -c "
import json, sys
with open('$TENANTS_JSON') as f:
  data=json.load(f)
ports=[t.get('panel_port',0) for t in data.get('tenants',[])]
print(' '.join(map(str,ports)))
" 2>/dev/null || echo "")
  while echo "$PUERTOS_USADOS" | grep -qw "$PUERTO_SUGERIDO" || ss -tlnp 2>/dev/null | grep -q ":$PUERTO_SUGERIDO "; do
    PUERTO_SUGERIDO=$((PUERTO_SUGERIDO + 1))
  done
fi
PANEL_PORT=$(ask "Puerto del panel" "$PUERTO_SUGERIDO")

GROQ_KEY=$(ask "GROQ_API_KEY (gsk_...)")
[[ -z "$GROQ_KEY" ]] && error "La GROQ_API_KEY es requerida."

GRUPO_ID=$(ask "GRUPO_ID de WhatsApp (521XXXXXXXXXX@g.us, enter para omitir)" "")
PANEL_SECRET=$(ask "PANEL_SECRET (dejar vacío para generar uno automático)" "")
if [ -z "$PANEL_SECRET" ]; then
  PANEL_SECRET=$(openssl rand -hex 32 2>/dev/null || cat /proc/sys/kernel/random/uuid 2>/dev/null | tr -d '-' || echo "cambiar-este-secreto-$(date +%s)")
  ok "PANEL_SECRET generado automáticamente."
fi

PLAN=$(ask "Plan (basico / plus / pro)" "basico")
NOTAS=$(ask "Notas (opcional)" "")

# ── 2. Directorio destino ─────────────────────────────────────────────────────
RAIZ="$(cd "$(dirname "$0")/.." && pwd)"
DESTINO="$(cd "$RAIZ/.." && pwd)/$TENANT_ID"

echo ""
info "Directorio destino: $DESTINO"
[ -d "$DESTINO" ] && error "Ya existe la carpeta: $DESTINO"

# ── 3. Copiar código fuente ───────────────────────────────────────────────────
info "Copiando código fuente..."
EXCLUIR=(node_modules .wwebjs_auth .wwebjs_cache data logs .env analisis capturas backups)
RSYNC_EXCLUDES=()
for e in "${EXCLUIR[@]}"; do RSYNC_EXCLUDES+=(--exclude="$e"); done

if command -v rsync &>/dev/null; then
  rsync -a "${RSYNC_EXCLUDES[@]}" "$RAIZ/" "$DESTINO/"
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
# Generado por scripts/provisionar-tenant.sh — $(date)
TENANT_ID=$TENANT_ID
GROQ_API_KEY=$GROQ_KEY
GRUPO_ID=${GRUPO_ID}
PANEL_PORT=$PANEL_PORT
PANEL_SECRET=$PANEL_SECRET
EOF
ok ".env generado."

# ── 6. Registrar en tenants.json ──────────────────────────────────────────────
TENANTS_FILE="$RAIZ/data/tenants.json"
HOY=$(date +%Y-%m-%d)

if [ -f "$TENANTS_FILE" ] && command -v python3 &>/dev/null; then
  python3 - <<PYEOF
import json, sys

with open('$TENANTS_FILE', 'r') as f:
    data = json.load(f)

nuevo = {
    "id":         "$TENANT_ID",
    "nombre":     "$NOMBRE",
    "ciudad":     "$CIUDAD",
    "estado":     "$ESTADO",
    "db_path":    "data/tacos_javier.db",
    "logs_path":  "logs/",
    "panel_port": $PANEL_PORT,
    "activo":     False,
    "plan":       "$PLAN",
    "desde":      "$HOY",
    "notas":      "$NOTAS"
}

# Evitar duplicados
data['tenants'] = [t for t in data['tenants'] if t['id'] != '$TENANT_ID']
data['tenants'].append(nuevo)

with open('$TENANTS_FILE', 'w') as f:
    json.dump(data, f, ensure_ascii=False, indent=2)
print("OK")
PYEOF
  ok "Tenant registrado en tenants.json."
else
  warn "No se pudo actualizar tenants.json automáticamente (python3 no disponible o archivo no encontrado). Agrégalo manualmente desde el super admin."
fi

# ── 7. Instalar dependencias ──────────────────────────────────────────────────
info "Instalando dependencias (npm install --omit=dev)..."
cd "$DESTINO"
npm install --omit=dev --silent && ok "Dependencias instaladas." || warn "npm install falló. Ejecútalo manualmente en: $DESTINO"

# ── 8. Construir y arrancar contenedor Docker ─────────────────────────────────
info "Construyendo imagen Docker y arrancando contenedor..."

# Ajustar docker-compose.yml del nuevo tenant para usar el port correcto
sed -i "s/\"3000:3000\"/\"$PANEL_PORT:3000\"/" "$DESTINO/docker-compose.yml" 2>/dev/null || true
sed -i "s/'3000:3000'/'$PANEL_PORT:3000'/" "$DESTINO/docker-compose.yml" 2>/dev/null || true

if command -v docker &>/dev/null; then
  docker compose -f "$DESTINO/docker-compose.yml" up -d --build \
    && ok "Contenedor Docker arrancado en puerto $PANEL_PORT." \
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
echo -e "  Directorio : ${CYAN}$DESTINO${NC}"
echo -e "  Panel web  : ${CYAN}http://TU-IP:$PANEL_PORT${NC}"
echo ""
echo -e "${YELLOW}Próximo paso:${NC}"
echo "  Escanea el QR de WhatsApp que aparece en los logs del contenedor:"
echo -e "  ${CYAN}docker logs -f $(basename "$DESTINO")${NC}"
echo ""
echo -e "${YELLOW}Si quieres abrir el firewall para el nuevo puerto:${NC}"
echo -e "  ${CYAN}ufw allow $PANEL_PORT/tcp${NC}  (también en Hostinger Cloud Firewall)"
echo ""
