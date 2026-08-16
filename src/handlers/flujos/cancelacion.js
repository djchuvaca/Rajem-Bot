// src/handlers/flujos/cancelacion.js
const {
  pedidosConfirmados, esperandoMotivoCancelacion, clientesNuevos,
  esperandoTipoItem, esperandoExtras, ordenPreResumen, limpiarTodo, esperandoPagoMP,
} = require("../../estado");
const { actualizarEstadoPedido, actualizarEstadoPorId, actualizarEstadoConfirmado, getMensaje, getConfig, getGrupoId } = require("../../db");
const { detectarPreguntaFrecuente } = require("../pedidoParser");
const { generarRespuestaAutomatica } = require("../respuestas");
const { SALUDO } = require("../../config");
const { replyConTyping, enFlujoActivo, ordenPendientePreventa } = require("./utils");

const RE_CANCELAR = /\bcancelar\b|\bcancela\b|\bcancel\b|\bcancelo\b|\bcancelame\b|\bcancelado\b|^ya\s+no\s+quiero\s*$|^ya\s+no\s*$|^no\s+quiero\s+nada\s*$|^no\s+(lo|la)\s+quiero\s*$|^olv[ií]d[ae](lo|la|nos|me)?\s*$|^olv[ií]da\s+(todo|mi\s+pedido)\s*$|^mejor\s+no\s*$|^no\s+va\s*$/i;
const RE_NUEVO    = /\b(empez(?:ar|emos)\s+de\s+(?:nuevo|cero)|comenzar\s+de\s+cero|reinici(?:ar|o)|volver\s+a\s+empezar|otro\s+pedido|nuevo\s+pedido|quiero\s+(?:hacer\s+)?otro\s+pedido|olvida(?:mos)?\s+(?:todo|mi\s+pedido)|borremos?\s+todo)\b/i;

// ── CANCELACIÓN DE PEDIDO CONFIRMADO ─────────────────────────────────────────
async function handleCancelacionConfirmada(msg, client, textoOriginal, clienteNumero) {
  if (!pedidosConfirmados.has(clienteNumero)) return false;

  const datosPedido = pedidosConfirmados.get(clienteNumero);
  const minutosTranscurridos = (Date.now() - (datosPedido.confirmadoEn || 0)) / 60000;
  const quiereCancelar       = RE_CANCELAR.test(textoOriginal);
  const quiereEmpezarDeNuevo = RE_NUEVO.test(textoOriginal);

  const tiempoCancelacion = parseInt(getConfig("tiempo_cancelacion") || "15");

  if (quiereCancelar) {
    if (minutosTranscurridos > tiempoCancelacion) {
      await msg.reply(`Lo sentimos, el tiempo para cancelar tu pedido ya venció (${tiempoCancelacion} minutos).\nSi tienes algún problema, comunícate directamente con nosotros. Gracias por tu comprensión!`);
      return true;
    }
    esperandoMotivoCancelacion.set(clienteNumero, { nombre: datosPedido.nombre, telefono: datosPedido.telefono, notificarGrupo: true });
    pedidosConfirmados.delete(clienteNumero);
    clientesNuevos.delete(clienteNumero);
    await msg.reply("Lamento escuchar eso. *¿Podrías indicarme el motivo de tu cancelación?*");
    return true;
  }

  const minRestantes = Math.max(0, Math.ceil(tiempoCancelacion - minutosTranscurridos));
  await msg.reply(
    "Tu pedido ya fue recibido y esta en espera de confirmacion de nuestro equipo.\n" +
    (minRestantes > 0
      ? `Si deseas cancelarlo tienes ${minRestantes} minuto${minRestantes !== 1 ? "s" : ""} para escribir *cancelar*.\n\n`
      : "El tiempo para cancelar ya venció.\n\n") +
    "_Si deseas hacer un nuevo pedido escribe *nuevo pedido*._"
  );
  if (quiereEmpezarDeNuevo) {
    pedidosConfirmados.delete(clienteNumero);
    clientesNuevos.delete(clienteNumero);
    limpiarTodo(clienteNumero);
    ordenPendientePreventa.delete(clienteNumero);
    await replyConTyping(msg, SALUDO());
  }
  return true;
}

// ── MOTIVO DE CANCELACIÓN ─────────────────────────────────────────────────────
async function handleMotivoCancelacion(msg, client, textoOriginal, clienteNumero) {
  if (!esperandoMotivoCancelacion.has(clienteNumero)) return false;

  const datosCancelacion = esperandoMotivoCancelacion.get(clienteNumero);
  const horaCancel = new Date().toLocaleTimeString("es-MX", { hour: "2-digit", minute: "2-digit" });
  const grupoId = getGrupoId();
  if (grupoId && datosCancelacion.notificarGrupo) {
    try {
      await client.sendMessage(grupoId,
        `Solicitud de Cancelacion\nHora: ${horaCancel}\nCliente: ${datosCancelacion.nombre}\nTelefono: ${datosCancelacion.telefono}\nMotivo: ${textoOriginal}`
      );
    } catch (e) { console.error("Error al notificar cancelacion:", e.message); }
  }
  esperandoMotivoCancelacion.delete(clienteNumero);
  clientesNuevos.delete(clienteNumero);
  limpiarTodo(clienteNumero);
  esperandoTipoItem.delete(clienteNumero);
  esperandoExtras.delete(clienteNumero);
  ordenPreResumen.delete(clienteNumero);
  ordenPendientePreventa.delete(clienteNumero);
  // Intentar cancelar desde estado 'pendiente', luego desde 'confirmado'
  // (el admin pudo haber confirmado mientras el cliente decidía cancelar)
  try { actualizarEstadoPedido(datosCancelacion.telefono, "cancelado"); } catch (e) {}
  try { actualizarEstadoConfirmado(datosCancelacion.telefono, "cancelado"); } catch (e) {}
  const msgCancelacion = (getMensaje("cancelacion_enviada") || "Tu solicitud de cancelacion fue enviada a nuestro equipo.\nEn breve se comunicaran contigo para confirmarte. Disculpa los inconvenientes!").replace(/{negocio}/g, getConfig("nombre_negocio") || "el negocio");
  await msg.reply(msgCancelacion);
  return true;
}

// ── CANCELACIÓN / EMPEZAR DE NUEVO DURANTE PEDIDO ────────────────────────────
async function handleCancelacionDurantePedido(msg, textoOriginal, clienteNumero) {
  const quiereCancelar       = RE_CANCELAR.test(textoOriginal);
  const quiereEmpezarDeNuevo = RE_NUEVO.test(textoOriginal);

  if (quiereCancelar) {
    if (!enFlujoActivo(clienteNumero) && !clientesNuevos.has(clienteNumero)) return false;
    clientesNuevos.delete(clienteNumero);
    limpiarTodo(clienteNumero);
    esperandoTipoItem.delete(clienteNumero);
    esperandoExtras.delete(clienteNumero);
    ordenPreResumen.delete(clienteNumero);
    ordenPendientePreventa.delete(clienteNumero);
    await msg.reply("Tu pedido ha sido cancelado. Cuando gustes ordenar, aqui estaremos. Hasta pronto!");
    return true;
  }
  if (quiereEmpezarDeNuevo && enFlujoActivo(clienteNumero)) {
    limpiarTodo(clienteNumero);
    esperandoTipoItem.delete(clienteNumero);
    esperandoExtras.delete(clienteNumero);
    ordenPreResumen.delete(clienteNumero);
    ordenPendientePreventa.delete(clienteNumero);
    await msg.reply("Listo! Empezamos de nuevo. 😊\n\n*¿Tu pedido será para domicilio o pasas a recoger al mostrador?*");
    return true;
  }
  return false;
}

// ── CANCELACIÓN / RECORDATORIO DURANTE ESPERA DE PAGO MP ─────────────────────
async function handleCancelacionPagoMP(msg, client, textoOriginal, clienteNumero) {
  if (!esperandoPagoMP.has(clienteNumero)) return false;

  const datos   = esperandoPagoMP.get(clienteNumero);
  const expirado = Date.now() > datos.expiraEn;

  // Link expirado: cancelar en BD y limpiar
  if (expirado) {
    esperandoPagoMP.delete(clienteNumero);
    limpiarTodo(clienteNumero);
    try { actualizarEstadoPorId(datos.pedidoId, "cancelado"); } catch (_) {}
    await msg.reply("El link de pago ya venció (30 minutos). Si quieres hacer un nuevo pedido, escríbeme cuando gustes.");
    return true;
  }

  // Cancelación explícita
  const RE_CANCELAR = /\bcancelar\b|\bcancela\b|\bcancel\b|\bcancelo\b|\bya\s+no\s+quiero\b|\bya\s+no\b|\bmejor\s+no\b/i;
  if (RE_CANCELAR.test(textoOriginal)) {
    esperandoPagoMP.delete(clienteNumero);
    limpiarTodo(clienteNumero);
    try { actualizarEstadoPorId(datos.pedidoId, "cancelado"); } catch (_) {}
    const grupoId = getGrupoId();
    if (grupoId) {
      const horaCancel = new Date().toLocaleTimeString("es-MX", { hour: "2-digit", minute: "2-digit" });
      try {
        await client.sendMessage(grupoId,
          `Solicitud de Cancelacion\nHora: ${horaCancel}\nCliente: ${datos.nombre || "—"}\nTelefono: ${datos.telefono || "—"}\nMotivo: Canceló durante espera de pago MercadoPago`
        );
      } catch (e) { console.error("[MP] Error notificando cancelacion:", e.message); }
    }
    await msg.reply("Tu pedido ha sido cancelado. Cuando gustes ordenar, aqui estaremos. Hasta pronto!");
    return true;
  }

  // FAQ: responder y recordar el link pendiente
  const pregFaq = detectarPreguntaFrecuente(textoOriginal);
  if (pregFaq) {
    const respFaq = generarRespuestaAutomatica(pregFaq, { esDomicilio: false });
    if (respFaq) {
      await replyConTyping(msg, respFaq);
      await replyConTyping(msg, "Recuerda que tienes un pago pendiente. Usa el link que te enviamos para confirmar tu pedido.\n\n_Si deseas cancelar, escribe *cancelar*._");
      return true;
    }
  }

  // Cualquier otro mensaje: recordar el pago pendiente
  await msg.reply("Tu pedido está pendiente de pago. Usa el link que te enviamos para completarlo. 💳\n\n_Si deseas cancelar, escribe *cancelar*._");
  return true;
}

module.exports = { handleCancelacionConfirmada, handleMotivoCancelacion, handleCancelacionDurantePedido, handleCancelacionPagoMP };
