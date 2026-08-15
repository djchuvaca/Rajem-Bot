'use strict';

const { test } = require('node:test');
const assert = require('node:assert/strict');
const { handleComandos, _esAdministradorGrupo } = require('../src/handlers/comandos');

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

test('un comando de no administrador recibe una explicación', async () => {
  const respuestas = [];
  const msg = {
    body: '!confirmar 3110000000',
    from: '120363012345678901@g.us',
    author: '5213119999999@c.us',
    getChat: async () => ({ participants: [{ id: { _serialized: '5213119999999@c.us' }, isAdmin: false }] }),
    reply: async texto => respuestas.push(texto),
  };
  assert.equal(await handleComandos(msg, {}), false);
  assert.match(respuestas[0], /administrador/i);
});
