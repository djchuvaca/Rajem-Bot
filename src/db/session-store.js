// src/db/session-store.js
// Session store persistente sobre SQLite (better-sqlite3).
// Uso:
//   const SqliteSessionStore = require('./session-store');
//   store: new SqliteSessionStore(() => getDb())  // getDb() devuelve la instancia better-sqlite3
//
// El store es lazy: inicializa la tabla en el primer acceso, no al construirse.
// Esto permite usarlo antes de que la BD esté lista (p.ej. en el panel del tenant).

const { Store } = require('express-session');

class SqliteSessionStore extends Store {
  constructor(getDb) {
    super();
    this._getDb    = getDb;
    this._db       = null;
    this._initDone = false;
  }

  _ensure() {
    if (this._initDone) return this._db;
    const db = this._getDb();
    if (!db) return null;
    db.exec(`
      CREATE TABLE IF NOT EXISTS sessions (
        sid     TEXT    PRIMARY KEY,
        data    TEXT    NOT NULL,
        expires INTEGER NOT NULL
      )
    `);
    this._db = db;
    this._initDone = true;
    setInterval(() => {
      try { this._db.prepare('DELETE FROM sessions WHERE expires < ?').run(Date.now()); } catch {}
    }, 10 * 60 * 1000).unref();
    return db;
  }

  get(sid, cb) {
    try {
      const db = this._ensure();
      if (!db) return cb(null, null);
      const row = db.prepare('SELECT data, expires FROM sessions WHERE sid = ?').get(sid);
      if (!row || row.expires < Date.now()) return cb(null, null);
      cb(null, JSON.parse(row.data));
    } catch { cb(null, null); }
  }

  set(sid, sess, cb) {
    try {
      const db = this._ensure();
      if (!db) return cb(null);
      const maxAge  = sess.cookie?.maxAge ?? (8 * 60 * 60 * 1000);
      const expires = Date.now() + maxAge;
      db.prepare('INSERT OR REPLACE INTO sessions (sid, data, expires) VALUES (?,?,?)').run(sid, JSON.stringify(sess), expires);
      cb(null);
    } catch { cb(null); }
  }

  destroy(sid, cb) {
    try {
      const db = this._ensure();
      if (db) db.prepare('DELETE FROM sessions WHERE sid = ?').run(sid);
      cb(null);
    } catch { cb(null); }
  }

  touch(sid, sess, cb) { this.set(sid, sess, cb); }
}

module.exports = SqliteSessionStore;
