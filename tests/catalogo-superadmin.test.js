'use strict';

const { test } = require('node:test');
const assert = require('node:assert/strict');
const os = require('os');
const path = require('path');
const Database = require('better-sqlite3');

const {
  getTenantCatalogoAdmin,
  setTenantFormatoActivo,
  setTenantProductoActivo,
} = require('../src/superadmin/tenant-reader');

function crearTenantPrueba() {
  const dbPath = path.join(os.tmpdir(), `rajem-catalogo-${process.pid}-${Date.now()}.db`);
  const db = new Database(dbPath);
  db.exec(`
    CREATE TABLE configuracion (clave TEXT PRIMARY KEY, valor TEXT);
    INSERT INTO configuracion VALUES ('business_type_slug','taqueria');
    CREATE TABLE business_types (id INTEGER PRIMARY KEY, slug TEXT UNIQUE);
    INSERT INTO business_types VALUES (1,'taqueria');
    CREATE TABLE item_types (id INTEGER PRIMARY KEY, business_type_id INTEGER, slug TEXT, nombre_plural TEXT, emoji TEXT, precio_base REAL, activo INTEGER DEFAULT 0);
    INSERT INTO item_types VALUES (1,1,'taco','tacos','🌮',30,0);
    CREATE TABLE menu_items (id INTEGER PRIMARY KEY AUTOINCREMENT, producto_slug TEXT NOT NULL, formato_slug TEXT, categoria TEXT, precio REAL DEFAULT 0, activo INTEGER DEFAULT 0, disponible INTEGER DEFAULT 1, eliminado INTEGER DEFAULT 0);
    CREATE UNIQUE INDEX idx_menu_items_uq ON menu_items(producto_slug,COALESCE(formato_slug,''),categoria);
  `);
  db.close();
  return { tenant: { id: `catalogo-${Date.now()}`, db_path: dbPath, business_type: 'taqueria' }, dbPath };
}

test('el Superadmin habilita formatos y productos canónicos en la BD del tenant', () => {
  const { tenant, dbPath } = crearTenantPrueba();
  const inicial = getTenantCatalogoAdmin(tenant);
  assert.equal(inicial.formatos.find(f => f.slug === 'taco').activo, false);
  assert.ok(inicial.cortes.some(c => c.slug === 'surtido'));
  assert.ok(inicial.cortes.some(c => c.seccion === 'carnitas'));
  assert.ok(inicial.cortes.some(c => c.seccion === 'asada'));

  assert.equal(setTenantFormatoActivo(tenant, 1, true), true);
  assert.equal(setTenantProductoActivo(tenant, 'corte', 'surtido', true), true);

  const db = new Database(dbPath, { readonly: true });
  assert.equal(db.prepare("SELECT activo FROM item_types WHERE slug='taco'").get().activo, 1);
  assert.equal(db.prepare("SELECT activo FROM menu_items WHERE producto_slug='surtido' AND formato_slug='taco'").get().activo, 1);
  db.close();
});

test('el Superadmin rechaza productos que no pertenecen al Giro', () => {
  const { tenant } = crearTenantPrueba();
  assert.equal(setTenantProductoActivo(tenant, 'corte', 'producto-inventado', true), false);
});
