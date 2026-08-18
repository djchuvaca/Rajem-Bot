'use strict';
process.env.TENANT_ID = '_test';

const { test, before } = require('node:test');
const assert = require('node:assert/strict');

const db = require('../src/db');
const { initDB, run, queryOne } = require('../src/db/core');
const { seedDB } = require('../src/db/seed');

before(async () => {
  await initDB();
  await seedDB();
});

test('el panel solo actualiza los datos permitidos de un cliente existente', () => {
  run("DELETE FROM clientes WHERE telefono=?", ['3111111111']);
  run(
    `INSERT INTO clientes (nombre, apellido, telefono, calle_numero, colonia, referencia)
     VALUES (?, ?, ?, ?, ?, ?)`,
    ['Nombre anterior', 'Apellido anterior', '3111111111', 'Calle anterior 1', 'Centro', 'Portón negro']
  );
  const original = queryOne('SELECT * FROM clientes WHERE telefono=?', ['3111111111']);

  const actualizado = db.updateClientePanel(original.id, {
    nombre: 'Nombre nuevo',
    apellido: 'Apellido nuevo',
    telefono: '3112222222',
    calle_numero: 'Calle nueva 25',
    colonia: 'San Juan',
    referencia: 'Casa blanca',
  });

  assert.equal(actualizado.id, original.id);
  assert.equal(actualizado.nombre, 'Nombre nuevo');
  assert.equal(actualizado.apellido, 'Apellido nuevo');
  assert.equal(actualizado.telefono, '3112222222');
  assert.equal(actualizado.calle_numero, 'Calle nueva 25');
  assert.equal(actualizado.colonia, 'San Juan');
  assert.equal(actualizado.referencia, 'Casa blanca');
});

test('la capa pública de datos no expone borrado de ventas ni clientes', () => {
  assert.equal(db.deletePedido, undefined);
  assert.equal(db.deleteCliente, undefined);
});

