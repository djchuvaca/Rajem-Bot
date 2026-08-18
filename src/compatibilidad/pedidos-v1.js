'use strict';
/**
 * src/compatibilidad/pedidos-v1.js
 * Adaptadores de compatibilidad para el formato de pedido v1 (legacy).
 *
 * El formato v1 usa items con campos `corte` y `presentacion`.
 * El formato neutral usa partidas con `productoSlug` y `formatoSlug`.
 *
 * Estos adaptadores deben conservarse mientras existan:
 *   - Sesiones activas serializadas en BD (TTL 48h).
 *   - Pedidos históricos que deban reinterpretarse.
 *
 * NO usar en el flujo operativo activo. Para nueva lógica, usar
 * src/pedido/modelo.js directamente o el contrato del Giro.
 */

const {
  pedidoALegacy,
  pedidoDesdeLegacy,
  partidaALegacy,
  partidaDesdeLegacy,
} = require('../pedido/modelo');

/**
 * Crea un ítem en formato v1 ({ presentacion, cantidad, corte }).
 * Centraliza la mención del campo `corte` para que los handlers no lo
 * referencien directamente — facilita la migración futura al formato neutral.
 */
function crearItemPedido(formatoSlug, cantidad, varianteSlug) {
  return { presentacion: formatoSlug, cantidad, corte: varianteSlug };
}

/**
 * Copia un ítem v1 sobreescribiendo su variante (corte).
 */
function copiarItemConVariante(item, varianteSlug) {
  return { ...item, corte: varianteSlug };
}

module.exports = {
  pedidoALegacy,
  pedidoDesdeLegacy,
  partidaALegacy,
  partidaDesdeLegacy,
  crearItemPedido,
  copiarItemConVariante,
};
