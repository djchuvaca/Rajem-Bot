const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');

const { initDB } = require('../src/db');
const { handleImagen, descargarMediaConReintento, descargarMediaDirecto, reenviarComprobanteOriginal } = require('../src/handlers/imagenes');
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

test('reintenta la descarga recuperando el mensaje desde WhatsApp', async () => {
  const media = { mimetype: 'image/png', data: 'AA==' };
  const msg = { id: { _serialized: 'mensaje-1' }, downloadMedia: async () => { throw new Error('r'); } };
  const client = {
    getMessageById: async id => {
      assert.equal(id, 'mensaje-1');
      return { downloadMedia: async () => media };
    },
  };
  assert.equal(await descargarMediaConReintento(msg, client), media);
});

test('usa el identificador nuevo $1 para la descarga directa', async () => {
  const esperado = { mimetype: 'image/jpeg', data: 'AA==' };
  const msg = { id: { $1: 'mensaje-nuevo' } };
  const client = { pupPage: { evaluate: async (_fn, id) => {
    assert.equal(id, 'mensaje-nuevo');
    return esperado;
  } } };
  assert.equal(await descargarMediaDirecto(msg, client), esperado);
});

test('usa descarga directa si downloadMedia falla con el error r', async () => {
  const esperado = { mimetype: 'image/png', data: 'AA==' };
  const msg = { id: { $1: 'mensaje-nuevo' }, downloadMedia: async () => { throw new Error('r'); } };
  const client = { pupPage: { evaluate: async () => esperado } };
  assert.equal(await descargarMediaConReintento(msg, client), esperado);
});

test('reenvía el mensaje original cuando msg.forward está disponible', async () => {
  let destino = null;
  const msg = { forward: async jid => { destino = jid; } };
  assert.equal(await reenviarComprobanteOriginal(msg, {}, '120363000000000000@g.us'), true);
  assert.equal(destino, '120363000000000000@g.us');
});

test('usa reenvío directo compatible con el identificador nuevo $1', async () => {
  const llamadas = [];
  const msg = {
    id: { $1: 'mensaje-nuevo' },
    forward: async () => { throw new Error('r'); },
  };
  const client = { pupPage: { evaluate: async (_fn, destino, id) => llamadas.push({ destino, id }) } };
  assert.equal(await reenviarComprobanteOriginal(msg, client, '120363000000000000@g.us'), true);
  assert.deepEqual(llamadas, [{ destino: '120363000000000000@g.us', id: 'mensaje-nuevo' }]);
});
