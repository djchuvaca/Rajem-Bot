# Detección de Intención en Lenguaje Natural — Bot Tacos Javier
**Fecha:** 21 Junio 2026  
**Archivos fuente:** `src/handlers/mensajes.js` · `src/handlers/flujos/*.js` · `src/handlers/pedidoParser.js` · `src/estado/campos.js`

---

## Qué es la detección de intención en este bot

Cuando un cliente escribe algo en WhatsApp, el bot necesita entender **qué quiere hacer**: ¿está pidiendo tacos? ¿preguntando el precio? ¿quiere cambiar su dirección? ¿confirmar su pedido?

El bot **no lee la mente** del cliente. Toma la frase del cliente y la pasa por una serie de filtros en orden, cada uno buscando un patrón específico. Si un filtro "atrapa" la intención, el bot responde con esa lógica y no sigue revisando los demás. Si ningún filtro local lo atrapa, el mensaje se envía a Groq (IA).

Este sistema se llama **pipeline híbrido**: capas de detección local rápida + fallback a IA solo cuando es necesario.

---

## Capa 0 — Normalización del texto (base de todo)

Antes de cualquier detección, **todo** texto pasa por una función de normalización. Sin esto, "¿CUÁNTO CUESTA?" y "cuanto cuesta" serían cadenas completamente distintas para los regex.
@
**Función:** `normalizar(texto)` en `pedidoParser.js`

```
Entrada:  "¿Cuánto Cuesta el Tacooo?"
Proceso:  trim() → toLowerCase() → normalize("NFD") → eliminar acentos
Salida:   "cuanto cuesta el tacooo?"
```

**Qué elimina:**
- Mayúsculas
- Acentos y tildes (á → a, é → e, ñ → n, ü → u)
- Espacios al inicio y al final

**Por qué importa:** El 90% de los mensajes de WhatsApp tienen errores de tilde o mezclan mayúsculas. Sin normalizar, un regex como `/cuanto/i` fallaría ante "Cuánto".

**Lo que el bot SÍ detecta después de normalizar:**
- "¿Cuánto cuesta?" → "cuanto cuesta?" ✅
- "CUANTO VALE" → "cuanto vale" ✅
- "a cómo están" → "a como estan" ✅

**Lo que NO corrige:**
- Errores de escritura severos: "cuannto kuesa" ❌
- Palabras inventadas o slang regional muy raro ❌

---

## Capa 1 — Guards de contexto (prioridad absoluta)

Antes de cualquier detección de intención, el bot verifica **en qué estado está el cliente**. Si el cliente está en medio de un flujo activo (llenando datos, eligiendo corte, esperando confirmación), muchas intenciones se bloquean para evitar colisiones.

**Función:** `enFlujoActivo(clienteNumero)` en `src/handlers/flujos/utils.js`

```
Retorna TRUE si el cliente está en alguno de estos estados:
  - esperandoCorte          → eligiendo qué corte quiere
  - esperandoConfirmacionItem → confirmando un ítem
  - esperandoAgregarMas     → decidiendo si agrega más
  - datosRecibidos          → formulario completo, menú enviado
  - resumenPendiente        → resumen mostrado, esperando "sí"
  - esperandoEdicion        → modificando un dato
  - esperandoConfirmacionDatos → cliente frecuente confirmando
  - esperandoTipoItem       → eligiendo taco vs torta
```

**Nota:** Para el timeout de sesiones el criterio es más amplio — también considera clientes en `clientesNuevos` o `datosCampos` (a medio formulario sin ningún flujo activo).

**Efecto:** Si `enFlujoActivo()` devuelve `true`, las preguntas frecuentes (FAQs) se saltan. El bot prioriza terminar el flujo de compra.

**Ejemplo:**
- Cliente está en `esperandoCorte`. Escribe "¿a cuánto el taco?"
- `enFlujoActivo()` = `true` → no entra al bloque de FAQs
- El bot no responde el precio; espera el corte

---

## Capa 2 — Preguntas Frecuentes (FAQs)

Si el cliente no está en un flujo activo, el bot primero verifica si es una pregunta informativa. Estas se resuelven **sin Groq**, en milisegundos, con datos de la BD.

**Funciones:** `detectarPreguntaFrecuente` y `detectarTodasPreguntasFrecuentes` en `pedidoParser.js`

- **`detectarPreguntaFrecuente(texto)`** — retorna la primera coincidencia. Usada en estados bloqueantes.
- **`detectarTodasPreguntasFrecuentes(texto)`** — retorna **todas** las FAQs del mensaje (multi-intent, deduplicado). Usada en `mensajes.js` cuando el cliente no está en flujo activo; permite responder a dos preguntas en un solo mensaje ("¿a qué hora abren y cuánto cuesta el domicilio?").

Detecta **8 categorías** (antes 6). Cada una tiene su propio regex compilado.

---

### FAQ 1 — Precio

**Regex base:** `/cu[aá]nto\s+(cuesta|vale|est[aá]|cobran|venden)|a\s+c[oó]mo/i`

| El cliente escribe | Bot detecta | Bot responde |
|---|---|---|
| "¿cuánto cuesta el taco?" | `tipo: "precio"` | Precios completos desde BD |
| "¿a cómo están?" | `tipo: "precio"` | Precios completos |
| "¿a cómo el buche?" | `tipo: "precio", producto: "buche"` | Solo precio del buche |
| "precio del cuero" | `tipo: "precio", producto: "cuero"` | Solo precio del cuero |
| "¿cuánto sale?" | `tipo: "precio"` | Precios completos |
| "¿qué cuesta?" | ❌ no detecta | → siguiente capa |
| "está caro" | ❌ no detecta | → siguiente capa |
| "no tengo dinero" | ❌ no detecta | → Groq |

**Detección de corte específico:** Si en el mismo mensaje aparece una palabra clave de corte (`surtido`, `carne`, `buche`, `cuero`, `lengua`), el bot filtra la respuesta solo para ese corte.

---

### FAQ 1.5 — Pedido listo (nuevo)

**Detecta:** "¿ya están listos mis tacos?", "¿ya quedó mi pedido?"

**Importante:** Se evalúa **antes** que `horario` para evitar responder con el horario de apertura cuando el cliente pregunta por su pedido. Antes, "¿ya están listos?" matcheaba erróneamente como pregunta de horario.

| El cliente escribe | Bot detecta | Bot responde |
|---|---|---|
| "¿ya están listos mis tacos?" | `tipo: "pedido_listo"` | "En cuanto esté listo te avisamos aquí" |
| "¿ya quedó listo mi pedido?" | `tipo: "pedido_listo"` | idem |
| "¿ya están abiertos?" | `tipo: "horario"` | Horario completo (no confunde) |

---

### FAQ 2 — Horario

**Regex base:** `/(?:a\s+qu[eé]\s+hora|cu[aá]ndo)\s+(?:abren?|cierran?|atienden?)|qu[eé]\s+horario|est[aá]n\s+abiertos?|ya\s+abri/i`

| El cliente escribe | Bot detecta | Bot responde |
|---|---|---|
| "¿a qué hora abren?" | `tipo: "horario"` | Horario completo |
| "¿cuándo abren?" | `tipo: "horario"` | Horario completo |
| "¿ya abrieron?" | `tipo: "horario"` | Horario completo |
| "¿hasta qué hora atienden?" | `tipo: "horario"` | Horario completo |
| "¿están abiertos?" | `tipo: "horario"` | Horario completo |
| "¿qué horario tienen?" | `tipo: "horario"` | Horario completo |
| "¿trabajan hoy?" | ❌ no detecta | → Groq |
| "¿abren los domingos?" | ❌ no detecta | → Groq |
| "me pueden atender ahorita" | ❌ no detecta | → Groq |

---

### FAQ 3 — Domicilio

**Regex base:** `/(?:hacen?|tienen?|mandan?|llevan?|reparten?)\s+domicilio|env[ií]o|costo\s+de\s+env[ií]o|cobran\s+de\s+(?:env[ií]o|domicilio)|cu[aá]nto\s+se\s+tarda|cu[aá]nto\s+tiempo/i`

| El cliente escribe | Bot detecta | Bot responde |
|---|---|---|
| "¿hacen domicilio?" | `tipo: "domicilio"` | Costo, zona y tiempo |
| "¿tienen domicilio?" | `tipo: "domicilio"` | Costo, zona y tiempo |
| "¿cuánto cobran de envío?" | `tipo: "domicilio"` | Costo, zona y tiempo |
| "¿cuánto se tarda?" | `tipo: "domicilio"` | Tiempo estimado |
| "¿llegan a mi colonia?" | ❌ no detecta | → Groq |
| "¿hacen entregas en la noche?" | ❌ no detecta | → Groq |
| "¿van hasta el centro?" | ❌ no detecta | → Groq |

---

### FAQ 4 — Menú

**Regex base:** `/qu[eé]\s+(tienen?|hay|venden?|ofrecen?|manejan?)|el\s+men[uú]|\bmen[uú]\b|qu[eé]\s+les\s+queda|qu[eé]\s+tienen?/i`

| El cliente escribe | Bot detecta | Bot responde |
|---|---|---|
| "¿qué tienen?" | `tipo: "menu"` | Menú completo |
| "el menú" | `tipo: "menu"` | Menú completo |
| "¿qué hay?" | `tipo: "menu"` | Menú completo |
| "¿qué venden?" | `tipo: "menu"` | Menú completo |
| "¿qué les queda?" | `tipo: "menu"` | Menú completo |
| "¿tienen tacos de canasta?" | ❌ no detecta | → Groq |
| "¿hacen birria?" | ❌ no detecta | → Groq |
| "quiero ver sus platillos" | ❌ no detecta | → Groq |

---

### FAQ 5 — Ubicación

**Regex base:** `/d[oó]nde\s+(est[aá]n?|quedan?|se\s+encuentran?)|direcci[oó]n|ubicaci[oó]n|c[oó]mo\s+llegar|c[oó]mo\s+llego/i`

| El cliente escribe | Bot detecta | Bot responde |
|---|---|---|
| "¿dónde están?" | `tipo: "ubicacion"` | Dirección + Maps |
| "¿dónde quedan?" | `tipo: "ubicacion"` | Dirección + Maps |
| "dirección" | `tipo: "ubicacion"` | Dirección + Maps |
| "¿cómo llegar?" | `tipo: "ubicacion"` | Dirección + Maps |
| "ubicación" | `tipo: "ubicacion"` | Dirección + Maps |
| "¿están cerca del Walmart?" | ❌ no detecta | → Groq |
| "¿en qué colonia están?" | ❌ no detecta | → Groq |
| "¿cuánto me tardo en llegar?" | ❌ no detecta | → Groq |

---

### FAQ 6 — Métodos de Pago

**Regex base:** `/c[oó]mo\s+(?:puedo\s+)?pag(?:ar?|o)|m[eé]todos?\s+de\s+pago|aceptan?\s+(tarjeta|transferencia|efectivo)|formas?\s+de\s+pago/i`

| El cliente escribe | Bot detecta | Bot responde |
|---|---|---|
| "¿cómo pago?" | `tipo: "metodos_pago"` | Métodos según contexto |
| "¿aceptan tarjeta?" | `tipo: "metodos_pago"` | Métodos según contexto |
| "¿aceptan transferencia?" | `tipo: "metodos_pago"` | Métodos según contexto |
| "métodos de pago" | `tipo: "metodos_pago"` | Métodos según contexto |
| "¿aceptan OXXO Pay?" | ❌ no detecta | → Groq |
| "¿puedo pagar con CoDi?" | ❌ no detecta | → Groq |
| "no traigo efectivo" | ❌ no detecta | → Groq |

---

## Capa 3 — Tipo de Entrega (¿domicilio o mostrador?)

Cuando el cliente llega por primera vez y necesita indicar cómo quiere recibir su pedido, el bot analiza el texto con un **sistema de scoring por patrones**, no con un solo regex.

**Función:** `detectarTipoEntrega(texto)` en `entrega.js`

### Cómo funciona el scoring

```
Para cada mensaje del cliente:
  1. Se calcula un "puntaje mostrador" sumando coincidencias con patrones de mostrador
  2. Se calcula un "puntaje domicilio" sumando coincidencias con patrones de domicilio
  3. Si (diferencia entre puntajes) >= 3 → se elige el ganador
  4. Si diferencia < 3 → ambigüedad → bot pregunta de nuevo
```

### Patrones de mostrador (muestra)

| Patrón | Puntos | Ejemplo |
|---|---|---|
| `/\bmostr(ador)?\b/` | 10 | "para mostrador", "en el mostrador" |
| `/\brecoger\b/` | 10 | "voy a recoger", "paso a recoger" |
| `/\brecojo\b/` | 10 | "yo recojo" |
| `/\bpara\s+llevar\b/` | 9 | "para llevar" |
| `/\bme\s+lo\s+llevo\b/` | 9 | "me lo llevo yo" |
| `/\bvoy\s+a\s+pasar\b/` | 8 | "voy a pasar por él" |
| `/\bpaso\s+por\b/` | 8 | "paso por mi pedido" |

### Patrones de domicilio (muestra)

| Patrón | Puntos | Ejemplo |
|---|---|---|
| `/\bdomicilio\b/` | 10 | "a domicilio", "para domicilio" |
| `/\benv[ií]o\b/` | 10 | "con envío" |
| `/\bentrega\b/` | 10 | "entrega a domicilio" |
| `/\btraemelo\b/` | 10 | "tráemelo" |
| `/\bme\s+lo\s+traes\b/` | 10 | "¿me lo traes?" |
| `/\ba\s+mi\s+(casa\|domicilio)\b/` | 10 | "mándalo a mi casa" |
| `/\blo\s+quiero\s+en\s+mi\s+casa\b/` | 9 | "lo quiero en mi casa" |

### Ejemplos de scoring completo

**"quiero a domicilio"**
- domicilio: `/\bdomicilio\b/` = 10 pts
- mostrador: 0 pts
- Diferencia: 10 → **"domicilio"** ✅

**"voy a pasar a recoger"**
- mostrador: `/\brecoger\b/` = 10 + `/\bpaso\s+por\b/` ~ 8 pts = ~18 pts
- domicilio: 0 pts
- Diferencia: 18 → **"mostrador"** ✅

**"lo quiero aquí"**
- domicilio: 0 pts
- mostrador: 0 pts
- Diferencia: 0 → **ambiguo** → bot pregunta: *"¿Tu pedido será para domicilio o pasas a recoger al mostrador?"*

**Ejemplos que NO detecta:**
- "mándamelo" (sin contexto de dirección explícita) → puntaje bajo → pregunta de nuevo
- "para mi casita" → no coincide suficiente → pregunta de nuevo
- "¿cuánto está el envío?" → solo pregunta, no intención de compra → FAQ de domicilio, no tipo de entrega

---

## Capa 4 — Detección de Modificaciones al Pedido

Cuando el cliente ya tiene un pedido armado y quiere cambiarlo (sin rehacerlo desde cero), esta capa actúa.

**Función:** `detectarModificacion(texto)` en `pedidoParser.js`

Detecta **3 tipos de modificaciones**, cada una con su propio patrón.

### Modificación 1 — Quitar uno

**Regex:** `PATRON_QUITAR_UNO` (captura corte opcional)

| El cliente escribe | Bot detecta | Acción |
|---|---|---|
| "quítame uno" | `tipo: "quitar_uno", corte: null` | Reduce el último ítem en 1 |
| "menos uno" | `tipo: "quitar_uno", corte: null` | Reduce el último ítem en 1 |
| "un taco menos" | `tipo: "quitar_uno", corte: null` | Reduce el último ítem en 1 |
| "quita un taco de carne" | `tipo: "quitar_uno", corte: "carne"` | Reduce específicamente el de carne |
| "uno menos de buche" | `tipo: "quitar_uno", corte: "buche"` | Reduce específicamente el de buche |
| "bájale uno" | ❌ no detecta | → Groq |

### Modificación 2 — Agregar más del mismo

**Regex:** `PATRON_AGREGAR_MAS` con captura de cantidad y corte opcional

| El cliente escribe | Bot detecta | Acción |
|---|---|---|
| "agrega 2 más de carne" | `tipo: "agregar_mas", cantidad: 2, corte: "carne"` | Suma 2 de carne |
| "agrégale otros 3" | `tipo: "agregar_mas", cantidad: 3` | Suma 3 al pedido |
| "ponme otros 2 de buche" | `tipo: "agregar_mas", cantidad: 2, corte: "buche"` | Suma 2 de buche |
| "súmame 1 de surtido" | `tipo: "agregar_mas", cantidad: 1, corte: "surtido"` | Suma 1 de surtido |
| "añade 3 tacos" | `tipo: "agregar_mas", cantidad: 3` | Suma 3 |
| "también quiero 2 de lengua" | `tipo: "agregar_mas", cantidad: 2, corte: "lengua"` | Suma 2 de lengua |
| "2 más" | `tipo: "agregar_mas", cantidad: 2` | Suma 2 |
| "quiero más" (sin número) | ❌ no detecta cantidad | → Groq |

### Modificación 3 — Cambiar corte

**Regex:** `PATRON_CAMBIAR_CORTE` — detecta cuatro construcciones

| El cliente escribe | Bot detecta | Acción |
|---|---|---|
| "cambia el buche por cuero" | `tipo: "cambiar_corte", de: "buche", por: "cuero"` | Reemplaza corte |
| "cámbiame la carne a lengua" | `tipo: "cambiar_corte", de: "carne", por: "lengua"` | Reemplaza corte |
| "en lugar de surtido ponme carne" | `tipo: "cambiar_corte", de: "surtido", por: "carne"` | Reemplaza corte |
| "en vez de cuero dame buche" | `tipo: "cambiar_corte", de: "cuero", por: "buche"` | Reemplaza corte |
| "mejor lengua que cuero" | `tipo: "cambiar_corte", de: "cuero", por: "lengua"` | Reemplaza corte |
| "sin surtido, que sea puro buche" | ❌ no detecta | → Groq |

---

## Capa 5 — Edición de Campos del Formulario

Desde cualquier punto del flujo, el cliente puede pedir cambios a sus datos. Esta capa detecta el campo específico que quiere editar.

**Función:** `detectarEdicion(texto)` en `estado/campos.js`

Maneja **dos modos por campo**: con valor explícito (no requiere respuesta) o sin valor (el bot pregunta).

### Tabla completa de ediciones

| El cliente escribe | Campo detectado | Modo | Acción del bot |
|---|---|---|---|
| "cambia mi nombre a Juan Lopez" | `nombre` | directo | Actualiza sin preguntar |
| "cambia mi nombre" | `nombre` | pregunta | "¿Cuál es tu nuevo nombre completo?" |
| "cambia mi teléfono a 3312345678" | `telefono` | directo | Actualiza sin preguntar |
| "cambia mi teléfono" | `telefono` | pregunta | "¿Cuál es tu nuevo teléfono?" |
| "cambia mi correo a juan@correo.com" | `correo` | directo | Actualiza sin preguntar |
| "cambia el método a transferencia" | `metodo` | directo | Actualiza sin preguntar |
| "cambia el método de pago" | `metodo` | pregunta | "¿Cómo vas a pagar?" |
| "cambia la hora a 10am" | `hora` | directo | Actualiza sin preguntar |
| "cambia la hora" | `hora` | pregunta | "¿A qué hora deseas tu pedido?" |
| "cambia la calle a Reforma 415" | `calle` | directo | Actualiza sin preguntar |
| "cambia la colonia a Centro" | `colonia` | directo | Actualiza sin preguntar |
| "quita los tacos" | `quitar_item` | directo | Inicia flujo de quitar ítem |
| "elimina las tortas" | `quitar_item` | directo | Inicia flujo de quitar ítem |

**Lo que NO detecta:**
- "actualiza mi info" → demasiado vago ❌
- "ponle otro número" (sin especificar cuál campo) ❌
- "modifica mi pedido" (sin especificar qué) → Groq ❌

---

## Capa 6 — Parser Local de Pedidos

El sistema más sofisticado del bot. Analiza si un mensaje contiene un **pedido concreto** y decide si puede procesarlo solo o si necesita a Groq.

**Función:** `parsearPedidoSimple(texto)` en `pedidoParser.js`

### Sistema de Score

Antes de parsear, el bot calcula un puntaje de "claridad" del mensaje:

```
PENALIZACIONES (señales de que el pedido es complejo):
  Contiene "para mí", "separado", "en pares", "cada uno", "otro plato"  → −10 pts
  Contiene "de X en X", "alternado", "intercalado"                       → −10 pts
  NOTE: "y aparte" ya NO penaliza — se limpia en preprocesamiento

BONIFICACIONES (señales de que el pedido es claro):
  Contiene un número ("3", "5", "500")                              → +2 pts
  Contiene "taco(s)" o "torta(s)"                                   → +2 pts
  Contiene gramos ("350g", "350 gramos")                            → +2 pts
  Contiene una medida fraccionada ("medio kilo", "un cuarto")       → +2 pts
  Contiene un corte ("surtido", "carne", "buche", "cuero", "lengua")→ +2 pts

UMBRAL: Score >= 4 → parsear local. Score < 4 → enviar a Groq.
```

### Medidas reconocidas por el parser local

| El cliente escribe | Gramos equivalentes |
|---|---|
| "un cuarto", "1/4", "250g" | 250 g |
| "medio kilo", "medio", "1/2", "500g" | 500 g |
| "tres cuartos", "3/4", "750g" | 750 g |
| "un kilo", "1kg", "1000g" | 1000 g |
| "500 gramos" | 500 g |
| "350 gramos" | 350 g |

### Ejemplos de Score y decisión

| El cliente escribe | Score | Decisión |
|---|---|---|
| "3 tacos de surtido" | número +2, tacos +2, surtido +2 = **+6** | ✅ Parser local |
| "medio kilo de buche" | medida +2, buche +2 = **+4** | ✅ Parser local |
| "350g de lengua" | gramos +2, lengua +2 = **+4** | ✅ Parser local |
| "$200 de surtido" | número +2, surtido +2 = **+4** | ✅ Parser local |
| "3 tacos de carne y 2 de buche" | número +2, tacos +2, carne+buche +2 = **+6** | ✅ Parser local |
| "3 tacos de carne y aparte una coca" | separa coca, "y aparte" se limpia → número +2, tacos +2, carne +2 = **+6** | ✅ Parser local |
| "treinta y dos tacos de surtido" | textoANumero→"32 tacos de surtido" → número +2, tacos +2, surtido +2 = **+6** | ✅ Parser local |
| "mitad carne mitad buche" | penalización −10 = **−10** | ❌ → Groq |
| "de 2 en 2 carne y buche" | penalización −10 = **−10** | ❌ → Groq |
| "alternados de carne y cuero" | penalización −10 = **−10** | ❌ → Groq |
| "quiero tacos" | tacos +2 = **+2** | ❌ → Groq (falta cantidad) |
| "dame algo de carne" | carne +2 = **+2** | ❌ → Groq |

### Qué SÍ puede parsear solo

```
"3 tacos de carne"               → { presentacion: "taco", cantidad: 3, corte: "carne" }
"5 tortas de buche"              → { presentacion: "torta", cantidad: 5, corte: "buche" }
"medio kilo de surtido"          → { presentacion: "gramos", gramos: 500, corte: "surtido" }
"$150 de cuero"                  → { presentacion: "pesos", monto: 150, corte: "cuero" }
"3 tacos de carne y 2 de buche"  → [2 ítems separados]
"500g de lengua"                 → { presentacion: "gramos", gramos: 500, corte: "lengua" }
```

### Qué NO puede parsear solo (requiere Groq)

```
"mitad carne mitad buche"         ← combinación dentro del mismo ítem
"de 2 en 2 carne y cuero"         ← distribución alternada
"unos 3 tacos más o menos"        ← cantidad vaga
"¿qué me recomiendas?"            ← pregunta abierta
"lo mismo de siempre"             ← referencia a historial
"un poco de cada uno"             ← cantidad indefinida
"para 2 personas"                 ← cantidad en personas, no unidades
```

---

## Capa 7 — Detección de Ítems Incompletos

Cuando el parser detecta que el pedido tiene información pero le falta algo, activa flujos de completado en lugar de fallar.

### Sin Corte — `detectarSinCorte()`

**Cuándo activa:** El cliente dijo cuántos y en qué formato, pero no el corte.

| El cliente escribe | Bot detecta | Bot pregunta |
|---|---|---|
| "3 tacos" | cantidad: 3, tipo: taco, sin corte | "¿3 tacos de qué corte?" |
| "5 tortas" | cantidad: 5, tipo: torta, sin corte | "¿5 tortas de qué corte?" |
| "medio kilo" | 500g, sin corte | "¿500g de qué corte?" |
| "2 de eso" | ambiguo | → Groq |

**Cortes válidos que reconoce:**

```
surtido  (alias: surtida, mixto, mixta)
carne    (alias: carner, masiza, maciza, carnita, carnitas)
buche    (alias: buchito, buchon, buchones)
cuero    (alias: cueros, cueritos, cuerito)
lengua   (alias: lenguita, lenguitas)
```

**Nota:** "surtido especial" es un producto interno (combinación de 2+ cortes); **no aparece** en las listas de cortes mostradas al cliente ni en la caché de detección.

### Sin Tipo — `detectarSinTipo()`

**Cuándo activa:** El cliente dijo cuántos y de qué corte, pero no si quiere tacos, tortas, o gramos.

| El cliente escribe | Bot detecta | Bot pregunta |
|---|---|---|
| "5 de carne" | cantidad: 5, corte: carne, sin tipo | "¿5 tacos o tortas de carne?" |
| "3 de buche" | cantidad: 3, corte: buche, sin tipo | "¿3 tacos o tortas de buche?" |
| "dame cuero" | sin cantidad clara | → Groq |

---

## Capa 8 — Confirmación y Cancelación

Patrones simples que se verifican en momentos específicos del flujo.

### Palabras de confirmación

Regex compilado en `mensajes.js` (variable `palabrasConfirmacion`):

| El cliente escribe | Bot detecta |
|---|---|
| "sí", "si", "ok", "vale", "dale" | confirmación ✅ |
| "listo", "sale", "ándale", "órale" | confirmación ✅ |
| "confirmo", "confirmado", "correcto" | confirmación ✅ |
| "claro", "perfecto", "de una" | confirmación ✅ |
| "sip", "sep", "simón" | confirmación ✅ |
| "este..." (duda) | ❌ no confirma |
| "sí pero..." (condicional) | ❌ no confirma → Groq |
| "creo que sí" | ❌ no confirma → Groq |

### Palabras de cancelación

Regex directo: `/\bcancelar?\b/i`

| El cliente escribe | Bot detecta |
|---|---|
| "cancelar" | cancelación ✅ |
| "cancela" | cancelación ✅ |
| "cancela mi pedido" | cancelación ✅ |
| "ya no quiero" | ❌ no detecta → Groq |
| "olvídalo" | ❌ no detecta → Groq |
| "déjame pensar" | ❌ no detecta → Groq |

---

## Capa 9 — Formulario Progresivo (extracción de datos)

Mientras el cliente llena sus datos de pedido, el bot extrae información del texto libre. No necesita que el cliente use un formato específico.

**Función:** `interpretarCampos(texto)` en `estado/campos.js`

| El cliente escribe | Campo extraído | Validación |
|---|---|---|
| "me llamo Juan López" | `nombre: "Juan", apellido: "López"` | >= 2 caracteres, no es palabra reservada |
| "Juan" | `nombre: "Juan"` | Solo nombre |
| "3312345678" | `telefono: "3312345678"` | 10 dígitos, primer dígito 2-9 (LADA mexicano) |
| "+523312345678" | `telefono: "3312345678"` | Detecta prefijo +52/52, extrae últimos 10 |
| "331-234-5678" | `telefono: "3312345678"` | Detecta separadores - . y espacio |
| "juan@correo.com" | `correo: "juan@correo.com"` | Formato email válido |
| "efectivo" | `metodo: "efectivo"` | efectivo / tarjeta / transferencia |
| "con transferencia" | `metodo: "transferencia"` | idem |
| "a las 10" | `hora: "10:00 a.m."` | Rango 7:00 a 12:30 |
| "10am" | `hora: "10:00 a.m."` | idem |
| "Reforma 415" | `calle: "Reforma 415"` | Contiene número |
| "col. Centro" | `colonia: "Centro"` | Después de "col." |
| "entre calle Juárez y Morelos" | `referencia: "..."` | Palabras clave de referencia |

**Palabras que el bot ignora como nombre** (PALABRAS_NO_NOMBRE):  
`efectivo`, `tarjeta`, `transferencia`, `mostrador`, `domicilio`, `recoger`, `colonia`, `calle`, `correo`, `referencia`, `si`, `no`, `ok`, `va`, `dale`, y similares.

**Lo que NO puede extraer:**
- "mi cel es el treinta y tres..." (número escrito en palabras) ❌
- Dirección sin número: "vivo en Reforma, en la casa blanca" ❌ (necesita número de calle)
- Hora fuera de rango: "a las 2pm" → bot avisa que está fuera de horario

---

## Capa 10 — Groq (IA, último recurso)

Cuando ninguna capa anterior pudo identificar la intención, el mensaje completo se envía a Groq con el modelo `llama-3.3-70b-versatile`.

**Qué le llega a Groq:**
1. Un prompt de sistema construido dinámicamente (`buildPrompt()`)
2. El historial de conversación completo del cliente
3. El mensaje actual

**Qué puede hacer Groq que el bot local no puede:**
- Entender pedidos con distribución: "mitad carne mitad buche"
- Responder preguntas abiertas: "¿qué me recomiendas?"
- Manejar ambigüedades: "dame lo mismo pero más"
- Procesar referencias: "ponme lo que pedí la vez pasada"
- Responder preguntas no previstas

**Qué NO hace Groq en este bot:**
- Tomar decisiones sobre el formulario (eso lo hace el parser local)
- Responder FAQs (las responde el sistema local con datos de BD)
- Confirmar pedidos (eso lo hace el guard de confirmación)

**Respuestas que Groq devuelve:**
- JSON de pedido: `{ "tipo": "pedido", "items": [...] }`
- JSON de pregunta: `{ "tipo": "pregunta", "mensaje": "..." }`
- JSON de info: `{ "tipo": "info", "mensaje": "..." }`
- Texto libre: el bot lo envía tal cual si no es JSON válido

---

## Resumen del pipeline completo

```
Mensaje del cliente
        │
        ▼
[CAPA 0] Normalización de texto (quita acentos, minúsculas)
        │
        ▼
[CAPA 1] Guard de contexto → ¿está en flujo activo?
        │ SÍ: bloquea FAQs, continúa al bloque de estado actual
        │ NO: continúa
        ▼
[CAPA 2] ¿Es pregunta frecuente (FAQ)?
        │ SÍ: responde sin Groq, termina
        │ NO: continúa
        ▼
[CAPA 3] ¿Indica tipo de entrega (domicilio/mostrador)?
        │ SÍ: registra y avanza el flujo
        │ NO/Ambiguo: bot pregunta
        ▼
[CAPA 4] ¿Es modificación a pedido existente?
        │ SÍ: aplica cambio sin Groq, termina
        │ NO: continúa
        ▼
[CAPA 5] ¿Es edición de campo de formulario?
        │ SÍ: actualiza dato sin Groq, termina
        │ NO: continúa
        ▼
[CAPA 6] ¿Es pedido? Calcular score
        │ Score >= 4: parsear local, termina
        │ Score < 4: continúa
        ▼
[CAPA 7] ¿Tiene cantidad/tipo pero falta corte o tipo?
        │ SÍ: pregunta el dato faltante, termina
        │ NO: continúa
        ▼
[CAPA 8] ¿Es confirmación o cancelación?
        │ SÍ: procesa acción, termina
        │ NO: continúa
        ▼
[CAPA 10] Groq — casos complejos y ambiguos
```

---

## Cobertura estimada por capa

| Capa | Tipo de intención | % del tráfico real |
|---|---|---|
| FAQs (Capa 2) | Preguntas informativas | ~20% |
| Tipo de entrega (Capa 3) | "domicilio"/"mostrador" | ~10% |
| Modificaciones (Capa 4) | Cambios a pedido activo | ~5% |
| Edición de campos (Capa 5) | Corrección de datos | ~5% |
| Parser local (Capa 6) | Pedidos claros | ~35% |
| Sin corte / sin tipo (Capa 7) | Pedidos incompletos | ~10% |
| Confirmación/cancelación (Capa 8) | Cierre de pedido | ~10% |
| **Groq (Capa 10)** | **Casos complejos** | **~5%** |

> El bot maneja aproximadamente el **95% de las interacciones sin consultar Groq**.

---

## Limitaciones conocidas del sistema local

| Situación | Por qué falla | Capa que lo recibe |
|---|---|---|
| "lo mismo de siempre" | `detectarRepetirPedido` lo maneja; Groq solo si no hay historial en BD | Parser/BD |
| "para dos personas" | Cantidad en personas, no unidades | Groq |
| "de a poco de todo" | Cantidades vagas | Groq |
| "ponme lo que recomiendas" | Requiere razonamiento | Groq |
| "cambia todo a buche" | Modificación global del pedido | Groq |
| "¿trabajan los domingos?" | FAQ de horario no lo contempla | Groq |
| "¿llegan hasta el fraccionamiento X?" | Zona específica → no en BD | Groq |
| "número de cel: trescientos treinta..." | Número en palabras | No detecta |
| Dirección sin número de calle | Validación requiere número | No detecta |
