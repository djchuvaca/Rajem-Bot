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

  // ── SEED COLONIAS (solo si la tabla está vacía) ────────────────────────────
  const countCol = queryOne("SELECT COUNT(*) as c FROM colonias")?.c || 0;
  if (countCol === 0) {
    const colonias = [
      ["12 de Diciembre",21.4897071,-104.8767138],["15 de Mayo",21.4777308,-104.8897911],
      ["18 de Agosto",21.5028469,-104.878283],["20 de Noviembre",21.5636606,-104.8848843],
      ["26 de Septiembre",21.4725834,-104.8821049],["2 de Agosto",21.4775149,-104.8681551],
      ["4 Milpas",21.4906163,-104.8769032],["5 de Febrero",21.5175888,-104.8905277],
      ["Acayapan",21.5253526,-104.9033261],["Adolfo López Mateos",21.5271945,-104.9053069],
      ["Alaska",21.5217487,-104.9236036],["Amado Nervo",21.4641084,-104.8020015],
      ["América Manríquez",21.4968898,-104.8935537],["Ampliación Tierra y Libertad",21.5051932,-104.8766765],
      ["Aramara",21.496545,-104.874594],["Arboledas",21.5338386,-104.8771689],
      ["Aves del Paraíso",21.5061112,-104.9145698],["Aviación",21.4834919,-104.8834844],
      ["Aztlán Solidaridad",21.5254698,-104.9326656],["Benito Juárez",21.598246,-105.0032223],
      ["Bethel",21.4790067,-104.9107681],["Bonaterra",21.465546,-104.8438497],
      ["Brisas de San Juan",21.5146917,-104.92743],["Buenos Aires",21.4943654,-104.8864777],
      ["Bugambilias",21.533677,-104.8650027],["Burócrata Estatal",21.4881008,-104.9007732],
      ["Caja de Agua",21.4957981,-104.8958893],["Caminera",21.4723149,-104.8866707],
      ["Camino Real",21.492647,-104.8515084],["Castilla",21.4681625,-104.8801163],
      ["Chapultepec",21.5384608,-104.8775115],["Ciudad del Valle",21.4906425,-104.8859141],
      ["Ciudad Industrial",21.4783454,-104.8425406],["Colinas del Rey",21.4879517,-104.9072064],
      ["Colonial",21.4784242,-104.8719046],["Cora",21.5021018,-104.9177896],
      ["Cuauhtémoc",21.4849586,-104.9062944],["Del Bosque",21.4925407,-104.9036646],
      ["Del Sol",21.504771,-104.8693631],["Ejidal",21.4492568,-104.8225308],
      ["El Aguacate",21.515633,-104.944309],["El Armadillo",21.4627119,-104.8506567],
      ["Electricistas",21.5002674,-104.9026711],["El Mirador INFONAVIT",21.52069,-104.8882629],
      ["El Paraíso",21.537816,-104.8748006],["El Pedregal",21.4978364,-104.9179655],
      ["El Puerto",21.1786158,-105.1385487],["El Punto",21.5354451,-104.8941569],
      ["El Rodeo",21.5151712,-104.9177875],["El Tecolote",21.5003164,-104.9090082],
      ["El Tecolote INFONAVIT",21.5018942,-104.9025563],["Emiliano Zapata",21.5354409,-104.9391245],
      ["Estadios",21.5120513,-104.9017981],["Esteban Baca Calderón",21.4957969,-104.895321],
      ["Félix Peña",21.4785824,-104.8976305],["Flamingos",21.4959122,-104.8735196],
      ["Florencia",21.4897795,-104.8854245],["Flores Magón",21.5359048,-104.9005161],
      ["Francisco Villa",21.5139975,-104.8747851],["Gardenias",21.4714809,-104.8912384],
      ["Genaro Vázquez",21.5076848,-104.8739105],["Gilberto Flores Muñoz",21.53055,-104.8851598],
      ["Gobernadores",21.4865263,-104.8732954],["Guadalupe",21.5452354,-104.9616754],
      ["Gustavo Díaz Ordaz",21.5339755,-104.906199],["Heriberto Casas",21.5261273,-104.8860085],
      ["Heriberto Jara",21.525095,-104.8870458],["Hermosa Provincia",21.4817692,-104.8790277],
      ["IMSS",21.5137043,-104.910322],["INDECO",21.5279131,-104.9029136],
      ["Independencia",21.5031003,-104.9079024],["Insurgentes",21.4725843,-104.8941058],
      ["Jacarandas",21.5119293,-104.9035474],["Jardines de La Cruz",21.4957265,-104.8976922],
      ["Jazmines",21.4684862,-104.8010861],["Jesús García",21.5028367,-104.882688],
      ["Juan Escutia",21.4726928,-104.8882778],["Juventud",21.4944007,-104.8775494],
      ["La Esperanza",21.5105144,-104.9020127],["Lagos del Country",21.4791736,-104.8617885],
      ["La Huerta",21.5190659,-104.9140766],["La Joya",21.4754149,-104.8706501],
      ["La Loma",21.5045434,-104.9046382],["Las Aves",21.494261,-104.8803564],
      ["Las Brisas",21.5171403,-104.9223755],["Las Flores",21.5250189,-104.9039925],
      ["Las Islas",21.4733035,-104.8641538],["Las Palomas",21.4592452,-104.8549914],
      ["Lázaro Cárdenas",21.578056,-104.785],["Leyva Medina",21.4766442,-104.8931076],
      ["Lindavista",21.5108316,-104.920733],["Lirios",21.5293234,-104.8717261],
      ["Loma Hermosa",21.4938086,-104.8552653],["Lomas Bonitas",21.5127001,-104.8722082],
      ["Lomas de La Cruz",21.5213286,-104.8782872],["Lomas del Valle",21.4931741,-104.8550535],
      ["Lomas de San Juan",21.5024345,-104.921219],["Los Arcos",21.5644843,-104.8817036],
      ["Los Colomos",21.5006049,-104.8790488],["Los Fresnos",21.4843588,-104.8913197],
      ["Los Fresnos INFONAVIT",21.478631,-104.877652],["Los Llanitos",21.4927662,-104.8787313],
      ["Los Pinos",21.5219197,-104.8983565],["Los Sauces",21.4675084,-104.8729784],
      ["Los Sauces INFONAVIT",21.4658462,-104.8652809],["Luis Donaldo Colosio",21.5091672,-104.881886],
      ["Luis Donaldo Colosio Murrieta",21.502987,-104.878622],["México",21.5853426,-104.8351876],
      ["Miguel Hidalgo",21.4738421,-104.8671785],["Miravalles",21.4744881,-104.8915054],
      ["Moctezuma",21.487149,-104.8973348],["Molinos del Rey",21.4899809,-104.8482855],
      ["Mololoa",21.6403868,-104.9306884],["Morelos",21.4967585,-104.9030532],
      ["Niños Héroes",21.513429,-104.8680243],["Nueva Alemania",21.4977676,-104.9110023],
      ["Nuevas Delicias",21.5229017,-104.9380876],["Nuevas Palomas",21.4690902,-104.8576951],
      ["Nuevo Progreso",21.5429173,-104.8638528],["Ojo de Agua",21.4871545,-104.8743883],
      ["Olimpo",21.5115309,-104.920337],["Oriental",21.4889424,-104.8711099],
      ["Parque Ecológico",21.4908945,-104.8611709],["Paseo del Valle Real",21.4620045,-104.8615386],
      ["Plan de Ayala",21.5219162,-104.9103534],["Primero de Mayo",21.5647348,-104.8808548],
      ["Puente de San Cayetano",21.469774,-104.8550347],["Puerta Encanto",21.4866843,-104.8442074],
      ["Reforma",21.4790265,-104.8849524],["Revolución",21.503991,-104.874033],
      ["Rey Nayar",21.5054909,-104.9190418],["Rinconada Residencial",21.5239805,-104.9255107],
      ["Rincón de San Juan",21.5020564,-104.9128623],["Rivas Allende",21.5304027,-104.9062938],
      ["Rodeo de La Punta",21.5195306,-104.9243106],["San Antonio",21.5005945,-104.8943932],
      ["Sandino",21.5079499,-104.8810617],["San José",21.5165826,-104.8951009],
      ["San Juan",21.4955799,-104.9167115],["San Juanito",21.5154105,-104.871144],
      ["Santa Cecilia",21.5135365,-104.8687384],["Santa Teresita",21.522197,-104.8998254],
      ["Tepic Centro",21.451849,-104.8210334],["Tierra y Libertad",21.5051932,-104.8766765],
      ["Tulipanes",21.5294835,-104.8713718],["Universidad Autónoma de Nayarit",21.4919338,-104.8923585],
      ["Valle de La Cruz",21.4988651,-104.893561],["Valle del Country",21.4838842,-104.8629467],
      ["Valle de Matatipac",21.4899304,-104.8460405],["Valle de Nayarit",21.4791099,-104.9081184],
      ["Valle de Zaragoza",21.4483532,-104.8410652],["Valle Dorado",21.4847178,-104.9034968],
      ["Valle Magno",21.4629947,-104.8513475],["Valle Verde",21.5239578,-104.9362256],
      ["Venceremos",21.4689001,-104.870808],["Versalles Sur",21.5042805,-104.9130899],
      ["Villas de La Cantera",21.4900872,-104.8399047],["Villas de La Paz",21.4817258,-104.8903603],
      ["Villas del Molino",21.4892156,-104.8442653],["Villas del Parque",21.4914501,-104.8543798],
      ["Villas de San Juan",21.5032516,-104.9186352],["Vistas de La Cantera",21.5097812,-104.8170025],
      ["Zapopan",21.5222158,-104.8758651],["Zitacua",21.5045837,-104.8702415],
      ["Ampliación El Paraíso",21.537816,-104.8748006],["Ampliación Santa Teresita",21.522197,-104.8998254],
      ["El Faisán",21.4945515,-104.8812101],["El Rubí",21.4638491,-104.8464047],
      ["FOVISSSTE 1a Etapa",21.5158841,-104.9259392],["FOVISSSTE 2a Etapa",21.5158841,-104.9259392],
      ["La Lomita",21.5232365,-104.8739294],["Residencial La Loma",21.5045434,-104.9046382],
      ["Residencial los Olivos",21.4951731,-104.8161051],
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

  guardarDB();
  console.log("✅ Base de datos lista");
}

module.exports = { seedDB };
