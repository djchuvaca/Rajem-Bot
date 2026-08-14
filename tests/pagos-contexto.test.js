const test = require('node:test');
const assert = require('node:assert/strict');

process.env.BOT_TEST_MODE = '1';
process.env.TENANT_ID = 'test-pagos-contexto';

const { initDB } = require('../src/db');
const { fechaExpiracion, registrarContextoPago, consumirContextoPago } = require('../src/pagos/contexto');

test.before(async () => { await initDB(); });

test('las pasarelas comparten vigencia y persistencia de contexto', () => {
  const antes = Date.now() + 29 * 60 * 1000;
  const despues = Date.now() + 31 * 60 * 1000;
  const expira = fechaExpiracion().getTime();
  assert.ok(expira >= antes && expira <= despues);

  registrarContextoPago('pago-1', {
    jid: '5213110000000@c.us', telefono: '3110000000', resumen: 'Pedido', nombre: 'Cliente',
  });
  const resultado = consumirContextoPago('pago-1');
  assert.equal(resultado.aprobado, true);
  assert.equal(resultado.sinContexto, false);
  assert.equal(resultado.telefono, '3110000000');

  const segundo = consumirContextoPago('pago-1');
  assert.equal(segundo.sinContexto, true);
});
