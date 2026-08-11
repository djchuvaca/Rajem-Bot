// src/pagos/index.js
// Router de pasarelas de pago. El resto del bot importa SOLO desde aquí.
// Para agregar una nueva pasarela: crear src/pagos/nueva.js y añadirla al switch.

const { getPasarelaActiva } = require('../db/config');

function _getDriver() {
  switch (getPasarelaActiva()) {
    case 'mercadopago': return require('./mercadopago');
    default:            return null;
  }
}

/**
 * ¿Hay pasarela configurada y activa para este tenant?
 */
function estaConfigurado() {
  const driver = _getDriver();
  return driver ? driver.estaConfigurado() : false;
}

/**
 * Crea un enlace de pago y devuelve la URL.
 * @param {object} opciones - { pedidoId, total, negocio, jid, telefono, resumen, nombre }
 * @returns {Promise<string>} URL del enlace de pago
 */
async function crearEnlacePago(opciones) {
  const driver = _getDriver();
  if (!driver) throw new Error('Sin pasarela de pago configurada para este tenant');
  return driver.crearEnlacePago(opciones);
}

/**
 * Procesa una notificación de pago entrante (webhook).
 * @param {string} paymentId - ID del pago en la pasarela
 * @returns {Promise<object|null>} Resultado del pago o null si no aprobado
 */
async function procesarPago(paymentId) {
  const driver = _getDriver();
  if (!driver) return null;
  return driver.procesarPago(paymentId);
}

module.exports = { estaConfigurado, crearEnlacePago, procesarPago };
