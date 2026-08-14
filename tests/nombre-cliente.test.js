const test = require('node:test');
const assert = require('node:assert/strict');
const { dividirNombreCompleto } = require('../src/clientes/nombre');

test('divide nombres con la regla histórica del sistema', () => {
  assert.deepEqual(dividirNombreCompleto('Juan'), { nombre: 'Juan', apellido: null });
  assert.deepEqual(dividirNombreCompleto('Juan Pérez'), { nombre: 'Juan', apellido: 'Pérez' });
  assert.deepEqual(dividirNombreCompleto('Juan Carlos Pérez López'), { nombre: 'Juan Carlos', apellido: 'Pérez López' });
});

test('normaliza espacios y usa fallback seguro', () => {
  assert.deepEqual(dividirNombreCompleto('  Ana   María  López  '), { nombre: 'Ana María', apellido: 'López' });
  assert.deepEqual(dividirNombreCompleto(null), { nombre: 'Cliente', apellido: null });
});
