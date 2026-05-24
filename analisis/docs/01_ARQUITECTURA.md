# Arquitectura del Sistema

---

## Diagrama de arquitectura

```
┌──────────────────────────────────────────────────────────────────────────────┐
│                            PROCESO NODE.JS                                   │
│                                                                              │
│  ┌──────────────┐    evento     ┌──────────────────────────────────────────┐ │
│  │  Chromium    │─── "message" ─►  index.js (router principal)             │ │
│  │  (Puppeteer) │               │  + Sentry init                           │ │
│  │  WhatsApp    │               │  + reconnect backoff                     │ │
│  │  Web Session │◄── msg.reply()│  + backup fork cada 6h                  │ │
│  └──────────────┘               └───────────────┬──────────────────────────┘ │
│                                                 │                            │
│                                                 ▼                            │
│                                  ┌─────────────────────────┐                │
│                                  │   mensajes.js (router)   │                │
│                                  │   ~178 líneas            │                │
│                                  └────────────┬────────────┘                │
│                                               │ encadena handlers            │
│                    ┌──────────────────────────┼───────────────────┐         │
│                    ▼                          ▼                   ▼         │
│           ┌──────────────┐    ┌─────────────────────┐  ┌──────────────┐    │
│           │ pedidoParser │    │   flujos/            │  │  respuestas  │    │
│           │  (NLU local) │    │  formulario.js       │  │  (FAQs)      │    │
│           │  sistema de  │    │  orden.js            │  └──────────────┘    │
│           │  score +     │    │  resumen.js          │                      │
│           │  fuzzy match │    │  edicion.js          │                      │
│           └──────┬───────┘    │  cancelacion.js      │                      │
│                  │            └──────────┬───────────┘                      │
│            score < 4                     │                                   │
│                  ▼                       ▼                                   │
│           ┌──────────────┐    ┌─────────────────────┐                       │
│           │  Groq API    │    │  estado/             │                       │
│           │  llama-3.3   │    │  maps.js (Maps RAM)  │                       │
│           │  70b-vers.   │    │  sesiones.js         │                       │
│           └──────────────┘    │  campos.js           │                       │
│                               │  bot-pausado.js      │                       │
│                               └──────────┬───────────┘                       │
│                                          │ persistirEstado()                 │
│                                          ▼                                   │
│                               ┌─────────────────────┐                       │
│                               │  better-sqlite3      │                       │
│                               │  (SQLite nativo)     │                       │
│                               │  persiste en cada    │                       │
│                               │  escritura           │                       │
│                               └──────────┬───────────┘                       │
│                                          │                                   │
│  ┌───────────────┐             ┌─────────▼────────────┐                     │
│  │  src/logger.js│             │ Express panel admin  │                     │
│  │  Winston      │             │ :3000 (API REST+SPA) │                     │
│  │  consola+logs │             │ + webhook MP         │                     │
│  └───────────────┘             │ + GET /health        │                     │
│                                └─────────────────────┘                     │
└──────────────────────────────────────────────────────────────────────────────┘
         │                                  │
         ▼                                  ▼
  logs/bot-combined.log           tacos_javier.db  (disco)
  logs/bot-err.log                data/backups/    (backup cada 6h)
```

---

## Capas del sistema

### Capa 1 — Transporte (whatsapp-web.js + Puppeteer)

Responsable de la conexión física con WhatsApp. Un solo proceso de Chromium mantiene la sesión abierta. Cuando llega un mensaje dispara el evento `"message"` con un objeto `msg` que contiene el cuerpo del texto, el remitente (`msg.from`), flags de media, etc.

Las credenciales de sesión se guardan en `.wwebjs_auth/` (directorio local, nombrado con `TENANT_ID`). Si se borra este directorio hay que re-escanear el QR.

**Tipos de mensajes que el bot maneja:**
- Texto (`msg.body`) → flujo principal
- Imagen (`msg.hasMedia && msg.type !== "ptt"`) → comprobante de pago
- Audio/PTT → responde "solo proceso mensajes de texto"
- Emojis de confirmación (👍✅) → normalizados a "si"

**Resolución de LIDs:** WhatsApp envía `msg.from` en formato `@lid` (ej: `3310000001:12@lid`) en ciertos dispositivos. Antes de enrutar cualquier mensaje, `index.js` detecta el sufijo `@lid` y llama a `client.getContactLidAndPhone([msg.from])` para obtener el JID real (`@c.us`). El `msg.from` se reemplaza con el JID real, de modo que todos los handlers downstream siempre operan con teléfonos reales.

**Reconnección automática:** Si WhatsApp se desconecta (evento `disconnected`), `index.js` reintenta automáticamente con backoff exponencial: 5s → 10s → 20s → ... → máximo 5 minutos. Máximo 8 reintentos. El contador `_reintentos` se resetea en cada evento `ready`.

### Capa 2 — Router principal (mensajes.js)

Recibe todos los mensajes de clientes (no grupos, no fromMe). Aplica dos operaciones antes de enrutar:

1. **Deduplicación:** Set de 200 IDs de mensajes. WhatsApp a veces reentrega mensajes; el Set los descarta.
2. **Registro de actividad:** `ultimaActividad.set(clienteNumero, Date.now())` — alimenta el timeout bifásico.

Luego encadena los handlers en orden de prioridad (ver documento `02_FLUJO_CONVERSACIONAL.md`).

### Capa 3 — Handlers de flujo (flujos/)

Cada archivo maneja una etapa del ciclo de vida del pedido:

| Archivo | Responsabilidad |
|---|---|
| `formulario.js` | Bienvenida, tipo de entrega, formulario progresivo de datos |
| `orden.js` | Toma de pedido, preguntar corte/tipo, confirmación de ítem, Groq |
| `resumen.js` | Resumen final, edición desde resumen, confirmación, guardar en BD, MercadoPago |
| `edicion.js` | Modificación de campos durante formulario o resumen |
| `cancelacion.js` | Cancelación en cualquier etapa del flujo |
| `utils.js` | Helpers compartidos + rate limiting WA (2s/JID) + timeout bifásico (20/35 min) |

### Capa 4 — NLU (pedidoParser.js + respuestas.js)

El cerebro local del bot. Antes de llamar a Groq, intenta resolver el mensaje con regex y heurísticas:

- **FAQs:** precio, horario, domicilio, menú, ubicación, métodos de pago, descripción de corte
- **Parser de pedidos:** sistema de score, fuzzy matching con Levenshtein, patrones de cantidades y cortes
- **Modificaciones:** quitar uno, agregar más, cambiar corte

### Capa 5 — Estado (estado/)

Todo el estado de las conversaciones activas vive en **Maps de JavaScript en memoria RAM**. No hay base de datos involucrada en la lectura durante el flujo normal — todo es O(1) en memoria.

Los Maps se serializan a JSON y se guardan en la tabla `sesiones_activas` cada vez que cambian (`persistirEstado()`). Al reiniciar el bot, se restauran desde la BD (`restaurarTodasLasSesiones()`).

### Capa 6 — Persistencia (better-sqlite3)

Base de datos SQLite con bindings nativos de Node.js. Cada escritura persiste automáticamente a disco (`data/tacos_javier.db`). No hay buffer ni debounce — la persistencia es inmediata.

`guardarDB()` existe en el código por compatibilidad con código legacy, pero es un no-op.

**Backup automático:** `index.js` hace un fork de `scripts/backup-db.js` al arrancar y luego cada 6 horas. Los backups se guardan en `data/backups/tacos_javier_YYYY-MM-DD_HH-mm-ss.db`.

### Capa 7 — Panel admin (Express)

API REST + SPA. Separado del bot en cuanto a rutas, pero comparte el mismo proceso Node.js y la misma BD. Se comunica con WhatsApp via el singleton `whatsapp-bridge.js`.

**Endpoints públicos (sin auth):**
- `GET /health` — health check para monitoreo externo (retorna 200/503)
- `POST /webhook/mercadopago` — recibe notificaciones de pago de MercadoPago

### Capa 8 — Observabilidad

- **Winston (`src/logger.js`):** logs a consola (coloreados) y a archivos en `logs/`
- **Sentry:** captura errores no manejados (`uncaughtException`, `unhandledRejection`) si `SENTRY_DSN` está definido
- **Handlers globales de error:** previenen que el proceso muera por promesas rechazadas no manejadas

---

## Decisiones de diseño importantes

### ¿Por qué un solo proceso?

Simplicidad de despliegue. La taquería corre el bot en una laptop o un VPS pequeño. No necesita Docker, clusters, ni servicios separados. El proceso hace todo.

**Implicación:** Si el proceso muere, todo muere junto (bot + panel + BD). Por eso existe el sistema de sesiones persistentes, el backup automático y PM2 con `autorestart`.

### ¿Por qué better-sqlite3 y no sql.js?

`sql.js` era puro WebAssembly (sin compilar binarios nativos). Se migró a `better-sqlite3` por:
- Mejor rendimiento — bindings nativos síncronos, no WebAssembly
- Persistencia automática — no hay que debounce ni exportar manualmente
- Sin buffer de escritura — no hay riesgo de perder las últimas escrituras si el proceso muere

**Shim de compatibilidad:** `getDB()` en `core.js` retorna un objeto con la misma API que sql.js (`run()`, `exec()`), para que el código legacy siga funcionando sin cambios.

### ¿Por qué Maps en memoria y no BD para el estado?

Velocidad. Cada mensaje puede involucrar 5–10 consultas de estado. Con Maps en RAM, cada consulta es O(1) y sub-microsegundo. La BD solo se usa para persistencia entre reinicios, no para operación normal.

### ¿Por qué whatsapp-bridge.js?

El panel (`server.js`) necesita acceso al cliente de WhatsApp para enviar notificaciones proactivas al cambiar el estado de un pedido. Si importara directamente `index.js`, se crearía una dependencia circular. El singleton actúa como registro global sin circular deps.

### ¿Por qué el parser local antes que Groq?

Costo y latencia. Groq tiene rate limits y latencia de red. El parser local responde en <1ms. Objetivo: que Groq solo reciba el ~5% de mensajes genuinamente ambiguos.

### ¿Por qué MercadoPago como módulo opcional?

Para que el negocio pueda empezar con el flujo de banco + comprobante (sin costo) y activar los pagos con link cuando esté listo. `estaConfigurado()` verifica las variables de entorno en tiempo de ejecución — si no están definidas, `resumen.js` cae al flujo tradicional.

---

## Flujo de datos completo (ejemplo: pedido exitoso)

```
1. Cliente escribe "3 tacos de surtido"
   └─► mensajes.js: registra ultimaActividad, envía a handlers

2. handleFormularioProgresivo: cliente ya tiene datos → omite
   └─► handlePedidoSimple (orden.js):
       pedidoParser.parsearPedidoSimple("3 tacos de surtido")
       → score=6 ≥ 4 → parsea local
       → { tipo:"pedido", items:[{presentacion:"taco", cantidad:3, corte:"surtido"}] }
       → esperandoConfirmacionItem.set(numero, {lineas:"3 tacos de surtido — $90"})
       → persistirEstado() → guardarSesion()
       → replyConTyping() con rate limiting 2s/JID
       → msg.reply("3 tacos de surtido — $90\n\n¿Es correcto?")

3. Cliente escribe "sí"
   └─► handleConfirmacionItem (orden.js):
       → esperandoAgregarMas.set(numero, "3 tacos de surtido")
       → msg.reply("¿Deseas agregar algo más?")

4. Cliente escribe "no, ya es todo"
   └─► handleAgregarMas (orden.js):
       → generarResumen() → texto del resumen con total
       → resumenPendiente.set(numero, {texto, esTransferencia:false})
       → msg.reply(resumen)

5. Cliente escribe "sí confirmo"
   └─► handleConfirmacionFinal (resumen.js):
       → upsertCliente({nombre, telefono, ...}) → BD (persiste automáticamente)
       → registrarPedido({orden, total, metodo_pago, ...}) → BD
       → guardarTelefonoReal(jid, telefono) → BD
       → client.sendMessage(GRUPO_ID, "Nueva venta! ...")
       → limpiarTodo(numero) → persistirEstado() → eliminarSesion()
       → msg.reply("Listo! Tu pedido fue recibido...")
```
