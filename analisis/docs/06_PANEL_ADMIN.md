# Panel de Administración

Este documento describe el panel web de administración: su arquitectura, autenticación, todas las rutas de la API REST y cómo se integra con WhatsApp.

---

## Visión general

El sistema tiene **dos interfaces de administración** con responsabilidades distintas:

### Grupo de WhatsApp — operación diaria
El grupo de WhatsApp es la interfaz operativa principal. No requiere PC ni navegador. Desde el celular, el administrador puede ver pedidos, confirmarlos, gestionar clientes, actualizar precios, controlar el bot y generar reportes mediante comandos de texto. Esta es la interfaz recomendada para el día a día del negocio.

### Panel web — configuración y onboarding
El panel web es para configuración estructural: mensajes del bot, horarios permanentes, datos bancarios, contraseñas, y el **wizard de onboarding** para configurar el negocio la primera vez. También muestra estadísticas históricas y permite exportar pedidos a CSV.

**URL del panel:** `http://localhost:3000` (configurable via `PANEL_PORT` en `.env`)  
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
| GET | `/api/stats/historico?periodo=semana\|mes` | Estadísticas agrupadas por día (últimos 7 o 30 días) |

### Monitoreo y pagos (rutas públicas — sin autenticación)

| Método | Ruta | Descripción |
|---|---|---|
| GET | `/health` | Health check: retorna 200 si WA conectado y BD OK, 503 si no. Incluye `status`, `whatsapp`, `db`, `uptime_s`, `tenant`, `timestamp` |
| POST | `/webhook/mercadopago` | Recibe notificaciones de pago de MercadoPago. Responde 200 inmediatamente, luego procesa async: confirma pedido en BD y notifica al cliente y grupo por WA. |

**Flujo del webhook de MercadoPago:**
```
POST /webhook/mercadopago { type: "payment", data: { id: "..." } }
        │
        ▼
res.sendStatus(200)  ← responde inmediatamente para que MP no reintente
        │
        ▼
mpPagos.procesarPago(data.id) → consulta Payment en API de MP
        │
        ├── no aprobado → return
        │
        ▼
actualizarEstadoPorId(pedidoId, "confirmado") → BD
        │
        ▼
waClient.sendMessage(jid_cliente, "✅ Pago confirmado...")
waClient.sendMessage(GRUPO_ID, "✅ PAGO CONFIRMADO — MercadoPago...")
```

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

Procesados en `src/handlers/comandos.js` cuando llegan del grupo configurado en `GRUPO_ID`. El bot distingue el grupo por el JID que termina en `@g.us`.

**Formato de `[tel]`:** 10 dígitos del número local (ej. `3312345678`). Para `!confirmar` y `!rechazar` bastan los últimos 4 dígitos si no hay ambigüedad.

---

### Ver pedidos

| Comando | Descripción |
|---|---|
| `!pedidos` | Todos los pedidos del día con estado, tipo, total y hora |
| `!pendientes` | Pedidos esperando `!confirmar` del admin |
| `!confirmados` | Pedidos ya confirmados hoy |
| `!cancelados` | Pedidos cancelados hoy |
| `!rechazados` | Pedidos rechazados hoy |
| `!domicilios` | Solo pedidos de domicilio del día |
| `!mostradores` | Solo pedidos de mostrador del día |
| `!pedido [tel]` | Detalle completo: ítems del pedido, dirección, método de pago, total, estado |

---

### Gestionar pedidos

| Comando | Descripción |
|---|---|
| `!confirmar [tel]` | Confirma el pedido pendiente. Notifica al cliente con mensaje de confirmación. Actualiza BD a "confirmado" |
| `!listo [tel]` | Notifica al cliente que su pedido está listo (mostrador) o en camino (domicilio). Actualiza BD a "listo" o "en_camino" |
| `!cancelar [tel]` | Cancela el pedido (pendiente o confirmado) con mensaje claro al cliente |
| `!rechazar [tel]` | Rechaza un pedido pendiente con aviso de "detectamos un asunto con tu orden" |

**Nota:** `!confirmar` y `!rechazar` sin teléfono actúan sobre el primer pedido pendiente en la lista. `!listo` y `!cancelar` requieren el teléfono.

---

### Clientes

| Comando | Descripción |
|---|---|
| `!cliente [tel]` | Datos del cliente: nombre, teléfono, dirección, total de pedidos, último pedido |
| `!buscar [nombre]` | Busca clientes por nombre o apellido (retorna hasta 5 resultados) |
| `!historial [tel]` | Últimos 15 pedidos del cliente con fecha, tipo, total y estado |
| `!top` | Top 10 clientes por número de pedidos, con gasto total acumulado |
| `!editar [tel] [campo] [valor]` | Edita un dato del cliente. Campos válidos: `nombre`, `apellido`, `direccion`, `colonia`, `referencia`, `correo` |
| `!mensaje [tel] [texto]` | Envía un mensaje de texto directo al cliente desde el número del bot |

**Ejemplo de editar:**
```
!editar 3312345678 direccion Calle Morelos 123
!editar 3312345678 colonia Centro
!editar 3312345678 nombre María
```

---

### Reportes

| Comando | Descripción |
|---|---|
| `!stats` | Resumen del día: total pedidos, confirmados, ventas, ticket promedio, top cortes |
| `!reporte ayer` | Stats de ayer |
| `!reporte semana` | Stats de los últimos 7 días |
| `!reporte mes` | Stats del mes actual |

---

### Menú y productos

| Comando | Descripción |
|---|---|
| `!precios` | Lista todos los cortes con precio de taco y torta. Marca los agotados |
| `!precio [corte] [taco] [torta]` | Actualiza precio de un corte en tiempo real. Invalida la caché del parser automáticamente |
| `!agotado [corte]` | Desactiva el corte — el bot no lo ofrece ni lo acepta hasta reactivarlo |
| `!disponible [corte]` | Reactiva un corte agotado |

**Ejemplo:**
```
!precio buche 30 60    → taco $30, torta $60
!agotado lengua        → el bot deja de ofrecer lengua
!disponible lengua     → vuelve a estar disponible
```

---

### Control del negocio

| Comando | Descripción |
|---|---|
| `!cerrar` | Cierra el negocio manualmente. Los clientes reciben el mensaje de fuera de horario aunque sea horario normal. No altera el horario permanente de la BD. |
| `!abrir` | Reabre el negocio (limpia el flag de cierre manual) |

**Cómo funciona `!cerrar`:** escribe `cierre_manual = "1"` en la tabla `configuracion`. `estaEnHorario()` en `horario.js` verifica este flag antes de cualquier otra lógica. `!abrir` lo pone en "0".

---

### Control del bot

| Comando | Descripción |
|---|---|
| `!pausar` | Pausa completamente las respuestas automáticas a clientes. Los mensajes llegan pero el bot no responde. |
| `!reanudar` | Reactiva el bot |
| `!sesiones` | Lista todos los clientes con sesión activa en memoria, con su número de teléfono y estado actual (llenando formulario, confirmando resumen, esperando corte, etc.) |
| `!limpiar` | Muestra cuántas sesiones activas hay y pide confirmación |
| `!limpiar confirmar` | Elimina TODAS las sesiones activas de clientes (limpieza masiva de emergencia) |
| `!resetear [tel]` | Limpia toda la sesión de un cliente específico: borra sus Maps en memoria y la sesión persistida en BD. El cliente puede iniciar desde cero. |
| `!estado` | Uptime del proceso, número de sesiones activas, estado de pausa, estado de cierre manual y versión |
| `!ayuda` | Lista todos los comandos disponibles |

**`!pausar` vs `!cerrar`:**
- `!pausar` — el bot no procesa ningún mensaje de cliente (silencio total)
- `!cerrar` — el bot responde con el mensaje de fuera de horario y ofrece preventa

---

## SPA del panel (`public/index.html`)

El panel completo está en un solo archivo HTML con CSS y JavaScript incrustado (~870 líneas).

**Secciones de la interfaz:**

| Sección | Descripción |
|---|---|
| Dashboard | Stats del día: pedidos, ventas, ticket promedio, corte más pedido. Tabla de histórico (7 o 30 días). |
| Pedidos | Lista de pedidos con filtros por estado y rango de fechas. Cambiar estado, eliminar, exportar CSV. |
| Clientes | Lista de clientes con formulario para crear/editar/eliminar. |
| Productos | Lista de cortes con precios. Formulario para crear/editar/desactivar. |
| Horarios | Grid de días con toggles de abierto/cerrado y campos de hora. |
| Banco | Formulario para datos de transferencia bancaria. |
| Mensajes | Editor de mensajes personalizables del bot. |
| Configuración | Nombre del negocio, costo de domicilio, etc. Cambio de contraseña. |
| Inicio rápido ⚡ | Wizard de onboarding en 5 pasos (ver abajo). |

**Auto-refresh:** Cada 20 segundos, la SPA llama a `/api/pedidos?hoy=1` y `/api/stats` para actualizar el dashboard sin recargar la página.

**Autenticación en la SPA:** Si cualquier llamada a la API retorna HTTP 401, la SPA muestra el formulario de login y bloquea el resto de la interfaz.

---

## Wizard de Onboarding (Inicio rápido)

Guía de configuración inicial en 5 pasos accesible desde el panel web. Se abre automáticamente en el primer login si `nombre_negocio` aún es el valor por defecto (`"Tacos Javier"`) y `localStorage.setup_done` no está definido.

| Paso | Datos que captura | API usada |
|---|---|---|
| 1. Negocio | Nombre, tipo de negocio, costo de domicilio | `POST /api/config` (3 claves) |
| 2. Horarios | Toggle abierto/cerrado y horas por día | `POST /api/horarios/:dia` (7 veces) |
| 3. Banco | Banco, beneficiario, CLABE | `POST /api/banco` |
| 4. Menú | Precio taco, torta, 100g | `POST /api/config` (3 claves) |
| 5. Contraseña | Contraseña actual, nueva, confirmación | `POST /api/cambiar-password` |

Al completar el paso 5, se graba `localStorage.setItem('setup_done', '1')` — el wizard no vuelve a abrirse automáticamente. Se puede acceder manualmente desde el sidebar en cualquier momento.

**Nota:** Si el servidor reinicia, `setup_done` en localStorage persiste en el navegador del admin, por lo que el wizard no vuelve a aparecer automáticamente aunque el proceso reinicie.
