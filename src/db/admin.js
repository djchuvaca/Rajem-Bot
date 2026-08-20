// src/db/admin.js
// BD global del super-admin (data/admin.db).
// Guarda config compartida entre todos los tenants: API keys de IA,
// URL de la app, grupo de mandaditos, credenciales del super-admin, etc.

const path    = require('path');
const Database = require('better-sqlite3');
const bcrypt  = require('bcryptjs');

const ADMIN_DB_PATH = process.env.ADMIN_DB_PATH || path.join(__dirname, '../../data/admin.db');
let _db = null;

function getAdminDB() {
  if (_db) return _db;
  _db = new Database(ADMIN_DB_PATH);
  _db.pragma('journal_mode = DELETE');
  _db.pragma('busy_timeout = 5000');
  _init();
  return _db;
}

function _init() {
  _db.exec(`
    CREATE TABLE IF NOT EXISTS global_config (
      clave TEXT PRIMARY KEY,
      valor TEXT NOT NULL DEFAULT ''
    );
    CREATE TABLE IF NOT EXISTS superadmin_usuarios (
      id       INTEGER PRIMARY KEY AUTOINCREMENT,
      usuario  TEXT UNIQUE NOT NULL,
      password TEXT NOT NULL
    );
    CREATE TABLE IF NOT EXISTS admin_auditoria (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      usuario TEXT NOT NULL,
      accion TEXT NOT NULL,
      entidad TEXT,
      entidad_id TEXT,
      detalles TEXT,
      ip TEXT,
      created_at TEXT NOT NULL DEFAULT (datetime('now','localtime'))
    );
    CREATE TABLE IF NOT EXISTS schema_migrations (
      version TEXT PRIMARY KEY,
      applied_at TEXT NOT NULL DEFAULT (datetime('now','localtime'))
    );
    CREATE TABLE IF NOT EXISTS geo_tepic_colonias (
      id         INTEGER PRIMARY KEY AUTOINCREMENT,
      nombre     TEXT NOT NULL,
      slug       TEXT UNIQUE NOT NULL,
      tipo       TEXT NOT NULL DEFAULT 'colonia',
      lat        REAL NOT NULL,
      lon        REAL NOT NULL,
      aliases    TEXT NOT NULL DEFAULT '[]',
      activo     INTEGER NOT NULL DEFAULT 1,
      created_at TEXT NOT NULL DEFAULT (datetime('now','localtime')),
      updated_at TEXT NOT NULL DEFAULT (datetime('now','localtime'))
    );
  `);

  // GeoTepic enriquecido. Las migraciones son aditivas para conservar instalaciones existentes.
  const geoColumns = [
    ['diccionario_id', 'TEXT'], ['nombre_oficial', 'TEXT'], ['codigo_postal', 'TEXT'],
    ['municipio', 'TEXT'], ['ciudad', 'TEXT'], ['zona', 'TEXT'],
    ['fuente_coordenadas', 'TEXT'], ['precision_coordenadas', 'TEXT'], ['confianza', 'TEXT'],
    ['verificada', 'INTEGER NOT NULL DEFAULT 0'], ['palabras_clave', "TEXT NOT NULL DEFAULT '[]'"],
    ['grupo_ambiguedad', 'TEXT'], ['origen', 'TEXT'],
    ['administrada', 'INTEGER NOT NULL DEFAULT 0'], ['excluida', 'INTEGER NOT NULL DEFAULT 0'],
  ];
  const existentesGeo = new Set(_db.prepare('PRAGMA table_info(geo_tepic_colonias)').all().map(c => c.name));
  for (const [nombre, tipo] of geoColumns) {
    if (!existentesGeo.has(nombre)) _db.exec(`ALTER TABLE geo_tepic_colonias ADD COLUMN ${nombre} ${tipo}`);
  }
  _db.exec('CREATE UNIQUE INDEX IF NOT EXISTS idx_geo_tepic_diccionario_id ON geo_tepic_colonias(diccionario_id) WHERE diccionario_id IS NOT NULL');
  _db.exec(`CREATE TABLE IF NOT EXISTS geo_tepic_auditoria (
    id INTEGER PRIMARY KEY AUTOINCREMENT, colonia_id INTEGER, accion TEXT NOT NULL,
    datos_antes TEXT, datos_despues TEXT, usuario TEXT, created_at TEXT NOT NULL DEFAULT (datetime('now','localtime'))
  )`);
  _db.exec(`CREATE TABLE IF NOT EXISTS geo_tepic_cuadrantes (
    id         INTEGER PRIMARY KEY AUTOINCREMENT,
    codigo     TEXT NOT NULL,
    nombre     TEXT NOT NULL DEFAULT '',
    nivel      INTEGER NOT NULL DEFAULT 1,
    parent_id  INTEGER REFERENCES geo_tepic_cuadrantes(id),
    geometry   TEXT NOT NULL,
    created_at TEXT NOT NULL DEFAULT (datetime('now','localtime')),
    updated_at TEXT NOT NULL DEFAULT (datetime('now','localtime'))
  )`);
  _db.exec('CREATE INDEX IF NOT EXISTS idx_geo_tepic_cuadrantes_parent ON geo_tepic_cuadrantes(parent_id)');
  _db.prepare('INSERT OR IGNORE INTO schema_migrations(version) VALUES (?)').run('2026-08-14-geotepic-security');

  // Defaults de global_config — solo inserta si no existe
  const defaults = [
    ['app_url',             process.env.APP_URL              || ''],
    ['grupo_mandaditos_id', process.env.GRUPO_MANDADITOS_ID || ''],
    ['sentry_dsn',          process.env.SENTRY_DSN          || ''],
    ['groq_api_key',        ''],
  ];
  const stmt = _db.prepare('INSERT OR IGNORE INTO global_config (clave, valor) VALUES (?,?)');
  for (const [clave, valor] of defaults) stmt.run(clave, valor);

  // Usuario super-admin por defecto (solo si no existe ninguno)
  const existe = _db.prepare('SELECT id FROM superadmin_usuarios LIMIT 1').get();
  if (!existe) {
    if (process.env.NODE_ENV === 'production' && !process.env.SUPERADMIN_INITIAL_PASSWORD) {
      throw new Error('SUPERADMIN_INITIAL_PASSWORD es obligatoria al crear admin.db en producción');
    }
    const usuario = process.env.SUPERADMIN_INITIAL_USER || 'rajem';
    const password = process.env.SUPERADMIN_INITIAL_PASSWORD || 'rajem2024';
    const hash = bcrypt.hashSync(password, 10);
    _db.prepare('INSERT INTO superadmin_usuarios (usuario, password) VALUES (?,?)').run(usuario, hash);
    console.log(`✅ Super-admin creado — usuario: ${usuario}${process.env.SUPERADMIN_INITIAL_PASSWORD ? ' / contraseña segura configurada' : ' / contraseña de desarrollo (cámbiala de inmediato)'}`);
  }
}

// ── CRUD global_config ─────────────────────────────────────────────────────────
function getGlobalConfig(clave) {
  const row = getAdminDB().prepare('SELECT valor FROM global_config WHERE clave = ?').get(clave);
  return row ? row.valor : null;
}

function setGlobalConfig(clave, valor) {
  getAdminDB().prepare('INSERT OR REPLACE INTO global_config (clave, valor) VALUES (?,?)').run(clave, String(valor ?? ''));
}

function getAllGlobalConfig() {
  return getAdminDB().prepare('SELECT * FROM global_config ORDER BY clave').all();
}

// ── CRUD super-admin usuarios ──────────────────────────────────────────────────
function getSuperadminUsuario(usuario) {
  return getAdminDB().prepare('SELECT * FROM superadmin_usuarios WHERE usuario = ?').get(usuario);
}

function updateSuperadminPassword(usuario, hash) {
  getAdminDB().prepare('UPDATE superadmin_usuarios SET password = ? WHERE usuario = ?').run(hash, usuario);
}

function registrarAuditoria({ usuario, accion, entidad = null, entidadId = null, detalles = null, ip = null }) {
  getAdminDB().prepare('INSERT INTO admin_auditoria (usuario,accion,entidad,entidad_id,detalles,ip) VALUES (?,?,?,?,?,?)')
    .run(usuario, accion, entidad, entidadId, detalles ? JSON.stringify(detalles) : null, ip);
}

function listarAuditoriaAdmin(limite = 200) {
  return getAdminDB().prepare('SELECT * FROM admin_auditoria ORDER BY id DESC LIMIT ?').all(Math.min(1000, Math.max(1, Number(limite) || 200)));
}

// ── Getters de conveniencia ────────────────────────────────────────────────────
function getAppUrl()               { return getGlobalConfig('app_url')             || process.env.APP_URL              || ''; }
function getGrupoMandaditosGlobal() { return getGlobalConfig('grupo_mandaditos_id') || process.env.GRUPO_MANDADITOS_ID || ''; }
function getGroqApiKeyGlobal()      { return getGlobalConfig('groq_api_key')        || ''; }

module.exports = {
  getAdminDB,
  getGlobalConfig, setGlobalConfig, getAllGlobalConfig,
  getSuperadminUsuario, updateSuperadminPassword, registrarAuditoria, listarAuditoriaAdmin,
  getAppUrl, getGrupoMandaditosGlobal, getGroqApiKeyGlobal,
};
