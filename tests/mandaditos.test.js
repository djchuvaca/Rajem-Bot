'use strict';

const { describe, test, beforeEach, before } = require('node:test');
const assert = require('node:assert/strict');
const { initDB } = require('../src/db');
const { run, queryOne } = require('../src/db/core');
const { setConfig } = require('../src/db/config');
const {
  guardarDespachoProgramado, marcarDespachoEjecutado, getDespachosPendientes,
} = require('../src/db/modelos');
const {
  getRepartidor, getHistorialTenant, registrarEntregaTimeout, setEnRuta,
} = require('../src/db/repartidores');
const {
  enviarDespachoMandaditos, despacharConDelay,
  handleMensajeMandaditos, handleMensajeRepartidor, reanudarSeguimientoRepartidores, esRepartidorActivo,
} = require('../src/handlers/mandaditos');
const { reanudarDespachosPendientes } = require('../src/handlers/comandos');

const DATOS = Object.freeze({
  pedidoId: 7001, clienteNombre: 'Cliente Prueba', clienteTelefono: '3111234567',
  clienteCalle: 'Prueba 123', clienteColonia: 'Centro', clienteReferencia: 'Portón negro',
  totalOrden: '$250', tarifaDomicilio: 45,
});

function clienteWA({ falla = false } = {}) {
  const envios = [];
  return {
    envios,
    async sendMessage(jid, texto) {
      if (falla) throw new Error('WhatsApp simulado sin conexión');
      envios.push({ jid, texto });
      return { id: { _serialized: `mensaje-${envios.length}` } };
    },
    async getContactById() { return { pushname: 'Repartidor Prueba' }; },
  };
}

before(async () => { await initDB(); });
beforeEach(() => {
  run('DELETE FROM entregas_historial');
  run('DELETE FROM repartidores');
  run('DELETE FROM despachos_programados');
  setConfig('grupo_mandaditos_id', '120363099999999999@g.us');
  setConfig('negocio_calle', 'Negocio 10');
  setConfig('negocio_colonia', 'Centro');
  setConfig('mandaditos_silencio_min', '0');
  setConfig('mandaditos_recordatorio_min', '1');
  setConfig('mandaditos_timeout_post_min', '1');
});

describe('Mandaditos — programación persistente', { concurrency: false }, () => {
  test('SQLite guarda, consulta y marca un despacho como ejecutado', () => {
    const id = guardarDespachoProgramado({ ...DATOS, horaDespacho: new Date(Date.now() + 60000).toISOString() });
    assert.equal(getDespachosPendientes().length, 1);
    assert.equal(getDespachosPendientes()[0].pedido_id, DATOS.pedidoId);
    marcarDespachoEjecutado(id);
    assert.deepEqual(getDespachosPendientes(), []);
  });

  test('el delay crea un registro recuperable y no duplica el pedido', async () => {
    setConfig('mandaditos_delay_min', '15');
    const client = clienteWA();
    const primero = await despacharConDelay(client, DATOS);
    const segundo = await despacharConDelay(client, DATOS);
    assert.equal(primero.inmediato, false);
    assert.equal(segundo.despachoId, primero.despachoId);
    assert.equal(segundo.yaProgramado, true);
    assert.equal(getDespachosPendientes().length, 1);
    assert.equal(client.envios.length, 0);
  });

  test('delay cero envía inmediatamente sin dejar un despacho pendiente', async () => {
    setConfig('mandaditos_delay_min', '0');
    const client = clienteWA();
    const resultado = await despacharConDelay(client, DATOS);
    assert.equal(resultado.inmediato, true);
    assert.equal(client.envios[0].jid, '120363099999999999@g.us');
    assert.match(client.envios[0].texto, /Pedido #7001/);
    assert.deepEqual(getDespachosPendientes(), []);
  });

  test('identifica claramente una solicitud de orden programada', async () => {
    const client = clienteWA();
    await enviarDespachoMandaditos(client, { ...DATOS, pedidoId: 7002, esProgramada: true });
    assert.match(client.envios[0].texto, /ORDEN PROGRAMADA/);
  });

  test('un despacho vencido se recupera al arrancar y queda ejecutado', async () => {
    guardarDespachoProgramado({ ...DATOS, horaDespacho: new Date(Date.now() - 60000).toISOString() });
    const client = clienteWA();
    await reanudarDespachosPendientes(client);
    assert.equal(client.envios.length, 1);
    assert.deepEqual(getDespachosPendientes(), []);
  });

  test('si WhatsApp falla, el despacho permanece pendiente para reintento', async () => {
    guardarDespachoProgramado({ ...DATOS, horaDespacho: new Date(Date.now() - 60000).toISOString() });
    await reanudarDespachosPendientes(clienteWA({ falla: true }));
    assert.equal(getDespachosPendientes().length, 1);
  });
});

describe('Mandaditos — asignación y bases de repartidores', { concurrency: false }, () => {
  test('el primer repartidor toma el pedido, recibe detalles y confirma entrega', async () => {
    const client = clienteWA();
    await enviarDespachoMandaditos(client, DATOS);
    const respuestaGrupo = {
      from: '120363099999999999@g.us', fromMe: false, hasQuotedMsg: true,
      author: '5213117654321@c.us',
      getQuotedMessage: async () => ({ id: { _serialized: 'mensaje-1' } }),
      reply: async texto => client.envios.push({ jid: 'grupo-respuesta', texto }),
    };
    assert.equal(await handleMensajeMandaditos(respuestaGrupo, client), true);

    let repartidor = getRepartidor('5213117654321@c.us');
    assert.equal(repartidor.nombre, 'Repartidor Prueba');
    assert.equal(repartidor.en_ruta, 1);
    assert.equal(repartidor.pedido_actual_id, DATOS.pedidoId);
    assert.ok(client.envios.some(e => e.jid === '5213117654321@c.us' && /Punto de entrega/.test(e.texto)));

    const mensajePrivado = { from: '5213117654321@c.us', body: 'ya lo entregué' };
    assert.equal(await handleMensajeRepartidor(mensajePrivado, client), true);
    repartidor = getRepartidor('5213117654321@c.us');
    assert.equal(repartidor.en_ruta, 0);
    assert.equal(repartidor.entregas_confirmadas, 1);
    const historial = getHistorialTenant();
    assert.equal(historial.length, 1);
    assert.equal(historial[0].pedido_id, DATOS.pedidoId);
    assert.equal(historial[0].confirmado, 1);
  });

  test('resuelve el @lid del mismo número cliente/admin/repartidor antes del privado', async () => {
    const client = clienteWA();
    client.getContactLidAndPhone = async ids => {
      assert.deepEqual(ids, ['777777777@lid']);
      return [{ pn: { user: '5213117654321', server: 'c.us' } }];
    };
    await enviarDespachoMandaditos(client, { ...DATOS, pedidoId: 8201 });
    const respuestaGrupo = {
      from: '120363099999999999@g.us', fromMe: false, hasQuotedMsg: true,
      author: { user: '777777777', server: 'lid' },
      getQuotedMessage: async () => ({ id: { $1: 'mensaje-1' } }),
      reply: async texto => client.envios.push({ jid: 'grupo-respuesta', texto }),
    };
    assert.equal(await handleMensajeMandaditos(respuestaGrupo, client), true);
    assert.ok(client.envios.some(e => e.jid === '5213117654321@c.us' && /Punto de entrega/.test(e.texto)));
    assert.equal(getRepartidor('5213117654321@c.us').pedido_actual_id, 8201);
  });

  test('asocia la cita por número de pedido cuando WhatsApp cambia el messageId', async () => {
    const client = clienteWA();
    await enviarDespachoMandaditos(client, { ...DATOS, pedidoId: 8301 });
    const respuestaGrupo = {
      from: '120363099999999999@g.us', fromMe: false, hasQuotedMsg: true,
      author: '5213117654322@c.us',
      getQuotedMessage: async () => ({
        id: { _serialized: 'formato-distinto-del-mismo-mensaje' },
        body: '🛵 Pedido #8301 — Solicitud de reparto\n¿Quién está disponible?',
      }),
      reply: async texto => client.envios.push({ jid: 'grupo-respuesta', texto }),
    };

    assert.equal(await handleMensajeMandaditos(respuestaGrupo, client), true);
    assert.ok(client.envios.some(e => e.jid === '5213117654322@c.us' && /Punto de entrega/.test(e.texto)));
    assert.equal(getRepartidor('5213117654322@c.us').pedido_actual_id, 8301);
  });

  test('usa _data.quotedMsg cuando Puppeteer falla al reconstruir la cita', async () => {
    const client = clienteWA();
    await enviarDespachoMandaditos(client, { ...DATOS, pedidoId: 8302 });
    const respuestaGrupo = {
      from: '120363099999999999@g.us', fromMe: false, hasQuotedMsg: true,
      author: '5213117654323@c.us',
      _data: {
        quotedMsg: {
          id: { _serialized: 'id-alterno-en-contexto' },
          body: '🛵 Pedido #8302 — Solicitud de reparto\n¿Quién está disponible?',
        },
      },
      getQuotedMessage: async () => { throw new Error('r'); },
      reply: async texto => client.envios.push({ jid: 'grupo-respuesta', texto }),
    };

    assert.equal(await handleMensajeMandaditos(respuestaGrupo, client), true);
    assert.ok(client.envios.some(e => e.jid === '5213117654323@c.us' && /Punto de entrega/.test(e.texto)));
    assert.equal(getRepartidor('5213117654323@c.us').pedido_actual_id, 8302);
  });

  test('mantiene disponible el despacho cuando WhatsApp no devuelve messageId', async () => {
    const envios = [];
    const client = {
      envios,
      async sendMessage(jid, texto) {
        envios.push({ jid, texto });
        return {}; // caso real observado: envío exitoso sin id utilizable
      },
      async getContactById() { return { pushname: 'Repartidor sin ID' }; },
    };
    await enviarDespachoMandaditos(client, { ...DATOS, pedidoId: 8303 });
    const respuestaGrupo = {
      from: '120363099999999999@g.us', fromMe: false, hasQuotedMsg: true,
      author: '5213117654324@c.us',
      _data: { quotedMsg: { body: '🛵 Pedido #8303 — Solicitud de reparto' } },
      getQuotedMessage: async () => { throw new Error('r'); },
      reply: async texto => envios.push({ jid: 'grupo-respuesta', texto }),
    };

    assert.equal(await handleMensajeMandaditos(respuestaGrupo, client), true);
    assert.ok(envios.some(e => e.jid === '5213117654324@c.us' && /Punto de entrega/.test(e.texto)));
    assert.equal(getRepartidor('5213117654324@c.us').pedido_actual_id, 8303);
  });

  test('un timeout libera al repartidor y queda registrado en historial', () => {
    run("INSERT INTO repartidores(jid,nombre) VALUES('5213110000001@c.us','Rep Timeout')");
    setEnRuta('5213110000001@c.us', 8002, new Date().toISOString());
    registrarEntregaTimeout('5213110000001@c.us', 8002, 'San Juan');
    const rep = getRepartidor('5213110000001@c.us');
    assert.equal(rep.en_ruta, 0);
    assert.equal(rep.entregas_total, 1);
    const fila = queryOne('SELECT * FROM entregas_historial WHERE pedido_id=8002');
    assert.equal(fila.confirmado, 0);
    assert.equal(fila.colonia, 'San Juan');
  });

  test('un repartidor pausado no puede tomar pedidos', async () => {
    run("INSERT INTO repartidores(jid,nombre,activo) VALUES('5213110000002@c.us','Rep Pausado',0)");
    const client = clienteWA();
    await enviarDespachoMandaditos(client, { ...DATOS, pedidoId: 8101 });
    const respuestas = [];
    const msg = {
      from: '120363099999999999@g.us', fromMe: false, hasQuotedMsg: true,
      author: '5213110000002@c.us', getQuotedMessage: async () => ({ id: { _serialized: 'mensaje-1' } }),
      reply: async texto => respuestas.push(texto),
    };
    assert.equal(await handleMensajeMandaditos(msg, client), true);
    assert.match(respuestas[0], /pausado/i);
    assert.equal(getRepartidor(msg.author).en_ruta, 0);
  });

  test('un repartidor en ruta no puede sobrescribir su pedido actual', async () => {
    run("INSERT INTO repartidores(jid,nombre,activo) VALUES('5213110000003@c.us','Rep Ocupado',1)");
    setEnRuta('5213110000003@c.us', 8102, new Date().toISOString());
    const client = clienteWA();
    await enviarDespachoMandaditos(client, { ...DATOS, pedidoId: 8103 });
    const respuestas = [];
    await handleMensajeMandaditos({
      from: '120363099999999999@g.us', fromMe: false, hasQuotedMsg: true,
      author: '5213110000003@c.us', getQuotedMessage: async () => ({ id: { _serialized: 'mensaje-1' } }),
      reply: async texto => respuestas.push(texto),
    }, client);
    assert.match(respuestas[0], /ya tienes asignado/i);
    assert.equal(getRepartidor('5213110000003@c.us').pedido_actual_id, 8102);
  });

  test('si falla el mensaje privado la solicitud sigue disponible', async () => {
    const publicador = clienteWA();
    await enviarDespachoMandaditos(publicador, { ...DATOS, pedidoId: 8104 });
    const baseMsg = {
      from: '120363099999999999@g.us', fromMe: false, hasQuotedMsg: true,
      getQuotedMessage: async () => ({ id: { _serialized: 'mensaje-1' } }),
    };
    const fallido = clienteWA({ falla: true });
    const avisos = [];
    await handleMensajeMandaditos({ ...baseMsg, author: '5213110000004@c.us', reply: async t => avisos.push(t) }, fallido);
    assert.equal(getRepartidor('5213110000004@c.us'), undefined);
    assert.match(avisos[0], /sigue disponible/i);

    const segundo = clienteWA();
    await handleMensajeMandaditos({ ...baseMsg, author: '5213110000005@c.us', reply: async () => {} }, segundo);
    assert.equal(getRepartidor('5213110000005@c.us').pedido_actual_id, 8104);
  });

  test('restaura el seguimiento de repartidores en ruta después de reiniciar', async () => {
    run("INSERT INTO repartidores(jid,nombre,activo) VALUES('5213110000006@c.us','Rep Reinicio',1)");
    setEnRuta('5213110000006@c.us', 8105, new Date().toISOString());
    const client = clienteWA();
    assert.equal(reanudarSeguimientoRepartidores(client), 1);
    assert.equal(esRepartidorActivo('5213110000006@c.us'), true);
    await handleMensajeRepartidor({ from: '5213110000006@c.us', body: 'entregado' }, client);
    assert.equal(getRepartidor('5213110000006@c.us').en_ruta, 0);
    assert.equal(queryOne('SELECT confirmado FROM entregas_historial WHERE pedido_id=8105').confirmado, 1);
  });
});
