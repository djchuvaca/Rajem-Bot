'use strict';

const { test } = require('node:test');
const assert = require('node:assert/strict');
const { handleComandos } = require('../src/handlers/comandos');

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
