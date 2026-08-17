// src/handlers/mensajes.js — Router delgado (~120 líneas)
const {
  clientesPreventa, esperandoCaptura, clientesNuevos, getHistorial,
  tipoEntregaCliente, datosCampos, datosRecibidos,
} = require("../estado");
const { detectarPreguntaFrecuente, detectarTodasPreguntasFrecuentes } = require("./pedidoParser");
const { generarRespuestaAutomatica } = require("./respuestas");
const { estaEnHorario, mensajeFueraDeHorario } = require("../horario");
const { MENU_FORMATO } = require("../config");

const { ultimaActividad, recordatorioEnviado, enFlujoActivo, replyConTyping, ordenPendientePreventa } = require("./flujos/utils");
const botPausado = require("../estado/bot-pausado");
const { getGrupoId, getNotifDestinoJID } = require("../db");
const trazabilidad = require('../db/observabilidad');

const { handleCancelacionConfirmada, handleMotivoCancelacion, handleCancelacionDurantePedido, handleCancelacionPagoMP } = require("./flujos/cancelacion");
const { handlePrimerMensaje, handleFueraDeHorario, handleTipoEntrega, handleCambioTipoDuranteFormulario, handleFormularioProgresivo, marcarMenuMostrado } = require("./flujos/formulario");
const { handleEdicionPendiente, handleConfirmacionDatos } = require("./flujos/edicion");
const {
  handleEdicionResumen, handleCambiosTipoDesdeResumen, handleCambioMetodoDesdeResumen,
  handleAgregarDesdeResumen, handleConfirmacionFinal, handleCatchAllResumen,
} = require("./flujos/resumen");
const {
  handleEsperandoTipoItem, handleCambioTipoDuranteTomaPedido, handleConfirmacionItem,
  handleExtras, handleAgregarMas,
  handleFAQDurantePedido, handleRepetirPedido, handlePedidoSimple,
  handleEsperandoCorte, handleSinCorte, handleSinTipo,
  handleModificacionAgregarMas, handlePresupuestoInverso, handleGroqFallback, handleNoEntendi,
} = require("./flujos/orden");

async function handleMensaje(msg, client) {
  if (botPausado.pausado) return;

  const clienteNumero = msg.from;
  trazabilidad.registrarEntrada(clienteNumero, msg.body || '', {
    messageId: msg.id?._serialized || null,
    tipoMensaje: msg.type || 'chat',
    tieneMedia: !!msg.hasMedia,
  });
  ultimaActividad.set(clienteNumero, Date.now());
  recordatorioEnviado.delete(clienteNumero);

  // Deshabilitar link previews + log en todas las respuestas
  const _origReply = msg.reply.bind(msg);
  msg.reply = (content, chatId, opts = {}) => {
    if (typeof content === "string")
      console.log("[Bot]: " + content.substring(0, 200) + (content.length > 200 ? "..." : ""));
    if (typeof content === 'string') trazabilidad.registrarSalida(clienteNumero, content);
    return _origReply(content, chatId, { linkPreview: false, ...opts });
  };

  const atendidoPor = async (ruta, resultado) => {
    const atendido = await resultado;
    if (atendido) trazabilidad.registrarRuta(clienteNumero, ruta);
    return atendido;
  };

  // ── ESPERANDO CAPTURA (texto cuando se espera imagen de transferencia) ──────
  if (esperandoCaptura.has(clienteNumero) && !msg.hasMedia) {
    trazabilidad.registrarRuta(clienteNumero, 'esperando_captura');
    if (msg.body && msg.body.trim().length > 0) {
      const textoCap = msg.body.trim();
      if (/cancelar|cancela|cancel|cancelo|cancelame|cancelado|ya no quiero|ya no/i.test(textoCap)) {
        const datosCaptura = esperandoCaptura.get(clienteNumero);
        esperandoCaptura.delete(clienteNumero);
        const { limpiarTodo } = require("../estado");
        limpiarTodo(clienteNumero);
        ordenPendientePreventa.delete(clienteNumero);
        clientesNuevos.delete(clienteNumero);
        const notifJID = getNotifDestinoJID();
        if (notifJID) {
          const horaCancel = new Date().toLocaleTimeString("es-MX", { hour: "2-digit", minute: "2-digit" });
          try {
            await client.sendMessage(notifJID,
              `Solicitud de Cancelacion\nHora: ${horaCancel}\nCliente: (canceló antes de enviar captura)\nTelefono: ${datosCaptura?.telefono || "—"}\nMotivo: Canceló durante espera de transferencia`
            );
          } catch (e) { console.error("Error notificando cancelacion:", e.message); }
        }
        await msg.reply("Tu pedido ha sido cancelado. Cuando gustes ordenar, aqui estaremos. Hasta pronto!");
        return;
      }
      const pregFaqCap = detectarPreguntaFrecuente(textoCap);
      if (pregFaqCap) {
        const respFaqCap = generarRespuestaAutomatica(pregFaqCap, { esDomicilio: true });
        if (respFaqCap) {
          console.log(`Bot: [RESPUESTA AUTOMÁTICA] tipo: ${pregFaqCap.tipo}`);
          await replyConTyping(msg, respFaqCap);
          await replyConTyping(msg, "Recuerda que seguimos esperando tu captura de transferencia para confirmar tu pedido. 📸");
          return;
        }
      }
      if (/ya\s+(pagu[eé]|mand[eé]|te\s+mand[eé]|envi[eé]|te\s+envi[eé]|hice\s+la\s+transferencia|realic[eé])|mand[eé]\s+(el\s+)?(comprobante|captura|transferencia|pago)|ya\s+(?:est[aá]\s+pagado|se\s+pag[oó])|ya\s+te\s+transf/i.test(textoCap)) {
        await msg.reply("Gracias! Solo mándame la captura de pantalla de la transferencia para confirmar tu pedido. 📸");
        return;
      }
      await msg.reply("Estamos esperando tu captura de transferencia. Mandala cuando puedas y confirmamos tu pedido.");
    }
    return;
  }

  // ── GUARDIAS DE TIPO DE MENSAJE ──────────────────────────────────────────────
  if (msg.type === "ptt" || (msg.hasMedia && msg.type === "audio")) {
    if (esperandoCaptura.has(clienteNumero))
      await msg.reply("Necesito la *captura de pantalla* de tu transferencia, no una nota de voz. 📸");
    else
      await msg.reply("Solo proceso mensajes de texto. Escríbeme tu pedido y con gusto te atiendo 😊");
    return;
  }
  if (!msg.body || !msg.body.trim()) {
    if (!clientesNuevos.has(clienteNumero) && msg.hasMedia) {
      await msg.reply("Solo proceso mensajes de texto. Escríbeme tu pedido y con gusto te atiendo 😊");
    }
    return;
  }

  let textoOriginal = msg.body.trim();
  if (/^[👍✅☑🙌💯👌🤙]+$/u.test(textoOriginal))       textoOriginal = "si";
  else if (/^[👎❌🚫🙅]+$/u.test(textoOriginal))         textoOriginal = "no";
  if (textoOriginal.length < 2 && clientesNuevos.has(clienteNumero)) return;

  // Ignorar previews automáticos de WhatsApp
  if (/^[\w.-]+\.[a-z]{2,}$/i.test(textoOriginal)) return;
  if (/^https?:\/\//i.test(textoOriginal)) return;
  if (/^[\w.+-]+@[\w-]+\.[a-z]{2,}$/i.test(textoOriginal) && require("../estado").datosRecibidos.has(clienteNumero)) return;
  if (/^[a-z0-9.-]+\.[a-z]{2,}(\n[\w.+-]+@[\w-]+\.[a-z]{2,})?(\n[a-z0-9.-]+\.[a-z]{2,})?$/i.test(textoOriginal.trim())) return;

  console.log(`\n[Usuario ${clienteNumero}]: ${textoOriginal}`);

  // ── PREGUNTAS FRECUENTES GLOBALES (solo si no está en flujo activo) ──────────
  {
    const pregsFaq = !enFlujoActivo(clienteNumero) ? detectarTodasPreguntasFrecuentes(textoOriginal) : null;
    if (pregsFaq && pregsFaq.length > 0) {
      const histFaq   = getHistorial(clienteNumero);
      const esDomFaq  = tipoEntregaCliente.get(clienteNumero) === "domicilio"
        || (tipoEntregaCliente.get(clienteNumero) == null && histFaq.some(h => h.content && h.content.includes("domicilio")));
      let respondio    = false;
      let esAckSinMenu = false;
      for (const pregFaq of pregsFaq) {
        const respFaq = generarRespuestaAutomatica(pregFaq, { esDomicilio: esDomFaq });
        if (respFaq) {
          if (!clientesNuevos.has(clienteNumero)) clientesNuevos.add(clienteNumero);
          console.log(`Bot: [RESPUESTA AUTOMÁTICA] tipo: ${pregFaq.tipo}`);
          await replyConTyping(msg, respFaq);
          respondio = true;
          if (pregFaq.tipo === "ya_en_camino" || pregFaq.tipo === "despedida") esAckSinMenu = true;
        }
      }
      if (respondio) {
        trazabilidad.registrarRuta(clienteNumero, 'faq_global', { intenciones: pregsFaq.map(p => p.tipo) });
        if (!esAckSinMenu) {
          if (!estaEnHorario() && !clientesPreventa.has(clienteNumero)) {
            await replyConTyping(msg, mensajeFueraDeHorario());
          } else if (estaEnHorario() && !enFlujoActivo(clienteNumero)) {
            await replyConTyping(msg, MENU_FORMATO());
            marcarMenuMostrado(clienteNumero);
          }
        }
        return;
      }
    }
  }

  // ── FLUJOS PRINCIPALES (en orden de prioridad) ───────────────────────────────
  if (await atendidoPor('cancelacion_pago', handleCancelacionPagoMP(msg, client, textoOriginal, clienteNumero))) return;
  if (await atendidoPor('cancelacion_confirmada', handleCancelacionConfirmada(msg, client, textoOriginal, clienteNumero))) return;
  if (await atendidoPor('motivo_cancelacion', handleMotivoCancelacion(msg, client, textoOriginal, clienteNumero))) return;
  if (await atendidoPor('primer_mensaje', handlePrimerMensaje(msg, textoOriginal, clienteNumero))) return;
  if (await atendidoPor('fuera_de_horario', handleFueraDeHorario(msg, textoOriginal, clienteNumero))) return;

  const historial  = getHistorial(clienteNumero);
  const esPreventa = clientesPreventa.has(clienteNumero);

  if (await atendidoPor('edicion_pendiente', handleEdicionPendiente(msg, textoOriginal, clienteNumero, historial, esPreventa))) return;
  if (await atendidoPor('confirmacion_datos', handleConfirmacionDatos(msg, textoOriginal, clienteNumero, historial, esPreventa))) return;
  if (await atendidoPor('tipo_entrega', handleTipoEntrega(msg, client, textoOriginal, clienteNumero, historial, esPreventa))) {
    if (ordenPendientePreventa.has(clienteNumero)) {
      textoOriginal = ordenPendientePreventa.get(clienteNumero);
      ordenPendientePreventa.delete(clienteNumero);
      // No retornamos — el texto del pedido guardado cae al flujo de órdenes
    } else {
      return;
    }
  }
  if (await atendidoPor('cancelacion_durante_pedido', handleCancelacionDurantePedido(msg, textoOriginal, clienteNumero))) return;

  const esOrdenDom = tipoEntregaCliente.get(clienteNumero) === "domicilio"
    || (tipoEntregaCliente.get(clienteNumero) == null && historial.some(h => h.content && h.content.includes("domicilio")));

  if (await atendidoPor('edicion_resumen', handleEdicionResumen(msg, textoOriginal, clienteNumero, historial, esPreventa))) return;
  if (await atendidoPor('cambio_tipo_resumen', handleCambiosTipoDesdeResumen(msg, textoOriginal, clienteNumero, historial, esPreventa))) return;
  if (await atendidoPor('cambio_pago_resumen', handleCambioMetodoDesdeResumen(msg, textoOriginal, clienteNumero, historial, esPreventa))) return;
  if (await atendidoPor('agregar_desde_resumen', handleAgregarDesdeResumen(msg, textoOriginal, clienteNumero))) return;
  if (await atendidoPor('confirmacion_final', handleConfirmacionFinal(msg, client, textoOriginal, clienteNumero, historial, esPreventa))) return;
  if (await atendidoPor('resumen_pendiente', handleCatchAllResumen(msg, clienteNumero))) return;

  if (await atendidoPor('esperando_tipo_item', handleEsperandoTipoItem(msg, textoOriginal, clienteNumero, historial, esOrdenDom))) return;
  if (await atendidoPor('esperando_corte', handleEsperandoCorte(msg, textoOriginal, clienteNumero, historial, esOrdenDom))) return;
  if (await atendidoPor('cambio_tipo_pedido', handleCambioTipoDuranteTomaPedido(msg, textoOriginal, clienteNumero, historial))) return;
  if (await atendidoPor('confirmacion_item', handleConfirmacionItem(msg, textoOriginal, clienteNumero, historial, esOrdenDom))) return;
  if (await atendidoPor('extras', handleExtras(msg, textoOriginal, clienteNumero, historial, esOrdenDom, esPreventa))) return;
  if (await atendidoPor('agregar_mas', handleAgregarMas(msg, textoOriginal, clienteNumero, historial, esOrdenDom, esPreventa))) return;
  if (await atendidoPor('cambio_tipo_formulario', handleCambioTipoDuranteFormulario(msg, textoOriginal, clienteNumero, esPreventa))) return;
  if (await atendidoPor('formulario_progresivo', handleFormularioProgresivo(msg, textoOriginal, clienteNumero, historial, esPreventa))) return;
  if (await atendidoPor('faq_durante_pedido', handleFAQDurantePedido(msg, textoOriginal, clienteNumero, esOrdenDom))) return;
  if (await atendidoPor('repetir_pedido', handleRepetirPedido(msg, textoOriginal, clienteNumero, historial))) return;
  if (await atendidoPor('pedido_simple', handlePedidoSimple(msg, textoOriginal, clienteNumero, historial))) return;
  if (await atendidoPor('sin_corte', handleSinCorte(msg, textoOriginal, clienteNumero))) return;
  if (await atendidoPor('sin_tipo', handleSinTipo(msg, textoOriginal, clienteNumero))) return;
  if (await atendidoPor('modificacion_agregar', handleModificacionAgregarMas(msg, textoOriginal, clienteNumero))) return;
  if (await atendidoPor('presupuesto_inverso', handlePresupuestoInverso(msg, textoOriginal))) return;
  if (await atendidoPor('groq_fallback', handleGroqFallback(msg, textoOriginal, clienteNumero, historial))) return;

  await handleNoEntendi(msg, clienteNumero);
  trazabilidad.registrarRuta(clienteNumero, 'no_entendido');
  trazabilidad.crearAlerta(clienteNumero, 'nlu_no_entendido', 'El bot no entendió al cliente', textoOriginal, { severidad: 'media' });
}

module.exports = { handleMensaje };
