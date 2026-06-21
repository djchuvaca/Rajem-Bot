# Base de Datos — Esquema y Operaciones

Este documento describe la base de datos SQLite del bot: su arquitectura, todas las tablas, sus columnas y las operaciones CRUD disponibles.

---

## Motor: better-sqlite3 (SQLite nativo)

La BD corre como bindings nativos de C++ dentro del proceso de Node.js. Migrado desde sql.js (WebAssembly) por mejor rendimiento y persistencia automática.

**Ventajas:**
- Cero configuración — no hay servidor que instalar o mantener
- Persistencia automática — cada escritura persiste a disco inmediatamente, sin buffer ni debounce
- Más rápido que sql.js — bindings nativos en lugar de WebAssembly
- `journal_mode = DELETE` — sin archivos `-wal` ni `-shm`, simplifica los backups

**Limitaciones:**
- Las operaciones son síncronas (igual que sql.js) — aceptable para el volumen de una taquería
- No soporta múltiples procesos accediendo simultáneamente al mismo archivo

**Archivo en disco:** `data/tacos_javier.db`  
**Creación automática:** Si el archivo no existe al arrancar, `seedDB()` crea las tablas y los datos iniciales.  
**Backups automáticos:** `index.js` hace un fork de `scripts/backup-db.js` al iniciar y cada 6 horas. Los backups se guardan en `data/backups/`.

---

## Módulo de BD — `src/db/`

| Archivo | Responsabilidad |
|---|---|
| `core.js` | Motor: `initDB()`, `getDB()` (shim), `run()`, `queryOne()`, `queryAll()`, `guardarDB()` (no-op) |
| `seed.js` | `seedDB()`: crea tablas, inserta datos iniciales, ejecuta migraciones |
| `modelos.js` | CRUD de productos, clientes y pedidos |
| `config.js` | CRUD de configuración, horarios, banco, mensajes, JIDs |
| `index.js` | Re-exporta todo el módulo (usar `require("../db")`) |

---

## Función `guardarDB()` — no-op desde la migración a better-sqlite3

```javascript
// src/db/core.js (actual)
function guardarDB() {} // no-op: better-sqlite3 persiste automáticamente
```

**Comportamiento:** La función existe en el código para compatibilidad con llamadas legacy, pero no hace nada. better-sqlite3 persiste cada escritura a disco inmediatamente, sin buffer.

## `getDB()` — shim de compatibilidad

```javascript
function getDB() { return db; } // retorna un objeto compatible con la API sql.js
```

El objeto retornado tiene los métodos `run(sql, params)` y `exec(sql)` con la misma firma que sql.js. Esto permite que `seed.js` y otros módulos que usan `getDB()` funcionen sin cambios.

---

## Esquema completo de tablas

### 1. `productos`

Cortes de carne disponibles para pedir.

```sql
CREATE TABLE productos (
  id           INTEGER PRIMARY KEY AUTOINCREMENT,
  nombre       TEXT    NOT NULL UNIQUE,
  descripcion  TEXT,
  precio_taco  REAL    DEFAULT 30,
  precio_torta REAL    DEFAULT 40,
  precio_100g  REAL    DEFAULT 32,
  activo       INTEGER DEFAULT 1
);
```

| Columna | Descripción |
|---|---|
| `nombre` | Nombre del corte en minúsculas ("surtido", "carne", "buche", etc.) |
| `descripcion` | Texto descriptivo para FAQs de cortes |
| `precio_taco` | Precio por taco en pesos |
| `precio_torta` | Precio por torta en pesos |
| `precio_100g` | Precio por 100 gramos en pesos |
| `activo` | 1 = disponible, 0 = eliminado (soft delete) |

**Categorías de productos (panel admin los divide en 3 tablas):**

| Categoría | Cómo se detecta | Columnas relevantes |
|---|---|---|
| Cortes | nombre no es bebida ni salsa | precio_taco, precio_torta, precio_100g |
| Bebidas | nombre en lista de bebidas (coca cola, fanta, sprite…) | precio_taco (= precio unitario) |
| Salsas | precio_taco = 0 y precio_torta = 0 | precio_taco (= precio individual, si 0 = gratis) |

**Datos iniciales (seed) — cortes:**

| nombre | precio_taco | precio_torta | precio_100g |
|---|---|---|---|
| surtido | $30 | $40 | $32 |
| carne | $30 | $40 | $32 |
| buche | $30 | $40 | $32 |
| cuero | $30 | $40 | $32 |
| lengua | $30 | $40 | $32 |
| surtido especial | $30 | $40 | $32 |

**`surtido especial`:** Producto virtual que se activa automáticamente cuando el cliente combina 2+ cortes distintos en un ítem (ej: "mitad carne mitad buche"). Guarda la combinación real en el resumen como metadata. Se filtra del menú visible al cliente y de las listas de cortes en el bot.

**Precios por corte:** Cada corte puede tener su propio precio (taco/torta/100g). `precios.js` usa `porCorte` con fallback al precio global de configuración si el corte tiene precio 0. El menú muestra "desde $X" cuando hay variación de precios entre cortes.

**CRUD en `modelos.js`:**

- `getProductos()` → todos los productos activos
- `getProducto(nombre)` → un producto por nombre o null
- `updateProducto(id, datos)` → UPDATE completo por ID
- `createProducto(datos)` → INSERT
- `deleteProducto(id)` → soft delete (activo=0)
- `setProductoActivo(nombre, activo)` → activa o desactiva por nombre (comandos `!agotado` / `!disponible`)
- `updateProductoPrecio(nombre, precioTaco, precioTorta)` → actualiza precios por nombre (comando `!precio`)

**Nota:** Cualquier cambio en productos debe ir seguido de `invalidarCacheCortes()` en `pedidoParser.js` para que el bot refleje los cambios inmediatamente sin reiniciar.

---

### 2. `clientes`

Registro de todos los clientes que han completado al menos un pedido.

```sql
CREATE TABLE clientes (
  id                 INTEGER PRIMARY KEY AUTOINCREMENT,
  nombre             TEXT,
  apellido           TEXT,
  telefono           TEXT    UNIQUE NOT NULL,
  correo             TEXT,
  calle_numero       TEXT,
  colonia            TEXT,
  referencia         TEXT,
  total_pedidos      INTEGER DEFAULT 0,
  ultimo_pedido_json TEXT,
  fecha_registro     TEXT    DEFAULT (datetime('now', 'localtime'))
);
```

| Columna | Descripción |
|---|---|
| `telefono` | 10 dígitos locales. Es la clave de búsqueda principal |
| `nombre` / `apellido` | División calculada al capturar (ver `04_ESTADO_Y_SESIONES.md`) |
| `correo` | Opcional — puede ser null |
| `calle_numero` / `colonia` / `referencia` | Solo para pedidos de domicilio |
| `total_pedidos` | Counter incremental (se suma en cada `registrarPedido()`) |
| `ultimo_pedido_json` | JSON del último pedido (para "lo mismo de siempre") |

**CRUD en `modelos.js`:**

- `getCliente(telefono)` → un cliente o null
- `getAllClientes()` → todos ordenados por fecha DESC
- `getTopClientes(limit)` → top N clientes ordenados por `total_pedidos` DESC, con `gasto_total` calculado de pedidos confirmados/listo/en_camino
- `upsertCliente(datos)` → INSERT si no existe, UPDATE si ya existe (con COALESCE para no pisar datos existentes)
- `deleteCliente(id)` → DELETE real (no soft delete)
- `guardarUltimoPedido(telefono, jsonObj)` → actualiza `ultimo_pedido_json`
- `getUltimoPedido(telefono)` → parsea y retorna el JSON o null

**`upsertCliente` con COALESCE:** Si se llama con un campo null, no sobreescribe el valor existente. Esto es intencional — si el cliente no proporcionó correo en un pedido posterior, no se borra el correo que ya estaba.

---

### 3. `pedidos`

Registro de cada pedido realizado.

```sql
CREATE TABLE pedidos (
  id          INTEGER PRIMARY KEY AUTOINCREMENT,
  cliente_id  INTEGER REFERENCES clientes(id),
  tipo        TEXT,
  orden       TEXT,
  total       REAL,
  metodo_pago TEXT,
  estado      TEXT    DEFAULT 'pendiente',
  hora_entrega TEXT,
  fecha       TEXT    DEFAULT (datetime('now', 'localtime'))
);
```

| Columna | Valores posibles | Descripción |
|---|---|---|
| `tipo` | "domicilio", "mostrador" | Tipo de entrega |
| `orden` | texto libre | Descripción en texto del pedido ("3 tacos de surtido — $90") |
| `total` | número decimal | Total en pesos incluyendo domicilio si aplica |
| `metodo_pago` | "efectivo", "tarjeta", "transferencia" | |
| `estado` | "pendiente", "confirmado", "rechazado", "cancelado", "listo", "en_camino" | Estado del ciclo de vida |
| `hora_entrega` | string o null | Solo para preventa ("09:00") |

**Ciclo de vida del estado:**

```
pendiente → confirmado → listo (mostrador) | en_camino (domicilio)
pendiente → cancelado | rechazado
confirmado → cancelado
```

**CRUD en `modelos.js`:**

- `registrarPedido(datos)` → INSERT + incrementa `total_pedidos` del cliente
- `getPedidosHoy()` → pedidos del día actual con JOIN a clientes
- `getAllPedidos()` → últimos 200 pedidos con JOIN a clientes
- `getPedidosPorCliente(telefono)` → últimos 15 pedidos de un cliente
- `getPedidosPorFecha(fechaInicio, fechaFin)` → pedidos en rango de fechas con JOIN a clientes
- `updatePedidoEstado(id, estado)` → actualiza el estado por ID
- `actualizarEstadoPorId(pedidoId, estado)` → alias directo por ID (usado por webhook de MercadoPago)
- `actualizarEstadoPedido(telefono, estado)` → busca el pedido con estado "pendiente" más reciente y lo actualiza por teléfono
- `actualizarEstadoConfirmado(telefono, estado)` → busca el pedido con estado "confirmado" más reciente (para `!listo` y `!cancelar`)
- `deletePedido(id)` → DELETE real

**Advertencia:** `actualizarEstadoPedido()` busca por teléfono, no por ID. Si el teléfono registrado difiere del JID de WA (ej. número corto vs número con LADA), puede no encontrar el pedido. Ver `guardarTelefonoReal()` y `getJIDReal()`.

---

### 4. `configuracion`

Parámetros generales del negocio. Estructura clave-valor.

```sql
CREATE TABLE configuracion (
  clave TEXT PRIMARY KEY,
  valor TEXT NOT NULL
);
```

**Claves en uso:**

| Clave | Valor ejemplo | Descripción |
|---|---|---|
| `nombre_negocio` | "Tacos Javier" | Nombre del negocio (aparece en mensajes) |
| `domicilio_costo` | "50" | Costo del servicio a domicilio en pesos |
| `moneda` | "$" | Símbolo de moneda |
| `grupo_id` | "521...@g.us" | JID del grupo de WhatsApp admin |
| `precio_taco` | "30" | Precio base de taco (respaldo si no hay productos) |
| `precio_torta` | "40" | Precio base de torta |
| `precio_100g` | "32" | Precio base por 100g |
| `metodos_mostrador` | "efectivo, tarjeta o transferencia" | Texto para FAQs de pago en mostrador |
| `metodos_domicilio` | "efectivo o transferencia" | Texto para FAQs de pago a domicilio |
| `cierre_manual` | "0" / "1" | Cierre manual del negocio vía `!cerrar`. Cuando es "1", `estaEnHorario()` retorna false independientemente del horario configurado |

**CRUD en `config.js`:**
- `getConfig(clave)` → valor o null
- `getAllConfig()` → array de todas las filas
- `setConfig(clave, valor)` → INSERT OR REPLACE

---

### 5. `horarios`

Horario de atención por día de la semana.

```sql
CREATE TABLE horarios (
  id          INTEGER PRIMARY KEY AUTOINCREMENT,
  dia         INTEGER NOT NULL,     -- 0=Domingo, 1=Lunes, ..., 6=Sábado
  nombre_dia  TEXT    NOT NULL,
  abierto     INTEGER DEFAULT 1,    -- 1=abierto, 0=cerrado
  hora_inicio TEXT    DEFAULT '07:00',
  hora_fin    TEXT    DEFAULT '12:30'
);
```

**Horario inicial (seed):**

| Día | Abierto | Apertura | Cierre |
|---|---|---|---|
| Domingo | Sí | 07:00 | 12:30 |
| Lunes | No (descanso) | — | — |
| Martes-Sábado | Sí | 07:00 | 12:30 |

**CRUD en `config.js`:**
- `getHorarios()` → todos los días ordenados por `dia`
- `updateHorario(dia, abierto, hora_inicio, hora_fin)` → UPDATE por `dia`

**Uso en `src/horario.js`:** Lee la tabla para determinar si el bot está en horario de atención. Si está fuera de horario, ofrece preventa.

---

### 6. `banco`

Datos para transferencias bancarias.

```sql
CREATE TABLE banco (
  id           INTEGER PRIMARY KEY AUTOINCREMENT,
  banco        TEXT,
  beneficiario TEXT,
  clabe        TEXT,
  activo       INTEGER DEFAULT 1
);
```

Solo hay un registro activo. Se muestra al cliente cuando elige transferencia como método de pago.

**CRUD en `config.js`:**
- `getBanco()` → el registro activo o null
- `updateBanco(banco, beneficiario, clabe)` → actualiza el primer registro

---

### 7. `mensajes_bot`

Mensajes personalizables que el bot envía. Estructura clave-valor igual que `configuracion`.

```sql
CREATE TABLE mensajes_bot (
  clave TEXT PRIMARY KEY,
  valor TEXT NOT NULL
);
```

**Mensajes configurables:**

| Clave | Descripción |
|---|---|
| `saludo` | Mensaje de bienvenida al primer mensaje del cliente |
| `fuera_horario_lunes` | Mensaje cuando el cliente escribe un lunes (día de descanso) |
| `fuera_horario_antes` | Mensaje cuando el cliente escribe antes de la hora de apertura |
| `fuera_horario_despues` | Mensaje cuando el cliente escribe después del cierre |
| `confirmacion_pedido` | Mensaje al cliente cuando su pedido es recibido |
| `cancelacion_enviada` | Mensaje cuando el cliente cancela su pedido |

Los mensajes soportan variables entre llaves: `{negocio}`, `{hora_inicio}`, `{hora_fin}`.

**CRUD en `config.js`:**
- `getAllMensajes()` → todos los mensajes
- `getMensaje(clave)` → un mensaje o null
- `setMensaje(clave, valor)` → INSERT OR REPLACE

---

### 8. `usuarios_panel`

Credenciales de acceso al panel de administración.

```sql
CREATE TABLE usuarios_panel (
  id       INTEGER PRIMARY KEY AUTOINCREMENT,
  usuario  TEXT UNIQUE NOT NULL,
  password TEXT NOT NULL
);
```

La contraseña se almacena como hash bcrypt (costo 10). Solo existe el usuario `admin` por defecto.

**CRUD en `config.js`:**
- `getUsuarioPanel(usuario)` → fila con hash de contraseña
- `updatePasswordPanel(usuario, hashNuevo)` → UPDATE

---

### 9. `sesiones_activas`

Serialización de los Maps en memoria para sobrevivir reinicios.

```sql
CREATE TABLE sesiones_activas (
  numero         TEXT PRIMARY KEY,
  estado_json    TEXT NOT NULL,        -- JSON del estado del cliente
  historial_json TEXT DEFAULT '[]',   -- JSON del historial de Groq
  actualizado_en TEXT DEFAULT (datetime('now', 'localtime'))
);
```

| Columna | Descripción |
|---|---|
| `numero` | Número de teléfono de 10 dígitos (PK) |
| `estado_json` | Serialización de todos los Maps del cliente |
| `historial_json` | Array de mensajes para contexto de Groq |
| `actualizado_en` | Timestamp de última actualización |

**TTL:** Las sesiones de más de 48 horas se eliminan al arrancar (`limpiarSesionesAntiguas(48)`).

**CRUD en `config.js`:**
- `guardarSesion(numero, estadoJSON, historial)` → INSERT OR REPLACE
- `eliminarSesion(numero)` → DELETE
- `cargarTodasLasSesiones()` → SELECT *, parsea JSON
- `limpiarSesionesAntiguas(horas)` → DELETE WHERE actualizado_en < now - horas

---

### Tabla auxiliar (no en BD): `jid_telefonos`

Esta relación está guardada en la tabla `configuracion` usando claves dinámicas del estilo `jid:5213312345678@c.us = 3312345678`. Funciones en `config.js`:

- `guardarTelefonoReal(jid, telefono)` → guarda la relación JID → teléfono
- `getJIDReal(telefono)` → recupera el JID real para un teléfono
- `guardarJIDReal(jid, jidReal)` → guarda el JID normalizado

**Por qué existe:** WhatsApp puede entregar el JID en distintos formatos dependiendo de si el número tiene o no prefijo de LADA. Esta relación garantiza que el bot siempre pueda enviar mensajes proactivos al cliente correcto.

---

## Flujo de consulta en una sesión normal

```
Cliente manda mensaje
        │
        ▼
mensajes.js lee Maps de memoria (O(1), sin BD)
        │
        ▼
[procesamiento]
        │
        ▼
Estado cambia → persistirEstado(numero)
        │
        ▼
guardarSesion() → INSERT OR REPLACE sesiones_activas
        │
        ▼
better-sqlite3 persiste automáticamente → tacos_javier.db (sin buffer)
```

**La BD NO se consulta** durante el flujo normal de un mensaje, excepto en:
- Primer acceso a datos de un cliente frecuente (`getCliente`)
- Consulta de precios (`getProductos`)
- Confirmación final (`upsertCliente`, `registrarPedido`)

---

## Migraciones

Las migraciones de schema se hacen inline en `seed.js` con try-catch:

```javascript
try {
  db.run("ALTER TABLE clientes ADD COLUMN ultimo_pedido_json TEXT");
} catch (_) {}
// Si la columna ya existe, SQLite lanza error → se ignora silenciosamente
```

Al agregar una nueva columna a una tabla existente, se agrega una línea similar al bloque de migraciones en `seedDB()`. La función se llama en cada arranque, así que la migración se aplica automáticamente al primer reinicio.

---

### Tablas adicionales (creadas en versiones recientes)

#### `tarifas_zonas`
Tarifas de domicilio configurables por colonia o zona geográfica. La respuesta de FAQ "domicilio" ahora dice "precio según distancia a tu colonia" en lugar de un monto fijo.

#### `colonias`
Catálogo de colonias con coordenadas geográficas. Base para el cálculo de tarifas por distancia.

#### `pagos_pendientes`
Registro de pagos con MercadoPago que están en proceso. Complementa el Map `esperandoPagoMP` en memoria para el caso de reinicio con un pago activo.

#### `despachos_programados`

```sql
CREATE TABLE despachos_programados (
  id              INTEGER PRIMARY KEY AUTOINCREMENT,
  pedido_id       INTEGER NOT NULL,
  cliente_nombre  TEXT    NOT NULL,
  cliente_tel     TEXT    NOT NULL,
  cliente_calle   TEXT,
  cliente_colonia TEXT,
  cliente_ref     TEXT,
  total_orden     TEXT,
  tarifa          INTEGER,
  hora_despacho   TEXT    NOT NULL,    -- ISO string del momento de aviso al repartidor
  ejecutado       INTEGER NOT NULL DEFAULT 0
);
```

Persiste los despachos programados para preventas. Al confirmar un pedido de preventa (`!confirmar`), `comandos.js` registra aquí el despacho y programa un `setTimeout` 1h antes de `hora_entrega`. Si el bot reinicia, `reanudarDespachosPendientes()` (llamada en `ready` de `index.js`) restaura los timeouts pendientes desde esta tabla.

**CRUD en `modelos.js`:**
- `guardarDespachoProgramado(datos)` → INSERT
- `marcarDespachoEjecutado(id)` → UPDATE ejecutado=1
- `getDespachosPendientes()` → SELECT WHERE ejecutado=0
