'use strict';

const { test, before } = require('node:test');
const assert = require('node:assert/strict');

const { initDB, queryOne } = require('../src/db/core');
const { seedDB } = require('../src/db/seed');
const catalogo = require('../src/giros/catalogo-tenant');

before(async () => {
  await initDB();
  await seedDB();
});

test('agotado oculta el producto de WhatsApp sin quitar la habilitación del Superadmin', () => {
  const item = queryOne("SELECT * FROM menu_items WHERE categoria='corte' AND activo=1 LIMIT 1");
  assert.ok(item);
  assert.ok(catalogo.setMenuItemDisponibilidad(item.producto_slug, 'corte', false) > 0);
  const agotado = queryOne('SELECT activo,disponible FROM menu_items WHERE id=?', [item.id]);
  assert.equal(agotado.activo, 1);
  assert.equal(agotado.disponible, 0);
  assert.equal(catalogo.getMenuItemsActivos('corte').some(i => i.producto_slug === item.producto_slug), false);

  assert.ok(catalogo.setMenuItemDisponibilidad(item.producto_slug, 'corte', true) > 0);
  assert.equal(catalogo.getMenuItemsActivos('corte').some(i => i.producto_slug === item.producto_slug), true);
});

test('el tenant no puede cambiar disponibilidad de un producto no habilitado', () => {
  assert.equal(catalogo.setMenuItemDisponibilidad('producto-inventado', 'corte', false), 0);
});

