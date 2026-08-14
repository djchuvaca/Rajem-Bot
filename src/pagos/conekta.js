'use strict';
// Driver de Conekta — Orders con hosted checkout.
// pasarela_config debe tener: { private_key: "key_..." }
// Usa conekta v9 (OpenAPI-generated SDK): OrdersApi + Configuration.
// Soporta tarjeta, OXXO Pay y transferencia bancaria (SPEI).
const { VIGENCIA_PAGO_MS, getAppUrl, registrarContextoPago, consumirContextoPago } = require('./contexto');

let _apiCache = null;
let _keyCache = null;

function _getConfig() {
  const { getPasarelaConfig } = require('../db/config');
  return getPasarelaConfig();
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
  return getPasarelaActiva() === 'conekta' && !!private_key && !!getAppUrl();
}

async function crearEnlacePago({ pedidoId, total, negocio, jid, telefono, resumen, nombre }) {
  const api = _getApi();
  if (!api) throw new Error('Conekta no configurado');
  const appUrl = getAppUrl();

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
      expires_at:              Math.floor((Date.now() + VIGENCIA_PAGO_MS) / 1000),
    },
    metadata: { pedido_id: String(pedidoId) },
  }, 'es');

  const orden = response.data;
  const checkoutUrl = orden?.checkout?.url;
  if (!checkoutUrl) throw new Error('Conekta no retornó URL de checkout');

  registrarContextoPago(pedidoId, { jid, telefono, resumen, nombre });
  return checkoutUrl;
}

async function procesarPago(orderId) {
  const api = _getApi();
  if (!api) return null;
  const response = await api.getOrderById(orderId, 'es');
  const orden = response.data;
  if (orden?.payment_status !== 'paid') return null;

  const pedidoId = String(orden.metadata?.pedido_id || '');
  return consumirContextoPago(pedidoId);
}

module.exports = { estaConfigurado, crearEnlacePago, procesarPago };
