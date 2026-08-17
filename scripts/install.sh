#!/usr/bin/env bash
# scripts/install.sh
# Instalación completa de producción en un VPS limpio (Ubuntu/Debian).
#
# Uso:
#   bash scripts/install.sh <dominio>
#   bash scripts/install.sh batiast.com
#
# Qué hace:
#   1. npm install
#   2. Genera .env con secretos aleatorios (vía setup.sh)
#   3. Instala Nginx y Certbot si no están
#   4. Crea la configuración Nginx con mapa de puertos por subdominio
#   5. Obtiene el certificado wildcard *.dominio vía DNS challenge (paso manual)
#   6. Actualiza Nginx con HTTPS y activa COOKIE_SECURE
#   7. Arranca superadmin y webhook-deploy en PM2
#   8. Configura el arranque automático de PM2 al reiniciar el servidor
#   9. Persiste DOMINIO en .env para que provisionar-tenant.sh lo use

set -euo pipefail

# ── Parámetros ─────────────────────────────────────────────────────────────────
DOMINIO="${1:-}"
if [[ -z "$DOMINIO" ]]; then
  echo "Uso: bash scripts/install.sh <dominio>"
  echo "Ejemplo: bash scripts/install.sh batiast.com"
  exit 1
fi

RAIZ="$(cd "$(dirname "$0")/.." && pwd)"
NGINX_CONF="/etc/nginx/sites-available/batiast"
NGINX_ENABLED="/etc/nginx/sites-enabled/batiast"

# ── Colores ────────────────────────────────────────────────────────────────────
GREEN='\033[0;32m'
YELLOW='\033[1;33m'
CYAN='\033[0;36m'
RED='\033[0;31m'
NC='\033[0m'
ok()   { echo -e "${GREEN}✓${NC} $*"; }
warn() { echo -e "${YELLOW}⚠${NC} $*"; }
info() { echo -e "${CYAN}→${NC} $*"; }
err()  { echo -e "${RED}✗${NC} $*" >&2; exit 1; }

echo ""
echo "━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━"
echo "  Rajem's Technology — Instalación de producción"
echo "  Directorio : $RAIZ"
echo "  Dominio    : $DOMINIO"
echo "━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━"
echo ""

# ── 1. Dependencias npm ────────────────────────────────────────────────────────
info "Instalando dependencias npm..."
cd "$RAIZ"
npm install --omit=dev 2>&1 | tail -3
ok "Dependencias npm instaladas."

# ── 2. Generar .env ────────────────────────────────────────────────────────────
if [[ ! -f "$RAIZ/.env" ]]; then
  info "Generando .env con secretos aleatorios..."
  bash "$RAIZ/scripts/setup.sh"
else
  ok ".env ya existe — se conserva."
fi

# Persiste DOMINIO en .env para que provisionar-tenant.sh lo herede via dotenv
if ! grep -q "^DOMINIO=" "$RAIZ/.env"; then
  echo "" >> "$RAIZ/.env"
  echo "# Dominio principal (lo usa provisionar-tenant.sh para registrar subdominios Nginx)" >> "$RAIZ/.env"
  echo "DOMINIO=$DOMINIO" >> "$RAIZ/.env"
  ok "DOMINIO=$DOMINIO guardado en .env"
else
  DOMINIO_ACTUAL=$(grep "^DOMINIO=" "$RAIZ/.env" | cut -d= -f2)
  if [[ "$DOMINIO_ACTUAL" != "$DOMINIO" ]]; then
    warn "El .env ya tiene DOMINIO=$DOMINIO_ACTUAL — actualizando a $DOMINIO"
    sed -i "s/^DOMINIO=.*/DOMINIO=$DOMINIO/" "$RAIZ/.env"
  else
    ok "DOMINIO=$DOMINIO ya estaba en .env"
  fi
fi

# ── 3. Instalar Nginx ──────────────────────────────────────────────────────────
if ! command -v nginx &>/dev/null; then
  info "Instalando Nginx..."
  sudo apt-get update -qq
  sudo apt-get install -y nginx
  ok "Nginx instalado."
else
  ok "Nginx ya está instalado ($(nginx -v 2>&1 | head -1))."
fi

# ── 4. Instalar Certbot ────────────────────────────────────────────────────────
if ! command -v certbot &>/dev/null; then
  info "Instalando Certbot..."
  sudo apt-get install -y certbot
  ok "Certbot instalado."
else
  ok "Certbot ya está instalado."
fi

# ── 5. Crear configuración Nginx ───────────────────────────────────────────────
_crear_nginx_http() {
  sudo tee "$NGINX_CONF" > /dev/null <<NGINX_EOF
# Rajem's Technology — $DOMINIO
# Generado por install.sh el $(date '+%Y-%m-%d')
#
# IMPORTANTE: El bloque "map" es modificado automáticamente por
# provisionar-tenant.sh al agregar/eliminar tenants. No edites las
# líneas del map a mano sin entender el formato esperado por sed.

map \$host \$target_port {
    admin.$DOMINIO  3001;
    default         0;
}

server {
    listen 80;
    server_name admin.$DOMINIO *.$DOMINIO;

    location / {
        if (\$target_port = 0) {
            return 404;
        }
        proxy_pass         http://127.0.0.1:\$target_port;
        proxy_http_version 1.1;
        proxy_set_header   Upgrade    \$http_upgrade;
        proxy_set_header   Connection 'upgrade';
        proxy_set_header   Host       \$host;
        proxy_set_header   X-Real-IP          \$remote_addr;
        proxy_set_header   X-Forwarded-For    \$proxy_add_x_forwarded_for;
        proxy_set_header   X-Forwarded-Proto  \$scheme;
        proxy_read_timeout 120s;
        proxy_cache_bypass \$http_upgrade;
    }
}
NGINX_EOF
}

_crear_nginx_https() {
  sudo tee "$NGINX_CONF" > /dev/null <<NGINX_SSL_EOF
# Rajem's Technology — $DOMINIO
# Generado por install.sh el $(date '+%Y-%m-%d')
#
# IMPORTANTE: El bloque "map" es modificado automáticamente por
# provisionar-tenant.sh al agregar/eliminar tenants. No edites las
# líneas del map a mano sin entender el formato esperado por sed.

map \$host \$target_port {
    admin.$DOMINIO  3001;
    default         0;
}

server {
    listen 80;
    server_name admin.$DOMINIO *.$DOMINIO;
    return 301 https://\$host\$request_uri;
}

server {
    listen 443 ssl;
    server_name admin.$DOMINIO *.$DOMINIO;

    ssl_certificate     /etc/letsencrypt/live/$DOMINIO/fullchain.pem;
    ssl_certificate_key /etc/letsencrypt/live/$DOMINIO/privkey.pem;
    ssl_protocols       TLSv1.2 TLSv1.3;
    ssl_ciphers         HIGH:!aNULL:!MD5;
    add_header          Strict-Transport-Security "max-age=31536000" always;

    location / {
        if (\$target_port = 0) {
            return 404;
        }
        proxy_pass         http://127.0.0.1:\$target_port;
        proxy_http_version 1.1;
        proxy_set_header   Upgrade    \$http_upgrade;
        proxy_set_header   Connection 'upgrade';
        proxy_set_header   Host       \$host;
        proxy_set_header   X-Real-IP          \$remote_addr;
        proxy_set_header   X-Forwarded-For    \$proxy_add_x_forwarded_for;
        proxy_set_header   X-Forwarded-Proto  \$scheme;
        proxy_read_timeout 120s;
        proxy_cache_bypass \$http_upgrade;
    }
}
NGINX_SSL_EOF
}

CERT_PATH="/etc/letsencrypt/live/$DOMINIO"

if [[ ! -f "$NGINX_CONF" ]]; then
  if [[ -d "$CERT_PATH" ]]; then
    # Cert ya existe — crear directamente con HTTPS
    info "Certificado ya existe. Creando configuración Nginx con HTTPS..."
    _crear_nginx_https
  else
    # Sin cert aún — crear HTTP temporal
    info "Creando configuración Nginx (HTTP temporal, se actualizará tras el cert)..."
    _crear_nginx_http
  fi

  # Habilitar el sitio y desactivar el default
  [[ ! -L "$NGINX_ENABLED" ]] && sudo ln -sf "$NGINX_CONF" "$NGINX_ENABLED"
  [[ -L "/etc/nginx/sites-enabled/default" ]] && sudo rm -f /etc/nginx/sites-enabled/default

  if sudo nginx -t &>/dev/null; then
    sudo systemctl enable nginx &>/dev/null || true
    sudo systemctl reload nginx
    ok "Nginx configurado y recargado."
  else
    sudo nginx -t
    err "Error en la configuración de Nginx — revisa $NGINX_CONF"
  fi
else
  ok "Configuración Nginx ya existe ($NGINX_CONF) — se conserva."
fi

# ── 6. Certificado SSL wildcard ────────────────────────────────────────────────
if [[ ! -d "$CERT_PATH" ]]; then
  echo ""
  echo "━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━"
  warn "PASO MANUAL: certificado SSL wildcard"
  echo ""
  echo "  Se obtendrá un certificado wildcard para *.$DOMINIO"
  echo "  que cubre admin.$DOMINIO y todos los paneles de tenant."
  echo ""
  echo "  Certbot mostrará un valor TXT. Deberás crear ese registro en:"
  echo "    Hostinger → DNS / Nameservers → Agregar TXT"
  echo "    Nombre : _acme-challenge.$DOMINIO"
  echo "    Valor  : (lo muestra certbot)"
  echo ""
  echo "  Espera ~1-2 minutos en Hostinger tras guardar, y luego"
  echo "  presiona Enter en certbot para que valide."
  echo "━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━"
  echo ""
  read -rp "Presiona Enter para iniciar Certbot..." _

  sudo certbot certonly \
    --manual \
    --preferred-challenges dns \
    --agree-tos \
    --no-eff-email \
    -m "admin@$DOMINIO" \
    -d "$DOMINIO" \
    -d "*.$DOMINIO"

  ok "Certificado SSL obtenido en $CERT_PATH"

  # Reemplazar config HTTP por HTTPS
  info "Actualizando Nginx con configuración HTTPS..."
  _crear_nginx_https

  if sudo nginx -t &>/dev/null; then
    sudo systemctl reload nginx
    ok "Nginx actualizado a HTTPS."
  else
    sudo nginx -t
    err "Error en la configuración HTTPS de Nginx."
  fi

  # Activar COOKIE_SECURE en .env
  if grep -q "^# COOKIE_SECURE=1" "$RAIZ/.env"; then
    sed -i 's/^# COOKIE_SECURE=1/COOKIE_SECURE=1/' "$RAIZ/.env"
    ok "COOKIE_SECURE=1 activado en .env"
  fi

  # Renovación automática (cron de certbot suele instalarse solo; esto lo asegura)
  if ! sudo crontab -l 2>/dev/null | grep -q "certbot renew"; then
    (sudo crontab -l 2>/dev/null; echo "0 3 * * * certbot renew --quiet && systemctl reload nginx") | sudo crontab -
    ok "Cron de renovación SSL configurado (3 AM diario)."
  fi
else
  ok "Certificado SSL ya existe ($CERT_PATH) — se conserva."
fi

# ── 7. Arrancar procesos base en PM2 ──────────────────────────────────────────
info "Verificando procesos PM2..."

SA_RUNNING=$(pm2 list --no-color 2>/dev/null | grep -c " superadmin " || true)
WH_RUNNING=$(pm2 list --no-color 2>/dev/null | grep -c " webhook-deploy " || true)

if [[ "$SA_RUNNING" -gt 0 && "$WH_RUNNING" -gt 0 ]]; then
  ok "superadmin y webhook-deploy ya están en PM2."
elif [[ "$SA_RUNNING" -gt 0 ]]; then
  pm2 start ecosystem.config.js --only webhook-deploy
  ok "webhook-deploy arrancado."
elif [[ "$WH_RUNNING" -gt 0 ]]; then
  pm2 start ecosystem.config.js --only superadmin
  ok "superadmin arrancado."
else
  pm2 start ecosystem.config.js --only superadmin,webhook-deploy
  ok "superadmin y webhook-deploy arrancados."
fi

pm2 save
ok "pm2 save completado."

# ── 8. Arranque automático de PM2 al reiniciar ─────────────────────────────────
STARTUP_OUTPUT=$(pm2 startup 2>&1 || true)
STARTUP_CMD=$(echo "$STARTUP_OUTPUT" | grep -E "^\s*sudo\s+env\s+" | head -1 || true)

if [[ -n "$STARTUP_CMD" ]]; then
  info "Configurando pm2 startup..."
  eval "$STARTUP_CMD"
  pm2 save
  ok "Arranque automático de PM2 configurado."
else
  ok "Arranque automático de PM2 ya estaba configurado."
fi

# ── Resumen final ──────────────────────────────────────────────────────────────
PASS=$(grep "^SUPERADMIN_INITIAL_PASSWORD=" "$RAIZ/.env" 2>/dev/null | cut -d= -f2 || echo "(ver .env)")

echo ""
echo "━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━"
ok "Instalación completada."
echo ""

if [[ -d "$CERT_PATH" ]]; then
  echo -e "  Super admin : ${CYAN}https://admin.$DOMINIO${NC}"
else
  IP_PUBLICA=$(curl -s --max-time 5 ifconfig.me 2>/dev/null || echo "IP-DEL-SERVIDOR")
  echo -e "  Super admin : ${CYAN}http://$IP_PUBLICA:3001${NC}  (HTTPS pendiente)"
fi

echo -e "  Usuario     : ${CYAN}rajem${NC}"
echo -e "  Contraseña  : ${CYAN}$PASS${NC}  (cambiar tras el primer login)"
echo ""
echo "Próximos pasos:"
if [[ ! -d "$CERT_PATH" ]]; then
  echo "  1. Apunta admin.$DOMINIO y *.$DOMINIO a este servidor en Hostinger"
  echo "  2. Corre de nuevo: bash scripts/install.sh $DOMINIO  (para obtener el cert SSL)"
else
  echo "  1. Asegúrate de que admin.$DOMINIO y *.$DOMINIO apunten a este servidor"
fi
echo "  2. Abre el super admin en el navegador"
echo "  3. Ve a Tenants → Nuevo tenant para provisionar tu primer bot"
echo ""
echo "Comandos útiles:"
echo "  pm2 list"
echo "  pm2 logs superadmin --lines 50"
echo "  pm2 logs webhook-deploy --lines 50"
echo "━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━"
echo ""
