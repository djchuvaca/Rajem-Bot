// src/pagos/mercadopago.js
// Wrapper del SDK de MercadoPago v3.
// Solo se activa si MERCADOPAGO_ACCESS_TOKEN y APP_URL están definidos en .env.

const { MercadoPagoConfig, Preference, Payment } = require("mercadopago");

let _mpCliente = null;

// pedidoId (string) → { jid, telefono, resumen, nombre }
// Se pierde si el servidor reinicia durante el periodo de pago (30 min).
// En ese caso el pago queda registrado en MP pero no se auto-notifica por WA.
const _pendientes = new Map();

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

  _pendientes.set(String(pedidoId), { jid, telefono, resumen, nombre });
  return resultado.init_point;
}

async function procesarPago(paymentId) {
  const cliente = getCliente();
  if (!cliente) return null;

  const payment = new Payment(cliente);
  const pago = await payment.get({ id: paymentId });

  if (pago.status !== "approved") return null;

  const pedidoId = String(pago.external_reference);
  const pendiente = _pendientes.get(pedidoId);
  _pendientes.delete(pedidoId);

  return { pedidoId, aprobado: true, sinContexto: !pendiente, ...(pendiente || {}) };
}

module.exports = { estaConfigurado, crearEnlacePago, procesarPago };
