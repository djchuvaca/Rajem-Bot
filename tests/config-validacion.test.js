'use strict';

const { test } = require('node:test');
const assert = require('node:assert/strict');
const { validarConfiguracion } = require('../src/config/validacion');

const actuales = { timeout_recordatorio_min: '20', timeout_sesion_min: '35' };
const getActual = clave => actuales[clave];

test('valida los rangos de Configuración general', () => {
  assert.equal(validarConfiguracion('mandaditos_delay_min', '0', getActual).ok, true);
  assert.equal(validarConfiguracion('mandaditos_delay_min', '15', getActual).valor, '15');
  assert.equal(validarConfiguracion('mandaditos_delay_min', '-1', getActual).ok, false);
  assert.equal(validarConfiguracion('alerta_pedido_min', 'texto', getActual).ok, false);
  assert.equal(validarConfiguracion('tiempo_cancelacion', '121', getActual).ok, false);
});

test('la sesión inactiva siempre cierra después del recordatorio', () => {
  assert.equal(validarConfiguracion('timeout_recordatorio_min', '40', getActual).ok, false);
  assert.equal(validarConfiguracion('timeout_sesion_min', '20', getActual).ok, false);
  assert.equal(validarConfiguracion('timeout_sesion_min', '40', getActual).ok, true);
});

test('solo admite estrategias de precio mixto conocidas', () => {
  assert.equal(validarConfiguracion('estrategia_precio_mixto', 'promedio', getActual).ok, true);
  assert.equal(validarConfiguracion('estrategia_precio_mixto', 'inventada', getActual).ok, false);
});
