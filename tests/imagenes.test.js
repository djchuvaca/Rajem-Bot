const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');

const { initDB } = require('../src/db');
const { handleImagen } = require('../src/handlers/imagenes');
const { esperandoCaptura, pendientesConfirmacion, CARPETA_CAPTURAS, limpiarTodo } = require('../src/estado');

test.before(async () => { await initDB(); });

test.afterEach(() => {
  for (const jid of ['5213110000101@c.us', '5213110000102@c.us']) {
    esperandoCaptura.delete(jid);
    pendientesConfirmacion.delete(jid);
    limpiarTodo(jid);
  }
});

test('acepta una imagen aunque WhatsApp la reporte con un tipo distinto', async () => {
  const jid = '5213110000101@c.us';
  esperandoCaptura.set(jid, { resumen: 'Pedido de prueba\nTOTAL: $100', telefono: '3110000101' });
  const antes = new Set(fs.readdirSync(CARPETA_CAPTURAS));
  const respuestas = [];
  const msg = {
    from: jid, hasMedia: true, type: 'chat',
    downloadMedia: async () => ({ mimetype: 'image/jpeg; charset=binary', data: Buffer.from('comprobante').toString('base64') }),
    reply: async texto => respuestas.push(texto),
  };

  assert.equal(await handleImagen(msg, { sendMessage: async () => {} }), true);
  assert.equal(esperandoCaptura.has(jid), false);
  assert.equal(pendientesConfirmacion.has(jid), true);
  assert.match(respuestas.at(-1), /comprobante/i);

  const creados = fs.readdirSync(CARPETA_CAPTURAS).filter(nombre => !antes.has(nombre));
  assert.equal(creados.length, 1);
  for (const nombre of creados) fs.unlinkSync(require('node:path').join(CARPETA_CAPTURAS, nombre));
});

test('rechaza medios que no son imagen o PDF y conserva la espera', async () => {
  const jid = '5213110000102@c.us';
  esperandoCaptura.set(jid, { resumen: 'Pedido de prueba', telefono: '3110000102' });
  const respuestas = [];
  const msg = {
    from: jid, hasMedia: true, type: 'document',
    downloadMedia: async () => ({ mimetype: 'application/zip', data: Buffer.from('archivo').toString('base64') }),
    reply: async texto => respuestas.push(texto),
  };

  assert.equal(await handleImagen(msg, { sendMessage: async () => {} }), true);
  assert.equal(esperandoCaptura.has(jid), true);
  assert.match(respuestas[0], /imagen o PDF/i);
});
