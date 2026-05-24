# Estado en Memoria y Persistencia de Sesiones

Este documento describe cómo el bot rastrea el estado de cada conversación activa, cómo persiste esa información entre reinicios y cómo gestiona el timeout de inactividad.

---

## Principio fundamental

**Todo el estado de conversaciones activas vive en Maps de JavaScript en memoria RAM.**

No hay consultas a la BD durante el flujo normal de un mensaje. Cada operación de estado es O(1) y sub-microsegundo. La BD solo interviene en dos momentos:
1. Al cambiar el estado → `persistirEstado()` lo serializa a `sesiones_activas`
2. Al reiniciar el bot → `restaurarTodasLasSesiones()` restaura todos los Maps

---

## Mapa completo de estructuras de estado

Archivo fuente: `src/estado/maps.js`

### Conjuntos (Set) — estado binario por número de cliente

| Set | Significado cuando contiene el número |
|---|---|
| `clientesNuevos` | El bot ya envió el saludo; cliente en proceso de primera configuración |
| `datosRecibidos` | El formulario progresivo fue completado |
| `correoPreguntas` | Se preguntó por correo al menos una vez (para no preguntar dos veces) |
| `referenciaPreguntas` | Se preguntó por referencia de dirección |
| `clientesPreventa` | Cliente en flujo de preventa (fuera de horario) |

### Maps de flujo principal — valor = datos del estado

| Map | Tipo de valor | Descripción |
|---|---|---|
| `tipoEntregaCliente` | `"domicilio"` \| `"mostrador"` | Tipo de entrega seleccionado |
| `datosCampos` | Object con campos del formulario | Datos capturados del formulario progresivo |
| `datosAcumulados` | Object | Ítems del pedido acumulados durante la toma |
| `pedidoJSONActual` | Object | JSON del pedido en construcción |
| `horaEntregaPreventa` | string (hora) | Hora de entrega para pedidos de preventa |

### Maps de estados bloqueantes — activos = bot esperando respuesta específica

| Map | Tipo de valor | El bot espera |
|---|---|---|
| `esperandoCorte` | Object del pedido | El corte de carne para un ítem |
| `esperandoTipoItem` | `{ cantidad, corte }` | Si son tacos o tortas |
| `esperandoConfirmacionItem` | `{ lineas, ... }` | Confirmación del ítem ("sí/no") |
| `esperandoAgregarMas` | string (texto del ítem) | Si el cliente agrega más o termina |
| `esperandoConfirmacionDatos` | Object con datos del cliente | Confirmación de datos de cliente frecuente |
| `esperandoEdicion` | string (campo a editar) | El nuevo valor de un campo editado |
| `esperandoMotivoCancelacion` | string (contexto) | El motivo de la cancelación |

### Maps de cierre del flujo

| Map | Tipo de valor | Descripción |
|---|---|---|
| `resumenPendiente` | `{ texto, esTransferencia, datos... }` | Resumen generado esperando confirmación final |
| `esperandoCaptura` | `{ pedidoId, datos... }` | Esperando comprobante de transferencia |
| `pendientesConfirmacion` | `{ pedidoId, datos... }` | Pedido registrado esperando `!confirmar` del admin |
| `pedidosConfirmados` | Object | Pedido ya confirmado (para referencia) |

### Otros Maps

| Map | Descripción |
|---|---|
| `conversaciones` | Historial de mensajes por número (para contexto de Groq) |
| `ultimaActividad` | Timestamp del último mensaje recibido (alimenta timeout) |
| `recordatorioEnviado` | Timestamp del recordatorio enviado (evita duplicados) |
| `telefonosReales` | JID → número de 10 dígitos (cache de BD) |
| `ultimoPedido` | Número → JSON del último pedido (cache en memoria) |

---

## Cómo se usa un Map de estado

Ejemplo de ciclo de vida del Map `esperandoCorte`:

```
1. Cliente pide "2 tacos" (sin mencionar corte)
   → handleSinCorte detecta que falta el corte
   → esperandoCorte.set(numero, pedidoObj)
   → persistirEstado(numero)
   → bot pregunta "¿Qué corte quieres?"

2. Cliente responde "buche"
   → handleEsperandoCorte detecta esperandoCorte.has(numero)
   → lee el pedidoObj: esperandoCorte.get(numero)
   → aplica el corte
   → esperandoCorte.delete(numero)
   → esperandoConfirmacionItem.set(numero, itemConfirmado)
   → persistirEstado(numero)
   → bot muestra "2 tacos de buche — $60. ¿Es correcto?"
```

---

## `limpiarTodo(numero)` — `src/estado/campos.js`

Borra **todos** los Maps del cliente de una sola vez. Se llama en:
- Confirmación final exitosa
- Cancelación
- Timeout de 45 minutos

```javascript
function limpiarTodo(numero) {
  [clientesNuevos, datosRecibidos, correoPreguntas, referenciaPreguntas,
   clientesPreventa].forEach(s => s.delete(numero));
  [tipoEntregaCliente, datosCampos, datosAcumulados, pedidoJSONActual,
   horaEntregaPreventa, resumenPendiente, esperandoCaptura,
   esperandoCorte, esperandoTipoItem, esperandoConfirmacionItem,
   esperandoAgregarMas, esperandoConfirmacionDatos, esperandoEdicion,
   esperandoMotivoCancelacion, pendientesConfirmacion, conversaciones,
   ultimaActividad, recordatorioEnviado].forEach(m => m.delete(numero));
}
```

---

## `enFlujoActivo(numero)` — `src/handlers/flujos/utils.js`

Retorna `true` si el cliente tiene al menos un estado activo que requiere continuidad. Se usa en el timeout de inactividad para decidir si limpiar la sesión o no.

```javascript
function enFlujoActivo(numero) {
  return resumenPendiente.has(numero) ||
         esperandoCaptura.has(numero) ||
         esperandoConfirmacionItem.has(numero) ||
         esperandoAgregarMas.has(numero) ||
         esperandoCorte.has(numero) ||
         esperandoTipoItem.has(numero) ||
         esperandoConfirmacionDatos.has(numero) ||
         esperandoEdicion.has(numero) ||
         pendientesConfirmacion.has(numero);
}
```

---

## Persistencia de sesiones

### Flujo de escritura

Cada vez que el estado de un cliente cambia, se llama `persistirEstado(numero)`:

```
persistirEstado(numero)
        │
        ├─► serializarEstado(numero)
        │   └─ itera todos los Maps, copia los valores del cliente a un objeto JSON
        │
        ├─► Si el objeto está vacío → eliminarSesion(numero)
        │   └─ DELETE FROM sesiones_activas WHERE numero = ?
        │
        └─► guardarSesion(numero, estadoJSON, historialJSON)
            └─ INSERT OR REPLACE INTO sesiones_activas (numero, estado_json, historial_json, actualizado_en)
```

### Flujo de restauración (al arrancar)

```
restaurarTodasLasSesiones()
        │
        ├─► limpiarSesionesAntiguas(48)
        │   └─ DELETE FROM sesiones_activas WHERE actualizado_en < now - 48h
        │
        └─► cargarTodasLasSesiones()
            └─ SELECT * FROM sesiones_activas
                    │
                    ▼ para cada fila:
            restaurarEstado(numero, estadoJSON, historial)
            └─ reconstruye todos los Maps para ese número
```

### Mapa de serialización/restauración

Todos los Maps del sistema se serializan. La tabla muestra la clave JSON usada:

| Estructura | Clave JSON en sesiones_activas |
|---|---|
| `clientesNuevos.has()` | `clienteNuevo: true` |
| `clientesPreventa.has()` | `preventa: true` |
| `datosRecibidos.has()` | `datosRecibidos: true` |
| `correoPreguntas.has()` | `correoPreguntas: true` |
| `referenciaPreguntas.has()` | `referenciaPreguntas: true` |
| `horaEntregaPreventa.get()` | `horaEntrega` |
| `resumenPendiente.get()` | `resumenPendiente` |
| `esperandoCaptura.get()` | `esperandoCaptura` |
| `datosAcumulados.get()` | `datosAcumulados` |
| `datosCampos.get()` | `datosCampos` |
| `pedidosConfirmados.get()` | `pedidoConfirmado` |
| `esperandoMotivoCancelacion.get()` | `esperandoCancelacion` |
| `esperandoConfirmacionItem.get()` | `esperandoConfirmItem` |
| `esperandoAgregarMas.get()` | `esperandoAgregarMas` |
| `pedidoJSONActual.get()` | `pedidoJSONActual` |
| `esperandoConfirmacionDatos.get()` | `esperandoConfirmDatos` |
| `tipoEntregaCliente.get()` | `tipoEntregaCliente` |
| `esperandoEdicion.get()` | `esperandoEdicion` |
| `esperandoTipoItem.get()` | `esperandoTipoItem` |
| `pendientesConfirmacion.get()` | `pendienteConfirmacion` |
| `conversaciones.get()` | historial_json (columna separada) |

---

## Timeout bifásico de inactividad

Archivo fuente: `src/handlers/flujos/utils.js`

Un `setInterval` de 10 minutos revisa todos los clientes en `ultimaActividad`.

```
Cada 10 minutos:
    Para cada cliente en ultimaActividad:
        inactivo = ahora - ultimaActividad[cliente]

        ┌─────────────────────────────────────────┐
        │ inactivo > 45 min (TIMEOUT_SESION_MS)?  │
        │                                         │
        │ Sí → estaActivo?                        │
        │       Sí → limpiarTodo() + eliminarSesion()
        │       No → omitir                       │
        │                                         │
        │ inactivo > 30 min Y no se envió ya un   │
        │ recordatorio (recordatorioEnviado)?      │
        │                                         │
        │ Sí → estaActivo? Y client disponible?   │
        │       Sí → _textoRecordatorio()         │
        │             → sendMessage() proactivo   │
        │             → recordatorioEnviado.set() │
        │       No → omitir                       │
        └─────────────────────────────────────────┘
```

### `_textoRecordatorio(numero)`

Genera un mensaje contextual según el estado activo del cliente:

| Estado activo | Mensaje enviado |
|---|---|
| `resumenPendiente` | Muestra el resumen completo + "¿Lo confirmamos?" |
| `esperandoConfirmacionItem` | Muestra el ítem pendiente + "¿Es correcto?" |
| `esperandoAgregarMas` | "¿Sigues ahí? ¿Deseas agregar algo más?" |
| `esperandoCorte` | Describe el ítem + "¿Cuál prefieres? Surtido, Carne, Buche..." |
| `esperandoTipoItem` | Menciona cantidad y corte + "¿serían tacos o tortas?" |
| `datosCampos` o `clientesNuevos` | "Estabas en proceso de hacer tu pedido. ¿Deseas continuar?" |
| Ninguno | null (no se envía recordatorio) |

### Limpieza del recordatorio

Cuando el cliente responde (cualquier mensaje), `mensajes.js` ejecuta:
```javascript
recordatorioEnviado.delete(clienteNumero);
```

Esto permite que, si el cliente vuelve a quedar inactivo 30 minutos más, reciba un nuevo recordatorio.

---

## Formulario progresivo — `src/estado/campos.js`

El formulario captura los datos del cliente campo por campo (o todos de una vez).

### `siguienteCampoFaltante(numero)`

Determina cuál es el próximo campo que falta preguntar:

```
Orden de campos:
1. nombre         → siempre requerido
2. telefono       → siempre requerido
3. correo         → opcional (puede saltarse)
4. calle_numero   → solo si tipoEntrega === "domicilio"
5. colonia        → solo si tipoEntrega === "domicilio"
6. referencia     → solo si domicilio (opcional)
7. metodo_pago    → siempre requerido
8. hora_entrega   → solo si clientesPreventa
```

### `interpretarCampos(numero, texto)`

Analiza un mensaje y extrae **todos los campos que pueda**, no solo el siguiente esperado.

Esto permite que el cliente mande todo de un golpe:
```
"Juan López, 3312345678, Av. del Sol 123, Colonia Centro, efectivo"
→ extrae: nombre="Juan", apellido="López", telefono="3312345678",
           calle_numero="Av. del Sol 123", colonia="Centro", metodo_pago="efectivo"
```

### Extracción de teléfono — `extraerTelefono(texto)`

Acepta todos los formatos mexicanos comunes:

| Formato | Ejemplo | Resultado |
|---|---|---|
| 10 dígitos seguidos | "3312345678" | "3312345678" |
| Con separadores | "331-234-5678", "331 234 5678" | "3312345678" |
| Con +52 | "+5213312345678" | "3312345678" |
| Con LADA 52 | "523312345678" | "3312345678" |

**Validación:** El primer dígito del número de 10 dígitos debe ser 2-9 (LADAs mexicanas válidas).

### `extraerTelefonoDeJID(jid)`

Extrae los últimos 10 dígitos del JID de WhatsApp:
```
"5213312345678@c.us" → jid.slice(0, jid.indexOf("@")).slice(-10) → "3312345678"
```

### División de nombre compuesto

Al capturar el nombre, si el cliente manda nombre y apellido juntos:

| Palabras en el texto | Resultado |
|---|---|
| 1 palabra | `nombre = "Juan"`, `apellido = null` |
| 2 palabras | `nombre = "Juan"`, `apellido = "López"` |
| 3+ palabras | `nombre = "Juan López"`, `apellido = "Ramírez Torres"` |

**Palabras geográficas excluidas:** "calle", "colonia", "avenida", "boulevard", "privada", "fraccionamiento", "cañadas", "norte", "sur", "oriente", "poniente" — para no capturar accidentalmente parte de la dirección como nombre.

---

## Diagrama de vida de una sesión

```
Cliente escribe por primera vez
        │
        ▼
clientesNuevos.add(numero)        ← Set
        │
        ▼
tipoEntregaCliente.set(numero, ?) ← Map (al detectar domicilio/mostrador)
        │
        ▼
datosCampos.set(numero, {...})     ← Map (formulario progresivo)
        │
        ▼
datosAcumulados.set(numero, {...}) ← Map (ítems del pedido)
        │
        ▼
resumenPendiente.set(numero, {...})← Map (resumen generado)
        │
        ▼
[confirmación del pedido]
        │
        ▼
limpiarTodo(numero)               ← borra todos los Maps
eliminarSesion(numero)            ← borra de sesiones_activas
clientesNuevos.add(numero)        ← el cliente puede pedir de nuevo
```
