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
 3. handleCancelacionPagoMP        → mensajes durante espera de link de pago MP (link expirado, FAQs, recordatorio)
 4. handlePrimerMensaje            → primer mensaje del cliente
 5. handleFueraDeHorario           → detectar si es fuera de horario
 6. handleEdicionPendiente         → esperandoEdicion activo
 7. handleConfirmacionDatos        → cliente frecuente confirmando sus datos
 8. handleTipoEntrega              → detectar domicilio/mostrador
 9. handleCancelacionDurantePedido → "cancelar" durante toma de pedido
10. handleCambioTipoDuranteFormulario → cambio de tipo durante formulario
11. handleFormularioProgresivo     → llenar campos faltantes uno a uno
12. handleEdicionResumen           → editar algo desde el resumen
13. handleCambiosTipoDesdeResumen  → cambiar a domicilio/mostrador desde resumen
14. handleCambioMetodoDesdeResumen → cambiar método de pago desde resumen
15. handleAgregarDesdeResumen      → agregar ítem desde resumen
16. handleConfirmacionFinal        → "sí" cuando hay resumenPendiente
17. handleCatchAllResumen          → cualquier cosa con resumenPendiente (re-muestra)
18. handleEsperandoTipoItem        ← ESTADO BLOQUEANTE: taco o torta
19. handleEsperandoCorte           ← ESTADO BLOQUEANTE: tipo de carne
20. handleCambioTipoDuranteTomaPedido → cambio de tipo durante pedido
21. handleConfirmacionItem         ← ESTADO BLOQUEANTE: ¿es correcto?
22. handleAgregarMas               ← ESTADO BLOQUEANTE: ¿algo más?
23. handleFAQDurantePedido         → FAQs de precio/menú durante toma de pedido
24. handleRepetirPedido            → "lo mismo de siempre"
25. handlePedidoSimple             → parser local completo
26. handleSinCorte                 → detecta pedido sin corte
27. handleSinTipo                  → detecta pedido sin tipo (taco/torta)
28. handleModificacionAgregarMas   → modificar ítem en el acumulado
29. handlePresupuestoInverso       → "¿cuántos tacos con $100?"
30. handleGroqFallback             → último recurso (IA)
```

---

## Descripción detallada de cada estado

### SALUDO (primer mensaje)

**Trigger:** El cliente escribe por primera vez (no está en `clientesNuevos`).  
**Acción (cliente nuevo):** El bot responde con el mensaje de bienvenida de la BD (`saludo`) y pregunta si es para domicilio o mostrador.  
**Acción (cliente frecuente):** El bot saluda por nombre ("Hola de nuevo, Juan 👋") y pregunta si es para domicilio o mostrador **antes** de mostrar el menú. Antes de este fix (Jun 20), el bot mostraba el menú inmediatamente sin preguntar el tipo de entrega.  
**Coordinación `_menuEnviado`:** Un Set local en `formulario.js` evita que `handleTipoEntrega` repita el saludo si el primer mensaje ya incluía el tipo de entrega.  
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

**Si es transferencia con MercadoPago activo:** `resumen.js` genera el link de pago, lo envía al cliente y guarda el contexto en `esperandoPagoMP` (Map con `pedidoId`, `telefono`, `nombre`, `expiraEn` 30 min). El cliente queda en estado de espera de pago. `handleCancelacionPagoMP` maneja mensajes durante esta ventana: avisa si el link expiró, responde FAQs y recuerda al cliente completar el pago. El webhook de MercadoPago (`POST /webhook/mercadopago`) limpia `esperandoPagoMP` al recibir confirmación.  
**Si es transferencia sin MP configurado:** No confirma aún. Activa `esperandoCaptura` y pide la captura de pantalla.

---

### INACTIVIDAD Y RECORDATORIO

**Timer:** `setInterval` cada 10 minutos en `utils.js`.

**Fase 1 — 20 minutos de inactividad:**
- Si el cliente tiene cualquier estado activo y no ha respondido → bot envía un mensaje proactivo contextual
- El mensaje muestra el estado actual: resumen pendiente, ítem pendiente de confirmar, corte pendiente, etc.
- Solo se envía una vez por sesión (`recordatorioEnviado` Map)
- Cuando el cliente responde → `recordatorioEnviado.delete(numero)` (puede recibir otro en una nueva inactividad)

**Fase 2 — 35 minutos de inactividad:**
- `limpiarTodo(numero)` → borra todos los Maps del cliente
- `eliminarSesion(numero)` → borra de la tabla `sesiones_activas` en BD
- El cliente empieza desde cero si vuelve a escribir

---

## Flujos especiales

### Preventa (fuera de horario)

Si el cliente escribe fuera del horario de atención:
1. Bot informa el horario (incluye hora concreta de inicio, ej. "abrimos a las 7:00 a.m.") y ofrece preventa
2. Si acepta → `clientesPreventa.add(numero)` → flujo normal pero solicita **hora de entrega**
3. La hora se guarda en `horaEntregaPreventa` y se incluye en el resumen
4. Al confirmar el pedido (`!confirmar` en el grupo), `comandos.js` llama a `mandaditos.js` que programa un aviso al grupo de repartidores 1h antes de la `hora_entrega`. El despacho se persiste en `despachos_programados` para sobrevivir reinicios.

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

El grupo de administración es la interfaz operativa principal del negocio. Ver documentación completa en `06_PANEL_ADMIN.md`.

**Ver pedidos:**

| Comando | Acción |
|---|---|
| `!pedidos` | Todos los pedidos del día con estado |
| `!pendientes` | Pedidos esperando confirmación |
| `!confirmados` / `!cancelados` / `!rechazados` | Filtrar por estado |
| `!domicilios` / `!mostradores` | Filtrar por tipo de entrega |

**Gestionar pedidos:**

| Comando | Acción |
|---|---|
| `!confirmar [tel]` | Confirma y notifica al cliente por WA |
| `!listo [tel]` | Avisa al cliente que está listo/en camino. Cambia estado a "listo" o "en_camino" |
| `!cancelar [tel]` | Cancela con mensaje directo al cliente |
| `!rechazar [tel]` | Rechaza con aviso al cliente |
| `!pedido [tel]` | Detalle completo del pedido: ítems, dirección, método de pago |

**Clientes:**

| Comando | Acción |
|---|---|
| `!cliente [tel]` | Datos del cliente |
| `!buscar [nombre]` | Buscar cliente por nombre |
| `!historial [tel]` | Últimos 15 pedidos del cliente |
| `!editar [tel] [campo] [valor]` | Editar nombre, apellido, dirección, colonia, referencia o correo |
| `!top` | Top 10 clientes por número de pedidos y gasto total |
| `!mensaje [tel] [texto]` | Enviar mensaje directo al cliente desde el grupo |

**Reportes:**

| Comando | Acción |
|---|---|
| `!stats` | Resumen del día: pedidos, ventas, ticket promedio, top cortes |
| `!reporte ayer` | Stats de ayer |
| `!reporte semana` | Stats de los últimos 7 días |
| `!reporte mes` | Stats del mes actual |

**Menú y productos:**

| Comando | Acción |
|---|---|
| `!precios` | Ver precios actuales de todos los cortes |
| `!precio [corte] [taco] [torta]` | Actualizar precio (ej: `!precio buche 30 60`) |
| `!agotado [corte]` | Marcar corte como agotado — el bot deja de ofrecerlo |
| `!disponible [corte]` | Reactivar corte agotado |

**Control del negocio y el bot:**

| Comando | Acción |
|---|---|
| `!cerrar` | Cierra el negocio manualmente hoy (sin alterar el horario permanente) |
| `!abrir` | Reabre el negocio (limpia el cierre manual) |
| `!pausar` | Pausa las respuestas automáticas a clientes |
| `!reanudar` | Reactiva el bot |
| `!sesiones` | Lista clientes con sesión activa y su estado actual |
| `!limpiar [confirmar]` | Elimina TODAS las sesiones activas (requiere confirmación en dos pasos) |
| `!resetear [tel]` | Limpia la sesión de un cliente específico |
| `!estado` | Uptime, sesiones activas, estado de pausa y cierre manual |
| `!ayuda` | Lista todos los comandos disponibles |
