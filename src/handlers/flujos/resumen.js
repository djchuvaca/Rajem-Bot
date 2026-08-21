// src/handlers/flujos/resumen.js
const {
  resumenPendiente, esperandoCaptura, esperandoEdicion, esperandoAgregarMas,
  esperandoConfirmacionItem, esperandoCorte, datosCampos, tipoEntregaCliente,
  horaEntregaPreventa, pedidoJSONActual, pendientesConfirmacion, clientesNuevos,
  pedidosConfirmados, ordenPreResumen, getHistorial, extraerDatosPedido, persistirEstado,
  detectarEdicion, aplicarEdicion, limpiarTodo, extraerTelefonoDeJID, esperandoPagoMP,
  getMetodosPago, normalizarMetodoPago,
} = require("../../estado");
const { generarResumen, extraerOrdenDeResumen, jsonALineas } = require("../../pedido/resumen");
const { parsearPedidoSimple, detectarSinCorte, detectarModificacion } = require("../pedidoParser");
const {
  upsertCliente, registrarPedido, guardarTelefonoReal,
  guardarJIDReal, guardarUltimoPedido, getCliente, getMensaje, getGrupoId, getNotifDestinoJID, getConfig,
} = require("../../db");
const { DATOS_BANCO, MENU_FORMATO } = require("../../config");
const { getRangoHorario } = require("../../horario");
const mpPagos = require("../../pagos");
const {
  quitarItemDeOrden, validarHora, palabrasConfirmacion,
  replyConTyping, telefonosReales, ultimoPedido, parsearSinCorteItems,
} = require("./utils");
const { getContratoGiroActivo } = require('../../giros');
const trazabilidad = require('../../db/observabilidad');
const { dividirNombreCompleto } = require('../../clientes/nombre');

// ── HELPERS GIRO-AWARE ────────────────────────────────────────────────────────

function _descItem(item) {
  try {
    return require('../../giros').getContratoGiroActivo().conversacion.describirItem(item);
  } catch (_) {}
  return String(item?.presentacion || 'producto');
}

function _preguntaCorte(desc) {
  try {
    return require('../../giros').getContratoGiroActivo().conversacion.preguntarVariante(desc);
  } catch (_) {
    return `¿Qué opción quieres para ${desc}?`;
  }
}

// ── EDICIÓN DESDE RESUMEN PENDIENTE ──────────────────────────────────────────
async function handleEdicionResumen(msg, textoOriginal, clienteNumero, historial, esPreventa) {
  if (!resumenPendiente.has(clienteNumero)) return false;

  if (/^(no|nel|nop|nope|no\s+est[aá]\s+bien|no\s+es\s+correcto|est[aá]\s+mal|hay\s+un\s+error|no\s+es\s+lo\s+que\s+ped[ií]|incorrecto|incompleto|falta\s+algo|no\s+coincide)$/i.test(textoOriginal.trim())) {
    await msg.reply("Entendido! ¿Qué deseas cambiar?\n\n_Por ejemplo: \"cambia la carne por buche\", \"quita los tacos\" o \"cambia el método de pago\"._");
    return true;
  }

  const edicion = detectarEdicion(textoOriginal);
  if (!edicion) {
    const mod = detectarModificacion(textoOriginal);
    if (mod && mod.tipo === 'cambiar_corte') {
      const pendienteActual = resumenPendiente.get(clienteNumero);
      const ordenExtraida   = extraerOrdenDeResumen(pendienteActual.texto);
      const reViejo = new RegExp(`\\b${mod.de}\\b`, 'gi');
      if (!reViejo.test(ordenExtraida)) {
        await msg.reply(`No encontré *${mod.de}* en tu pedido. ¿Cuál corte deseas cambiar?`);
        return true;
      }
      const esOrdenDomMod  = historial.some(h => h.content && h.content.includes("domicilio"));
      const ordenModificada = ordenExtraida.replace(new RegExp(`\\b${mod.de}\\b`, 'gi'), mod.por);
      const resumenNuevo    = generarResumen(clienteNumero, ordenModificada, esOrdenDomMod, esPreventa);
      resumenPendiente.set(clienteNumero, { texto: resumenNuevo.texto, esTransferencia: resumenNuevo.esTransferencia });
      persistirEstado(clienteNumero);
      await msg.reply("Listo! Aquí está tu pedido actualizado:\n\n" + resumenNuevo.texto);
      return true;
    }
    return false;
  }

  const pendienteActual = resumenPendiente.get(clienteNumero);
  const ordenExtraida   = extraerOrdenDeResumen(pendienteActual.texto);
  const esOrdenDomEdit  = historial.some(h => h.content && h.content.includes("domicilio"));

  if (edicion.campo === "quitar_item") {
    const resultado = quitarItemDeOrden(ordenExtraida, textoOriginal);
    if (resultado.exito) {
      const resumenNuevo = generarResumen(clienteNumero, resultado.nuevaOrden, esOrdenDomEdit, esPreventa);
      resumenPendiente.set(clienteNumero, { texto: resumenNuevo.texto, esTransferencia: resumenNuevo.esTransferencia });
      persistirEstado(clienteNumero);
      await msg.reply("Listo! Aquí está tu pedido actualizado:\n\n" + resumenNuevo.texto);
    } else if (resultado.razon === "ambiguo") {
      await msg.reply(`Tengo varios productos similares. ¿Cuál deseas quitar?\n\n${resultado.opciones}\n\nEscríbeme cuál exactamente.`);
    } else if (resultado.razon === "quedaria_vacio") {
      await msg.reply("No puedo quitar ese producto porque quedaría tu pedido vacío. *¿Deseas cancelar el pedido o cambiarlo?*");
    } else if (resultado.razon === "solo_un_item") {
      await msg.reply("Solo tienes un producto en tu pedido. Si deseas cancelarlo escribe *cancelar*.");
    } else {
      await msg.reply("No encontré ese producto en tu pedido. *¿Qué deseas quitar?*");
    }
    return true;
  }

  if (edicion.campo === "metodo" && edicion.preguntar) {
    const pregMetodo = `*¿Cómo vas a pagar?* ${getMetodosPago(esOrdenDomEdit).texto}.`;
    esperandoEdicion.set(clienteNumero, { campo: "metodo", contexto: "resumen", ordenTexto: ordenExtraida });
    await msg.reply(pregMetodo);
    return true;
  }

  if (edicion.campo === "metodo" && !edicion.preguntar) {
    const metodoValido = normalizarMetodoPago(edicion.valor, esOrdenDomEdit);
    if (!metodoValido) {
      await msg.reply(`Ese método no está habilitado. *¿Cuál prefieres?* ${getMetodosPago(esOrdenDomEdit).texto}.`);
      esperandoEdicion.set(clienteNumero, { campo: "metodo", contexto: "resumen", ordenTexto: ordenExtraida });
      return true;
    }
    edicion.valor = metodoValido;
    aplicarEdicion(clienteNumero, edicion);
    const resumenNuevo = generarResumen(clienteNumero, ordenExtraida, esOrdenDomEdit, esPreventa);
    resumenPendiente.set(clienteNumero, { texto: resumenNuevo.texto, esTransferencia: resumenNuevo.esTransferencia });
    persistirEstado(clienteNumero);
    await msg.reply("Perfecto! Aquí está tu pedido actualizado:\n\n" + resumenNuevo.texto);
    return true;
  }

  if (edicion.campo === "hora" && !edicion.preguntar) {
    const horaValida = validarHora(edicion.valor);
    if (!horaValida) {
      await msg.reply(`Esa hora está fuera de nuestro horario. *¿A qué hora deseas tu pedido?* (entre ${getRangoHorario()})`);
      esperandoEdicion.set(clienteNumero, { campo: "hora", contexto: "resumen", ordenTexto: ordenExtraida });
      return true;
    }
    edicion.valor = horaValida;
    aplicarEdicion(clienteNumero, edicion);
    horaEntregaPreventa.set(clienteNumero, horaValida);
    const resumenNuevo = generarResumen(clienteNumero, ordenExtraida, esOrdenDomEdit, esPreventa);
    resumenPendiente.set(clienteNumero, { texto: resumenNuevo.texto, esTransferencia: resumenNuevo.esTransferencia });
    persistirEstado(clienteNumero);
    await msg.reply("Perfecto! Aquí está tu pedido actualizado:\n\n" + resumenNuevo.texto);
    return true;
  }

  if (edicion.preguntar) {
    esperandoEdicion.set(clienteNumero, { campo: edicion.campo, contexto: "resumen", ordenTexto: ordenExtraida });
    await msg.reply(edicion.pregunta);
    return true;
  }

  aplicarEdicion(clienteNumero, edicion);
  const resumenNuevo = generarResumen(clienteNumero, ordenExtraida, esOrdenDomEdit, esPreventa);
  resumenPendiente.set(clienteNumero, { texto: resumenNuevo.texto, esTransferencia: resumenNuevo.esTransferencia });
  persistirEstado(clienteNumero);
  await msg.reply("Perfecto! Aquí está tu pedido actualizado:\n\n" + resumenNuevo.texto);
  return true;
}

// ── CAMBIO A DOMICILIO / MOSTRADOR DESDE RESUMEN ─────────────────────────────
async function handleCambiosTipoDesdeResumen(msg, textoOriginal, clienteNumero, historial, esPreventa) {
  if (!resumenPendiente.has(clienteNumero)) return false;

  const esCambioDomicilio = /cambi(a|ar|ame|amelo|arme)\s*(a|al|para)\s*domicilio/i.test(textoOriginal)
    || /mejor\s*(a\s*)?domicilio/i.test(textoOriginal)
    || /que\s+sea\s+(a\s+)?domicilio/i.test(textoOriginal)
    || /para\s+domicilio/i.test(textoOriginal)
    || /a\s+domicilio/i.test(textoOriginal)
    || /mejor\s*(que\s*)?(me\s*)?(lo\s*)?(env[íi]a|manda|lleva|trae)(melo|me|lo)?/i.test(textoOriginal)
    || /^(env[íi]amelo|mandamelo|traemelo|llevamelo)$/i.test(textoOriginal.trim());
  const esCambioMostrador = /cambi(a|ar|ame|amelo|arme)\s*(a|al|para|el)?\s*mostrador/i.test(textoOriginal)
    || /mejor\s*(al?\s*)?mostrador/i.test(textoOriginal)
    || /mejor\s*(lo\s*)?(recojo|voy|paso)/i.test(textoOriginal)
    || /que\s+sea\s+(en\s+)?mostrador/i.test(textoOriginal)
    || /para\s+mostrador/i.test(textoOriginal)
    || /que\s+sea\s+a\s+mostrador/i.test(textoOriginal)
    || /voy\s*(a\s*)?(pasar|recoger)/i.test(textoOriginal)
    || /paso\s*(yo\s*)?(a\s*recoger)?/i.test(textoOriginal)
    || /yo\s*(voy|paso)\s*(a\s*)?(recoger)?/i.test(textoOriginal);

  if (!esCambioDomicilio && !esCambioMostrador) return false;

  const pendienteActual = resumenPendiente.get(clienteNumero);
  const ordenExtraida   = extraerOrdenDeResumen(pendienteActual.texto);

  if (esCambioDomicilio) {
    const idxTipo = historial.findIndex(h => h.content && (h.content.includes("domicilio") || h.content.includes("mostrador")));
    if (idxTipo !== -1) historial[idxTipo].content = "Mi pedido es a domicilio.";
    const camposDom = datosCampos.get(clienteNumero) || {};
    if (!camposDom.calle || !camposDom.colonia) {
      const telDom = camposDom.telefono || null;
      if (telDom) {
        const clienteBDDom = getCliente(telDom);
        if (clienteBDDom) {
          if (!camposDom.calle)      camposDom.calle      = clienteBDDom.calle_numero || null;
          if (!camposDom.colonia)    camposDom.colonia    = clienteBDDom.colonia      || null;
          if (!camposDom.referencia) camposDom.referencia = clienteBDDom.referencia   || null;
          datosCampos.set(clienteNumero, camposDom);
        }
      }
    }
    camposDom.tipoEntrega = "domicilio";
    datosCampos.set(clienteNumero, camposDom);
    tipoEntregaCliente.set(clienteNumero, "domicilio");
    if (camposDom.calle && camposDom.colonia) {
      const resumenNuevo = generarResumen(clienteNumero, ordenExtraida, true, esPreventa);
      resumenPendiente.set(clienteNumero, { texto: resumenNuevo.texto, esTransferencia: resumenNuevo.esTransferencia });
      persistirEstado(clienteNumero);
      await msg.reply("Perfecto! Cambié tu pedido a domicilio.\n\n" + resumenNuevo.texto);
    } else {
      resumenPendiente.delete(clienteNumero);
      if (ordenExtraida) ordenPreResumen.set(clienteNumero, ordenExtraida);
      tipoEntregaCliente.set(clienteNumero, "domicilio");
      persistirEstado(clienteNumero);
      await msg.reply("Perfecto! Para cambiar a domicilio necesito tu dirección.\n*¿Cuál es tu calle y número?*");
    }
    return true;
  }

  // Cambio a mostrador
  const idxTipo = historial.findIndex(h => h.content && (h.content.includes("domicilio") || h.content.includes("mostrador")));
  if (idxTipo !== -1) historial[idxTipo].content = "Mi pedido es para recoger en mostrador.";
  const campos = datosCampos.get(clienteNumero) || {};
  campos.calle = null; campos.colonia = null; campos.referencia = null;
  campos.tipoEntrega = "mostrador";
  datosCampos.set(clienteNumero, campos);
  tipoEntregaCliente.set(clienteNumero, "mostrador");
  resumenPendiente.delete(clienteNumero);
  if (ordenExtraida) {
    const resumenNuevo = generarResumen(clienteNumero, ordenExtraida, false, esPreventa);
    resumenPendiente.set(clienteNumero, { texto: resumenNuevo.texto, esTransferencia: resumenNuevo.esTransferencia });
    persistirEstado(clienteNumero);
    await msg.reply("Perfecto! Cambié tu pedido a mostrador.\n\n" + resumenNuevo.texto);
  }
  return true;
}

// ── CAMBIO DE MÉTODO DESDE RESUMEN ───────────────────────────────────────────
async function handleCambioMetodoDesdeResumen(msg, textoOriginal, clienteNumero, historial, esPreventa) {
  if (!resumenPendiente.has(clienteNumero)) return false;
  if (!/transferencia|efectivo|tarjeta/i.test(textoOriginal)) return false;

  const esCambio = /cambiar|cambio|mejor|voy\s+a\s+pagar|quiero\s+pagar|pagar\s+con|con\s+(efectivo|tarjeta|transferencia)/i.test(textoOriginal)
    || /^(efectivo|tarjeta|transferencia)$/i.test(textoOriginal.trim());
  if (!esCambio) return false;

  const campos        = datosCampos.get(clienteNumero) || {};
  const esOrdenDomMet = tipoEntregaCliente.get(clienteNumero) === "domicilio";
  const nuevoMetodo = normalizarMetodoPago(textoOriginal, esOrdenDomMet);
  if (!nuevoMetodo) {
    await msg.reply(`Ese método no está disponible. *¿Cuál prefieres?* ${getMetodosPago(esOrdenDomMet).texto}.`);
    return true;
  }
  campos.metodo = nuevoMetodo;
  datosCampos.set(clienteNumero, campos);

  const pendienteActual = resumenPendiente.get(clienteNumero);
  const ordenExtraida   = extraerOrdenDeResumen(pendienteActual.texto);
  resumenPendiente.delete(clienteNumero);
  if (ordenExtraida) {
    const esOrdenDomAux = tipoEntregaCliente.get(clienteNumero) === "domicilio"
      || (tipoEntregaCliente.get(clienteNumero) == null && historial.some(h => h.content && h.content.includes("domicilio")));
    const resumenNuevo = generarResumen(clienteNumero, ordenExtraida, esOrdenDomAux, esPreventa);
    resumenPendiente.set(clienteNumero, { texto: resumenNuevo.texto, esTransferencia: resumenNuevo.esTransferencia });
    persistirEstado(clienteNumero);
    await msg.reply(resumenNuevo.texto);
  }
  return true;
}

// ── AGREGAR DESDE RESUMEN ─────────────────────────────────────────────────────
// Retorna false cuando borra resumenPendiente y setea esperandoAgregarMas sin poder parsear el pedido
// para que el router continúe al bloque de esperandoAgregarMas.
async function handleAgregarDesdeResumen(msg, textoOriginal, clienteNumero) {
  if (!resumenPendiente.has(clienteNumero)) return false;

  const esPalabraAgregar = /agrega(me|r|nos)?|agra[gq]a|añade|también\s+quiero|y\s+también|y\s+además|suma(me)?|ponme\s+(también|además)|quiero\s+también|también\s+dame|y\s+dame/i.test(textoOriginal);
  const esNoConContenido = /^no[,\s]/i.test(textoOriginal.trim());
  const esNoSimple       = /^(no|nel|nop|nope|nah|negativo)$/i.test(textoOriginal.trim());

  if (esNoSimple) {
    resumenPendiente.delete(clienteNumero);
    await msg.reply("Entendido! *¿Qué deseas ordenar?*");
    await new Promise(r => setTimeout(r, 300));
    await msg.reply(MENU_FORMATO());
    return true;
  }

  if (esPalabraAgregar) {
    const pendienteActual = resumenPendiente.get(clienteNumero);
    const ordenExtraida   = extraerOrdenDeResumen(pendienteActual.texto);
    const jsonNuevo = parsearPedidoSimple(textoOriginal);
    if (jsonNuevo && jsonNuevo.tipo === "pedido" && Array.isArray(jsonNuevo.items) && jsonNuevo.items.length > 0) {
      const resultadoNuevo = jsonALineas(jsonNuevo);
      pedidoJSONActual.set(clienteNumero, { _esModificacionResumen: true, ordenBase: ordenExtraida, jsonNuevo });
      esperandoConfirmacionItem.set(clienteNumero, { lineas: resultadoNuevo.texto, _esModificacionResumen: true, ordenBase: ordenExtraida, jsonNuevo });
      resumenPendiente.delete(clienteNumero);
      persistirEstado(clienteNumero);
      await msg.reply(resultadoNuevo.texto + "\n\n*¿Agrego esto a tu pedido?*");
      return true;
    }
    const pedidoParcial = parsearSinCorteItems(textoOriginal);
    if (pedidoParcial && detectarSinCorte(textoOriginal)) {
      pedidoParcial._indiceActual = 0;
      pedidoParcial._ordenBase = ordenExtraida;
      pedidoParcial._esModificacionResumen = true;
      esperandoCorte.set(clienteNumero, pedidoParcial);
      resumenPendiente.delete(clienteNumero);
      const primerItem = pedidoParcial.items[0];
      const desc = _descItem(primerItem);
      await msg.reply(`*${_preguntaCorte(desc)}*\nTenemos: ${getContratoGiroActivo().listaVariantes()}`);
      return true;
    }
    resumenPendiente.delete(clienteNumero);
    if (ordenExtraida) esperandoAgregarMas.set(clienteNumero, ordenExtraida);
    persistirEstado(clienteNumero);
    await msg.reply("*¿Qué más deseas agregar?*\n\n" + MENU_FORMATO());
    return true;
  }

  if (esNoConContenido) {
    const pendienteActual = resumenPendiente.get(clienteNumero);
    const ordenExtraida   = extraerOrdenDeResumen(pendienteActual.texto);
    const pedidoParcial = parsearSinCorteItems(textoOriginal);
    if (pedidoParcial && detectarSinCorte(textoOriginal)) {
      pedidoParcial._indiceActual = 0;
      pedidoParcial._ordenBase = ordenExtraida;
      pedidoParcial._esModificacionResumen = true;
      esperandoCorte.set(clienteNumero, pedidoParcial);
      resumenPendiente.delete(clienteNumero);
      const primerItem = pedidoParcial.items[0];
      const desc = _descItem(primerItem);
      await msg.reply(`*${_preguntaCorte(desc)}*\nTenemos: ${getContratoGiroActivo().listaVariantes()}`);
      return true;
    }
    resumenPendiente.delete(clienteNumero);
    if (ordenExtraida) esperandoAgregarMas.set(clienteNumero, ordenExtraida);
    persistirEstado(clienteNumero);
    await msg.reply("*¿Qué más deseas agregar?*\n\n" + MENU_FORMATO());
    return true;
  }

  return false;
}

// ── CONFIRMACIÓN FINAL DEL PEDIDO ─────────────────────────────────────────────
async function handleConfirmacionFinal(msg, client, textoOriginal, clienteNumero, historial, esPreventa) {
  if (!resumenPendiente.has(clienteNumero)) return false;
  if (!palabrasConfirmacion.test(textoOriginal.trim())) return false;

  const pendiente  = resumenPendiente.get(clienteNumero);
  const horaVenta  = new Date().toLocaleTimeString("es-MX", { hour: "2-digit", minute: "2-digit" });
  const infoPedido = extraerDatosPedido(pendiente.texto);
  // Declarado aquí para que sea accesible en el bloque fallback de transferencia
  // si MP falla tras haber registrado el pedido (evita duplicados en BD).
  let pedidoMpId = null;

  if (pendiente.esTransferencia && mpPagos.estaConfigurado()) {
    // ── Pago en línea con MercadoPago ────────────────────────────────────────
    try {
      const telefonoLimpio = infoPedido.telefono || extraerTelefonoDeJID(clienteNumero);
      const { nombre, apellido } = dividirNombreCompleto(infoPedido.nombre);
      const camposCliente = datosCampos.get(clienteNumero) || {};
      const cliente = upsertCliente({
        nombre, apellido, telefono: telefonoLimpio,
        calle_numero: camposCliente.calle    || null,
        colonia:      camposCliente.colonia  || null,
        referencia:   (camposCliente.referencia && camposCliente.referencia !== "sin referencia") ? camposCliente.referencia : null,
      });
      const total       = parseFloat((infoPedido.total || "0").replace(/[^0-9.]/g, "")) || 0;
      const hora_entrega = esPreventa ? (horaEntregaPreventa.get(clienteNumero) || null) : null;
      pedidoMpId = registrarPedido({
        cliente_id: cliente ? cliente.id : null,
        tipo:        infoPedido.tipo || "mostrador",
        orden:       (pendiente.texto || "").substring(0, 500),
        total, metodo_pago: "transferencia", estado: "pendiente", hora_entrega,
        cotizacion_envio_id: camposCliente._cotizacionEnvio?.id,
        tarifa_envio: camposCliente._cotizacionEnvio?.tarifa,
        tarifa_envio_detalle: camposCliente._cotizacionEnvio,
      });
      if (pedidoMpId) trazabilidad.vincularPedido(clienteNumero, pedidoMpId);
      if (infoPedido.telefono) {
        telefonosReales.set(clienteNumero, infoPedido.telefono);
        try { guardarTelefonoReal(clienteNumero, infoPedido.telefono); } catch (_) {}
        try { guardarJIDReal(infoPedido.telefono, clienteNumero); } catch (_) {}
      }
    } catch (e) {
      console.error("[MP] Error al guardar pedido:", e.message);
      trazabilidad.crearAlerta(clienteNumero, 'error_registro_pedido', 'No se pudo registrar el pedido', e.message, { severidad: 'critica' });
    }

    if (pedidoMpId) {
      try {
        const { getConfig } = require("../../db");
        const total  = parseFloat((infoPedido.total || "0").replace(/[^0-9.]/g, "")) || 0;
        const enlace = await mpPagos.crearEnlacePago({
          pedidoId: pedidoMpId,
          total,
          negocio:  getConfig("nombre_negocio"),
          jid:      clienteNumero,
          telefono: infoPedido.telefono,
          resumen:  pendiente.texto,
          nombre:   infoPedido.nombre,
        });
        resumenPendiente.delete(clienteNumero);
        limpiarTodo(clienteNumero);
        clientesNuevos.delete(clienteNumero);
        esperandoPagoMP.set(clienteNumero, {
          pedidoId: pedidoMpId,
          telefono: infoPedido.telefono,
          nombre:   infoPedido.nombre,
          expiraEn: Date.now() + 30 * 60 * 1000,
        });
        await msg.reply(
          `✅ ¡Pedido recibido! Para confirmar tu lugar, realiza el pago aquí:\n\n` +
          `💳 ${enlace}\n\n` +
          `_Tienes 30 minutos. En cuanto se confirme el pago, te avisamos de inmediato 🙏_`
        );
        return true;
      } catch (e) {
        console.error("[MP] Error al crear enlace de pago:", e.message);
        trazabilidad.crearAlerta(clienteNumero, 'error_enlace_pago', 'Falló la creación del enlace de pago', e.message, { severidad: 'alta', pedidoId: pedidoMpId });
        // Fallback a transferencia tradicional si MP falla
      }
    }
  }

  if (pendiente.esTransferencia) {
    // Transferencia tradicional (MP no configurado o falló).
    // Si registrarPedido ya tuvo éxito en el bloque MP, pasamos el ID para
    // que imagenes.js no vuelva a registrar el mismo pedido (duplicado).
    const _pedidoMpId = typeof pedidoMpId !== "undefined" ? pedidoMpId : null;
    esperandoCaptura.set(clienteNumero, { resumen: pendiente.texto, telefono: infoPedido.telefono, pedidoId: _pedidoMpId });
    resumenPendiente.delete(clienteNumero);
    persistirEstado(clienteNumero);
    await msg.reply(DATOS_BANCO());
    return true;
  }

  // ── 1. Guardar en BD antes de confirmar ────────────────────────────────────
  let dbError = false;
  let pedidoId = null;
  let _coloniaNoVerif = false;
  let _coloniaTxt = '';
  let _fueraDeCobertura = false;
  let _requiereVerifGeo = false;
  try {
    const telefonoLimpio = infoPedido.telefono || extraerTelefonoDeJID(clienteNumero);
    const { nombre, apellido } = dividirNombreCompleto(infoPedido.nombre);
    const camposCliente = datosCampos.get(clienteNumero) || {};
    _coloniaNoVerif = !!camposCliente._coloniaNoVerificada;
    _coloniaTxt     = camposCliente.colonia || '';
    if (infoPedido.tipo === 'domicilio' && _coloniaTxt && !_coloniaNoVerif) {
      try {
        const { calcularTarifaDomicilio } = require('../../geo');
        const gi = calcularTarifaDomicilio(_coloniaTxt);
        _fueraDeCobertura = !!gi.fueraDeCobertura;
        _requiereVerifGeo = !!gi.requiereVerificacion;
      } catch (_) {}
    }
    const calle_numero  = camposCliente.calle || null;
    const colonia       = camposCliente.colonia || null;
    const referencia    = (camposCliente.referencia && camposCliente.referencia !== "sin referencia") ? camposCliente.referencia : null;
    const hora_entrega  = esPreventa ? (camposCliente.hora || horaEntregaPreventa.get(clienteNumero) || null) : null;
    const total         = parseFloat((infoPedido.total || "0").replace(/[^0-9.]/g, "")) || 0;
    const metodo_pago   = camposCliente.metodo || "efectivo";
    const cliente = upsertCliente({ nombre, apellido, telefono: telefonoLimpio, calle_numero, colonia, referencia });
    pedidoId = registrarPedido({
      cliente_id: cliente ? cliente.id : null,
      tipo:       infoPedido.tipo || "mostrador",
      orden:      (pendiente.texto || "").substring(0, 500),
      total, metodo_pago, estado: "pendiente", hora_entrega,
      cotizacion_envio_id: camposCliente._cotizacionEnvio?.id,
      tarifa_envio: camposCliente._cotizacionEnvio?.tarifa,
      tarifa_envio_detalle: camposCliente._cotizacionEnvio,
    });
    if (pedidoId) trazabilidad.vincularPedido(clienteNumero, pedidoId);
    console.log(`BD: Pedido #${pedidoId} registrado para ${telefonoLimpio}`);
    if (infoPedido.telefono) {
      telefonosReales.set(clienteNumero, infoPedido.telefono);
      try { guardarTelefonoReal(clienteNumero, infoPedido.telefono); } catch (_) {}
      try { guardarJIDReal(infoPedido.telefono, clienteNumero); } catch (_) {}
    }
  } catch (e) {
    console.error("[BD] Error al guardar pedido:", e.message || e);
    trazabilidad.crearAlerta(clienteNumero, 'error_registro_pedido', 'No se pudo registrar el pedido', e.message || String(e), { severidad: 'critica' });
    dbError = true;
  }

  if (dbError) {
    await msg.reply("Hubo un error al registrar tu pedido en el sistema. Por favor comunícate con nosotros directamente para confirmar tu orden. 🙏");
    return true;
  }

  if (_coloniaNoVerif && _coloniaTxt) {
    trazabilidad.crearAlerta(clienteNumero, 'colonia_no_verificada', 'Colonia sin verificar', `El cliente indicó: ${_coloniaTxt}`, { severidad: 'alta', pedidoId });
  }
  if (_fueraDeCobertura) {
    trazabilidad.crearAlerta(clienteNumero, 'pedido_fuera_cobertura', 'Pedido fuera de zona de cobertura', `Colonia: ${_coloniaTxt}`, { severidad: 'alta', pedidoId });
  }
  if (_requiereVerifGeo) {
    trazabilidad.crearAlerta(clienteNumero, 'colonia_sin_verificar', 'Tarifa de envío aproximada', `Colonia "${_coloniaTxt}" sin coordenadas verificadas`, { severidad: 'media', pedidoId });
  }

  // Aviso inmediato al tenant. Mandaditos comienza únicamente después de que
  // el tenant ejecute !confirmar; este aviso nunca inicia el reloj de despacho.
  const notifJID = getNotifDestinoJID();
  if (notifJID) {
    try {
      await client.sendMessage(notifJID, `🆕 Pedido #${pedidoId}\nHora: ${horaVenta}\n\n${pendiente.texto}\n\nUsa: !confirmar ${infoPedido.telefono}\n!listo ${infoPedido.telefono}\n!en_camino ${pedidoId}`);
    } catch (e) { console.error("Error al notificar pedido:", e.message); }
    if (_coloniaNoVerif && _coloniaTxt) {
      try {
        await client.sendMessage(notifJID, `⚠️ *Pedido #${pedidoId} — colonia sin verificar*\nEl cliente indicó: "${_coloniaTxt}" pero no coincide con ninguna colonia registrada.\nConfirma la dirección y ajusta la tarifa de envío antes de salir.`);
      } catch (e) { console.error("Error al notificar colonia no verificada:", e.message); }
    }
    if (_fueraDeCobertura) {
      try {
        await client.sendMessage(notifJID, `⚠️ *Pedido #${pedidoId} — fuera de zona de cobertura*\nColonia: "${_coloniaTxt}" supera la distancia máxima configurada.\nVerifica si puedes realizar la entrega antes de confirmar.`);
      } catch (e) { console.error("Error al notificar fuera de cobertura:", e.message); }
    }
    if (_requiereVerifGeo) {
      try {
        await client.sendMessage(notifJID, `⚠️ *Pedido #${pedidoId} — tarifa de envío aproximada*\nLa colonia "${_coloniaTxt}" no tiene coordenadas verificadas.\nAjusta la tarifa si es necesario antes de confirmar.`);
      } catch (e) { console.error("Error al notificar tarifa aproximada:", e.message); }
    }
  }

  pedidosConfirmados.set(clienteNumero, {
    nombre: infoPedido.nombre, telefono: infoPedido.telefono,
    total: infoPedido.total, resumen: pendiente.texto, confirmadoEn: Date.now(),
  });

  const jsonUltimo = pedidoJSONActual.get(clienteNumero);
  if (jsonUltimo) {
    ultimoPedido.set(clienteNumero, jsonUltimo);
    const telUltimo = telefonosReales.get(clienteNumero) || infoPedido.telefono;
    if (telUltimo) try { guardarUltimoPedido(telUltimo, jsonUltimo); } catch (_) {}
  }

  clientesNuevos.delete(clienteNumero);
  limpiarTodo(clienteNumero);
  clientesNuevos.add(clienteNumero);
  // Después de limpiarTodo para que persista y !confirmar (sin tel) pueda encontrarlo
  pendientesConfirmacion.set(clienteNumero, { ...infoPedido, resumen: pendiente.texto, hora: horaVenta });
  persistirEstado(clienteNumero);
  const msgConfirmacion = (getMensaje("confirmacion_pedido") || "¡Listo! Tu pedido fue recibido y está en espera de confirmación de nuestro equipo.\nEn breve te avisamos. ¡Gracias por tu preferencia! 🙏\n\n_Si deseas cancelar tu pedido escribe *cancelar*._").replace(/{negocio}/g, getConfig("nombre_negocio") || "el negocio");
  await msg.reply(msgConfirmacion + (pedidoId ? `\n\n_📋 Pedido #${pedidoId}_` : ""));
  return true;
}

// ── CATCH-ALL RESUMEN PENDIENTE ───────────────────────────────────────────────
async function handleCatchAllResumen(msg, clienteNumero) {
  if (!resumenPendiente.has(clienteNumero)) return false;
  const pendiente = resumenPendiente.get(clienteNumero);
  await replyConTyping(msg, "Tienes un pedido pendiente de confirmar 👇\n\n" + pendiente.texto);
  return true;
}

module.exports = {
  handleEdicionResumen,
  handleCambiosTipoDesdeResumen,
  handleCambioMetodoDesdeResumen,
  handleAgregarDesdeResumen,
  handleConfirmacionFinal,
  handleCatchAllResumen,
};
