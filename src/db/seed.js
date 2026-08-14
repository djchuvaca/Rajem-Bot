const { getDB, guardarDB, run, queryOne } = require("./core");

async function seedDB() {
  const db = getDB();
  db.run(`CREATE TABLE IF NOT EXISTS schema_migrations (
    version TEXT PRIMARY KEY,
    applied_at TEXT NOT NULL DEFAULT (datetime('now','localtime'))
  )`);

  // ── CREAR TABLAS ───────────────────────────────────────────────────────────
  // ── TABLAS DEL CATÁLOGO MULTI-TENANT ──────────────────────────────────────────
  // Registro de tipos de negocio (los catálogos viven exclusivamente en src/giros)
  db.run(`
    CREATE TABLE IF NOT EXISTS business_types (
      id          INTEGER PRIMARY KEY AUTOINCREMENT,
      slug        TEXT    UNIQUE NOT NULL,
      nombre      TEXT    NOT NULL,
      descripcion TEXT,
      emoji       TEXT    DEFAULT '🍽️',
      activo      INTEGER DEFAULT 1
    )
  `);
  // Tipos de ítem por business_type: reemplazan "taco/torta" hardcodeado
  db.run(`
    CREATE TABLE IF NOT EXISTS item_types (
      id               INTEGER PRIMARY KEY AUTOINCREMENT,
      business_type_id INTEGER NOT NULL REFERENCES business_types(id),
      slug             TEXT    NOT NULL,
      nombre           TEXT    NOT NULL,
      nombre_plural    TEXT    NOT NULL,
      emoji            TEXT    DEFAULT '🍽️',
      aliases_json     TEXT    DEFAULT '[]',
      soporta_gramos   INTEGER DEFAULT 0,
      soporta_pesos    INTEGER DEFAULT 0,
      precio_campo     TEXT    DEFAULT 'precio_taco',
      activo           INTEGER DEFAULT 1,
      UNIQUE(business_type_id, slug)
    )
  `);
  db.run(`
    CREATE TABLE IF NOT EXISTS productos (
      id             INTEGER PRIMARY KEY AUTOINCREMENT,
      nombre         TEXT    NOT NULL UNIQUE,
      descripcion    TEXT,
      precio_taco    REAL    DEFAULT 30,
      precio_torta   REAL    DEFAULT 40,
      precio_100g    REAL    DEFAULT 32,
      activo         INTEGER DEFAULT 1,
      catalogo_slug  TEXT    DEFAULT NULL
    );
    CREATE TABLE IF NOT EXISTS solicitudes_producto (
      id               INTEGER PRIMARY KEY AUTOINCREMENT,
      nombre_propuesto TEXT    NOT NULL,
      descripcion      TEXT,
      categoria        TEXT    DEFAULT 'corte',
      motivo           TEXT,
      estado           TEXT    DEFAULT 'pendiente',
      created_at       TEXT    DEFAULT (datetime('now','localtime'))
    );
    CREATE TABLE IF NOT EXISTS solicitudes_geo (
      id               INTEGER PRIMARY KEY AUTOINCREMENT,
      tipo             TEXT    NOT NULL,
      datos_propuestos TEXT    NOT NULL,
      motivo           TEXT,
      estado           TEXT    DEFAULT 'pendiente',
      respuesta        TEXT,
      created_at       TEXT    DEFAULT (datetime('now','localtime'))
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

  // ── TABLA CORTES (catálogo de cortes/ingredientes por giro) ──────────────────
  db.run(`
    CREATE TABLE IF NOT EXISTS cortes (
      id           INTEGER PRIMARY KEY AUTOINCREMENT,
      giro_id      INTEGER NOT NULL REFERENCES business_types(id),
      slug         TEXT    NOT NULL,
      nombre       TEXT    NOT NULL,
      aliases_json TEXT    DEFAULT '[]',
      descripcion  TEXT    DEFAULT '',
      precio_base  INTEGER DEFAULT 30,
      precios_json TEXT    DEFAULT '{}',
      activo       INTEGER DEFAULT 1,
      seccion      TEXT    DEFAULT 'carnitas',
      UNIQUE(giro_id, slug)
    )
  `);

  // ── TABLA MENU_ITEMS (menú configurado por el tenant desde el panel) ─────────
  db.run(`
    CREATE TABLE IF NOT EXISTS menu_items (
      id            INTEGER PRIMARY KEY AUTOINCREMENT,
      producto_slug TEXT    NOT NULL,
      formato_slug  TEXT    DEFAULT NULL,
      categoria     TEXT    NOT NULL DEFAULT 'corte',
      precio        REAL    DEFAULT 0,
      activo        INTEGER DEFAULT 1,
      eliminado     INTEGER DEFAULT 0,
      precios_json  TEXT    DEFAULT '{}',
      created_at    TEXT    DEFAULT (datetime('now','localtime'))
    )
  `);
  try {
    db.run("CREATE UNIQUE INDEX IF NOT EXISTS idx_menu_items_uq ON menu_items(producto_slug, COALESCE(formato_slug,''), categoria)");
  } catch (_) {}

  // ── MIGRACIONES (columnas nuevas en tablas existentes) ─────────────────────
  try { db.run("ALTER TABLE clientes ADD COLUMN ultimo_pedido_json TEXT"); } catch (_) {}
  try { db.run("ALTER TABLE productos ADD COLUMN sinonimos TEXT DEFAULT ''"); } catch (_) {}
  try { db.run("ALTER TABLE productos ADD COLUMN categoria TEXT DEFAULT 'corte'"); } catch (_) {}
  try { db.run("ALTER TABLE productos ADD COLUMN catalogo_slug TEXT DEFAULT NULL"); } catch (_) {}
  try { db.run("ALTER TABLE item_types ADD COLUMN precio_base INTEGER DEFAULT 0"); } catch (_) {}
  try { db.run("ALTER TABLE cortes ADD COLUMN seccion TEXT DEFAULT 'carnitas'"); } catch (_) {}

  // Migración: renombrar slug 'maciza' → 'carne' (v1.5 compat)
  try { db.run("UPDATE cortes SET slug='carne', nombre='Carne/Maciza', aliases_json='[\"carnitas\",\"carnita\",\"carne\",\"maciza\",\"masiza\",\"maciza de puerco\"]' WHERE slug='maciza'"); } catch (_) {}

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
  try { db.run("ALTER TABLE colonias ADD COLUMN geo_tepic_id INTEGER DEFAULT NULL"); } catch (_) {}
  try { db.run("ALTER TABLE colonias ADD COLUMN codigo_postal TEXT DEFAULT NULL"); } catch (_) {}
  try { db.run("ALTER TABLE colonias ADD COLUMN fuente_coordenadas TEXT DEFAULT NULL"); } catch (_) {}
  try { db.run("ALTER TABLE colonias ADD COLUMN precision_coordenadas TEXT DEFAULT NULL"); } catch (_) {}
  try { db.run("ALTER TABLE colonias ADD COLUMN confianza TEXT DEFAULT NULL"); } catch (_) {}
  try { db.run("ALTER TABLE colonias ADD COLUMN verificada INTEGER NOT NULL DEFAULT 0"); } catch (_) {}
  try { db.run("ALTER TABLE colonias ADD COLUMN grupo_ambiguedad TEXT DEFAULT NULL"); } catch (_) {}
  try { db.run("CREATE UNIQUE INDEX IF NOT EXISTS idx_colonias_geo_tepic_id ON colonias(geo_tepic_id) WHERE geo_tepic_id IS NOT NULL"); } catch (_) {}

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
  // Resolver giro activo una sola vez — se reutiliza en config y migraciones
  const _btSlug = (process.env.BUSINESS_TYPE || 'taqueria').trim().toLowerCase();
  let _giro;
  try {
    const { getGiro } = require('../giros');
    _giro = getGiro(_btSlug);
  } catch (_) {}

  const countProd = db.exec("SELECT COUNT(*) as c FROM productos")[0]?.values[0][0] || 0;
  if (countProd === 0) {
    // Instalación nueva — tabla productos vacía intencionalmente.
    // El tenant construye su catálogo desde el panel: Productos → Agregar.
    console.log(`ℹ️  Catálogo vacío (${_btSlug}) — el tenant define su menú desde el panel`);
  }

  // `productos` se conserva temporalmente solo como entrada de migración para
  // bases antiguas. Los tenants nuevos no proyectan ningún catálogo en ella.

  // ── SEED CONFIGURACIÓN ─────────────────────────────────────────────────────
  const countConf = db.exec("SELECT COUNT(*) as c FROM configuracion")[0]?.values[0][0] || 0;

  // Config base (independiente del giro)
  const _configBase = [
    ["nombre_negocio",           process.env.NOMBRE_NEGOCIO || "Mi Negocio"],
    ["domicilio_costo",          "50"],
    ["geo_tarifa_aproximada",    "0"],
    ["geo_radio_cobertura_km",   ""],
    ["moneda",                   "$"],
    ["grupo_id",                 process.env.GRUPO_ID || ""],
    ["metodos_mostrador",        "efectivo, tarjeta o transferencia"],
    ["metodos_domicilio",        "efectivo o transferencia"],
    ["tiempo_cancelacion",       "15"],
    ["timeout_recordatorio_min", "20"],
    ["timeout_sesion_min",       "35"],
    ["plan_activo",              process.env.PLAN_ACTIVO || "basico"],
  ];

  // Config del giro activo — reutiliza _btSlug y _giro resueltos en la sección de productos
  const _configGiro = _giro?.configDefaults ? { ..._giro.configDefaults } : {};

  const _configAll = [..._configBase, ...Object.entries(_configGiro)];

  if (countConf === 0) {
    for (const [clave, valor] of _configAll) {
      db.run("INSERT INTO configuracion (clave, valor) VALUES (?,?)", [clave, valor]);
    }
    console.log("✅ Configuración inicial insertada");
  } else {
    for (const [clave, valor] of _configAll) {
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
  // Los mensajes de cada giro vienen de giro.mensajesDefaults (INSERT OR IGNORE más abajo).
  // El bloque de instalación nueva usa los defaults del giro activo como fuente de verdad.
  const countMsg = db.exec("SELECT COUNT(*) as c FROM mensajes_bot")[0]?.values[0][0] || 0;
  if (countMsg === 0 && _giro?.mensajesDefaults) {
    for (const [clave, valor] of Object.entries(_giro.mensajesDefaults)) {
      db.run("INSERT INTO mensajes_bot (clave, valor) VALUES (?,?)", [clave, valor]);
    }
    console.log("✅ Mensajes del bot insertados desde módulo giro");
  }
  // Migración: fuera_horario_lunes tenía días hardcodeados ("lunes"/"martes") en el default original.
  // Si el tenant nunca lo editó, lo reemplazamos por el texto genérico.
  run(
    "UPDATE mensajes_bot SET valor = ? WHERE clave = 'fuera_horario_lunes' AND valor = ?",
    [
      "⏰ Por el momento nos encontramos fuera de servicio.\nHoy es nuestro día de descanso 😴\n\nRetomamos el servicio mañana a las *{hora_inicio}* 🌮\n\n¿Te gustaría hacer un pedido en *preventa* para cuando abramos?",
      "⏰ Por el momento nos encontramos fuera de servicio.\nLos lunes descansamos 😴\n\nRetomamos el servicio el *martes a las {hora_inicio}* 🌮\n\n¿Te gustaría hacer un pedido en *preventa* para cuando abramos?"
    ]
  );

  // Migración: claves genéricas (aplican a todos los giros) — INSERT OR IGNORE
  // Las específicas de cada giro vienen del bloque giro.mensajesDefaults más abajo
  const nuevosMsgs = [
    ["comprobante_recibido", "¡Gracias! Recibimos tu comprobante 📸\nTu pedido fue solicitado exitosamente y solo queda la confirmación de nuestro equipo de trabajo.\nEn breve te avisamos 🙏"],
  ];
  for (const [clave, valor] of nuevosMsgs) {
    db.run("INSERT OR IGNORE INTO mensajes_bot (clave, valor) VALUES (?,?)", [clave, valor]);
  }

  // Mensajes específicos del giro activo (fuente de verdad: src/giros/<giro>.mensajesDefaults)
  if (_giro?.mensajesDefaults) {
    for (const [clave, valor] of Object.entries(_giro.mensajesDefaults)) {
      db.run("INSERT OR IGNORE INTO mensajes_bot (clave, valor) VALUES (?,?)", [clave, valor]);
    }
  }

  // ── SEED USUARIO PANEL ─────────────────────────────────────────────────────
  const countUser = db.exec("SELECT COUNT(*) as c FROM usuarios_panel")[0]?.values[0][0] || 0;
  if (countUser === 0) {
    const bcrypt = require("bcryptjs");
    const initialPassword = process.env.PANEL_INITIAL_PASSWORD || "admin123";
    const hash   = bcrypt.hashSync(initialPassword, 10);
    db.run("INSERT INTO usuarios_panel (usuario, password) VALUES (?,?)", ["admin", hash]);
    console.log(`✅ Usuario panel creado: admin${process.env.PANEL_INITIAL_PASSWORD ? ' / contraseña segura configurada por provisioning' : ' / admin123 (solo desarrollo)'}`);
  }

  // GeoTepic sincroniza definiciones maestras; la BD local conserva el estado activo.
  if (!process.env.BOT_TEST_MODE) {
    try {
      const fs = require('fs');
      const path = require('path');
      const geoTepic = require('../geo/geotepic');
      const registry = JSON.parse(fs.readFileSync(path.join(__dirname, '../../data/tenants.json'), 'utf8'));
      const tenant = geoTepic.resolverTenant(registry.tenants || [], process.env.TENANT_ID || '', require('./core').getBsdb()?.name || '');
      if (tenant && geoTepic.esTenantTepic(tenant)) {
        geoTepic.inicializarDesdeTenants(registry.tenants || []);
        geoTepic.sincronizarTenant(tenant);
      }
    } catch (e) { console.warn(`[GeoTepic] No se pudo sincronizar al iniciar: ${e.message}`); }
  }

  // Config: coordenadas del negocio (solo si no existen)
  run("INSERT OR IGNORE INTO configuracion (clave, valor) VALUES ('negocio_lat', '')");
  run("INSERT OR IGNORE INTO configuracion (clave, valor) VALUES ('negocio_lon', '')");

  // Config: dirección y grupo de mandaditos
  run("INSERT OR IGNORE INTO configuracion (clave, valor) VALUES ('negocio_calle', '')");
  run("INSERT OR IGNORE INTO configuracion (clave, valor) VALUES ('negocio_colonia', '')");
  run("INSERT OR IGNORE INTO configuracion (clave, valor) VALUES ('negocio_referencia', '')");
  run("INSERT OR IGNORE INTO configuracion (clave, valor) VALUES ('grupo_mandaditos_id', '')");
  run("INSERT OR IGNORE INTO configuracion (clave, valor) VALUES ('tipo_servicio', 'ambos')");
  run("INSERT OR IGNORE INTO configuracion (clave, valor) VALUES ('mandaditos_silencio_min', '15')");
  run("INSERT OR IGNORE INTO configuracion (clave, valor) VALUES ('mandaditos_recordatorio_min', '30')");
  run("INSERT OR IGNORE INTO configuracion (clave, valor) VALUES ('mandaditos_timeout_post_min', '20')");
  run("INSERT OR IGNORE INTO configuracion (clave, valor) VALUES ('mandaditos_delay_min', '15')");

  // Config: pasarela de pagos (administrada desde super-admin)
  run("INSERT OR IGNORE INTO configuracion (clave, valor) VALUES ('pasarela_activa', '')");
  run("INSERT OR IGNORE INTO configuracion (clave, valor) VALUES ('pasarela_config', '{}')");

  run("INSERT OR IGNORE INTO configuracion (clave, valor) VALUES ('alerta_pedido_min', '10')");
  run("INSERT OR IGNORE INTO configuracion (clave, valor) VALUES ('bot_pausado', '0')");

  // Config: modalidad de notificaciones — configurada por super-admin
  // "grupo"    → grupo WA de admins  (requiere 2+ dispositivos, solo admins del grupo ejecutan comandos)
  // "privado"  → número personal del dueño (requiere 2 dispositivos, JID en notif_privado_jid)
  // "autochat" → el dueño usa el chat consigo mismo (1 solo dispositivo)
  // "ninguno"  → sin notificaciones WA  (1 dispositivo, gestión solo por panel)
  run("INSERT OR IGNORE INTO configuracion (clave, valor) VALUES ('notif_modalidad', 'grupo')");
  run("INSERT OR IGNORE INTO configuracion (clave, valor) VALUES ('notif_privado_jid', '')");
  run("INSERT OR IGNORE INTO configuracion (clave, valor) VALUES ('notif_autochat_jid', '')");
  run("INSERT OR IGNORE INTO configuracion (clave, valor) VALUES ('grupos_wa_cache', '[]')");
  run("INSERT OR IGNORE INTO configuracion (clave, valor) VALUES ('qr_pendiente', '')");

  // ── SEED BUSINESS TYPES ────────────────────────────────────────────────────
  _seedBusinessTypes(db);

  // Migración: 'por_pesos' es el nuevo item_type dedicado para soporta_pesos (antes 'gramos' tenía ambos flags).
  // Si el tenant tenía 'gramos' activo, activar 'por_pesos' automáticamente para no romper el flujo.
  {
    const _btTaq = db.prepare("SELECT id FROM business_types WHERE slug = 'taqueria'").get();
    if (_btTaq) {
      const _gramos   = db.prepare("SELECT activo FROM item_types WHERE business_type_id = ? AND slug = 'gramos'").get(_btTaq.id);
      const _porPesos = db.prepare("SELECT id, activo FROM item_types WHERE business_type_id = ? AND slug = 'por_pesos'").get(_btTaq.id);
      if (_gramos?.activo && _porPesos && !_porPesos.activo) {
        db.prepare("UPDATE item_types SET activo = 1 WHERE id = ?").run(_porPesos.id);
        console.log("✅ Migración: item_type 'por_pesos' activado (gramos tenía soporta_pesos)");
      }
    }
  }

  // Config: business_type_slug (determina qué plantilla NLU usa el bot)
  // En instalaciones nuevas, usar BUSINESS_TYPE del env si está definido; sino 'taqueria'
  const _btSlugDefault = (process.env.BUSINESS_TYPE || 'taqueria').trim().toLowerCase();
  run("INSERT OR IGNORE INTO configuracion (clave, valor) VALUES ('business_type_slug', ?)", [_btSlugDefault]);

  // Config: estrategia de precio para ítems mixtos (combinaciones de cortes)
  // 'mas_caro' = precio del corte más caro (default, protege el margen)
  // 'promedio' = promedio de precios de los cortes combinados
  run("INSERT OR IGNORE INTO configuracion (clave, valor) VALUES ('estrategia_precio_mixto', 'mas_caro')");

  // Config: sección del giro taquería visible para el NLU (SUPERADMIN-ONLY)
  // Cambiar este valor sin coordinación con el tenant puede romper la detección de todos los pedidos.
  // 'ambas'    → carnitas + asada (default)
  // 'carnitas' → solo cortes de carnitas (taquería de carnitas pura)
  // 'asada'    → solo cortes de asada/trompo
  run("INSERT OR IGNORE INTO configuracion (clave, valor) VALUES ('seccion_taqueria', ?)",
    [process.env.SECCION_TAQUERIA_INICIAL || 'ambas']);

  // ── SEED CORTES DE TODOS LOS GIROS REGISTRADOS ────────────────────────────
  const { listGiros: _listGirosSeed } = require('../giros');
  for (const _giro of _listGirosSeed()) {
    _seedCortesGiro(db, _giro);
  }
  _migrarCatalogoLegacyAMenu(db, _giro);

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

  run(`CREATE TABLE IF NOT EXISTS repartidores (
    id                    INTEGER PRIMARY KEY AUTOINCREMENT,
    jid                   TEXT NOT NULL UNIQUE,
    nombre                TEXT NOT NULL,
    activo                INTEGER NOT NULL DEFAULT 1,
    en_ruta               INTEGER NOT NULL DEFAULT 0,
    pedido_actual_id      INTEGER,
    tiempo_ruta_inicio    TEXT,
    entregas_hoy          INTEGER NOT NULL DEFAULT 0,
    entregas_total        INTEGER NOT NULL DEFAULT 0,
    entregas_confirmadas  INTEGER NOT NULL DEFAULT 0,
    promedio_entrega_min  REAL,
    ultima_actividad      TEXT,
    creado_en             TEXT NOT NULL DEFAULT (datetime('now'))
  )`);

  run(`CREATE TABLE IF NOT EXISTS entregas_historial (
    id              INTEGER PRIMARY KEY AUTOINCREMENT,
    repartidor_id   INTEGER NOT NULL REFERENCES repartidores(id) ON DELETE CASCADE,
    pedido_id       INTEGER,
    colonia         TEXT,
    minutos         INTEGER,
    confirmado      INTEGER NOT NULL DEFAULT 1,
    fecha           TEXT NOT NULL DEFAULT (date('now', 'localtime')),
    creado_en       TEXT NOT NULL DEFAULT (datetime('now', 'localtime'))
  )`);

  // ── ENTORNO DE PRUEBAS: activar item_types y poblar productos ────────────────
  // En producción, el tenant activa item_types y agrega productos desde el panel.
  // En tests (BOT_TEST_MODE=1), se activan automáticamente para que el NLU funcione.
  if (process.env.BOT_TEST_MODE) {
    run("UPDATE item_types SET activo = 1");
    _seedMenuPruebas(db, _giro);
    console.log("🧪 Modo test: catálogo del Giro proyectado en menu_items");
  }

  guardarDB();
  console.log("✅ Base de datos lista");
}

// ── HELPER: SEED CORTES DE UN GIRO (genérico) ────────────────────────────────
function _seedCortesGiro(db, giro) {
  const bt = db.prepare("SELECT id FROM business_types WHERE slug = ?").get(giro.slug);
  if (!bt) return; // business_type aún no existe (se seedea en _seedBusinessTypes)
  if (!Array.isArray(giro.cortes) || giro.cortes.length === 0) return;

  const stmtInsert = db.prepare(
    'INSERT OR IGNORE INTO cortes (giro_id, slug, nombre, aliases_json, descripcion, precio_base, precios_json, activo, seccion) VALUES (?,?,?,?,?,?,?,1,?)'
  );
  for (const c of giro.cortes) {
    stmtInsert.run(bt.id, c.slug, c.nombre, JSON.stringify(c.aliases || []), c.descripcion || '', c.precio_base || 0, '{}', c.seccion || 'carnitas');
  }

  // Sincronizar campos NLU en cortes ya existentes:
  // aliases_json es config de sistema (NLU), el tenant no la edita desde el panel → siempre sobrescribir.
  // descripcion solo si estaba vacía → respetar ediciones del tenant.
  // seccion solo si aún tiene el valor default → respetar secciones personalizadas.
  const stmtAlias = db.prepare("UPDATE cortes SET aliases_json=? WHERE giro_id=? AND slug=?");
  const stmtDesc  = db.prepare("UPDATE cortes SET descripcion=? WHERE giro_id=? AND slug=? AND (descripcion IS NULL OR descripcion='')");
  const stmtSec   = db.prepare("UPDATE cortes SET seccion=? WHERE giro_id=? AND slug=? AND (seccion IS NULL OR seccion='' OR seccion='carnitas')");
  for (const c of giro.cortes) {
    stmtAlias.run(JSON.stringify(c.aliases || []), bt.id, c.slug);
    if (c.descripcion) stmtDesc.run(c.descripcion, bt.id, c.slug);
    if (c.seccion)     stmtSec.run(c.seccion, bt.id, c.slug);
  }
}

// ── HELPER: SEED BUSINESS TYPES + ITEM TYPES + TEMPLATE PRODUCTS ─────────────
// Lee los giros del registry — agregar un nuevo giro solo requiere crear src/giros/mi-giro.js
function _seedBusinessTypes(db) {
  const { listGiros } = require('../giros');

  const stmtBT = db.prepare(
    "INSERT OR IGNORE INTO business_types (slug, nombre, descripcion, emoji) VALUES (?,?,?,?)"
  );
  const stmtIT = db.prepare(
    `INSERT OR IGNORE INTO item_types
       (business_type_id, slug, nombre, nombre_plural, emoji, aliases_json, soporta_gramos, soporta_pesos, precio_campo, precio_base, activo)
     VALUES (?,?,?,?,?,?,?,?,?,?,0)`
  );

  for (const giro of listGiros()) {
    stmtBT.run(giro.slug, giro.nombre, giro.descripcion, giro.emoji);
    const btRow = db.prepare("SELECT id FROM business_types WHERE slug = ?").get(giro.slug);
    if (!btRow) continue;

    const stmtSyncIT = db.prepare(
      "UPDATE item_types SET nombre=?, nombre_plural=?, emoji=?, aliases_json=?, soporta_gramos=?, soporta_pesos=?, precio_campo=? WHERE business_type_id=? AND slug=?"
    );
    for (const it of (giro.itemTypes || [])) {
      stmtIT.run(
        btRow.id, it.slug, it.nombre, it.nombre_plural,
        it.emoji, JSON.stringify(it.aliases || []),
        it.soporta_gramos ? 1 : 0, it.soporta_pesos ? 1 : 0, it.precio_campo,
        it.precio_base || 0
      );
      // Sincronizar campos de sistema para item_types existentes.
      // nombre, nombre_plural, emoji, aliases_json, soporta_gramos, soporta_pesos, precio_campo
      // son config del giro (no editables por el tenant) → siempre se sobreescriben.
      // precio_base NO se toca: el tenant configura sus precios desde el panel.
      stmtSyncIT.run(
        it.nombre, it.nombre_plural, it.emoji || '🍽️',
        JSON.stringify(it.aliases || []),
        it.soporta_gramos ? 1 : 0,
        it.soporta_pesos ? 1 : 0,
        it.precio_campo,
        btRow.id, it.slug
      );
    }

  }

  // Auto-activar item_types del giro configurado — solo si ninguno está activo aún.
  // Así el tenant arranca con sus items listos sin pasar por el panel primero.
  // Si el tenant desactiva alguno después, el reinicio del bot no los vuelve a activar.
  let businessType = process.env.BUSINESS_TYPE || null;
  if (!businessType) {
    try { businessType = db.prepare("SELECT valor FROM configuracion WHERE clave='business_type_slug'").get()?.valor || null; } catch (_) {}
  }
  if (businessType && !process.env.BOT_TEST_MODE) {
    const btRow = db.prepare("SELECT id FROM business_types WHERE slug = ?").get(businessType);
    if (btRow) {
      const yaActivos = db.prepare(
        "SELECT COUNT(*) as n FROM item_types WHERE business_type_id = ? AND activo = 1"
      ).get(btRow.id)?.n || 0;
      const menuConfigurado = db.prepare("SELECT COUNT(*) as n FROM menu_items WHERE eliminado=0").get()?.n || 0;
      const inicializado = db.prepare("SELECT valor FROM configuracion WHERE clave='item_types_inicializados'").get()?.valor === '1';
      if (yaActivos === 0 && menuConfigurado === 0 && !inicializado) {
        db.prepare("UPDATE item_types SET activo = 1 WHERE business_type_id = ?").run(btRow.id);
        console.log(`✅ Item types de '${businessType}' activados (primera configuración)`);
      }
      db.prepare("INSERT OR REPLACE INTO configuracion (clave,valor) VALUES ('item_types_inicializados','1')").run();
    }
  }

  db.prepare("INSERT OR IGNORE INTO schema_migrations(version) VALUES (?)").run('2026-08-14-giro-geotepic-security');
  console.log("✅ Giros y formatos sincronizados desde src/giros");
}

// Migración única: `productos` deja de ser fuente operativa. Sus valores se
// copian a menu_items únicamente para preservar la configuración de tenants
// anteriores. Después de esta marca nunca vuelve a repoblar un menú eliminado.
function _migrarCatalogoLegacyAMenu(db, giro) {
  if (!giro) return;
  const hecho = db.prepare("SELECT valor FROM configuracion WHERE clave='catalogo_giro_migrado_v2'").get()?.valor === '1';
  if (hecho) return;
  const legacy = db.prepare('SELECT * FROM productos WHERE activo=1').all();
  const formatos = db.prepare(`SELECT it.slug FROM item_types it JOIN business_types bt ON bt.id=it.business_type_id
    WHERE bt.slug=?`).all(giro.slug);
  const ins = db.prepare("INSERT OR IGNORE INTO menu_items(producto_slug,formato_slug,categoria,precio,activo,eliminado) VALUES (?,?,?,?,1,0)");
  for (const p of legacy) {
    const nombre = String(p.nombre || '').toLowerCase();
    const corte = (giro.cortes || []).find(c => c.slug === nombre || c.nombre.toLowerCase() === nombre);
    if (corte) {
      for (const f of formatos) {
        const precio = f.slug === 'torta' ? p.precio_torta
          : f.slug === 'gramos' ? p.precio_100g : p.precio_taco;
        ins.run(corte.slug, f.slug, 'corte', Number(precio || 0));
      }
      continue;
    }
    const categoria = p.categoria === 'refresco' ? 'refresco' : p.categoria === 'salsa' ? 'salsa' : null;
    const def = categoria === 'refresco'
      ? (giro.refrescos || []).find(x => x.nombre.toLowerCase() === nombre)
      : categoria === 'salsa' ? (giro.salsas || []).find(x => x.nombre.toLowerCase() === nombre) : null;
    if (def) ins.run(def.nombre, null, categoria, Number(p.precio_taco || def.precio || 0));
  }
  db.prepare("INSERT OR REPLACE INTO configuracion(clave,valor) VALUES('catalogo_giro_migrado_v2','1')").run();
}

function _seedMenuPruebas(db, giro) {
  if (!giro) return;
  const formatos = db.prepare(`SELECT it.slug,it.precio_base FROM item_types it JOIN business_types bt ON bt.id=it.business_type_id
    WHERE bt.slug=? AND it.activo=1`).all(giro.slug);
  const ins = db.prepare("INSERT OR IGNORE INTO menu_items(producto_slug,formato_slug,categoria,precio,activo,eliminado) VALUES (?,?,?,?,1,0)");
  for (const c of giro.cortes || []) for (const f of formatos) ins.run(c.slug, f.slug, 'corte', Number(f.precio_base || c.precio_base || 0));
  for (const r of giro.refrescos || []) ins.run(r.nombre, null, 'refresco', Number(r.precio || 0));
  for (const s of giro.salsas || []) ins.run(s.nombre, null, 'salsa', Number(s.precio || 0));
}

module.exports = { seedDB };
