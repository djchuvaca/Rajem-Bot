'use strict';

/**
 * Formateo de partidas y pedidos neutros para el giro Taquería.
 *
 * Produce texto legible por el cliente a partir del modelo neutral
 * (src/pedido/modelo.js) usando la definición del Giro para los nombres.
 *
 * Convive con jsonALineas() de src/handlers/flujos/orden.js — los handlers
 * seguirán usando la versión heredada hasta la Fase 8.
 */

/**
 * Formatea una partida neutral como línea de texto para el cliente.
 *
 * @param {object} partida — partida del modelo neutral (tipo 'producto' o 'agrupacion')
 * @param {number|null} precio — precio total calculado (null = sin mostrar)
 * @param {object} giro — definición del Giro (para nombres de formatos y variantes)
 * @returns {string}
 */
function formatearPartida(partida, precio, giro) {
  if (!partida) return '';
  if (partida.tipo === 'agrupacion') return _formatearAgrupacion(partida, precio, giro);
  if (partida.tipo !== 'producto')   return '';
  return _formatearProducto(partida, precio, giro);
}

function _nombreFormato(formatoSlug, cantidad, giro) {
  const it = (giro.itemTypes || []).find(x => x.slug === formatoSlug);
  if (!it) return formatoSlug;
  return cantidad === 1
    ? it.nombre
    : (it.nombre_plural || (it.nombre + 's'));
}

function _nombreVariante(productoSlug, giro) {
  const corte = (giro.cortes || []).find(c => c.slug === productoSlug);
  return (corte?.nombre || productoSlug || '').toLowerCase();
}

function _formatearProducto(partida, precio, giro) {
  const { formatoSlug, productoSlug = null, cantidad, combinacion = [] } = partida;
  let desc;

  if (cantidad.tipo === 'peso') {
    const nombreProd = productoSlug ? _nombreVariante(productoSlug, giro) : '';
    desc = `${cantidad.valor}g${nombreProd ? ` de ${nombreProd}` : ''}`;

  } else if (cantidad.tipo === 'importe') {
    const nombreProd = productoSlug ? _nombreVariante(productoSlug, giro) : '';
    desc = `$${cantidad.valor}${nombreProd ? ` de ${nombreProd}` : ''}`;

  } else {
    // unidad
    const nombreFmt = _nombreFormato(formatoSlug, cantidad.valor, giro);
    desc = `${cantidad.valor} ${nombreFmt}`;

    if (combinacion.length > 0) {
      const nombres = combinacion.map(s => _nombreVariante(s, giro));
      desc += ` de ${nombres.join(' con ')}`;
    } else if (productoSlug) {
      desc += ` de ${_nombreVariante(productoSlug, giro)}`;
    }
  }

  return precio != null ? `${desc} — $${precio}` : desc;
}

function _formatearAgrupacion(agrupacion, precio, giro) {
  const { modo, grupos, numero, partidas } = agrupacion;

  if (modo === 'separada') {
    const numPlato       = numero != null ? ` ${numero}` : '';
    const lineasInternas = (partidas || []).map(p => _formatearProducto(p, null, giro)).join(', ');
    const sufijo         = precio != null ? ` — $${precio}` : '';
    return `Plato${numPlato}: ${lineasInternas}${sufijo}`;
  }

  if (modo === 'repetida') {
    const lineasInternas = (partidas || []).map(p => _formatearProducto(p, null, giro)).join(', ');
    const sufijo         = precio != null ? ` — $${precio}` : '';
    return `${grupos}x [${lineasInternas}]${sufijo}`;
  }

  return '';
}

/**
 * Formatea un pedido completo como texto multi-línea.
 * Cada línea es una partida con su precio calculado.
 *
 * @param {object} pedido — pedido en modelo neutral
 * @param {function} resolver — resolver de precios (de crearResolver())
 * @param {object} giro — definición del Giro
 * @returns {string}
 */
function formatearPedido(pedido, resolver, giro) {
  if (!pedido || pedido.tipo !== 'pedido' || !Array.isArray(pedido.partidas)) return '';
  const { calcularPartida } = require('../precios');
  return pedido.partidas
    .map(p => {
      const precio = calcularPartida(p, resolver);
      return formatearPartida(p, precio, giro);
    })
    .filter(Boolean)
    .join('\n');
}

module.exports = { formatearPartida, formatearPedido };
