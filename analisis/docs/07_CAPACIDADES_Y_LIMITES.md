# Capacidades y Límites del Sistema

Este documento establece qué puede hacer el sistema con claridad y honestidad: sus capacidades reales, sus límites técnicos y operativos actuales, y qué habría que cambiar para escalar.

---

## ¿Qué hace bien el sistema hoy?

### Interpretación de lenguaje natural (NLU)

El parser local maneja ~95% de los pedidos sin necesidad de IA. Entiende:

- Números en texto: "tres tacos de surtido", "una docena de cuero", **"treinta y dos tacos"** (compuestos)
- Medidas: "medio kilo", "cuarto de carne", "300g de buche"
- Pedidos por monto: "$150 de surtido"
- Alias coloquiales: "carnitas" → carne, "cueritos" → cuero, "buchón" → buche
- Errores ortográficos: "surtudo", "lenguita", "carner" (fuzzy match con Levenshtein ≤ 2)
- Multi-ítem: "3 tacos de surtido y 2 de carne", pedidos con saltos de línea
- Pedidos con bebida: "3 tacos de carne y aparte una coca" (separa bebida y parsea local)
- Combinaciones: "mitad surtido y mitad buche", "de todo menos lengua"
- Modificaciones con corte específico: "quita un taco de carne", "ponme otros 3 de buche", "en lugar de cuero dame buche", "mejor surtido que carne"
- Respuestas a "todos los cortes" → surtido en estado esperandoCorte
- Preguntas compuestas: "¿a qué hora abren y cuánto es el domicilio?" (multi-intent, responde ambas)
- Precio contextual: al preguntar precio durante un pedido, muestra también el subtotal actual

### Flujo conversacional robusto

- El bot nunca pierde el contexto de una conversación activa
- Las sesiones sobreviven reinicios del proceso (serialización a BD)
- Si el cliente dice algo fuera de contexto en un estado bloqueante, el bot repite la pregunta (no se rompe)
- El bot recuerda clientes frecuentes y autocompleta sus datos
- El cliente puede editar cualquier dato desde el resumen final antes de confirmar
- Los pedidos de preventa (fuera de horario) funcionan igual que los normales

### Resiliencia operativa

- Si Groq no responde en 15s, hace un reintento automático; si falla el reintento, le dice al cliente que no entendió (no se cae el bot)
- Si la BD falla al registrar un pedido, el cliente recibe un error honesto (no confirmación falsa)
- La deduplicación de mensajes (Set de 200 IDs) previene procesar duplicados que a veces envía WA
- El timeout bifásico (recordatorio a 20 min + limpieza a 35 min) evita sesiones zombie
- Si WhatsApp se desconecta, el bot reintenta automáticamente con backoff exponencial (hasta 8 reintentos)
- Backup automático cada 6 horas — en caso de corrupción, se puede restaurar desde el más reciente
- Rate limiting de 2s entre mensajes al mismo JID — reduce riesgo de ban por spam

---

## Capacidad de clientes simultáneos

### Cuántos puede manejar

**En la práctica: entre 15 y 30 clientes simultáneos activos sin degradación perceptible.**

"Cliente activo" significa un cliente que está en medio de una conversación y enviando mensajes. Esto es diferente de "clientes en el Map" (puede haber 200 en sesiones_activas y el bot no los nota hasta que escriben).

### Por qué ese número y no más

| Factor | Impacto |
|---|---|
| Event loop de Node.js | Es de un solo hilo. Las operaciones síncronas de better-sqlite3 bloquean el event loop brevemente (~0.5-2ms por operación, más rápido que sql.js). Con 30 clientes simultáneos, la espera máxima es ~60ms — aceptable. |
| Puppeteer / Chromium | Consume 200-500 MB de RAM solo. Es el cuello de botella de memoria. |
| whatsapp-web.js | Fue diseñado para uso personal, no para alto volumen. La sesión WA Web puede volverse inestable con muchos mensajes por segundo. |
| Groq rate limit | Free tier: ~30 req/min. Si el ~5% de 30 clientes simultáneos necesita Groq, son ~1-2 llamadas/min — dentro del límite. |
| RAM total estimada | Puppeteer: ~300MB + Node.js + better-sqlite3: ~20MB + estado Maps: ~5MB para 30 clientes. Total: ~325MB. Un VPS de 1GB puede manejarlo. |

### Qué pasa si se supera

Con más de 30-50 clientes enviando mensajes simultáneamente:
- Las operaciones síncronas de sql.js empiezan a acumular latencia perceptible (>500ms por mensaje)
- Puppeteer puede empezar a perder mensajes o desconectarse
- El event loop se vuelve responsivo solo en ráfagas

**Para una taquería pequeña-mediana:** el sistema es más que suficiente. El cuello de botella real no es el software sino la capacidad de preparación de la cocina.

---

## Límites técnicos actuales

### 1. Un solo número de WhatsApp

El bot corre una sola sesión de WhatsApp (un solo número). No hay soporte nativo para múltiples números o múltiples negocios en el mismo proceso.

**Para escalar a múltiples negocios:** se necesitaría una instancia separada del proceso por negocio, o refactorizar para soportar múltiples clientes de WA.

### 2. Proceso único (sin clúster)

Todo corre en un solo proceso: bot + panel + BD en RAM. Si el proceso muere, todo muere junto. Tiempo de recuperación: 15-30 segundos (reconexión de WA Web).

**Impacto:** Actualizaciones de código requieren reiniciar el proceso → ventana de ~30 segundos sin atención.

**Mitigación actual:** Sistema de persistencia de sesiones. Los clientes en proceso retoman desde donde estaban al volver.

### 3. WhatsApp Web (no API oficial)

El sistema usa `whatsapp-web.js`, que automatiza WhatsApp Web mediante Puppeteer. No usa la API oficial de Meta (WhatsApp Business API).

**Implicaciones:**
- WhatsApp puede cambiar su interfaz web y romper la librería (ha pasado históricamente)
- El número puede ser baneado si WA detecta comportamiento automatizado inusual
- No soporta mensajes de plantilla (templates) ni botones interactivos
- Requiere que el teléfono esté conectado y la sesión activa

**Para producción seria:** considerar migrar a la API oficial de Meta, que es más estable pero de pago.

### 4. Parser local cubre ~95% de casos

El ~5% restante va a Groq. Esto es positivo desde el punto de vista de costo y latencia, pero significa que hay una fracción de mensajes que puede no interpretarse correctamente si Groq tampoco entiende el contexto.

**Casos que el parser local no cubre:**
- Pedidos con distribución compleja ("2 para mí y 3 para ella, uno de buche y uno de surtido")
- Preguntas en lenguaje muy coloquial o regional
- Combinaciones inusuales de medidas

### 5. Sin soporte de voz (PTT)

Los mensajes de audio (Push-to-Talk) son respondidos con: "Solo proceso mensajes de texto". No hay transcripción de voz.

### 6. Historial de Groq no persiste entre conversaciones nuevas

El historial de mensajes para el contexto de Groq se acumula en `conversaciones` Map durante una sesión. Cuando la sesión termina (`limpiarTodo`), el historial se borra. En la próxima interacción, Groq empieza sin contexto previo.

### 7. Sin soporte de imágenes más allá de comprobantes

El bot solo procesa imágenes cuando está en estado `esperandoCaptura` (comprobante de transferencia). Cualquier otra imagen es ignorada.

### 8. Contraseña del panel en texto plano en la sesión

La sesión de Express almacena solo el nombre de usuario. Pero el panel no tiene soporte de múltiples usuarios con roles distintos (todos los usuarios del panel tienen acceso total).

---

## Límites operativos

### Horario

Los horarios están en la BD y son configurables desde el panel. Por defecto: Martes a Domingo, 7:00-12:30. El sistema solo soporta un horario por día (no hay soporte para horarios partidos, ej. 7:00-12:00 y 16:00-20:00).

### Zona de entrega

No hay validación geográfica de la dirección de entrega. El bot acepta cualquier colonia/calle. La zona de cobertura es solo texto informativo.

### Moneda

Solo pesos mexicanos (MXN). No hay conversión de moneda.

### Idioma

Solo español. El parser, las FAQs y todos los mensajes al cliente están en español. No hay soporte multiidioma.

---

## Qué se necesitaría para escalar

### Escenario 1: Más volumen (50-100 clientes simultáneos)

1. **better-sqlite3 ya está implementado** — La migración desde sql.js ya se completó. El event loop es más eficiente.
2. **Separar el panel en su propio proceso** — Libera el event loop del bot de las solicitudes HTTP del panel
3. **Pool de workers para Groq** — Mover las llamadas a Groq a worker_threads para no bloquear

### Escenario 2: Múltiples negocios (SaaS)

1. **Base de datos central** (PostgreSQL o similar) en lugar de SQLite por instancia
2. **Arquitectura multi-tenant** — cada negocio tiene su JID, su menú, sus clientes
3. **API oficial de WhatsApp (Meta Cloud API)** — más estable, soporta múltiples números
4. **Containerización** (Docker) para aislar instancias por negocio

### Escenario 3: Alta disponibilidad (sin downtime en updates)

1. **PM2 con modo cluster** — múltiples procesos con balanceo y hot-reload sin caída
2. **Separar el estado de sesiones** a Redis — permite que múltiples procesos compartan estado
3. **Estrategia blue-green** para deploys sin downtime

---

## Estado actual del proyecto (1 Junio 2026)

### Lo que está implementado y funcionando

**Flujo conversacional:**
- Flujo completo de extremo a extremo para pedidos de domicilio y mostrador
- Parser NLU local con fuzzy matching y sistema de score (~95% sin IA)
- Formulario progresivo inteligente (captura múltiples campos en un mensaje)
- Reconocimiento de clientes frecuentes con datos pre-llenados
- Pedidos de preventa fuera de horario
- Resumen final con edición antes de confirmar
- Timeout bifásico: recordatorio contextual a 20 min, limpieza a 35 min
- Rate limiting de 2s entre mensajes al mismo JID (reduce riesgo de ban)

**Administración por grupo de WhatsApp (sin PC):**
- Ver y filtrar pedidos del día por estado y tipo de entrega
- Confirmar, marcar listo/en camino, cancelar y rechazar pedidos con notificación al cliente
- Ver detalle completo de un pedido (ítems, dirección, método de pago)
- Buscar y editar datos de clientes directamente desde el chat
- Historial de pedidos por cliente y top clientes por gasto
- Enviar mensajes directos a clientes desde el grupo
- Actualizar precios y disponibilidad de cortes en tiempo real
- Cierre manual del negocio (sin alterar horario permanente)
- Pausar/reanudar el bot completamente
- Ver, limpiar una sesión individual (`!resetear`) o todas (`!limpiar confirmar`)
- Reportes de ventas: día, ayer, semana, mes

**Infraestructura de producción:**
- better-sqlite3 con persistencia automática — sin riesgo de pérdida de datos por buffer
- Backup automático cada 6 horas a `data/backups/`
- PM2 con autorestart, restart_delay y max_restarts configurados
- Winston logger — consola coloreada + archivos en `logs/`
- Sentry — captura de errores en producción (opt-in via `SENTRY_DSN`)
- Reconnección automática con backoff exponencial (hasta 8 reintentos)
- Handlers globales de error (`uncaughtException`, `unhandledRejection`)

**Panel web:**
- Wizard de onboarding en 5 pasos (primer login automático o acceso manual)
- CRUD completo: productos, clientes, pedidos, horarios, banco, mensajes, config
- Exportar pedidos a CSV
- Estadísticas históricas (últimos 7 o 30 días)
- Notificación proactiva al cliente al cambiar estado del pedido desde el panel
- Health check público `GET /health` para monitoreo externo

**Pagos:**
- MercadoPago (opt-in): genera link de cobro al confirmar pedido de transferencia
- Webhook automático: confirma pedido en BD y notifica al cliente y grupo
- Fallback transparente al flujo banco + comprobante de imagen si MP no está configurado

### Pendiente (oportunidades de mejora)

- Tests automatizados ampliados (unitarios y de integración de extremo a extremo)
- Soporte de botones/listas interactivas de WhatsApp (requiere API oficial de Meta)
- Validación de zona de cobertura geográfica
- Soporte de horarios partidos (ej. 7:00-12:00 y 16:00-20:00)
- Provisioning automatizado de tenants con interfaz web (hoy solo CLI via `scripts/nuevo-tenant.js`)

---

## Glosario de términos del sistema

| Término | Definición en este proyecto |
|---|---|
| **JID** | WhatsApp ID del formato `5213312345678@c.us` — identificador único por número |
| **número** | 10 dígitos locales (sin LADA ni prefijo de país). Es la clave en BD |
| **estado bloqueante** | Estado donde el bot solo acepta un tipo específico de respuesta y bloquea cualquier otro input |
| **formulario progresivo** | Captura de datos del cliente campo por campo, con la inteligencia de capturar múltiples campos si el cliente los manda de una vez |
| **score** | Número calculado por el parser local para decidir si puede parsear el mensaje (≥4) o lo pasa a Groq (<4) |
| **fuzzy match** | Comparación de texto tolerante a errores ortográficos mediante distancia de Levenshtein |
| **session** | Conjunto de Maps en memoria que representan el estado de una conversación activa |
| **persistirEstado** | Serializar los Maps de un cliente a JSON y guardar en la tabla `sesiones_activas` |
| **cliente frecuente** | Cliente que ya existe en la tabla `clientes` — el bot le muestra sus datos precargados |
| **preventa** | Pedido tomado fuera del horario de atención, con hora de entrega para cuando abra |
| **captura** | Comprobante de pago (imagen) enviado por el cliente para pedidos con transferencia |
| **grupo admin** | Grupo de WhatsApp donde el bot envía notificaciones de nuevos pedidos y el admin usa comandos |
