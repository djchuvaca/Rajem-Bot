const Database = require("better-sqlite3");
const fs        = require("fs");
const path      = require("path");

const DATA_DIR = path.join(__dirname, "../../data");
const DB_PATH  = path.join(DATA_DIR, `${process.env.TENANT_ID || 'tacos_javier'}.db`);

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
  _bsdb = new Database(DB_PATH);
  // DELETE es más simple para el backup (sin archivos -wal/-shm)
  _bsdb.pragma("journal_mode = DELETE");
  db = _makeCompatDB(_bsdb);
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
    _bsdb.exec(sql);
  } else {
    _bsdb.prepare(sql).run(...params);
  }
}

module.exports = { initDB, guardarDB, getDB, queryAll, queryOne, run };
