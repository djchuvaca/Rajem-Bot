process.env.TENANT_ID = '_test';
const { test, before } = require('node:test');
const assert = require('node:assert/strict');

const { getCatalogo, getGiro, getContratoGiro, listGiros } = require('../src/giros');
const { VERSION_CONTRATO_GIRO, validarDefinicionGiro, validarNluGiro } = require('../src/giros/contrato');
const { initDB } = require('../src/db');
const { run } = require('../src/db/core');
const { getPrecios, calcularPrecioItem } = require('../src/pedido/precios');
const parser = require('../src/handlers/pedidoParser');

before(async () => { await initDB(); });

test('todos los giros registrados cumplen el contrato estructural', () => {
  for (const giro of listGiros()) {
    assert.deepEqual(validarDefinicionGiro(giro), { valido: true, errores: [] }, giro.slug);
  }
});

test('todos los giros exponen un contrato NLU común y versionado', () => {
  for (const giro of listGiros()) {
    const contrato = getContratoGiro(giro.slug);
    assert.equal(contrato.version, VERSION_CONTRATO_GIRO);
    assert.equal(contrato.slug, giro.slug);
    assert.equal(typeof contrato.parsearPedido, 'function');
    assert.equal(typeof contrato.detectarDatoFaltante, 'function');
    assert.equal(typeof contrato.detectarModificacion, 'function');
    assert.equal(typeof contrato.separarComplementos, 'function');
    assert.deepEqual(validarNluGiro(contrato.obtenerNlu()), { valido: true, errores: [] }, giro.slug);
  }
});

test('las capacidades particulares quedan declaradas por Giro', () => {
  assert.equal(getContratoGiro('taqueria').capacidades.porcionado, true);
  assert.equal(getContratoGiro('taqueria').capacidades.ventaPorPeso, true);
  assert.equal(getContratoGiro('pizzeria').capacidades.porcionado, false);
  assert.equal(getContratoGiro('hamburgueseria').capacidades.ventaPorPeso, false);
});

test('el contrato normaliza datos faltantes sin vocabulario de taquería en handlers', () => {
  assert.deepEqual(getContratoGiro('taqueria').detectarDatoFaltante('3 tacos'), {
    estado: 'dato_faltante',
    campo: 'variante',
    presentacion: 'taco',
  });
});

test('el contrato puede entregar un pedido neutral sin cambiar su API legacy', () => {
  const contrato = getContratoGiro('taqueria');
  const legacy = contrato.parsearPedido('3 tacos de surtido');
  const neutral = contrato.parsearPedidoNormalizado('3 tacos de surtido');
  assert.equal(legacy.items[0].presentacion, 'taco');
  assert.equal(neutral.partidas[0].formatoSlug, 'taco');
  assert.equal(neutral.partidas[0].productoSlug, 'surtido');
  assert.deepEqual(contrato.convertirPedidoLegacy(neutral), legacy);
});

test('rechaza definiciones de Giro incompletas antes de registrarlas', () => {
  const resultado = validarDefinicionGiro({ slug: 'incompleto', nombre: 'Incompleto' });
  assert.equal(resultado.valido, false);
  assert.ok(resultado.errores.some(error => error.includes('itemTypes')));
  assert.ok(resultado.errores.some(error => error.includes('comportamiento')));
});

test('taquería expone todo su catálogo desde el módulo de giro', () => {
  const catalogo = getCatalogo('taqueria');
  assert.equal(catalogo.cortes.length, getGiro('taqueria').cortes.length);
  assert.deepEqual(catalogo.bebidas.map(p => p.nombre), ['coca cola', 'fanta', 'sprite']);
  assert.deepEqual(catalogo.salsas.map(p => p.nombre), ['picada', 'suave', 'roja', 'cebolla', 'limones']);
  assert.deepEqual(catalogo.salsas.map(p => p.emoji), ['🌶️', '🌿', '🔴', '🧅', '🍋']);
});

test('el giro no conserva una segunda plantilla productos[]', () => {
  assert.equal(Object.hasOwn(getGiro('taqueria'), 'productos'), false);
  assert.equal(Object.hasOwn(getGiro('pizzeria'), 'productos'), false);
  assert.equal(Object.hasOwn(getGiro('hamburgueseria'), 'productos'), false);
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

test('NLU reconoce Limones y sus cantidades desde el catálogo Giro', () => {
  run("UPDATE menu_items SET activo=1, disponible=1, precio=6 WHERE categoria='salsa' AND producto_slug='limones'");
  parser.invalidarCacheCortes();
  assert.deepEqual(parser.detectarSalsa('agrégame limón extra'), ['limones']);
  const separado = parser.separarRefresco('3 tacos de buche y dos limoncitos');
  assert.deepEqual(separado.salsas, [{ nombre: 'limones', cantidad: 2 }]);
  assert.equal(separado.textoLimpio.includes('limoncito'), false);
  assert.equal(parser.separarRefresco('3 tacos de buche sin limón').salsas.length, 0);
});

test('NLU no vende un complemento agotado y conserva su identificación', () => {
  run("UPDATE menu_items SET activo=1, disponible=0 WHERE categoria='salsa' AND producto_slug='limones'");
  parser.invalidarCacheCortes();
  assert.equal(parser.getSalsas().some(x => x.nombre === 'limones'), false);
  assert.deepEqual(parser.detectarComplementosNoDisponibles('quiero limones'), [
    { nombre: 'limones', categoria: 'salsa', agotado: true },
  ]);
  assert.deepEqual(parser.detectarComplementosNoDisponibles('sin limón'), []);
  run("UPDATE menu_items SET disponible=1 WHERE categoria='salsa' AND producto_slug='limones'");
  parser.invalidarCacheCortes();
});
