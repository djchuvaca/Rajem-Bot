// src/pagos/mercadopago.js
// Wrapper del SDK de MercadoPago v3.
// El token se lee desde la config del tenant (pasarela_config) y APP_URL desde admin.db.

const { MercadoPagoConfig, Preference, Payment } = require("mercadopago");
const {
  guardarPagoPendiente, obtenerPagoPendiente, eliminarPagoPendiente, limpiarPagosPendientesExpirados,
} = require("../db");

function _getToken() {
  try {
    const { getPasarelaConfig } = require('../db/config');
    const cfg = getPasarelaConfig();
    if (cfg.access_token) return cfg.access_token;
  } catch (_) {}
  return process.env.MERCADOPAGO_ACCESS_TOKEN || null;
}

function _getAppUrl() {
  try {
    const { getAppUrl } = require('../db/admin');
    return getAppUrl() || process.env.APP_URL || '';
  } catch (_) {
    return process.env.APP_URL || '';
  }
}

function getCliente() {
  const token = _getToken();
  if (!token) return null;
  return new MercadoPagoConfig({ accessToken: token });
}

function estaConfigurado() {
  const { getPasarelaActiva } = require('../db/config');
  return getPasarelaActiva() === 'mercadopago' && !!_getToken() && !!_getAppUrl();
}

async function crearEnlacePago({ pedidoId, total, negocio, jid, telefono, resumen, nombre }) {
  const cliente = getCliente();
  if (!cliente) throw new Error("MercadoPago no configurado");

  const preference = new Preference(cliente);
  const resultado = await preference.create({
    body: {
      items: [{
        title:      `Pedido ${negocio || "Tacos Javier"}`,
        quantity:   1,
        unit_price: Math.round(total * 100) / 100,
        currency_id: "MXN",
      }],
      notification_url:  `${_getAppUrl()}/webhook/mercadopago`,
      external_reference: String(pedidoId),
      expires:            true,
      expiration_date_to: new Date(Date.now() + 30 * 60 * 1000).toISOString(),
    },
  });

  // expiraEn en UTC ISO sin milisegundos — compatible con datetime('now') de SQLite
  const expiraEn = new Date(Date.now() + 30 * 60 * 1000).toISOString().replace('T', ' ').replace(/\.\d+Z$/, '');
  guardarPagoPendiente(String(pedidoId), { jid, telefono, resumen, nombre }, expiraEn);
  return resultado.init_point;
}

async function procesarPago(paymentId) {
  const cliente = getCliente();
  if (!cliente) return null;

  const payment = new Payment(cliente);
  const pago = await payment.get({ id: paymentId });

  if (pago.status !== "approved") return null;

  limpiarPagosPendientesExpirados();
  const pedidoId = String(pago.external_reference);
  const pendiente = obtenerPagoPendiente(pedidoId);
  eliminarPagoPendiente(pedidoId);

  return { pedidoId, aprobado: true, sinContexto: !pendiente, ...(pendiente || {}) };
}

module.exports = { estaConfigurado, crearEnlacePago, procesarPago };
