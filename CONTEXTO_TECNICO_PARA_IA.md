# Contexto Técnico del Sistema — Rajem's Technology SaaS Bot WhatsApp

> Estado verificado contra el código: **2026-08-17**. Rama: `main`.  
> Documento de referencia para IA, desarrolladores y generación de pruebas automáticas.  
> Si existe contradicción: código ejecutado > este documento > CLAUDE.md.

---

## 1. Visión General

Plataforma SaaS **multi-tenant** de bots de WhatsApp para negocios de comida. Cada **tenant** es un negocio independiente con su propio proceso Node.js, base de datos SQLite, sesión de WhatsApp y panel web. Un **superadmin** centralizado gestiona todos los tenants.

### Stack
| Capa | Tecnología |
|---|---|
| Runtime | Node.js (CommonJS, sin transpilador) |
| WhatsApp | `whatsapp-web.js` + Puppeteer/Chromium |
| BD tenant | `better-sqlite3` (SQLite, operaciones síncronas) |
| BD superadmin | `better-sqlite3` (`data/admin.db`) |
| Web | Express 4 |
| Sesiones web | `express-session` con store SQLite custom (`src/db/session-store.js`) |
| Procesos | PM2 (bare-metal, sin Docker) |
| NLU local | `src/giros/{slug}/nlu.js` (parser regex/heurístico) |
| NLU fallback | Groq API — modelo `llama-3.3-70b-versatile` |
| Monitoreo | Sentry (opcional, activado con `SENTRY_DSN`) |
| Logs | Winston — consola + `logs/bot-err.log` + `logs/bot-combined.log` |

---

## 2. Arquitectura Multi-Tenant

### Aislamiento por tenant
```
/root/Rajem-Bot/               ← codebase compartido (único repo)
├── data/
│   ├── tenants.json           ← registro central de todos los tenants
│   ├── carnitas-bot.db        ← BD exclusiva del tenant
│   ├── tacos-pepe-gdl.db
│   └── backups/
├── envs/
│   ├── carnitas-bot.env       ← env vars del tenant (solo escritura de provisionamiento)
│   └── tacos-pepe-gdl.env
└── .wwebjs_auth/
    ├── session-carnitas-bot/  ← sesión WA (clientId = TENANT_ID)
    └── session-tacos-pepe-gdl/
```

**Por qué funciona con un solo codebase:**
- `src/db/core.js` abre `data/{TENANT_ID}.db` → cada tenant tiene su propia BD
- `index.js` usa `LocalAuth({ clientId: TENANT_ID })` → sesión WA por tenant
- Panel en puerto `PANEL_PORT` de su `.env`

### Procesos PM2
| Proceso | Archivo | Puerto | Propósito |
|---|---|---|---|
| `superadmin` | `src/superadmin/standalone.js` | 3001 | Panel central |
| `webhook-deploy` | `scripts/webhook-deploy.js` | 4000 | Git webhook + provisionamiento |
| `{TENANT_ID}` | `index.js` | `PANEL_PORT` | Bot WA + panel del negocio |

Los bots de tenant **no están** en `ecosystem.config.js`; se registran en PM2 dinámicamente al provisionar.

---

## 3. Arranque de un Tenant (`index.js`)

### Secuencia de inicialización
```
1. dotenv.config()
2. Sentry.init() si SENTRY_DSN está definido
3. Validar PANEL_SECRET en producción (falla si < 32 chars)
4. new Client({ authStrategy: LocalAuth({ clientId: TENANT_ID }) })
5. initDB() → seedDB() → tablas + migraciones + seed inicial
6. restaurarTodasLasSesiones() → rehidrata Maps de estado desde BD
7. startPanel(PANEL_PORT) → Express del panel
8. heartbeat cada 30s → configuracion.bot_heartbeat
9. client.initialize() → Puppeteer + WhatsApp Web
10. on("ready"):
    ├── reanudarDespachosPendientes() → despachos de preventa no enviados
    └── reanudarSeguimientoRepartidores() → timers de repartidores activos
11. Backup BD cada 6h via fork(scripts/backup-db.js)
12. Reset entregas_hoy a medianoche via setTimeout + setInterval
```

### Reconexión automática con backoff exponencial
```
disconnected → delay = min(5s × 2^intento, 5min) → client.destroy() → client.initialize()
Máximo 8 reintentos. Superado el límite: requiere reinicio manual de PM2.
```

### Resolución de LIDs (invariante crítico)
WhatsApp envía `msg.from` como `3310000001:12@lid` en ciertos dispositivos nuevos.

```javascript
// En procesarMensaje() — ANTES de cualquier routing:
if (msg.from.endsWith("@lid")) {
  const resultados = await client.getContactLidAndPhone([msg.from]);
  if (resultados?.[0]?.pn) msg.from = resultados[0].pn;
}
```

**Todos los handlers downstream siempre reciben JIDs `@c.us` (teléfono real).**

### Deduplicación de mensajes
Set de 200 IDs (`_msgProcesados`). WhatsApp reentrega mensajes; el Set los descarta silenciosamente. LRU simple: cuando llega a 201 entradas, elimina la más antigua.

### Cola de procesamiento por JID
Para evitar condiciones de carrera con mensajes rápidos del mismo cliente:
```javascript
const _colaJID = new Map(); // jid → Promise
// Cada mensaje espera al anterior del mismo JID antes de ejecutarse
```

### Modalidades de notificación y routing de grupos
```javascript
if (msg.from.endsWith("@g.us")) {
  // ¿Es el grupo de mandaditos?
  if (mandaditosId && msg.from === mandaditosId) {
    if (await handleMensajeMandaditos(msg, client)) return;
  }
  // Siempre también al handler de comandos (el mismo grupo puede ser ambos)
  await handleComandos(msg, client);
  return;
}
```

**Modalidades de notificación** (configuración `notif_modalidad` en BD):
| Valor | Descripción |
|---|---|
| `grupo` | Comandos y notificaciones al grupo WA de admins |
| `privado` | Comandos al número personal del dueño (`notif_privado_jid`) |
| `autochat` | El dueño se manda comandos a sí mismo (1 dispositivo) |
| `ninguno` | Sin notificaciones WA; solo gestión por panel |

---

## 4. Router Principal de Mensajes (`src/handlers/mensajes.js`)

Función `handleMensaje(msg, client)`. Todos los mensajes privados de clientes pasan aquí.

### Pre-procesamiento (antes del routing)
```
1. botPausado.pausado → return silencioso
2. trazabilidad.registrarEntrada(jid, texto)
3. ultimaActividad.set(jid, Date.now())
4. recordatorioEnviado.delete(jid)         ← cliente respondió, cancelar recordatorio
5. Patch msg.reply: deshabilitar link previews + registrar salidas en trazabilidad
6. Normalizar emojis: 👍✅☑🙌💯👌🤙 → "si" | 👎❌🚫🙅 → "no"
7. < 2 chars cuando hay flujo activo → ignorar
8. Ignorar URLs automáticas, dominios, emails
```

### Orden de prioridad (mayor a menor)
```
0.  Bot pausado → return
1.  esperandoCaptura (texto cuando se espera imagen de transferencia)
    ├── "cancelar" → limpiar + notificar grupo
    ├── FAQ → responder + recordar "manda la captura"
    ├── "ya pagué" → recordar que necesita imagen
    └── cualquier texto → "esperamos tu captura"
2.  Guardias de tipo (PTT/audio, mensajes vacíos)
3.  FAQs globales (SOLO si NO hay flujo activo) → detectarTodasPreguntasFrecuentes
    └── si respondió y hay horario → enviar MENU_FORMATO()
4.  handleCancelacionPagoMP      ← cliente en esperandoPagoMP
5.  handleCancelacionConfirmada  ← pedido en pedidosConfirmados, dentro de ventana
6.  handleMotivoCancelacion      ← esperandoMotivoCancelacion
7.  handlePrimerMensaje          ← cliente nuevo (!clientesNuevos.has(jid))
8.  handleFueraDeHorario         ← fuera de horario, sin preventa aceptada
9.  handleEdicionPendiente       ← esperandoEdicion
10. handleConfirmacionDatos      ← esperandoConfirmacionDatos
11. handleTipoEntrega            ← pregunta domicilio/mostrador
    └── si había ordenPendientePreventa → usar ese texto como pedido
12. handleCancelacionDurantePedido
13. handleEdicionResumen         ← resumenPendiente + "no" o edición
14. handleCambiosTipoDesdeResumen ← "cambia a domicilio/mostrador"
15. handleCambioMetodoDesdeResumen ← "cambia el pago a..."
16. handleAgregarDesdeResumen    ← "agrega" desde resumen pendiente
17. handleConfirmacionFinal      ← "sí" en resumenPendiente
18. handleCatchAllResumen        ← texto genérico con resumenPendiente activo
19. handleEsperandoTipoItem      ← ESTADO CRÍTICO BLOQUEANTE
20. handleEsperandoCorte         ← ESTADO CRÍTICO BLOQUEANTE
21. handleCambioTipoDuranteTomaPedido
22. handleConfirmacionItem       ← ESTADO CRÍTICO BLOQUEANTE
23. handleExtras                 ← salsas/extras tras confirmación de ítem
24. handleAgregarMas             ← ESTADO CRÍTICO BLOQUEANTE
25. handleCambioTipoDuranteFormulario
26. handleFormularioProgresivo   ← campos faltantes (nombre, tel, colonia...)
27. handleFAQDurantePedido
28. handleRepetirPedido
29. handlePedidoSimple           ← NLU local (parser)
30. handleSinCorte               ← detectó corte, sin tipo de ítem
31. handleSinTipo                ← detectó tipo de ítem, sin corte
32. handleModificacionAgregarMas ← "quita"/"cambia" fuera de flujo
33. handlePresupuestoInverso     ← "$150 de carnitas"
34. handleGroqFallback           ← Groq API (timeout 15s, 2 reintentos)
35. handleNoEntendi              ← no se pudo procesar
```

---

## 5. Estado en Memoria (`src/estado/`)

### Maps y Sets — fuente única de verdad (`estado/maps.js`)

| Nombre | Tipo | Contenido |
|---|---|---|
| `conversaciones` | Map | Historial de mensajes por JID |
| `clientesNuevos` | Set | JIDs que ya vieron el saludo inicial |
| `clientesPreventa` | Set | JIDs con preventa aceptada |
| `tipoEntregaCliente` | Map | `"domicilio"` \| `"mostrador"` |
| `datosCampos` | Map | Campos del formulario en progreso (nombre, tel, colonia...) |
| `datosRecibidos` | Set | JIDs con formulario completado |
| `resumenPendiente` | Map | `{texto, esTransferencia}` esperando "sí/no" |
| `pedidosConfirmados` | Map | Pedido guardado en BD, en ventana de cancelación |
| `esperandoCorte` | Map | Estado bloqueante: esperando corte |
| `esperandoTipoItem` | Map | Estado bloqueante: esperando tipo de ítem |
| `esperandoConfirmacionItem` | Map | Estado bloqueante: esperando "sí/no" al ítem |
| `esperandoAgregarMas` | Map | Estado bloqueante: "¿agregar algo más?" |
| `esperandoExtras` | Map | Salsas/extras tras confirmación de ítem |
| `esperandoCaptura` | Map | Esperando imagen de comprobante de transferencia |
| `esperandoPagoMP` | Map | `{pedidoId, expiraEn, telefono, nombre}` tras link MP |
| `esperandoMotivoCancelacion` | Map | Esperando texto del motivo |
| `esperandoConfirmacionDatos` | Map | Cliente recurrente, confirmando sus datos pre-llenados |
| `esperandoColonia` | Map | Opciones numeradas para colonia ambigua |
| `ordenPreResumen` | Map | Orden guardada mientras el formulario se completa |
| `ordenPendientePreventa` | Map | Texto del pedido detectado en el primer mensaje |
| `horaEntregaPreventa` | Map | Hora de apertura informada al cliente |
| `pedidoJSONActual` | Map | Items del pedido en curso (array JSON) |
| `erroresConsec` | Map | Contador de errores en preguntas críticas |
| `telefonosReales` | Map | jid → teléfono explícito (de flujos/utils.js) |
| `ultimoPedido` | Map | jid → último pedido confirmado (para "lo mismo") |
| `ultimaActividad` | Map | jid → timestamp del último mensaje |
| `recordatorioEnviado` | Map | jid → timestamp del recordatorio de timeout |

### Invariante crítico: `tipoEntregaCliente` y `datosCampos` sincronizados
Cuando se cambia el tipo de entrega, **ambos** deben actualizarse:
```javascript
tipoEntregaCliente.set(jid, "domicilio");
datosCampos.get(jid).tipoEntrega = "domicilio";
```
El bug clásico es actualizar uno y dejar el otro con el valor anterior.

### Persistencia de sesiones (`estado/sesiones.js`)
- **`persistirEstado(jid)`** → serializa los 22+ Maps → `sesiones_activas` (SQLite)
- **`restaurarEstado(jid, estado, historial)`** → rehidrata Maps desde JSON
- **`restaurarTodasLasSesiones()`** → al arrancar, restaura todas con TTL < 48h
- Si el objeto serializado está vacío → elimina la fila

### Timeout en dos fases (`flujos/utils.js`)
```
Inactividad 20 min (timeout_recordatorio_min en BD)
  → recordatorio contextual al cliente (jitter 1-3s aleatorio)

Inactividad 35 min (timeout_sesion_min en BD)
  → limpiarTodo(jid) + eliminar sesión de BD

recordatorioEnviado.delete(jid) cuando el cliente responde en mensajes.js
```

---

## 6. Flujos de Conversación (flujos/)

### 6.1 Flujo completo — Mostrador en horario

```
Cliente: "Hola"
→ handlePrimerMensaje (clientesNuevos.add)
  → si tipo_servicio = "ambos": SALUDO() + "¿Domicilio o mostrador?"
  → si solo mostrador: SALUDO() + caer a handleTipoEntrega

Cliente: "para recoger"
→ handleTipoEntrega
  → tipoEntregaCliente.set(jid, "mostrador")
  → MENU_FORMATO()
  → marcarMenuMostrado(jid)

Cliente: "3 tacos de carnitas"
→ handlePedidoSimple → parsearPedidoSimple
  → detecta: {tipo: "taco", cantidad: 3, corte: "carne"}
  → pedidoJSONActual.set(jid, [{presentacion:"taco", cantidad:3, corte:"carne"}])
  → muestra "3 tacos de Carne/Maciza — $X. ¿Es correcto?"
  → esperandoConfirmacionItem.set(jid, {...})

Cliente: "sí"
→ handleConfirmacionItem
  → "¿Deseas agregar algo más?"
  → esperandoAgregarMas.set(jid, {...})

Cliente: "no, ya es todo"
→ handleAgregarMas (esAgregarNo coincide: "no, ya es todo" | "no, eso es todo")
  → _mostrarConfirmacionFinal
  → "3 tacos de Carne/Maciza — $X\n💰 Subtotal: $X\n¿Es correcto?"
  → esperandoConfirmacionItem.set(jid, {..., _esOrdenFinalCompleta: true})

Cliente: "sí"
→ handleConfirmacionFinal detecta _esOrdenFinalCompleta
  → handleFormularioProgresivo para recopilar nombre + teléfono
  → esperandoConfirmacionDatos si cliente recurrente

(Formulario completado)
→ generarResumen() → resumenPendiente.set
→ "¿Es correcto?"

Cliente: "sí"
→ handleConfirmacionFinal
  → upsertCliente()          ← PRIMERO guardar en BD
  → registrarPedido()        ← ANTES de notificar
  → notificar grupo/privado
  → "métodos de pago: efectivo, tarjeta o transferencia"
  → si transferencia → esperandoCaptura.set
```

### 6.2 Flujo completo — Domicilio en horario con MercadoPago

```
...
(mismo inicio hasta resumen)

Cliente: "sí" (confirmación final)
→ handleConfirmacionFinal
  → upsertCliente + registrarPedido
  → mpPagos.estaConfigurado() → true
  → mpPagos.crearEnlacePago(datos) → URL de 30 minutos
  → guardarPagoPendiente(pedidoId, contexto, expiraEn)
  → esperandoPagoMP.set(jid, {pedidoId, expiraEn, telefono, nombre})
  → cliente recibe link

Cliente escribe cualquier cosa durante los 30 min:
→ handleCancelacionPagoMP (Date.now() < expiraEn)
  → "Tu pedido está pendiente de pago..." + recordar link
  → FAQ: responder + recordar link
  → "cancelar" → cancelar en BD + eliminarPagoPendiente + notificar grupo

MP webhook llega (GET /webhook/mercadopago):
→ procesarPago(paymentId) → consumirContextoPago(pedidoId)
→ actualizarEstadoPorId(pedidoId, "confirmado")
→ si domicilio → despacharConDelay(client, datos)

Link expirado, cliente escribe:
→ handleCancelacionPagoMP (Date.now() > expiraEn)
→ esperandoPagoMP.delete + limpiarTodo
→ actualizarEstadoPorId(pedidoId, "cancelado")
→ notificar grupo con motivo: "Link de pago MercadoPago vencido sin pagar"
→ "El link de pago ya venció. Si quieres ordenar escríbeme."

Panel (cada 60s): detecta pagos_pendientes expirados
→ cancela pedido en BD + elimina entrada + notifica grupo
```

### 6.3 Flujo completo — Preventa (fuera de horario)

```
Cliente: "quiero 3 tacos de carnitas"
→ !estaEnHorario()
→ _tieneSeñalesDePedido() → true (score ≥ 4)
→ ordenPendientePreventa.set(jid, textoOriginal)
→ "Entiendo que quieres ordenar *3 tacos de carnitas*, pero estamos fuera de servicio..."
  "¿Te gustaría hacer tu pedido en preventa?"

Cliente: "sí"
→ handleFueraDeHorario
  → clientesPreventa.add(jid)
  → "¿Tu pedido será para domicilio o pasas al mostrador?"

Cliente: "domicilio"
→ handleTipoEntrega
  → tipoEntregaCliente.set(jid, "domicilio")
  → MENU_FORMATO()
  → ordenPendientePreventa tenía el texto → se retoma el pedido
  → parsearPedidoSimple("quiero 3 tacos de carnitas") → procesar pedido

...flujo normal de pedido...

(Confirmación final)
→ registrarPedido → estado = 'preventa'
→ notificar grupo: "PEDIDO EN PREVENTA - Domicilio"
→ si domicilio: despacharConDelay(client, datos)
  → mandaditos_delay_min=15 → setTimeout(15 min) → enviarDespachoMandaditos
```

### 6.4 Formulario progresivo (`formulario.js`)

El bot recopila datos campo por campo según el tipo de entrega:

**Mostrador:** nombre → teléfono

**Domicilio:** nombre → teléfono → colonia → calle y número → referencia → método de pago

`interpretarCampos(texto, jid)` intenta extraer múltiples campos de un solo mensaje. Si el cliente escribe "Juan García, 3311234567, Col. Centro", extrae los tres a la vez.

**Validaciones críticas:**
```javascript
// extraerTelefono(texto) — valida LADA mexicano
// primer dígito 2-9 (no 0, no 1)
// detecta prefijo +52, separadores (331-234-5678)

// extraerTelefonoDeJID(jid)
// @c.us → últimos 10 dígitos
// @lid → null (resolución pendiente)

// buscarColonia(texto)
// 1. exacto por nombre normalizado
// 2. aliases en BD
// 3. fuzzy Levenshtein ≤ 2 si no hay match
// 4. si ambigüedad por grupo_ambiguedad → lista numerada + esperandoColonia

// Filtro para nombres en interpretarCampos:
// PALABRAS_NO_NOMBRE solo para detectar si es nombre de persona
// Para colonias: usar SOLO filtro de métodos de pago
// (evita rechazar "Centro", "Norte", "Reforma" como colonias)
```

**Clientes recurrentes:**
Si `extraerTelefonoDeJID(jid)` o `telefonosReales.get(jid)` tiene resultado y el cliente existe en BD:
- Pre-llenar nombre + dirección
- Mostrar resumen de datos conocidos
- `esperandoConfirmacionDatos.set(jid, {...})`
- "¿Confirmamos tus datos o quieres cambiar algo?"

### 6.5 Estados críticos bloqueantes (`orden.js`)

```
esperandoCorte:
  "surtido", "carnitas", "buche"... → _resetError + procesar
  "de todos/todo/cualquiera" → "surtido"
  NLU no entiende → _sumarError → si ≥ 2 errores: mostrar lista de cortes
  FAQ → responder + repetir pregunta de corte

esperandoTipoItem:
  "taco", "torta", "quesadilla"... → _resetError + procesar
  NLU no entiende → _sumarError → si ≥ 2 errores: mostrar tipos disponibles
  FAQ → responder + repetir pregunta

esperandoConfirmacionItem:
  palabrasConfirmacion (sí, dale, ándale...) → confirmar ítem
  "no", "nel" + motivo → edición del ítem
  FAQ → responder + repetir

esperandoAgregarMas:
  palabrasConfirmacion → "¿Qué más deseas ordenar?"
  esAgregarNo: "no"/"nel"/"no, ya es todo"/"no, eso es todo"/número+no → cerrar orden
  "subtotal/cuánto va" → mostrar subtotal parcial
  FAQ → responder + repetir
```

`erroresConsec` vive en `estado/maps.js` como `Map`. Se resetea al recibir respuesta válida.

### 6.6 Resumen y Confirmación Final (`resumen.js`)

```javascript
// handleConfirmacionFinal — orden de operaciones invariante:
1. upsertCliente(datos)              // guardar/actualizar cliente
2. pedidoId = registrarPedido(...)  // guardar pedido en BD
3. trazabilidad.vincularPedido(jid, pedidoId)
4. notificar grupo/privado
5. // SOLO DESPUÉS:
   if (mpPagos.estaConfigurado()) → link de pago
   else if (esTransferencia) → DATOS_BANCO + esperandoCaptura
   else → despacharConDelay() para domicilio
```

**Si falla el guardado en BD → cliente recibe error, no confirmación falsa.**

### 6.7 Cancelación (`cancelacion.js`)

**Durante pedido en curso (`handleCancelacionDurantePedido`):**
- Detecta `RE_CANCELAR` en cualquier flujo activo
- `limpiarTodo(jid)` + limpiar todos los Maps relacionados
- `ordenPendientePreventa.delete(jid)`

**Pedido ya confirmado (`handleCancelacionConfirmada`):**
- Ventana configurable: `tiempo_cancelacion` (default 15 min)
- Pide motivo → `esperandoMotivoCancelacion`
- `handleMotivoCancelacion` → notifica grupo + `actualizarEstadoPedido` + `actualizarEstadoConfirmado`
- El pedido puede estar en 'pendiente' o 'confirmado'; se actualiza ambos por si el admin lo confirmó mientras

**Con link MP activo (`handleCancelacionPagoMP`):**
```
Link expirado:
  → esperandoPagoMP.delete + limpiarTodo
  → actualizarEstadoPorId("cancelado")
  → notificar grupo (formato Solicitud de Cancelacion estándar)
  → respuesta al cliente

Cancelación explícita (link aún vigente):
  → esperandoPagoMP.delete + limpiarTodo
  → actualizarEstadoPorId("cancelado")
  → eliminarPagoPendiente(pedidoId)
  → notificar grupo
  → respuesta al cliente
```

---

## 7. NLU — Comprensión de Lenguaje Natural

### 7.1 Arquitectura

`src/handlers/pedidoParser.js` es un **router proxy lazy**:
```javascript
let _nluCache = null;
function _getNlu() {
  if (_nluCache) return _nluCache;
  const giro = getGiroActivo();
  try { _nluCache = require(`../giros/${giro.slug}/nlu`); }
  catch (_) { _nluCache = require('../giros/taqueria/nlu'); }
  return _nluCache;
}
```

Cada exportación delega al NLU del giro activo en tiempo de llamada.

`invalidarCacheCortes()` borra `_nluCache` para que el siguiente llamado re-evalúe el giro.

### 7.2 Utilidades genéricas (`src/nlu/core.js`)

| Función | Descripción |
|---|---|
| `detectarTipoItemDesdeTexto(texto)` | Detecta presentación ("taco", "torta"...) desde item_types en BD |
| `listaItemTypes(soloUnidad=false)` | Lista item types activos; `true` excluye gramos/pesos |
| `detectarRepetirPedido(texto)` | "lo mismo que la vez pasada" → true |
| `normalizar(texto)` | minúsculas + quitar acentos (NFD) |
| `invalidarCacheItemTypes()` | Limpia caché de item types (TTL 60s) |

### 7.3 NLU Taquería (`src/giros/taqueria/nlu.js`)

**Funciones principales:**

| Función | Descripción |
|---|---|
| `parsearPedidoSimple(texto)` | Parser principal — detecta ítems, cortes, cantidades, precios |
| `detectarPreguntaFrecuente(texto)` | Primera intent coincidente |
| `detectarTodasPreguntasFrecuentes(texto)` | Array de todas las intents (solo en mensajes.js fuera de flujo) |
| `buscarCorteFuzzy(palabra)` | Levenshtein ≤ 2 contra lista de cortes activos |
| `detectarSinCorte(texto)` | Pedido con tipo de ítem pero sin corte |
| `detectarSinTipo(texto)` | Pedido con corte pero sin tipo de ítem |
| `detectarModificacion(texto)` | "quita", "cambia", "agrega" en el pedido |
| `detectarRefresco(texto)` | Detecta bebida |
| `detectarSalsa(texto)` | Detecta salsa extra |
| `textoANumero(texto)` | "treinta y dos" → 32 |
| `separarRefresco(texto)` | Separa parte de refresco del texto de pedido |
| `parsearDistribucionCortes(texto)` | "2 de carne y 1 de buche" en un pedido mixto |
| `parsearDistribucionRefrescos(texto)` | Distribución de bebidas entre ítems |

**Intents de FAQ:**
```
precio, horario, domicilio, menu, ubicacion, metodos_pago,
descripcion_corte, pedido_listo, ya_en_camino, despedida, total_parcial
```

**Prioridad importante:** `pedido_listo` se evalúa ANTES que `horario` para evitar que "¿ya están listos?" responda con el horario de apertura.

**Cachés internos (TTL 60s):**
- `_cortesCache` — lista de cortes activos de BD
- `_cortesRegexCache` — regex construida desde cortes activos

**Regla anti-colisión en fuzzy:**
```javascript
for (const palabra of palabrasClave) {
  if (detectarTipoItemDesdeTexto(palabra)) continue; // evita que "burritos" → "cueritos" (dist=2)
  const fuzzy = buscarCorteFuzzy(palabra);
  ...
}
```

**Preprocesamiento:**
- `"y aparte"` → eliminado como conector de bebida (no fuerza Groq)
- `"de todos"` / `"de todo"` / `"cualquiera"` en `handleEsperandoCorte` → "surtido"

### 7.4 Fallback Groq (`handleGroqFallback`)

```
1. Verificar que GROQ_API_KEY esté disponible (env o admin.db)
2. Construir historial de conversación + prompt de sistema (src/prompts/base.js)
3. POST a Groq API con timeout GROQ_TIMEOUT_MS (default 15000ms)
4. Si timeout o error → retry (hasta 2 intentos)
5. Si falla → handleNoEntendi
```

---

## 8. Base de Datos del Tenant

### 8.1 Configuración técnica (`src/db/core.js`)

```javascript
pragma journal_mode = DELETE   // simplifica backups; serializa escrituras concurrentes
pragma busy_timeout = 5000     // absorbe contención breve (ms)
```

`guardarDB()` es un no-op. `better-sqlite3` persiste automáticamente en cada escritura síncrona.

Nombre del archivo: `data/{TENANT_ID || 'tacos_javier'}.db`

### 8.2 Todas las tablas (por área)

#### Catálogo del giro
```sql
business_types (id, slug, nombre, descripcion, emoji, activo)

item_types (
  id, business_type_id→business_types,
  slug, nombre, nombre_plural, emoji, aliases_json,
  soporta_gramos, soporta_pesos, precio_campo, precio_base,
  activo DEFAULT 0   ← 0 por defecto; el Superadmin activa por tenant
)

cortes (
  id, giro_id→business_types, slug, nombre, aliases_json,
  descripcion, precio_base, precios_json, activo, seccion
)

menu_items (
  id, producto_slug, formato_slug, categoria,
  precio, activo, disponible, eliminado,
  precios_json, created_at
  UNIQUE INDEX (producto_slug, COALESCE(formato_slug,''), categoria)
)
-- activo=1: habilitado por Superadmin (el tenant NO puede cambiar esto)
-- disponible=0: agotado (oculto en WA, pero habilitación intacta)
-- eliminado=1: eliminado lógicamente

productos (id, nombre, precio_taco, precio_torta, precio_100g, activo, ...)
-- LEGACY. Solo para migración de tenants antiguos. No usar en código nuevo.
```

#### Operación
```sql
clientes (
  id, nombre, apellido, telefono UNIQUE,
  correo, calle_numero, colonia, referencia,
  total_pedidos, ultimo_pedido_json, fecha_registro
)

pedidos (
  id, cliente_id→clientes,
  tipo TEXT,          -- 'mostrador' | 'domicilio' | 'preventa'
  orden TEXT,         -- texto del pedido
  total REAL,
  metodo_pago TEXT,
  estado TEXT,        -- 'pendiente'→'confirmado'→'listo' | 'cancelado' | 'rechazado'
  hora_entrega TEXT,
  fecha TEXT
)

configuracion (clave TEXT PK, valor TEXT)
horarios (id, dia 0-6, nombre_dia, abierto, hora_inicio, hora_fin)
banco (id, banco, beneficiario, clabe, activo)
mensajes_bot (clave TEXT PK, valor TEXT)
```

#### Autenticación y sesiones
```sql
usuarios_panel (id, usuario UNIQUE, password bcrypt)
sesiones_activas (
  numero TEXT PK,     -- JID del cliente
  estado_json TEXT,
  historial_json TEXT DEFAULT '[]',
  actualizado_en TEXT
)
-- TTL: 48 horas (filtrado en restaurarTodasLasSesiones)
```

#### Pagos
```sql
pagos_pendientes (
  pedido_id TEXT PK,
  jid TEXT, telefono TEXT, nombre TEXT, resumen TEXT,
  expira_en TEXT      -- ISO 8601, ahora + 30 min
)
```

#### Observabilidad/Trazabilidad
```sql
conversaciones_trace (
  id TEXT PK,         -- UUID
  jid TEXT,
  pedido_id→pedidos,
  estado,             -- 'activa' | 'terminada'
  etapa_actual,
  requiere_atencion INTEGER DEFAULT 0,
  motivo_atencion TEXT,
  iniciada_en, actualizada_en
)

conversacion_eventos (
  id, trace_id→conversaciones_trace,
  direccion,          -- 'cliente' | 'bot' | 'sistema'
  tipo,               -- 'mensaje' | 'respuesta' | 'ruta_nlu'
  etapa, contenido, metadata_json, fecha
)

alertas_operativas (
  id, trace_id, pedido_id,
  tipo,               -- 'error_flujo_conversacion' | 'nlu_no_entendido' | custom
  severidad,          -- 'critica' | 'media' | 'baja'
  titulo, detalle, estado, ocurrencias,
  resuelta_por, nota_resolucion, creada_en, actualizada_en, resuelta_en
)
-- Retención: 90 días (observabilidad_retencion_dias en configuracion)

INDEXES:
  idx_pedidos_cliente ON pedidos(cliente_id)
  idx_trace_jid_estado ON conversaciones_trace(jid, estado, actualizada_en)
  idx_eventos_trace ON conversacion_eventos(trace_id, id)
  idx_alertas_estado ON alertas_operativas(estado, severidad, actualizada_en)
```

#### Geografía
```sql
colonias (
  id, nombre UNIQUE, lat, lon, activo,
  slug, tipo,         -- 'colonia' | 'fraccionamiento' | 'barrio' | etc.
  aliases TEXT,       -- JSON array
  geo_tepic_id INTEGER UNIQUE,
  codigo_postal, fuente_coordenadas, precision_coordenadas,
  confianza, verificada INTEGER DEFAULT 0,
  grupo_ambiguedad TEXT  -- para desambiguar colonias con mismo nombre
)

tarifas_zonas (id, nombre_zona, distancia_max REAL, tarifa REAL)
-- distancia en km desde negocio_lat/lon de configuracion
```

#### Mandaditos/Reparto
```sql
repartidores (
  id, jid UNIQUE, nombre, activo, en_ruta,
  pedido_actual_id, tiempo_ruta_inicio,
  entregas_hoy, entregas_total, entregas_confirmadas,
  promedio_entrega_min REAL,
  ultima_actividad, creado_en
)

entregas_historial (
  id, repartidor_id→repartidores, pedido_id,
  colonia, minutos INTEGER,
  confirmado INTEGER DEFAULT 1,  -- 1=NLU confirmó | 0=timeout
  fecha, creado_en
)
-- promedio_entrega_min se calcula SOLO de entregas con confirmado=1

despachos_programados (
  id, pedido_id, cliente_nombre, cliente_tel,
  cliente_calle, cliente_colonia, cliente_ref,
  total_orden, tarifa, hora_despacho, ejecutado INTEGER DEFAULT 0
)

solicitudes_producto (id, nombre_propuesto, descripcion, categoria, motivo, estado, created_at)
solicitudes_geo (id, tipo, datos_propuestos, motivo, estado, respuesta, created_at)
schema_migrations (version TEXT PK, applied_at TEXT)
```

### 8.3 Claves de `configuracion` (todas)

| Clave | Default | Descripción |
|---|---|---|
| `nombre_negocio` | `Mi Negocio` | Seeded desde `NOMBRE_NEGOCIO` env |
| `business_type_slug` | `taqueria` | Seeded desde `BUSINESS_TYPE` env |
| `seccion_taqueria` | `ambas` | `ambas` \| `carnitas` \| `asada` |
| `plan_activo` | `basico` | Seeded desde `PLAN_ACTIVO` env |
| `grupo_id` | `` | JID del grupo admin de WA |
| `domicilio_costo` | `50` | Costo fijo de domicilio |
| `geo_tarifa_aproximada` | `0` | 1 = mostrar tarifa aproximada antes de confirmar |
| `geo_radio_cobertura_km` | `` | Radio de cobertura desde el negocio |
| `metodos_mostrador` | `efectivo, tarjeta o transferencia` | |
| `metodos_domicilio` | `efectivo, tarjeta o transferencia` | |
| `tiempo_cancelacion` | `15` | Minutos para cancelar después de confirmar |
| `timeout_recordatorio_min` | `20` | Inactividad antes del recordatorio |
| `timeout_sesion_min` | `35` | Inactividad antes de limpiar sesión |
| `tipo_servicio` | `ambos` | `mostrador` \| `domicilio` \| `ambos` |
| `pasarela_activa` | `` | `mercadopago` \| `stripe` \| `conekta` \| vacío |
| `pasarela_config` | `{}` | API keys encriptadas (clave: PANEL_SECRET) |
| `notif_modalidad` | `grupo` | `grupo` \| `privado` \| `autochat` \| `ninguno` |
| `notif_privado_jid` | `` | JID para modo privado |
| `notif_autochat_jid` | `` | JID propio del bot para autochat |
| `bot_pausado` | `0` | 1 = pausado para todos |
| `bot_heartbeat` | | ISO timestamp del último heartbeat |
| `qr_pendiente` | `` | QR actual para el superadmin |
| `grupos_wa_cache` | `[]` | JSON de grupos WA disponibles |
| `negocio_lat`, `negocio_lon` | `` | Coordenadas del negocio |
| `negocio_calle`, `negocio_colonia`, `negocio_referencia` | `` | Dirección |
| `alerta_pedido_min` | `10` | Minutos para alerta de pedido no visto |
| `estrategia_precio_mixto` | `mas_caro` | `mas_caro` \| `promedio` |
| `grupo_mandaditos_id` | `` | JID del grupo de repartidores |
| `mandaditos_delay_min` | `15` | Delay despacho tras confirmar |
| `mandaditos_silencio_min` | `15` | Sin interrumpir al repartidor |
| `mandaditos_recordatorio_min` | `30` | Minutos para preguntar si entregó |
| `mandaditos_timeout_post_min` | `20` | Minutos extra para registrar timeout |
| `observabilidad_retencion_dias` | `90` | Retención de trazas |
| `public_url` | `` | URL pública del tenant (prioridad en APP_URL) |
| `catalogo_giro_migrado_v2` | | Flag de migración legacy → menu_items |

---

## 9. Sistema de Giros (Multi-Negocio)

### 9.1 Estructura de un giro (`src/giros/taqueria/index.js`)

```javascript
module.exports = {
  slug: 'taqueria',
  nombre: 'Taquería',
  descripcion: '...',
  emoji: '🌮',
  itemTypes: [
    { slug, nombre, nombre_plural, emoji, aliases, soporta_gramos, soporta_pesos, precio_campo, precio_base }
  ],
  cortes: [
    { slug, nombre, aliases, descripcion, precio_base, seccion }
  ],
  refrescos: [{ nombre, precio }],
  salsas: [{ nombre, precio }],
  configDefaults: { ... },     // se seedean en tabla configuracion (INSERT OR IGNORE)
  mensajesDefaults: { ... },   // se seedean en mensajes_bot (INSERT OR IGNORE)
  vocabulario: {
    preguntaCorte: '¿De qué corte quieres %desc%?'
  },
  comportamiento: { ... },
};
```

### 9.2 Item Types del giro Taquería

| Slug | Nombre | soporta_gramos | soporta_pesos | Plan |
|---|---|:---:|:---:|---|
| `taco` | Taco | — | — | Básico |
| `torta` | Torta | — | — | Básico |
| `gramos` | Gramos | ✓ | — | Básico |
| `por_pesos` | Por pesos | — | ✓ | Básico |
| `quesadilla` | Quesadilla | — | — | Plus |
| `vampiro` | Vampiro | — | — | Plus |
| `burrito` | Burrito | — | — | Plus |

`activo=0` por defecto. El Superadmin los activa por tenant desde **Config Tenant**.

### 9.3 Catálogo Operativo (`src/giros/catalogo-tenant.js`)

Fachada única que combina:
- Definiciones inmutables del giro (NLU, aliases, descripción)
- Overlay de SQLite (habilitación Superadmin, precios del tenant)

**Todo código que necesite información del catálogo debe pasar por esta fachada.** No crear listas alternativas en handlers, paneles o scripts.

### 9.4 Giros registrados (`src/giros/index.js`)

| Slug | Estado de producción |
|---|---|
| `taqueria` | Producción |
| `hamburgueseria` | Implementada; validación funcional pendiente |

### 9.5 Seed de giros (`src/db/seed.js`)

`seedDB()` es **idempotente**. Se ejecuta al arrancar y:
- Crea tablas si no existen (CREATE TABLE IF NOT EXISTS)
- Agrega columnas nuevas con `ALTER TABLE ... ADD COLUMN` envuelto en try/catch
- Proyecta cortes e item_types del giro (`INSERT OR IGNORE`)
- Sincroniza aliases_json (siempre sobreescribe — es config de sistema)
- Seedea configuración, horarios, banco, mensajes, usuario panel si las tablas están vacías
- **Nunca** reactiva automáticamente un catálogo que el Superadmin dejó vacío
- `BOT_TEST_MODE=1` → activa todos los item_types + puebla menu_items para tests

---

## 10. Panel del Tenant (`src/panel/server.js`)

Express en `PANEL_PORT`. Auth con sesión SQLite (8h). Rate limiting login: 5 intentos/min/IP (Map en memoria).

### Headers de seguridad (siempre)
```
X-Content-Type-Options: nosniff
X-Frame-Options: DENY
Referrer-Policy: same-origin
Permissions-Policy: camera=(), microphone=(), geolocation=()
```

### Protección CSRF
```javascript
// Verifica Origin == Host en POST/PUT/PATCH/DELETE
if (new URL(origin).host !== req.get('host')) return 403;
```

### Sesión
```javascript
{
  name: `rajem.panel.${TENANT_ID}.sid`,
  secret: PANEL_SECRET,
  store: SqliteSessionStore,
  cookie: { maxAge: 8h, httpOnly: true, sameSite: 'lax', secure: COOKIE_SECURE==='1' }
}
```

### Webhooks públicos (sin auth)
```
GET  /health              → { status: 'ok', tenant, uptime }
POST /webhook/mercadopago → procesarPago → despacharConDelay si domicilio
POST /webhook/stripe      → (requiere rawBody para verificar HMAC)
POST /webhook/conekta     → procesarPago
```

### Alerta de pedido sin confirmar (intervalo 60s)
```sql
SELECT p.* FROM pedidos p
WHERE p.estado = 'pendiente'
  AND datetime(p.fecha) <= datetime('now', '-{alerta_pedido_min} minutes')
  AND NOT EXISTS (
    SELECT 1 FROM pagos_pendientes pp
    WHERE pp.pedido_id = CAST(p.id AS TEXT)
      AND pp.expira_en > datetime('now')
  )
```
Los pedidos esperando pago MP **no** generan alerta hasta que el link expire.

### Auto-cancelación de links MP expirados (mismo intervalo 60s)
```javascript
// Detecta pagos_pendientes con expira_en < now
// Para cada uno:
//   actualizarEstadoPorId(pedidoId, "cancelado")
//   eliminar de pagos_pendientes
//   sendMessage(grupoId, "Solicitud de Cancelacion\nMotivo: Link MP expirado sin pagar")
```

### Auto-notificación al cambiar estado desde panel
Cuando el admin cambia estado de un pedido via la API REST, el panel usa `whatsapp-bridge.js` para enviar mensaje al cliente. El bridge es un singleton que expone el cliente WA sin dependencias circulares.

### Secciones del panel (SPA `src/panel/public/index.html`)
- **Dashboard** — pedidos del día, stats, estado del bot
- **Pedidos** — filtros por estado/tipo, exportación CSV
- **Atención** — alertas operativas + línea de tiempo de conversaciones
- **Clientes** — búsqueda, historial, edición limitada
- **Productos** — solo lo habilitado por Superadmin; el tenant cambia precio y disponible/agotado
- **Horarios** — por día de semana con apertura/cierre configurable
- **Banco** — datos para transferencia bancaria
- **Mensajes Bot** — textos configurables por clave
- **Configuración** — nombre, tipo de servicio, métodos de pago, pasarela

### Wizard de Onboarding
Se abre automáticamente al primer login si `nombre_negocio === "Mi Negocio"` Y `localStorage.setup_done` no existe.
5 pasos: negocio → horarios → banco → menú → contraseña.

---

## 11. Módulo Mandaditos / Reparto (`src/handlers/mandaditos.js`)

### Estado en memoria (módulo-local)

| Variable | Tipo | Contenido |
|---|---|---|
| `despachosPendientes` | Map | `messageId → {pedidoId, nombre, tel, calle, colonia, ref, total, tarifa}` |
| `_timers` | Map | `jid → {timerRecordatorio, timerTimeout, pedidoColonia, pedidoId, inicio}` |
| `_zonasSilencio` | Map | `jid → timestamp fin de silencio` |
| `_esperandoRespuesta` | Set | JIDs que recibieron "¿Ya entregaste?" |
| `_despachoTimers` | Map | `pedidoId → timer de despacho programado` |
| `_despachosEnAsignacion` | Set | messageIds en proceso (evita doble asignación) |

### Flujo completo de despacho

```
1. Cliente confirma domicilio (o admin ejecuta !confirmar)
   → despacharConDelay(client, datos)

2. despacharConDelay():
   → lee mandaditos_delay_min de BD
   → si > 0: guardarDespachoProgramado() + setTimeout(delay) → enviarDespachoMandaditos()
   → si = 0: enviarDespachoMandaditos() directo
   → preventa/reanudar: llaman directo a enviarDespachoMandaditos() sin delay

3. enviarDespachoMandaditos(client, datos):
   → sendMessage(grupo_mandaditos_id, "Pedido #X — Solicitud de reparto\n...")
   → msgId = resultado del envío
   → despachosPendientes.set(msgId, datos)
   → marcarDespachoEjecutado(datos.pedidoId)

4. Repartidor quote-responde la solicitud:
   → handleMensajeMandaditos(msg, client)
   → _resolverDespachoCitado(msg.getQuotedMessage())
     ├── buscar por messageId exacto en despachosPendientes
     └── fallback: extraer "Pedido #N" del body y buscar por pedidoId

5. Asignación:
   → _despachosEnAsignacion.add(quotedId) (evita doble asignación)
   → upsertRepartidor(jid, nombre)
   → setEnRuta(jid, pedidoId)
   → sendMessage(jidPrivado, "Tienes que recoger el pedido...")
   → _zonasSilencio.set(jid, now + silencio_min * 60000)
   → setTimeout(recordatorio_min * 60000) → preguntar "¿Ya entregaste?"
   → _timers.set(jid, {...})

6. Repartidor responde "entregué" / "sí":
   → handleMensajeRepartidor(msg, client)
   → NLU: _PATRONES_CONFIRMADOS | "sí" | "no"
   → si confirma: registrarEntregaConfirmada(jid, pedidoId, colonia, minutos)
     → confirma=1, actualiza promedio_entrega_min
   → limpiar timers + setEnRuta(false)

7. Sin respuesta después de timeout_post_min:
   → registrarEntregaTimeout(jid, pedidoId)
   → confirma=0, minutos=NULL (no se incluye en promedio)
```

### Resolución de JIDs en mandaditos
El repartidor puede estar registrado con `@lid`. `_resolverJidPrivado(jid, client)` llama `getContactLidAndPhone` para obtener el JID real antes de enviar por privado.

### Identificación de despacho por quote
whatsapp-web.js no siempre devuelve el mismo formato de ID para el mensaje enviado vs el citado. El fallback extrae el número de pedido del cuerpo con regex:
```javascript
const match = texto.match(/Pedido\s*#\s*(\d+)\s*[—-]\s*Solicitud de reparto/i);
```

### Reanudación tras reinicio (`reanudarDespachosPendientes`)
Al `on("ready")`, lee `despachos_programados WHERE ejecutado=0`:
- Si `hora_despacho` ya pasó → enviar inmediatamente
- Si no → programar setTimeout

`reanudarSeguimientoRepartidores()` restaura los timers de repartidores `en_ruta=1` con estado `pendiente_confirmacion`.

### Configuración
| Clave BD | Default | Descripción |
|---|---|---|
| `grupo_mandaditos_id` | `""` | JID del grupo de repartidores |
| `mandaditos_delay_min` | `15` | Delay desde confirmación hasta despacho |
| `mandaditos_silencio_min` | `15` | Minutos sin interrumpir al repartidor |
| `mandaditos_recordatorio_min` | `30` | Minutos para preguntar si entregó |
| `mandaditos_timeout_post_min` | `20` | Minutos extra antes de registrar timeout |

---

## 12. Sistema de Pagos

### Drivers y selección (`src/pagos/index.js`)
```javascript
// Selecciona driver según pasarela_activa en BD del tenant
// Credenciales en pasarela_config (JSON encriptado con PANEL_SECRET)
```

| Driver | Archivo | Plan |
|---|---|---|
| MercadoPago | `src/pagos/mercadopago.js` | Plus |
| Stripe | `src/pagos/stripe.js` | Plus |
| Conekta | `src/pagos/conekta.js` | Plus |

### Prioridad de APP_URL (`src/pagos/contexto.js`)
```javascript
function getAppUrl() {
  const tenantUrl = getConfig('public_url');
  if (tenantUrl) return tenantUrl.replace(/\/$/, '');
  // process.env.APP_URL tiene prioridad sobre global de admin.db
  // porque provisionar-tenant.sh lo inyecta con la URL específica del tenant
  if (process.env.APP_URL) return process.env.APP_URL.replace(/\/$/, '');
  return getAdminAppUrl() || '';
}
```

### Flujo MercadoPago
```
1. estaConfigurado() → verifica pasarela_activa='mercadopago' + token no vacío
2. crearEnlacePago(datos) → SDK v3, Preference 30min → URL de pago
3. registrarContextoPago(pedidoId, contexto) → pagos_pendientes (expira en 30min)
4. esperandoPagoMP.set(jid, {pedidoId, expiraEn: now+30min, ...})
5. Webhook POST /webhook/mercadopago:
   → procesarPago(paymentId) → estado 'approved'?
   → consumirContextoPago(pedidoId) → elimina de pagos_pendientes
   → actualizarEstadoPorId(pedidoId, "confirmado")
   → si domicilio → despacharConDelay()
```

### Transferencia bancaria (sin pasarela)
```
1. generarResumen() detecta metodo_pago contiene "transferencia"
2. resumenPendiente.set(jid, {texto, esTransferencia: true})
3. handleConfirmacionFinal:
   → registrarPedido()
   → DATOS_BANCO() → datos bancarios del tenant
   → esperandoCaptura.set(jid, {telefono, pedidoId})
4. handleImagen:
   → msg.downloadMedia() con reintentos
   → enviar imagen al grupo/privado
   → "¡Gracias! Recibimos tu comprobante 📸"
   → esperandoCaptura.delete(jid)
```

---

## 13. Trazabilidad / Observabilidad (`src/db/observabilidad.js`)

### Flujo de una traza
```
Primer mensaje → obtenerOCrearTraza(jid)
  → busca traza activa < 48h en BD
  → si no existe: INSERT conversaciones_trace (UUID)
  → cachea en _trazasActivas Map (en memoria)

Cada mensaje → registrarEntrada(jid, contenido)
  → INSERT conversacion_eventos (direccion='cliente', tipo='mensaje')

Cada respuesta → registrarSalida(jid, contenido)
  → INSERT conversacion_eventos (direccion='bot', tipo='respuesta')

Cada handler → registrarRuta(jid, 'nombre_del_handler')
  → INSERT conversacion_eventos (direccion='sistema', tipo='ruta_nlu')

Error → crearAlerta(jid, tipo, titulo, detalle, {severidad})
  → INSERT alertas_operativas (ocurrencias++)
```

### Etapa actual de conversación (`obtenerEtapaConversacion`)
Mapeo de Maps de estado a etapas legibles:
```javascript
const etapas = [
  ['esperando_captura', e.esperandoCaptura],
  ['resumen_pendiente', e.resumenPendiente],
  ['confirmacion_datos', e.esperandoConfirmacionDatos],
  ['edicion', e.esperandoEdicion],
  ['extras', e.esperandoExtras],
  ['agregar_mas', e.esperandoAgregarMas],
  ['confirmacion_item', e.esperandoConfirmacionItem],
  ['corte', e.esperandoCorte],
  ['tipo_item', e.esperandoTipoItem],
  ['colonia', e.esperandoColonia],
  ['formulario', e.datosCampos],
];
```

### Alertas registradas automáticamente
| Tipo | Cuándo |
|---|---|
| `error_flujo_conversacion` | Excepción no capturada durante `handleMensaje` |
| `nlu_no_entendido` | Router llega hasta `handleNoEntendi` |

Las alertas se resuelven desde **Atención** en el panel del tenant.

---

## 14. Superadmin (`src/superadmin/`)

Panel central en `http://VPS:3001`. **Solo debe exponerse via HTTPS (proxy Nginx).**

### Autenticación
```javascript
{
  name: 'rajem.superadmin.sid',
  secret: SUPERADMIN_SECRET,  // ≥ 32 chars en producción
  store: SqliteSessionStore(() => getAdminDB()),
  cookie: { maxAge: 8h, httpOnly: true, sameSite: 'lax', secure: COOKIE_SECURE==='1' }
}
// Rate limiting: 5 intentos/min/IP (Map en memoria)
// Usuario inicial: SUPERADMIN_INITIAL_USER (default 'rajem')
// Contraseña inicial: SUPERADMIN_INITIAL_PASSWORD (obligatoria en producción)
```

### BD del Superadmin (`data/admin.db`)
Tablas: `config_global`, `superadmin_usuarios`, `superadmin_sesiones`, `superadmin_auditoria`

Claves de `config_global`: `groq_api_key`, `app_url`, `sentry_dsn`, `grupo_mandaditos_global_jid`

### `tenant-reader.js`
Abre conexiones **readonly** a BDs de tenants para métricas/monitoreo. Para escrituras puntuales (config, catálogo, colonias, zonas, plan) abre conexiones temporales r/w y las cierra inmediatamente después.

### Secciones del superadmin (SPA)
- **Dashboard** — cards por tenant: pedidos del día, estado WA, heartbeat, QR
- **Tenants** — CRUD + provisionar + eliminar
- **Geo** — colonias y zonas por tenant
- **Mandaditos** — config, repartidores, historial, reporte desempeño
- **Config global** — Groq API key, APP_URL, Sentry DSN

### Provisionamiento de tenant
```
UI → POST /api/provisionar → proxy a webhook-deploy:4000/provisionar
→ provisionar-tenant.sh:
  1. Crea envs/{TENANT_ID}.env con todas las variables
  2. Registra en data/tenants.json
  3. Genera JSON de configuración PM2
  4. pm2 start {json} && pm2 save
  5. Nginx: sed inserta línea en el map $host → $target_port
→ index.js arranca → initDB() → seedDB()
→ El superadmin lee qr_pendiente de la BD para mostrar QR
```

### Eliminación de tenant
```
POST /api/tenants/:id/eliminar → webhook-deploy:4000/eliminar
→ eliminar-tenant.sh:
  pm2 delete {TENANT_ID} && pm2 save
  rm envs/{TENANT_ID}.env
  rm data/{TENANT_ID}.db + data/backups/{TENANT_ID}_*.db
  rm -rf .wwebjs_auth/session-{TENANT_ID}/
  Limpia entrada de data/tenants.json
  Nginx: sed elimina línea del map
```

---

## 15. Feature Flags y Planes (`src/features/index.js`)

```javascript
const PLANES = {
  basico: new Set(['pedidos', 'clientes', 'productos', 'horarios', 'config_basica',
                   'solicitudes_producto', 'stats_basicas']),
  plus:  new Set([...basico, 'pagos_mp', 'geo_zonas', 'reportes_avanzados', 'multi_formatos']),
  pro:   new Set([...plus, 'reparto', 'asistente_ia', 'multi_sesion']),
}
```

`getPlanActivo()` lee `configuracion.plan_activo` de la BD del tenant. `planIncluye(plan, feature)` verifica acceso. Los gates se aplican en la API del panel con banners de upgrade en el frontend. Cambiar el plan activo desbloquea features de inmediato, sin re-provisionar.

---

## 16. Comandos Administrativos (`src/handlers/comandos.js`)

Se reciben desde: grupo WA (`@g.us`), número personal (modo `privado`), o autochat (modo `autochat`).

### Comandos de consulta
| Comando | Descripción |
|---|---|
| `!pedidos` | Todos los pedidos del día |
| `!pendientes / !confirmados / !cancelados / !rechazados` | Filtrar por estado |
| `!domicilios / !mostradores` | Filtrar por tipo |
| `!pedido [tel]` | Detalle completo de un pedido |
| `!sesiones` | Ver sesiones activas (Maps) |
| `!estado` | Uptime, sesiones, estado del bot |
| `!stats` | Resumen del día |
| `!reporte ayer / semana` | Reporte histórico |
| `!precios` | Menú con precios actuales |
| `!jid` | Mostrar el JID del grupo actual |
| `!ayuda` | Lista de todos los comandos |

### Comandos de acción
| Comando | Descripción |
|---|---|
| `!confirmar [tel]` | Confirmar pedido; si es domicilio → `despacharConDelay` |
| `!listo [tel]` | Avisar al cliente que su pedido está listo |
| `!cancelar [tel]` | Cancelar con aviso al cliente |
| `!rechazar [tel]` | Rechazar pedido |
| `!precio [corte] [taco_precio] [torta_precio]` | Actualizar precio |
| `!agotado [corte]` / `!disponible [corte]` | Cambiar disponibilidad |
| `!cerrar` / `!abrir` | Cerrar/abrir el negocio hoy |
| `!pausar` / `!reanudar` | Pausar/activar el bot para todos |
| `!resetear [tel]` | Limpiar sesión de un cliente específico |
| `!limpiar` | Eliminar TODAS las sesiones activas |
| `!editar [tel] [campo] [valor]` | Editar dato de cliente |
| `!mensaje [tel] [texto]` | Mensaje directo al cliente |
| `!buscar [nombre]` | Buscar cliente por nombre |
| `!historial [tel]` | Historial de pedidos del cliente |
| `!top` | Top 10 clientes por pedidos |
| `!cliente [tel]` | Datos del cliente |

---

## 17. Variables de Entorno

### `.env` del root (superadmin y webhook)
```bash
SUPERADMIN_PORT=3001
SUPERADMIN_SECRET=...             # ≥ 32 chars, OBLIGATORIO en producción
SUPERADMIN_INITIAL_USER=rajem     # solo al crear admin.db por primera vez
SUPERADMIN_INITIAL_PASSWORD=...   # OBLIGATORIO en producción
WEBHOOK_PORT=4000
WEBHOOK_SECRET=...                # firma HMAC para GitHub webhooks
WEBHOOK_HOST=localhost            # 'localhost' en bare-metal
DOMINIO=batiast.com               # usado por provisionar-tenant.sh para APP_URL
COOKIE_SECURE=1                   # marcar cookies como Secure (detrás de HTTPS)
SENTRY_DSN=                       # opcional
```

### Variables inyectadas por PM2 para cada tenant
```bash
TENANT_ID=carnitas-bot
NOMBRE_NEGOCIO="Tacos Javier"
GRUPO_ID=521XXXXXXXXXX@g.us
PANEL_PORT=3002
PANEL_SECRET=...                  # ≥ 32 chars, auto-generado al provisionar
PANEL_INITIAL_PASSWORD=...        # auto-generado al provisionar
GROQ_API_KEY=gsk_...              # opcional (puede configurarse desde superadmin)
BUSINESS_TYPE=taqueria
SECCION_TAQUERIA_INICIAL=ambas    # ambas | carnitas | asada
PLAN_ACTIVO=basico                # basico | plus | pro
APP_URL=https://carnitas-bot.batiast.com
NODE_ENV=production
COOKIE_SECURE=1
SENTRY_DSN=                       # opcional
GROQ_TIMEOUT_MS=15000             # opcional, default 15000ms
BOT_TEST_MODE=                    # solo tests: "1" activa todos los item_types
```

---

## 18. Infraestructura VPS

### Nginx — proxy por subdominio
```nginx
map $host $target_port {
  admin.batiast.com           3001;
  carnitas-bot.batiast.com    3002;
  tacos-pepe-gdl.batiast.com  3003;
  default                     0;
}

server {
  listen 443 ssl;
  server_name *.batiast.com;
  # SSL wildcard: *.batiast.com via Let's Encrypt DNS challenge
  
  location / {
    if ($target_port = 0) { return 404; }
    proxy_pass http://127.0.0.1:$target_port;
  }
}
```

`provisionar-tenant.sh` inserta la línea `subdominio.DOMINIO PANEL_PORT;` con `sed` al crear un tenant.

### Deploy continuo
```
Push a main → GitHub POST /deploy con HMAC → webhook-deploy.js verifica firma
→ git pull
→ npm install (solo si package.json cambió)
→ pm2 restart all (excluye webhook-deploy)
→ pm2 restart webhook-deploy con delay 3s
```

### Scripts clave
| Script | Uso |
|---|---|
| `scripts/install.sh DOMINIO` | Setup completo VPS: npm, .env, Nginx, SSL, PM2 |
| `scripts/provisionar-tenant.sh` | Aprovisiona tenant (via webhook-deploy) |
| `scripts/eliminar-tenant.sh` | Elimina tenant completo |
| `scripts/backup-db.js` | Copia BD a `data/backups/` (también `npm run backup`) |
| `scripts/reset-password.js` | Resetea contraseña del panel sin la actual |
| `scripts/check-nuevos-tipos.js` | Pruebas NLU manuales (`node`, NO `npm test`) |
| `scripts/webhook-deploy.js` | Servidor HTTP puerto 4000 |

---

## 19. Tests (`tests/`)

Runner: **Node.js nativo** (`node:test`). Sin mocks de BD; usa `better-sqlite3` real.

### Ejecutar tests
```bash
# Un archivo específico:
BOT_TEST_MODE=1 node --require ./tests/setup.js --test tests/flujos-completos.test.js

# Todos los tests:
npm test    # (o npm.cmd test en PowerShell con política restrictiva)
```

**NUNCA** usar `npm test` para scripts NLU manuales. Usar `node scripts/check-nuevos-tipos.js` directamente.

### Setup del entorno de test (`tests/setup.js`)
- Crea BD SQLite en archivo temporal
- Ejecuta `seedDB()` con `BOT_TEST_MODE=1`
- Activa todos los item_types
- Puebla `menu_items` con precios base del giro
- `limpiarTodo(jid)` entre tests para aislar estado

### Inventario de archivos de test

| Archivo | Suites | Tests | Qué cubre |
|---|---|---|---|
| `tests/flujos-completos.test.js` | 15 | 59 | Los 4 escenarios completos |
| `tests/geo.test.js` | — | — | Búsqueda de colonias, fuzzy, aliases |
| `tests/nlu.test.js` | — | — | Parser NLU taquería |
| `tests/pedidoParser.test.js` | — | — | parsearPedidoSimple y variantes |
| `tests/precio.test.js` | — | — | Cálculo de precios y subtotales |

### Escenarios cubiertos en `flujos-completos.test.js`
1. Mostrador en horario — flujo completo
2. Domicilio en horario — con transferencia bancaria
3. Domicilio en horario — con MercadoPago
4. Preventa mostrador — flujo completo
5. Preventa domicilio — flujo completo
6. Cliente recurrente — datos pre-llenados + confirmación
7. Cancelación dentro de ventana de tiempo
8. Cancelación fuera de ventana (bloqueada)
9. Cancelación explícita con link MP activo
10. Link MP expirado — cliente escribe después
11. FAQs globales fuera de flujo
12. FAQs durante estados críticos
13. Cambio de tipo desde resumen (mostrador ↔ domicilio)
14. Colonia ambigua — desambiguación numerada
15. `"no, ya es todo"` y `"no, eso es todo"` terminan el pedido

---

## 20. Invariantes de Diseño (No Romper)

1. **`guardarDB()` es no-op.** `better-sqlite3` persiste en cada escritura. No esperar flush explícito.

2. **BD se guarda ANTES de notificar al cliente.** `registrarPedido()` ocurre antes de `sendMessage`. Si falla, el cliente recibe error, no confirmación falsa.

3. **`tipoEntregaCliente` y `datosCampos.tipoEntrega` deben estar sincronizados.** Si se actualiza uno, actualizar el otro inmediatamente.

4. **`PALABRAS_NO_NOMBRE` no aplica a detección de colonias.** "Centro", "Norte", "Reforma" son colonias válidas. Solo usar ese filtro para nombres de personas; para colonias usar solo filtro de métodos de pago.

5. **`_menuYaMostrado` no se marca durante la aceptación de preventa.** Solo se marca cuando realmente se envía `MENU_FORMATO()` (en `handleTipoEntrega`).

6. **JIDs `@lid` se resuelven en `index.js`, nunca en handlers.** Todos los handlers siempre reciben `@c.us`.

7. **`extraerTelefono()` valida LADA mexicano.** Primer dígito 2-9. No aceptar 0 ni 1.

8. **La tabla `productos` es legacy.** El catálogo operativo real está en `menu_items`. No usar `productos` en código nuevo.

9. **El Superadmin habilita; el tenant ajusta dentro de lo habilitado.** El tenant nunca puede habilitar/deshabilitar formatos o categorías.

10. **`esAgregarNo` acepta frases compuestas.** `"no, ya es todo"` y `"no, eso es todo"` deben reconocerse como respuesta negativa en `handleAgregarMas`.

11. **El NLU local tiene prioridad; Groq es último recurso.** No usar Groq para obtener nombres de cortes o productos; la fuente del catálogo es siempre la BD.

12. **Serialización por JID:** los mensajes del mismo JID se procesan en secuencia. Nunca asumir que dos mensajes del mismo cliente se procesan en paralelo.

13. **`eliminarPagoPendiente` al cancelar explícitamente con MP.** No dejar registros huérfanos en `pagos_pendientes`.

14. **Los despachos de preventa sobreviven reinicios.** `despachos_programados WHERE ejecutado=0` se reanuda en `on("ready")`.

---

## 21. Pendientes del Sistema

| Tema | Fase | Estado |
|---|---|---|
| Aliases de colonias ampliados (reducir fallos de matching) | 8 | Pendiente |
| Tarifas de reparto por distancia (tarifa fija por zona, NO dinámica) | 9 | Pendiente |
| Validación funcional del giro hamburguesería | 5 | Pendiente |
| Hamburguesería en producción | — | Esperando validación |

---

## 22. Guía de Diagnóstico Rápido

### El bot no procesa mensajes después de un deploy
```bash
pm2 status                              # verificar que está 'online', no 'errored'
pm2 logs carnitas-bot --lines 50        # ver errores de arranque
pm2 describe carnitas-bot | grep path   # confirmar que usa el codebase correcto
```

### Panel muestra "Catálogo vacío"
→ La tabla `menu_items` está vacía (instalación nueva o Superadmin aún no habilitó productos)
→ El Superadmin debe ir a Config Tenant → habilitar formatos y productos
→ **No** buscar en `productos` legacy

### "No, ya es todo" no termina el pedido
→ Verificar que `esAgregarNo` en `orden.js` incluye la variante compuesta
→ Debe coincidir: `no\s*,\s*(ya\s+es\s+todo|eso\s+es\s+todo)`

### Colonia no detectada ("Centro", "Norte", "Reforma")
→ Verificar que `interpretarCampos` en `campos.js` usa filtro de métodos de pago, no `PALABRAS_NO_NOMBRE`
→ Las colonias deben estar en la tabla `colonias` del tenant

### Alerta "pedido sin confirmar" para pedido con MP
→ La query de alertas debe tener el `NOT EXISTS (pagos_pendientes...)` subquery
→ Ver sección 10 de este documento

### Repartidor responde pero no recibe datos
1. Verificar `grupo_mandaditos_id` configurado en BD
2. Confirmar despacho en `despachosPendientes` Map (o `despachos_programados WHERE ejecutado=1`)
3. Revisar log: "Repartidor tomó pedido" o "No se encontró despacho citado"
4. El fallback por número de pedido debe funcionar: `Pedido #N — Solicitud de reparto`

### Link de MP no funciona
1. Verificar `APP_URL` con prioridad correcta (tenant > env > admin global)
2. Verificar `pasarela_activa = 'mercadopago'` en BD
3. Verificar `pasarela_config` con access_token válido (usar PANEL_SECRET para desencriptar)
4. `source envs/{TENANT_ID}.env && node -e "require('./src/pagos').estaConfigurado() && console.log('OK')"`

---

*Fin del documento. Última actualización: 2026-08-17.*
