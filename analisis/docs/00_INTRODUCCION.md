# Introducción al Proyecto — Bot WhatsApp Tacos Javier

**Versión:** carnitas-bot 1.4  
**Stack:** Node.js · whatsapp-web.js · Groq · better-sqlite3 · Express · Winston · PM2  
**Fecha documento:** 24 Mayo 2026

---

## ¿Qué es este proyecto?

Un **bot de WhatsApp conversacional** para tomar pedidos de una taquería (Tacos Javier, Culiacán, Sinaloa). El cliente escribe por WhatsApp como lo haría con cualquier persona, y el bot lo guía desde el saludo hasta la confirmación del pedido sin intervención humana.

El sistema tiene tres propósitos concretos:

1. **Eliminar la carga operativa del teléfono** — el dueño no necesita estar pendiente de WhatsApp para tomar pedidos
2. **Registrar automáticamente clientes y pedidos** en una base de datos consultable desde un panel web
3. **Sentar las bases técnicas para escalar** a múltiples negocios de comida sin cambiar el código

---

## Tecnologías empleadas

### Node.js (runtime principal)
- **Versión recomendada:** 18 LTS o superior
- **Por qué:** Modelo de concurrencia basado en eventos (ideal para I/O de mensajería), ecosistema npm maduro
- **Rol:** Corre el bot, el panel web y la base de datos en un único proceso

### whatsapp-web.js
- **Qué es:** Librería que automatiza una sesión de WhatsApp Web mediante Puppeteer (Chromium en modo headless)
- **Cómo funciona:** Simula un navegador conectado a WhatsApp Web. No usa la API oficial de Meta.
- **Ventajas:** Gratuito, funciona con cualquier número de WhatsApp personal o de negocio
- **Limitaciones:** Depende de que WhatsApp no cambie su interfaz web; ocasionalmente desconecta y requiere re-escanear QR; no es adecuado para volúmenes muy altos

### Groq (API de IA)
- **Modelo:** `llama-3.3-70b-versatile`
- **Rol:** Fallback de último recurso — solo se invoca cuando el parser local no puede interpretar el mensaje
- **Timeout configurado:** 15 segundos. Si no responde, hace un reintento; si falla el reintento, envía mensaje de error al cliente
- **Costo:** Variable según plan (free tier: ~30 req/min)
- **Cobertura estimada:** El parser local maneja ~95% de los mensajes; Groq recibe solo el ~5% restante

### better-sqlite3 (base de datos)
- **Qué es:** Bindings nativos síncronos de SQLite para Node.js — más eficiente que sql.js (WebAssembly)
- **Cómo persiste:** Cada escritura se persiste inmediatamente a disco. No hay buffer ni debounce.
- **Archivo en disco:** `data/tacos_javier.db` — se crea automáticamente si no existe
- **Ventajas:** Más rápido que sql.js, menor bloqueo del event loop, sin archivos WAL (journal_mode=DELETE)
- **`guardarDB()`:** No-op — existe por compatibilidad con código legacy, pero better-sqlite3 ya persiste automáticamente

### Winston (logging)
- **Rol:** Logger estructurado a consola y a archivos en `logs/`
- **Archivos:** `logs/bot-combined.log` (todo) y `logs/bot-err.log` (solo errores)
- **El directorio `logs/` se crea automáticamente** al arrancar si no existe

### PM2 (proceso manager)
- **Rol:** Mantiene el bot vivo en producción (`autorestart: true`), gestiona logs y permite monitoreo
- **Config:** `ecosystem.config.js` en la raíz del proyecto
- **Uso:** `npm run pm2:start` para arrancar en producción

### Express (panel admin)
- **Rol:** Servidor HTTP que sirve el panel de administración (SPA estática) y expone una API REST
- **Puerto:** Configurable via `PANEL_PORT` (.env), default 3000
- **Autenticación:** express-session + bcrypt. Cookie de sesión de 8 horas.

### Puppeteer / Chromium
- **Rol:** Motor que usa whatsapp-web.js internamente
- **Consumo de memoria:** 200–500 MB solo el navegador
- **Flags usados:** `--no-sandbox`, `--disable-setuid-sandbox`, `--disable-dev-shm-usage`, `--disable-gpu` (optimizados para entornos Linux sin GUI)

---

## Estructura de carpetas

```
carnitas-bot 1.4/
│
├── index.js                    ← Punto de entrada: Sentry, BD, panel, bot WA, backup, reconnección
├── package.json
├── ecosystem.config.js         ← Configuración de PM2 para producción
├── .env                        ← Variables de entorno (no se versiona)
├── data/
│   ├── tacos_javier.db         ← Archivo SQLite (se genera automáticamente)
│   └── backups/                ← Backups automáticos con timestamp
├── logs/
│   ├── bot-combined.log        ← Log completo (info, warn, error)
│   └── bot-err.log             ← Solo errores
│
├── src/
│   ├── logger.js               ← Winston logger (consola + archivos)
│   ├── handlers/
│   │   ├── mensajes.js         ← Router principal de mensajes (~178 líneas)
│   │   ├── pedidoParser.js     ← Parser NLU local con sistema de score
│   │   ├── respuestas.js       ← Respuestas FAQ sin Groq
│   │   ├── imagenes.js         ← Procesamiento de comprobantes de pago
│   │   ├── comandos.js         ← Comandos del grupo admin (!pedidos, !confirmar, !limpiar…)
│   │   └── flujos/
│   │       ├── formulario.js   ← Primer mensaje, tipo de entrega, formulario
│   │       ├── orden.js        ← Toma de pedido, corte, tipo ítem, Groq
│   │       ├── resumen.js      ← Resumen final, confirmación, MercadoPago
│   │       ├── edicion.js      ← Edición de campos
│   │       ├── cancelacion.js  ← Flujo de cancelación
│   │       └── utils.js        ← Helpers, rate limiting WA, timeout bifásico 20/35 min
│   │
│   ├── estado/
│   │   ├── maps.js             ← Todos los Maps de estado en memoria
│   │   ├── campos.js           ← Interpretación de campos + utilidades de teléfono
│   │   ├── sesiones.js         ← Serialización y restauración de sesiones
│   │   ├── bot-pausado.js      ← Estado global de pausa del bot (singleton)
│   │   └── index.js            ← Re-exporta todo (usar require("../estado"))
│   │
│   ├── db/
│   │   ├── core.js             ← Motor BD: initDB, queryAll, queryOne, run (better-sqlite3)
│   │   ├── seed.js             ← Crea tablas y datos iniciales / migraciones
│   │   ├── modelos.js          ← CRUD: productos, clientes, pedidos
│   │   ├── config.js           ← CRUD: configuración, horarios, banco, JIDs
│   │   └── index.js            ← Re-exporta todo (usar require("../db"))
│   │
│   ├── pedido/
│   │   ├── resumen.js          ← Genera el texto del resumen final del pedido
│   │   └── precios.js          ← Calcula subtotales y precios desde BD
│   │
│   ├── prompts/
│   │   ├── index.js            ← buildPrompt(): construye el system prompt para Groq
│   │   └── base.js             ← Instrucciones base del prompt
│   │
│   ├── pagos/
│   │   └── mercadopago.js      ← Wrapper SDK v3: crearEnlacePago, procesarPago, estaConfigurado
│   │
│   ├── panel/
│   │   ├── server.js           ← Express app: rutas API, auth, webhook MP, health check
│   │   ├── whatsapp-bridge.js  ← Singleton del cliente WA (evita deps circulares)
│   │   └── public/
│   │       └── index.html      ← SPA del panel (~870 líneas) + wizard de onboarding
│   │
│   ├── config.js               ← Helpers de configuración del negocio
│   └── horario.js              ← Lógica de horario de atención
│
├── scripts/
│   ├── backup-db.js            ← Backup de la BD a data/backups/ (se corre cada 6h)
│   ├── onboarding.js           ← Asistente CLI de configuración inicial
│   ├── reset-password.js       ← Resetear contraseña del panel sin saber la actual
│   └── nuevo-tenant.js         ← Provisionar nueva instancia (SaaS)
│
└── analisis/
    ├── bitacora_carnitas_bot.md
    ├── mapeo_faqs.md
    ├── deteccion_intencion_nlu.md
    └── docs/                   ← Esta carpeta (documentación de capacitación)
```

---

## Variables de entorno (.env)

```env
# Obligatorias
GROQ_API_KEY=gsk_...             # Clave de API de Groq
GRUPO_ID=521XXXXXXXXXX@g.us      # JID del grupo de WhatsApp de administración

# Opcionales con defaults seguros
PANEL_PORT=3000                  # Puerto del panel web (default: 3000)
PANEL_SECRET=...                 # Secreto para cookies de sesión (recomendado en producción)
TENANT_ID=carnitas-bot           # Identificador de la sesión WA (usar uno distinto por instancia)

# Opcionales (funcionalidades extra)
SENTRY_DSN=                      # DSN de Sentry — si está definido, activa monitoreo de errores
MERCADOPAGO_ACCESS_TOKEN=        # Access token de MP — activa pagos con link de cobro
APP_URL=https://mi-servidor.com  # URL pública del servidor (requerida si usas MercadoPago)
```

---

## Arrancar el proyecto

```bash
# 1. Instalar dependencias
npm install

# 2. Crear .env con las variables necesarias
cp .env.example .env

# 3. Iniciar en desarrollo (nodemon + hot-reload)
npm run dev

# 4. Primera vez: escanear QR que aparece en la terminal con WhatsApp
#    WhatsApp → Dispositivos vinculados → Vincular dispositivo

# 5. Panel admin: http://localhost:3000
#    Usuario: admin   Contraseña: admin123

# 6. (Opcional) Configurar el negocio con el wizard
#    Abre el panel → el wizard aparece automáticamente al primer login
#    O usa la CLI: node scripts/onboarding.js

# --- Producción con PM2 ---
npm install -g pm2
npm run pm2:start
pm2 save && pm2 startup
```

**Nota:** Después de un reinicio del bot, WhatsApp Web tarda 15–30 segundos en reconectarse. Durante ese tiempo no se procesan mensajes. El bot reintenta automáticamente con backoff exponencial (hasta 8 reintentos).

---

## Flujo de datos de alto nivel

```
Cliente WhatsApp
      │  mensaje de texto
      ▼
 whatsapp-web.js (Puppeteer/Chromium)
      │  evento "message"
      ▼
 index.js
      │  si msg.from termina en @lid:
      │  → client.getContactLidAndPhone() → obtiene JID real (@c.us)
      │  → reemplaza msg.from con el JID real
      ▼
 handleMensaje()
      │
      ├─► Parser local (pedidoParser.js)    ← 95% de los casos
      │         │ si no puede parsear
      │         ▼
      └─► Groq API (llama-3.3-70b)         ← 5% restante
      │
      ▼
 Estado en memoria (Maps)
      │  al cambiar estado
      ▼
 better-sqlite3 → persiste automáticamente → tacos_javier.db
      │
      ▼
 Panel admin (Express) → http://localhost:3000
      │
      ▼
 Backup automático → data/backups/ (cada 6h via fork())
```
