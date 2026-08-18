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

module.exports = {
  pedidoALegacy,
  pedidoDesdeLegacy,
  partidaALegacy,
  partidaDesdeLegacy,
};
