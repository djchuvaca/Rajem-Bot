# NLU Local y Sistema de Parser

Este documento describe el cerebro del bot: cómo interpreta el lenguaje natural de los clientes sin depender de IA externa, y cuándo y cómo escala al fallback de Groq.

---

## Visión general del pipeline NLU

```
Mensaje del cliente
        │
        ▼
┌────────────────────┐
│  Preprocesamiento  │  textoANumero() + preprocesarCantidades()
└────────┬───────────┘
         │
         ▼
┌────────────────────┐
│  Rutas especiales  │  mitad/mitad, todo-menos-corte, multilinea
└────────┬───────────┘
         │ ninguna coincidió
         ▼
┌────────────────────┐
│   calcularScore()  │  sistema de puntos → ¿parsear o no?
└────────┬───────────┘
         │ score ≥ 4
         ▼
┌────────────────────┐
│  dividirEnItems()  │  separa múltiples ítems en un mensaje
└────────┬───────────┘
         │
         ▼
┌────────────────────┐
│   parsearItem()    │  extrae presentación, cantidad, corte
└────────┬───────────┘
         │ score < 4 o parse falló
         ▼
┌────────────────────┐
│   Groq API         │  llama-3.3-70b-versatile (fallback)
└────────────────────┘
```

---

## Archivo fuente: `src/handlers/pedidoParser.js`

Funciones exportadas:
- `parsearPedidoSimple(texto)` — parser principal
- `detectarSinCorte(texto)` — detecta pedido sin corte especificado
- `detectarSinTipo(texto)` — detecta pedido sin taco/torta especificado
- `detectarPreguntaFrecuente(texto)` — detecta la primera FAQ que coincide (retorna `{tipo, producto?}`)
- `detectarTodasPreguntasFrecuentes(texto)` — detecta **todas** las FAQs del mensaje (multi-intent); retorna array deduplicado
- `detectarModificacion(texto)` — detecta modificar/quitar/cambiar ítem
- `detectarRepetirPedido(texto)` — detecta "lo mismo de siempre"
- `calcularScore(texto)` — retorna el score numérico del mensaje
- `getCortes()` — retorna el mapa de cortes desde BD (con caché TTL 60s)
- `getCortesRegex()` — retorna la regex de cortes compilada (caché TTL 60s, misma ventana que `getCortes`)
- `invalidarCacheCortes()` — fuerza recarga de cortes, regex cache y sinónimos
- `normalizar(texto)` — quita tildes, pasa a minúsculas

---

## Paso 1: Preprocesamiento

Antes de cualquier análisis, el texto se normaliza en dos funciones encadenadas.

### `preprocesarCantidades(texto)`

Elimina palabras coloquiales que anteceden a un número y que confunden el parser:

| Expresión eliminada | Ejemplo entrada | Resultado |
|---|---|---|
| "y aparte" | "3 tacos de carne y aparte" | "3 tacos de carne" |
| "unos X" | "unos 3 tacos" | "3 tacos" |
| "como X" | "como 4 de buche" | "4 de buche" |
| "nada más X" | "nada más 2 tacos" | "2 tacos" |
| "solo X" | "solo 1 surtido" | "1 surtido" |
| "tan solo X" | "tan solo 2" | "2" |

**Nota sobre "y aparte":** Esta frase antes forzaba Groq. Ahora se limpia como conector residual después de que `separarRefresco()` extrae la bebida. Ejemplo: "3 tacos de carne y aparte una coca" → separa la coca → limpia "y aparte" → parsea "3 tacos de carne" local.

### `textoANumero(texto)`

Convierte números escritos en palabras a dígitos. Permite que "tres tacos de carne" funcione igual que "3 tacos de carne".

| Texto | Conversión |
|---|---|
| "treinta y dos tacos" | "32 tacos" |
| "veinte y uno de buche" | "21 de buche" |
| "cuarenta y cinco" | "45" |
| "una docena de tacos" | "12 tacos" |
| "media docena" | "6 " |
| "un par de tortas" | "2 tortas" |
| "veinte", "quince", "doce"... | "20", "15", "12"... |
| "tres", "dos", "uno"... | "3", "2", "1"... |
| "un taco", "una torta" | "1 taco", "1 torta" |

**Compuestos (DECENA + "y" + UNIDAD):** Se procesan antes que los simples para evitar conflictos. Soporta todas las decenas (20–90) con unidades 1–9.

---

## Paso 2: Caché de cortes desde BD

Los cortes (nombres de productos) se leen de la BD y se guardan en caché en memoria.

```
_cortesCache: Map   ← { "buche": "buche", "buchito": "buche", ... }
_cortesCacheTs: number
_CORTES_TTL: 60 000 ms
```

**`getCortes()`** — Si el caché tiene menos de 60 s → lo devuelve directamente. Si expiró → reconsulta la BD, reconstruye el mapa con alias coloquiales y lo guarda.

**Alias coloquiales incluidos automáticamente:**

| Nombre en BD | Alias que lo mapean |
|---|---|
| carne | carner, masiza, maciza, carnita, carnitas |
| buche | buchito, buchon, buchones |
| cuero | cueros, cueritos, cuerito |
| lengua | lenguita, lenguitas |
| surtido | surtida, mixto, mixta |

**`invalidarCacheCortes()`** — Pone `_cortesCache = null`. Se llama desde el panel admin al crear, editar o eliminar un producto, para que el bot refleje los cambios inmediatamente.

---

## Paso 3: Rutas especiales (antes del score)

Antes de calcular el score, se intenta parsear con patrones especializados.

### Mitad/Mitad — `parsearMitadMitad(texto)`

**Detecta:** "mitad surtido y mitad carne", "medio buche y medio cuero"

**Resultado:** Un ítem con `corte: "surtido, carne"` (string con los dos cortes separados por coma).

**Ejemplo:**
```
"4 tacos, mitad surtido y mitad buche"
→ { tipo: "pedido", items: [{ presentacion: "taco", cantidad: 4, corte: "surtido, buche" }] }
```

### Todo Menos Corte — `parsearTodoMenosCorte(texto)`

**Detecta:** "de todo menos buche", "surtido sin carne"

**Resultado:** Un ítem con todos los cortes disponibles excepto el excluido.

**Ejemplo:**
```
"3 tacos de todo menos lengua"
→ { tipo: "pedido", items: [{ presentacion: "taco", cantidad: 3, corte: "surtido, carne, buche, cuero" }] }
```

### Multi-línea — `parsearPedidoMultiLinea(texto)`

**Detecta:** Mensajes donde cada ítem está en su propia línea (separados por `\n`).

**Cómo funciona:** Divide por saltos de línea y llama a `parsearPedidoSimple` en cada línea. Si **todas** las líneas parsean correctamente, combina los ítems. Si alguna falla, retorna null (→ Groq).

**Ejemplo:**
```
"3 tacos de surtido
2 tortas de carne
1 medio kilo de buche"
→ { tipo: "pedido", items: [
     { presentacion: "taco", cantidad: 3, corte: "surtido" },
     { presentacion: "torta", cantidad: 2, corte: "carne" },
     { presentacion: "gramos", gramos: 500, corte: "buche" }
   ]}
```

---

## Paso 4: Sistema de Score — `calcularScore(texto)`

El score determina si el bot intenta parsear localmente o deriva a Groq.

**Umbral:** `score ≥ 4` → parsear local. `score < 4` → Groq.

### Penalizaciones (score bajo → Groq)

| Condición | Puntos |
|---|---|
| Señales de complejidad (`para mí`, `para ella`, `separado`, `cada uno`, `otro plato`...) | −10 |
| Patrones de distribución (`de 3 en 3`, `alternado`, `uno de cada`...) | −10 |
| Multi-ítem donde no todas las partes tienen número | −2 |

**Nota:** `"y aparte"` fue eliminado de `SEÑALES_GROQ`. Ya no fuerza Groq — se limpia en preprocesamiento como conector residual de bebidas.

### Puntos positivos (score alto → parser local)

| Condición | Puntos |
|---|---|
| Contiene número (`\d+`) | +2 |
| Contiene "tacos" o "tortas" | +2 |
| Contiene gramos (`\d+g`) | +2 |
| Contiene medida conocida (medio kilo, cuarto, etc.) | +2 |
| Contiene corte conocido (exacto o fuzzy) | +2 |
| Multi-ítem donde **todas** las partes tienen número | +2 |

**Ejemplos:**

| Mensaje | Score | Ruta |
|---|---|---|
| "3 tacos de surtido" | 6 | Parser local |
| "quiero tacos" | 2 | Groq |
| "3 tacos y aparte 2 tortas para ella" | −4 | Groq |
| "medio kilo de buche" | 4 | Parser local |
| "algo rico" | 0 | Groq |

---

## Paso 5: Fuzzy Matching — `buscarCorteFuzzy(palabra)`

Detecta errores ortográficos en el nombre del corte.

**Algoritmo:** Distancia de Levenshtein entre la palabra ingresada y cada clave del mapa de cortes.

**Reglas de aceptación:**
1. La diferencia de longitud entre la palabra y la clave debe ser ≤ 2 caracteres
2. La distancia Levenshtein debe ser ≤ 2
3. No debe haber empate (dos cortes distintos a la misma distancia)
4. La palabra debe tener al menos 4 caracteres (para evitar falsos positivos)

**Ejemplos:**

| Entrada | Detecta |
|---|---|
| "surtuido" | surtido (dist 1) |
| "buche" | buche (dist 0, exacto) |
| "lengue" | lengua (dist 1) |
| "cuer" | null (longitud < 4) |
| "bu" | null (longitud < 4) |

---

## Paso 6: Extracción de ítem — `parsearItem(fragmento)`

Recibe un fragmento de texto (un ítem ya separado) e intenta extraer:
- `presentacion`: "taco", "torta", "gramos", "pesos"
- `cantidad` o `gramos` o `monto`
- `corte`: nombre del corte, o `_sinCorte: true` si no se detectó

**Orden de intentos:**

1. **Pieza numérica** (`3 tacos`, `2 tortas`) → `presentacion: "taco"|"torta"`, `cantidad`
2. **Medida conocida** (medio kilo, cuarto, etc.) → `presentacion: "gramos"`, `gramos`
3. **Gramos explícitos** (`300g`, `500 gramos`) → `presentacion: "gramos"`, `gramos`
4. **Monto en pesos** (número > 40 sin "tacos"/"tortas") → `presentacion: "pesos"`, `monto`

Si se detectó el ítem pero sin corte → activa `_sinCorte: true` → el bot preguntará el corte.

### Herencia de tipo (`parsearItemHeredado`)

Para mensajes multi-ítem donde el segundo ítem no repite el tipo:

```
"3 tacos de surtido, 2 de carne"
```

El "2 de carne" no dice "tacos", pero hereda el tipo del ítem anterior → `{ presentacion: "taco", cantidad: 2, corte: "carne" }`.

---

## Paso 7: División en ítems — `dividirEnItems(texto)`

Divide un mensaje con múltiples ítems en partes independientes.

**Separadores reconocidos:**
- Saltos de línea (`\n`)
- Coma seguida de "y" opcional (`, 2 tortas de carne`)
- " y también " (` y también 1 buche`)
- " y " seguido de número, "un", "medio" o "tres" (` y 3 de lengua`)

**Si solo hay un ítem** (sin separadores) → retorna el texto original en un array de un elemento.

---

## Detección de estados especiales

### `detectarSinCorte(texto)` → handleSinCorte

Retorna la `presentacion` del ítem si el pedido tiene cantidad pero sin corte especificado. El bot activa `esperandoCorte` y pregunta el corte.

### `detectarSinTipo(texto)` → handleSinTipo

Retorna `{ cantidad, corte }` si el pedido tiene corte y cantidad pero no dice "tacos" ni "tortas". El bot activa `esperandoTipoItem` y pregunta si son tacos o tortas.

**Ejemplo:** "2 de buche" → `{ cantidad: 2, corte: "buche" }` → "¿Serían tacos o tortas?"

### `detectarRepetirPedido(texto)` → handleRepetirPedido

Detecta frases como:
- "lo mismo de siempre"
- "lo mismo de antes" / "lo mismo de ayer" / "lo mismo de antier"
- "repite mi pedido"
- "lo de siempre"
- "igual que la vez pasada" / "igual que la última vez"
- "lo anterior"
- "el de ayer" / "el pedido de ayer" / "el pedido de antier"
- "el de la semana pasada"

### `detectarModificacion(texto)` → handleModificacionAgregarMas

Detecta tres tipos de modificación durante la toma del pedido:

| Tipo | Ejemplo | Resultado |
|---|---|---|
| quitar_uno | "quítame uno", "uno menos" | `{ tipo: "quitar_uno", corte: null }` |
| quitar_uno (específico) | "quita un taco de carne", "uno menos de buche" | `{ tipo: "quitar_uno", corte: "carne" }` |
| agregar_mas | "agrega 2 más de carne", "3 más" | `{ tipo: "agregar_mas", cantidad: 2, corte: "carne" }` |
| agregar_mas (nuevas frases) | "ponme otros 3 de buche", "súmame 2", "añade 1", "también quiero 4 de surtido" | `{ tipo: "agregar_mas", cantidad: N, corte: "..." }` |
| cambiar_corte | "cámbiame el buche por surtido" | `{ tipo: "cambiar_corte", de: "buche", por: "surtido" }` |
| cambiar_corte (nuevas frases) | "en lugar de carne ponme buche", "en vez de cuero dame lengua", "mejor surtido que carne" | `{ tipo: "cambiar_corte", de: "carne", por: "buche" }` |

**`quitar_uno` con corte específico:** Si el cliente especifica cuál ítem reducir ("quita uno de los de carne"), `aplicarQuitarUno(ordenTexto, corte)` busca primero la línea que contiene ese corte. Si no la encuentra, vuelve al comportamiento anterior (reduce el último ítem).

---

## Detección de FAQs — `detectarPreguntaFrecuente` y `detectarTodasPreguntasFrecuentes`

### `detectarPreguntaFrecuente(texto)` — Retorna la primera coincidencia

Retorna `{ tipo, producto? }` o `null`. Usada dentro de handlers de flujo activo (estados bloqueantes) donde solo se espera una FAQ por mensaje.

**Orden de detección (importa por solapamientos):**

1. `ya_en_camino` — "ya voy en camino", "ya estoy por llegar"
2. `despedida` — "gracias", "hasta luego", "bye"
3. `total_parcial` — ¿cuánto llevo?, ¿cuánto va mi cuenta?, ¿cuánto llevo acumulado?
4. `domicilio` — ¿hacen domicilio?, ¿cuánto cobran de envío?, ¿cuánto se tarda?
5. `precio` — ¿cuánto cuesta el taco?, ¿a cómo están?
6. `descripcion_corte` — ¿qué es el buche?, ¿cómo es la lengua?, ¿tienen cuero?
7. `pedido_listo` — ¿ya están listos mis tacos?, ¿ya quedó mi pedido? (respuesta: "te avisamos aquí") — **antes de `horario`** para evitar responder con horario de apertura
8. `horario` — ¿a qué hora abren?, ¿ya cerraron?, ¿siguen abiertos?
9. `menu` — ¿qué tienen?, ¿qué hay?, ¿qué venden?, menú
10. `ubicacion` — ¿dónde están?, dirección, ¿cómo llego?
11. `metodos_pago` — ¿cómo pago?, ¿aceptan tarjeta?

**Nota crítica:** `descripcion_corte` se evalúa **antes** que `menu` para que "¿qué es el buche?" no sea capturado como pregunta de menú. `pedido_listo` se evalúa **antes** que `horario` para que "¿ya están listos?" responda correctamente en lugar de mostrar el horario.

### `detectarTodasPreguntasFrecuentes(texto)` — Multi-intent

Retorna **array** con todas las FAQs detectadas en el mensaje, deduplicado por `tipo+producto`. Permite responder a preguntas compuestas.

**Ejemplo:**
```
"¿a qué hora abren y cuánto cuesta el domicilio?"
→ [{ tipo: "horario" }, { tipo: "domicilio" }]
→ Bot responde ambas preguntas y luego muestra el menú
```

Usada exclusivamente en `mensajes.js` para el bloque global de FAQs (cuando el cliente NO está en flujo activo).

---

## Fallback Groq — `handleGroqFallback`

Cuando el parser local no puede resolver el mensaje (score < 4, parse falló, o multi-ítem complejo), el sistema invoca la API de Groq.

**Modelo:** `llama-3.3-70b-versatile`

**Prompt de sistema:** construido por `buildPrompt()` (`src/prompts/index.js`). Incluye:
- Menú actual con precios
- Estado actual del cliente (tipo de entrega, ítems acumulados)
- Instrucciones de formato de respuesta en JSON

**Timeout y retry:**

```
1. Primera llamada: timeout de 15s, temperature: 0.2
   │ OK → usar respuesta
   │ Error o timeout
   ▼
2. Segundo intento: timeout de 15s, temperature: 0.35
   │ (temperatura más alta = respuesta diferente al reintento)
   │ OK → usar respuesta
   │ Error o timeout
   ▼
3. Mensaje de error al cliente: "No pude entender..."
```

**Cobertura esperada:** el parser local maneja ~95% de los mensajes. Groq recibe solo el ~5% restante (pedidos inusuales, lenguaje muy coloquial, combinaciones complejas).

---

## Señales que fuerzan el paso a Groq

Las siguientes expresiones en el mensaje desencadenan score −10 y fuerzan el paso a Groq independientemente de otros factores:

```
"para mí"           → pedido dividido por persona
"para ella/él"      → pedido dividido por persona
"separado"          → pedido en platos separados
"otro plato"        → idem
"en pares/tríos"    → distribución inusual
"plato de"          → pedido por plato
"cada uno"          → distribución por persona
"para cada"         → distribución por persona
```

**Eliminado de SEÑALES_GROQ:** `"y aparte"` ya no fuerza Groq. Se limpia en `preprocesarCantidades()` como conector residual de bebidas (caso habitual: "3 tacos y aparte una coca").

Distribución:
"de 2 en 2"         → distribución regular
"de a 3"            → distribución regular
"alternado"         → distribución alternada
"uno de cada"       → uno de cada tipo
"intercalado"       → distribución intercalada
```

Estos patrones indican un nivel de complejidad que requiere comprensión semántica real.

---

## Resumen del flujo de decisión

```
Mensaje: "3 tacos de surtido y 2 de carne"
                    │
                    ▼
     preprocesarCantidades() → sin cambios
     textoANumero()          → sin cambios
                    │
                    ▼
     parsearMitadMitad() → null (no es mitad/mitad)
     parsearTodoMenosCorte() → null
     tiene \n? → no → no multilinea
                    │
                    ▼
     calcularScore("3 tacos de surtido y 2 de carne")
     ├── tiene número: +2
     ├── tiene "tacos": +2
     ├── tiene "surtido" (corte): +2
     └── score = 6 ≥ 4 ✓
                    │
                    ▼
     dividirEnItems() → ["3 tacos de surtido", "2 de carne"]
                    │
                    ▼
     parsearItem("3 tacos de surtido")
     → { presentacion: "taco", cantidad: 3, corte: "surtido" }

     parsearItemHeredado("2 de carne", "taco")
     → { presentacion: "taco", cantidad: 2, corte: "carne" }
                    │
                    ▼
     { tipo: "pedido", items: [
         { presentacion: "taco", cantidad: 3, corte: "surtido" },
         { presentacion: "taco", cantidad: 2, corte: "carne" }
       ]}
```
