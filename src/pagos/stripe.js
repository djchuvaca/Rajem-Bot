'use strict';
// Driver de Stripe — Checkout Sessions.
// pasarela_config debe tener: { secret_key: "sk_live/test_...", webhook_secret: "whsec_..." }
// La secret_key la emite el dashboard de Stripe. El webhook_secret se obtiene al registrar
// el endpoint en Stripe Dashboard → Developers → Webhooks.
const { VIGENCIA_PAGO_MS, getAppUrl, registrarContextoPago, consumirContextoPago } = require('./contexto');

function _getConfig() {
  const { getPasarelaConfig } = require('../db/config');
  return getPasarelaConfig();
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
  return getPasarelaActiva() === 'stripe' && !!secret_key && !!getAppUrl();
}

async function crearEnlacePago({ pedidoId, total, negocio, jid, telefono, resumen, nombre }) {
  const stripe = _getClient();
  if (!stripe) throw new Error('Stripe no configurado');
  const appUrl = getAppUrl();

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
    expires_at:  Math.floor((Date.now() + VIGENCIA_PAGO_MS) / 1000),
  });

  registrarContextoPago(pedidoId, { jid, telefono, resumen, nombre });
  return session.url;
}

async function procesarPago(sessionId) {
  const stripe = _getClient();
  if (!stripe) return null;
  const session = await stripe.checkout.sessions.retrieve(sessionId);
  if (session.payment_status !== 'paid') return null;

  const pedidoId = String(session.metadata?.pedido_id || '');
  return consumirContextoPago(pedidoId);
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
