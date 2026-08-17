'use strict';

const {
  guardarPagoPendiente, obtenerPagoPendiente, eliminarPagoPendiente, limpiarPagosPendientesExpirados,
} = require('../db');

const VIGENCIA_PAGO_MS = 30 * 60 * 1000;

function getAppUrl() {
  try {
    const { getConfig } = require('../db/config');
    const tenantUrl = getConfig('public_url');
    if (tenantUrl) return tenantUrl.replace(/\/$/, '');
    // process.env.APP_URL tiene prioridad sobre el global de admin.db porque
    // provisionar-tenant.sh lo inyecta con la URL específica del tenant
    if (process.env.APP_URL) return process.env.APP_URL.replace(/\/$/, '');
    const { getAppUrl: getAdminAppUrl } = require('../db/admin');
    return getAdminAppUrl() || '';
  } catch (_) { return process.env.APP_URL || ''; }
}

function fechaExpiracion() {
  return new Date(Date.now() + VIGENCIA_PAGO_MS);
}

function registrarContextoPago(pedidoId, contexto) {
  const expiraEn = fechaExpiracion().toISOString().replace('T', ' ').replace(/\.\d+Z$/, '');
  guardarPagoPendiente(String(pedidoId), contexto, expiraEn);
}

function consumirContextoPago(pedidoId) {
  const id = String(pedidoId || '');
  limpiarPagosPendientesExpirados();
  const pendiente = obtenerPagoPendiente(id);
  eliminarPagoPendiente(id);
  return { pedidoId: id, aprobado: true, sinContexto: !pendiente, ...(pendiente || {}) };
}

module.exports = { VIGENCIA_PAGO_MS, getAppUrl, fechaExpiracion, registrarContextoPago, consumirContextoPago };
