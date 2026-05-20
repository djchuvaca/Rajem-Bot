# Bitácora del Proyecto: Bot WhatsApp Tacos Javier
**Versión actual:** carnitas-bot 1.4  
**Fecha:** Mayo 2026 (último commit: 74ce15c — 19 May 2026)  
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

## Maps en memoria (estado/maps.js)

| Map/Set | Qué guarda |
|---|---|
| `conversaciones` | historial de Groq por cliente |
| `resumenPendiente` | resumen esperando confirmación (también catch-all al reiniciar) |
| `clientesNuevos` | clientes que ya saludaron |
| `datosRecibidos` | clientes que completaron formulario |
| `datosAcumulados` | texto acumulado del cliente para interpretar campos |
| `datosCampos` | nombre, tel, correo, dirección, método, hora, tipoEntrega, referencia |
| `pendientesConfirmacion` | datos esperando confirmación del cliente |
| `correoPreguntas` | clientes a los que ya se preguntó el correo |
| `referenciaPreguntas` | clientes a los que ya se preguntó referencia de dirección |
| `esperandoConfirmacionItem` | ítem parseado esperando "¿es correcto?" |
| `esperandoAgregarMas` | orden acumulada esperando más ítems |
| `pedidoJSONActual` | último JSON de pedido parseado |
| `esperandoCorte` | pedido parcial sin corte definido |
| `esperandoEdicion` | campo que el bot está esperando editar (serializado en sesiones) |
| `esperandoConfirmacionDatos` | cliente frecuente confirmando datos precargados |
| `tipoEntregaCliente` | domicilio o mostrador |
| `horaEntregaPreventa` | hora de entrega para preventas |
| `pedidosConfirmados` | pedidos ya enviados al negocio |
| `esperandoMotivoCancelacion` | esperando motivo de cancelación |
| `esperandoCaptura` | esperando captura de transferencia |
| `clientesPreventa` | clientes en flujo de preventa |

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

**Guard FAQs:** `enFlujoActivo()` permite responder preguntas frecuentes en cualquier punto del flujo, no solo en toma de pedido.

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
- `"200 de surtido"` → pesos, corte
- `"350g de lengua"` → gramos explícitos, corte
- `"3 tacos de carne y medio kilo de buche"` → múltiples ítems
- `"4 tacos de carne buche y cuero"` → múltiples cortes en un ítem
- Sin corte → pregunta el corte antes de llamar a Groq
- Múltiples ítems sin corte → pregunta ítem por ítem

### Sistema de Score:
Cada texto recibe un score. Si score >= 4 → parsear local, si no → Groq.
- Tiene número → +2
- Tiene presentación (taco/torta/gramos/medida) → +2
- Tiene corte → +2
- Múltiples ítems bien estructurados → +2
- Señales de complejidad (de 1 en 1, alternados, para mí, etc.) → -10
- Patrón mitad y mitad → -5

### Cortes dinámicos desde BD:
`getCortes()` lee los productos de la BD. Si el dueño agrega un producto nuevo en el panel, el bot ya lo reconoce automáticamente. Variantes coloquiales se agregan automáticamente (buchito, buchon, lenguita, etc.)

### Qué detecta además de pedidos:
- `detectarPreguntaFrecuente()` → precio, horario, domicilio, menú, ubicación, métodos de pago
- `detectarModificacion()` → quitar uno, agregar más, cambiar corte
- `necesitaPlatos()` (en prompts/platos.js) → detecta pedidos multi-plato complejos

### Lo que aún va a Groq (casos complejos):
- "de 1 en 1", "alternados", "uno de cada"
- "mitad carne mitad buche"
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

Auth completa con bcrypt + express-session. CRUD completo vía API REST:
- `/api/config` → configuración general (nombre negocio, domicilio, etc.)
- `/api/horarios` → horarios por día
- `/api/banco` → datos bancarios
- `/api/mensajes` → mensajes personalizados del bot
- `/api/productos` → CRUD de cortes/productos
- `/api/clientes` → CRUD de clientes
- `/api/pedidos` → ver y gestionar pedidos (hoy / todos)
- `/api/cambiar-password` → cambio de contraseña del panel

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
| **Fase 1** | Bot funcional Tacos Javier (flujo completo) | **~90%** |
| **Fase 1b** | Parser local sin Groq (score + patrones) | **~65%** |
| **Fase 2** | Configuración dinámica desde BD | **~85%** |
| **Fase 3** | Panel admin completo | **~75%** |
| **Fase 4** | Multi-negocio | **0%** |

**Avance general del proyecto: ~75%**

---

## Lo que falta (prioridad alta)

1. Implementar los 4 patrones nuevos en el parser que aún van a Groq innecesariamente:
   - **"mitad carne mitad buche"** → 2 ítems con el monto/gramos dividido entre 2
   - **"quita uno de los tacos"** → reducir cantidad en 1 del ítem en `esperandoAgregarMas`
   - **"agrégale 2 más"** → incrementar cantidad del último ítem confirmado
   - **"cámbiame el buche por cuero"** → sustituir corte en ítem existente
2. Verificar en producción que FAQs responden sin Groq (horario, precio, ubicación)
3. Verificar que modificaciones (quita uno, cambia corte) aplican sin Groq

## Lo que falta (prioridad baja)

4. Panel admin: UI para agregar/editar cortes y variantes desde interfaz
5. Campo `tipo_negocio` en BD para adaptar emojis y presentaciones por tipo de negocio
6. Soporte multi-negocio (un número WhatsApp por negocio en la misma instancia)
7. Memoria de pedidos anteriores por cliente ("lo mismo de siempre")
8. Score más sofisticado con ML ligero

---

## Último estado — desde aquí debes continuar

### Último commit: `74ce15c` (19 May 2026)
**"Mejoras de UX, corrección de bugs y refactor de arquitectura"**

### Cambios post-commit (20 May 2026, sin commit aún):

**`src/pedido/resumen.js` — línea 78**
- `case "pesos"`: formato cambiado de `⚖️ $150 de carne — (~469g)` a `⚖️ ~469g de carne — $150` para consistencia con el resto de ítems

**`src/pedido/precios.js` — `calcularSubtotal()`**
- Añadido regex `mPesos` (`/\$(\d+).*\(~\d+g\)$/`) antes de `mNorm` para capturar el formato anterior de pesos (backward compat); el nuevo formato ya cae en `mNorm` directo

**`src/handlers/mensajes.js`**
- `msg.reply` wrapper extendido para loggear todas las respuestas del bot en terminal (líneas 166-170)
- Log del mensaje del usuario antes del primer guard (línea 216)
- Bloque `resumenPendiente` "no": muestra `mostrarFormularioProgresivo` + "¿Qué dato deseas corregir?" (igual que cliente frecuente) en lugar de menú de opciones (líneas 929-938)
- Bloque `esperandoAgregarMas`: añadidos 18 líneas al inicio para manejar `detectarEdicion` y bare-"no" → formulario + pregunta qué corregir (líneas 1176-1191)
- Bloque `esperandoEdicion`: añadido caso `contexto === 'agregarMas'` que restaura `esperandoAgregarMas` con `ordenTexto` guardado (línea 367)

### Archivos clave actuales:

1. **`src/handlers/mensajes.js`** — Orquestador principal. Tiene bloques de FAQs y modificaciones antes de Groq.
2. **`src/handlers/pedidoParser.js`** — Parser con score, cortes dinámicos, `detectarPreguntaFrecuente`, `detectarModificacion`.
3. **`src/handlers/respuestas.js`** — Respuestas automáticas a FAQs y `aplicarModificacion`.
4. **`src/estado/campos.js`** — Formulario progresivo + `detectarEdicion`/`aplicarEdicion`.
5. **`src/estado/maps.js`** — Todos los Maps/Sets. Única fuente de verdad del estado en memoria.
6. **`src/estado/sesiones.js`** — Serialización y restauración completa del estado (incluye `esperandoEdicion`).
7. **`src/pedido/resumen.js`** — Resumen generalizado, lee de BD.
8. **`src/pedido/precios.js`** — Cálculo de precios y `calcularSubtotal`.
9. **`src/panel/server.js`** — Panel admin completo con auth y CRUD.

### Lo que se dejó pendiente de probar:
- Verificar flujo completo: "no" en resumen → formulario → "cambia mi nombre" → edición aplicada → vuelta a pedido
- Verificar formato `~469g de carne — $150` en WhatsApp
- Verificar que total incluye ítems de tipo pesos
- Verificar que "¿a qué hora abren?" responde sin Groq
- Verificar que "¿cuánto cuesta el taco?" responde sin Groq
- Verificar que "quita uno" sobre pedido activo aplica sin Groq
- Verificar que "cámbiame el buche por cuero" aplica sin Groq

### Siguiente paso sugerido:

Implementar los 4 patrones nuevos en el parser:
1. `"mitad carne mitad buche"` → lógica en `mensajes.js` (bloque modificaciones existente)
2. `"quita uno de los tacos"` → en `mensajes.js` + función auxiliar en `respuestas.js`
3. `"agrégale 2 más"` → incrementar cantidad del último ítem en `esperandoAgregarMas`
4. `"cámbiame el buche por cuero"` → sustituir corte en ítem dentro de `esperandoAgregarMas`

---

## Notas importantes para cualquier IA que continúe

- El archivo más grande e importante es `mensajes.js` (~1400 líneas). Cualquier cambio debe hacerse quirúrgicamente con str_replace, no reescribiendo el archivo completo.
- Los Maps en memoria NO se duplican. Solo viven en `estado/maps.js`. Si necesitas un nuevo Map, agrégalo ahí y re-expórtalo en `estado/index.js`.
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
