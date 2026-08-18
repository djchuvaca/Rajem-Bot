'use strict';

/**
 * Motor neutral de precios sobre el modelo neutral de pedido.
 *
 * No conoce tacos, cortes ni sabores. Opera únicamente con los tipos
 * definidos en src/pedido/modelo.js: partida de producto o agrupación.
 *
 * Convive con src/pedido/precios.js (sistema heredado). Los handlers
 * seguirán usando la ruta heredada hasta la Fase 8.
 *
 * El `resolver` es una función giro-específica:
 *   resolver(formatoSlug, productoSlug, combinacion?) → precio unitario (number)
 * Para partidas de tipo 'peso', devuelve el precio por 100 gramos.
 * Para partidas de tipo 'importe', el precio es la cantidad misma.
 */

/**
 * Calcula el precio total de una partida usando el resolver del Giro activo.
 * Inmutable: nunca modifica la partida ni el pedido.
 *
 * @param {object} partida  — partida del modelo neutral
 * @param {function} resolver — (formatoSlug, productoSlug, combinacion?) → precio unitario
 * @returns {number}
 */
function calcularPartida(partida, resolver) {
  if (!partida || typeof resolver !== 'function') return 0;

  if (partida.tipo === 'agrupacion') {
    if (!Array.isArray(partida.partidas)) return 0;
    const sumaInterna = partida.partidas.reduce((s, p) => s + calcularPartida(p, resolver), 0);
    return sumaInterna * (partida.grupos || 1);
  }

  if (partida.tipo !== 'producto') return 0;

  const { formatoSlug, productoSlug = null, cantidad, combinacion = [] } = partida;
  if (!cantidad) return 0;

  switch (cantidad.tipo) {
    case 'importe':
      // El monto ya es el precio — el cliente dice "dame $200 de surtido"
      return cantidad.valor || 0;

    case 'peso': {
      // precio_100g × (gramos / 100)
      const precio100g = resolver(formatoSlug, productoSlug, combinacion);
      return Math.round(((cantidad.valor || 0) / 100) * precio100g);
    }

    case 'unidad': {
      const precioUnit = resolver(formatoSlug, productoSlug, combinacion);
      return (cantidad.valor || 0) * precioUnit;
    }

    default:
      return 0;
  }
}

/**
 * Calcula el precio total de un pedido neutro sumando todas sus partidas.
 *
 * @param {object} pedido — pedido del modelo neutral
 * @param {function} resolver
 * @returns {number}
 */
function calcularPedido(pedido, resolver) {
  if (!pedido || pedido.tipo !== 'pedido' || !Array.isArray(pedido.partidas)) return 0;
  return pedido.partidas.reduce((s, p) => s + calcularPartida(p, resolver), 0);
}

module.exports = { calcularPartida, calcularPedido };
