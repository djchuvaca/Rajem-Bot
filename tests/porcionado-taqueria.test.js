'use strict';

const { test, before, beforeEach, afterEach } = require('node:test');
const assert = require('node:assert/strict');
const { initDB } = require('../src/db/core');
const { seedDB } = require('../src/db/seed');
const parser = require('../src/handlers/pedidoParser');
const { handleSinCorte, handleEsperandoCorte } = require('../src/handlers/flujos/orden');
const { esperandoCorte, esperandoConfirmacionItem, pedidoJSONActual } = require('../src/estado');

const JID = '5213117777000@c.us';

before(async () => {
  await initDB();
  await seedDB();
  parser.invalidarCacheCortes();
});

function limpiar() {
  esperandoCorte.delete(JID);
  esperandoConfirmacionItem.delete(JID);
  pedidoJSONActual.delete(JID);
}

beforeEach(limpiar);
afterEach(limpiar);

test('Taquería interpreta 4 tacos de surtido de uno en uno', () => {
  const pedido = parser.parsearPedidoSimple('dame 4 tacos de surtido de uno en uno');
  assert.equal(pedido.tipo, 'pedido');
  assert.equal(pedido.items.length, 4);
  pedido.items.forEach((plato, indice) => {
    assert.equal(plato.presentacion, 'plato_separado');
    assert.equal(plato.numero, indice + 1);
    assert.deepEqual(plato.items, [{ presentacion: 'taco', cantidad: 1, corte: 'surtido' }]);
  });
});

test('Taquería interpreta grupos iguales mayores a uno', () => {
  const pedido = parser.parsearPedidoSimple('dame 6 tacos de surtido de 2 en 2');
  assert.equal(pedido.tipo, 'pedido');
  assert.equal(pedido.items.length, 3);
  assert.deepEqual(pedido.items.map(p => p.items[0].cantidad), [2, 2, 2]);
});

test('Taquería explica una división que no produce grupos exactos', () => {
  const resultado = parser.parsearPedidoSimple('dame 5 tacos de surtido de 2 en 2');
  assert.equal(resultado.tipo, 'error_porcionado');
  assert.match(resultado.mensaje, /no se divide en grupos exactos de 2/i);
});

test('conserva el plan de uno en uno mientras pregunta el corte', async () => {
  const primeraRespuesta = [];
  assert.equal(await handleSinCorte(
    { reply: async texto => primeraRespuesta.push(texto) },
    'dame 4 tacos de uno en uno',
    JID
  ), true);
  assert.match(primeraRespuesta[0], /corte/i);
  assert.equal(esperandoCorte.get(JID).items[0]._porcionado.porGrupo, 1);

  const segundaRespuesta = [];
  assert.equal(await handleEsperandoCorte(
    { reply: async texto => segundaRespuesta.push(texto) },
    'surtido',
    JID,
    [],
    false
  ), true);
  assert.match(segundaRespuesta[0], /Plato 1/i);
  assert.match(segundaRespuesta[0], /Plato 4/i);
  assert.match(segundaRespuesta[0], /Subtotal: \$120/i);
  assert.equal(esperandoCorte.has(JID), false);
});
