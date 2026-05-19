const initSqlJs = require("sql.js");
const fs        = require("fs");
const path      = require("path");

const DATA_DIR = path.join(__dirname, "../../data");
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
  return db;
}

function guardarDB() {
  if (!db) return;
  fs.writeFileSync(DB_PATH, Buffer.from(db.export()));
}

function getDB() {
  return db;
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

module.exports = { initDB, guardarDB, getDB, queryAll, queryOne, run };
