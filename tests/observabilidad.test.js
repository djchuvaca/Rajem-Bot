const test = require('node:test');
const assert = require('node:assert/strict');

process.env.BOT_TEST_MODE = '1';
process.env.TENANT_ID = 'test-observabilidad';

const db = require('../src/db');
const obs = require('../src/db/observabilidad');

test.before(async () => {
  await db.initDB();
});

test('registra conversación, entrada, salida y ruta NLU en orden', () => {
  const jid = '5213110000001@c.us';
  const traceId = obs.registrarEntrada(jid, 'Quiero dos tacos de carne');
  obs.registrarSalida(jid, '¿Deseas agregar algo más?');
  obs.registrarRuta(jid, 'pedido_simple');

  const detalle = obs.obtenerConversacion(traceId);
  assert.equal(detalle.jid, jid);
  assert.deepEqual(detalle.eventos.map(e => e.direccion), ['cliente', 'bot', 'sistema']);
  assert.equal(detalle.eventos[2].contenido, 'pedido_simple');
});

test('consolida alertas repetidas y permite resolverlas', () => {
  const jid = '5213110000002@c.us';
  const id = obs.crearAlerta(jid, 'nlu_no_entendido', 'No entendido', 'primer intento');
  const repetida = obs.crearAlerta(jid, 'nlu_no_entendido', 'No entendido', 'segundo intento');
  assert.equal(repetida, id);

  const abierta = obs.listarAlertas().find(a => a.id === id);
  assert.equal(abierta.ocurrencias, 2);
  assert.equal(abierta.detalle, 'segundo intento');
  assert.equal(obs.resolverAlerta(id, 'admin', 'contactado'), true);
  assert.equal(obs.resolverAlerta(id, 'admin'), false);
  assert.ok(obs.listarAlertas({ estado: 'resuelta' }).some(a => a.id === id));
});

test('vincula la traza terminada al pedido y conserva sus eventos', () => {
  const jid = '5213110000003@c.us';
  const traceId = obs.registrarEntrada(jid, 'Pedido de prueba');
  const pedidoId = db.registrarPedido({ cliente_id: null, tipo: 'mostrador', orden: 'Pedido de prueba', total: 10, metodo_pago: 'efectivo' });
  obs.vincularPedido(jid, pedidoId);
  const detalle = obs.obtenerConversacion(traceId);
  assert.equal(detalle.pedido_id, pedidoId);
  assert.equal(detalle.estado, 'completada');
  assert.equal(detalle.etapa_actual, 'pedido_registrado');
  assert.ok(detalle.eventos.some(e => e.tipo === 'pedido'));
});

test('limita contenido y metadatos inválidos sin romper la trazabilidad', () => {
  const circular = {}; circular.self = circular;
  const traceId = obs.registrarEntrada('5213110000004@c.us', 'x'.repeat(3000), circular);
  const detalle = obs.obtenerConversacion(traceId);
  assert.equal(detalle.eventos[0].contenido.length, 1500);
  assert.equal(detalle.eventos[0].metadata_json, '{}');
});
