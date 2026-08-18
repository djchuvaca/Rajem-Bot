'use strict';

const { test } = require('node:test');
const assert = require('node:assert/strict');
const { getContratoGiro } = require('../src/giros');

test('Taquería formula sus preguntas con vocabulario propio', () => {
  const conversacion = getContratoGiro('taqueria').conversacion;
  assert.equal(conversacion.describirItem({ presentacion: 'taco', cantidad: 4 }), 'los 4 tacos');
  assert.equal(conversacion.preguntarVariante({ presentacion: 'taco', cantidad: 4 }), '¿De qué corte quieres los 4 tacos?');
  assert.equal(
    conversacion.preguntarPresentacion({ cantidad: 3, corte: 'surtido' }, 'tacos, tortas o quesadillas'),
    '¿Los 3 de surtido serían tacos, tortas o quesadillas?'
  );
});

test('Pizzería pregunta sabor y tamaño sin mencionar tacos ni cortes', () => {
  const conversacion = getContratoGiro('pizzeria').conversacion;
  const variante = conversacion.preguntarVariante({ presentacion: 'pizza_familiar', cantidad: 2 });
  const presentacion = conversacion.preguntarPresentacion({ cantidad: 2, corte: 'hawaiana' }, 'individual o familiar');
  assert.match(variante, /sabor de pizza/i);
  assert.match(presentacion, /tamaño/i);
  assert.doesNotMatch(`${variante} ${presentacion}`, /tacos?|cortes?/i);
});

test('Hamburguesería pregunta variante y presentación con su vocabulario', () => {
  const conversacion = getContratoGiro('hamburgueseria').conversacion;
  const variante = conversacion.preguntarVariante({ presentacion: 'hamburguesa_doble', cantidad: 1 });
  const presentacion = conversacion.preguntarPresentacion({ cantidad: 1, corte: 'bbq' }, 'sencilla o doble');
  assert.match(variante, /variante de hamburguesa/i);
  assert.match(presentacion, /presentación/i);
  assert.doesNotMatch(`${variante} ${presentacion}`, /tacos?|cortes?/i);
});

test('los recordatorios usan el nombre de variante configurado por Giro', () => {
  const pizza = getContratoGiro('pizzeria').conversacion.recordarVariante(
    { presentacion: 'pizza_individual', cantidad: 1 },
    'Hawaiana, Pepperoni'
  );
  assert.match(pizza, /esperando sabor/i);
  assert.doesNotMatch(pizza, /tipo de carne|corte/i);
});

