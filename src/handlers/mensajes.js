// src/handlers/mensajes.js — Router delgado (~120 líneas)
const {
  clientesPreventa, esperandoCaptura, clientesNuevos, getHistorial,
  tipoEntregaCliente, datosCampos, datosRecibidos,
} = require("../estado");
const { detectarPreguntaFrecuente } = require("./pedidoParser");
const { generarRespuestaAutomatica } = require("./respuestas");
const { estaEnHorario, mensajeFueraDeHorario } = require("../horario");
const { MENU_FORMATO } = require("../config");

const { ultimaActividad, recordatorioEnviado, enFlujoActivo, replyConTyping, ordenPendientePreventa } = require("./flujos/utils");
const botPausado = require("../estado/bot-pausado");

const { handleCancelacionConfirmada, handleMotivoCancelacion, handleCancelacionDurantePedido } = require("./flujos/cancelacion");
const { handlePrimerMensaje, handleFueraDeHorario, handleTipoEntrega, handleCambioTipoDuranteFormulario, handleFormularioProgresivo } = require("./flujos/formulario");
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
  handleModificacionAgregarMas, handlePresupuestoInverso, handleGroqFallback,
} = require("./flujos/orden");

async function handleMensaje(msg, client) {
  if (botPausado.pausado) return;

  const clienteNumero = msg.from;
  ultimaActividad.set(clienteNumero, Date.now());
  recordatorioEnviado.delete(clienteNumero);

  // Deshabilitar link previews + log en todas las respuestas
  const _origReply = msg.reply.bind(msg);
  msg.reply = (content, chatId, opts = {}) => {
    if (typeof content === "string")
      console.log("[Bot]: " + content.substring(0, 200) + (content.length > 200 ? "..." : ""));
    return _origReply(content, chatId, { linkPreview: false, ...opts });
  };

  // ── ESPERANDO CAPTURA (texto cuando se espera imagen de transferencia) ──────
  if (esperandoCaptura.has(clienteNumero) && !msg.hasMedia) {
    if (msg.body && msg.body.trim().length > 0) {
      const textoCap = msg.body.trim();
      if (/cancelar|cancela|cancel|cancelo|cancelame|cancelado|ya no quiero|ya no/i.test(textoCap)) {
        const datosCaptura = esperandoCaptura.get(clienteNumero);
        esperandoCaptura.delete(clienteNumero);
        const { limpiarTodo } = require("../estado");
        limpiarTodo(clienteNumero);
        clientesNuevos.delete(clienteNumero);
        const grupoId = process.env.GRUPO_ID;
        if (grupoId) {
          const horaCancel = new Date().toLocaleTimeString("es-MX", { hour: "2-digit", minute: "2-digit" });
          try {
            await client.sendMessage(grupoId,
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
  if (!msg.body || !msg.body.trim()) return;

  let textoOriginal = msg.body.trim();
  if (/^[👍✅☑🙌💯👌🤙]+$/u.test(textoOriginal))       textoOriginal = "si";
  else if (/^[👎❌🚫🙅]+$/u.test(textoOriginal))         textoOriginal = "no";
  if (textoOriginal.length < 2) return;

  // Ignorar previews automáticos de WhatsApp
  if (/^[\w.-]+\.[a-z]{2,}$/i.test(textoOriginal)) return;
  if (/^https?:\/\//i.test(textoOriginal)) return;
  if (/^[\w.+-]+@[\w-]+\.[a-z]{2,}$/i.test(textoOriginal) && require("../estado").datosRecibidos.has(clienteNumero)) return;
  if (/^[a-z0-9.-]+\.[a-z]{2,}(\n[\w.+-]+@[\w-]+\.[a-z]{2,})?(\n[a-z0-9.-]+\.[a-z]{2,})?$/i.test(textoOriginal.trim())) return;

  console.log(`\n[Usuario ${clienteNumero}]: ${textoOriginal}`);

  // ── PREGUNTAS FRECUENTES GLOBALES (solo si no está en flujo activo) ──────────
  {
    const pregFaq = !enFlujoActivo(clienteNumero) ? detectarPreguntaFrecuente(textoOriginal) : null;
    if (pregFaq) {
      const histFaq   = getHistorial(clienteNumero);
      const esDomFaq  = tipoEntregaCliente.get(clienteNumero) === "domicilio"
        || (tipoEntregaCliente.get(clienteNumero) == null && histFaq.some(h => h.content && h.content.includes("domicilio")));
      const respFaq = generarRespuestaAutomatica(pregFaq, { esDomicilio: esDomFaq });
      if (respFaq) {
        if (!clientesNuevos.has(clienteNumero)) clientesNuevos.add(clienteNumero);
        console.log(`Bot: [RESPUESTA AUTOMÁTICA] tipo: ${pregFaq.tipo}`);
        await replyConTyping(msg, respFaq);
        if (!estaEnHorario() && !clientesPreventa.has(clienteNumero)) {
          await replyConTyping(msg, mensajeFueraDeHorario());
        } else if (estaEnHorario() && !enFlujoActivo(clienteNumero)) {
          await replyConTyping(msg, MENU_FORMATO());
        }
        return;
      }
    }
  }

  // ── FLUJOS PRINCIPALES (en orden de prioridad) ───────────────────────────────
  if (await handleCancelacionConfirmada(msg, client, textoOriginal, clienteNumero)) return;
  if (await handleMotivoCancelacion(msg, client, textoOriginal, clienteNumero)) return;
  if (await handlePrimerMensaje(msg, textoOriginal, clienteNumero)) return;
  if (await handleFueraDeHorario(msg, textoOriginal, clienteNumero)) return;

  const historial  = getHistorial(clienteNumero);
  const esPreventa = clientesPreventa.has(clienteNumero);

  if (await handleEdicionPendiente(msg, textoOriginal, clienteNumero, historial, esPreventa)) return;
  if (await handleConfirmacionDatos(msg, textoOriginal, clienteNumero, historial, esPreventa)) return;
  if (await handleTipoEntrega(msg, client, textoOriginal, clienteNumero, historial, esPreventa)) {
    if (ordenPendientePreventa.has(clienteNumero)) {
      textoOriginal = ordenPendientePreventa.get(clienteNumero);
      ordenPendientePreventa.delete(clienteNumero);
      // No retornamos — el texto del pedido guardado cae al flujo de órdenes
    } else {
      return;
    }
  }
  if (await handleCancelacionDurantePedido(msg, textoOriginal, clienteNumero)) return;

  const esOrdenDom = tipoEntregaCliente.get(clienteNumero) === "domicilio"
    || (tipoEntregaCliente.get(clienteNumero) == null && historial.some(h => h.content && h.content.includes("domicilio")));

  if (await handleEdicionResumen(msg, textoOriginal, clienteNumero, historial, esPreventa)) return;
  if (await handleCambiosTipoDesdeResumen(msg, textoOriginal, clienteNumero, historial, esPreventa)) return;
  if (await handleCambioMetodoDesdeResumen(msg, textoOriginal, clienteNumero, historial, esPreventa)) return;
  if (await handleAgregarDesdeResumen(msg, textoOriginal, clienteNumero)) return;
  if (await handleConfirmacionFinal(msg, client, textoOriginal, clienteNumero, historial, esPreventa)) return;
  if (await handleCatchAllResumen(msg, clienteNumero)) return;

  if (await handleEsperandoTipoItem(msg, textoOriginal, clienteNumero, historial, esOrdenDom)) return;
  if (await handleEsperandoCorte(msg, textoOriginal, clienteNumero, historial, esOrdenDom)) return;
  if (await handleCambioTipoDuranteTomaPedido(msg, textoOriginal, clienteNumero, historial)) return;
  if (await handleConfirmacionItem(msg, textoOriginal, clienteNumero, historial, esOrdenDom)) return;
  if (await handleExtras(msg, textoOriginal, clienteNumero, historial, esOrdenDom, esPreventa)) return;
  if (await handleAgregarMas(msg, textoOriginal, clienteNumero, historial, esOrdenDom, esPreventa)) return;
  if (await handleCambioTipoDuranteFormulario(msg, textoOriginal, clienteNumero, esPreventa)) return;
  if (await handleFormularioProgresivo(msg, textoOriginal, clienteNumero, historial, esPreventa)) return;
  if (await handleFAQDurantePedido(msg, textoOriginal, clienteNumero, esOrdenDom)) return;
  if (await handleRepetirPedido(msg, textoOriginal, clienteNumero, historial)) return;
  if (await handlePedidoSimple(msg, textoOriginal, clienteNumero, historial)) return;
  if (await handleSinCorte(msg, textoOriginal, clienteNumero)) return;
  if (await handleSinTipo(msg, textoOriginal, clienteNumero)) return;
  if (await handleModificacionAgregarMas(msg, textoOriginal, clienteNumero)) return;
  if (await handlePresupuestoInverso(msg, textoOriginal)) return;

  await handleGroqFallback(msg, textoOriginal, clienteNumero, historial, esPreventa);
}

module.exports = { handleMensaje };
