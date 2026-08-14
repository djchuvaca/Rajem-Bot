'use strict';
const { getConfig } = require('../db/config');
const {
  upsertRepartidor,
  setEnRuta,
  registrarEntregaConfirmada,
  registrarEntregaTimeout,
} = require('../db/repartidores');
const logger = require('../logger');

// ── Estado en memoria ─────────────────────────────────────────────────────────
const despachosPendientes = new Map(); // messageId → datos del despacho
const _timers = new Map();             // jid → { timerRecordatorio, timerTimeout, pedidoColonia, pedidoId, inicio }
const _zonasSilencio = new Map();      // jid → timestamp hasta el que dura el silencio
const _esperandoRespuesta = new Set(); // JIDs que acaban de recibir "¿Ya entregaste?"

// ── NLU de confirmación ───────────────────────────────────────────────────────
const _PATRONES_CONFIRMADOS = [
  /\bentregué?\b/i,
  /\bya\s+(lo\s+)?(entregue|entregué|deje|dejé|di|pase|pasé)\b/i,
  /\bse\s+lo\s+(di|deje|dejé|entregue|entregué)\b/i,
  /\bya\s+quedo\b/i,
  /\bya\s+quedó\b/i,
  /\bya\s+esta\b/i,
  /\bya\s+está\b/i,
  /\bterminé?\b/i,
  /\blisto\b/i,
  /\bhecho\b/i,
];

const _RE_SI = /^(si|sí|yes|simon|simón|dale|ándale|andale|va|claro|correcto|afirmativo|efectivamente)$/i;
const _RE_NO = /^(no|nel|nop|nope|negativo|todavia|todavía|aún\s+no|aun\s+no)$/i;

function _norm(t) {
  return t.toLowerCase().normalize('NFD').replace(/[̀-ͯ]/g, '').trim();
}

function _detectarConfirmacion(texto) {
  return _PATRONES_CONFIRMADOS.some(p => p.test(_norm(texto)));
}

// ── Manejo de timers ──────────────────────────────────────────────────────────
function _clearTimers(jid) {
  const t = _timers.get(jid);
  if (!t) return;
  if (t.timerRecordatorio) clearTimeout(t.timerRecordatorio);
  if (t.timerTimeout)      clearTimeout(t.timerTimeout);
  _timers.delete(jid);
  _zonasSilencio.delete(jid);
  _esperandoRespuesta.delete(jid);
}

async function _confirmarEntrega(jid, client, porTimeout = false) {
  const t       = _timers.get(jid);
  const inicio  = t?.inicio || Date.now();
  const minutos = Math.round((Date.now() - inicio) / 60000);
  _clearTimers(jid);

  if (porTimeout) {
    registrarEntregaTimeout(jid);
    try { await client.sendMessage(jid, '⏱️ Registré tu entrega automáticamente por tiempo de espera. ¡Gracias!'); } catch (_) {}
  } else {
    registrarEntregaConfirmada(jid, minutos);
    try { await client.sendMessage(jid, `✅ ¡Gracias! Entrega registrada (${minutos} min). ¡Buen trabajo! 🛵`); } catch (_) {}
  }
}

function _lanzarTimers(jid, client, pedidoId, pedidoColonia, inicio) {
  const recordatorioMin = parseInt(getConfig('mandaditos_recordatorio_min') || '30', 10);
  const timeoutPostMin  = parseInt(getConfig('mandaditos_timeout_post_min') || '20', 10);

  const timerRecordatorio = setTimeout(async () => {
    const t = _timers.get(jid);
    if (!t) return;
    try { await client.sendMessage(jid, `⏰ ¿Ya entregaste el pedido de *${pedidoColonia}*?`); } catch (_) {}
    t.timerTimeout = setTimeout(async () => {
      await _confirmarEntrega(jid, client, true);
    }, timeoutPostMin * 60 * 1000);
  }, recordatorioMin * 60 * 1000);

  _timers.set(jid, { timerRecordatorio, timerTimeout: null, pedidoColonia, pedidoId, inicio });
}

// ── Enviar despacho al grupo de mandaditos ────────────────────────────────────
async function enviarDespachoMandaditos(client, datos) {
  const grupoId = process.env.GRUPO_MANDADITOS_ID || getConfig('grupo_mandaditos_id') || null;
  if (!grupoId) return;

  const negocioColonia = getConfig('negocio_colonia') || getConfig('nombre_negocio') || 'Negocio';

  const texto =
    `🛵 *Pedido #${datos.pedidoId} — Solicitud de reparto*\n` +
    `━━━━━━━━━━━━━━━━━━\n` +
    `📍 *Colonia origen:* ${negocioColonia}\n` +
    `📍 *Colonia destino:* ${datos.clienteColonia || '—'}\n` +
    `💰 *Total de la orden:* ${datos.totalOrden}\n` +
    `🛵 *Tarifa de envío:* $${datos.tarifaDomicilio}\n` +
    `━━━━━━━━━━━━━━━━━━\n` +
    `_¿Quién está disponible? *Responde este mensaje* para tomar el pedido._`;

  try {
    const enviado = await client.sendMessage(grupoId, texto);
    const msgId = enviado?.id?._serialized;
    if (msgId) despachosPendientes.set(msgId, { ...datos, negocioColonia });
  } catch (e) {
    logger.error(`[Mandaditos] Error al enviar despacho #${datos.pedidoId}: ${e.message}`);
  }
}

// ── Manejar respuesta en el grupo (repartidor acepta pedido) ──────────────────
async function handleMensajeMandaditos(msg, client) {
  if (msg.fromMe) return false;
  if (!msg.hasQuotedMsg) return false;

  let quotedId;
  try {
    const quoted = await msg.getQuotedMessage();
    quotedId = quoted?.id?._serialized;
  } catch (_) { return false; }

  if (!quotedId || !despachosPendientes.has(quotedId)) return false;

  const datos = despachosPendientes.get(quotedId);
  despachosPendientes.delete(quotedId); // primer repartidor en responder se queda con el pedido

  const repartidorJid  = msg.author || msg.from;
  const negocioCalle   = getConfig('negocio_calle')     || '(consultar con el administrador)';
  const negocioColonia = datos.negocioColonia            || getConfig('negocio_colonia') || 'Centro';
  const negocioNombre  = getConfig('nombre_negocio')     || 'Taquería';
  const negocioRef     = getConfig('negocio_referencia') || '';

  // Auto-registrar repartidor si es la primera vez
  let nombre = `Repartidor ${repartidorJid.replace('@c.us', '').slice(-4)}`;
  try {
    const contacto = await client.getContactById(repartidorJid);
    nombre = contacto?.pushname || contacto?.name || nombre;
  } catch (_) {}
  upsertRepartidor(repartidorJid, nombre);

  // Arrancar contador y marcar en ruta en BD
  const inicio       = Date.now();
  const tiempoInicio = new Date(inicio).toISOString().replace('T', ' ').replace(/\.\d+Z$/, '');
  setEnRuta(repartidorJid, datos.pedidoId, tiempoInicio);

  // Zona de silencio
  const silencioMin = parseInt(getConfig('mandaditos_silencio_min') || '15', 10);
  _zonasSilencio.set(repartidorJid, Date.now() + silencioMin * 60 * 1000);

  const refCliente = datos.clienteReferencia && datos.clienteReferencia !== 'sin referencia'
    ? `📌 Ref: ${datos.clienteReferencia}\n` : '';
  const refNegocio = negocioRef ? `📌 Ref: ${negocioRef}\n` : '';

  const privado =
    `✅ *¡Pedido asignado! — #${datos.pedidoId}*\n` +
    `━━━━━━━━━━━━━━━━━━\n\n` +
    `📦 *Punto de recolección:*\n` +
    `🏪 ${negocioNombre}\n` +
    `📍 ${negocioCalle}, Col. ${negocioColonia}\n` +
    refNegocio +
    `\n📍 *Punto de entrega:*\n` +
    `👤 ${datos.clienteNombre}\n` +
    `📍 ${datos.clienteCalle || '—'}, Col. ${datos.clienteColonia || '—'}\n` +
    refCliente +
    `📱 Tel: ${datos.clienteTelefono || '—'}\n\n` +
    `━━━━━━━━━━━━━━━━━━\n` +
    `💰 *Total a cobrar al cliente: ${datos.totalOrden}*\n` +
    `🛵 *Tu pago por el envío: $${datos.tarifaDomicilio}*\n` +
    `━━━━━━━━━━━━━━━━━━\n` +
    `⚠️ *Cuando entregues, avísame aquí para registrar la entrega.*`;

  try {
    await client.sendMessage(repartidorJid, privado);
    await msg.reply(`✅ Pedido #${datos.pedidoId} tomado. Te mandé los detalles por privado. 🛵`);
  } catch (e) {
    logger.error(`[Mandaditos] Error al notificar repartidor: ${e.message}`);
  }

  _lanzarTimers(repartidorJid, client, datos.pedidoId, datos.clienteColonia || '—', inicio);
  return true;
}

// ── Manejar mensajes privados del repartidor (confirmación de entrega) ────────
async function handleMensajeRepartidor(msg, client) {
  const jid = msg.from;
  if (!_timers.has(jid)) return false;

  const texto         = (msg.body || '').trim();
  const textoNorm     = _norm(texto);
  const silencioHasta = _zonasSilencio.get(jid) || 0;
  const colonia       = _timers.get(jid)?.pedidoColonia || '—';

  // Zona de silencio — acusar recibo sin interpretar
  if (Date.now() < silencioHasta) {
    try { await client.sendMessage(jid, 'Esperaré tu confirmación 👍'); } catch (_) {}
    return true;
  }

  // Esperando respuesta sí/no a la pregunta directa
  if (_esperandoRespuesta.has(jid)) {
    _esperandoRespuesta.delete(jid);
    if (_RE_SI.test(textoNorm) || _detectarConfirmacion(texto)) {
      await _confirmarEntrega(jid, client, false);
    } else if (_RE_NO.test(textoNorm)) {
      try { await client.sendMessage(jid, `Ok, avísame cuando entregues el pedido de *${colonia}* 👍`); } catch (_) {}
    } else {
      // Sigue sin quedar claro — preguntar de nuevo
      _esperandoRespuesta.add(jid);
      try { await client.sendMessage(jid, `¿Ya entregaste el pedido de *${colonia}*? (responde *sí* o *no*)`); } catch (_) {}
    }
    return true;
  }

  // NLU directo
  if (_detectarConfirmacion(texto)) {
    await _confirmarEntrega(jid, client, false);
    return true;
  }

  // No entendido — pregunta directa
  _esperandoRespuesta.add(jid);
  try { await client.sendMessage(jid, `¿Ya entregaste el pedido de *${colonia}*? (responde *sí* o *no*)`); } catch (_) {}
  return true;
}

// Usado por index.js para interceptar el mensaje antes del bot normal
function esRepartidorActivo(jid) {
  return _timers.has(jid);
}

module.exports = {
  enviarDespachoMandaditos,
  handleMensajeMandaditos,
  handleMensajeRepartidor,
  esRepartidorActivo,
};
