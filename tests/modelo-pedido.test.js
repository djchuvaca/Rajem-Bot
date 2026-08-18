'use strict';

const { test, describe } = require('node:test');
const assert = require('node:assert/strict');
const {
  VERSION_MODELO_PEDIDO,
  pedidoDesdeLegacy,
  pedidoALegacy,
  validarPedido,
} = require('../src/pedido/modelo');

describe('modelo neutral de pedido', () => {
  test('normaliza piezas sin conceptos propios de taquería', () => {
    const pedido = pedidoDesdeLegacy({
      tipo: 'pedido',
      items: [{ presentacion: 'pizza_familiar', cantidad: 2, corte: 'hawaiana' }],
    });
    assert.equal(pedido.versionModelo, VERSION_MODELO_PEDIDO);
    assert.deepEqual(pedido.partidas[0], {
      tipo: 'producto',
      formatoSlug: 'pizza_familiar',
      productoSlug: 'hawaiana',
      cantidad: { tipo: 'unidad', valor: 2 },
      combinacion: [],
      extras: [],
      metadata: {},
    });
  });

  test('diferencia unidades, peso e importe', () => {
    const pedido = pedidoDesdeLegacy({ tipo: 'pedido', items: [
      { presentacion: 'taco', cantidad: 3, corte: 'surtido' },
      { presentacion: 'gramos', gramos: 500, corte: 'costilla' },
      { presentacion: 'pesos', monto: 200, corte: 'carne' },
    ] });
    assert.deepEqual(pedido.partidas.map(p => p.cantidad), [
      { tipo: 'unidad', valor: 3 },
      { tipo: 'peso', valor: 500 },
      { tipo: 'importe', valor: 200 },
    ]);
  });

  test('normaliza combinaciones y extras sin perderlos', () => {
    const pedido = pedidoDesdeLegacy({ tipo: 'pedido', items: [{
      presentacion: 'taco', cantidad: 2, corte: 'surtido especial',
      combinacion: 'costilla con cuero', extras: ['limones'],
    }] });
    assert.deepEqual(pedido.partidas[0].combinacion, ['costilla', 'cuero']);
    assert.deepEqual(pedido.partidas[0].extras, ['limones']);
    assert.deepEqual(pedidoALegacy(pedido), { tipo: 'pedido', items: [{
      presentacion: 'taco', cantidad: 2, corte: 'surtido especial',
      combinacion: 'costilla con cuero', extras: ['limones'],
    }] });
  });

  test('representa platos separados mediante una agrupación neutral', () => {
    const legacy = { tipo: 'pedido', items: [
      { presentacion: 'plato_separado', numero: 1, items: [{ presentacion: 'taco', cantidad: 1, corte: 'surtido' }] },
      { presentacion: 'plato_separado', numero: 2, items: [{ presentacion: 'taco', cantidad: 1, corte: 'surtido' }] },
    ] };
    const pedido = pedidoDesdeLegacy(legacy);
    assert.equal(pedido.partidas[0].tipo, 'agrupacion');
    assert.equal(pedido.partidas[0].modo, 'separada');
    assert.equal(pedido.partidas[0].numero, 1);
    assert.deepEqual(pedidoALegacy(pedido), legacy);
  });

  test('representa grupos repetidos y conserva sus componentes', () => {
    const legacy = { tipo: 'pedido', items: [{
      presentacion: 'grupo_repetido', grupos: 2,
      items_por_grupo: [
        { presentacion: 'taco', cantidad: 3, corte: 'surtido' },
        { presentacion: 'torta', cantidad: 1, corte: 'carne' },
      ],
    }] };
    const pedido = pedidoDesdeLegacy(legacy);
    assert.equal(pedido.partidas[0].modo, 'repetida');
    assert.equal(pedido.partidas[0].grupos, 2);
    assert.equal(pedido.partidas[0].partidas.length, 2);
    assert.deepEqual(pedidoALegacy(pedido), legacy);
  });

  test('rechaza cantidades inválidas', () => {
    assert.throws(() => pedidoDesdeLegacy({
      tipo: 'pedido', items: [{ presentacion: 'taco', cantidad: 0, corte: 'carne' }],
    }), /mayor que cero/);
  });

  test('valida recursivamente las agrupaciones', () => {
    const resultado = validarPedido({
      tipo: 'pedido', versionModelo: VERSION_MODELO_PEDIDO,
      partidas: [{ tipo: 'agrupacion', modo: 'separada', grupos: 1, partidas: [] }],
    });
    assert.equal(resultado.valido, false);
    assert.ok(resultado.errores.some(error => error.includes('no puede estar vacío')));
  });
});

