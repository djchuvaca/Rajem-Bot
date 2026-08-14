const test = require('node:test');
const assert = require('node:assert/strict');

const { getCatalogo, getGiro } = require('../src/giros');
const { getTemplateProducts } = require('../src/db');

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
