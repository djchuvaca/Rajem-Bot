'use strict';

const { test, before } = require('node:test');
const assert           = require('node:assert/strict');
const { initDB }       = require('../src/db/core');
const { seedDB }       = require('../src/db/seed');
const parser           = require('../src/handlers/pedidoParser');
const { getContratoGiro } = require('../src/giros');
const {
  crearOperacion,
  validarOperacion,
  aplicarOperacion,
  TIPOS_OPERACION,
} = require('../src/giros/modificaciones');

// ── Helpers de pedido neutral ─────────────────────────────────────────────────

function partidaProducto(formatoSlug, productoSlug, cantidad) {
  return {
    tipo: 'producto',
    formatoSlug,
    productoSlug,
    cantidad: { tipo: 'unidad', valor: cantidad },
    combinacion: [],
    extras: [],
    metadata: {},
  };
}

function pedido(...partidas) {
  return { tipo: 'pedido', versionModelo: 1, partidas, metadata: {} };
}

// ── Inicialización BD (requerida solo por las pruebas de detección) ───────────

before(async () => {
  await initDB();
  await seedDB();
  parser.invalidarCacheCortes();
});

// ─────────────────────────────────────────────────────────────────────────────
// SECCIÓN 1 — aplicarOperacion (pura, sin BD)
// ─────────────────────────────────────────────────────────────────────────────

test('TIPOS_OPERACION contiene los seis tipos definidos', () => {
  assert.equal(TIPOS_OPERACION.length, 6);
  assert.ok(TIPOS_OPERACION.includes('eliminar_partida'));
  assert.ok(TIPOS_OPERACION.includes('reducir_cantidad'));
  assert.ok(TIPOS_OPERACION.includes('cambiar_variante'));
  assert.ok(TIPOS_OPERACION.includes('cambiar_formato'));
  assert.ok(TIPOS_OPERACION.includes('agregar_item'));
  assert.ok(TIPOS_OPERACION.includes('cambiar_agrupacion'));
});

test('validarOperacion — rechaza operación sin tipo reconocido', () => {
  const { valida, errores } = validarOperacion({ tipo: 'inventado' });
  assert.equal(valida, false);
  assert.ok(errores.some(e => e.includes('inventado')));
});

test('validarOperacion — rechaza reducir_cantidad sin cantidad positiva', () => {
  const { valida } = validarOperacion({ tipo: 'reducir_cantidad', selector: {}, cantidad: 0 });
  assert.equal(valida, false);
});

test('validarOperacion — acepta operación completa válida', () => {
  const { valida } = validarOperacion(crearOperacion('reducir_cantidad', { cantidad: 2, selector: {} }));
  assert.equal(valida, true);
});

// eliminar_partida ─────────────────────────────────────────────────────────────

test('eliminar_partida — elimina la partida que coincide con el selector', () => {
  const p = pedido(
    partidaProducto('taco', 'surtido', 3),
    partidaProducto('torta', 'buche', 2),
  );
  const op = crearOperacion('eliminar_partida', { selector: { formatoSlug: 'taco' } });
  const { pedido: resultado, error } = aplicarOperacion(op, p);
  assert.equal(error, undefined);
  assert.equal(resultado.partidas.length, 1);
  assert.equal(resultado.partidas[0].formatoSlug, 'torta');
});

test('eliminar_partida — devuelve error si no encuentra la partida', () => {
  const p  = pedido(partidaProducto('taco', 'surtido', 3));
  const op = crearOperacion('eliminar_partida', { selector: { formatoSlug: 'torta' } });
  const { error } = aplicarOperacion(op, p);
  assert.ok(error);
});

test('eliminar_partida — devuelve error si el pedido quedaría vacío', () => {
  const p  = pedido(partidaProducto('taco', 'surtido', 3));
  const op = crearOperacion('eliminar_partida', { selector: { formatoSlug: 'taco' } });
  const { error } = aplicarOperacion(op, p);
  assert.ok(error, 'debe rechazar dejar el pedido vacío');
});

// reducir_cantidad ─────────────────────────────────────────────────────────────

test('reducir_cantidad — reduce la cantidad de la partida encontrada', () => {
  const p  = pedido(
    partidaProducto('taco', 'surtido', 3),
    partidaProducto('torta', 'buche', 2),
  );
  const op = crearOperacion('reducir_cantidad', { cantidad: 1, selector: { productoSlug: 'surtido' } });
  const { pedido: resultado } = aplicarOperacion(op, p);
  assert.equal(resultado.partidas[0].cantidad.valor, 2);
  assert.equal(resultado.partidas[1].cantidad.valor, 2);
});

test('reducir_cantidad — elimina la partida cuando llega a cero', () => {
  const p  = pedido(
    partidaProducto('taco', 'surtido', 1),
    partidaProducto('torta', 'buche', 2),
  );
  const op = crearOperacion('reducir_cantidad', { cantidad: 1, selector: { productoSlug: 'surtido' } });
  const { pedido: resultado } = aplicarOperacion(op, p);
  assert.equal(resultado.partidas.length, 1);
  assert.equal(resultado.partidas[0].formatoSlug, 'torta');
});

test('reducir_cantidad — devuelve error si la partida no existe', () => {
  const p  = pedido(partidaProducto('taco', 'surtido', 3));
  const op = crearOperacion('reducir_cantidad', { cantidad: 1, selector: { productoSlug: 'buche' } });
  const { error } = aplicarOperacion(op, p);
  assert.ok(error);
});

// cambiar_variante ─────────────────────────────────────────────────────────────

test('cambiar_variante — actualiza productoSlug en todas las partidas que coinciden', () => {
  const p  = pedido(
    partidaProducto('taco', 'buche', 3),
    partidaProducto('torta', 'buche', 2),
    partidaProducto('taco', 'surtido', 1),
  );
  const op = crearOperacion('cambiar_variante', { de: 'buche', a: 'surtido' });
  const { pedido: resultado } = aplicarOperacion(op, p);
  assert.equal(resultado.partidas[0].productoSlug, 'surtido');
  assert.equal(resultado.partidas[1].productoSlug, 'surtido');
  assert.equal(resultado.partidas[2].productoSlug, 'surtido');
});

test('cambiar_variante — devuelve error si la variante no está en el pedido', () => {
  const p  = pedido(partidaProducto('taco', 'surtido', 2));
  const op = crearOperacion('cambiar_variante', { de: 'cuero', a: 'surtido' });
  const { error } = aplicarOperacion(op, p);
  assert.ok(error);
});

// cambiar_formato ─────────────────────────────────────────────────────────────

test('cambiar_formato — actualiza formatoSlug en todas las partidas que coinciden', () => {
  const p  = pedido(
    partidaProducto('torta', 'surtido', 2),
    partidaProducto('torta', 'buche', 1),
  );
  const op = crearOperacion('cambiar_formato', { de: 'torta', a: 'taco' });
  const { pedido: resultado } = aplicarOperacion(op, p);
  assert.ok(resultado.partidas.every(pa => pa.formatoSlug === 'taco'));
});

test('cambiar_formato — devuelve error si el formato no está en el pedido', () => {
  const p  = pedido(partidaProducto('taco', 'surtido', 2));
  const op = crearOperacion('cambiar_formato', { de: 'torta', a: 'taco' });
  const { error } = aplicarOperacion(op, p);
  assert.ok(error);
});

// agregar_item ─────────────────────────────────────────────────────────────────

test('agregar_item — incrementa partida existente cuando coincide por productoSlug', () => {
  const p  = pedido(
    partidaProducto('taco', 'surtido', 3),
    partidaProducto('torta', 'buche', 2),
  );
  const op = crearOperacion('agregar_item', {
    item: { productoSlug: 'surtido', cantidad: { tipo: 'unidad', valor: 2 } },
  });
  const { pedido: resultado } = aplicarOperacion(op, p);
  assert.equal(resultado.partidas[0].cantidad.valor, 5);
  assert.equal(resultado.partidas.length, 2);
});

test('agregar_item — crea nueva partida si no existe y hay formatoSlug', () => {
  const p  = pedido(partidaProducto('taco', 'surtido', 3));
  const op = crearOperacion('agregar_item', {
    item: {
      formatoSlug: 'torta',
      productoSlug: 'buche',
      cantidad: { tipo: 'unidad', valor: 1 },
    },
  });
  const { pedido: resultado } = aplicarOperacion(op, p);
  assert.equal(resultado.partidas.length, 2);
  assert.equal(resultado.partidas[1].formatoSlug, 'torta');
});

test('agregar_item — devuelve error si no hay partida existente y falta formatoSlug', () => {
  const p  = pedido(partidaProducto('taco', 'surtido', 3));
  const op = crearOperacion('agregar_item', {
    item: { productoSlug: 'cuero', cantidad: { tipo: 'unidad', valor: 1 } },
  });
  const { error } = aplicarOperacion(op, p);
  assert.ok(error);
});

// Errores generales ─────────────────────────────────────────────────────────────

test('aplicarOperacion — devuelve error con pedido inválido', () => {
  const op = crearOperacion('eliminar_partida', { selector: { formatoSlug: 'taco' } });
  const { error } = aplicarOperacion(op, null);
  assert.ok(error);
});

test('aplicarOperacion — devuelve error con operación inválida (sin tipo)', () => {
  const { error } = aplicarOperacion({ tipo: 'desconocido' }, pedido(partidaProducto('taco', 'surtido', 1)));
  assert.ok(error);
});

// ─────────────────────────────────────────────────────────────────────────────
// SECCIÓN 2 — detectarModificacionNeutral desde contrato (necesita BD)
// ─────────────────────────────────────────────────────────────────────────────

test('detecta reducir_cantidad — "quítame uno"', () => {
  const contrato = getContratoGiro('taqueria');
  const op = contrato.detectarModificacionNeutral('quítame uno');
  assert.ok(op, 'debe devolver una operación');
  assert.equal(op.tipo, 'reducir_cantidad');
  assert.equal(op.cantidad, 1);
  assert.equal(op.selector.productoSlug, null);
});

test('detecta reducir_cantidad con variante — "quítame uno de surtido"', () => {
  const contrato = getContratoGiro('taqueria');
  const op = contrato.detectarModificacionNeutral('quítame uno de surtido');
  assert.ok(op);
  assert.equal(op.tipo, 'reducir_cantidad');
  assert.equal(op.cantidad, 1);
  assert.equal(op.selector.productoSlug, 'surtido');
});

test('detecta eliminar_partida — "quita los 3 tacos de surtido"', () => {
  const contrato = getContratoGiro('taqueria');
  const op = contrato.detectarModificacionNeutral('quita los 3 tacos de surtido');
  assert.ok(op);
  assert.equal(op.tipo, 'eliminar_partida');
  assert.equal(op.selector.cantidad, 3);
  assert.ok(op.selector.formatoSlug, 'debe incluir formatoSlug');
  assert.equal(op.selector.productoSlug, 'surtido');
});

test('detecta agregar_item — "agrega 2 más de buche"', () => {
  const contrato = getContratoGiro('taqueria');
  const op = contrato.detectarModificacionNeutral('agrega 2 más de buche');
  assert.ok(op);
  assert.equal(op.tipo, 'agregar_item');
  assert.equal(op.item.cantidad.valor, 2);
  assert.equal(op.item.productoSlug, 'buche');
});

test('detecta cambiar_variante — "cambia el buche por surtido"', () => {
  const contrato = getContratoGiro('taqueria');
  const op = contrato.detectarModificacionNeutral('cambia el buche por surtido');
  assert.ok(op);
  assert.equal(op.tipo, 'cambiar_variante');
  assert.equal(op.de, 'buche');
  assert.equal(op.a, 'surtido');
});

test('detecta cambiar_formato — "cambia la torta por taco"', () => {
  const contrato = getContratoGiro('taqueria');
  const op = contrato.detectarModificacionNeutral('cambia la torta por taco');
  assert.ok(op);
  assert.equal(op.tipo, 'cambiar_formato');
  assert.equal(op.de, 'torta');
  assert.equal(op.a, 'taco');
});

test('retorna null para texto sin modificación', () => {
  const contrato = getContratoGiro('taqueria');
  assert.equal(contrato.detectarModificacionNeutral('dame 3 tacos de surtido'), null);
  assert.equal(contrato.detectarModificacionNeutral('cuánto es el total'), null);
});

// ── Integración detectar → aplicar ────────────────────────────────────────────

test('cadena completa: detectar → aplicar sobre pedido neutral', () => {
  const contrato = getContratoGiro('taqueria');
  const pedidoNeutral = pedido(
    partidaProducto('taco', 'surtido', 3),
    partidaProducto('torta', 'buche', 2),
  );

  const op = contrato.detectarModificacionNeutral('quítame uno de surtido');
  assert.ok(op, 'la operación debe detectarse');

  const { pedido: resultado, error } = contrato.aplicarOperacion(op, pedidoNeutral);
  assert.equal(error, undefined);
  assert.equal(resultado.partidas[0].cantidad.valor, 2);
  assert.equal(resultado.partidas[1].cantidad.valor, 2);
});

// ── Compatibilidad con el sistema heredado ────────────────────────────────────

test('el legacy detectarModificacion de pedidoParser sigue funcionando', () => {
  const mod = parser.detectarModificacion('quítame uno de surtido');
  assert.ok(mod, 'el sistema heredado debe seguir funcionando');
  assert.equal(mod.tipo, 'quitar_uno');
  assert.equal(mod.corte, 'surtido');
});

test('pizzería devuelve null en detectarModificacionNeutral (no implementada)', () => {
  const contrato = getContratoGiro('pizzeria');
  const op = contrato.detectarModificacionNeutral('quítame uno');
  assert.equal(op, null, 'pizzería no tiene modificaciones neutrales todavía');
});
