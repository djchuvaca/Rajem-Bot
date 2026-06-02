# Mapeo de FAQs — Bot Tacos Javier
**Fecha:** 1 Junio 2026  
**Archivo fuente:** `src/handlers/pedidoParser.js` + `src/handlers/respuestas.js` + `src/handlers/flujos/orden.js`

---

## Catálogo de FAQs registradas

El bot detecta **8 tipos** de preguntas frecuentes (antes 6). Cada tipo tiene sus patrones de detección y una respuesta automática generada desde la BD (sin Groq).

**Multi-intent:** Cuando el cliente hace dos preguntas en un solo mensaje ("¿a qué hora abren y cuánto es el domicilio?"), `detectarTodasPreguntasFrecuentes()` detecta ambas y el bot responde las dos antes de mostrar el menú.

---

### 1. PRECIO (`tipo: "precio"`)

**Preguntas que detecta:**
- "¿cuánto cuesta el taco?"
- "¿cuánto vale el buche?"
- "¿a cómo están?"
- "precio del taco"
- "¿cuánto cobran?"
- "¿a cuánto venden?"

**Nota:** Si menciona un corte (buche, carne, cuero, lengua, surtido), la respuesta incluye el precio de ese corte específico.

**Respuesta del bot (sin corte específico):**
```
💰 *Precios en Tacos Javier:*

🌮 *Tacos* — $[precio] c/u
🥖 *Tortas* — $[precio] c/u
⚖️ *Por gramos* — $[precio] / 100g

🥩 Piezas disponibles: Surtido, Carne, Buche, Cuero, Lengua

_Los precios incluyen tortillas y salsas_ 😊
```

**Respuesta del bot (con corte, ej. "¿cuánto cuesta el buche?"):**
```
💰 *Precios en Tacos Javier:*

🌮 Taco de buche: *$[precio]*
🥖 Torta de buche: *$[precio]*
⚖️ Por 100g de buche: *$[precio]*

_Los precios incluyen tortillas y salsas_ 😊
```

---

### 2. HORARIO (`tipo: "horario"`)

**Preguntas que detecta:**
- "¿a qué hora abren?"
- "¿cuándo abren?"
- "¿a qué hora cierran?"
- "¿qué horario tienen?"
- "¿están abiertos?"
- "¿hasta qué hora atienden?"
- "¿ya abrieron?

**Respuesta del bot:**
```
🕖 *Horario de Tacos Javier:*

Lunes, Martes, Miércoles, Jueves, Viernes, Sábado: 7:00a.m. - 12:30p.m.
(Agrupa días con el mismo horario)

_¡Te esperamos!_ 😊
```

---

### 3. DOMICILIO (`tipo: "domicilio"`)

**Preguntas que detecta:**
- "¿hacen domicilio?"
- "¿tienen domicilio?"
- "¿mandan domicilio?"
- "¿llevan a domicilio?"
- "¿cuánto cobran de domicilio?"
- "costo de domicilio"
- "¿cobran envío?"
- "¿cuanto se tarda?
-"¿en cuanto tiempo llega?

**Respuesta del bot:**
```
🛵 *Servicio a domicilio de Tacos Javier:*


✅ Sí hacemos domicilio
💵 Costo: *$[costo]*
📍 Zona de cobertura: [zona] (si está configurada)
⏳ Tiempo aproximado de entrega: 60 minutos como Maximo

_Te lo llevamos has la Luna de ser necesario_ 😊
```

---

### 4. MENÚ (`tipo: "menu"`)

**Preguntas que detecta:**
- "¿qué tienen?"
- "¿qué hay?"
- "¿qué venden?"
- "¿qué ofrecen?"
- "¿qué manejan?"
- "el menú"
- "menú"
- "¿tienen de todo?"
- "¿que les queda?"


**Respuesta del bot:**
```
🌮 *MENÚ TACOS JAVIER* 🌮
━━━━━━━━━━━━━━━━━━

🌮 *TACOS* — $[precio] c/u
_(combinaciones al gusto)_

🥖 *TORTAS* — $[precio] c/u
_(combinaciones al gusto)_

⚖️ *POR GRAMOS* — $[precio] / 100g
Cualquier pieza o combinación
_Incluye tortillas y salsas_

💵 *POR CANTIDAD EN $*
Tú decides cuánto gastar, nosotros pesamos
_Incluye tortillas y salsas_

🥩 *Piezas disponibles:* Surtido · Carne · Buche · Cuero · Lengua

━━━━━━━━━━━━━━━━━━
🟢 Todos los tacos y tortas incluyen salsas
🛵 Domicilio: $[costo] extra

*¿Qué te vamos a preparar?* 😊
```

---

### 5. UBICACIÓN (`tipo: "ubicacion"`)

**Preguntas que detecta:**
- "¿dónde están?"
- "¿dónde quedan?"
- "dirección"
- "ubicación"
- "¿cómo llegar?"
- "¿donde se encuentran?

**Respuesta del bot:**
```
📍 *Ubicación de Tacos Javier:*

[dirección configurada en BD]

🗺️ [link de Google Maps] (si está configurado)

_¡Te esperamos!_ 😊
```

---

### 7. PEDIDO LISTO (`tipo: "pedido_listo"`) — nuevo

**Preguntas que detecta:**
- "¿ya están listos mis tacos?"
- "¿ya quedó listo mi pedido?"
- "¿ya está lista mi orden?"

**Por qué existe este intent:** Antes de su creación, "¿ya están listos?" matcheaba `PREGUNTAS_HORARIO` y el bot respondía con el horario de apertura. Ahora `pedido_listo` se evalúa **antes** que `horario`.

**Respuesta del bot:**
```
¡En cuanto esté listo tu pedido te avisamos aquí mismo! 😊
Si tienes dudas o quieres hacer algún cambio, con gusto te ayudamos.
```

---

### 6. MÉTODOS DE PAGO (`tipo: "metodos_pago"`)

**Preguntas que detecta:**
- "¿cómo pago?"
- "¿de qué forma puedo pagar?"
- "métodos de pago"
- "¿aceptan tarjeta?"
- "¿aceptan transferencia?"
- "¿aceptan efectivo?"
- "¿acaptan vales de despensa?"

**Respuesta del bot (mostrador):**
```
💳 *Métodos de pago en Tacos Javier:*

Aceptamos en mostrador: *efectivo, tarjeta y transferencia*

_Nos Adaptamos al de tu preferencia_ 😊
```

**Respuesta del bot (domicilio):**
```
💳 *Métodos de pago en Tacos Javier:*

Aceptamos en servicio a Domicilio: *efectivo y transferencia*


_Nos Adaptamos al de tu preferencia_ 😊
```

---

## Mapeo por etapa del flujo

---

### Etapa 1 — Fuera de horario / Preventa
> El cliente aún está explorando. Todas las FAQs disponibles.

| FAQ          | Preguntas que responde                                         | Respuesta del bot                  |
|:-------------|:---------------------------------------------------------------|:-----------------------------------|
| horario      | "¿a qué hora abren?", "¿ya abrieron?", "¿hasta qué hora?"      | Horario completo desde BD          |
| precio       | "¿cuánto cuesta el taco?", "¿a cómo están?"                    | Precios de taco, torta y 100g      |
| domicilio    | "¿hacen domicilio?", "¿cuánto cobran de envío?"                | Costo, zona y tiempo de entrega    |
| menú         | "¿qué tienen?", "¿qué hay?", "¿tienen de todo?"                | Menú completo con precios          |
| ubicacion    | "¿dónde están?", "dirección", "¿cómo llego?"                   | Dirección + link Maps              |
| metodos_pago | "¿aceptan tarjeta?", "¿aceptan transferencia?", "¿cómo pago?"  | Métodos de pago según contexto     |

---

### Etapa 2 — Tipo de entrega (¿domicilio o mostrador?)
> El cliente decide cómo quiere su pedido antes de comprometerse.

| FAQ          | Preguntas que responde                                         | Respuesta del bot                  |
|:-------------|:---------------------------------------------------------------|:-----------------------------------|
| domicilio    | "¿hacen domicilio?", "¿cuánto cobran?", "¿cuánto se tarda?"    | Costo, zona y tiempo de entrega    |
| metodos_pago | "¿aceptan tarjeta?", "¿cómo pago?"                             | Métodos según domicilio/mostrador  |
| horario      | "¿a qué hora abren?", "¿a qué hora reparten?"                  | Horario completo                   |
| precio       | "¿cuánto cuesta el taco?", "¿a cómo está el buche?"            | Precios completos                  |
| ubicacion    | "¿dónde están?", "¿dónde quedan?"                              | Dirección + link Maps              |
| ~~menú~~     | ❌ Que primero diga si es domicilio o mostrador               | —                                  |

---

### Etapa 3 — Confirmación de datos (cliente frecuente)
> Ya eligió cómo quiere su pedido. Solo FAQs relevantes al pago y entrega.

| FAQ          | Preguntas que responde                                          | Respuesta del bot                  |
|:-------------|:----------------------------------------------------------------|:-----------------------------------|
| metodos_pago | "¿aceptan tarjeta?", "¿aceptan transferencia?"                  | Métodos según domicilio/mostrador  |
| domicilio    | "¿cuánto cobran de domicilio?", "¿cuánto se tarda?"             | Costo y tiempo de entrega          |
| horario      | "¿a qué hora abren?", "¿a qué hora entregan?"                   | Horario completo                   |
| ~~precio~~   | ❌ Ya sabe qué quiere pedir                                     | —                                  |
| ~~menú~~     | ❌ Ya decidió                                                   | —                                  |
| ~~ubicacion~~| ❌ Ya sabe dónde están                                          | —                                  |

---

### Etapa 4 — Formulario progresivo
> Está llenando sus datos. Solo FAQs que ayudan a completar el formulario.

| FAQ          | Preguntas que responde                                          | Respuesta del bot                  |
|:-------------|:----------------------------------------------------------------|:-----------------------------------|
| metodos_pago | "¿aceptan tarjeta?", "¿aceptan efectivo?"                       | Métodos según domicilio/mostrador  |
| domicilio    | "¿cuánto cobran de domicilio?"                                  | Costo y zona de cobertura          |
| horario      | "¿a qué hora abren?", "¿hasta qué hora?"                        | Horario completo                   |
| ~~precio~~   | ❌ Ya sabe qué quiere pedir                                     | —                                  |
| ~~menú~~     | ❌ Ya está llenando el formulario                               | —                                  |
| ~~ubicacion~~| ❌ No relevante en este punto                                   | —                                  |

---

### Etapa 5 — Armando el pedido (esperandoAgregarMas)
> Está eligiendo qué pedir. Solo FAQs que ayudan a decidir qué y cuánto.

| FAQ           | Preguntas que responde                                         | Respuesta del bot                  |
|:--------------|:---------------------------------------------------------------|:-----------------------------------|
| precio        | "¿cuánto cuesta el medio kilo de buche?", "¿a cómo el cuero?"  | Precio del corte o general         |
| menú          | "¿qué cortes tienen?", "¿qué hay?"                             | Menú completo                      |
| domicilio     | "¿cuánto cobran de domicilio?"                                 | Costo de envío                     |
| ~~horario~~   | ❌ No relevante con el pedido ya en proceso                    | —                                  |
| ~~ubicacion~~ | ❌ No relevante                                                | —                                  |
| ~~metodos_pago~~| ❌ Ya fue elegido en el formulario                           | —                                  |

---

### Etapa 6 — Eligiendo corte / Confirmando ítem
> Está a punto de confirmar un ítem. Responde la FAQ y regresa a la pregunta pendiente.

| FAQ       | Preguntas que responde                                         | Respuesta del bot                       |
|:--------  |:---------------------------------------------------------------|:----------------------------------------|
| precio    | "¿cuánto cuesta el buche?", "¿a cómo el taco?"                 | Precio del corte o general              |
| menú      | "¿qué cortes tienen?", "¿qué hay?"                             | Menú completo                           |
| ~~resto~~ | ❌ Cerradas                                                    | —                                       |

> **↩ Redirect:** Responde la FAQ y luego re-hace la pregunta pendiente:
> - `esperandoCorte` → *"¿Y tu pedido, qué corte querías?"*
> - `esperandoConfirmacionItem` → re-muestra el ítem + *"¿Es correcto?"*

---

### Etapa 7 — Resumen final (confirmar pedido)
> El cliente está a un paso del cierre. Todas las FAQs cerradas.

| FAQ   | Estado                                                              |
|:------|:--------------------------------------------------------------------|
| Todas | ❌ Cerradas — si escribe algo que no es confirmar/cancelar, el bot re-muestra el resumen |

---

### Etapa 8 — Esperando captura de pago
> Manejo propio. Responde la FAQ y recuerda al cliente mandar la imagen.

| FAQ | Preguntas que responde                                         | Respuesta del bot                            |
|:----|:---------------------------------------------------------------|:---------------------------------------------|
| Todas| Cualquier FAQ registrada                                      | Respuesta + *"Recuerda mandarnos tu captura"* |

---

## Estado de implementación

| Etapa                             | Estado                                              |
|:----------------------------------|:----------------------------------------------------|
| Fuera de horario / Preventa       | ✅ Implementado                                     |
| FAQ general (antes del flujo)     | ✅ Implementado (guard `!enFlujoActivo`)            |
| Tipo de entrega                   | ⚠️ Funciona pero sin filtro por tipo de FAQ         |
| Confirmación de datos (frecuente) | ❌ Pendiente — `esperandoConfirmacionDatos` bloquea |
| Formulario progresivo             | ❌ Pendiente — `datosRecibidos` bloquea             |
| Armando pedido (agregarMas)       | ⚠️ Funciona pero sin filtro por tipo de FAQ         |
| Eligiendo corte (esperandoCorte)  | ❌ Pendiente — sin FAQ + redirect                   |
| Confirmando ítem                  | ❌ Pendiente — sin FAQ + redirect                   |
| Resumen final                     | ✅ Cerradas (comportamiento correcto)               |
| Esperando captura de pago         | ✅ Implementado con su propio bloque                |
