# Rajem's Technology — Bot SaaS de WhatsApp para negocios de comida

> Estado de referencia: 2026-08-13. Este documento describe el código actual; los pendientes se identifican explícitamente.

## Descripción del sistema

Plataforma SaaS multi-tenant de bots de WhatsApp para negocios de comida (actualmente taquería). Cada **tenant** es un negocio independiente con su propio bot, base de datos, sesión de WhatsApp y panel de administración. Un **superadmin** centralizado gestiona todos los tenants.

**Stack:** Node.js · `whatsapp-web.js` · `better-sqlite3` (SQLite) · Express · PM2 · Groq (llama-3.3-70b-versatile como fallback NLU)

**Flujo de un mensaje:** cliente escribe → NLU local (`pedidoParser.js`) → fallback Groq si no se entiende → respuesta WA.

---

## Arquitectura de deployment (producción)

El sistema corre en **bare-metal con PM2** — sin Docker. Un solo VPS aloja todos los procesos.

```
VPS
├── PM2
│   ├── superadmin        → src/superadmin/standalone.js  (puerto 3001)
│   ├── webhook-deploy    → scripts/webhook-deploy.js      (puerto 4000)
│   ├── carnitas-bot      → index.js  (creado al provisionar tenant)
│   ├── tacos-pepe-gdl    → index.js  (creado al provisionar tenant)
│   └── ...más tenants
│
├── /root/Rajem-Bot/          ← codebase compartido (un solo repo)
│   ├── data/
│   │   ├── tenants.json      ← registro de todos los tenants
│   │   ├── carnitas-bot.db   ← BD de cada tenant (nombre = TENANT_ID)
│   │   ├── tacos-pepe-gdl.db
│   │   └── backups/
│   ├── envs/
│   │   ├── carnitas-bot.env  ← env vars de cada tenant
│   │   └── tacos-pepe-gdl.env
│   └── .wwebjs_auth/
│       ├── session-carnitas-bot/    ← sesión WA por tenant (clientId = TENANT_ID)
│       └── session-tacos-pepe-gdl/
```

### Por qué un solo codebase para todos los tenants
- `src/db/core.js` abre `data/{TENANT_ID}.db` — cada tenant tiene su propia BD
- `index.js` usa `LocalAuth({ clientId: TENANT_ID })` — cada tenant tiene su propia sesión WA
- El panel del tenant corre en el puerto `PANEL_PORT` configurado en su .env

---

## Arrancar el proyecto

### Desarrollo local (un solo bot)
```bash
npm start        # producción directa
npm run dev      # nodemon — reinicia al guardar (15-30s para reconectar WA)
npm test         # 5 archivos de tests con el runner nativo de Node
```
Panel tenant en `http://localhost:3000`. En desarrollo, si no se define `PANEL_INITIAL_PASSWORD`, la credencial inicial es `admin` / `admin123`. No usarla en producción.

### Producción en VPS (primera vez)
```bash
git clone https://github.com/djchuvaca/Rajem-Bot.git && cd Rajem-Bot
npm install

# Crear .env mínimo (solo para superadmin y webhook)
cat > .env <<EOF
WEBHOOK_PORT=4000
WEBHOOK_SECRET=<openssl rand -hex 32>
SUPERADMIN_SECRET=<openssl rand -hex 32>
SUPERADMIN_INITIAL_PASSWORD=<contraseña-larga-única>
EOF

pm2 start ecosystem.config.js --only superadmin,webhook-deploy
pm2 save
pm2 startup   # ejecutar el comando que imprima
```
El superadmin debe publicarse detrás de un proxy inverso HTTPS. No se deben exponer directamente a Internet los puertos 3001 ni 4000. El usuario inicial por defecto es `rajem`; la contraseña se toma de `SUPERADMIN_INITIAL_PASSWORD` al crear `admin.db` por primera vez.

### Comandos PM2 útiles
```bash
pm2 list                          # ver todos los procesos
pm2 logs superadmin --lines 50    # logs del superadmin
pm2 logs carnitas-bot --lines 50  # logs de un tenant
pm2 restart carnitas-bot          # reiniciar un tenant
pm2 delete carnitas-bot           # eliminar un tenant de PM2
```

---

## Flujo de provisionamiento de un tenant

1. En el superadmin (`http://IP:3001`), ir a **Tenants → Nuevo tenant**
2. Llenar: ID (slug único), nombre, GRUPO_ID, plan, sección taquería, puerto del panel
3. Hacer clic en **Provisionar** → el superadmin llama a `POST /api/provisionar` → proxea a `webhook-deploy:4000/provisionar`
4. `webhook-deploy` ejecuta `scripts/provisionar-tenant.sh` que:
   - Crea `envs/{TENANT_ID}.env`
   - Registra en `data/tenants.json`
   - Genera JSON de configuración PM2 con todas las env vars del tenant
   - Ejecuta `pm2 start {json}` y `pm2 save`
5. El bot arranca, `index.js` llama `initDB()` que crea `data/{TENANT_ID}.db` y ejecuta `seed.js`
6. `seed.js` seedea todas las tablas usando las env vars del proceso (NOMBRE_NEGOCIO, SECCION_TAQUERIA_INICIAL, BUSINESS_TYPE, PLAN_ACTIVO)
7. El superadmin muestra el QR del tenant para vincular WhatsApp

### Variables que `provisionar-tenant.sh` pasa al JSON de PM2
```
TENANT_ID, NOMBRE_NEGOCIO, GRUPO_ID, PANEL_PORT, PANEL_SECRET, PANEL_INITIAL_PASSWORD,
GROQ_API_KEY (opcional), BUSINESS_TYPE, SECCION_TAQUERIA_INICIAL, PLAN_ACTIVO
```
El script escribe estas variables en `envs/{TENANT_ID}.env` y también las inyecta en el bloque `env` de PM2. `PANEL_SECRET` y `PANEL_INITIAL_PASSWORD` se generan automáticamente si no se proporcionan.

### Eliminar un tenant
El superadmin llama a `POST /api/tenants/:id/eliminar` → proxea a `webhook-deploy:4000/eliminar` → ejecuta `scripts/eliminar-tenant.sh` que:
- `pm2 delete {TENANT_ID} && pm2 save`
- Elimina `envs/{TENANT_ID}.env`
- Elimina `data/{TENANT_ID}.db` y backups
- Elimina `.wwebjs_auth/session-{TENANT_ID}/`
- Limpia `data/tenants.json`

---

## Mapa de archivos clave

### Entrada del bot (por tenant)
- **`index.js`** — arranque, cliente WA, deduplicación de mensajes (Set de 200 IDs), **resolución de LIDs** (si `msg.from` termina en `@lid`, llama a `client.getContactLidAndPhone()` y reemplaza `msg.from` con el JID real antes de enrutar), router principal. Incluye: init Sentry, reconnección con backoff exponencial (5s→10s→20s→…→máx 5min, 8 reintentos), backup automático cada 6h, reset de `entregas_hoy` a medianoche, handlers globales de error.

### Superadmin (proceso separado)
- **`src/superadmin/standalone.js`** — punto de entrada PM2. Llama `startSuperAdmin(port, null)`. Lee `.env` del root del repo. Puerto configurado con `SUPERADMIN_PORT` (default: 3001).
- **`src/superadmin/server.js`** — Express. Auth con sesión SQLite. Rate limiting login (5/min/IP). Endpoints REST para gestionar tenants, colonias, zonas, planes, solicitudes geo, repartidores, reparto. Llama a `webhook-deploy` via HTTP (localhost:4000) para provisionar/eliminar tenants. `WEBHOOK_HOST` default: `localhost` (bare-metal). En Docker sería `host.docker.internal`.
- **`src/superadmin/tenant-reader.js`** — abre conexiones **readonly** a las BDs de cada tenant para métricas y monitoreo. También hace escrituras puntuales (config, colonias, zonas) abriendo conexiones temporales r/w. Funciones clave: `getTenants()`, `upsertTenant()`, `deleteTenant()`, `getTenantStats()`, `getTenantConfig()`, `setTenantConfig()`, `getTenantPlan()`, `setTenantPlan()`, `getTenantBotEstado()`, `getTenantQR()`, `getTenantColonias()`, `getTenantZonas()`, `getTenantRepartidores()`, `getTenantEntregasHistorial()`, `getTenantReporteReparto()`.
- **`src/superadmin/public/index.html`** — SPA del superadmin. Secciones: Dashboard (cards por tenant con stats), Tenants (CRUD + provisionar), Geo (colonias + zonas por tenant), Mandaditos (config + repartidores + historial + reporte de desempeño), Config global. Selectores de tenant en Geo y Mandaditos se pueblan via `populateTenantSelects()` al cargar.

### Infraestructura
- **`src/logger.js`** — Winston logger. Consola coloreada + `logs/bot-err.log` + `logs/bot-combined.log`. Crea `logs/` automáticamente.
- **`ecosystem.config.js`** — Configuración PM2. **Solo tiene 2 apps**: `superadmin` y `webhook-deploy`. Los bots de tenant **NO** están en este archivo — se registran en PM2 dinámicamente al provisionar.
- **`scripts/webhook-deploy.js`** — servidor HTTP en puerto 4000. Endpoints: `GET /health`, `POST /deploy` (webhook GitHub — git pull + pm2 restart), `POST /provisionar` (ejecuta `provisionar-tenant.sh`), `POST /eliminar` (ejecuta `eliminar-tenant.sh`).
- **`scripts/provisionar-tenant.sh`** — aprovisiona un tenant: crea envs/.env, registra en tenants.json, genera JSON PM2, ejecuta pm2 start. Soporta modo no-interactivo (`PROV_NON_INTERACTIVE=1`).
- **`scripts/eliminar-tenant.sh`** — elimina un tenant completo: pm2 delete, archivos, BD, sesión WA.

### Handlers del bot
- **`src/handlers/mensajes.js`** — router delgado (~178 líneas): encadena sub-handlers en orden de prioridad. Usa `detectarTodasPreguntasFrecuentes()` para el bloque global de FAQs (multi-intent).
- **`src/handlers/pedidoParser.js`** — NLU local. Cachés `_cortesCache` + `_cortesRegexCache` (TTL 60s). Exporta `detectarPreguntaFrecuente` (primera coincidencia) y `detectarTodasPreguntasFrecuentes` (array, solo usar en `mensajes.js`). Intents: `precio`, `horario`, `domicilio`, `menu`, `ubicacion`, `metodos_pago`, `descripcion_corte`, `pedido_listo`, `ya_en_camino`, `despedida`, `total_parcial`. Funciones NLU multi-giro: `_buildItemTypesPattern()`, `_getItemTypesActivos()`, `detectarTipoItemDesdeTexto(texto)`, `listaItemTypes(soloUnidad?)`, `parsearItem(fragmento)`.
- **`src/handlers/respuestas.js`** — respuestas FAQ sin Groq. `aplicarQuitarUno(ordenTexto, corte?)` acepta corte opcional.
- **`src/handlers/comandos.js`** — comandos de grupo: `!pedidos`, `!pendientes`, `!confirmados`, `!cancelados`, `!rechazados`, `!domicilios`, `!mostradores`, `!pedido`, `!confirmar`, `!listo`, `!cancelar`, `!rechazar`, `!cliente`, `!buscar`, `!historial`, `!top`, `!editar`, `!mensaje`, `!stats`, `!reporte`, `!precios`, `!precio`, `!agotado`, `!disponible`, `!cerrar`, `!abrir`, `!pausar`, `!reanudar`, `!sesiones`, `!resetear`, `!limpiar`, `!estado`, `!ayuda`. El comando `!confirmar` en pedidos a domicilio llama `despacharConDelay()`.
- **`src/handlers/imagenes.js`** — recibe comprobantes de transferencia vía imagen.
- **`src/handlers/mandaditos.js`** — módulo de reparto. Ver sección Mandaditos.

### Flujos (`src/handlers/flujos/`)
- **`formulario.js`** — primer mensaje, tipo de entrega, formulario progresivo, cambio de tipo durante formulario. `interpretarCampos()` captura datos del primer mensaje. `extraerTelefonoDeJID()` pre-llena teléfono.
- **`orden.js`** — toma de pedido: estados críticos bloqueantes, corte, tipo ítem, confirmación, agregar más, parser local, Groq fallback (retry + timeout 15s).
- **`edicion.js`** — edición de campos durante el formulario y desde el resumen.
- **`resumen.js`** — resumen final, confirmación. BD se guarda **antes** de confirmar al cliente. Si MP está configurado, genera link de pago; si no, flujo banco+foto. En domicilios efectivo/tarjeta llama `despacharConDelay()` al confirmar.
- **`cancelacion.js`** — flujo de cancelación.
- **`utils.js`** — `replyConTyping()` (rate limiting **2s/JID**), `enFlujoActivo()`, `parsearSinCorteItems()`, `palabrasConfirmacion`. Maps en memoria: `telefonosReales`, `ultimoPedido`, `ultimaActividad`, `recordatorioEnviado`. Timeout en dos fases: **20 min** → recordatorio contextual (jitter 1-3s), **35 min** → `limpiarTodo()`.

### Estado (Maps en memoria)
- **`src/estado/maps.js`** — todos los Maps: `clientesNuevos`, `pendientesConfirmacion`, `tipoEntregaCliente`, `esperandoTipoItem`, `datosCampos`, `pedidoJSONActual`, etc.
- **`src/estado/bot-pausado.js`** — singleton `{ pausado: false }`. `!pausar`/`!reanudar` lo modifican.
- **`src/estado/campos.js`** — `limpiarTodo()`, `interpretarCampos()`, `siguienteCampoFaltante()`, `extraerTelefono()` (regex con validación LADA mexicano `^[2-9]`), `extraerTelefonoDeJID()` (devuelve `null` para `@lid`).
- **`src/estado/sesiones.js`** — serialización/restauración a BD. TTL 48h. Todos los Maps críticos incluyendo `pendientesConfirmacion`.
- **`src/estado/index.js`** — re-exporta todo.

### Giros (módulos de negocio)
- **`src/giros/taqueria.js`** — fuente única de verdad del giro taquería. Define `itemTypes[]`, `cortes[]`, `refrescos[]`, `salsas[]`, `configDefaults`, `vocabulario`, `mensajesDefaults` y `comportamiento`. El NLU toma nombre, alias y descripción de aquí; SQLite solo superpone activación y precio por tenant.
- **`src/giros/index.js`** — `getGiroActivo()`, `getGiro(slug)`, `listGiros()`.
- **`src/giros/catalogo-tenant.js`** — única fachada del catálogo operativo del tenant. Combina definiciones inmutables del Giro con el overlay permitido de SQLite: `menu_items` para cortes, bebidas y salsas; `item_types` para presentaciones. Panel, NLU, respuestas, comandos y cobro deben pasar por esta fachada.
- **`src/giros/hamburgueseria.js`** y **`src/giros/hamburgueseria/nlu.js`** — implementación del giro hamburguesería: formatos, variantes, catálogo, mensajes y NLU. Está registrado en `src/giros/index.js`; debe validarse funcionalmente antes de ofrecerlo a producción.

### Base de datos
- **`src/db/core.js`** — `initDB()` abre `data/{TENANT_ID || 'tacos_javier'}.db`. Usa `journal_mode = DELETE` y `busy_timeout = 5000`. `guardarDB()` es no-op (better-sqlite3 persiste automáticamente, el shim existe para compatibilidad legacy).
- **`src/db/seed.js`** — crea tablas, proyecta las definiciones del Giro y migra una sola vez los valores de `productos` antiguos hacia `menu_items`. `productos` queda únicamente como almacenamiento heredado de migración y no participa en panel, NLU, respuestas ni cobro.
- **`src/db/cortes.js`** — proyecta los cortes definidos por el Giro y cruza obligatoriamente su disponibilidad con `menu_items`. Un menú vacío permanece vacío; nunca reactiva automáticamente el catálogo completo. Los precios efectivos se resuelven desde `menu_items`.
- **`src/db/modelos.js`** — CRUD productos, clientes, pedidos. `actualizarEstadoPedido()` por teléfono, `actualizarEstadoPorId()` por ID (webhook MP).
- **`src/db/config.js`** — `getConfig()`, `setConfig()`, horarios, banco, mensajes_bot, JIDs reales.
- **`src/db/repartidores.js`** — CRUD repartidores + historial de entregas. `registrarEntregaConfirmada()` (actualiza promedio, escribe a `entregas_historial`), `registrarEntregaTimeout()` (escribe con `confirmado=0, minutos=NULL`), `getHistorialTenant()`, `getReporteDesempeno()`, `resetEntregasHoy()`.
- **`src/db/admin.js`** — BD del superadmin (`data/admin.db`). Config global (GROQ_API_KEY global, APP_URL, Sentry DSN), usuarios superadmin, sesiones.
- **`src/db/observabilidad.js`** — trazabilidad persistente por tenant. Registra mensajes, respuestas, ruta NLU, etapa, pedido asociado y alertas operativas. Las alertas se resuelven desde el panel y las trazas terminadas se conservan 90 días por defecto.
- **`src/db/index.js`** — re-exporta todo el módulo db.

### Pagos
- **`src/pagos/mercadopago.js`** — SDK v3. `estaConfigurado()`, `crearEnlacePago()` (Preference 30min), `procesarPago(paymentId)`. Si reinicia durante un pago, el link existe en MP pero no se auto-notifica — confirmar manual desde panel.
- **`src/pagos/stripe.js`** — driver Stripe (Plan Plus).
- **`src/pagos/conekta.js`** — driver Conekta (Plan Plus).
- **`src/pagos/index.js`** — selecciona el driver activo según `pasarela_activa` en BD.

### Panel del tenant
- **`src/panel/server.js`** — Express. Auth con sesión, rate limiting login. API REST. Auto-notifica cliente WA al cambiar estado de pedido. Webhooks públicos: `GET /health`, `POST /webhook/mercadopago`, `POST /webhook/stripe`, `POST /webhook/conekta`. Cuando un pago se confirma vía webhook, llama `despacharConDelay()` si el pedido es a domicilio.
- **`src/panel/whatsapp-bridge.js`** — singleton para compartir el cliente WA sin deps circulares.
- **`src/panel/public/index.html`** — SPA del panel tenant. Secciones: dashboard, pedidos (filtros + CSV), **Atención** (alertas y línea de tiempo de conversaciones), clientes, productos, horarios, banco, mensajes bot y configuración. **Wizard de onboarding** (5 pasos: negocio → horarios → banco → menú → contraseña) se abre automáticamente al primer login si `nombre_negocio` es el default y `localStorage.setup_done` no está fijado.

### Feature flags
- **`src/features/index.js`** — `PLANES = { basico, plus, pro }`. `requireFeature(feature)` verifica si la feature está en el plan activo del tenant. Gates en la API del panel con banners de upgrade en el frontend.

### Scripts
- **`scripts/backup-db.js`** — copia `data/{TENANT_ID}.db` a `data/backups/{TENANT_ID}_YYYY-MM-DD_HH-mm-ss.db`. Se ejecuta automáticamente cada 6h desde `index.js` via `fork()`. También: `npm run backup`.
- **`scripts/reset-password.js`** — resetea la contraseña del panel sin necesitar la actual.
- **`scripts/check-nuevos-tipos.js`** — 27 casos de prueba para NLU multi-tipo. Correr con `BOT_TEST_MODE=1`, **no** con `npm test`: `node scripts/check-nuevos-tipos.js`.
- **`scripts/auto-pull.sh`** — git pull automático (alternativa lightweight al webhook).

### Otros
- **`src/prompts/base.js`** — prompt de sistema para Groq.
- **`src/horario.js`** — lógica de horario de atención.
- **`src/config.js`** — helpers de configuración del negocio.
- **`src/pedido/precios.js`** — cálculo de precios desde BD.
- **`src/nlu/core.js`** — utilidades NLU genéricas reutilizables por todos los giros.

---

## Módulo de Mandaditos (reparto)

`src/handlers/mandaditos.js` gestiona el flujo completo de despacho a repartidores.

### Flujo
1. Cliente confirma pedido a domicilio → se llama `despacharConDelay(client, datos)`
2. `despacharConDelay()` lee `mandaditos_delay_min` de la BD. Si > 0, programa un `setTimeout`; si = 0, despacha inmediatamente. **La preventa y `reanudarDespachosPendientes` llaman directamente a `enviarDespachoMandaditos()` sin delay.**
3. `enviarDespachoMandaditos()` envía un mensaje al grupo de mandaditos (`GRUPO_MANDADITOS_ID` o `grupo_mandaditos_id` en BD) con los datos del pedido.
4. El primer repartidor que **quote-responde** ese mensaje toma el pedido → se llama `handleMensajeMandaditos()`.
5. El repartidor recibe instrucciones de recolección y entrega por privado. Se activa zona de silencio (`mandaditos_silencio_min`).
6. Después de `mandaditos_recordatorio_min`, el bot pregunta si ya entregó. El repartidor responde con NLU de confirmación o sí/no.
7. Si confirma: `registrarEntregaConfirmada()` — actualiza promedio, escribe a `entregas_historial` con `confirmado=1`.
8. Si no responde en `mandaditos_timeout_post_min`: `registrarEntregaTimeout()` — escribe a `entregas_historial` con `confirmado=0, minutos=NULL`.
9. En `index.js`, si el remitente es repartidor activo (`esRepartidorActivo(jid)`), el mensaje se intercepta ANTES de llegar al bot normal.
10. `resetEntregasHoy()` se llama cada medianoche (programado en `index.js` con `_programarResetMedianoche()`).

### Tabla `repartidores` (BD del tenant)
`id, jid, nombre, activo, en_ruta, pedido_actual_id, tiempo_ruta_inicio, entregas_hoy, entregas_total, entregas_confirmadas, promedio_entrega_min, ultima_actividad, creado_en`

### Tabla `entregas_historial` (BD del tenant)
`id, repartidor_id, pedido_id, colonia, minutos, confirmado (1=NLU, 0=timeout), fecha, creado_en`
El promedio de tiempo se calcula **solo** de entregas con `confirmado=1`.

### Config BD del tenant (claves mandaditos)
| Clave | Default | Descripción |
|---|---|---|
| `grupo_mandaditos_id` | `` | JID del grupo de repartidores |
| `mandaditos_delay_min` | `15` | Minutos de espera tras confirmación del vendedor para despachar |
| `mandaditos_silencio_min` | `15` | Minutos sin interrumpir al repartidor tras asignarle el pedido |
| `mandaditos_recordatorio_min` | `30` | Minutos tras asignación para preguntar si entregó |
| `mandaditos_timeout_post_min` | `20` | Minutos adicionales tras recordatorio antes de registrar timeout |

---

## Variables de entorno

### `.env` del root (para superadmin y webhook-deploy)
```
SUPERADMIN_PORT=3001       # Puerto del superadmin (default 3001)
SUPERADMIN_SECRET=...      # Secret de sesión del superadmin
SUPERADMIN_INITIAL_USER=rajem # Usuario usado solo al crear admin.db por primera vez
SUPERADMIN_INITIAL_PASSWORD=... # Obligatoria para una instalación nueva de producción
WEBHOOK_PORT=4000          # Puerto del webhook-deploy (default 4000)
WEBHOOK_SECRET=...         # Secreto HMAC compartido con GitHub
WEBHOOK_HOST=localhost     # Host del webhook-deploy (default localhost; Docker: host.docker.internal)
SENTRY_DSN=                # Opcional — activa Sentry si se define
COOKIE_SECURE=1            # Usar detrás de HTTPS; marca cookies como Secure
```

### Variables que `provisionar-tenant.sh` inyecta en el JSON PM2 de cada tenant
```
TENANT_ID=carnitas-bot              # Slug único del tenant (determina BD y sesión WA)
NOMBRE_NEGOCIO=Tacos Javier         # Seeded en configuracion.nombre_negocio
GRUPO_ID=521XXXXXXXXXX@g.us         # JID del grupo admin de WhatsApp
PANEL_PORT=3002                     # Puerto del panel del tenant
PANEL_SECRET=...                    # Secret de sesión del panel del tenant
PANEL_INITIAL_PASSWORD=...          # Contraseña usada al crear el usuario admin por primera vez
GROQ_API_KEY=gsk_...               # Opcional — puede configurarse desde superadmin (admin.db)
BUSINESS_TYPE=taqueria              # Giro del negocio — determina NLU y productos
SECCION_TAQUERIA_INICIAL=ambas      # ambas | carnitas | asada
PLAN_ACTIVO=basico                  # basico | plus | pro — seeded en configuracion.plan_activo
```

### Variables opcionales adicionales para el proceso del tenant
```
SENTRY_DSN=                         # Activa Sentry
MERCADOPAGO_ACCESS_TOKEN=           # Activa pagos con link MP
APP_URL=https://mi-servidor.com     # Necesario si MP/Stripe/Conekta está activo
GROQ_TIMEOUT_MS=15000               # Timeout Groq (default 15000ms)
BOT_TEST_MODE=1                     # Solo scripts — activa todos los item_types
```

---

## Configuración desde BD (tabla `configuracion` de cada tenant)

| Clave | Default | Descripción |
|---|---|---|
| `nombre_negocio` | `Mi Negocio` | Nombre del negocio (seeded desde `NOMBRE_NEGOCIO` env) |
| `business_type_slug` | `taqueria` | Giro activo (seeded desde `BUSINESS_TYPE` env) |
| `seccion_taqueria` | `ambas` | Sección visible para NLU (seeded desde `SECCION_TAQUERIA_INICIAL`) |
| `plan_activo` | `basico` | Plan de membresía (seeded desde `PLAN_ACTIVO` env) |
| `grupo_id` | `` | JID del grupo admin WA (seeded desde `GRUPO_ID` env) |
| `domicilio_costo` | `50` | Costo fijo de domicilio |
| `metodos_mostrador` | `efectivo, tarjeta o transferencia` | |
| `metodos_domicilio` | `efectivo o transferencia` | |
| `tiempo_cancelacion` | `15` | Minutos para cancelar tras confirmar |
| `timeout_recordatorio_min` | `20` | Minutos de inactividad antes del recordatorio |
| `timeout_sesion_min` | `35` | Minutos de inactividad antes de limpiar sesión |
| `tipo_servicio` | `ambos` | mostrador \| domicilio \| ambos |
| `pasarela_activa` | `` | mercadopago \| stripe \| conekta \| vacío |
| `notif_modalidad` | `grupo` | grupo \| privado \| autochat \| ninguno |
| `bot_pausado` | `0` | 1 = bot pausado para todos los clientes |
| `negocio_lat`, `negocio_lon` | `` | Coordenadas del negocio (para cálculo de distancia) |
| `negocio_calle`, `negocio_colonia`, `negocio_referencia` | `` | Dirección del negocio |
| `alerta_pedido_min` | `10` | Minutos tras confirmar para alertar si no se ha visto |
| `estrategia_precio_mixto` | `mas_caro` | mas_caro \| promedio |
| `mandaditos_delay_min` | `15` | Delay de despacho a repartidores tras confirmar |

---

## Incidencias conocidas y pendientes

### RESUELTO — Variables de provisionamiento en PM2
`provisionar-tenant.sh` persiste e inyecta `NOMBRE_NEGOCIO`, `BUSINESS_TYPE`, `SECCION_TAQUERIA_INICIAL` y `PLAN_ACTIVO`. `seed.js` usa `PLAN_ACTIVO` al crear la configuración. La corrección aplica a tenants nuevos; los tenants ya creados deben revisarse y corregirse desde el superadmin.

### RESUELTO — Estado vacío de colonias en el superadmin
**Síntoma:** La sección Geo del superadmin muestra tabla vacía para el tenant recién creado.

**Causa:** `seed.js` no seedea colonias (por diseño — son específicas de cada ciudad). La BD recién creada tiene la tabla `colonias` vacía. El superadmin la lee correctamente — simplemente no hay datos.

**Comportamiento esperado:** El superadmin debe agregar las colonias manualmente en Geo → Colonias. La UI debe mostrar un mensaje claro de "Sin colonias configuradas" en lugar de tabla vacía sin contexto.

La UI muestra “Sin colonias configuradas” e indica que deben agregarse desde esa sección.

### Limitación — Cambio de plan antes del primer arranque
Si se intenta cambiar el plan cuando la BD todavía no existe, `setTenantPlan()` no puede escribirlo. El provisionamiento normal evita esta ventana porque inyecta `PLAN_ACTIVO` en PM2 antes del primer arranque. Para altas manuales, crear/arrancar la BD antes de cambiar el plan desde el superadmin.

Una vez creada la BD, los cambios se sincronizan a `configuracion.plan_activo` y `tenants.json`.

---

## Estados críticos bloqueantes (`orden.js`)

Cuando el bot está en uno de estos estados, bloquea cualquier otro input y solo acepta la respuesta esperada. Al 2.° error consecutivo muestra ejemplos.

| Estado (Map) | Solo acepta | Ejemplos al 2.° error |
|---|---|---|
| `esperandoCorte` | corte de carne | *surtido, carne, buche, cuero, lengua* |
| `esperandoTipoItem` | tipo de ítem | *tacos, tortas* |
| `esperandoConfirmacionItem` | sí/no, modificaciones, FAQ | *sí, dale / no, nel* |
| `esperandoAgregarMas` | sí/no, subtotal, edición, FAQ | *sí / no, ya es todo* |

El contador de errores vive en `_erroresConsec` (Map local en `orden.js`), se resetea al recibir respuesta válida.

**Orden del router en `mensajes.js`** (mayor a menor prioridad):
1. `handleEsperandoTipoItem` — estado activo
2. `handleEsperandoCorte` — estado activo
3. `handleConfirmacionItem` — estado activo
4. `handleAgregarMas` — estado activo
5. `handlePedidoSimple` — parser local genérico
6. `handleSinCorte` / `handleSinTipo` — detección parcial
7. `handleGroqFallback` — último recurso

**FAQs durante estados críticos:** se responden y luego se repite la pregunta del estado activo. No interrumpen el flujo.

---

## Notas NLU críticas (`pedidoParser.js`)

- `"y aparte"` **no** fuerza Groq — se limpia en `preprocesarCantidades()` como conector de bebida.
- `textoANumero()` maneja compuestos: "treinta y dos" → "32".
- `detectarTodasPreguntasFrecuentes(texto)` → array — **solo usar en `mensajes.js`** fuera de flujo activo. En handlers de estado usar `detectarPreguntaFrecuente`.
- Intent `pedido_listo` — evaluado ANTES que `horario` para evitar que "¿ya están listos?" responda con horario de apertura.
- En `handleEsperandoCorte`: "de todos"/"de todo"/"cualquiera" → "surtido".
- `buscarCorteFuzzy()` usa Levenshtein ≤ 2. **IMPORTANTE**: antes del fuzzy se hace `if (detectarTipoItemDesdeTexto(palabra)) continue` para evitar que "burritos" coincida con "cueritos" (corte cuero, distancia=2).
- `_buildItemTypesPattern()` construye regex dinámica desde BD — se regenera con TTL 60s.
- `listaItemTypes(soloUnidad=true)` excluye gramos/pesos — usar en mensajes al cliente cuando no aplica venta por peso.
- `detectarModificacion()` extrae `corte` en `quitar_uno`. `aplicarQuitarUno(ordenTexto, corte?)` lo recibe como parámetro opcional.

---

## Notas de implementación importantes

- **`extraerTelefono(texto)`** — siempre usar esta función para teléfonos en texto libre. Valida LADA mexicano (primer dígito 2-9), detecta +52, separadores (331-234-5678).
- **`extraerTelefonoDeJID(jid)`** — devuelve `null` para JIDs `@lid`. Para `@c.us` extrae los últimos 10 dígitos.
- **Resolución de LIDs en `index.js`:** `msg.from` puede llegar como `3310000001:12@lid`. El handler detecta `@lid`, llama `client.getContactLidAndPhone([msg.from])` y reemplaza `msg.from` con el JID real antes de enrutar. Todos los handlers downstream siempre reciben JIDs de teléfono real.
- **`guardarDB()`** es no-op — better-sqlite3 persiste automáticamente en cada escritura. El shim existe para no romper código legacy.
- En `handleConfirmacionFinal` (`resumen.js`): la BD se guarda **antes** de notificar al grupo y confirmar al cliente. Si falla, el cliente recibe error en lugar de confirmación falsa.
- Nombre compuesto en BD: 1 palabra→solo nombre, 2→nombre+apellido, 3+→primeras dos palabras como nombre, resto como apellido.
- Timeout de sesiones: **dos fases** — 20 min → `_textoRecordatorio()` contextual (jitter 1-3s), 35 min → `limpiarTodo()`. `recordatorioEnviado` se borra en `mensajes.js` cuando el cliente responde.
- **BD del superadmin**: `data/admin.db` — separada de los tenants. Contiene config global, usuarios superadmin, sesiones de la SPA. Gestionada por `src/db/admin.js`.

---

## Convenciones

- **Idioma:** código, variables, comentarios y mensajes al cliente en **español**
- **Sin mocks de BD:** usar better-sqlite3 real en cualquier prueba (no `jest.mock`)
- **Teléfonos:** siempre 10 dígitos locales. JID WA (`5213XXXXXXXXXX@c.us`) → `slice(-10)`
- **Commits:** en español, descriptivos
- **No usar `npm test` para scripts de prueba NLU** — correr directo con `node scripts/check-nuevos-tipos.js`

---

## Hoja de ruta — Arquitectura multi-giro/multi-tenant

| Fase | Qué se construye | Estado |
|:----:|---|---|
| 1 | Separar ecosistema taquería — `src/nlu/core.js`, `src/giros/taqueria/`, `pedidoParser.js` como router delegante | ✅ `50a7414` |
| 2 | Extraer `nlu/core.js` con utilidades genéricas puras | ✅ incluido en Fase 1 |
| 3 | Servicio geo — solicitudes geo tenant→superadmin, seed ciudad-agnóstico, aliases en `buscarColonia()` | ✅ completa |
| 4 | Feature flags por plan — `src/features/index.js`, `requireFeature()`, gates UI, endpoints superadmin plan | ✅ completa |
| 5 | Hamburguesería como segundo giro | Implementada; validación funcional pendiente |
| 6 | Drivers Stripe + Conekta, webhooks, `_notificarPagoConfirmado()` helper compartido | ✅ completa |
| 7 | Mandaditos/reparto — despacho con delay configurable, historial de entregas, reporte de desempeño | ✅ completa |
| 8 | Mejoras al diccionario de colonias — aliases ampliados para reducir fallos de matching | Pendiente |
| 9 | Tarifas de reparto por distancia — el superadmin fija tarifas fijas por zona (NO dinámica) | Pendiente |
| 10 | Corrección de variables de provisionamiento | ✅ completa |

---

## Repo y deployment

- **GitHub:** `djchuvaca/Rajem-Bot` — rama `main`
- **Webhook GitHub → VPS:** configurar `POST https://IP:4000/deploy` con secret = `WEBHOOK_SECRET`
- En cada push a `main`: `git pull` + `npm install` si cambió `package.json` + `pm2 restart` de todos los procesos excepto `webhook-deploy` (se reinicia solo al final con delay de 3s)

## Seguridad de producción

- `SUPERADMIN_SECRET` y `PANEL_SECRET` deben tener al menos 32 caracteres. Con `NODE_ENV=production`, el proceso falla al arrancar si faltan o son demasiado cortos.
- Definir `SUPERADMIN_INITIAL_PASSWORD` antes de crear `data/admin.db`. Cada tenant recibe una contraseña inicial aleatoria durante el provisionamiento y debe cambiarla en el primer ingreso.
- Publicar los paneles únicamente mediante un proxy inverso con HTTPS y configurar `COOKIE_SECURE=1`.
- Restringir los puertos 3001 y 4000 a localhost o mediante firewall. El webhook debe validar su firma con `WEBHOOK_SECRET`.
- `journal_mode=DELETE` simplifica backups, pero serializa escrituras. `busy_timeout=5000` absorbe contención breve; si aparecen bloqueos sostenidos, revisar transacciones y concurrencia antes de migrar a WAL.
