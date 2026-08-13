// src/db/admin.js
// BD global del super-admin (data/admin.db).
// Guarda config compartida entre todos los tenants: API keys de IA,
// URL de la app, grupo de mandaditos, credenciales del super-admin, etc.

const path    = require('path');
const Database = require('better-sqlite3');
const bcrypt  = require('bcryptjs');

const ADMIN_DB_PATH = path.join(__dirname, '../../data/admin.db');
let _db = null;

function getAdminDB() {
  if (_db) return _db;
  _db = new Database(ADMIN_DB_PATH);
  _db.pragma('journal_mode = DELETE');
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
  `);

  // Defaults de global_config — solo inserta si no existe
  const defaults = [
    ['app_url',             process.env.APP_URL              || ''],
    ['grupo_mandaditos_id', process.env.GRUPO_MANDADITOS_ID || ''],
    ['sentry_dsn',          process.env.SENTRY_DSN          || ''],
  ];
  const stmt = _db.prepare('INSERT OR IGNORE INTO global_config (clave, valor) VALUES (?,?)');
  for (const [clave, valor] of defaults) stmt.run(clave, valor);

  // Usuario super-admin por defecto (solo si no existe ninguno)
  const existe = _db.prepare('SELECT id FROM superadmin_usuarios LIMIT 1').get();
  if (!existe) {
    const hash = bcrypt.hashSync('rajem2024', 10);
    _db.prepare('INSERT INTO superadmin_usuarios (usuario, password) VALUES (?,?)').run('rajem', hash);
    console.log('✅ Super-admin creado — usuario: rajem / contraseña: rajem2024 (cámbiala desde el panel)');
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

// ── Getters de conveniencia ────────────────────────────────────────────────────
function getAppUrl()        { return getGlobalConfig('app_url')         || process.env.APP_URL              || ''; }
function getGrupoMandaditosGlobal() { return getGlobalConfig('grupo_mandaditos_id') || process.env.GRUPO_MANDADITOS_ID || ''; }

module.exports = {
  getAdminDB,
  getGlobalConfig, setGlobalConfig, getAllGlobalConfig,
  getSuperadminUsuario, updateSuperadminPassword,
  getAppUrl, getGrupoMandaditosGlobal,
};
