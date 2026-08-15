'use strict';
const { getConfig, getGrupoMandaditosId } = require('../db/config');
const {
  getRepartidores,
  getRepartidor,
  upsertRepartidor,
  setEnRuta,
  registrarEntregaConfirmada,
  registrarEntregaTimeout,
} = require('../db/repartidores');
const logger = require('../logger');
const { guardarDespachoProgramado, marcarDespachoEjecutado, getDespachosPendientes } = require('../db/modelos');

// ── Estado en memoria ─────────────────────────────────────────────────────────
const despachosPendientes = new Map(); // messageId → datos del despacho
const _timers = new Map();             // jid → { timerRecordatorio, timerTimeout, pedidoColonia, pedidoId, inicio }
const _zonasSilencio = new Map();      // jid → timestamp hasta el que dura el silencio
const _esperandoRespuesta = new Set(); // JIDs que acaban de recibir "¿Ya entregaste?"
const _despachoTimers = new Map();      // pedidoId → timer de solicitud programada
const _despachosEnAsignacion = new Set(); // messageId en proceso de asignación

function _jid(valor) {
  if (!valor) return '';
  if (typeof valor === 'string') return valor;
  return valor._serialized || valor.$1
    || (valor.user && valor.server ? `${valor.user}@${valor.server}` : '');
}

async function _resolverJidPrivado(jid, client) {
  const original = _jid(jid);
  if (!original.endsWith('@lid') || typeof client?.getContactLidAndPhone !== 'function') return original;
  try {
    const resultados = await client.getContactLidAndPhone([original]);
    return _jid(resultados?.[0]?.pn) || original;
  } catch (_) {
    return original;
  }
}

// ── NLU de confirmación ───────────────────────────────────────────────────────
const _PATRONES_CONFIRMADOS = [
  /\b(entregue|entregué|entregado|entregada)\b/i,
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
  const t        = _timers.get(jid);
  const inicio   = t?.inicio || Date.now();
  const minutos  = Math.round((Date.now() - inicio) / 60000);
  const pedidoId = t?.pedidoId   || null;
  const colonia  = t?.pedidoColonia || null;
  _clearTimers(jid);

  if (porTimeout) {
    registrarEntregaTimeout(jid, pedidoId, colonia);
    try { await client.sendMessage(jid, '⏱️ Registré tu entrega automáticamente por tiempo de espera. ¡Gracias!'); } catch (_) {}
  } else {
    registrarEntregaConfirmada(jid, minutos, pedidoId, colonia);
    try { await client.sendMessage(jid, `✅ ¡Gracias! Entrega registrada (${minutos} min). ¡Buen trabajo! 🛵`); } catch (_) {}
  }
}

function _lanzarTimers(jid, client, pedidoId, pedidoColonia, inicio) {
  const recordatorioMin = parseInt(getConfig('mandaditos_recordatorio_min') || '30', 10);
  const timeoutPostMin  = parseInt(getConfig('mandaditos_timeout_post_min') || '20', 10);

  const transcurrido = Math.max(0, Date.now() - inicio);
  const recordatorioMs = recordatorioMin * 60 * 1000;
  const timeoutMs = timeoutPostMin * 60 * 1000;

  const lanzarTimeout = demora => {
    const t = _timers.get(jid);
    if (!t) return;
    t.timerTimeout = setTimeout(async () => {
      await _confirmarEntrega(jid, client, true);
    }, Math.max(0, demora));
    t.timerTimeout.unref?.();
  };
  const recordar = async () => {
    const t = _timers.get(jid);
    if (!t) return;
    try { await client.sendMessage(jid, `⏰ ¿Ya entregaste el pedido de *${pedidoColonia}*?`); } catch (_) {}
    lanzarTimeout(timeoutMs);
  };

  const restanteRecordatorio = recordatorioMs - transcurrido;
  const restanteTotal = recordatorioMs + timeoutMs - transcurrido;
  let timerRecordatorio = null;
  _timers.set(jid, { timerRecordatorio: null, timerTimeout: null, pedidoColonia, pedidoId, inicio });
  if (restanteTotal <= 0) {
    const inmediato = setTimeout(() => _confirmarEntrega(jid, client, true), 0);
    inmediato.unref?.();
    _timers.get(jid).timerTimeout = inmediato;
    return;
  }
  if (restanteRecordatorio <= 0) {
    Promise.resolve(client.sendMessage(jid, `⏰ ¿Ya entregaste el pedido de *${pedidoColonia}*?`)).catch(() => {});
    lanzarTimeout(restanteTotal);
    return;
  }
  timerRecordatorio = setTimeout(async () => {
    await recordar();
  }, restanteRecordatorio);
  timerRecordatorio.unref?.();
  _timers.get(jid).timerRecordatorio = timerRecordatorio;
}

// ── Enviar despacho al grupo de mandaditos ────────────────────────────────────
async function enviarDespachoMandaditos(client, datos) {
  const grupoId = getGrupoMandaditosId();
  if (!grupoId) throw new Error('No hay grupo de Mandaditos configurado');

  const negocioColonia = getConfig('negocio_colonia') || getConfig('nombre_negocio') || 'Negocio';

  const etiquetaProgramada = datos.esProgramada ? ' — ORDEN PROGRAMADA' : '';
  const texto =
    `🛵 *Pedido #${datos.pedidoId} — Solicitud de reparto${etiquetaProgramada}*\n` +
    `━━━━━━━━━━━━━━━━━━\n` +
    `📍 *Colonia origen:* ${negocioColonia}\n` +
    `📍 *Colonia destino:* ${datos.clienteColonia || '—'}\n` +
    `💰 *Total de la orden:* ${datos.totalOrden}\n` +
    `🛵 *Tarifa de envío:* $${datos.tarifaDomicilio}\n` +
    `━━━━━━━━━━━━━━━━━━\n` +
    `_¿Quién está disponible? *Responde este mensaje* para tomar el pedido._`;

  try {
    const enviado = await client.sendMessage(grupoId, texto);
    const msgId = enviado?.id?._serialized || enviado?.id?.$1;
    if (msgId) despachosPendientes.set(msgId, { ...datos, negocioColonia });
  } catch (e) {
    logger.error(`[Mandaditos] Error al enviar despacho #${datos.pedidoId}: ${e.message}`);
    throw e;
  }
}

// ── Manejar respuesta en el grupo (repartidor acepta pedido) ──────────────────
async function handleMensajeMandaditos(msg, client) {
  if (msg.fromMe) return false;
  if (!msg.hasQuotedMsg) return false;

  let quotedId;
  try {
    const quoted = await msg.getQuotedMessage();
    quotedId = quoted?.id?._serialized || quoted?.id?.$1;
  } catch (_) { return false; }

  if (!quotedId || !despachosPendientes.has(quotedId)) return false;
  if (_despachosEnAsignacion.has(quotedId)) {
    await msg.reply('⏳ Este pedido ya está siendo asignado a otro repartidor.');
    return true;
  }

  const datos = despachosPendientes.get(quotedId);
  const repartidorJid = await _resolverJidPrivado(msg.author || msg.from, client);
  const registrado = getRepartidor(repartidorJid);
  if (registrado && !registrado.activo) {
    await msg.reply('⛔ Tu acceso como repartidor está pausado. Contacta al administrador.');
    return true;
  }
  if (registrado?.en_ruta) {
    await msg.reply(`⚠️ Ya tienes asignado el pedido #${registrado.pedido_actual_id || '—'}. Finalízalo antes de tomar otro.`);
    return true;
  }
  _despachosEnAsignacion.add(quotedId);
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
    despachosPendientes.delete(quotedId); // solo después de entregar los datos privados
    upsertRepartidor(repartidorJid, nombre);
    const inicio = Date.now();
    setEnRuta(repartidorJid, datos.pedidoId, new Date(inicio).toISOString());
    const silencioMin = parseInt(getConfig('mandaditos_silencio_min') || '15', 10);
    _zonasSilencio.set(repartidorJid, Date.now() + silencioMin * 60 * 1000);
    _lanzarTimers(repartidorJid, client, datos.pedidoId, datos.clienteColonia || '—', inicio);
    try { await msg.reply(`✅ Pedido #${datos.pedidoId} tomado. Te mandé los detalles por privado. 🛵`); } catch (_) {}
  } catch (e) {
    logger.error(`[Mandaditos] Error al notificar repartidor: ${e.message}`);
    try { await msg.reply('❌ No pude enviarte los detalles. El pedido sigue disponible para otro intento.'); } catch (_) {}
  } finally {
    _despachosEnAsignacion.delete(quotedId);
  }
  return true;
}

function reanudarSeguimientoRepartidores(client) {
  const activos = getRepartidores().filter(r => r.en_ruta && r.pedido_actual_id);
  for (const rep of activos) {
    const inicio = new Date(rep.tiempo_ruta_inicio || Date.now()).getTime();
    _lanzarTimers(rep.jid, client, rep.pedido_actual_id, 'destino registrado', Number.isFinite(inicio) ? inicio : Date.now());
  }
  if (activos.length) logger.info(`[Mandaditos] Seguimiento reanudado para ${activos.length} repartidor(es) en ruta`);
  return activos.length;
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

// ── Despacho con delay configurable ──────────────────────────────────────────
async function despacharConDelay(client, datos) {
  const delay = parseInt(getConfig('mandaditos_delay_min') || '15', 10);
  if (delay <= 0) {
    await enviarDespachoMandaditos(client, datos);
    return { inmediato: true, delay: 0 };
  } else {
    const horaDespacho = new Date(Date.now() + delay * 60 * 1000);
    const existente = getDespachosPendientes().find(d => Number(d.pedido_id) === Number(datos.pedidoId));
    const despachoId = existente?.id || guardarDespachoProgramado({ ...datos, horaDespacho: horaDespacho.toISOString() });
    if (_despachoTimers.has(String(datos.pedidoId))) {
      return { inmediato: false, delay, despachoId, horaDespacho: new Date(existente?.hora_despacho || horaDespacho), yaProgramado: true };
    }
    const timer = setTimeout(() => {
      _despachoTimers.delete(String(datos.pedidoId));
      enviarDespachoMandaditos(client, datos)
        .then(() => marcarDespachoEjecutado(despachoId))
        .catch(e => logger.error(`[Mandaditos] Error en despacho demorado #${datos.pedidoId}: ${e.message}`));
    }, delay * 60 * 1000);
    timer.unref?.();
    _despachoTimers.set(String(datos.pedidoId), timer);
    logger.info(`[Mandaditos] Despacho #${datos.pedidoId} (db #${despachoId}) programado en ${delay} min`);
    return { inmediato: false, delay, despachoId, horaDespacho };
  }
}

module.exports = {
  enviarDespachoMandaditos,
  despacharConDelay,
  handleMensajeMandaditos,
  handleMensajeRepartidor,
  esRepartidorActivo,
  reanudarSeguimientoRepartidores,
};
