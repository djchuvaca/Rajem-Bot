'use strict';

const { test, after } = require('node:test');
const assert = require('node:assert/strict');
const os = require('os');
const path = require('path');
const fs = require('fs');
const bcrypt = require('bcryptjs');
const Database = require('better-sqlite3');
const { getTenantPanelUsuario, updateTenantPanelCredentials } = require('../src/superadmin/tenant-reader');

const dbPath = path.join(os.tmpdir(), `rajem-tenant-credentials-${process.pid}.db`);
const tenant = { id: 'credenciales-prueba', db_path: dbPath };

after(() => { try { fs.unlinkSync(dbPath); } catch (_) {} });

test('superadmin modifica de forma segura las credenciales del panel tenant', () => {
  const hashOriginal = bcrypt.hashSync('password-original-seguro', 4);
  const db = new Database(dbPath);
  db.exec('CREATE TABLE usuarios_panel (id INTEGER PRIMARY KEY AUTOINCREMENT, usuario TEXT UNIQUE NOT NULL, password TEXT NOT NULL)');
  db.prepare('INSERT INTO usuarios_panel (usuario,password) VALUES (?,?)').run('admin', hashOriginal);
  db.close();

  assert.deepStrictEqual(getTenantPanelUsuario(tenant), { id: 1, usuario: 'admin' });
  assert.strictEqual(updateTenantPanelCredentials(tenant, { usuario: 'nuevo.admin', passwordHash: null }), true);

  let verificacion = new Database(dbPath, { readonly: true });
  let fila = verificacion.prepare('SELECT usuario,password FROM usuarios_panel WHERE id=1').get();
  verificacion.close();
  assert.strictEqual(fila.usuario, 'nuevo.admin');
  assert.strictEqual(fila.password, hashOriginal);

  const hashNuevo = bcrypt.hashSync('password-nuevo-seguro', 4);
  assert.strictEqual(updateTenantPanelCredentials(tenant, { usuario: 'nuevo.admin', passwordHash: hashNuevo }), true);
  verificacion = new Database(dbPath, { readonly: true });
  fila = verificacion.prepare('SELECT usuario,password FROM usuarios_panel WHERE id=1').get();
  verificacion.close();
  assert.ok(bcrypt.compareSync('password-nuevo-seguro', fila.password));
});
