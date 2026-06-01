// src/pagos/mercadopago.js
// Wrapper del SDK de MercadoPago v3.
// Solo se activa si MERCADOPAGO_ACCESS_TOKEN y APP_URL están definidos en .env.

const { MercadoPagoConfig, Preference, Payment } = require("mercadopago");
const {
  guardarPagoPendiente, obtenerPagoPendiente, eliminarPagoPendiente, limpiarPagosPendientesExpirados,
} = require("../db");

let _mpCliente = null;

function getCliente() {
  if (!_mpCliente && process.env.MERCADOPAGO_ACCESS_TOKEN) {
    _mpCliente = new MercadoPagoConfig({
      accessToken: process.env.MERCADOPAGO_ACCESS_TOKEN,
    });
  }
  return _mpCliente;
}

function estaConfigurado() {
  return !!(process.env.MERCADOPAGO_ACCESS_TOKEN && process.env.APP_URL);
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
      notification_url:  `${process.env.APP_URL}/webhook/mercadopago`,
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
