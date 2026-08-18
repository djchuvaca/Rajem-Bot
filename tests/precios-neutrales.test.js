'use strict';
process.env.TENANT_ID = '_test';

const { test, before } = require('node:test');
const assert            = require('node:assert/strict');
const { initDB }        = require('../src/db/core');
const { seedDB }        = require('../src/db/seed');
const parser            = require('../src/handlers/pedidoParser');
const { getContratoGiro, getGiro } = require('../src/giros');
const { calcularPartida, calcularPedido } = require('../src/giros/precios');
const { crearResolver }   = require('../src/giros/taqueria/precios');
const { formatearPartida, formatearPedido } = require('../src/giros/taqueria/presentacion');

// ── Helpers ───────────────────────────────────────────────────────────────────

function partida(formatoSlug, productoSlug, tipo, valor, extra = {}) {
  return {
    tipo: 'producto',
    formatoSlug,
    productoSlug,
    cantidad: { tipo, valor },
    combinacion: extra.combinacion || [],
    extras: [],
    metadata: {},
    ...extra,
  };
}

function pedido(...partidas) {
  return { tipo: 'pedido', versionModelo: 1, partidas, metadata: {} };
}

function resolverFijo(precio) {
  return () => precio;
}

before(async () => {
  await initDB();
  await seedDB();
  parser.invalidarCacheCortes();
});

// ─────────────────────────────────────────────────────────────────────────────
// SECCIÓN 1 — Motor neutral puro (sin BD)
// ─────────────────────────────────────────────────────────────────────────────

test('calcularPartida — unidad: cantidad × precio unitario', () => {
  const p = partida('taco', 'surtido', 'unidad', 3);
  assert.equal(calcularPartida(p, resolverFijo(30)), 90);
});

test('calcularPartida — unidad: distintos precios unitarios', () => {
  const p1 = partida('taco',  'surtido', 'unidad', 2);
  const p2 = partida('torta', 'buche',   'unidad', 1);
  assert.equal(calcularPartida(p1, resolverFijo(30)), 60);
  assert.equal(calcularPartida(p2, resolverFijo(45)), 45);
});

test('calcularPartida — peso: (gramos / 100) × precio_100g, redondeado', () => {
  const p = partida('gramos', 'surtido', 'peso', 200);
  assert.equal(calcularPartida(p, resolverFijo(32)), 64);

  // Fracción → redondeo hacia el entero más cercano
  const p2 = partida('gramos', 'surtido', 'peso', 150);
  assert.equal(calcularPartida(p2, resolverFijo(32)), 48);
});

test('calcularPartida — importe: devuelve el monto tal cual', () => {
  const p = partida('por_pesos', 'surtido', 'importe', 200);
  // El resolver no se usa para tipo importe; el precio = el propio valor
  assert.equal(calcularPartida(p, resolverFijo(999)), 200);
});

test('calcularPartida — agrupacion repetida: grupos × suma interna', () => {
  const ag = {
    tipo: 'agrupacion',
    modo: 'repetida',
    grupos: 3,
    numero: null,
    partidas: [partida('taco', 'surtido', 'unidad', 1)],
    metadata: {},
  };
  // 3 grupos × (1 taco × $30) = $90
  assert.equal(calcularPartida(ag, resolverFijo(30)), 90);
});

test('calcularPartida — agrupacion separada (plato único): 1 × suma interna', () => {
  const ag = {
    tipo: 'agrupacion',
    modo: 'separada',
    grupos: 1,
    numero: 1,
    partidas: [
      partida('taco', 'buche',   'unidad', 1),
      partida('taco', 'surtido', 'unidad', 1),
    ],
    metadata: {},
  };
  // 1 plato: 1×$35 + 1×$30 = $65 (con resolver fijo $30 todos valen $30 → $60)
  assert.equal(calcularPartida(ag, resolverFijo(30)), 60);
});

test('calcularPedido — suma todas las partidas del pedido', () => {
  const p = pedido(
    partida('taco',  'surtido', 'unidad', 3),
    partida('torta', 'buche',   'unidad', 2),
  );
  // 3×$30 + 2×$40 = $170
  assert.equal(calcularPedido(p, v => v === 'taco' ? 30 : 40), 170);
});

test('calcularPedido — pedido inválido devuelve 0', () => {
  assert.equal(calcularPedido(null, resolverFijo(30)), 0);
  assert.equal(calcularPedido({ tipo: 'otro' }, resolverFijo(30)), 0);
});

test('calcularPartida — resolver nulo devuelve 0', () => {
  const p = partida('taco', 'surtido', 'unidad', 3);
  assert.equal(calcularPartida(p, null), 0);
});

// ─────────────────────────────────────────────────────────────────────────────
// SECCIÓN 2 — Resolver taquería (necesita BD)
// ─────────────────────────────────────────────────────────────────────────────

test('resolver taquería devuelve precio de taco para formatoSlug taco', () => {
  const resolver = crearResolver();
  const precio   = resolver('taco', 'surtido', []);
  assert.ok(typeof precio === 'number' && precio > 0, `precio taco debe ser positivo, obtuvo ${precio}`);
});

test('resolver taquería devuelve precio de torta para formatoSlug torta', () => {
  const resolver = crearResolver();
  const precio   = resolver('torta', 'buche', []);
  assert.ok(typeof precio === 'number' && precio > 0, `precio torta debe ser positivo, obtuvo ${precio}`);
});

test('resolver taquería devuelve precio_100g para formatoSlug gramos', () => {
  const resolver  = crearResolver();
  const precio100 = resolver('gramos', 'carnitas', []);
  assert.ok(typeof precio100 === 'number' && precio100 > 0, `precio_100g debe ser positivo, obtuvo ${precio100}`);
});

test('resolver con combinacion devuelve precio máximo de los componentes', () => {
  const resolver = crearResolver();
  const precioA  = resolver('taco', 'surtido',  []);
  const precioB  = resolver('taco', 'buche',    []);
  const precioComb = resolver('taco', null, ['surtido', 'buche']);
  assert.equal(precioComb, Math.max(precioA, precioB));
});

test('cadena completa: partida → resolver taquería → calcularPartida', () => {
  const resolver = crearResolver();
  const p        = partida('taco', 'surtido', 'unidad', 3);
  const pUnit    = resolver('taco', 'surtido', []);
  const total    = calcularPartida(p, resolver);
  assert.equal(total, 3 * pUnit);
});

test('cadena completa: pedido con gramos → precio correcto', () => {
  const resolver = crearResolver();
  const p200g    = partida('gramos', 'surtido', 'peso', 200);
  const p100     = resolver('gramos', 'surtido', []);
  const total    = calcularPartida(p200g, resolver);
  assert.equal(total, Math.round((200 / 100) * p100));
});

// ─────────────────────────────────────────────────────────────────────────────
// SECCIÓN 3 — Presentación taquería (usa definición del Giro, sin BD)
// ─────────────────────────────────────────────────────────────────────────────

test('formatearPartida — taco singular', () => {
  const giro = getGiro('taqueria');
  const p    = partida('taco', 'surtido', 'unidad', 1);
  const txt  = formatearPartida(p, 30, giro);
  assert.match(txt, /1\s+taco/i);
  assert.match(txt, /surtido/i);
  assert.match(txt, /\$30/);
});

test('formatearPartida — tacos plural', () => {
  const giro = getGiro('taqueria');
  const p    = partida('taco', 'surtido', 'unidad', 3);
  const txt  = formatearPartida(p, 90, giro);
  assert.match(txt, /3\s+tacos/i);
  assert.match(txt, /surtido/i);
  assert.match(txt, /\$90/);
});

test('formatearPartida — torta', () => {
  const giro = getGiro('taqueria');
  const p    = partida('torta', 'buche', 'unidad', 2);
  const txt  = formatearPartida(p, 80, giro);
  assert.match(txt, /tortas?/i);
  assert.match(txt, /buche/i);
  assert.match(txt, /\$80/);
});

test('formatearPartida — gramos (peso)', () => {
  const giro = getGiro('taqueria');
  const p    = partida('gramos', 'surtido', 'peso', 200);
  const txt  = formatearPartida(p, 64, giro);
  assert.match(txt, /200g/i);
  assert.match(txt, /surtido/i);
  assert.match(txt, /\$64/);
});

test('formatearPartida — importe ($200 de surtido)', () => {
  const giro = getGiro('taqueria');
  const p    = partida('por_pesos', 'surtido', 'importe', 200);
  const txt  = formatearPartida(p, 200, giro);
  assert.match(txt, /\$200/);
  assert.match(txt, /surtido/i);
});

test('formatearPartida — combinación de cortes', () => {
  const giro = getGiro('taqueria');
  const p    = { ...partida('taco', null, 'unidad', 2), combinacion: ['buche', 'surtido'] };
  const txt  = formatearPartida(p, 70, giro);
  assert.match(txt, /2\s+tacos?/i);
  assert.match(txt, /buche/i);
  assert.match(txt, /surtido/i);
  assert.match(txt, /\$70/);
});

test('formatearPartida — sin precio muestra solo descripción', () => {
  const giro = getGiro('taqueria');
  const p    = partida('taco', 'surtido', 'unidad', 3);
  const txt  = formatearPartida(p, null, giro);
  assert.match(txt, /3\s+tacos?/i);
  assert.doesNotMatch(txt, /\$\d/);
});

test('formatearPartida — agrupacion separada (plato individual)', () => {
  const giro = getGiro('taqueria');
  const ag   = {
    tipo: 'agrupacion', modo: 'separada', grupos: 1, numero: 2,
    partidas: [partida('taco', 'buche', 'unidad', 1)],
    metadata: {},
  };
  const txt = formatearPartida(ag, 35, giro);
  assert.match(txt, /Plato\s*2/i);
  assert.match(txt, /buche/i);
});

test('formatearPartida — agrupacion repetida', () => {
  const giro = getGiro('taqueria');
  const ag   = {
    tipo: 'agrupacion', modo: 'repetida', grupos: 3, numero: null,
    partidas: [partida('taco', 'surtido', 'unidad', 2)],
    metadata: {},
  };
  const txt = formatearPartida(ag, 180, giro);
  assert.match(txt, /3x/i);
  assert.match(txt, /surtido/i);
});

test('formatearPedido — genera texto multi-línea con precios', () => {
  const giro     = getGiro('taqueria');
  const resolver = crearResolver();
  const p        = pedido(
    partida('taco',  'surtido', 'unidad', 3),
    partida('torta', 'buche',   'unidad', 1),
  );
  const txt = formatearPedido(p, resolver, giro);
  const lineas = txt.split('\n').filter(Boolean);
  assert.equal(lineas.length, 2);
  assert.match(lineas[0], /tacos/i);
  assert.match(lineas[1], /torta/i);
});

// ─────────────────────────────────────────────────────────────────────────────
// SECCIÓN 4 — Integración desde el contrato
// ─────────────────────────────────────────────────────────────────────────────

test('contrato taquería — calcularPrecioPartida devuelve número positivo', () => {
  const contrato = getContratoGiro('taqueria');
  const p        = partida('taco', 'surtido', 'unidad', 3);
  const precio   = contrato.calcularPrecioPartida(p);
  assert.ok(typeof precio === 'number' && precio > 0);
});

test('contrato taquería — calcularPrecioPedido suma todas las partidas', () => {
  const contrato = getContratoGiro('taqueria');
  const p        = pedido(
    partida('taco',  'surtido', 'unidad', 3),
    partida('torta', 'buche',   'unidad', 2),
  );
  const total    = contrato.calcularPrecioPedido(p);
  const parcial1 = contrato.calcularPrecioPartida(partida('taco',  'surtido', 'unidad', 3));
  const parcial2 = contrato.calcularPrecioPartida(partida('torta', 'buche',   'unidad', 2));
  assert.equal(total, parcial1 + parcial2);
});

test('contrato taquería — formatearPartida devuelve texto no vacío', () => {
  const contrato = getContratoGiro('taqueria');
  const p        = partida('taco', 'surtido', 'unidad', 2);
  const precio   = contrato.calcularPrecioPartida(p);
  const txt      = contrato.formatearPartida(p, precio);
  assert.ok(txt.length > 0);
  assert.match(txt, /taco/i);
  assert.match(txt, /\$\d/);
});

test('contrato taquería — formatearPedido genera líneas válidas', () => {
  const contrato = getContratoGiro('taqueria');
  const p        = pedido(
    partida('taco',  'surtido', 'unidad', 2),
    partida('torta', 'buche',   'unidad', 1),
  );
  const txt    = contrato.formatearPedido(p);
  const lineas = txt.split('\n').filter(Boolean);
  assert.equal(lineas.length, 2);
});

test('contrato pizzería — calcularPrecioPartida devuelve 0 (no implementado en F6)', () => {
  const contrato = getContratoGiro('pizzeria');
  const p        = partida('pizza_individual', 'hawaiana', 'unidad', 1);
  assert.equal(contrato.calcularPrecioPartida(p), 0);
});

test('contrato pizzería — formatearPartida devuelve vacío (no implementado en F6)', () => {
  const contrato = getContratoGiro('pizzeria');
  const p        = partida('pizza_individual', 'hawaiana', 'unidad', 1);
  assert.equal(contrato.formatearPartida(p, 100), '');
});

// ─────────────────────────────────────────────────────────────────────────────
// SECCIÓN 5 — Compatibilidad con el sistema heredado
// ─────────────────────────────────────────────────────────────────────────────

test('legacy getPrecios() y calcularPrecioItem() siguen funcionando', () => {
  const { getPrecios, calcularPrecioItem } = require('../src/pedido/precios');
  const precios = getPrecios();
  assert.ok(typeof precios.pTaco  === 'number');
  assert.ok(typeof precios.pTorta === 'number');
  assert.ok(typeof precios.p100g  === 'number');

  const itemLegacy = { presentacion: 'taco', corte: 'surtido', cantidad: 3 };
  const precio     = calcularPrecioItem(itemLegacy, precios);
  assert.equal(precio, 3 * precios.pTaco);
});

test('legacy calcularSubtotal() sigue funcionando', () => {
  const { calcularSubtotal } = require('../src/pedido/precios');
  const ordenTexto = '3 tacos de surtido — $90\n2 tortas de buche — $80';
  const subtotal   = calcularSubtotal(ordenTexto);
  assert.equal(subtotal, 170);
});
