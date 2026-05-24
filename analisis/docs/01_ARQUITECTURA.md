# Arquitectura del Sistema

---

## Diagrama de arquitectura

```
┌─────────────────────────────────────────────────────────────────────┐
│                         PROCESO NODE.JS                             │
│                                                                     │
│  ┌──────────────┐    evento     ┌─────────────────────────────────┐ │
│  │  Chromium    │─── "message" ─►  index.js (router principal)    │ │
│  │  (Puppeteer) │               └────────────┬────────────────────┘ │
│  │  WhatsApp    │                            │                      │
│  │  Web Session │◄── msg.reply() ────────────┤                      │
│  └──────────────┘                            │                      │
│                                              ▼                      │
│                               ┌─────────────────────────┐          │
│                               │   mensajes.js (router)   │          │
│                               │   ~178 líneas            │          │
│                               └────────────┬────────────┘          │
│                                            │ encadena handlers      │
│                    ┌───────────────────────┼───────────────────┐    │
│                    ▼                       ▼                   ▼    │
│           ┌──────────────┐    ┌─────────────────────┐  ┌──────────┐│
│           │ pedidoParser │    │   flujos/            │  │respuestas││
│           │  (NLU local) │    │  formulario.js       │  │  (FAQs)  ││
│           │  sistema de  │    │  orden.js            │  └──────────┘│
│           │  score +     │    │  resumen.js          │              │
│           │  fuzzy match │    │  edicion.js          │              │
│           └──────┬───────┘    │  cancelacion.js      │              │
│                  │            └──────────┬───────────┘              │
│            score < 4                     │                          │
│                  ▼                       ▼                          │
│           ┌──────────────┐    ┌─────────────────────┐              │
│           │  Groq API    │    │  estado/             │              │
│           │  llama-3.3   │    │  maps.js (Maps RAM)  │              │
│           │  70b-vers.   │    │  sesiones.js         │              │
│           └──────────────┘    │  campos.js           │              │
│                               │  bot-pausado.js      │              │
│                               └──────────┬───────────┘              │
│                                          │ persistirEstado()        │
│                                          ▼                          │
│                               ┌─────────────────────┐              │
│                               │  sql.js (SQLite RAM) │              │
│                               │  guardarDB() 500ms   │              │
│                               └──────────┬───────────┘              │
│                                          │                          │
│                               ┌──────────▼───────────┐              │
│                               │ Express panel admin  │              │
│                               │ :3000 (API REST+SPA) │              │
│                               └─────────────────────┘              │
└─────────────────────────────────────────────────────────────────────┘
                                          │
                                          ▼
                               tacos_javier.db  (disco)
```

---

## Capas del sistema

### Capa 1 — Transporte (whatsapp-web.js + Puppeteer)

Responsable de la conexión física con WhatsApp. Un solo proceso de Chromium mantiene la sesión abierta. Cuando llega un mensaje dispara el evento `"message"` con un objeto `msg` que contiene el cuerpo del texto, el remitente (`msg.from`), flags de media, etc.

Las credenciales de sesión se guardan en `.wwebjs_auth/` (directorio local). Si se borra este directorio hay que re-escanear el QR.

**Tipos de mensajes que el bot maneja:**
- Texto (`msg.body`) → flujo principal
- Imagen (`msg.hasMedia && msg.type !== "ptt"`) → comprobante de pago
- Audio/PTT → responde "solo proceso mensajes de texto"
- Emojis de confirmación (👍✅) → normalizados a "si"

**Resolución de LIDs:** WhatsApp envía `msg.from` en formato `@lid` (ej: `3310000001:12@lid`) en ciertos dispositivos. Antes de enrutar cualquier mensaje, `index.js` detecta el sufijo `@lid` y llama a `client.getContactLidAndPhone([msg.from])` para obtener el JID real (`@c.us`). El `msg.from` se reemplaza con el JID real, de modo que todos los handlers downstream siempre operan con teléfonos reales.

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
| `resumen.js` | Resumen final, edición desde resumen, confirmación, guardar en BD |
| `edicion.js` | Modificación de campos durante formulario o resumen |
| `cancelacion.js` | Cancelación en cualquier etapa del flujo |
| `utils.js` | Helpers compartidos + timeout de inactividad bifásico |

### Capa 4 — NLU (pedidoParser.js + respuestas.js)

El cerebro local del bot. Antes de llamar a Groq, intenta resolver el mensaje con regex y heurísticas:

- **FAQs:** precio, horario, domicilio, menú, ubicación, métodos de pago, descripción de corte
- **Parser de pedidos:** sistema de score, fuzzy matching con Levenshtein, patrones de cantidades y cortes
- **Modificaciones:** quitar uno, agregar más, cambiar corte

### Capa 5 — Estado (estado/)

Todo el estado de las conversaciones activas vive en **Maps de JavaScript en memoria RAM**. No hay base de datos involucrada en la lectura durante el flujo normal — todo es O(1) en memoria.

Los Maps se serializan a JSON y se guardan en la tabla `sesiones_activas` cada vez que cambian (`persistirEstado()`). Al reiniciar el bot, se restauran desde la BD (`restaurarTodasLasSesiones()`).

### Capa 6 — Persistencia (sql.js)

Base de datos SQLite corriendo completamente en el proceso de Node.js. Las operaciones son síncronas (bloquean el event loop brevemente). Las escrituras a disco están debounced en 500ms para reducir I/O.

### Capa 7 — Panel admin (Express)

API REST + SPA. Separado del bot en cuanto a rutas, pero comparte el mismo proceso Node.js y la misma BD en memoria. Se comunica con WhatsApp via el singleton `whatsapp-bridge.js`.

---

## Decisiones de diseño importantes

### ¿Por qué un solo proceso?

Simplicidad de despliegue. La taquería corre el bot en una laptop o un VPS pequeño. No necesita Docker, clusters, ni servicios separados. El proceso hace todo.

**Implicación:** Si el proceso muere, todo muere junto (bot + panel + BD en RAM). Por eso existe el sistema de sesiones persistentes en disco.

### ¿Por qué sql.js y no SQLite nativo (better-sqlite3)?

`sql.js` funciona en cualquier plataforma sin compilar binarios nativos (es puro WebAssembly). Esto evita problemas con Node.js ABI al cambiar versiones o cambiar de OS. La desventaja es que bloquea el event loop de forma síncrona; para el volumen de una taquería no es problema.

### ¿Por qué Maps en memoria y no BD para el estado?

Velocidad. Cada mensaje puede involucrar 5–10 consultas de estado. Con Maps en RAM, cada consulta es O(1) y sub-microsegundo. La BD solo se usa para persistencia entre reinicios, no para operación normal.

### ¿Por qué whatsapp-bridge.js?

El panel (`server.js`) necesita acceso al cliente de WhatsApp para enviar notificaciones proactivas al cambiar el estado de un pedido. Si importara directamente `index.js`, se crearía una dependencia circular. El singleton actúa como registro global sin circular deps.

### ¿Por qué el parser local antes que Groq?

Costo y latencia. Groq tiene rate limits y latencia de red. El parser local responde en <1ms. Objetivo: que Groq solo reciba el ~5% de mensajes genuinamente ambiguos.

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
       → persistirEstado() → guardarSesion() → guardarDB() (debounce 500ms)
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
       → upsertCliente({nombre, telefono, ...}) → BD
       → registrarPedido({orden, total, metodo_pago, ...}) → BD
       → guardarTelefonoReal(jid, telefono) → BD
       → client.sendMessage(GRUPO_ID, "Nueva venta! ...")
       → limpiarTodo(numero) → persistirEstado() → eliminarSesion()
       → msg.reply("Listo! Tu pedido fue recibido...")
```
