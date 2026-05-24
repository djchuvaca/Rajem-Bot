# Flujo Conversacional Completo

Este documento describe todos los estados posibles de una conversación, las transiciones entre ellos y las reglas que los gobiernan.

---

## Mapa de estados del sistema

```
                    ┌─────────┐
  primer mensaje    │         │
  ─────────────────►│ SALUDO  │
                    │         │
                    └────┬────┘
                         │ ¿domicilio o mostrador?
                         ▼
               ┌──────────────────┐
               │  TIPO_ENTREGA    │
               │  (detección NLU) │
               └────────┬─────────┘
                        │ detectado
              ┌─────────┴──────────┐
              ▼                    ▼
        ┌──────────┐        ┌──────────┐
        │Mostrador │        │Domicilio │
        └────┬─────┘        └────┬─────┘
             │                  │
             └─────────┬────────┘
                       ▼
              ┌─────────────────────┐
              │  ¿cliente frecuente?│
              └────────┬────────────┘
                       │
            ┌──────────┴───────────┐
            ▼                      ▼
    ┌──────────────┐      ┌────────────────────┐
    │  CONFIRMACIÓN│      │  FORMULARIO        │
    │  DATOS       │      │  PROGRESIVO        │
    │  (frecuente) │      │  (cliente nuevo)   │
    └──────┬───────┘      └─────────┬──────────┘
           │                        │ campos completos
           └──────────┬─────────────┘
                      ▼
             ┌─────────────────┐
             │   MENÚ / TOMA   │
             │   DE PEDIDO     │
             └────────┬────────┘
                      │ cliente pide algo
              ┌───────┴────────┐
              ▼                ▼
       ┌───────────┐    ┌───────────┐
       │PIDE CORTE │    │PIDE TIPO  │
       │(sin corte)│    │(sin tipo) │
       └─────┬─────┘    └─────┬─────┘
             └────────┬───────┘
                      ▼
             ┌─────────────────┐
             │  CONFIRMACIÓN   │
             │  DE ÍTEM        │
             │  ¿es correcto?  │
             └────────┬────────┘
                      │ sí
                      ▼
             ┌─────────────────┐
             │  AGREGAR MÁS    │
             │  ¿algo más?     │
             └────────┬────────┘
             ┌────────┴────────┐
             │ sí              │ no/listo
             ▼                 ▼
          (vuelve a      ┌──────────────┐
          toma pedido)   │  RESUMEN     │
                         │  FINAL       │
                         └──────┬───────┘
                                │ confirma
                    ┌───────────┴────────────┐
                    ▼                        ▼
             ┌────────────┐          ┌────────────────┐
             │CONFIRMADO  │          │ESPERANDO       │
             │(efectivo/  │          │CAPTURA         │
             │ tarjeta)   │          │(transferencia) │
             └────────────┘          └────────────────┘
```

---

## Orden de prioridad del router (mensajes.js)

Cada mensaje entrante se pasa por los handlers en este orden exacto. El primero que retorna `true` detiene la cadena.

```
 1. handleCancelacionConfirmada    → "cancelar" en cualquier etapa
 2. handleMotivoCancelacion        → esperando motivo de cancelación
 3. handlePrimerMensaje            → primer mensaje del cliente
 4. handleFueraDeHorario           → detectar si es fuera de horario
 5. handleEdicionPendiente         → esperandoEdicion activo
 6. handleConfirmacionDatos        → cliente frecuente confirmando sus datos
 7. handleTipoEntrega              → detectar domicilio/mostrador
 8. handleCancelacionDurantePedido → "cancelar" durante toma de pedido
 9. handleCambioTipoDuranteFormulario → cambio de tipo durante formulario
10. handleFormularioProgresivo     → llenar campos faltantes uno a uno
11. handleEdicionResumen           → editar algo desde el resumen
12. handleCambiosTipoDesdeResumen  → cambiar a domicilio/mostrador desde resumen
13. handleCambioMetodoDesdeResumen → cambiar método de pago desde resumen
14. handleAgregarDesdeResumen      → agregar ítem desde resumen
15. handleConfirmacionFinal        → "sí" cuando hay resumenPendiente
16. handleCatchAllResumen          → cualquier cosa con resumenPendiente (re-muestra)
17. handleEsperandoTipoItem        ← ESTADO BLOQUEANTE: taco o torta
18. handleEsperandoCorte           ← ESTADO BLOQUEANTE: tipo de carne
19. handleCambioTipoDuranteTomaPedido → cambio de tipo durante pedido
20. handleConfirmacionItem         ← ESTADO BLOQUEANTE: ¿es correcto?
21. handleAgregarMas               ← ESTADO BLOQUEANTE: ¿algo más?
22. handleFAQDurantePedido         → FAQs de precio/menú durante toma de pedido
23. handleRepetirPedido            → "lo mismo de siempre"
24. handlePedidoSimple             → parser local completo
25. handleSinCorte                 → detecta pedido sin corte
26. handleSinTipo                  → detecta pedido sin tipo (taco/torta)
27. handleModificacionAgregarMas   → modificar ítem en el acumulado
28. handlePresupuestoInverso       → "¿cuántos tacos con $100?"
29. handleGroqFallback             → último recurso (IA)
```

---

## Descripción detallada de cada estado

### SALUDO (primer mensaje)

**Trigger:** El cliente escribe por primera vez (no está en `clientesNuevos`).  
**Acción:** El bot responde con el mensaje de bienvenida de la BD (`saludo`) y pregunta si es para domicilio o mostrador.  
**Transición:** `clientesNuevos.add(numero)` → pasa a TIPO_ENTREGA.

---

### TIPO_ENTREGA

**Trigger:** Cliente en `clientesNuevos` que aún no tiene `tipoEntregaCliente` asignado.  
**Detección:** Sistema de scoring NLU en `formulario.js`:
- Palabras de mostrador: "mostrador", "recoger", "recojo", "para llevar" (+8 a +10 pts cada una)
- Palabras de domicilio: "domicilio", "envío", "mándalo", "tráemelo" (+8 a +10 pts cada una)
- Si diferencia ≥ 3 → detectado. Si < 3 → pregunta de nuevo.

**Al detectar el tipo:**
1. Se extrae el teléfono del JID de WA como pre-llenado inicial
2. Se ejecuta `interpretarCampos` sobre el primer mensaje (captura datos enviados de una sola vez)
3. Si el cliente ya existe en BD → ruta de cliente frecuente
4. Si no → formulario progresivo

---

### CLIENTE FRECUENTE (confirmación de datos)

**Trigger:** `getCliente(telefono)` retorna registro existente en BD.  
**Acción:** Bot muestra los datos precargados y pregunta si son correctos.  
**Mapa activo:** `esperandoConfirmacionDatos`  
**Si confirma:** Datos validados, avanza directo a menú.  
**Si corrige:** `detectarEdicion()` detecta qué cambiar, aplica y re-pregunta.

---

### FORMULARIO PROGRESIVO

**Trigger:** Cliente nuevo (no existe en BD).  
**Cómo funciona:** `siguienteCampoFaltante()` devuelve el siguiente campo que falta. El bot pregunta uno a la vez:

```
Nombre y apellido → Teléfono → Correo (opcional) → [si domicilio: Calle → Colonia → Referencia (opcional)] → Método de pago → [si preventa: Hora]
```

**Inteligencia del formulario:**
- Si el cliente manda varios campos en un solo mensaje ("Juan López, 3312345678, efectivo"), `interpretarCampos()` los extrae todos de una sola vez y salta las preguntas innecesarias
- Si escribe algo que no es el campo esperado pero sí es otro campo del formulario, lo captura de todas formas
- Palabras opcionales ("no tengo correo", "sin referencia") marcan el campo con un valor por defecto y avanzan

---

### ESTADOS BLOQUEANTES (toma de pedido)

Cuando el bot entra en uno de estos estados, **solo acepta la respuesta esperada**. Cualquier otro input recibe un mensaje de error. Al segundo error consecutivo se agregan ejemplos.

| Estado (Map) | Trigger | Solo acepta | Ejemplo de error |
|---|---|---|---|
| `esperandoCorte` | Pedido sin corte | surtido, carne, buche, cuero, lengua | "Necesito que me digas el tipo de carne. ¿Cuál prefieres?" |
| `esperandoTipoItem` | Cantidad+corte sin taco/torta | tacos, tortas | "¿Serían tacos o tortas?" |
| `esperandoConfirmacionItem` | Ítem parseado listo | sí/no y variantes, FAQ de precio/menú | Re-muestra el ítem |
| `esperandoAgregarMas` | Ítem confirmado | sí/no/listo, FAQ, edición | "¿Deseas agregar algo más?" |

**Excepción:** Las FAQs de precio, menú y descripción de corte se responden durante `esperandoCorte`, `esperandoConfirmacionItem` y `esperandoAgregarMas`, y luego el bot repite la pregunta pendiente.

---

### RESUMEN FINAL

**Trigger:** Cliente dice "no/ya es todo" en `esperandoAgregarMas`.  
**Acción:** `generarResumen()` construye el texto del resumen con:
- Lista de ítems con precios unitarios
- Datos del cliente (nombre, teléfono, dirección si aplica)
- Total (más tarifa de domicilio si aplica)
- Método de pago
- Indicaciones de transferencia si aplica

**Mapa activo:** `resumenPendiente`  
**Desde el resumen, el cliente puede:**
- Confirmar ("sí", "dale", "confirmo") → CONFIRMACIÓN FINAL
- Editar un campo ("cambia el método a transferencia") → `detectarEdicion`
- Agregar un ítem más → `handleAgregarDesdeResumen`
- Cambiar tipo de entrega → `handleCambiosTipoDesdeResumen`
- Cancelar → flujo de cancelación

---

### CONFIRMACIÓN FINAL

**Trigger:** Palabra de confirmación con `resumenPendiente` activo.  
**Secuencia exacta:**

```
1. upsertCliente() → INSERT o UPDATE en BD
2. registrarPedido() → INSERT en BD
   └── Si falla → msg.reply(error) → return (NO confirma)
3. guardarTelefonoReal() + guardarJIDReal()
4. client.sendMessage(GRUPO_ID, "Nueva venta! ...")
5. pendientesConfirmacion.set() → espera !confirmar del admin
6. limpiarTodo(numero) + clientesNuevos.add(numero)
7. msg.reply("Tu pedido fue recibido...")
```

**Si es transferencia:** No confirma aún. Activa `esperandoCaptura` y pide la captura de pantalla.

---

### INACTIVIDAD Y RECORDATORIO

**Timer:** `setInterval` cada 10 minutos en `utils.js`.

**Fase 1 — 30 minutos de inactividad:**
- Si el cliente tiene cualquier estado activo y no ha respondido → bot envía un mensaje proactivo contextual
- El mensaje muestra el estado actual: resumen pendiente, ítem pendiente de confirmar, corte pendiente, etc.
- Solo se envía una vez por sesión (`recordatorioEnviado` Map)
- Cuando el cliente responde → `recordatorioEnviado.delete(numero)` (puede recibir otro en una nueva inactividad)

**Fase 2 — 45 minutos de inactividad:**
- `limpiarTodo(numero)` → borra todos los Maps del cliente
- `eliminarSesion(numero)` → borra de la tabla `sesiones_activas` en BD
- El cliente empieza desde cero si vuelve a escribir

---

## Flujos especiales

### Preventa (fuera de horario)

Si el cliente escribe fuera del horario de atención:
1. Bot informa el horario y ofrece preventa
2. Si acepta → `clientesPreventa.add(numero)` → flujo normal pero solicita **hora de entrega**
3. La hora se guarda en `horaEntregaPreventa` y se incluye en el resumen

### Repetir pedido anterior

Si el cliente escribe "lo mismo de siempre", "el mismo pedido", etc.:
1. Busca en `ultimoPedido` (Map en memoria — no persiste entre reinicios)
2. Si no está, busca en BD: `getUltimoPedido(telefono)` → columna `clientes.ultimo_pedido_json`
3. Si existe → muestra el pedido anterior y pregunta "¿Te preparo lo mismo?"

### Cancelación

Desde cualquier etapa del flujo, el cliente puede escribir "cancelar":
1. Bot pregunta el motivo
2. Notifica al grupo de admin con motivo, hora y datos del cliente
3. `limpiarTodo(numero)` → sesión limpia

### Comandos del grupo admin

El grupo de administración puede usar:

| Comando | Acción |
|---|---|
| `!pedidos` | Lista todos los pedidos del día |
| `!pendientes` | Pedidos esperando confirmación |
| `!confirmados` | Pedidos confirmados hoy |
| `!cancelados` | Pedidos cancelados hoy |
| `!rechazados` | Pedidos rechazados hoy |
| `!confirmar [tel]` | Confirma el pedido del cliente y le notifica por WA |
| `!rechazar [tel]` | Rechaza el pedido del cliente y le notifica por WA |
