const Database = require("better-sqlite3");
const fs        = require("fs");
const path      = require("path");

const DATA_DIR = path.join(__dirname, "../../data");

// DB_PATH se resuelve dentro de initDB() para que TENANT_ID pueda setearse antes de la primera llamada
// En modo pruebas (BOT_TEST_MODE=1) usa base de datos en memoria para no tocar el archivo real.
const _getDbPath = () => {
  if (process.env.BOT_TEST_MODE) return ':memory:';
  return path.join(DATA_DIR, `${process.env.TENANT_ID || 'tacos_javier'}.db`);
};

if (!fs.existsSync(DATA_DIR)) fs.mkdirSync(DATA_DIR, { recursive: true });

let _bsdb = null; // instancia real de better-sqlite3
let db    = null; // objeto de compatibilidad expuesto vía getDB()

// Shim que replica la API de sql.js que usan seed.js, modelos.js y config.js
// directamente sobre el objeto db (db.run / db.exec).
function _makeCompatDB(bsdb) {
  return {
    run(sql, params) {
      if (!params || params.length === 0) {
        bsdb.exec(sql);
      } else {
        bsdb.prepare(sql).run(...params);
      }
    },
    exec(sql) {
      try {
        const rows = bsdb.prepare(sql.trim()).all();
        if (!rows.length) return [];
        const columns = Object.keys(rows[0]);
        return [{ columns, values: rows.map(r => columns.map(c => r[c])) }];
      } catch (_) { return []; }
    },
    prepare: bsdb.prepare.bind(bsdb),
  };
}

async function initDB() {
  if (_bsdb) return _bsdb;
  _bsdb = new Database(_getDbPath());
  // DELETE es más simple para el backup (sin archivos -wal/-shm)
  _bsdb.pragma("journal_mode = DELETE");
  _bsdb.pragma("busy_timeout = 5000");
  db = _makeCompatDB(_bsdb);
  // Require diferido para evitar dependencia circular (seed.js → core.js)
  const { seedDB } = require('./seed');
  await seedDB();
  return _bsdb;
}

// better-sqlite3 escribe en cada operación — no hace falta flush manual
function guardarDB() {}

function getDB() { return db; }

function queryAll(sql, params = []) {
  if (!_bsdb) return [];
  return _bsdb.prepare(sql).all(...params);
}

function queryOne(sql, params = []) {
  if (!_bsdb) return null;
  return _bsdb.prepare(sql).get(...params) || null;
}

function run(sql, params = []) {
  if (!_bsdb) return;
  if (params.length === 0) {
    return _bsdb.exec(sql);
  } else {
    return _bsdb.prepare(sql).run(...params);
  }
}

function getBsdb() { return _bsdb; }

module.exports = { initDB, guardarDB, getDB, getBsdb, queryAll, queryOne, run };
