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

  // ── TABLAS PARA ZONAS DE ENVÍO ────────────────────────────────────────────
  try { run(`CREATE TABLE IF NOT EXISTS colonias (
    id          INTEGER PRIMARY KEY AUTOINCREMENT,
    nombre      TEXT UNIQUE NOT NULL,
    lat         REAL NOT NULL,
    lon         REAL NOT NULL,
    activo      INTEGER DEFAULT 1
  )`); } catch (_) {}

  // Migraciones colonias: campos enriquecidos para el super-admin
  try { db.run("ALTER TABLE colonias ADD COLUMN slug    TEXT DEFAULT ''"); } catch (_) {}
  try { db.run("ALTER TABLE colonias ADD COLUMN tipo    TEXT DEFAULT 'colonia'"); } catch (_) {}
  try { db.run("ALTER TABLE colonias ADD COLUMN aliases TEXT DEFAULT '[]'"); } catch (_) {}

  // Poblar slug en registros existentes que no lo tengan
  try {
    const sinSlug = db.prepare("SELECT id, nombre FROM colonias WHERE slug = '' OR slug IS NULL").all();
    const stmtSlug = db.prepare("UPDATE colonias SET slug = ? WHERE id = ?");
    for (const { id, nombre } of sinSlug) {
      const slug = (nombre || '').toLowerCase()
        .normalize('NFD').replace(/[̀-ͯ]/g, '')
        .replace(/\s+/g, '-').replace(/[^a-z0-9-]/g, '').replace(/-+/g, '-').replace(/^-|-$/g, '');
      stmtSlug.run(slug, id);
    }
  } catch (_) {}
  try { run(`CREATE TABLE IF NOT EXISTS tarifas_zonas (
    id            INTEGER PRIMARY KEY AUTOINCREMENT,
    nombre_zona   TEXT NOT NULL,
    distancia_max REAL NOT NULL,
    tarifa        REAL NOT NULL
  )`); } catch (_) {}

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

  // ── MIGRACIÓN: SURTIDO ESPECIAL ───────────────────────────────────────────────
  {
    const yaSE = queryOne("SELECT id FROM productos WHERE nombre = 'surtido especial'");
    if (!yaSE) {
      const surtido = queryOne("SELECT precio_taco, precio_torta, precio_100g FROM productos WHERE nombre = 'surtido'");
      const pt  = surtido ? surtido.precio_taco  : 30;
      const por = surtido ? surtido.precio_torta : 40;
      const pg  = surtido ? surtido.precio_100g  : 32;
      run("INSERT INTO productos (nombre, descripcion, precio_taco, precio_torta, precio_100g, sinonimos, categoria) VALUES (?,?,?,?,?,?,?)",
        ["surtido especial", "Combinación personalizada de cortes a elección del cliente.", pt, por, pg, "", "corte"]);
      console.log("✅ Producto 'surtido especial' insertado");
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
      ["metodos_mostrador",        "efectivo, tarjeta o transferencia"],
      ["metodos_domicilio",        "efectivo o transferencia"],
      ["tipo_negocio",             "carnitas de puerco"],
      ["tiempo_cancelacion",       "15"],
      ["precio_salsa",             "15"],
      ["timeout_recordatorio_min", "20"],
      ["timeout_sesion_min",       "35"],
    ];
    for (const [clave, valor] of config) {
      db.run("INSERT INTO configuracion (clave, valor) VALUES (?,?)", [clave, valor]);
    }
    console.log("✅ Configuración inicial insertada");
  } else {
    const nuevos = [
      ["precio_taco",              "30"],
      ["precio_torta",             "40"],
      ["precio_100g",              "32"],
      ["metodos_mostrador",        "efectivo, tarjeta o transferencia"],
      ["metodos_domicilio",        "efectivo o transferencia"],
      ["tipo_negocio",             "carnitas de puerco"],
      ["tiempo_cancelacion",       "15"],
      ["precio_salsa",             "15"],
      ["timeout_recordatorio_min", "20"],
      ["timeout_sesion_min",       "35"],
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
    ["menu_nota_precios",  "_Los precios incluyen tortillas y salsas_ 😊"],
    ["menu_taco_nota",     "_(combinaciones al gusto)_"],
    ["menu_gramos_nota",   "Cualquier pieza o combinación\n_Incluye tortillas y salsas_"],
    ["menu_salsas_nota",   "_(Los tacos y tortas ya incluyen salsas gratis)_"],
    ["menu_por_cantidad",  "Tú decides cuánto gastar, nosotros pesamos\n_Incluye tortillas y salsas_"],
    ["menu_pie_salsas",    "🟢 Todos los tacos y tortas incluyen salsas"],
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

  // ── SEED COLONIAS (solo si la tabla está vacía) ────────────────────────────
  const countCol = queryOne("SELECT COUNT(*) as c FROM colonias")?.c || 0;
  if (countCol === 0) {
    const colonias = [
      ["12 de Diciembre",21.489774911653697,-104.87658950490167],["15 de Mayo",21.47828556679425,-104.89005078290481],
      ["18 de Agosto",21.502739921116525,-104.87804988964112],["20 de Noviembre",21.51618455937892,-104.91094930753725],
      ["26 de Septiembre",21.4720236423838,-104.88212671858568],["2 de Agosto",21.48077906026589,-104.87111848445387],
      ["4 Milpas",21.491692448537023,-104.87536510832986],["5 de Febrero",21.468095194296012,-104.87073957710953],
      ["Acayapan",21.519660215786132,-104.89514252134343],["Adolfo López Mateos",21.526478841562863,-104.90680942548025],
      ["Alaska",21.52351717743389,-104.9238464115534],["Amado Nervo",21.51936056311773,-104.89257898448878],
      ["América Manríquez",21.525020767867538,-104.91368148534733],["Ampliación Tierra y Libertad",21.504496354562985,-104.87676722921434],
      ["Aramara",21.496444356137797,-104.82132676024855],["Arboledas",21.53389340896135,-104.8773722339332],
      ["Aves del Paraíso",21.505807739784622,-104.91514143963101],["Aviación",21.47413757848202,-104.88132119320032],
      ["Aztlán Solidaridad",21.52490942794132,-104.93272647904094],["Benito Juárez",21.497670005950738,-104.90767969479212],
      ["Bethel",21.479062097156625,-104.91058346162717],["Bonaterra",21.46569420132228,-104.8432806525549],
      ["Brisas de San Juan",21.51450580432022,-104.92733851802282],["Buenos Aires",21.534018176355428,-104.90519307245624],
      ["Bugambilias",21.478510784867755,-104.87853340722658],["Burócrata Estatal",21.484128317138907,-104.87921544746395],
      ["Caja de Agua",21.495949200989884,-104.89585865244058],["Caminera",21.471971363956047,-104.8858414209668],
      ["Camino Real",21.517528054553456,-104.87192403107173],["Castilla",21.468256961829848,-104.88202074688095],
      ["Chapultepec",21.520190389255607,-104.8808542119398],["Ciudad del Valle",21.490458810678255,-104.885434748645],
      ["Ciudad Industrial",21.478814997339605,-104.84633817145053],["Colinas del Rey",21.487657925437848,-104.90781622968203],
      ["Colonial",21.478069539619206,-104.87215605967286],["Cora",21.502930926796214,-104.91816096953514],
      ["Cuauhtémoc",21.484881758689603,-104.90657273246448],["Del Bosque",21.49263427787895,-104.90427121377225],
      ["Del Sol",21.504652937409507,-104.8697349314376],["Ejidal",21.49027232793564,-104.83062864492258],
      ["El Aguacate",21.506926591948574,-104.92067132216697],["El Armadillo",21.46139821045422,-104.84960763857204],
      ["Electricistas",21.50011198210533,-104.90274198607756],["El Mirador INFONAVIT",21.525959585935215,-104.88545416071835],
      ["El Paraíso",21.538068726599995,-104.87261176099412],["El Pedregal",21.498480285198234,-104.91785190029789],
      ["El Puerto",21.471117347830653,-104.85272875256689],["El Punto",21.536483253020485,-104.89430827951031],
      ["El Rodeo",21.521543057110872,-104.91816524280651],["El Tecolote",21.500543186971093,-104.9086679926038],
      ["El Tecolote INFONAVIT",21.500936353125407,-104.90522416619409],["Emiliano Zapata",21.516935786873848,-104.90649156973524],
      ["Estadios",21.512570414857464,-104.90456223210765],["Esteban Baca Calderón",21.502248334736198,-104.88655489433012],
      ["Félix Peña",21.478903743713452,-104.89789289429088],["Flamingos",21.49527270266536,-104.87381542160864],
      ["Florencia",21.4897795,-104.8854245],["Flores Magón",21.501473551762814,-104.87225358484572],
      ["Francisco Villa",21.52864454531759,-104.88729985591642],["Gardenias",21.471779488580182,-104.89101344135196],
      ["Genaro Vázquez",21.50649438290829,-104.86973250155556],["Gilberto Flores Muñoz",21.50616296255626,-104.8838192458357],
      ["Gobernadores",21.4865662155212,-104.87239249389923],["Guadalupe",21.526336157133283,-104.93058414778532],
      ["Gustavo Díaz Ordaz",21.48173098102303,-104.87500208039948],["Heriberto Casas",21.516108317841304,-104.90194863611411],
      ["Heriberto Jara",21.50264123327722,-104.8756983710847],["Hermosa Provincia",21.48006955148632,-104.88003215096278],
      ["IMSS",21.514667231722164,-104.91170875743342],["INDECO",21.528328635354143,-104.90347815416159],
      ["Independencia",21.50316430133397,-104.90759736086106],["Insurgentes",21.47287306251885,-104.89473016846294],
      ["Jacarandas",21.482243238511575,-104.85428227362954],["Jardines de La Cruz",21.496057244211197,-104.89813056068235],
      ["Jazmines",21.485993822045177,-104.83277960337708],["Jesús García",21.485210426425226,-104.83883313389097],
      ["Juan Escutia",21.472753177142096,-104.8886648905005],["Juventud",21.49364226145953,-104.87721246597144],
      ["La Esperanza",21.506765479765726,-104.8713409974782],["Lagos del Country",21.48014033210326,-104.86231219214804],
      ["La Huerta",21.518938879017657,-104.91299997918517],["La Joya",21.475709407126473,-104.8707959375292],
      ["La Loma",21.50384179053414,-104.90466886370884],["Las Aves",21.494926571082814,-104.88068432498017],
      ["Las Brisas",21.516862082687737,-104.92250278932708],["Las Flores",21.526056424691784,-104.918796799223],
      ["Las Islas",21.472369428508806,-104.86417268608027],["Las Palomas",21.459335964388917,-104.85567723478],
      ["Lázaro Cárdenas",21.479417501346305,-104.88704285277828],["Leyva Medina",21.476870675373984,-104.89264541171104],
      ["Lindavista",21.51058948784751,-104.92002638029078],["Lirios",21.504988400896895,-104.87906558696561],
      ["Loma Hermosa",21.534611655521097,-104.89052591670048],["Lomas Bonitas",21.526794488676327,-104.92410319527124],
      ["Lomas de La Cruz",21.52332974266508,-104.88300616946546],["Lomas del Valle",21.528843571935614,-104.9225386143343],
      ["Lomas de San Juan",21.50244901907581,-104.9213109410473],["Los Arcos",21.527896369657533,-104.87591854219889],
      ["Los Colomos",21.500368028154323,-104.87968093776288],["Los Fresnos",21.485025353505407,-104.89148305964078],
      ["Los Fresnos INFONAVIT",21.478631,-104.877652],["Los Llanitos",21.492085494726453,-104.87884997755795],
      ["Los Pinos",21.530801943133746,-104.89318164591468],["Los Sauces",21.470041096034024,-104.87683008278944],
      ["Los Sauces INFONAVIT",21.470912418896997,-104.87539987489824],["Luis Donaldo Colosio",21.50977023270726,-104.88147903638739],
      ["Luis Donaldo Colosio Murrieta",21.48693383678135,-104.86080169951099],["México",21.49103618106805,-104.87434886108339],
      ["Miguel Hidalgo",21.471574025693833,-104.86100264678299],["Miravalles",21.47452702735179,-104.89150957393237],
      ["Moctezuma",21.48721919230847,-104.89727081193003],["Molinos del Rey",21.49087145714268,-104.84816891077922],
      ["Mololoa",21.51709947837223,-104.88724134751007],["Morelos",21.49623046148686,-104.90240662865816],
      ["Niños Héroes",21.468599477347947,-104.87235641273283],["Nueva Alemania",21.49770651437621,-104.91063593045368],
      ["Nuevas Delicias",21.523012691647654,-104.9382125066764],["Nuevas Palomas",21.468124924824476,-104.8577526677122],
      ["Nuevo Progreso",21.5429173,-104.8638528],["Ojo de Agua",21.53176726503445,-104.90183024193759],
      ["Olimpo",21.5115309,-104.920337],["Oriental",21.488530557835222,-104.87007958251759],
      ["Parque Ecológico",21.481833032801358,-104.85798647816473],["Paseo del Valle Real",21.462716155168742,-104.86232075868647],
      ["Plan de Ayala",21.466375688898914,-104.87693721400674],
      ["Puente de San Cayetano",21.46989961820942,-104.8543539811257],["Puerta Encanto",21.48656650726913,-104.8441383901154],
      ["Reforma",21.531995896994154,-104.87867279986888],["Revolución",21.488538838704798,-104.82193820823036],
      ["Rey Nayar",21.505530949063772,-104.9194874481267],["Rinconada Residencial",21.523403790875054,-104.91497536976699],
      ["Rincón de San Juan",21.502218389058914,-104.91336655954443],["Rivas Allende",21.512532296968768,-104.88313080280402],
      ["Rodeo de La Punta",21.519558968051314,-104.9251612493746],["San Antonio",21.501317751012532,-104.89381632478442],
      ["Sandino",21.510502504707397,-104.88367643576079],["San José",21.52161373755133,-104.88787311216846],
      ["San Juan",21.50954780675665,-104.90763138487331],["San Juanito",21.51342106187347,-104.86856037550825],
      ["Santa Cecilia",21.530023994117872,-104.89650120122444],["Santa Teresita",21.523723878522574,-104.89981046369124],
      ["Tepic Centro",21.51043411892842,-104.89224137779881],["Tierra y Libertad",21.506718358666085,-104.88054217053076],
      ["Tulipanes",21.5294835,-104.8713718],["Universidad Autónoma de Nayarit",21.4919338,-104.8923585],
      ["Valle de La Cruz",21.533072107058725,-104.86742047625856],["Valle del Country",21.48417806346254,-104.86358131304719],
      ["Valle de Matatipac",21.473727653753553,-104.86832550673317],["Valle de Nayarit",21.47854072239635,-104.90863666114467],
      ["Valle de Zaragoza",21.53431806820959,-104.86802377593462],["Valle Dorado",21.48469049998398,-104.90350032338661],
      ["Valle Magno",21.4629947,-104.8513475],["Valle Verde",21.525695176614278,-104.87599871949843],
      ["Venceremos",21.508542139714702,-104.8739979768291],["Versalles Sur",21.504983609737376,-104.91062186466269],
      ["Villas de La Cantera",21.489341837128023,-104.84047709752696],["Villas de La Paz",21.48169176835435,-104.8904018305404],
      ["Villas del Molino",21.488578339027256,-104.84518549649354],["Villas del Parque",21.4911759003916,-104.85532862707649],
      ["Villas de San Juan",21.50301555798608,-104.91894276364866],["Vistas de La Cantera",21.49149344976705,-104.82998260825234],
      ["Zitacua",21.50523744811259,-104.8698264860915],
      ["Ampliación El Paraíso",21.536738782046857,-104.86930496486958],["Ampliación Santa Teresita",21.522678812881992,-104.8951016835117],
      ["El Faisán",21.529957827689223,-104.89109084562004],["El Rubí",21.4866034977113,-104.84112073143119],
      ["FOVISSSTE 1a Etapa",21.515917846191225,-104.91723960791154],["FOVISSSTE 2a Etapa",21.51742995799435,-104.92700214472366],
      ["La Lomita",21.523433201656655,-104.87458188706125],["Residencial La Loma",21.503963713790064,-104.90462010833275],
      ["Residencial los Olivos",21.4951731,-104.8161051],
      ["Colinas del Valle",21.489512776541385,-104.84706436360527],
    ];
    for (const [nombre, lat, lon] of colonias) {
      try { run("INSERT INTO colonias (nombre, lat, lon) VALUES (?,?,?)", [nombre, lat, lon]); } catch (_) {}
    }
    console.log(`✅ ${colonias.length} colonias insertadas`);
  }

  // ── SEED TARIFAS ZONAS (solo si está vacío) ────────────────────────────────
  const countZonas = queryOne("SELECT COUNT(*) as c FROM tarifas_zonas")?.c || 0;
  if (countZonas === 0) {
    const zonas = [
      ["Zona 1 — Cerca",  3,    30],
      ["Zona 2 — Media",  6,    50],
      ["Zona 3 — Lejos",  10,   70],
      ["Zona 4 — Muy lejos", 9999, 100],
    ];
    for (const [nombre_zona, distancia_max, tarifa] of zonas) {
      run("INSERT INTO tarifas_zonas (nombre_zona, distancia_max, tarifa) VALUES (?,?,?)",
        [nombre_zona, distancia_max, tarifa]);
    }
    console.log("✅ Zonas de tarifa iniciales insertadas");
  }

  // Config: coordenadas del negocio (solo si no existen)
  run("INSERT OR IGNORE INTO configuracion (clave, valor) VALUES ('negocio_lat', '')");
  run("INSERT OR IGNORE INTO configuracion (clave, valor) VALUES ('negocio_lon', '')");

  // Config: dirección y grupo de mandaditos
  run("INSERT OR IGNORE INTO configuracion (clave, valor) VALUES ('negocio_calle', '')");
  run("INSERT OR IGNORE INTO configuracion (clave, valor) VALUES ('negocio_colonia', '')");
  run("INSERT OR IGNORE INTO configuracion (clave, valor) VALUES ('negocio_referencia', '')");
  run("INSERT OR IGNORE INTO configuracion (clave, valor) VALUES ('grupo_mandaditos_id', '')");

  // Config: IA y pasarela de pagos (administradas desde super-admin)
  run("INSERT OR IGNORE INTO configuracion (clave, valor) VALUES ('groq_activo', '0')");
  run("INSERT OR IGNORE INTO configuracion (clave, valor) VALUES ('pasarela_activa', '')");
  run("INSERT OR IGNORE INTO configuracion (clave, valor) VALUES ('pasarela_config', '{}')");

  // Config: modalidad de notificaciones (grupo o privado) — configurada por super-admin
  run("INSERT OR IGNORE INTO configuracion (clave, valor) VALUES ('notif_modalidad', 'grupo')");

  // ── DESPACHOS PROGRAMADOS (preventa a domicilio) ───────────────────────────
  run(`CREATE TABLE IF NOT EXISTS despachos_programados (
    id              INTEGER PRIMARY KEY AUTOINCREMENT,
    pedido_id       INTEGER NOT NULL,
    cliente_nombre  TEXT    NOT NULL,
    cliente_tel     TEXT    NOT NULL,
    cliente_calle   TEXT,
    cliente_colonia TEXT,
    cliente_ref     TEXT,
    total_orden     TEXT,
    tarifa          INTEGER,
    hora_despacho   TEXT    NOT NULL,
    ejecutado       INTEGER NOT NULL DEFAULT 0
  )`);

  guardarDB();
  console.log("✅ Base de datos lista");
}

module.exports = { seedDB };
