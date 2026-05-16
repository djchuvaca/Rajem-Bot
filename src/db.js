const initSqlJs = require("sql.js");
const fs        = require("fs");
const path      = require("path");

const DATA_DIR = path.join(__dirname, "../data");
const DB_PATH  = path.join(DATA_DIR, "tacos_javier.db");

if (!fs.existsSync(DATA_DIR)) fs.mkdirSync(DATA_DIR);

let db = null;

async function initDB() {
  if (db) return db;
  const SQL = await initSqlJs();
  if (fs.existsSync(DB_PATH)) {
    db = new SQL.Database(fs.readFileSync(DB_PATH));
  } else {
    db = new SQL.Database();
  }

  db.run(`
    CREATE TABLE IF NOT EXISTS productos (
      id             INTEGER PRIMARY KEY AUTOINCREMENT,
      nombre         TEXT    NOT NULL UNIQUE,
      descripcion    TEXT,
      precio_taco    REAL    DEFAULT 30,
      precio_torta   REAL    DEFAULT 40,
      precio_100g    REAL    DEFAULT 32,
      activo         INTEGER DEFAULT 1
    );
    CREATE TABLE IF NOT EXISTS clientes (
      id             INTEGER PRIMARY KEY AUTOINCREMENT,
      nombre         TEXT,
      apellido       TEXT,
      telefono       TEXT    UNIQUE NOT NULL,
      correo         TEXT,
      calle_numero   TEXT,
      colonia        TEXT,
      referencia     TEXT,
      total_pedidos  INTEGER DEFAULT 0,
      fecha_registro TEXT    DEFAULT (datetime('now', 'localtime'))
    );
    CREATE TABLE IF NOT EXISTS pedidos (
      id           INTEGER PRIMARY KEY AUTOINCREMENT,
      cliente_id   INTEGER REFERENCES clientes(id),
      tipo         TEXT,
      orden        TEXT,
      total        REAL,
      metodo_pago  TEXT,
      estado       TEXT    DEFAULT 'pendiente',
      hora_entrega TEXT,
      fecha        TEXT    DEFAULT (datetime('now', 'localtime'))
    );
    CREATE TABLE IF NOT EXISTS configuracion (
      clave TEXT PRIMARY KEY,
      valor TEXT NOT NULL
    );
    CREATE TABLE IF NOT EXISTS horarios (
      id          INTEGER PRIMARY KEY AUTOINCREMENT,
      dia         INTEGER NOT NULL,
      nombre_dia  TEXT    NOT NULL,
      abierto     INTEGER DEFAULT 1,
      hora_inicio TEXT    DEFAULT '07:00',
      hora_fin    TEXT    DEFAULT '12:30'
    );
    CREATE TABLE IF NOT EXISTS banco (
      id           INTEGER PRIMARY KEY AUTOINCREMENT,
      banco        TEXT,
      beneficiario TEXT,
      clabe        TEXT,
      activo       INTEGER DEFAULT 1
    );
    CREATE TABLE IF NOT EXISTS mensajes_bot (
      clave TEXT PRIMARY KEY,
      valor TEXT NOT NULL
    );
    CREATE TABLE IF NOT EXISTS usuarios_panel (
      id       INTEGER PRIMARY KEY AUTOINCREMENT,
      usuario  TEXT UNIQUE NOT NULL,
      password TEXT NOT NULL
    );
    CREATE TABLE IF NOT EXISTS sesiones_activas (
      numero         TEXT PRIMARY KEY,
      estado_json    TEXT NOT NULL,
      historial_json TEXT DEFAULT '[]',
      actualizado_en TEXT DEFAULT (datetime('now', 'localtime'))
    );
  `);

  // ── SEED PRODUCTOS ────────────────────────────────────────────────────────
  const countProd = db.exec("SELECT COUNT(*) as c FROM productos")[0]?.values[0][0] || 0;
  if (countProd === 0) {
    const productos = [
      ["surtido", "El favorito de la casa y amado por la gran mayoría de nuestros clientes. Es una combinación de todos nuestros cortes: carne, buche, cuero y lengua, dando como resultado un surtido jugoso, delicioso, con ese sabor incomparable de Tacos Javier.", 30, 40, 32],
      ["carne",   "Puede variar entre espaldilla, pierna y aldilla. Es fibra pura con un muy bajo porcentaje de grasa, con ese sabor incomparable que solo encuentras en Tacos Javier. Perfecto para unos tacos que rayen en lo light.", 30, 40, 32],
      ["buche",   "Básicamente es el estómago del puerco. Tiene una textura consistente, similar al cuero pero con un sabor parecido al de la tripa. Perfecto para botanas o acompañado en tacos, y más si es con la calidad y sabor de Tacos Javier.", 30, 40, 32],
      ["cuero",   "Es la piel del puerco, la capa más delgada y limpia de cebo, con una textura muy suave y delicada. No te arrepentirás de acompañar tus tacos con una deliciosa botana de cueros — eso sí, si son de Tacos Javier el éxito está garantizado.", 30, 40, 32],
      ["lengua",  "Tiene una textura muy suave y consistente, casi cremosa, con un sabor intenso pero limpio, más delicado que otras partes del cerdo. Cuando está bien cocinada se deshace fácilmente y queda muy jugosa. Si es de Tacos Javier, ni para qué te cuento.", 30, 40, 32],
    ];
    for (const [nombre, desc, taco, torta, g100] of productos) {
      db.run("INSERT INTO productos (nombre, descripcion, precio_taco, precio_torta, precio_100g) VALUES (?,?,?,?,?)",
        [nombre, desc, taco, torta, g100]);
    }
    console.log("✅ Productos iniciales insertados");
  } else {
    // Renombrar carner → carne si existe
    db.run("UPDATE productos SET nombre = 'carne' WHERE nombre = 'carner'");
    const descripciones = [
      ["surtido", "El favorito de la casa y amado por la gran mayoría de nuestros clientes. Es una combinación de todos nuestros cortes: carne, buche, cuero y lengua, dando como resultado un surtido jugoso, delicioso, con ese sabor incomparable de Tacos Javier."],
      ["carne",   "Puede variar entre espaldilla, pierna y aldilla. Es fibra pura con un muy bajo porcentaje de grasa, con ese sabor incomparable que solo encuentras en Tacos Javier. Perfecto para unos tacos que rayen en lo light."],
      ["buche",   "Básicamente es el estómago del puerco. Tiene una textura consistente, similar al cuero pero con un sabor parecido al de la tripa. Perfecto para botanas o acompañado en tacos, y más si es con la calidad y sabor de Tacos Javier."],
      ["cuero",   "Es la piel del puerco, la capa más delgada y limpia de cebo, con una textura muy suave y delicada. No te arrepentirás de acompañar tus tacos con una deliciosa botana de cueros — eso sí, si son de Tacos Javier el éxito está garantizado."],
      ["lengua",  "Tiene una textura muy suave y consistente, casi cremosa, con un sabor intenso pero limpio, más delicado que otras partes del cerdo. Cuando está bien cocinada se deshace fácilmente y queda muy jugosa. Si es de Tacos Javier, ni para qué te cuento."],
    ];
    for (const [nombre, desc] of descripciones) {
      db.run("UPDATE productos SET descripcion = ? WHERE nombre = ?", [desc, nombre]);
    }
  }

  // ── SEED CONFIGURACION ────────────────────────────────────────────────────
  const countConf = db.exec("SELECT COUNT(*) as c FROM configuracion")[0]?.values[0][0] || 0;
  if (countConf === 0) {
    const config = [
      ["nombre_negocio",    "Tacos Javier"],
      ["domicilio_costo",   "50"],
      ["moneda",            "$"],
      ["grupo_id",          process.env.GRUPO_ID || ""],
      ["precio_taco",       "30"],
      ["precio_torta",      "40"],
      ["precio_100g",       "32"],
      ["metodos_mostrador", "efectivo, tarjeta o transferencia"],
      ["metodos_domicilio", "efectivo o transferencia"],
    ];
    for (const [clave, valor] of config) {
      db.run("INSERT INTO configuracion (clave, valor) VALUES (?,?)", [clave, valor]);
    }
    console.log("✅ Configuración inicial insertada");
  } else {
    const nuevos = [
      ["precio_taco",       "30"],
      ["precio_torta",      "40"],
      ["precio_100g",       "32"],
      ["metodos_mostrador", "efectivo, tarjeta o transferencia"],
      ["metodos_domicilio", "efectivo o transferencia"],
    ];
    for (const [clave, valor] of nuevos) {
      db.run("INSERT OR IGNORE INTO configuracion (clave, valor) VALUES (?,?)", [clave, valor]);
    }
  }

  // ── SEED HORARIOS ─────────────────────────────────────────────────────────
  const countHor = db.exec("SELECT COUNT(*) as c FROM horarios")[0]?.values[0][0] || 0;
  if (countHor === 0) {
    const dias = [
      [0, "Domingo",   1, "07:00", "12:30"],
      [1, "Lunes",     0, "07:00", "12:30"],
      [2, "Martes",    1, "07:00", "12:30"],
      [3, "Miércoles", 1, "07:00", "12:30"],
      [4, "Jueves",    1, "07:00", "12:30"],
      [5, "Viernes",   1, "07:00", "12:30"],
      [6, "Sábado",    1, "07:00", "12:30"],
    ];
    for (const [dia, nombre, abierto, inicio, fin] of dias) {
      db.run("INSERT INTO horarios (dia, nombre_dia, abierto, hora_inicio, hora_fin) VALUES (?,?,?,?,?)",
        [dia, nombre, abierto, inicio, fin]);
    }
    console.log("✅ Horarios iniciales insertados");
  }

  // ── SEED BANCO ────────────────────────────────────────────────────────────
  const countBanco = db.exec("SELECT COUNT(*) as c FROM banco")[0]?.values[0][0] || 0;
  if (countBanco === 0) {
    db.run("INSERT INTO banco (banco, beneficiario, clabe) VALUES (?,?,?)",
      ["Mercado Pago", "Aline Dominike Ortiz Arguelles", "722969020338079487"]);
    console.log("✅ Datos bancarios iniciales insertados");
  }

  // ── SEED MENSAJES BOT ─────────────────────────────────────────────────────
  const countMsg = db.exec("SELECT COUNT(*) as c FROM mensajes_bot")[0]?.values[0][0] || 0;
  if (countMsg === 0) {
    const mensajes = [
      ["saludo",                "¡Bienvenido a *{negocio}*! 🌮🔥\nLas mejores carnitas de puerco de la ciudad 😄\n\n¿Tu pedido será para *domicilio* 🛵 o pasas a *recoger al mostrador* 🏪?"],
      ["fuera_horario_lunes",   "⏰ Por el momento nos encontramos fuera de servicio.\nLos lunes descansamos 😴\n\nRetomamos el servicio el *martes a las {hora_inicio}* 🌮\n\n¿Te gustaría hacer un pedido en *preventa* para cuando abramos?"],
      ["fuera_horario_antes",   "⏰ Por el momento nos encontramos fuera de servicio.\nIniciamos atención a las *{hora_inicio}* 🌮\n\n¿Te gustaría hacer un pedido en *preventa* para cuando abramos?"],
      ["fuera_horario_despues", "⏰ Por el momento nos encontramos fuera de servicio.\nNuestro horario es de *Martes a Domingo de {hora_inicio} a {hora_fin}* 🌮\n\nMañana iniciamos a las *{hora_inicio}*\n\n¿Te gustaría hacer un pedido en *preventa* para cuando abramos?"],
      ["confirmacion_pedido",   "Listo! Tu pedido fue recibido y esta en espera de confirmacion de nuestro equipo.\nEn breve te avisamos. Gracias por tu preferencia!\n\n_Si deseas cancelar tu pedido escribe *cancelar*._"],
      ["cancelacion_enviada",   "Tu solicitud de cancelacion fue enviada a nuestro equipo.\nEn breve se comunicaran contigo para confirmarte. Disculpa los inconvenientes!"],
    ];
    for (const [clave, valor] of mensajes) {
      db.run("INSERT INTO mensajes_bot (clave, valor) VALUES (?,?)", [clave, valor]);
    }
    console.log("✅ Mensajes del bot insertados");
  }

  // ── SEED USUARIO PANEL ────────────────────────────────────────────────────
  const countUser = db.exec("SELECT COUNT(*) as c FROM usuarios_panel")[0]?.values[0][0] || 0;
  if (countUser === 0) {
    const bcrypt = require("bcryptjs");
    const hash   = bcrypt.hashSync("admin123", 10);
    db.run("INSERT INTO usuarios_panel (usuario, password) VALUES (?,?)", ["admin", hash]);
    console.log("✅ Usuario panel creado: admin / admin123");
  }

  guardarDB();
  console.log("✅ Base de datos lista:", DB_PATH);
  return db;
}

function guardarDB() {
  if (!db) return;
  fs.writeFileSync(DB_PATH, Buffer.from(db.export()));
}

function queryAll(sql, params = []) {
  if (!db) return [];
  const stmt = db.prepare(sql);
  stmt.bind(params);
  const rows = [];
  while (stmt.step()) rows.push(stmt.getAsObject());
  stmt.free();
  return rows;
}

function queryOne(sql, params = []) {
  return queryAll(sql, params)[0] || null;
}

function run(sql, params = []) {
  if (!db) return;
  db.run(sql, params);
  guardarDB();
}

// ─── CONFIGURACION ────────────────────────────────────────────────────────────
function getConfig(clave) {
  const row = queryOne("SELECT valor FROM configuracion WHERE clave = ?", [clave]);
  return row ? row.valor : null;
}
function setConfig(clave, valor) {
  run("INSERT OR REPLACE INTO configuracion (clave, valor) VALUES (?,?)", [clave, valor]);
}
function getAllConfig() {
  return queryAll("SELECT * FROM configuracion");
}

// ─── HORARIOS ─────────────────────────────────────────────────────────────────
function getHorarios() { return queryAll("SELECT * FROM horarios ORDER BY dia"); }
function getHorarioDia(dia) { return queryOne("SELECT * FROM horarios WHERE dia = ?", [dia]); }
function updateHorario(dia, abierto, hora_inicio, hora_fin) {
  run("UPDATE horarios SET abierto=?, hora_inicio=?, hora_fin=? WHERE dia=?", [abierto, hora_inicio, hora_fin, dia]);
}

// ─── BANCO ────────────────────────────────────────────────────────────────────
function getBanco() { return queryOne("SELECT * FROM banco WHERE activo = 1 ORDER BY id DESC"); }
function updateBanco(banco, beneficiario, clabe) {
  run("UPDATE banco SET banco=?, beneficiario=?, clabe=? WHERE activo=1", [banco, beneficiario, clabe]);
}

// ─── MENSAJES BOT ─────────────────────────────────────────────────────────────
function getMensaje(clave) {
  const row = queryOne("SELECT valor FROM mensajes_bot WHERE clave = ?", [clave]);
  return row ? row.valor : null;
}
function setMensaje(clave, valor) {
  run("INSERT OR REPLACE INTO mensajes_bot (clave, valor) VALUES (?,?)", [clave, valor]);
}
function getAllMensajes() { return queryAll("SELECT * FROM mensajes_bot"); }

// ─── PRODUCTOS ────────────────────────────────────────────────────────────────
function getProductos() { return queryAll("SELECT * FROM productos WHERE activo = 1"); }
function getProducto(nombre) {
  return queryOne("SELECT * FROM productos WHERE nombre = ? AND activo = 1", [nombre.toLowerCase()]);
}
function updateProducto(id, datos) {
  run("UPDATE productos SET nombre=?, descripcion=?, precio_taco=?, precio_torta=?, precio_100g=?, activo=? WHERE id=?",
    [datos.nombre, datos.descripcion, datos.precio_taco, datos.precio_torta, datos.precio_100g, datos.activo, id]);
}
function createProducto(datos) {
  run("INSERT INTO productos (nombre, descripcion, precio_taco, precio_torta, precio_100g) VALUES (?,?,?,?,?)",
    [datos.nombre, datos.descripcion, datos.precio_taco, datos.precio_torta, datos.precio_100g]);
}
function deleteProducto(id) { run("UPDATE productos SET activo = 0 WHERE id = ?", [id]); }

// ─── CLIENTES ─────────────────────────────────────────────────────────────────
function getCliente(telefono) {
  return queryOne("SELECT * FROM clientes WHERE telefono = ?", [telefono]);
}
function getAllClientes() {
  return queryAll("SELECT * FROM clientes ORDER BY fecha_registro DESC");
}
function upsertCliente(datos) {
  const existe = getCliente(datos.telefono);
  if (existe) {
    run(`UPDATE clientes SET
      nombre       = COALESCE(?, nombre),
      apellido     = COALESCE(?, apellido),
      correo       = COALESCE(?, correo),
      calle_numero = COALESCE(?, calle_numero),
      colonia      = COALESCE(?, colonia),
      referencia   = COALESCE(?, referencia)
      WHERE telefono = ?`,
      [datos.nombre, datos.apellido, datos.correo, datos.calle_numero, datos.colonia, datos.referencia, datos.telefono]);
  } else {
    run("INSERT INTO clientes (nombre, apellido, telefono, correo, calle_numero, colonia, referencia) VALUES (?,?,?,?,?,?,?)",
      [datos.nombre, datos.apellido, datos.telefono, datos.correo, datos.calle_numero, datos.colonia, datos.referencia]);
  }
  return getCliente(datos.telefono);
}
function deleteCliente(id) { run("DELETE FROM clientes WHERE id = ?", [id]); }

// ─── PEDIDOS ──────────────────────────────────────────────────────────────────
function registrarPedido(datos) {
  run(`INSERT INTO pedidos (cliente_id, tipo, orden, total, metodo_pago, estado, hora_entrega) VALUES (?,?,?,?,?,?,?)`,
    [datos.cliente_id, datos.tipo, datos.orden, datos.total, datos.metodo_pago, datos.estado || "pendiente", datos.hora_entrega]);
  if (datos.cliente_id)
    run("UPDATE clientes SET total_pedidos = total_pedidos + 1 WHERE id = ?", [datos.cliente_id]);
  const ultimo = queryOne("SELECT last_insert_rowid() as id");
  return ultimo ? ultimo.id : null;
}
function actualizarEstadoPedido(telefono, estado) {
  run(`UPDATE pedidos SET estado = ? WHERE id = (
    SELECT p.id FROM pedidos p
    INNER JOIN clientes c ON p.cliente_id = c.id
    WHERE c.telefono = ? AND p.estado = 'pendiente'
    ORDER BY p.fecha DESC LIMIT 1)`, [estado, telefono]);
}
function getPedidosHoy() {
  return queryAll(`SELECT p.*, c.nombre, c.apellido, c.telefono FROM pedidos p
    LEFT JOIN clientes c ON p.cliente_id = c.id
    WHERE date(p.fecha) = date('now', 'localtime') ORDER BY p.fecha DESC`);
}
function getAllPedidos() {
  return queryAll(`SELECT p.*, c.nombre, c.apellido, c.telefono FROM pedidos p
    LEFT JOIN clientes c ON p.cliente_id = c.id ORDER BY p.fecha DESC LIMIT 200`);
}
function updatePedidoEstado(id, estado) { run("UPDATE pedidos SET estado = ? WHERE id = ?", [estado, id]); }
function deletePedido(id) { run("DELETE FROM pedidos WHERE id = ?", [id]); }

// ─── USUARIOS PANEL ───────────────────────────────────────────────────────────
function getUsuarioPanel(usuario) {
  return queryOne("SELECT * FROM usuarios_panel WHERE usuario = ?", [usuario]);
}
function updatePasswordPanel(usuario, hash) {
  run("UPDATE usuarios_panel SET password = ? WHERE usuario = ?", [hash, usuario]);
}

// ─── SESIONES ACTIVAS ─────────────────────────────────────────────────────────
function guardarSesion(numero, estadoObj, historial = []) {
  if (!db) return;
  try {
    db.run(
      `INSERT OR REPLACE INTO sesiones_activas (numero, estado_json, historial_json, actualizado_en)
       VALUES (?, ?, ?, datetime('now', 'localtime'))`,
      [numero, JSON.stringify(estadoObj), JSON.stringify(historial)]
    );
    guardarDB();
  } catch (e) { console.error("[SESION] Error guardando sesión:", e.message); }
}

function eliminarSesion(numero) {
  if (!db) return;
  try {
    db.run("DELETE FROM sesiones_activas WHERE numero = ?", [numero]);
    guardarDB();
  } catch (e) { console.error("[SESION] Error eliminando sesión:", e.message); }
}

function cargarTodasLasSesiones() {
  if (!db) return [];
  try {
    return queryAll("SELECT numero, estado_json, historial_json FROM sesiones_activas").map(r => ({
      numero:    r.numero,
      estado:    JSON.parse(r.estado_json   || "{}"),
      historial: JSON.parse(r.historial_json || "[]"),
    }));
  } catch (e) { console.error("[SESION] Error cargando sesiones:", e.message); return []; }
}

function limpiarSesionesAntiguas(horas = 6) {
  if (!db) return;
  try {
    db.run(`DELETE FROM sesiones_activas WHERE actualizado_en < datetime('now', 'localtime', '-${horas} hours')`);
    guardarDB();
  } catch (e) { console.error("[SESION] Error limpiando sesiones:", e.message); }
}

// ─── TELÉFONOS REALES ─────────────────────────────────────────────────────────
function guardarTelefonoReal(numeroWhatsApp, telefonoReal) {
  run("INSERT OR REPLACE INTO configuracion (clave, valor) VALUES (?,?)",
    [`tel_real_${numeroWhatsApp}`, telefonoReal]);
}

function getTelefonoReal(numeroWhatsApp) {
  const row = queryOne("SELECT valor FROM configuracion WHERE clave = ?", [`tel_real_${numeroWhatsApp}`]);
  return row ? row.valor : null;
}

module.exports = {
  initDB,
  getConfig, setConfig, getAllConfig,
  getHorarios, getHorarioDia, updateHorario,
  getBanco, updateBanco,
  getMensaje, setMensaje, getAllMensajes,
  getProductos, getProducto, updateProducto, createProducto, deleteProducto,
  getCliente, getAllClientes, upsertCliente, deleteCliente,
  registrarPedido, actualizarEstadoPedido, getPedidosHoy, getAllPedidos, updatePedidoEstado, deletePedido,
  getUsuarioPanel, updatePasswordPanel,
  guardarSesion, eliminarSesion, cargarTodasLasSesiones, limpiarSesionesAntiguas,
  guardarTelefonoReal, getTelefonoReal,
};