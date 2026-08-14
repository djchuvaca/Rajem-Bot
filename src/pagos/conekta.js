'use strict';
// Driver de Conekta — Orders con hosted checkout.
// pasarela_config debe tener: { private_key: "key_..." }
// Usa conekta v9 (OpenAPI-generated SDK): OrdersApi + Configuration.
// Soporta tarjeta, OXXO Pay y transferencia bancaria (SPEI).

let _apiCache = null;
let _keyCache = null;

function _getConfig() {
  const { getPasarelaConfig } = require('../db/config');
  return getPasarelaConfig();
}

function _getAppUrl() {
  try {
    const { getConfig } = require('../db/config');
    const tenantUrl = getConfig('public_url');
    if (tenantUrl) return tenantUrl.replace(/\/$/, '');
    const { getAppUrl } = require('../db/admin');
    return getAppUrl() || process.env.APP_URL || '';
  } catch (_) { return process.env.APP_URL || ''; }
}

function _getApi() {
  const { private_key } = _getConfig();
  if (!private_key) return null;
  if (_apiCache && _keyCache === private_key) return _apiCache;
  const { OrdersApi, Configuration } = require('conekta');
  const config = new Configuration({ accessToken: private_key });
  _apiCache = new OrdersApi(config);
  _keyCache = private_key;
  return _apiCache;
}

function estaConfigurado() {
  const { getPasarelaActiva } = require('../db/config');
  const { private_key } = _getConfig();
  return getPasarelaActiva() === 'conekta' && !!private_key && !!_getAppUrl();
}

async function crearEnlacePago({ pedidoId, total, negocio, jid, telefono, resumen, nombre }) {
  const api = _getApi();
  if (!api) throw new Error('Conekta no configurado');
  const appUrl = _getAppUrl();
  const { guardarPagoPendiente } = require('../db');

  const response = await api.createOrder({
    currency: 'MXN',
    customer_info: {
      name:  nombre || 'Cliente',
      phone: `+52${telefono}`,
      email: 'cliente@taqueria.com',
    },
    line_items: [{
      name:       `Pedido ${negocio || 'Taquería'}`,
      unit_price: Math.round(total * 100),
      quantity:   1,
    }],
    checkout: {
      type:                    'Integration',
      allowed_payment_methods: ['card', 'cash', 'bank_transfer'],
      wants_checkout_url:      true,
      redirect_url:            `${appUrl}/pago-exitoso`,
      expires_at:              Math.floor((Date.now() + 30 * 60 * 1000) / 1000),
    },
    metadata: { pedido_id: String(pedidoId) },
  }, 'es');

  const orden = response.data;
  const checkoutUrl = orden?.checkout?.url;
  if (!checkoutUrl) throw new Error('Conekta no retornó URL de checkout');

  const expiraEn = new Date(Date.now() + 30 * 60 * 1000).toISOString().replace('T', ' ').replace(/\.\d+Z$/, '');
  guardarPagoPendiente(String(pedidoId), { jid, telefono, resumen, nombre }, expiraEn);
  return checkoutUrl;
}

async function procesarPago(orderId) {
  const api = _getApi();
  if (!api) return null;
  const { obtenerPagoPendiente, eliminarPagoPendiente, limpiarPagosPendientesExpirados } = require('../db');

  const response = await api.getOrderById(orderId, 'es');
  const orden = response.data;
  if (orden?.payment_status !== 'paid') return null;

  limpiarPagosPendientesExpirados();
  const pedidoId = String(orden.metadata?.pedido_id || '');
  const pendiente = obtenerPagoPendiente(pedidoId);
  eliminarPagoPendiente(pedidoId);
  return { pedidoId, aprobado: true, sinContexto: !pendiente, ...(pendiente || {}) };
}

module.exports = { estaConfigurado, crearEnlacePago, procesarPago };
