const { getDB, guardarDB, run, queryOne } = require("./core");

async function seedDB() {
  const db = getDB();

  // ── CREAR TABLAS ───────────────────────────────────────────────────────────
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
    CREATE TABLE IF NOT EXISTS pagos_pendientes (
      pedido_id  TEXT PRIMARY KEY,
      jid        TEXT NOT NULL,
      telefono   TEXT NOT NULL DEFAULT '',
      nombre     TEXT         DEFAULT '',
      resumen    TEXT         DEFAULT '',
      expira_en  TEXT NOT NULL
    );
  `);

  // ── MIGRACIONES (columnas nuevas en tablas existentes) ─────────────────────
  try { db.run("ALTER TABLE clientes ADD COLUMN ultimo_pedido_json TEXT"); } catch (_) {}
  try { db.run("ALTER TABLE productos ADD COLUMN sinonimos TEXT DEFAULT ''"); } catch (_) {}
  try { db.run("ALTER TABLE productos ADD COLUMN categoria TEXT DEFAULT 'corte'"); } catch (_) {}

  // ── SEED PRODUCTOS ─────────────────────────────────────────────────────────
  const countProd = db.exec("SELECT COUNT(*) as c FROM productos")[0]?.values[0][0] || 0;
  if (countProd === 0) {
    const productos = [
      ["surtido", "El favorito de la casa y amado por la gran mayoría de nuestros clientes. Es una combinación de todos nuestros cortes: carne, buche, cuero y lengua, dando como resultado un surtido jugoso, delicioso, con ese sabor incomparable de Tacos Javier.", 30, 40, 32, "surtida,mixto,mixta"],
      ["carne",   "Puede variar entre espaldilla, pierna y aldilla. Es fibra pura con un muy bajo porcentaje de grasa, con ese sabor incomparable que solo encuentras en Tacos Javier. Perfecto para unos tacos que rayen en lo light.", 30, 40, 32, "carnitas,carnita,carner,maciza,masiza"],
      ["buche",   "Básicamente es el estómago del puerco. Tiene una textura consistente, similar al cuero pero con un sabor parecido al de la tripa. Perfecto para botanas o acompañado en tacos, y más si es con la calidad y sabor de Tacos Javier.", 30, 40, 32, "buchito,buchon,buchones"],
      ["cuero",   "Es la piel del puerco, la capa más delgada y limpia de cebo, con una textura muy suave y delicada. No te arrepentirás de acompañar tus tacos con una deliciosa botana de cueros — eso sí, si son de Tacos Javier el éxito está garantizado.", 30, 40, 32, "cueros,cueritos,cuerito"],
      ["lengua",  "Tiene una textura muy suave y consistente, casi cremosa, con un sabor intenso pero limpio, más delicado que otras partes del cerdo. Cuando está bien cocinada se deshace fácilmente y queda muy jugosa. Si es de Tacos Javier, ni para qué te cuento.", 30, 40, 32, "lenguita,lenguitas"],
    ];
    for (const [nombre, desc, taco, torta, g100, sins] of productos) {
      db.run("INSERT INTO productos (nombre, descripcion, precio_taco, precio_torta, precio_100g, sinonimos) VALUES (?,?,?,?,?,?)",
        [nombre, desc, taco, torta, g100, sins]);
    }
    console.log("✅ Productos iniciales insertados");
  } else {
    db.run("UPDATE productos SET nombre = 'carne' WHERE nombre = 'carner'");
    db.run("UPDATE productos SET categoria = 'corte' WHERE categoria IS NULL");
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
    const sinonimosDefault = [
      ["surtido", "surtida,mixto,mixta"],
      ["carne",   "carnitas,carnita,carner,maciza,masiza"],
      ["buche",   "buchito,buchon,buchones"],
      ["cuero",   "cueros,cueritos,cuerito"],
      ["lengua",  "lenguita,lenguitas"],
    ];
    for (const [nombre, sins] of sinonimosDefault) {
      db.run("UPDATE productos SET sinonimos = ? WHERE nombre = ? AND (sinonimos IS NULL OR sinonimos = '')", [sins, nombre]);
    }
  }

  // ── SEED REFRESCOS ─────────────────────────────────────────────────────────
  const refrescosData = [
    ["coca cola", "Refresco Coca-Cola bien frío 🥤", 20, 20, 0, "coca,coke,cola,coca-cola", "refresco"],
    ["fanta",     "Refresco Fanta bien frío 🥤",     20, 20, 0, "fanta,naranja",             "refresco"],
    ["sprite",    "Refresco Sprite bien frío 🥤",    20, 20, 0, "sprite,limon,limón",        "refresco"],
  ];
  for (const [nombre, desc, taco, torta, g100, sins, cat] of refrescosData) {
    const ya = queryOne("SELECT id FROM productos WHERE nombre = ?", [nombre]);
    if (!ya) {
      run("INSERT INTO productos (nombre, descripcion, precio_taco, precio_torta, precio_100g, sinonimos, categoria) VALUES (?,?,?,?,?,?,?)",
        [nombre, desc, taco, torta, g100, sins, cat]);
    }
  }

  // ── SEED SALSAS ────────────────────────────────────────────────────────────
  try { db.run("ALTER TABLE productos ADD COLUMN categoria TEXT DEFAULT 'corte'"); } catch (_) {}
  const salsasData = [
    ["picada",  "Salsa picada de la casa 🌶️",   0, 0, 0, "picante,salsa picada",               "salsa"],
    ["cebolla", "Cebolla fresca 🧅",             0, 0, 0, "cebollas,cebollita,cebollitas,cebolla rallada", "salsa"],
    ["suave",   "Salsa suave 🌿",               0, 0, 0, "salsa suave,verde",                   "salsa"],
    ["roja",    "Salsa roja casera 🔴",          0, 0, 0, "salsa roja",                          "salsa"],
    ["limones", "Limones frescos 🍋",            0, 0, 0, "limon,limón,limonez,limonazo",        "salsa"],
  ];
  for (const [nombre, desc, taco, torta, g100, sins, cat] of salsasData) {
    const ya = queryOne("SELECT id FROM productos WHERE nombre = ?", [nombre]);
    if (!ya) {
      run("INSERT INTO productos (nombre, descripcion, precio_taco, precio_torta, precio_100g, sinonimos, categoria) VALUES (?,?,?,?,?,?,?)",
        [nombre, desc, taco, torta, g100, sins, cat]);
    } else {
      run("UPDATE productos SET categoria = ? WHERE nombre = ?", [cat, nombre]);
    }
  }
  // Rename legacy "cebolla rallada" if it exists
  run("UPDATE productos SET nombre = 'cebolla', sinonimos = 'cebollas,cebollita,cebollitas,cebolla rallada' WHERE nombre = 'cebolla rallada'");

  // ── SEED CONFIGURACIÓN ─────────────────────────────────────────────────────
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
      ["tipo_negocio",       "carnitas de puerco"],
      ["tiempo_cancelacion", "15"],
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
      ["tipo_negocio",        "carnitas de puerco"],
      ["tiempo_cancelacion",  "15"],
    ];
    for (const [clave, valor] of nuevos) {
      db.run("INSERT OR IGNORE INTO configuracion (clave, valor) VALUES (?,?)", [clave, valor]);
    }
  }

  // ── SEED HORARIOS ──────────────────────────────────────────────────────────
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

  // ── SEED BANCO ─────────────────────────────────────────────────────────────
  const countBanco = db.exec("SELECT COUNT(*) as c FROM banco")[0]?.values[0][0] || 0;
  if (countBanco === 0) {
    db.run("INSERT INTO banco (banco, beneficiario, clabe) VALUES (?,?,?)",
      ["", "", ""]);
    console.log("✅ Datos bancarios iniciales insertados");
  }

  // ── SEED MENSAJES BOT ──────────────────────────────────────────────────────
  const countMsg = db.exec("SELECT COUNT(*) as c FROM mensajes_bot")[0]?.values[0][0] || 0;
  if (countMsg === 0) {
    const mensajes = [
      ["saludo",                "¡Bienvenido a *{negocio}*! 🌮🔥\n\n¿Tu pedido será para *domicilio* 🛵 o pasas a *recoger al mostrador* 🏪?"],
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
  // Migración: claves nuevas en mensajes_bot (INSERT OR IGNORE para instancias existentes)
  const nuevosMsgs = [
    ["comprobante_recibido", "¡Gracias! Recibimos tu comprobante 📸\nTu pedido fue solicitado exitosamente y solo queda la confirmación de nuestro equipo de trabajo.\nEn breve te avisamos 🙏"],
  ];
  for (const [clave, valor] of nuevosMsgs) {
    db.run("INSERT OR IGNORE INTO mensajes_bot (clave, valor) VALUES (?,?)", [clave, valor]);
  }

  // ── SEED USUARIO PANEL ─────────────────────────────────────────────────────
  const countUser = db.exec("SELECT COUNT(*) as c FROM usuarios_panel")[0]?.values[0][0] || 0;
  if (countUser === 0) {
    const bcrypt = require("bcryptjs");
    const hash   = bcrypt.hashSync("admin123", 10);
    db.run("INSERT INTO usuarios_panel (usuario, password) VALUES (?,?)", ["admin", hash]);
    console.log("✅ Usuario panel creado: admin / admin123");
  }

  guardarDB();
  console.log("✅ Base de datos lista");
}

module.exports = { seedDB };
