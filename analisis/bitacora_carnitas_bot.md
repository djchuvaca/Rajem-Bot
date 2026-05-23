# Bitácora del Proyecto: Bot WhatsApp Tacos Javier
**Versión actual:** carnitas-bot 1.4  
**Fecha:** 22 Mayo 2026 (último commit: 3033601 — 20 May 2026 | cambios sin commit: 22 May 2026)  
**Stack:** Node.js, whatsapp-web.js, Groq (llama-3.3-70b), sql.js (SQLite), Express panel admin

---

## ¿Qué es este proyecto?

Bot de WhatsApp para una taquería (Tacos Javier, Culiacán Sinaloa) que toma pedidos de forma conversacional, maneja clientes frecuentes, genera resúmenes de pedido y notifica al negocio. El objetivo a largo plazo es que el bot sea completamente autónomo sin depender de una IA externa (Groq), y que el sistema sea aplicable a cualquier negocio de comida.

---

## Estructura del proyecto

```
src/
├── handlers/
│   ├── mensajes.js       ← orquestador principal (~1400 líneas)
│   ├── pedidoParser.js   ← parser local con sistema de score
│   ├── respuestas.js     ← respuestas automáticas sin Groq
│   ├── entrega.js        ← detecta tipo de entrega
│   ├── imagenes.js
│   └── comandos.js
├── pedido/
│   ├── resumen.js        ← genera resumen final del pedido
│   └── precios.js        ← cálculo de precios
├── estado/
│   ├── maps.js           ← todos los Maps/Sets en memoria (única fuente)
│   ├── sesiones.js       ← serialización y restauración de estado desde BD
│   ├── campos.js         ← formulario progresivo + detectarEdicion/aplicarEdicion
│   └── index.js          ← re-exporta todo; usar require("../estado")
├── db/
│   ├── core.js           ← motor SQLite (initDB, guardarDB)
│   ├── config.js         ← configuración dinámica, horarios, banco, sesiones, mensajes
│   ├── modelos.js        ← CRUD clientes y pedidos
│   ├── seed.js           ← datos iniciales
│   └── index.js          ← re-exporta todo; usar require("../db")
├── prompts/
│   ├── index.js          ← buildPrompt para Groq
│   ├── base.js
│   ├── pedido.js
│   ├── cortes.js
│   └── platos.js         ← necesitaPlatos() detecta pedidos complejos multi-plato
├── panel/
│   └── server.js         ← panel admin Express (auth, CRUD completo)
├── config.js             ← menú, formularios, banco (lee de BD)
└── horario.js            ← lógica de horario de servicio
```

**Archivos eliminados:** `src/pedido/pedido.js` (código muerto, duplicado de resumen.js), `src/db.js` y `src/estado.js` (reemplazados por carpetas modulares).

---

## Maps en memoria (estado/maps.js + mensajes.js)

Todos los Maps de flujo principal viven en `estado/maps.js` y se serializan/restauran desde BD al reiniciar. Los auxiliares de corto plazo del handler viven en `mensajes.js`.

| Map/Set | Dónde vive | Qué guarda |
|---|---|---|
| `conversaciones` | maps.js | historial de Groq por cliente |
| `resumenPendiente` | maps.js | resumen esperando confirmación (también catch-all al reiniciar) |
| `clientesNuevos` | maps.js | clientes que ya saludaron |
| `datosRecibidos` | maps.js | clientes que completaron formulario |
| `datosAcumulados` | maps.js | texto acumulado del cliente para interpretar campos |
| `datosCampos` | maps.js | nombre, tel, correo, dirección, método, hora, tipoEntrega, referencia |
| `pendientesConfirmacion` | maps.js | datos esperando confirmación del cliente |
| `correoPreguntas` | maps.js | clientes a los que ya se preguntó el correo |
| `referenciaPreguntas` | maps.js | clientes a los que ya se preguntó referencia de dirección |
| `esperandoConfirmacionItem` | maps.js | ítem parseado esperando "¿es correcto?" |
| `esperandoAgregarMas` | maps.js | orden acumulada esperando más ítems |
| `pedidoJSONActual` | maps.js | último JSON de pedido parseado |
| `esperandoCorte` | maps.js | pedido parcial sin corte definido |
| `esperandoEdicion` | maps.js | campo que el bot está esperando editar |
| `esperandoConfirmacionDatos` | maps.js | cliente frecuente confirmando datos precargados |
| `tipoEntregaCliente` | maps.js | domicilio o mostrador |
| `horaEntregaPreventa` | maps.js | hora de entrega para preventas |
| `pedidosConfirmados` | maps.js | pedidos ya enviados al negocio |
| `esperandoMotivoCancelacion` | maps.js | esperando motivo de cancelación |
| `esperandoCaptura` | maps.js | esperando captura de transferencia |
| `clientesPreventa` | maps.js | clientes en flujo de preventa |
| `esperandoTipoItem` | maps.js ← **movido** | ítem con corte pero sin tipo (taco/torta/gramos); ahora serializado en sesiones |
| `ultimoPedido` | mensajes.js | último JSON de pedido (para "lo mismo de siempre"); solo en memoria |
| `ultimaActividad` | mensajes.js | timestamp del último mensaje (para timeout de sesiones zombi) |

---

## Flujo conversacional (mensajes.js)

1. **Primer mensaje** → saludo
2. **Fuera de horario** → ofrecer preventa
3. **Tipo de entrega** → detectar domicilio/mostrador
4. **Cliente frecuente** → cargar datos de BD, confirmar
5. **Formulario progresivo** → pedir datos faltantes uno a uno
6. **Menú** → mostrar al cliente
7. **Toma de pedido** → parser local → si no puede → Groq
8. **Confirmación de ítem** → "¿Es correcto?"
9. **Agregar más** → "¿Deseas agregar algo más?"
10. **Resumen final** → mostrar con "¿Confirmas tu pedido?"
11. **Confirmación** → registrar en BD, notificar grupo WhatsApp

**Guard FAQs:** `enFlujoActivo()` bloquea FAQs cuando el cliente está en un flujo activo. Ahora también incluye `esperandoTipoItem` en el guard.

**Timeout de sesiones zombi:** `setInterval` cada 10 min limpia clientes inactivos > 45 min que siguen en `enFlujoActivo()`. Evita sesiones colgadas indefinidamente.

---

## Sistema de edición desde resumen (implementado en estado/campos.js)

`detectarEdicion()` y `aplicarEdicion()` viven en `estado/campos.js` (no en mensajes.js). Soportan:

- `"cambia mi nombre a Juan Lopez"` → actualiza directo
- `"cambia mi nombre"` → pregunta nombre y apellido
- `"cambia el método a transferencia"` → actualiza directo
- `"cambia el método de pago"` → pregunta (respetando que domicilio no acepta tarjeta)
- `"cambia la hora a 10am"` → valida rango 7:00-12:30, actualiza
- `"quita los tacos"` → quita ítem (si hay ambigüedad, pregunta cuál)
- `"cambia mi teléfono a 3312345678"` → actualiza
- `"cambia la calle por X"` → actualiza solo calle, preserva número y colonia
- `"cambia el número de la dirección por 415"` → acepta también "de mi casa", "de mi dirección"
- `"cambia la colonia por X"` → actualiza solo colonia
- `"cambia mi correo a x@x.com"` → actualiza correo (**nuevo**)
- `"cambia la referencia a X"` → actualiza referencia (**nuevo**)

`esperandoEdicion` se serializa y restaura correctamente en `sesiones.js` al reiniciar el bot.

---

## Parser local (pedidoParser.js)

### Qué puede parsear sin Groq:
- `"3 tacos de carne"` → taco, cantidad, corte
- `"medio kilo de buche"` → gramos, corte
- `"200 de surtido"` → pesos, corte (threshold bajado: >$40 ya es "pesos", antes >$100)
- `"350g de lengua"` → gramos explícitos, corte
- `"3 tacos de carne y medio kilo de buche"` → múltiples ítems (también separa por coma)
- `"3 tacos de carne y también medio kilo de buche"` → **nuevo**: "y también" como separador
- `"4 tacos de carne buche y cuero"` → múltiples cortes en un ítem
- `"tres tacos de surtido"` → **nuevo**: números en palabras → `textoANumero()`
- `"mitad carne mitad buche"` → **nuevo**: `parsearMitadMitad()` ya no va a Groq
- `"medio carne y medio buche"` → **nuevo**: alias de `parsearMitadMitad()`
- `"de todo menos cuero"` → **nuevo**: `parsearTodoMenosCorte()`
- `"buchee"` / `"carnitas"` → **nuevo**: fuzzy matching con Levenshtein (tolerancia a typos)
- Sin corte → pregunta el corte antes de llamar a Groq
- Sin tipo (taco/torta) → **nuevo**: `detectarSinTipo()` pregunta "¿tacos o tortas?"
- Múltiples ítems sin corte → pregunta ítem por ítem

### Sistema de Score:
Cada texto recibe un score. Si score >= 4 → parsear local, si no → Groq.
- Tiene número → +2
- Tiene presentación (taco/torta/gramos/medida) → +2
- Tiene corte (exacto o fuzzy) → +2
- Múltiples ítems bien estructurados → +2
- Señales de complejidad (de 1 en 1, alternados, para mí, etc.) → -10
- ~~Patrón mitad y mitad → -5~~ **eliminado**: ahora se parsea local

### Preprocesamiento adicional:
- `preprocesarCantidades()`: elimina ruido antes del número ("unos 3 tacos" → "3 tacos")
- `textoANumero()`: convierte "tres", "cuatro", etc. a dígitos antes de parsear

### Cortes dinámicos desde BD:
`getCortes()` lee los productos de la BD con **cache de 60 segundos**. Si el dueño agrega un producto nuevo en el panel, el bot lo reconoce al refrescar. Variantes coloquiales se agregan automáticamente. Fuzzy matching vía Levenshtein (distancia ≤ 2) como fallback.

### Qué detecta además de pedidos:
- `detectarPreguntaFrecuente()` → precio, horario, domicilio, menú, ubicación, métodos de pago, **descripcion_corte** (nuevo)
- `detectarModificacion()` → quitar uno, agregar más, cambiar corte (ahora usa `buscarCorteFuzzy` para el nombre del corte)
- `detectarSinCorte()` → ítem sin corte especificado
- `detectarSinTipo()` → **nuevo**: ítem sin tipo (taco/torta/gramos)
- `detectarRepetirPedido()` → **nuevo**: "lo mismo de siempre", "el mismo pedido"
- `necesitaPlatos()` (en prompts/platos.js) → detecta pedidos multi-plato complejos

### FAQ nueva: Descripción de cortes
`{ tipo: "descripcion_corte" }` responde sin Groq a:
- "¿qué es el buche?" / "¿cómo es el cuero?" → descripción del corte
- "¿tienen buche?" / "¿hay lengua?" → confirma y describe
`respuestaDescripcionCorte()` en `respuestas.js` tiene texto para cada corte.

### Lo que aún va a Groq (casos complejos):
- "de 1 en 1", "alternados", "uno de cada"
- ~~"mitad carne mitad buche"~~ ya se parsea local
- Pedidos ambiguos sin estructura clara
- Preguntas abiertas ("¿qué me recomiendas?")
- Correcciones en lenguaje natural libre

---

## Respuestas automáticas (respuestas.js)

Responde sin Groq a preguntas frecuentes. Todo se lee de la BD:
- **Precio** → genera respuesta con precios de taco, torta y por 100g
- **Horario** → agrupa días con mismo horario
- **Domicilio** → costo y zona de cobertura
- **Menú** → genera menú completo
- **Ubicación** → dirección y link de Maps
- **Métodos de pago** → diferencia domicilio vs mostrador
- **Modificaciones** → `aplicarModificacion()` para quitar uno, cambiar corte sin Groq

Integrado en `mensajes.js` con dos bloques antes de Groq: uno de FAQs (con guard `enFlujoActivo`) y uno de modificaciones sobre ítem actual.

---

## resumen.js — Generalizado para cualquier negocio

- `getNombreNegocio()` → lee de BD
- `getNombreProducto()` → configurable (default "carnitas")
- `getDomCosto()` → costo de domicilio desde BD
- `emojiPresentacion()` → emojis según tipo de negocio (taquería, pizzería, etc.)
- Formato de ítems: **"3 tacos de carne"** (sin prefijo redundante "carnitas")

---

## Panel admin (panel/server.js)

Auth completa con bcrypt + express-session. Rate limiting: 5 intentos/min/IP en login. CRUD completo vía API REST:
- `/api/config` → configuración general (nombre negocio, domicilio, etc.)
- `/api/horarios` → horarios por día
- `/api/banco` → datos bancarios
- `/api/mensajes` → mensajes personalizados del bot
- `/api/productos` → CRUD de cortes/productos
- `/api/clientes` → CRUD de clientes
- `/api/pedidos` → ver y gestionar pedidos (hoy / todos)
- `/api/pedidos/:id/estado` → cambia estado **y notifica al cliente por WhatsApp** automáticamente (confirmado, rechazado, en_camino)
- `/api/pedidos/:id/notificar` → envía mensaje libre al cliente (usa `getJIDReal` si disponible)
- `/api/stats` → resumen del día con ticket promedio, corte más pedido, conteo por corte (usa `COUNT(*)`, no escaneo completo)
- `/api/cambiar-password` → cambio de contraseña del panel

**WA Bridge:** `src/panel/whatsapp-bridge.js` — singleton que expone el cliente de WhatsApp al panel sin dependencias circulares. `setWhatsappClient()` lo registra en `ready`, `getWhatsappClient()` lo recupera en el panel.

---

## UX — replyConTyping

Todas las respuestas del bot usan `replyConTyping(msg, texto)` en lugar de `msg.reply()` directo. Simula que el bot está escribiendo:
- Delay: `800ms + texto.length * 12ms`, máximo 3500ms, más hasta 400ms aleatorio
- Link previews desactivados globalmente con `linkPreview: false`

---

## Bugs corregidos (historial completo)

1. `BD Error: undefined` → valores undefined en upsertCliente; fix: sanitizar con `|| null`
2. `Pedido #0` → usar `db.exec` para `last_insert_rowid()`
3. Correo del cliente ignorado → filtro de preview solo aplica si `datosRecibidos.has()`
4. Formulario de mostrador cuando pedía domicilio → agregar `tipoEntrega` al objeto campos
5. Dirección no se cargaba al cambiar tipo → cargar de BD en bloque 2C
6. `tipoEntrega` no se actualizaba en cambios → agregar `campos.tipoEntrega = nuevoTipo`
7. "Agregame medio kilo" desde resumen → parsear antes de preguntar corte, guardar en `esperandoCorte` con `_esModificacionResumen`
8. Resumen mostraba ítems de sesiones anteriores → limpiar `esperandoAgregarMas` correctamente
9. "cambiame el domicilio" interpretado como cambio de tipo → quitar "el" del regex
10. Al dar dirección junto con todo, mandaba menú en lugar de resumen → verificar `esperandoAgregarMas` en ambos bloques de `camposCompletos`
11. "de buche" no detectado como corte → usar regex en lugar de búsqueda exacta
12. Parser tomaba solo primer corte → usar `matchAll` + `Set` para detectar múltiples cortes
13. `REGEX_CORTE_GLOBAL` con flag `g` mantenía estado → crear nuevo regex en cada llamada
14. Formato ítems mostraba "3 tacos carnitas carne" → corregido a "3 tacos de carne" (sin prefijo)
15. `esperandoEdicion` no se restauraba al reiniciar → serializado y restaurado en `sesiones.js`
16. Correo y referencia no eran campos editables → agregados en `detectarEdicion`/`aplicarEdicion`
17. Link previews en mensajes del bot → desactivados globalmente con `linkPreview: false`
18. FAQs no disponibles durante flujo activo → guard `enFlujoActivo()` en bloque de FAQs
19. Total no sumaba ítems de tipo "pesos" → `calcularSubtotal` en `precios.js` no tenía regex para ese formato; fix: añadir `mPesos` regex + reformatear línea para que también case con `mNorm`
20. Formato incorrecto de ítems por pesos → `procesarItemJSON` en `resumen.js` generaba `⚖️ $150 de carne — (~469g)` en lugar de `⚖️ ~469g de carne — $150`; fix: reordenar la interpolación del template literal
21. "No" en resumen final abría menú de corrección con opciones → descartado; ahora muestra `mostrarFormularioProgresivo` + "¿Qué dato deseas corregir?" igual que el flujo de cliente frecuente
22. "No" en `esperandoAgregarMas` volvía a mostrar el menú → añadido guard bare-"no" que muestra formulario + pregunta qué corregir, separado de `esAgregarNo` (que sí genera resumen)
23. `detectarEdicion` no disponible en estado `esperandoAgregarMas` → añadido bloque al inicio del handler: detecta edición, aplica y regresa a "¿Qué deseas ordenar?"; si requiere preguntar, guarda `contexto: 'agregarMas'` en `esperandoEdicion`
24. Al terminar edición con `contexto: 'agregarMas'`, perdía el estado de la orden → añadido caso en bloque `esperandoEdicion` que restaura `esperandoAgregarMas` con `ordenTexto` guardado
25. Salida del bot no visible en terminal → `msg.reply` wrapper extendido en `mensajes.js` para loggear todas las respuestas; usuario loggeado con `console.log` antes del primer guard
26. Sesiones zombi nunca se limpiaban → `setInterval` cada 10 min detecta clientes inactivos >45 min en `enFlujoActivo()` y los limpia automáticamente
27. Notas de voz ignoradas silenciosamente → bloque `msg.type === 'ptt'` responde con mensaje explicativo antes de procesar texto
28. Emojis de confirmación (👍, ✅) no procesados → normalización al inicio: `👍 → "si"`, `👎 → "no"`
29. "empezar de nuevo" / "otro pedido" no reiniciaba el flujo → nuevo guard `quiereEmpezarDeNuevo` con regex amplio
30. "cinco de carne" / "tres tacos de surtido" no parseaba → `textoANumero()` convierte números en palabras a dígitos antes del score
31. "5 de carne" ambiguo (¿tacos?, ¿tortas?, ¿gramos?) → `detectarSinTipo()` + `esperandoTipoItem` pregunta y espera respuesta
32. "lo mismo de siempre" / "el mismo pedido" solo iba a Groq → `detectarRepetirPedido()` revisa `ultimoPedido` y reutiliza el JSON sin Groq
33. "mitad carne mitad buche" siempre iba a Groq → `parsearMitadMitad()` lo parsea local (elimina -5 de penalización)
34. "¿qué es el buche?" / "¿tienen buche?" no se respondía sin Groq → nueva FAQ `descripcion_corte` en `detectarPreguntaFrecuente()` + `respuestaDescripcionCorte()` en `respuestas.js`
35. "a las siete y media" / "a las ocho" no validaba como hora → `validarHora()` traduce horas en palabras antes del regex numérico
36. `limpiarTodo()` no limpiaba `esperandoCorte` ni `esperandoEdicion` → agregados en `campos.js`
37. Typos en cortes ("buchee", "carnita") no detectados por regex exacto → fuzzy matching con Levenshtein (distancia ≤ 2, sin empates)
38. "ya pagué" mientras esperaba captura → bloque specific en `esperandoCaptura` responde "manda la captura de pantalla" sin confundir con cancelación
39. FAQs mostraban MENU_FORMATO en medio del formulario → ahora re-muestra el progreso del formulario si hay historial activo
40. `require("./db")` dentro del for-loop en `horario.js` → evaluaba el módulo en cada iteración; movido a import de nivel de archivo (ya estaba importado como `getHorarioDia`)
41. Teléfono con prefijo `+52` o `52` no detectado en el formulario → regex `/\+?52(\d{10})\b|\b(\d{10})\b/` en `campos.js`
42. `historial.splice(2, 2)` en llamadas a Groq eliminaba mensajes de datos del cliente en lugar del par más antiguo → corregido a `splice(0, 2)`
43. `parsearSinCorteItems` no sincronizado con `dividirEnItems` — ambos usaban el mismo regex de split pero el de `mensajes.js` no tenía "y también" → ahora ambos son idénticos
44. `esperandoTipoItem` no sobrevivía reinicios del bot — vivía como Map local en `mensajes.js` fuera del sistema de sesiones → movido a `estado/maps.js` y serializado/restaurado en `sesiones.js`
45. `cambiar_corte` en `detectarModificacion()` fallaba si el usuario escribía con typo ("cambia la carne por buch") → ahora usa `buscarCorteFuzzy` como fallback tras match exacto
46. `aplicarQuitarUno()` reducía el primer ítem del resumen en lugar del último añadido → iterar desde el final (`i = lineas.length - 1` hacia 0)
47. Panel admin sin protección contra brute force → rate limiting en `/api/login`: 5 intentos/min/IP con bloqueo de 60s

---

## Multi-negocio (en progreso)

La arquitectura ya está preparada:
- `config.js` lee todo de BD (nombre negocio, precios, banco, mensajes)
- `resumen.js` usa `getNombreNegocio()` y `getNombreProducto()` desde BD
- `pedidoParser.js` usa `getCortes()` desde BD
- `respuestas.js` lee todo de BD
- Panel admin ya tiene rutas para modificar todo desde UI

Pendiente:
- Soporte multi-negocio en una sola instancia (un número WhatsApp por negocio)
- Campo `tipo_negocio` en BD para configurar emojis y presentaciones

---

## Porcentaje de avance

| Fase | Descripción | Avance |
|---|---|---|
| **Fase 1** | Bot funcional Tacos Javier (flujo completo) | **~97%** |
| **Fase 1b** | Parser local sin Groq (score + patrones) | **~85%** |
| **Fase 2** | Configuración dinámica desde BD | **~90%** |
| **Fase 3** | Panel admin completo | **~85%** |
| **Fase 4** | Multi-negocio | **0%** |

**Avance general del proyecto: ~85%**

---

## Lo que falta (prioridad alta)

1. Probar en producción el flujo completo de `esperandoTipoItem` ("5 de carne" → "¿tacos o tortas?")
2. Probar en producción `detectarRepetirPedido` + `ultimoPedido` (¿persiste entre reinicios? No, es solo en memoria)
3. Probar `parsearMitadMitad` con mensajes reales ("medio kilo mitad carne mitad buche" y "medio carne y medio buche")
4. Probar `parsearTodoMenosCorte` ("de todo menos cuero")
5. Verificar que las FAQs de descripción de corte responden sin Groq ("¿qué es el buche?")
6. Verificar que `aplicarQuitarUno` reduce el último ítem correctamente
7. Verificar que teléfono con prefijo "+52" se detecta correctamente en el formulario
8. Probar auto-notificación del panel al cambiar estado (confirmado/rechazado/en_camino)

## Lo que falta (prioridad baja)

9. Panel admin: UI para agregar/editar cortes y variantes desde interfaz
10. Campo `tipo_negocio` en BD para adaptar emojis y presentaciones por tipo de negocio
11. Soporte multi-negocio (un número WhatsApp por negocio en la misma instancia)
12. Score más sofisticado con ML ligero
13. ~~"mitad carne mitad buche"~~ ya implementado ✅
14. ~~"lo mismo de siempre"~~ ya implementado ✅
15. ~~Brute force en panel login~~ ya implementado ✅

---

## Último estado — desde aquí debes continuar

### Último commit: `3033601` (20 May 2026)
**"Actualiza gitignore"** (commit previo relevante: `89bafe5` — "Mejoras de UX, corrección de bugs y refactor de arquitectura")

### Cambios post-commit (22 May 2026, sin commit aún) — dos rondas de mejoras:

---

#### Ronda 1 (10 mejoras):

**`src/handlers/pedidoParser.js`** — Refactor masivo del parser:
- Cache de cortes con TTL 60s (`_cortesCache`, `_cortesCacheTs`)
- `preprocesarCantidades()` — elimina ruido antes de números ("unos 3" → "3")
- `textoANumero()` — convierte "tres", "dos", "un par de", etc. a dígitos
- `levenshtein()` + `buscarCorteFuzzy()` — fuzzy matching (distancia ≤ 2) para typos
- `parsearMitadMitad()` — parsea "mitad carne mitad buche" localmente
- `parsearTodoMenosCorte()` — parsea "de todo menos cuero"
- `parsearItemHeredado()` — hereda tipo de ítem previo en listas mixtas
- `detectarSinTipo()` — detecta "5 de carne" (corte sí, tipo no)
- `detectarRepetirPedido()` — detecta "lo mismo de siempre" / "el mismo pedido"
- Eliminado `PATRON_MITAD` de penalizaciones; eliminado "y también" de `SEÑALES_GROQ`
- Threshold de pesos bajado: `> 100` → `> 40`
- `dividirEnItems()` ahora también divide por coma
- `extraerCorte()` usa fuzzy como fallback
- `PATRON_AGREGAR_MAS` y `PATRON_QUITAR_UNO` extendidos con variantes coloquiales
- `detectarModificacion()` retorna campo `corte` en agregar_mas
- FAQ `PREGUNTAS_HORARIO` extendido ("trabajan hoy", "ya cerraron", "siguen abiertos")
- Nueva FAQ `descripcion_corte` con regex `PREGUNTAS_DESCRIPCION_CORTE` + "¿Tienen buche?"
- Exporta: `detectarSinTipo`, `detectarRepetirPedido`, `getCortes`

**`src/handlers/mensajes.js`** — Mejoras de robustez y nuevas funcionalidades:
- Nuevos Maps: `esperandoTipoItem`, `ultimoPedido`, `ultimaActividad` (en mensajes.js)
- `ordenDomicilio.has()` → `tipoEntregaCliente.get() === "domicilio"` (crash fix)
- `CORTES_MAP` hardcodeado en `esperandoCorte` → `getCortes()` dinámico
- Timeout de sesiones zombi: `setInterval` 10 min limpia inactivos >45 min
- Manejo de notas de voz/audio (`msg.type === 'ptt'`) antes de procesar texto
- Normalización de emojis: 👍/✅ → "si", 👎/❌ → "no"
- Guard `quiereEmpezarDeNuevo` con regex amplio; ofrece nuevo pedido post-confirmación
- `validarHora()` traduce horas en palabras ("siete y media" → "7:30")
- Bloque `esperandoTipoItem`: cuando el cliente responde "tacos" o "tortas"
- Bloque `detectarRepetirPedido`: reutiliza `ultimoPedido` + `getUltimoPedido` desde BD
- Import: `guardarUltimoPedido`, `getUltimoPedido` desde `../db`

**`src/handlers/respuestas.js`**:
- `DESCRIPCIONES_CORTE` — objeto con descripción de cada corte en español natural
- `respuestaDescripcionCorte(corte)` — responde "¿qué es el buche?" sin Groq
- `respuestaHorario()` muestra estado actual (abierto/cerrado) con `estaEnHorario()`
- Caso `descripcion_corte` en `generarRespuestaAutomatica()`

**`src/db/modelos.js`**: `guardarUltimoPedido(telefono, json)` + `getUltimoPedido(telefono)` — persiste el último pedido en la columna `ultimo_pedido_json` de `clientes`.

**`src/db/seed.js`**: `ALTER TABLE clientes ADD COLUMN ultimo_pedido_json TEXT` con migración para BD existentes.

**`src/panel/server.js`** (ronda 1):
- `/api/stats` ampliado: `ticket_promedio`, `corte_mas_pedido`, `conteo_cortes`
- `POST /api/pedidos/:id/notificar` — endpoint para enviar mensaje libre al cliente via WA

**Nuevo archivo: `src/panel/whatsapp-bridge.js`** — singleton `setWhatsappClient`/`getWhatsappClient` para compartir el cliente WA con el panel sin circular deps.

**Nuevo archivo: `analisis/deteccion_intencion_nlu.md`** — documentación del pipeline NLU.

---

#### Ronda 2 (15 mejoras):

**`src/db/core.js`**:
- `guardarDB()` con **debounce 500ms** — escribe a disco una sola vez por ráfaga de operaciones, no en cada SQL `run()`

**`src/horario.js`**:
- `require("./db")` dentro del for-loop eliminado; usa el `getHorarioDia` ya importado al inicio del archivo

**`src/estado/maps.js`**:
- `esperandoTipoItem` movido aquí desde `mensajes.js` — ahora es parte del sistema de sesiones persistidas

**`src/estado/sesiones.js`**:
- `esperandoTipoItem` serializado y restaurado al reiniciar el bot
- TTL de sesiones: `limpiarSesionesAntiguas(6)` → `limpiarSesionesAntiguas(48)` (preventas necesitan más tiempo)

**`src/db/config.js`** + `src/db/index.js`:
- `guardarJIDReal(telefono, jid)` — guarda el JID de WhatsApp por teléfono real
- `getJIDReal(telefono)` — recupera el JID; permite notificar al cliente de forma confiable sin construir el JID manualmente (`521xxx@c.us`)

**`src/estado/index.js`**: exporta `esperandoTipoItem`

**`src/estado/campos.js`**:
- Regex de teléfono: `/\b(\d{10})\b/` → `/\+?52(\d{10})\b|\b(\d{10})\b/` — detecta números con prefijo `+52` o `52`

**`src/handlers/pedidoParser.js`** (ronda 2):
- `dividirEnItems()`: agrega "y también" como separador de ítems
- `parsearMitadMitad()`: nuevo patrón `PATRON_MITAD_CAPTURA` soporta "medio X y medio Y" además de "mitad X mitad Y"
- `detectarModificacion()` en `cambiar_corte`: usa `buscarCorteFuzzy` como fallback si el corte no hace match exacto

**`src/handlers/respuestas.js`**:
- `aplicarQuitarUno()`: itera desde el **último ítem** (el más reciente del pedido) en lugar del primero

**`src/handlers/mensajes.js`** (ronda 2):
- `historial.splice(2, 2)` → `splice(0, 2)` en ambas llamadas a Groq — elimina el par más antiguo, no el segundo par
- `parsearSinCorteItems()`: split sincronizado con `dividirEnItems()` (añadido "y también")
- `esperandoTipoItem` importado desde `../estado` (ya no Map local); ahora sobrevive reinicios
- `guardarJIDReal(infoPedido.telefono, clienteNumero)` al confirmar pedido — asocia JID con teléfono real

**`src/panel/server.js`** (ronda 2):
- Rate limiting en `/api/login`: 5 intentos/min/IP (en memoria, `_loginAttempts` Map)
- `/api/stats`: usa `queryOne("SELECT COUNT(*) as n FROM clientes")` en lugar de `getAllClientes().length`
- `/api/pedidos/:id/estado`: auto-notifica al cliente por WA al cambiar a `confirmado`, `rechazado`, o `en_camino`; usa `getJIDReal` si disponible, fallback a `521{tel}@c.us`
- `/api/pedidos/:id/notificar`: inline `require("../db/core")` movido al top; usa `getJIDReal` en lugar de JID construido

---

### Archivos clave actuales:

1. **`src/handlers/mensajes.js`** — Orquestador principal (~1700 líneas). Bloques de FAQs, modificaciones, `esperandoTipoItem` (importado), `quiereEmpezarDeNuevo`, timeout de sesiones, antes de Groq.
2. **`src/handlers/pedidoParser.js`** — Parser con score, fuzzy matching, `textoANumero`, `parsearMitadMitad` ("mitad" y "medio"), `dividirEnItems` con "y también", `detectarSinTipo`, `detectarRepetirPedido`, cortes dinámicos.
3. **`src/handlers/respuestas.js`** — Respuestas automáticas a FAQs incluyendo `descripcion_corte`; `aplicarQuitarUno` desde el último ítem.
4. **`src/estado/campos.js`** — Formulario progresivo + `detectarEdicion`/`aplicarEdicion` + `limpiarTodo` + regex de teléfono con +52.
5. **`src/estado/maps.js`** — Todos los Maps/Sets incluyendo `esperandoTipoItem`. Única fuente de verdad del estado en memoria.
6. **`src/estado/sesiones.js`** — Serialización y restauración completa; TTL 48h; `esperandoTipoItem` incluido.
7. **`src/db/core.js`** — `guardarDB()` con debounce 500ms.
8. **`src/db/config.js`** — Incluye `guardarJIDReal`/`getJIDReal` junto a `guardarTelefonoReal`/`getTelefonoReal`.
9. **`src/panel/server.js`** — Panel admin con rate limiting, stats eficiente, auto-notify al cliente.
10. **`src/panel/whatsapp-bridge.js`** — Singleton WA client.

### Siguiente paso sugerido:

Hacer commit de todos los cambios (dos rondas de mejoras sin commitear) y probar en producción:
1. Conectar WhatsApp y enviar "5 de carne" → verificar `esperandoTipoItem` (ahora sobrevive reinicios)
2. Enviar "medio carne y medio buche" → verificar alias de `parsearMitadMitad`
3. Enviar "+521234567890" como teléfono en el formulario → verificar regex
4. Cambiar estado de pedido desde el panel → verificar auto-notificación por WA
5. Intentar login incorrecto 6 veces → verificar rate limiting 429

---

## Notas importantes para cualquier IA que continúe

- El archivo más grande e importante es `mensajes.js` (~1700 líneas). Cualquier cambio debe hacerse quirúrgicamente con str_replace, no reescribiendo el archivo completo.
- Los Maps en memoria NO se duplican. `ultimoPedido` y `ultimaActividad` viven en `mensajes.js` porque son auxiliares efímeros (no se persisten). `esperandoTipoItem` fue movido a `estado/maps.js` y ahora se serializa.
- Los Maps de sesión (los ~22 del flujo principal) viven en `estado/maps.js` y se serializan en `sesiones.js`. Si necesitas uno nuevo de flujo, agrégalo ahí y re-expórtalo en `estado/index.js`.
- `require("../db")` y `require("../estado")` siguen funcionando igual — son re-exports desde `db/index.js` y `estado/index.js` respectivamente. No cambiar estos imports.
- `datosCampos` es el JSON del cliente. Tiene: nombre, telefono, correo, metodo, calle, colonia, referencia, hora, tipoEntrega.
- `generarResumen()` lee `tipoEntrega` de `datosCampos` como fuente de verdad, no del parámetro recibido.
- `detectarEdicion` y `aplicarEdicion` están en `estado/campos.js`, no en `mensajes.js`.
- Usar siempre `replyConTyping(msg, texto)` para responder, nunca `msg.reply()` directo.
- El historial de Groq es de 15 mensajes máximo. El estado del pedido persiste en Maps independientemente.
- Cuando el cliente cambia de tipo de entrega después de tener una orden, la orden se guarda en `esperandoAgregarMas` y se regenera el resumen cuando completa los datos.
- `parsearSinCorteItems` en `mensajes.js` es diferente a `parsearItem` en `pedidoParser.js`. La primera es para el flujo de preguntar corte, la segunda es interna del parser.
- Los regex de cortes deben crear siempre una nueva instancia (no constante global con flag `g`) para evitar problemas de estado.
- `resumenPendiente` tiene doble función: guardar el resumen esperando confirmación Y como catch-all al reiniciar (reenvía el resumen al cliente si el bot se reinicia con una sesión activa).
- `ultimoPedido` en `mensajes.js` NO persiste entre reinicios (solo en memoria). Sin embargo, `getUltimoPedido(telefono)` en `../db` sí lee desde BD (`clientes.ultimo_pedido_json`). `detectarRepetirPedido` debe intentar BD primero si el Map local está vacío.
- `guardarDB()` en `core.js` tiene debounce de 500ms. No escribe inmediatamente al disco. Esto es seguro porque todo el estado es in-memory y el write a disco es solo para recuperación post-crash.
- `getJIDReal(telefono)` recupera el JID completo de WhatsApp (`5521xxx@c.us`) para un teléfono dado. Se popula automáticamente al confirmar el primer pedido del cliente. Antes del primer pedido, el JID no está disponible.
- `buscarCorteFuzzy()` usa Levenshtein con distancia ≤ 2 y descarta empates. No corregir si dos cortes tienen la misma distancia al typo.
- `textoANumero()` se aplica antes del score en `detectarSinCorte()`. También se debe aplicar antes de `parsearPedidoSimple()` si se quieren parsear "tres tacos".
- La cache de cortes (`_cortesCache`) tiene TTL de 60s. Si el dueño cambia productos en el panel, el bot los refleja en menos de 1 minuto.

---

## Objetivo final del proyecto

### Visión general

Construir una plataforma de bots de WhatsApp para negocios de comida que sea:
1. **Completamente autónoma** — sin depender de ninguna IA externa (Groq, OpenAI, etc.) para el flujo normal de pedidos
2. **Configurable desde un panel** — el dueño del negocio configura todo desde su celular sin tocar código
3. **Multi-negocio** — una sola instancia del sistema puede correr bots para múltiples negocios simultáneamente, cada uno con su propio número de WhatsApp y configuración

### Objetivo técnico detallado

**Eliminar Groq del flujo de pedidos.** El objetivo es que el parser local + respuestas automáticas cubran el 95%+ de los casos reales, y Groq quede solo como último recurso para casos genuinamente ambiguos (menos del 5% de las interacciones).

**Hacer el sistema agnóstico al tipo de negocio.** Todo se lee de la BD: productos, presentaciones, cortes, variantes, horario, costo de domicilio, métodos de pago, mensajes personalizados.

**Panel de administración completo.** El dueño puede: cambiar precios en tiempo real, activar/desactivar productos, ver pedidos del día, gestionar clientes, cambiar horario, modificar mensajes del bot, ver estadísticas básicas.

**Memoria de clientes.** El bot ya guarda clientes frecuentes con su dirección. Objetivo: recordar el pedido más común ("lo mismo de siempre") y sugerir al cliente su pedido anterior.

### Objetivo de negocio

El sistema debe poder venderse o rentarse a cualquier negocio de comida (taquerías, pizzerías, hamburguesas, mariscos, etc.) como un servicio. El dueño no necesita saber programar, configura todo desde el panel web o desde WhatsApp, recibe pedidos en un grupo de WhatsApp o en el panel, y puede cambiar precios y menú sin depender de un desarrollador.

### Criterio de éxito

El bot está terminado cuando:
1. Un nuevo negocio puede configurarse completamente desde el panel en menos de 30 minutos
2. El bot toma pedidos correctamente sin llamar a Groq en más del 95% de los casos
3. El dueño puede cambiar precios desde el panel y el bot los refleja inmediatamente
4. El sistema puede correr 3+ negocios diferentes en la misma instancia sin conflictos
