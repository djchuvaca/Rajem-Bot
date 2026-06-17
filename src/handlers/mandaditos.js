// src/handlers/mandaditos.js
// Despacho de pedidos a domicilio al grupo de repartidores (mandaditos).
const { getConfig } = require('../db/config');
const logger = require('../logger');

// messageId → datos del despacho (en memoria; se pierde al reiniciar)
const despachosPendientes = new Map();

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
    if (msgId) {
      despachosPendientes.set(msgId, { ...datos, negocioColonia });
    }
  } catch (e) {
    logger.error(`[Mandaditos] Error al enviar despacho #${datos.pedidoId}: ${e.message}`);
  }
}

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

  const negocioCalle   = getConfig('negocio_calle')     || '(consultar con el administrador)';
  const negocioColonia = datos.negocioColonia            || getConfig('negocio_colonia') || 'Centro';
  const negocioNombre  = getConfig('nombre_negocio')     || 'Tacos Javier';
  const negocioRef     = getConfig('negocio_referencia') || '';
  const repartidorJid  = msg.author || msg.from;

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
    `¡Mucho éxito! 🙏`;

  try {
    await client.sendMessage(repartidorJid, privado);
    await msg.reply(`✅ Pedido #${datos.pedidoId} tomado. Te mandé los detalles por privado. 🛵`);
  } catch (e) {
    logger.error(`[Mandaditos] Error al notificar repartidor: ${e.message}`);
  }

  return true;
}

module.exports = { enviarDespachoMandaditos, handleMensajeMandaditos };
