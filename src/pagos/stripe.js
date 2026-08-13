'use strict';
// Driver de Stripe — Checkout Sessions.
// pasarela_config debe tener: { secret_key: "sk_live/test_...", webhook_secret: "whsec_..." }
// La secret_key la emite el dashboard de Stripe. El webhook_secret se obtiene al registrar
// el endpoint en Stripe Dashboard → Developers → Webhooks.

function _getConfig() {
  const { getPasarelaConfig } = require('../db/config');
  return getPasarelaConfig();
}

function _getAppUrl() {
  try {
    const { getAppUrl } = require('../db/admin');
    return getAppUrl() || process.env.APP_URL || '';
  } catch (_) { return process.env.APP_URL || ''; }
}

// Caché del cliente Stripe para evitar re-instanciar por cada llamada.
// Se invalida automáticamente si la secret_key cambia (superadmin la actualiza).
let _stripeClient = null;
let _stripeKeyCache = null;

function _getClient() {
  const { secret_key } = _getConfig();
  if (_stripeKeyCache !== secret_key) { _stripeClient = null; _stripeKeyCache = secret_key; }
  if (_stripeClient) return _stripeClient;
  if (!secret_key) return null;
  _stripeClient = require('stripe')(secret_key);
  return _stripeClient;
}

function estaConfigurado() {
  const { getPasarelaActiva } = require('../db/config');
  const { secret_key } = _getConfig();
  return getPasarelaActiva() === 'stripe' && !!secret_key && !!_getAppUrl();
}

async function crearEnlacePago({ pedidoId, total, negocio, jid, telefono, resumen, nombre }) {
  const stripe = _getClient();
  if (!stripe) throw new Error('Stripe no configurado');
  const appUrl = _getAppUrl();
  const { guardarPagoPendiente } = require('../db');

  const session = await stripe.checkout.sessions.create({
    mode:       'payment',
    line_items: [{
      price_data: {
        currency:     'mxn',
        unit_amount:  Math.round(total * 100), // Stripe usa centavos
        product_data: { name: `Pedido ${negocio || 'Taquería'}` },
      },
      quantity: 1,
    }],
    metadata:    { pedido_id: String(pedidoId) },
    success_url: `${appUrl}/pago-exitoso?session_id={CHECKOUT_SESSION_ID}`,
    cancel_url:  `${appUrl}/pago-cancelado`,
    expires_at:  Math.floor((Date.now() + 30 * 60 * 1000) / 1000), // Unix timestamp 30 min
  });

  const expiraEn = new Date(Date.now() + 30 * 60 * 1000).toISOString().replace('T', ' ').replace(/\.\d+Z$/, '');
  guardarPagoPendiente(String(pedidoId), { jid, telefono, resumen, nombre }, expiraEn);
  return session.url;
}

async function procesarPago(sessionId) {
  const stripe = _getClient();
  if (!stripe) return null;
  const { obtenerPagoPendiente, eliminarPagoPendiente, limpiarPagosPendientesExpirados } = require('../db');

  const session = await stripe.checkout.sessions.retrieve(sessionId);
  if (session.payment_status !== 'paid') return null;

  limpiarPagosPendientesExpirados();
  const pedidoId = String(session.metadata?.pedido_id || '');
  const pendiente = obtenerPagoPendiente(pedidoId);
  eliminarPagoPendiente(pedidoId);
  return { pedidoId, aprobado: true, sinContexto: !pendiente, ...(pendiente || {}) };
}

// Verifica la firma del webhook de Stripe y retorna el Event o null si es inválida.
// Requiere que Express haya capturado el rawBody antes de parsear JSON.
function verificarWebhookEvento(rawBody, firma) {
  const stripe = _getClient();
  if (!stripe) return null;
  const { webhook_secret } = _getConfig();
  if (!webhook_secret) {
    console.warn('[Stripe] webhook_secret no configurado — verificación omitida');
    return null;
  }
  try {
    return stripe.webhooks.constructEvent(rawBody, firma, webhook_secret);
  } catch (e) {
    console.warn('[Stripe] Firma de webhook inválida:', e.message);
    return null;
  }
}

module.exports = { estaConfigurado, crearEnlacePago, procesarPago, verificarWebhookEvento };
