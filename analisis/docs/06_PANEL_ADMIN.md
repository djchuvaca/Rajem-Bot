# Panel de Administración

Este documento describe el panel web de administración: su arquitectura, autenticación, todas las rutas de la API REST y cómo se integra con WhatsApp.

---

## Visión general

El panel es una SPA (Single Page Application) servida por Express. Comparte el mismo proceso Node.js que el bot y accede a la misma BD en memoria. El administrador del negocio lo usa para:

- Ver y gestionar pedidos en tiempo real
- Confirmar, rechazar o marcar pedidos "en camino"
- Gestionar clientes, productos, horarios y configuración
- Enviar mensajes directos a clientes por WhatsApp

**URL:** `http://localhost:3000` (configurable via `PANEL_PORT` en `.env`)  
**Usuario por defecto:** `admin` / `admin123`  
**Auto-refresh:** La SPA recarga los datos cada 20 segundos automáticamente.

---

## Archivos del módulo

| Archivo | Descripción |
|---|---|
| `src/panel/server.js` | Express app: rutas, auth, rate limiting, notificaciones WA |
| `src/panel/whatsapp-bridge.js` | Singleton del cliente WA — permite enviar mensajes sin deps circulares |
| `src/panel/public/index.html` | SPA completa (HTML + CSS + JS en un solo archivo) |

---

## Arquitectura: whatsapp-bridge.js

El panel necesita enviar mensajes por WhatsApp (notificar al cliente cuando su pedido cambia de estado). Pero si `server.js` importara directamente `index.js`, se crearía una dependencia circular.

La solución es un singleton global:

```javascript
// whatsapp-bridge.js
let _client = null;

function setWhatsappClient(client) { _client = client; }
function getWhatsappClient() { return _client; }

module.exports = { setWhatsappClient, getWhatsappClient };
```

- `index.js` llama `setWhatsappClient(client)` cuando WhatsApp se conecta
- `server.js` llama `getWhatsappClient()` cuando necesita enviar un mensaje
- Si el bot aún no está conectado, `getWhatsappClient()` retorna null y el endpoint responde 503

---

## Autenticación

### Sesión Express

```javascript
app.use(session({
  secret:            process.env.PANEL_SECRET || "tacos-javier-secret-2024",
  resave:            false,
  saveUninitialized: false,
  cookie:            { maxAge: 8 * 60 * 60 * 1000 }  // 8 horas
}));
```

La sesión vive en memoria del proceso (no en BD). Si el proceso reinicia, todas las sesiones del panel se invalidan y el admin debe volver a hacer login.

### Rate limiting de login

Para prevenir ataques de fuerza bruta, el endpoint `/api/login` limita a **5 intentos por minuto por IP**:

```
Intento 1-5: procesa normalmente
Intento 6+:  HTTP 429 "Demasiados intentos. Espera 1 minuto."
Después de 1 minuto: contador se reinicia automáticamente
```

El counter vive en el Map `_loginAttempts` en memoria. Se reinicia al reiniciar el servidor.

### Middleware `requireAuth`

Todas las rutas de la API (excepto login/logout) están protegidas:

```javascript
function requireAuth(req, res, next) {
  if (req.session && req.session.usuario) return next();
  res.status(401).json({ error: "No autorizado" });
}
```

---

## Rutas de la API REST

### Autenticación

| Método | Ruta | Descripción |
|---|---|---|
| POST | `/api/login` | Login con `{ usuario, password }`. Retorna `{ ok: true }` |
| POST | `/api/logout` | Destruye la sesión |
| GET | `/api/me` | Retorna `{ usuario }` del admin en sesión |
| POST | `/api/cambiar-password` | Cambia contraseña con `{ password_actual, password_nuevo }` |

### Configuración del negocio

| Método | Ruta | Descripción |
|---|---|---|
| GET | `/api/config` | Retorna todas las claves-valor de configuración |
| POST | `/api/config` | Actualiza una clave con `{ clave, valor }` |

### Horarios

| Método | Ruta | Descripción |
|---|---|---|
| GET | `/api/horarios` | Retorna horarios de los 7 días |
| POST | `/api/horarios/:dia` | Actualiza el horario de un día con `{ abierto, hora_inicio, hora_fin }` |

### Datos bancarios

| Método | Ruta | Descripción |
|---|---|---|
| GET | `/api/banco` | Retorna datos de transferencia |
| POST | `/api/banco` | Actualiza con `{ banco, beneficiario, clabe }` |

### Mensajes del bot

| Método | Ruta | Descripción |
|---|---|---|
| GET | `/api/mensajes` | Retorna todos los mensajes configurables |
| POST | `/api/mensajes` | Actualiza un mensaje con `{ clave, valor }` |

### Productos (cortes)

| Método | Ruta | Descripción |
|---|---|---|
| GET | `/api/productos` | Retorna productos activos |
| POST | `/api/productos` | Crea un producto nuevo e **invalida la caché** del parser |
| PUT | `/api/productos/:id` | Actualiza un producto e **invalida la caché** del parser |
| DELETE | `/api/productos/:id` | Soft delete (activo=0) e **invalida la caché** del parser |

**Nota:** Cualquier cambio en productos llama a `invalidarCacheCortes()` en `pedidoParser.js`. Esto garantiza que el bot detecte los cortes actualizados en el próximo mensaje, sin necesitar reiniciar.

### Clientes

| Método | Ruta | Descripción |
|---|---|---|
| GET | `/api/clientes` | Retorna todos los clientes ordenados por fecha de registro DESC |
| GET | `/api/clientes/:telefono` | Retorna un cliente por teléfono o 404 |
| POST | `/api/clientes` | Crea o actualiza cliente (`upsertCliente`) |
| PUT | `/api/clientes/:id` | Actualiza cliente |
| DELETE | `/api/clientes/:id` | Elimina cliente (DELETE real) |

### Pedidos

| Método | Ruta | Params/Body | Descripción |
|---|---|---|---|
| GET | `/api/pedidos` | `?hoy=1` opcional | Sin param → últimos 200. Con `?hoy=1` → solo hoy |
| PUT | `/api/pedidos/:id/estado` | `{ estado }` | Cambia estado y **notifica al cliente por WA** |
| DELETE | `/api/pedidos/:id` | — | Elimina pedido |
| POST | `/api/pedidos/:id/notificar` | `{ mensaje }` | Envía mensaje personalizado al cliente por WA |

**Estados válidos para `PUT /api/pedidos/:id/estado`:**

| Estado | Mensaje enviado al cliente |
|---|---|
| `confirmado` | "✅ Tu pedido ha sido *confirmado*. ¡Pronto estará listo!" |
| `rechazado` | "❌ Tu pedido fue *rechazado*. Contáctanos si tienes dudas." |
| `en_camino` | "🛵 Tu pedido ya va *en camino*. ¡Prepárate para recibirlo!" |
| `cancelado` | (sin mensaje automático) |
| `pendiente` | (sin mensaje automático) |

### Estadísticas

| Método | Ruta | Descripción |
|---|---|---|
| GET | `/api/stats` | Dashboard con métricas del día |

**Respuesta de `/api/stats`:**

```json
{
  "pedidos_hoy": 12,
  "pendientes": 3,
  "confirmados": 8,
  "cancelados": 1,
  "rechazados": 0,
  "total_ventas_hoy": 1850.00,
  "ticket_promedio": 231,
  "corte_mas_pedido": "surtido",
  "conteo_cortes": {
    "surtido": 7,
    "carne": 3,
    "buche": 4,
    "cuero": 1,
    "lengua": 2
  },
  "total_clientes": 145,
  "negocio": "Tacos Javier"
}
```

**Corte más pedido:** Se calcula buscando texto en la columna `orden` de los pedidos del día (búsqueda de substring, no parsing estricto).

---

## Notificación proactiva al cliente

Cuando el admin cambia el estado de un pedido desde el panel o desde comandos del grupo de WhatsApp, el sistema notifica automáticamente al cliente.

### Flujo de notificación desde el panel

```
Admin hace PUT /api/pedidos/:id/estado { estado: "confirmado" }
        │
        ▼
updatePedidoEstado(id, "confirmado")  ← escribe en BD
        │
        ▼
MSGS_ESTADO["confirmado"] existe? → sí
        │
        ▼
waClient = getWhatsappClient()
        │
        ├── null? → silencio (bot no conectado)
        │
        ▼
SELECT c.telefono FROM pedidos p JOIN clientes c ON p.cliente_id = c.id WHERE p.id = ?
        │
        ▼
jid = getJIDReal(telefono) || `521${telefono}@c.us`
        │
        ▼
waClient.sendMessage(jid, "✅ Tu pedido ha sido confirmado...")
```

### Flujo de notificación personalizada

```
Admin hace POST /api/pedidos/:id/notificar { mensaje: "Tu pedido llegará en 20 min" }
        │
        ▼
Valida: waClient existe?  → no: HTTP 503
Valida: telefono en BD?   → no: HTTP 404
        │
        ▼
waClient.sendMessage(jid, mensaje)
→ HTTP 200 { ok: true, enviado_a: "3312345678" }
```

---

## Comandos del grupo admin de WhatsApp

Estos comandos se procesan en `src/handlers/comandos.js` cuando llegan del grupo configurado en `GRUPO_ID`:

| Comando | Descripción | Respuesta |
|---|---|---|
| `!pedidos` | Lista todos los pedidos del día | Tabla de texto con ID, cliente, tipo, total, estado |
| `!pendientes` | Solo pedidos en estado "pendiente" | Lista filtrada |
| `!confirmados` | Solo pedidos confirmados hoy | Lista filtrada |
| `!cancelados` | Solo pedidos cancelados hoy | Lista filtrada |
| `!rechazados` | Solo pedidos rechazados hoy | Lista filtrada |
| `!confirmar [tel]` | Confirma el pedido pendiente del cliente | Actualiza BD + notifica cliente por WA |
| `!rechazar [tel]` | Rechaza el pedido del cliente | Actualiza BD + notifica cliente |

**Formato de `[tel]`:** últimos dígitos del número (basta con los últimos 4 para identificar al cliente si no hay ambigüedad).

---

## SPA del panel (`public/index.html`)

El panel completo está en un solo archivo HTML con CSS y JavaScript incrustado.

**Secciones de la interfaz:**

| Sección | Descripción |
|---|---|
| Dashboard | Estadísticas del día: total de pedidos, ventas, ticket promedio, corte más pedido |
| Pedidos | Lista de pedidos con filtros por estado. Botones para confirmar/rechazar/en camino |
| Clientes | Lista de clientes con búsqueda. Formulario para ver/editar datos |
| Productos | Lista de cortes con precios. Formulario para crear/editar/desactivar |
| Configuración | Formularios para editar nombre del negocio, costo de domicilio, etc. |
| Horarios | Grid de días con toggles de abierto/cerrado y campos de hora |
| Banco | Formulario para datos de transferencia |
| Mensajes | Editor de mensajes personalizables del bot |

**Auto-refresh:** Cada 20 segundos, la SPA llama a `/api/pedidos?hoy=1` y `/api/stats` para actualizar el dashboard sin recargar la página.

**Autenticación en la SPA:** Si cualquier llamada a la API retorna HTTP 401, la SPA muestra el formulario de login y bloquea el resto de la interfaz.
