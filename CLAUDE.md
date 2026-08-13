# Bot de Tacos Javier — Guía para Claude

## Arrancar el proyecto
```
npm start              # producción (Node directo)
npm run dev            # desarrollo — nodemon reinicia al guardar (15-30s para reconectar WA)
npm run pm2:start      # producción con PM2 (recomendado en servidor)
npm test               # 4 archivos de tests con el runner nativo de Node
```
Panel web en `http://localhost:3000` (usuario: `admin`, contraseña: `admin123`)

## Descripción general
Bot de WhatsApp para taquería. Flujo: cliente escribe → parser NLU local → fallback Groq (llama-3.3-70b-versatile) → respuesta. Usa `whatsapp-web.js` + **`better-sqlite3`** (SQLite nativo, persistencia automática a disco).

---

## Mapa de archivos clave

### Entrada
- `index.js` — arranque, cliente WA, deduplicación de mensajes (Set de 200 IDs), **resolución de LIDs** (si `msg.from` termina en `@lid`, llama a `client.getContactLidAndPhone()` y reemplaza `msg.from` con el JID real antes de enrutar), router principal. Incluye: init Sentry, reconnección con backoff, backup automático cada 6h, handlers globales de error.

### Infraestructura
- `src/logger.js` — Winston logger. Salida coloreada en consola, `logs/bot-err.log` (solo errores) y `logs/bot-combined.log`. Se crea el directorio `logs/` automáticamente si no existe.
- `ecosystem.config.js` — Configuración PM2 para producción. `autorestart: true`, `restart_delay: 15000`, `max_restarts: 10`, logs en `logs/`.

### Handlers
- `src/handlers/mensajes.js` — router delgado (~178 líneas): encadena todos los sub-handlers en orden de prioridad. Usa `detectarTodasPreguntasFrecuentes()` para el bloque global de FAQs (multi-intent).
- `src/handlers/pedidoParser.js` — NLU local de pedidos: detecta cortes, cantidades, modificaciones, preguntas FAQ. Cachés: `_cortesCache` + `_cortesRegexCache` (TTL 60s, invalidables con `invalidarCacheCortes()`). Exporta `detectarPreguntaFrecuente` (primera coincidencia) y `detectarTodasPreguntasFrecuentes` (multi-intent, array). Intents: `precio`, `horario`, `domicilio`, `menu`, `ubicacion`, `metodos_pago`, `descripcion_corte`, `pedido_listo`, `ya_en_camino`, `despedida`, `total_parcial`. Funciones clave del NLU multi-giro: `_buildItemTypesPattern()` (regex dinámica de todos los item types activos), `_getItemTypesActivos()` (cache TTL 60s desde BD), `detectarTipoItemDesdeTexto(texto)` (retorna objeto item_type o null), `listaItemTypes(soloUnidad?)` (lista legible; `soloUnidad=true` excluye gramos/pesos), `parsearItem(fragmento)` (parsea un fragmento con tipo+cantidad+corte).
- `src/handlers/respuestas.js` — respuestas FAQ sin Groq. `aplicarQuitarUno(ordenTexto, corte?)` acepta corte opcional para reducir ítem específico.
- `src/handlers/comandos.js` — comandos de grupo: ver pedidos (!pedidos, !pendientes, !confirmados, !cancelados, !rechazados, !domicilios, !mostradores, !pedido), gestionar (!confirmar, !listo, !cancelar, !rechazar), clientes (!cliente, !buscar, !historial, !top, !editar, !mensaje), reportes (!stats, !reporte ayer/semana/mes), menú (!precios, !precio, !agotado, !disponible), control (!cerrar, !abrir, !pausar, !reanudar, !sesiones, !resetear, !limpiar, !estado, !ayuda)
- `src/handlers/imagenes.js` — recibe comprobantes de transferencia vía imagen

#### Flujos (`src/handlers/flujos/`)
- `formulario.js` — primer mensaje, tipo de entrega, formulario progresivo, cambio de tipo durante formulario. Captura datos del primer mensaje con `interpretarCampos`. Usa `extraerTelefonoDeJID` para pre-llenar teléfono.
- `orden.js` — toma de pedido: estados críticos bloqueantes, corte, tipo ítem, confirmación, agregar más, parser local, Groq fallback (con retry y timeout 15s)
- `edicion.js` — edición de campos durante el formulario y resumen
- `resumen.js` — resumen final, confirmación de pedido, cambios desde resumen, catch-all resumen. La BD se guarda **antes** de confirmar al cliente; si falla, el cliente recibe error en lugar de confirmación falsa. Si MercadoPago está configurado, genera link de pago; si no, usa flujo banco + foto.
- `cancelacion.js` — flujo de cancelación en todas sus etapas
- `utils.js` — helpers compartidos: `replyConTyping` (incluye **rate limiting 2s/JID**), `enFlujoActivo`, `parsearSinCorteItems`, `palabrasConfirmacion`. Contiene también `telefonosReales`, `ultimoPedido`, `ultimaActividad`, `recordatorioEnviado`. Timeout en **dos fases**: **20 min** → recordatorio contextual + jitter 1-3s, **35 min** → limpiar sesión.

### Estado (Maps en memoria)
- `src/estado/maps.js` — **todos los Maps**: `clientesNuevos`, `pendientesConfirmacion`, `tipoEntregaCliente`, `esperandoTipoItem`, `datosCampos`, `pedidoJSONActual`, etc.
- `src/estado/bot-pausado.js` — singleton `{ pausado: false }`. Chequeado al inicio de `handleMensaje`; si es `true`, el bot no procesa ningún mensaje de cliente. Los comandos `!pausar` y `!reanudar` del grupo lo modifican.
- `src/estado/campos.js` — interpretación de campos del formulario progresivo, `limpiarTodo()`, `interpretarCampos()`, `siguienteCampoFaltante()`. También contiene `extraerTelefono()` (regex unificada con validación LADA `^[2-9]`) y `extraerTelefonoDeJID()` (extrae teléfono de JID @c.us; devuelve `null` para `@lid` — la resolución real ocurre en `index.js`). `PALABRAS_NO_NOMBRE` incluye palabras geográficas.
- `src/estado/sesiones.js` — serialización/restauración de sesiones a BD. TTL: 48h. Todos los Maps críticos incluyendo `pendientesConfirmacion` se serializan.
- `src/estado/index.js` — re-exporta todo el estado incluyendo `extraerTelefono` y `extraerTelefonoDeJID`

### Giros (módulos de negocio)
- `src/giros/taqueria.js` — **fuente de verdad del giro taquería**. Define:
  - `itemTypes[]` — formatos de venta: taco, torta, quesadilla, vampiro, burrito, gramos (100gr.), por_pesos. Cada uno con `slug`, `nombre`, `nombre_plural`, `aliases`, `soporta_gramos`, `soporta_pesos`, `precio_campo`.
  - `cortes[]` — 16 cortes con `slug`, `nombre`, `aliases`, `seccion` (asada|carnitas), `subclase`, `precio_base`.
  - `configDefaults`, `vocabulario`, `mensajesDefaults`, `comportamiento`.
  - Consumido por `seed.js` al provisionar y sincronizado a BD en cada arranque.
- `src/giros/index.js` — `getGiroActivo()` devuelve el módulo del giro configurado en BD.

### Base de datos (better-sqlite3)
- `src/db/core.js` — **mejor-sqlite3** nativo. `initDB()` abre el archivo SQLite en `data/tacos_javier.db`. `guardarDB()` es no-op (better-sqlite3 persiste automáticamente). `queryAll()`, `queryOne()`, `run()` usan `prepare().all/get/run`. Shim de compatibilidad en `getDB()` para código legacy que usa la API sql.js (`run()/exec()`). `journal_mode = DELETE` (sin archivos WAL, simplifica backups).
- `src/db/seed.js` — crea tablas y datos iniciales. Migraciones inline con `ALTER TABLE ... ADD COLUMN`. `_seedBusinessTypes()` sincroniza `item_types` desde el módulo giro en cada arranque. `BOT_TEST_MODE=1` activa todos los item_types y seedea productos de prueba.
- `src/db/cortes.js` — catálogo de cortes/ingredientes del giro. `getCortesBD()` devuelve mapa `{alias→slug}` para NLU (TTL 60s). `getCortesBDObj()` devuelve objetos completos. `getPrecioCorteFormato(corteSlug, formatoSlug)` con fallback a `precio_base` y luego a config global. Invalida con `invalidarCacheCortesBD()`.
- `src/db/modelos.js` — CRUD de productos, clientes, pedidos. `actualizarEstadoPedido()` busca por teléfono, `actualizarEstadoPorId()` busca por ID (usa el webhook de MP). Funciones adicionales: `setProductoActivo`, `updateProductoPrecio`, `getTopClientes`, `getPedidosPorCliente`, `actualizarEstadoConfirmado`, `getPedidosPorFecha`.
- `src/db/config.js` — configuración, horarios, banco, mensajes_bot, `guardarTelefonoReal()`, `getJIDReal()`, `guardarJIDReal()`
- `src/db/index.js` — re-exporta todo el módulo db

### Pagos
- `src/pagos/mercadopago.js` — wrapper SDK v3. `estaConfigurado()` verifica `MERCADOPAGO_ACCESS_TOKEN` + `APP_URL`. `crearEnlacePago()` crea una Preference con expiración de 30 min y guarda contexto en `_pendientes` (Map en memoria). `procesarPago(paymentId)` verifica el estado en la API de MP y devuelve contexto. **Si el servidor reinicia durante el pago, el link ya existe en MP pero no se auto-notifica vía WA** — el admin puede confirmar manualmente desde el panel.

### Panel
- `src/panel/server.js` — Express, autenticación con sesión, rate limiting login (5/min/IP), API REST, auto-notifica cliente vía WA al cambiar estado de pedido. Endpoints públicos: `GET /health`, `POST /webhook/mercadopago`.
- `src/panel/whatsapp-bridge.js` — singleton para compartir el cliente WA sin deps circulares
- `src/panel/public/index.html` — SPA del panel (~870 líneas). Secciones: dashboard (stats + histórico), pedidos (filtros + CSV), clientes, productos, horarios, banco, mensajes bot, config, **wizard de onboarding** (5 pasos: negocio → horarios → banco → menú → contraseña). Auto-refresh cada 20s. El wizard se abre automáticamente al primer login si `nombre_negocio` es el valor por defecto y `localStorage.setup_done` no está fijado.

### Scripts
- `scripts/onboarding.js` — asistente CLI interactivo (alternativa al wizard web). 5 pasos en terminal.
- `scripts/backup-db.js` — copia `data/tacos_javier.db` a `data/backups/tacos_javier_YYYY-MM-DD_HH-mm-ss.db`. Se ejecuta automáticamente cada 6h desde `index.js` via `child_process.fork()`. También disponible como `npm run backup`.
- `scripts/reset-password.js` — resetea la contraseña del panel sin necesitar la actual.
- `scripts/nuevo-tenant.js` — provisiona una nueva instancia del bot (SaaS).
- `scripts/check-nuevos-tipos.js` — suite de 27 casos de prueba para NLU multi-tipo (quesadillas, burritos, vampiros, gramos, pesos, multi-ítem, herencia `ultimoTipo`). Usar con `BOT_TEST_MODE=1`. **No usar `npm test`** — correr directo: `node scripts/check-nuevos-tipos.js`.

### Otros
- `src/prompts/base.js` — prompt de sistema para Groq
- `src/horario.js` — lógica de horario de atención
- `src/config.js` — helpers de configuración del negocio
- `src/pedido/precios.js` — cálculo de precios desde BD

---

## Convenciones
- **Idioma**: código, variables, comentarios y mensajes al cliente en **español**
- **Sin mocks de BD**: usar better-sqlite3 real en cualquier prueba (no `jest.mock`)
- **Teléfonos**: siempre 10 dígitos locales. JID de WA (`5213XXXXXXXXXX@c.us`) → `slice(-10)` para extraer el número
- **Commits**: en español, descriptivos

## Variables de entorno (`.env`)
```
GROQ_API_KEY=gsk_...          # Requerida
GRUPO_ID=521XXXXXXXXXX@g.us   # Requerida — JID del grupo de administración
PANEL_PORT=3000                # Opcional, default 3000
PANEL_SECRET=...               # Recomendado en producción (sin esto, el panel usa un secreto inseguro)
TENANT_ID=carnitas-bot         # Identificador de instancia (sesión WA)
SENTRY_DSN=                    # Opcional — activa Sentry si se define
MERCADOPAGO_ACCESS_TOKEN=      # Opcional — activa pagos con link
APP_URL=https://mi-servidor.com # Necesario si MP está activo (webhook)
GROQ_TIMEOUT_MS=15000          # Opcional — timeout para llamadas a Groq (default 15000ms)
WEBHOOK_PORT=4000              # Puerto del servidor de deploy automático (default 4000)
WEBHOOK_SECRET=...             # Secreto compartido con GitHub para verificar firma HMAC
BOT_TEST_MODE=1                # Solo scripts — activa todos los item_types y seedea productos de prueba
```

## Configuración desde BD (tabla `configuracion`)
Claves editables desde el panel web (sección Configuración):
| Clave | Default | Descripción |
|---|---|---|
| `nombre_negocio` | Tacos Javier | Nombre del negocio |
| `tipo_negocio` | carnitas de puerco | Tipo de negocio (usado en Groq) |
| `precio_taco` | 30 | Precio global por taco |
| `precio_torta` | 40 | Precio global por torta |
| `precio_100g` | 32 | Precio global por 100g |
| `precio_salsa` | 15 | Precio de salsa extra |
| `domicilio_costo` | 50 | Costo fijo de domicilio |
| `metodos_mostrador` | efectivo, tarjeta o transferencia | Métodos en mostrador |
| `metodos_domicilio` | efectivo o transferencia | Métodos a domicilio |
| `tiempo_cancelacion` | 15 | Minutos para cancelar tras confirmar |
| `timeout_recordatorio_min` | 20 | Minutos de inactividad antes del recordatorio |
| `timeout_sesion_min` | 35 | Minutos de inactividad antes de limpiar sesión |

## Reconnección automática (`index.js`)
Cuando WhatsApp se desconecta, el bot reintenta con **backoff exponencial**:
- Delay inicial: 5s → 10s → 20s → ... → máx 5 min
- Máximo 8 reintentos (`_MAX_REINTENTOS`). Si se supera, el proceso queda en espera hasta que PM2 lo reinicie.
- `_reintentos` se resetea en el evento `ready`.
- **`client.destroy()` antes de `client.initialize()`**: libera el proceso de Chromium y los archivos del perfil bloqueados antes de reiniciar. Si `destroy()` falla (EBUSY), se loguea como warning y se continúa. Sin este paso, el reintento lanzaba "browser is already running".

## Backup automático
`_runBackup()` en `index.js` ejecuta `scripts/backup-db.js` via `fork()`:
- Primera ejecución al iniciar el bot
- Luego cada 6 horas
- Los archivos se guardan en `data/backups/` con timestamp

## Rate limiting de mensajes WA
`replyConTyping()` en `utils.js` garantiza **mínimo 2s entre mensajes al mismo JID**. Si el intervalo no se ha cumplido, espera el tiempo restante antes de enviar. Reduce riesgo de ban por spam.

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
2. `handleEsperandoCorte` — estado activo
3. `handleConfirmacionItem` — estado activo
4. `handleAgregarMas` — estado activo
5. `handlePedidoSimple` — parser local genérico
6. `handleSinCorte` / `handleSinTipo` — detección parcial
7. `handleGroqFallback` — último recurso

**FAQs durante estados críticos:** se responden y luego se repite la pregunta del estado activo. No interrumpen el flujo.

## Comando `!limpiar`
Elimina todas las sesiones activas de clientes con confirmación de dos pasos:
- `!limpiar` — muestra cuántas sesiones hay y pide confirmación
- `!limpiar confirmar` — limpia todos los Maps y sesiones activas
- Si no hay sesiones activas, responde que no hay nada que limpiar

---

## Bugs conocidos / pendientes
- (ninguno conocido actualmente)

## Notas NLU relevantes (pedidoParser.js)
- `"y aparte"` **no** fuerza Groq — se limpia en `preprocesarCantidades()` como conector de bebida.
- `textoANumero()` maneja compuestos: "treinta y dos" → "32", "veinte y uno" → "21".
- `detectarTodasPreguntasFrecuentes(texto)` devuelve array — usar solo en `mensajes.js` para el bloque global (fuera de flujo activo). En handlers de estado usar `detectarPreguntaFrecuente`.
- `detectarModificacion()` extrae `corte` en `quitar_uno` cuando el cliente lo especifica. `aplicarQuitarUno` lo recibe como segundo parámetro opcional.
- `PATRON_CAMBIAR_CORTE` cubre: "cambia X por Y", "sin X y pon Y", "en lugar de X ponme Y", "en vez de X dame Y", "mejor Y que X".
- `PATRON_AGREGAR_MAS` cubre: "agrega N más", "N más", "ponme otros N", "súmame N", "añade N", "también quiero N".
- Nuevo intent `pedido_listo` — evaluado ANTES que `horario` para que "¿ya están listos?" no responda con el horario de apertura.
- En `handleEsperandoCorte`: "de todos"/"de todo"/"cualquiera" → "surtido" antes de llegar al error path.
- En `handleFAQDurantePedido`: cuando el tipo es "precio" y hay pedido acumulado, añade el subtotal actual a la respuesta.
- **NLU multi-tipo (quesadillas, vampiros, burritos):** `_buildItemTypesPattern()` construye regex dinámica desde BD. `parsearPedidoSimple()` usa esta regex tanto en el path multi-ítem como en el single-ítem. El path multi-ítem extiende `ultimoTipo` a todos los item types de unidad (`!soporta_gramos && !soporta_pesos`), no solo taco/torta.
- **`extraerCorte` y fuzzy:** `buscarCorteFuzzy(palabra)` usa Levenshtein ≤ 2. **Importante**: antes del fuzzy se hace `if (detectarTipoItemDesdeTexto(palabra)) continue` para evitar que nombres de item types (ej. "burritos") coincidan por distancia con aliases de cortes (ej. "burritos" → "cueritos" → corte "cuero", distancia=2). Sin esta guardia, `detectarSinCorte("3 burritos")` retornaría null.
- `listaItemTypes(soloUnidad = false)` — con `soloUnidad=true` filtra para excluir gramos/pesos. Usar en mensajes al cliente cuando no aplica venta por peso (ej. `handleEsperandoTipoItem`, `_textoRecordatorio`).

## Notas de implementación importantes
- `extraerTelefono(texto)` — usar siempre esta función para extraer teléfonos de texto libre. Valida LADA mexicano (primer dígito 2-9), detecta +52 prefijo y separadores (331-234-5678, 331 234 5678).
- `extraerTelefonoDeJID(jid)` — usar siempre esta función para extraer teléfono de un JID de WhatsApp. Devuelve `null` para JIDs en formato `@lid` (identificadores de dispositivo, no son teléfonos reales). Para `@c.us` y `@lid:` maneja el separador ":" correctamente.
- **Resolución de LIDs en `index.js`:** WhatsApp envía `msg.from` en formato `3310000001:12@lid` en ciertos dispositivos. El handler de `"message"` detecta el sufijo `@lid` y llama a `client.getContactLidAndPhone([msg.from])` para obtener el JID real (`pn` field). El `msg.from` se reemplaza antes de enrutar, así todos los handlers downstream siempre trabajan con JIDs de teléfono real.
- En `handleConfirmacionFinal` (resumen.js): la BD se guarda **antes** de notificar al grupo y confirmar al cliente. Si falla, retorna sin confirmar.
- El timeout de sesiones tiene **dos fases**: **20 min** → `_textoRecordatorio()` envía mensaje contextual según estado del cliente (con jitter 1-3s), **35 min** → `limpiarTodo()`. `recordatorioEnviado` se borra en `mensajes.js` cuando el cliente responde.
- Nombre compuesto en BD: 1 palabra→solo nombre, 2→nombre+apellido, 3+→primeras dos palabras como nombre, resto como apellido.
- **`guardarDB()`** es no-op desde la migración a better-sqlite3 — better-sqlite3 persiste cada escritura automáticamente. El shim existe para no romper llamadas legacy.

## Hoja de ruta — Arquitectura multi-giro/multi-tenant

| Fase | Qué se construye                                                                                                                                                              | Impacto                       | Estado                  |
|:----:|-------------------------------------------------------------------------------------------------------------------------------------------------------------------------------|-------------------------------|-------------------------|
|  1   | Separar ecosistema taquería — `src/nlu/core.js`, `src/giros/taqueria/index.js`, `src/giros/taqueria/nlu.js`, `pedidoParser.js` como router delegante                         | Habilita multi-giro           | ✅ Commit `50a7414`     |
|  2   | Extraer `nlu/core.js` con utilidades genéricas puras (completado junto con Fase 1)                                                                                            | Reutilizable por todos giros  | ✅ Incluido en Fase 1   |
|  3   | Formalizar `geo/` como servicio de plataforma — solicitudes geo (tenant→superadmin), seed ciudad-agnóstico, aliases en `buscarColonia()`, 31 tests unitarios                 | Multi-ciudad                  | ✅ Fase 3 completa      |
|  4   | Feature flags por plan — `src/features/index.js` (PLANES: basico/plus/pro), `plan_activo` en BD tenant, `requireFeature()` en API del panel, gates UI con badge + banners de upgrade, endpoints superadmin `GET/PUT /api/tenants/:id/plan` | Modelo de negocio real | ✅ Fase 4 completa |
|  5   | Implementar hamburguesería como segundo giro activo (NLU stubs ya existen en `src/giros/hamburgueseria/nlu.js`)                                                               | Valida la abstracción         | Pendiente               |
|  6   | Drivers Stripe (`src/pagos/stripe.js`) y Conekta (`src/pagos/conekta.js`); webhooks `/webhook/stripe` y `/webhook/conekta`; superadmin UI de credenciales; `_notificarPagoConfirmado()` helper compartido | Plan Plus completo | ✅ Fase 6 completa |
|  7   | `reparto/` + `asistente-ia/`                                                                                                                                                  | Plan Pro                      | Pendiente               |

## Repo
GitHub privado: `djchuvaca/Tacos-Javier-Bot` — rama `main`
