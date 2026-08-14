const { test, before } = require('node:test');
const assert = require('node:assert/strict');

const { getCatalogo, getGiro } = require('../src/giros');
const { getTemplateProducts, initDB } = require('../src/db');
const { run } = require('../src/db/core');
const { getPrecios, calcularPrecioItem } = require('../src/pedido/precios');
const parser = require('../src/handlers/pedidoParser');

before(async () => { await initDB(); });

test('taquería expone todo su catálogo desde el módulo de giro', () => {
  const catalogo = getCatalogo('taqueria');
  assert.equal(catalogo.cortes.length, getGiro('taqueria').cortes.length);
  assert.deepEqual(catalogo.bebidas.map(p => p.nombre), ['coca cola', 'fanta', 'sprite']);
  assert.deepEqual(catalogo.salsas.map(p => p.nombre), ['picada', 'suave', 'roja', 'cebolla']);
});

test('la API de compatibilidad deriva productos del giro, no de una tabla plantilla', () => {
  const productos = getTemplateProducts('taqueria');
  assert.ok(productos.some(p => p.categoria === 'corte' && p.catalogo_slug === 'buche'));
  assert.ok(productos.some(p => p.categoria === 'refresco' && p.nombre === 'fanta'));
  assert.ok(productos.some(p => p.categoria === 'salsa' && p.nombre === 'picada'));
});

test('bebidas y salsas canónicas no aceptan definiciones externas al giro', () => {
  const catalogo = getCatalogo('taqueria');
  assert.equal(catalogo.bebidas.some(p => p.nombre === 'bebida legacy'), false);
  assert.equal(catalogo.salsas.some(p => p.nombre === 'salsa legacy'), false);
});

test('el precio cobrado sale del menu_items proyectado desde Giro', () => {
  run("UPDATE menu_items SET precio=47 WHERE producto_slug='buche' AND formato_slug='taco' AND categoria='corte'");
  const total = calcularPrecioItem({ presentacion: 'taco', cantidad: 2, corte: 'buche' }, getPrecios());
  assert.equal(total, 94);
  run("UPDATE menu_items SET precio=30 WHERE producto_slug='buche' AND formato_slug='taco' AND categoria='corte'");
});

test('bebidas y salsas activas salen de Giro + menu_items, no de productos', () => {
  run("UPDATE menu_items SET activo=0 WHERE categoria IN ('refresco','salsa')");
  run("UPDATE productos SET activo=1 WHERE categoria IN ('refresco','salsa')");
  parser.invalidarCacheCortes();
  assert.deepEqual(parser.getRefrescos(), []);
  assert.deepEqual(parser.getSalsas(), []);
  run("UPDATE menu_items SET activo=1 WHERE categoria IN ('refresco','salsa')");
  parser.invalidarCacheCortes();
});

test('desactivar todos los cortes no reactiva el catálogo completo', () => {
  run("UPDATE menu_items SET activo=0 WHERE categoria='corte'");
  parser.invalidarCacheCortes();
  assert.deepEqual(parser.getCortes(), {});
  run("UPDATE menu_items SET activo=1 WHERE categoria='corte'");
  parser.invalidarCacheCortes();
  assert.ok(Object.keys(parser.getCortes()).length > 0);
});
