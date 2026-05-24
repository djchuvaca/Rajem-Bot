# Bot de Tacos Javier — Guía para Claude

## Arrancar el proyecto
```
npm start          # producción
npm run dev        # desarrollo — nodemon reinicia al guardar (15-30s para reconectar WA)
```
Panel web en `http://localhost:3000` (usuario: `admin`, contraseña: `admin123`)

## Descripción general
Bot de WhatsApp para taquería. Flujo: cliente escribe → parser NLU local → fallback Groq (llama-3.3-70b-versatile) → respuesta. Usa `whatsapp-web.js` + `sql.js` (SQLite en memoria, persiste a disco).

---

## Mapa de archivos clave

### Entrada
- `index.js` — arranque, cliente WA, deduplicación de mensajes (Set de 200 IDs), router principal

### Handlers
- `src/handlers/mensajes.js` — router delgado (~178 líneas): encadena todos los sub-handlers en orden de prioridad. No contiene lógica de negocio.
- `src/handlers/pedidoParser.js` — NLU local de pedidos: detecta cortes, cantidades, modificaciones, preguntas FAQ. Tiene caché `_cortesCache` (TTL 60s, invalidable con `invalidarCacheCortes()`).
- `src/handlers/respuestas.js` — respuestas FAQ sin Groq (precios, horarios, domicilio, banco)
- `src/handlers/comandos.js` — comandos de grupo (`!pedidos`, `!confirmar`, `!rechazar`, `!stats`, `!cliente`, etc.)
- `src/handlers/imagenes.js` — recibe comprobantes de transferencia vía imagen

#### Flujos (`src/handlers/flujos/`)
- `formulario.js` — primer mensaje, tipo de entrega, formulario progresivo, cambio de tipo durante formulario. Captura datos del primer mensaje con `interpretarCampos`. Usa `extraerTelefonoDeJID` para pre-llenar teléfono.
- `orden.js` — toma de pedido: estados críticos bloqueantes, corte, tipo ítem, confirmación, agregar más, parser local, Groq fallback (con retry y timeout 15s)
- `edicion.js` — edición de campos durante el formulario y resumen
- `resumen.js` — resumen final, confirmación de pedido, cambios desde resumen, catch-all resumen. La BD se guarda **antes** de confirmar al cliente; si falla, el cliente recibe error en lugar de confirmación falsa.
- `cancelacion.js` — flujo de cancelación en todas sus etapas
- `utils.js` — helpers compartidos: `replyConTyping`, `enFlujoActivo`, `parsearSinCorteItems`, `palabrasConfirmacion`. Contiene también `telefonosReales`, `ultimoPedido`, `ultimaActividad`, `recordatorioEnviado`. Timeout en **dos fases**: 30 min → recordatorio contextual, 45 min → limpiar sesión.

### Estado (Maps en memoria)
- `src/estado/maps.js` — **todos los Maps**: `clientesNuevos`, `pendientesConfirmacion`, `tipoEntregaCliente`, `esperandoTipoItem`, `datosCampos`, `pedidoJSONActual`, etc.
- `src/estado/campos.js` — interpretación de campos del formulario progresivo, `limpiarTodo()`, `interpretarCampos()`, `siguienteCampoFaltante()`. También contiene `extraerTelefono()` (regex unificada con validación LADA `^[2-9]`) y `extraerTelefonoDeJID()` (extrae teléfono de JID WA manejando @c.us/@lid/:). `PALABRAS_NO_NOMBRE` incluye palabras geográficas.
- `src/estado/sesiones.js` — serialización/restauración de sesiones a BD. TTL: 48h. Todos los Maps críticos incluyendo `pendientesConfirmacion` se serializan.
- `src/estado/index.js` — re-exporta todo el estado incluyendo `extraerTelefono` y `extraerTelefonoDeJID`

### Base de datos (sql.js)
- `src/db/core.js` — `getDB()`, `run()`, `queryOne()`, `queryAll()`. `guardarDB()` está **debounced 500ms**.
- `src/db/seed.js` — crea tablas y datos iniciales. Migraciones inline con `ALTER TABLE ... ADD COLUMN`.
- `src/db/modelos.js` — CRUD de productos, clientes, pedidos. `actualizarEstadoPedido()` busca por teléfono (fragile si el teléfono está mal).
- `src/db/config.js` — configuración, horarios, banco, mensajes_bot, `guardarTelefonoReal()`, `getJIDReal()`, `guardarJIDReal()`
- `src/db/index.js` — re-exporta todo el módulo db

### Panel
- `src/panel/server.js` — Express, autenticación con sesión, rate limiting login (5/min/IP), API REST, auto-notifica cliente vía WA al cambiar estado de pedido
- `src/panel/whatsapp-bridge.js` — singleton para compartir el cliente WA sin deps circulares
- `src/panel/public/index.html` — SPA del panel, auto-refresh cada 20s

### Otros
- `src/prompts/base.js` — prompt de sistema para Groq
- `src/horario.js` — lógica de horario de atención
- `src/config.js` — helpers de configuración del negocio
- `src/pedido/precios.js` — cálculo de precios desde BD

---

## Convenciones
- **Idioma**: código, variables, comentarios y mensajes al cliente en **español**
- **Sin mocks de BD**: usar sql.js real en cualquier prueba
- **Teléfonos**: siempre 10 dígitos locales. JID de WA (`5213XXXXXXXXXX@c.us`) → `slice(-10)` para extraer el número
- **Commits**: en español, descriptivos

## Variables de entorno (`.env`)
```
GROQ_API_KEY=...
GRUPO_ID=...@g.us        # JID del grupo de administración
PANEL_PORT=3000
PANEL_SECRET=...
```

## Estados críticos bloqueantes (orden.js)

Cuando el bot está en uno de estos estados, **bloquea cualquier otro input** y solo acepta la respuesta esperada. Al 2.° error consecutivo agrega ejemplos en el mensaje.

| Estado (Map) | Solo acepta | Ejemplos mostrados al 2.° error |
|---|---|---|
| `esperandoCorte` | corte de carne | *surtido, carne, buche, cuero, lengua* |
| `esperandoTipoItem` | taco o torta | *tacos, tortas* |
| `esperandoConfirmacionItem` | sí/no y variantes, modificaciones, FAQ | *sí, dale, correcto / no, nel* |
| `esperandoAgregarMas` | sí/no y variantes, subtotal, edición, FAQ | *sí / no, ya es todo* |

El contador de errores vive en `_erroresConsec` (Map local en `orden.js`), se resetea al recibir respuesta válida.

**Orden del router en `mensajes.js`** (de mayor a menor prioridad):
1. `handleEsperandoTipoItem` — estado activo
2. `handleEsperandoCorte` — estado activo ← **movido antes de handlePedidoSimple**
3. `handleConfirmacionItem` — estado activo
4. `handleAgregarMas` — estado activo
5. `handlePedidoSimple` — parser local genérico
6. `handleSinCorte` / `handleSinTipo` — detección parcial
7. `handleGroqFallback` — último recurso

**FAQs durante estados críticos:** se responden y luego se repite la pregunta del estado activo. No interrumpen el flujo.

---

## Bugs conocidos / pendientes
- ninguno conocido en este momento

## Notas de implementación importantes
- `extraerTelefono(texto)` — usar siempre esta función para extraer teléfonos de texto libre. Valida LADA mexicano (primer dígito 2-9), detecta +52 prefijo y separadores (331-234-5678, 331 234 5678).
- `extraerTelefonoDeJID(jid)` — usar siempre esta función para extraer teléfono de un JID de WhatsApp. Maneja @c.us, @lid y separador ":".
- En `handleConfirmacionFinal` (resumen.js): la BD se guarda **antes** de notificar al grupo y confirmar al cliente. Si falla, retorna sin confirmar.
- El timeout de sesiones tiene **dos fases**: 30 min → `_textoRecordatorio()` envía mensaje contextual según estado del cliente, 45 min → `limpiarTodo()`. `recordatorioEnviado` se borra en `mensajes.js` cuando el cliente responde.
- Nombre compuesto en BD: 1 palabra→solo nombre, 2→nombre+apellido, 3+→primeras dos palabras como nombre, resto como apellido.

## Repo
GitHub privado: `djchuvaca/Tacos-Javier-Bot` — rama `main`
