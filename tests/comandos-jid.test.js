'use strict';

const { test } = require('node:test');
const assert = require('node:assert/strict');
const { initDB } = require('../src/db');
const { setConfig } = require('../src/db/config');
const { handleComandos, _esAdministradorGrupo } = require('../src/handlers/comandos');

test.before(async () => { await initDB(); });

test('!jid responde el identificador del grupo aunque el solicitante no sea admin', async () => {
  const respuestas = [];
  const msg = {
    body: '!jid',
    from: '120363012345678901@g.us',
    author: '5213110000000@c.us',
    getChat: async () => { throw new Error('!jid no debe consultar permisos'); },
    reply: async texto => respuestas.push(texto),
  };

  const atendido = await handleComandos(msg, {});
  assert.equal(atendido, true);
  assert.equal(respuestas.length, 1);
  assert.match(respuestas[0], /120363012345678901@g\.us/);
});

test('!jid no responde fuera de un grupo', async () => {
  const respuestas = [];
  await handleComandos({
    body: '!jid',
    from: '5213110000000@c.us',
    reply: async texto => respuestas.push(texto),
  }, {});
  assert.deepEqual(respuestas, []);
});

test('reconoce un administrador con identificador nuevo $1', async () => {
  const msg = { author: { $1: '5213110000000@c.us' } };
  const chat = { participants: [{ id: { $1: '5213110000000@c.us' }, isAdmin: true }] };
  assert.equal(await _esAdministradorGrupo(msg, {}, chat), true);
});

test('reconoce identificadores Wid expuestos como user/server', async () => {
  const msg = { author: { user: '5213110000000', server: 'c.us' } };
  const chat = { participants: [{ id: { user: '5213110000000', server: 'c.us' }, isAdmin: true }] };
  assert.equal(await _esAdministradorGrupo(msg, {}, chat), true);
});

test('resuelve un autor @lid contra el teléfono del administrador', async () => {
  const msg = { author: '123456789@lid' };
  const chat = { participants: [{ id: { _serialized: '5213110000000@c.us' }, isSuperAdmin: true }] };
  const client = { getContactLidAndPhone: async () => [{ pn: '5213110000000@c.us' }] };
  assert.equal(await _esAdministradorGrupo(msg, client, chat), true);
});

test('reconoce como administrador al usuario propio en un mensaje saliente', async () => {
  const msg = { fromMe: true };
  const chat = { participants: [{ id: { $1: '5213110000000@c.us' }, isAdmin: true }] };
  const client = { info: { wid: { $1: '5213110000000@c.us' } } };
  assert.equal(await _esAdministradorGrupo(msg, client, chat), true);
});

test('rechaza comandos enviados desde un grupo distinto al administrativo', async () => {
  setConfig('grupo_id', '120363000000000001@g.us');
  const respuestas = [];
  const msg = {
    body: '!confirmar 3110000000',
    from: '120363012345678901@g.us',
    author: '5213119999999@c.us',
    reply: async texto => respuestas.push(texto),
  };
  assert.equal(await handleComandos(msg, {}), false);
  assert.match(respuestas[0], /grupo configurado/i);
});

test('procesa el grupo administrativo aunque msg.getChat falle con r', async () => {
  const grupo = '120363000000000001@g.us';
  setConfig('grupo_id', grupo);
  const respuestas = [];
  await handleComandos({
    body: '!confirmar 3110000000', from: grupo,
    getChat: async () => { throw new Error('r'); },
    reply: async texto => respuestas.push(texto),
  }, {});
  assert.match(respuestas[0], /No encontré ese pedido/i);
});
