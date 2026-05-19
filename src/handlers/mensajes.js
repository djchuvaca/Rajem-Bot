const Groq = require("groq-sdk");
const { detectarTipoEntrega } = require("./entrega");
const { buildPrompt } = require("../prompts/index");
const { calcularSubtotal } = require("../pedido/precios");
const { parsearPedidoSimple, detectarSinCorte, detectarPreguntaFrecuente, detectarModificacion } = require("./pedidoParser");
const { generarRespuestaAutomatica, aplicarModificacion } = require("./respuestas");
const {
  formatearHora, jsonALineas,
  extraerOrdenDeResumen, formatearListaAcumulada, generarResumen,
} = require("../pedido/resumen");
const {
  DATOS_BANCO, MENU_FORMATO,
  FORM_MOSTRADOR, FORM_DOMICILIO,
  FORM_PREVENTA_MOSTRADOR, FORM_PREVENTA_DOMICILIO,
  SALUDO
} = require("../config");
const { estaEnHorario, mensajeFueraDeHorario } = require("../horario");
const {
  clientesPreventa,
  horaEntregaPreventa,
  esperandoMotivoCancelacion,
  pedidosConfirmados,
  clientesNuevos,
  resumenPendiente,
  esperandoCaptura,
  datosRecibidos,
  pendientesConfirmacion,
  getHistorial,
  limpiarTodo,
  acumularDatos,
  interpretarCampos,
  mostrarFormularioProgresivo,
  siguienteCampoFaltante,
  manejarOpcional,
  camposCompletos,
  camposATexto,
  datosCampos,
  esperandoConfirmacionItem,
  esperandoAgregarMas,
  pedidoJSONActual,
  correoPreguntas,
  referenciaPreguntas,
  datosCompletos,
  pareceFragmentoDatos,
  extraerDatosPedido,
  persistirEstado,
  esperandoConfirmacionDatos,
  tipoEntregaCliente,
  esperandoCorte,
  esperandoEdicion,
  detectarEdicion,
  aplicarEdicion,
} = require("../estado");

const groq = new Groq({ apiKey: process.env.GROQ_API_KEY });
const { upsertCliente, registrarPedido, actualizarEstadoPedido, getCliente, guardarTelefonoReal, getTelefonoReal } = require("../db");

// Clientes frecuentes
const telefonosReales = new Map();

function enFlujoActivo(clienteNumero) {
  return esperandoCorte.has(clienteNumero)
    || esperandoConfirmacionItem.has(clienteNumero)
    || esperandoAgregarMas.has(clienteNumero)
    || datosRecibidos.has(clienteNumero)
    || resumenPendiente.has(clienteNumero)
    || esperandoEdicion.has(clienteNumero)
    || esperandoConfirmacionDatos.has(clienteNumero);
}

async function replyConTyping(msg, texto) {
  try {
    const chat = await msg.getChat();
    const ms = Math.min(800 + texto.length * 12, 3500) + Math.floor(Math.random() * 400);
    await chat.sendStateTyping();
    await new Promise(r => setTimeout(r, ms));
    await chat.clearState();
  } catch (_) {}
  await msg.reply(texto);
}

// â”€â”€ PARSER SIN CORTE â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€
function parsearSinCorteItems(texto) {
  const MEDIDAS_ITEMS = [
    { re: /\bun\s+cuarto\b|\b1\/4\b|\b250\s*g/i,           gramos: 250  },
    { re: /\bmedio\s+kilo\b|\bmedio\b|\b1\/2\b|\b500\s*g/i, gramos: 500  },
    { re: /\btres\s+cuartos\b|\b3\/4\b|\b750\s*g/i,        gramos: 750  },
    { re: /\bun\s+kilo\b|\b1\s*kg\b|\b1000\s*g/i,          gramos: 1000 },
  ];
  const partes = texto.split(/\s+y\s+(?=\d|\bun\b|\bmedio\b|\btres\b|\b1\/)/i).map(p => p.trim()).filter(Boolean);
  const items = [];
  for (const parte of partes) {
    const tp = parte.trim().toLowerCase().normalize("NFD").replace(/[\u0300-\u036f]/g, "");
    const matchCorte = parte.match(/(?:de\s*|\b)(surtido|carne|carner|masiza|maciza|buche|cuero|cueros|lengua)\b/i);
    const corte = matchCorte ? { surtido:"surtido", carne:"carne", carner:"carne", masiza:"carne", maciza:"carne", buche:"buche", cuero:"cuero", cueros:"cuero", lengua:"lengua" }[matchCorte[1].toLowerCase()] : null;
    const matchPieza = tp.match(/\b(\d+)\s+(tacos?|tortas?)\b/);
    if (matchPieza) { items.push({ presentacion: /taco/i.test(matchPieza[2]) ? "taco" : "torta", cantidad: parseInt(matchPieza[1]), corte }); continue; }
    let encontroMedida = false;
    for (const medida of MEDIDAS_ITEMS) {
      if (medida.re.test(tp)) { items.push({ presentacion: "gramos", gramos: medida.gramos, corte }); encontroMedida = true; break; }
    }
    if (encontroMedida) continue;
    const matchGramos = tp.match(/\b(\d+)\s*g(?:ramos?)?\b/);
    if (matchGramos) { items.push({ presentacion: "gramos", gramos: parseInt(matchGramos[1]), corte }); continue; }
    const matchMonto = tp.match(/\b(\d+)\b/);
    if (matchMonto && parseInt(matchMonto[1]) > 100) { items.push({ presentacion: "pesos", monto: parseInt(matchMonto[1]), corte }); continue; }
  }
  return items.length > 0 ? { tipo: "pedido", items } : null;
}

function quitarItemDeOrden(ordenTexto, textoCliente) {
  const lineas = ordenTexto.split("\n").filter(l => l.trim() && !/subtotal/i.test(l));
  if (lineas.length <= 1) return { exito: false, razon: "solo_un_item" };

  const t = textoCliente.toLowerCase().normalize("NFD").replace(/[\u0300-\u036f]/g, "");
  const esTaco   = /taco/i.test(t);
  const esTorta  = /torta/i.test(t);
  const esGramos = /gramo|kilo|cuarto|medio|\bg\b/i.test(t);
  const numMatch = t.match(/\b(\d+)\b/);
  const cantidadMencionada = numMatch ? parseInt(numMatch[1]) : null;

  const lineasAQuitar = lineas.filter(l => {
    const lNorm = l.toLowerCase().normalize("NFD").replace(/[\u0300-\u036f]/g, "");
    if (esTaco && /taco/.test(lNorm)) {
      if (cantidadMencionada) return lNorm.includes(`${cantidadMencionada} taco`);
      return true;
    }
    if (esTorta && /torta/.test(lNorm)) {
      if (cantidadMencionada) return lNorm.includes(`${cantidadMencionada} torta`);
      return true;
    }
    if (esGramos && /g carnitas|gramos/.test(lNorm)) return true;
    return false;
  });

  if (lineasAQuitar.length > 1) {
    const opciones = lineasAQuitar.map(l => l.trim()).join("\n");
    return { exito: false, razon: "ambiguo", opciones };
  }
  if (lineasAQuitar.length === 0) return { exito: false, razon: "no_encontrado" };

  const lineasRestantes = lineas.filter(l => !lineasAQuitar.includes(l));
  if (lineasRestantes.length === 0) return { exito: false, razon: "quedaria_vacio" };

  return { exito: true, nuevaOrden: lineasRestantes.join("\n") };
}

function validarHora(texto) {
  const m = texto.match(/(\d{1,2})(?::(\d{2}))?\s*(am|pm|a\.m\.|p\.m\.)?/i);
  if (!m) return null;
  let h = parseInt(m[1]);
  const min = parseInt(m[2] || "0");
  const pm = /pm/i.test(texto);
  const am = /am/i.test(texto);
  if (pm && h < 12) h += 12;
  const dec = h + min / 60;
  if (dec < 7 || dec > 12.5) return null;
  const sufijo = (pm || h >= 12) ? "p.m." : "a.m.";
  const minStr = min > 0 ? `:${String(min).padStart(2, "0")}` : ":00";
  return `${h > 12 ? h - 12 : h}${minStr} ${sufijo}`;
}

async function handleMensaje(msg, client) {
  const clienteNumero = msg.from;
  // Deshabilitar link previews en todas las respuestas de este handler
  const _origReply = msg.reply.bind(msg);
  msg.reply = (content, chatId, opts = {}) => _origReply(content, chatId, { linkPreview: false, ...opts });

  // â”€â”€ ESPERANDO CAPTURA â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€
  if (esperandoCaptura.has(clienteNumero) && !msg.hasMedia) {
    if (msg.body && msg.body.trim().length > 0) {
      const textoCap = msg.body.trim();
      if (/cancelar|cancela|cancel|cancelo|cancelame|cancelado|ya no quiero|ya no/i.test(textoCap)) {
        const datosCaptura = esperandoCaptura.get(clienteNumero);
        esperandoCaptura.delete(clienteNumero);
        limpiarTodo(clienteNumero);
        clientesNuevos.delete(clienteNumero);
        const grupoId = process.env.GRUPO_ID;
        if (grupoId) {
          const horaCancel = new Date().toLocaleTimeString("es-MX", { hour: "2-digit", minute: "2-digit" });
          try {
            await client.sendMessage(grupoId,
              `Solicitud de Cancelacion\nHora: ${horaCancel}\nCliente: (cancelÃ³ antes de enviar captura)\nTelefono: ${datosCaptura?.telefono || "â€”"}\nMotivo: CancelÃ³ durante espera de transferencia`
            );
          } catch (e) { console.error("Error notificando cancelacion:", e.message); }
        }
        await msg.reply("Tu pedido ha sido cancelado. Cuando gustes ordenar, aqui estaremos. Hasta pronto!");
        return;
      }
      const _pregFaqCap = detectarPreguntaFrecuente(textoCap);
      if (_pregFaqCap) {
        const _respFaqCap = generarRespuestaAutomatica(_pregFaqCap, { esDomicilio: true });
        if (_respFaqCap) {
          console.log(`Bot: [RESPUESTA AUTOMÃTICA] tipo: ${_pregFaqCap.tipo}`);
          await replyConTyping(msg, _respFaqCap);
          await replyConTyping(msg, "Recuerda que seguimos esperando tu captura de transferencia para confirmar tu pedido. ðŸ“¸");
          return;
        }
      }
      await msg.reply("Estamos esperando tu captura de transferencia. Mandala cuando puedas y confirmamos tu pedido.");
    }
    return;
  }

  if (!msg.body || !msg.body.trim()) return;
  const textoOriginal = msg.body.trim();
  if (textoOriginal.length < 2) return;

  // Ignorar previews automÃ¡ticos de WhatsApp
  if (/^[\w.-]+\.[a-z]{2,}$/i.test(textoOriginal)) return;
  if (/^https?:\/\//i.test(textoOriginal)) return;
  if (/^[\w.+-]+@[\w-]+\.[a-z]{2,}$/i.test(textoOriginal) && datosRecibidos.has(clienteNumero)) return;
  if (/^[a-z0-9.-]+\.[a-z]{2,}(\n[\w.+-]+@[\w-]+\.[a-z]{2,})?(\n[a-z0-9.-]+\.[a-z]{2,})?$/i.test(textoOriginal.trim())) return;

  console.log(`\nðŸ“¨ [${clienteNumero}]: ${textoOriginal}`);

  // â”€â”€ PREGUNTAS FRECUENTES â€” disponibles en toda la conversaciÃ³n â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€
  // Se omite si el cliente estÃ¡ en un flujo activo para evitar colisiones de palabras clave
  {
    const _pregFaq = !enFlujoActivo(clienteNumero) ? detectarPreguntaFrecuente(textoOriginal) : null;
    if (_pregFaq) {
      const _histFaq = getHistorial(clienteNumero);
      const _esDomFaq = _histFaq.some(h => h.content && h.content.includes("domicilio"));
      const _respFaq = generarRespuestaAutomatica(_pregFaq, { esDomicilio: _esDomFaq });
      if (_respFaq) {
        if (!clientesNuevos.has(clienteNumero)) clientesNuevos.add(clienteNumero);
        console.log(`Bot: [RESPUESTA AUTOMÃTICA] tipo: ${_pregFaq.tipo}`);
        await replyConTyping(msg, _respFaq);
        if (!estaEnHorario() && !clientesPreventa.has(clienteNumero)) {
          await replyConTyping(msg, mensajeFueraDeHorario());
        } else if (estaEnHorario() && !enFlujoActivo(clienteNumero)) {
          await replyConTyping(msg, MENU_FORMATO);
        }
        return;
      }
    }
  }

  const quiereCancelar = /cancelar|cancela|cancel|cancelo|cancelame|cancelado|ya no quiero|ya no/i.test(textoOriginal);

  // â”€â”€ CANCELACIÃ“N DE PEDIDO CONFIRMADO â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€
  if (pedidosConfirmados.has(clienteNumero)) {
    const datosPedido = pedidosConfirmados.get(clienteNumero);
    const minutosTranscurridos = (Date.now() - (datosPedido.confirmadoEn || 0)) / 60000;
    if (quiereCancelar) {
      if (minutosTranscurridos > 15) {
        await msg.reply("Lo sentimos, el tiempo para cancelar tu pedido ya venciÃ³ (15 minutos).\nSi tienes algÃºn problema, comunÃ­cate directamente con nosotros. Gracias por tu comprensiÃ³n!");
        return;
      }
      esperandoMotivoCancelacion.set(clienteNumero, { nombre: datosPedido.nombre, telefono: datosPedido.telefono, notificarGrupo: true });
      pedidosConfirmados.delete(clienteNumero);
      clientesNuevos.delete(clienteNumero);
      await msg.reply("Lamento escuchar eso. *Â¿PodrÃ­as indicarme el motivo de tu cancelaciÃ³n?*");
      return;
    }
    const minRestantes = Math.max(0, Math.ceil(15 - minutosTranscurridos));
    await msg.reply("Tu pedido ya fue recibido y esta en espera de confirmacion de nuestro equipo.\n" +
      (minRestantes > 0 ? `Si deseas cancelarlo tienes ${minRestantes} minuto${minRestantes !== 1 ? "s" : ""} para escribir *cancelar*.` : "El tiempo para cancelar ya venciÃ³."));
    return;
  }

  // â”€â”€ MOTIVO DE CANCELACIÃ“N â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€
  if (esperandoMotivoCancelacion.has(clienteNumero)) {
    const datosCancelacion = esperandoMotivoCancelacion.get(clienteNumero);
    const horaCancel = new Date().toLocaleTimeString("es-MX", { hour: "2-digit", minute: "2-digit" });
    const grupoId = process.env.GRUPO_ID;
    if (grupoId && datosCancelacion.notificarGrupo) {
      try {
        await client.sendMessage(grupoId, `Solicitud de Cancelacion\nHora: ${horaCancel}\nCliente: ${datosCancelacion.nombre}\nTelefono: ${datosCancelacion.telefono}\nMotivo: ${textoOriginal}`);
      } catch (e) { console.error("Error al notificar cancelacion:", e.message); }
    }
    esperandoMotivoCancelacion.delete(clienteNumero);
    clientesNuevos.delete(clienteNumero);
    limpiarTodo(clienteNumero);
    try { actualizarEstadoPedido(datosCancelacion.telefono, "cancelado"); } catch (e) {}
    await msg.reply("Tu solicitud de cancelacion fue enviada a nuestro equipo.\nEn breve se comunicaran contigo para confirmarte. Disculpa los inconvenientes!");
    return;
  }

  // â”€â”€ 1. PRIMER MENSAJE â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€
  if (!clientesNuevos.has(clienteNumero)) {
    clientesNuevos.add(clienteNumero);
    if (!estaEnHorario()) { await replyConTyping(msg, mensajeFueraDeHorario()); return; }
    await replyConTyping(msg, SALUDO);
    return;
  }

  // â”€â”€ 1B. FUERA DE HORARIO â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€
  if (!estaEnHorario() && !clientesPreventa.has(clienteNumero)) {
    const aceptaPreventa  = /^(si|sÃ­|s[iÃ­]\s+por\s+fa(vor)?|ok|okey|va|dale|quiero|claro|adelante|sale|andale|Ã¡ndale|Ã³rale|orale|de\s+una|venga|eso|perfecto|listo|con\s+gusto|me\s+apunto|apuntame|ponme|anotame|anota(me)?|por\s+fa(vor)?|please|plis|sip|sep|simÃ³n|simon|chido|chale\s+va|esta\s+bien|estÃ¡\s+bien|bueno|bien|ah\s+si|ah\s+sÃ­)$/i.test(textoOriginal.trim());
    const rechazaPreventa = /^(no|nel|nop|nope|nah|naa|para\s+nada|nones|negativo|nei|nein|no\s+gracias|no\s+gra(s|cias)?|no\s+por\s+fa(vor)?|mejor\s+no|al\s+rato|luego|despues|despuÃ©s|ahorita\s+no|otro\s+dia|otro\s+dÃ­a|maÃ±ana)$/i.test(textoOriginal.trim());
    if (aceptaPreventa) {
      clientesPreventa.add(clienteNumero);
      await msg.reply("Perfecto! Tomamos tu pedido en preventa.\nTu orden estara lista al inicio de nuestro servicio.\n\n" + SALUDO);
      return;
    }
    if (rechazaPreventa) {
      clientesNuevos.delete(clienteNumero);
      await msg.reply("Esta bien! Cuando gustes pedir, aqui estaremos. Hasta pronto!");
      return;
    }
    await msg.reply(mensajeFueraDeHorario());
    return;
  }

  const historial  = getHistorial(clienteNumero);
  const esPreventa = clientesPreventa.has(clienteNumero);

  // â”€â”€ RESPUESTA A EDICIÃ“N PENDIENTE â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€
  if (esperandoEdicion.has(clienteNumero)) {
    const edicionPendiente = esperandoEdicion.get(clienteNumero);
    const esOrdenDomEdit = historial.some(h => h.content && h.content.includes("domicilio"));
    let valorNuevo = textoOriginal.trim();

    if (edicionPendiente.campo === "telefono") {
      if (!/^\d{10}$/.test(valorNuevo)) {
        await msg.reply("El nÃºmero debe tener exactamente 10 dÃ­gitos. *Â¿CuÃ¡l es tu nuevo telÃ©fono?*");
        return;
      }
    }

    if (edicionPendiente.campo === "metodo") {
      const vNorm = valorNuevo.toLowerCase().normalize("NFD").replace(/[\u0300-\u036f]/g, "");
      const metodoValido = /^(efectivo|tarjeta|transferencia)$/.test(vNorm);
      if (!metodoValido) {
        const pregMetodo = esOrdenDomEdit
          ? "*Â¿CÃ³mo vas a pagar?* Efectivo o transferencia."
          : "*Â¿CÃ³mo vas a pagar?* Efectivo, tarjeta o transferencia.";
        await msg.reply("OpciÃ³n no vÃ¡lida. " + pregMetodo);
        return;
      }
      if (esOrdenDomEdit && /tarjeta/i.test(valorNuevo)) {
        await msg.reply("Para pedidos a domicilio solo aceptamos *efectivo o transferencia*. *Â¿CuÃ¡l prefieres?*");
        return;
      }
      valorNuevo = vNorm;
    }

    if (edicionPendiente.campo === "hora") {
      const horaValida = validarHora(valorNuevo);
      if (!horaValida) {
        await msg.reply("Esa hora estÃ¡ fuera de nuestro horario. *Â¿A quÃ© hora deseas tu pedido?* (entre 7:00 a.m. y 12:30 p.m.)");
        return;
      }
      valorNuevo = horaValida;
    }

    if (edicionPendiente.campo === "nombre") {
      const partes = valorNuevo.split(/\s+/);
      aplicarEdicion(clienteNumero, { campo: "nombre", valor: { nombre: partes[0], apellido: partes.slice(1).join(" ") || null } });
    } else {
      aplicarEdicion(clienteNumero, { campo: edicionPendiente.campo, valor: valorNuevo });
    }

    if (edicionPendiente.campo === "hora") horaEntregaPreventa.set(clienteNumero, valorNuevo);

    esperandoEdicion.delete(clienteNumero);

    if (edicionPendiente.contexto === "resumen" && edicionPendiente.ordenTexto) {
      const resumenNuevo = generarResumen(clienteNumero, edicionPendiente.ordenTexto, esOrdenDomEdit, esPreventa);
      resumenPendiente.set(clienteNumero, { texto: resumenNuevo.texto, esTransferencia: resumenNuevo.esTransferencia });
      persistirEstado(clienteNumero);
      await msg.reply("Perfecto! AquÃ­ estÃ¡ tu pedido actualizado:\n\n" + resumenNuevo.texto);
    } else if (edicionPendiente.contexto === "formulario") {
      const camposAct = datosCampos.get(clienteNumero) || {};
      const esDomForm = camposAct.tipoEntrega === "domicilio";
      const formActualizado = mostrarFormularioProgresivo(clienteNumero, esDomForm, esPreventa);
      await msg.reply("Perfecto! Datos actualizados:\n\n" + formActualizado + "\n\n*Â¿Son correctos los datos?*");
    }
    return;
  }

  // â”€â”€ 1C. CONFIRMACIÃ“N DE DATOS PRECARGADOS (cliente frecuente) â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€
  if (esperandoConfirmacionDatos.has(clienteNumero)) {
    const { tipoEntrega, esPreventa: esPreventaDatos } = esperandoConfirmacionDatos.get(clienteNumero);
    const esOrdenDom = tipoEntrega === "domicilio";
    const confirma = /^(si|sÃ­|s[iÃ­]\s+por\s+fa(vor)?|ok|okey|va|dale|claro|correcto|sale|andale|Ã¡ndale|Ã³rale|orale|perfecto|exacto|listo|asÃ­\s+es|asi\s+es|de\s+una|eso\s+es|correcto|afirmativo|todo\s+bien|estÃ¡\s+bien|esta\s+bien|sip|sep|simÃ³n|simon|chido|bueno|bien|me\s+late|nel\s+az|efectivamente|positivo)$/i.test(textoOriginal.trim());
    const niega    = /^(no|nel|nop|nope|nah|incorrecto|cambia(r|me)?|cambio|error|no\s+es\s+correcto|no\s+est[aÃ¡]\s+bien|estÃ¡\s+mal|esta\s+mal|hay\s+un\s+error|modifica(r|me)?|corrige|corr[Ã­i]gelo|actualiza)$/i.test(textoOriginal.trim());

    // â”€â”€ EDICIÃ“N DESDE FORMULARIO (cliente frecuente) â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€
    const edicionForm = detectarEdicion(textoOriginal);
    if (edicionForm && !confirma && !niega) {
      if (edicionForm.campo === "metodo" && edicionForm.preguntar) {
        const pregMetodo = esOrdenDom
          ? "*Â¿CÃ³mo vas a pagar?* Efectivo o transferencia."
          : "*Â¿CÃ³mo vas a pagar?* Efectivo, tarjeta o transferencia.";
        esperandoEdicion.set(clienteNumero, { campo: "metodo", contexto: "formulario" });
        await msg.reply(pregMetodo);
        return;
      }
      if (edicionForm.campo === "metodo" && !edicionForm.preguntar) {
        if (esOrdenDom && /tarjeta/i.test(edicionForm.valor)) {
          await msg.reply("Para pedidos a domicilio solo aceptamos *efectivo o transferencia*. *Â¿CuÃ¡l prefieres?*");
          esperandoEdicion.set(clienteNumero, { campo: "metodo", contexto: "formulario" });
          return;
        }
        aplicarEdicion(clienteNumero, edicionForm);
        const formAct = mostrarFormularioProgresivo(clienteNumero, esOrdenDom, esPreventa);
        await msg.reply("Perfecto! Datos actualizados:\n\n" + formAct + "\n\n*Â¿Son correctos los datos?*");
        return;
      }
      if (edicionForm.campo === "quitar_item") {
        await msg.reply("Solo puedes quitar productos desde el resumen final. *Â¿Son correctos los datos?*");
        return;
      }
      if (edicionForm.preguntar) {
        esperandoEdicion.set(clienteNumero, { campo: edicionForm.campo, contexto: "formulario" });
        await msg.reply(edicionForm.pregunta);
        return;
      }
      aplicarEdicion(clienteNumero, edicionForm);
      const formAct = mostrarFormularioProgresivo(clienteNumero, esOrdenDom, esPreventa);
      await msg.reply("Perfecto! Datos actualizados:\n\n" + formAct + "\n\n*Â¿Son correctos los datos?*");
      return;
    }

    if (confirma) {
      esperandoConfirmacionDatos.delete(clienteNumero);
      correoPreguntas.add(clienteNumero);
      if (esOrdenDom) referenciaPreguntas.add(clienteNumero);
      const faltante = siguienteCampoFaltante(clienteNumero, esOrdenDom, esPreventaDatos);
      if (!faltante) {
        datosRecibidos.add(clienteNumero);
        historial.push({ role: "user", content: "Mi pedido es " + (esOrdenDom ? "a domicilio" : "para mostrador") });
        historial.push({ role: "assistant", content: "Datos confirmados. MenÃº enviado." });
        persistirEstado(clienteNumero);
        const formCompleto = mostrarFormularioProgresivo(clienteNumero, esOrdenDom, esPreventaDatos);
        await msg.reply(formCompleto + "\n\nPerfecto! Aqui te mando el menu.");
        await new Promise(r => setTimeout(r, 600));
        await msg.reply(MENU_FORMATO);
      } else {
        const formCompleto = mostrarFormularioProgresivo(clienteNumero, esOrdenDom, esPreventaDatos);
        await msg.reply(formCompleto + "\n\n" + faltante.pregunta);
      }
      return;
    }

    if (niega) {
      const formProgresivo = mostrarFormularioProgresivo(clienteNumero, esOrdenDom, esPreventaDatos);
      await msg.reply(
        formProgresivo +
        "\n\n*Â¿QuÃ© dato deseas corregir?*\n" +
        "_Dime cuÃ¡l, por ejemplo: \"cambia mi nombre\", \"cambia mi telÃ©fono\", \"cambia mi mÃ©todo de pago\"._"
      );
      return;
    }

    const formCompleto = mostrarFormularioProgresivo(clienteNumero, esOrdenDom, esPreventaDatos);
    await msg.reply(formCompleto + "\n\n*Â¿Son correctos los datos?*");
    return;
  }

  // â”€â”€ 2. TIPO DE ENTREGA â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€
  if (historial.length === 0) {
    const tipoEntrega = await detectarTipoEntrega(textoOriginal);
    if (tipoEntrega === "ninguno") { await msg.reply("*Â¿Tu pedido serÃ¡ para domicilio o pasas a recoger al mostrador?*"); return; }

    const telGuardado   = telefonosReales.get(clienteNumero) || getTelefonoReal(clienteNumero);
    const telFormulario = datosCampos.get(clienteNumero)?.telefono;
    const telBuscar     = telGuardado || telFormulario || null;
    console.log(`[CLIENTE FRECUENTE] buscando tel: ${telBuscar}`);
    const clienteBD = telBuscar ? getCliente(telBuscar) : null;
    console.log(`[CLIENTE FRECUENTE] encontrado:`, clienteBD ? clienteBD.nombre : "NO");

    if (clienteBD && clienteBD.nombre) {
      const campos = {
        nombre:      [clienteBD.nombre, clienteBD.apellido].filter(Boolean).join(" "),
        telefono:    clienteBD.telefono,
        correo:      clienteBD.correo || "no proporcionÃ³",
        metodo:      null,
        calle:       tipoEntrega === "domicilio" ? (clienteBD.calle_numero || null) : null,
        colonia:     tipoEntrega === "domicilio" ? (clienteBD.colonia || null) : null,
        referencia:  tipoEntrega === "domicilio" ? (clienteBD.referencia || "sin referencia") : null,
        hora:        null,
        tipoEntrega: tipoEntrega,
      };
      datosCampos.set(clienteNumero, campos);
      historial.push({ role: "user", content: tipoEntrega === "domicilio" ? "Mi pedido es a domicilio." : "Mi pedido es para recoger en mostrador." });
      historial.push({ role: "assistant", content: "Perfecto, verificando tus datos." });
      esperandoConfirmacionDatos.set(clienteNumero, { tipoEntrega, esPreventa });
      const formPrecargado = mostrarFormularioProgresivo(clienteNumero, tipoEntrega === "domicilio", esPreventa);
      await msg.reply(`Hola de nuevo *${campos.nombre.split(" ")[0]}*! ðŸ˜Š Encontramos tus datos:\n\n${formPrecargado}\n\n*Â¿Son correctos los datos?*`);
      console.log(`Bot: [CLIENTE FRECUENTE â€” datos precargados]`);
      return;
    }

    let telAutodetectado = telefonosReales.get(clienteNumero) || getTelefonoReal(clienteNumero) || null;
    if (!telAutodetectado) {
      try {
        const contacto = await msg.getContact();
        const sinPais  = (contacto.number || "").replace(/^52/, "");
        if (/^\d{10}$/.test(sinPais)) telAutodetectado = sinPais;
      } catch (_) {}
    }

    const camposIniciales = datosCampos.get(clienteNumero) || {};
    if (telAutodetectado && !camposIniciales.telefono) camposIniciales.telefono = telAutodetectado;
    camposIniciales.tipoEntrega = tipoEntrega;
    datosCampos.set(clienteNumero, camposIniciales);
    persistirEstado(clienteNumero);

    tipoEntregaCliente.set(clienteNumero, tipoEntrega);
    const parEntrega = tipoEntrega === "mostrador"
      ? { user: "Mi pedido es para recoger en mostrador.", bot: "Perfecto, llena el formulario con tus datos." }
      : { user: "Mi pedido es a domicilio.", bot: "Perfecto, llena el formulario con tus datos." };
    historial.length = 0;
    historial.push({ role: "user",      content: parEntrega.user });
    historial.push({ role: "assistant", content: parEntrega.bot  });

    if (tipoEntrega === "mostrador") {
      await msg.reply(esPreventa ? FORM_PREVENTA_MOSTRADOR(telAutodetectado) : FORM_MOSTRADOR(telAutodetectado));
    } else {
      await msg.reply(esPreventa ? FORM_PREVENTA_DOMICILIO(telAutodetectado) : FORM_DOMICILIO(telAutodetectado));
    }
    console.log(`Bot: [FORMULARIO - ${tipoEntrega.toUpperCase()}${esPreventa ? " PREVENTA" : ""}] Tel autodetectado: ${telAutodetectado}`);
    return;
  }

  // â”€â”€ 2B. CANCELACIÃ“N DURANTE EL PEDIDO â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€
  if (quiereCancelar) {
    clientesNuevos.delete(clienteNumero);
    limpiarTodo(clienteNumero);
    await msg.reply("Tu pedido ha sido cancelado. Cuando gustes ordenar, aqui estaremos. Hasta pronto!");
    return;
  }

  // â”€â”€ 2C. CAMBIO DE TIPO DURANTE FORMULARIO â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€
  if (!datosRecibidos.has(clienteNumero)) {
    const esCambioDomicilio = /cambi(a|ar|ame|amelo|arme)\s*(a|al|para|el)?\s*domicilio/i.test(textoOriginal)
      || /quiero\s*(que\s*)?(sea\s*)?a\s*domicilio/i.test(textoOriginal)
      || /mejor\s*(a\s*)?domicilio/i.test(textoOriginal)
      || /que\s+sea\s+(a\s+)?domicilio/i.test(textoOriginal)
      || /para\s+domicilio/i.test(textoOriginal)
      || /mejor\s*(que\s*)?(me\s*)?(lo\s*)?(env[Ã­i]a|manda|lleva|trae)(melo|me|lo)?/i.test(textoOriginal)
      || /^(env[Ã­i]amelo|mandamelo|traemelo|llevamelo|mandalos|traelos)$/i.test(textoOriginal.trim());
    const esCambioMostrador = /cambi(a|ar|ame|amelo|arme)\s*(a|al|para|el)?\s*mostrador/i.test(textoOriginal)
      || /mejor\s*(al?\s*)?mostrador/i.test(textoOriginal)
      || /quiero\s*(que\s*)?(sea\s*)?en\s*mostrador/i.test(textoOriginal)
      || /que\s+sea\s+(en\s+)?mostrador/i.test(textoOriginal)
      || /para\s+mostrador/i.test(textoOriginal)
      || /mejor\s*(lo\s*)?(recojo|voy|paso)/i.test(textoOriginal)
      || /yo\s*(voy|paso)\s*(a\s*)?(recoger|buscarlo)?/i.test(textoOriginal)
      || /voy\s*(a\s*)?(pasar|recoger)/i.test(textoOriginal)
      || /paso\s*(yo\s*)?(a\s*recoger)?/i.test(textoOriginal);

    if (esCambioDomicilio || esCambioMostrador) {
      const nuevoTipo = esCambioDomicilio ? "domicilio" : "mostrador";
      tipoEntregaCliente.set(clienteNumero, nuevoTipo);
      const camposActuales = datosCampos.get(clienteNumero) || {};
      camposActuales.tipoEntrega = nuevoTipo;
      if (esCambioMostrador) {
        camposActuales.calle = null; camposActuales.colonia = null; camposActuales.referencia = null;
        referenciaPreguntas.delete(clienteNumero);
      }
      if (esCambioDomicilio) {
        const telActual = camposActuales.telefono || null;
        if (telActual) {
          const clienteBD = getCliente(telActual);
          if (clienteBD) {
            if (!camposActuales.calle)      camposActuales.calle      = clienteBD.calle_numero || null;
            if (!camposActuales.colonia)    camposActuales.colonia    = clienteBD.colonia      || null;
            if (!camposActuales.referencia) camposActuales.referencia = clienteBD.referencia   || null;
          }
        }
      }
      datosCampos.set(clienteNumero, camposActuales);
      const formActualizado = mostrarFormularioProgresivo(clienteNumero, esCambioDomicilio, esPreventa);
      const sfaltante = siguienteCampoFaltante(clienteNumero, esCambioDomicilio, esPreventa);
      await msg.reply(
        (esCambioDomicilio ? "Perfecto, cambiÃ© tu pedido a domicilio!\n\n" : "Perfecto, cambiÃ© tu pedido a mostrador!\n\n") +
        formActualizado +
        (sfaltante ? "\n\n" + sfaltante.pregunta : "")
      );
      return;
    }
  }

  // â”€â”€ 3. FORMULARIO PROGRESIVO â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€
  if (!datosRecibidos.has(clienteNumero)) {
    const camposActualesFormulario = datosCampos.get(clienteNumero) || {};
    const esOrdenDomicilio = camposActualesFormulario.tipoEntrega === "domicilio"
      || (camposActualesFormulario.tipoEntrega == null && tipoEntregaCliente.get(clienteNumero) === "domicilio");

    const esConfirmacionDatos = /^(si|sÃ­|ok|okey|va|dale|claro|correcto|listo|sip|sep|exacto|perfecto|todo\s+bien|estÃ¡\s+bien|esta\s+bien|asÃ­\s+es|asi\s+es|afirmativo|bueno|bien)$/i.test(textoOriginal.trim());
    if (esConfirmacionDatos && camposCompletos(clienteNumero, esOrdenDomicilio, esPreventa)) {
      const camposActuales = datosCampos.get(clienteNumero);
      if (esPreventa && camposActuales.hora) horaEntregaPreventa.set(clienteNumero, camposActuales.hora);
      const textoFinal = camposATexto(clienteNumero);
      datosRecibidos.add(clienteNumero);
      historial.length = 0;
      historial.push({ role: "user",      content: textoFinal });
      historial.push({ role: "assistant", content: "Datos recibidos. MENU TACOS JAVIER enviado." });
      const formCompleto = mostrarFormularioProgresivo(clienteNumero, esOrdenDomicilio, esPreventa);
      persistirEstado(clienteNumero);
      await msg.reply(formCompleto + "\n\nPerfecto, datos recibidos! Aqui te mando el menu.");
      await new Promise(r => setTimeout(r, 600));
      await msg.reply(MENU_FORMATO);
      return;
    }

    // Si el cliente manda un comando de ediciÃ³n durante el llenado, redirigir al checkpoint de confirmaciÃ³n
    if (detectarEdicion(textoOriginal)) {
      const faltanteActual = siguienteCampoFaltante(clienteNumero, esOrdenDomicilio, esPreventa);
      const formActual = mostrarFormularioProgresivo(clienteNumero, esOrdenDomicilio, esPreventa);
      await msg.reply(
        "Puedes corregir tus datos cuando te muestre el resumen completo y te pregunte si son correctos. ðŸ˜Š\n\n" +
        formActual +
        (faltanteActual ? "\n\n" + faltanteActual.pregunta : "\n\n*Â¿Son correctos los datos?*")
      );
      return;
    }

    const campos = interpretarCampos(clienteNumero, textoOriginal, esOrdenDomicilio, esPreventa);

    if (esPreventa && campos._horaFueraRango) {
      const formProgresivo = mostrarFormularioProgresivo(clienteNumero, esOrdenDomicilio, esPreventa);
      const tipoPedido     = esOrdenDomicilio ? "recibirlo" : "pasar a recoger";
      const msgHora = campos._horaFueraRango === "antes"
        ? "Aun no iniciamos labores a esa hora. Nuestro horario es de *7:00 a.m. a 12:30 p.m.*"
        : "A esa hora ya estamos fuera de servicio. Nuestro horario es de *7:00 a.m. a 12:30 p.m.*";
      await msg.reply(formProgresivo + "\n\n" + msgHora + "\n*Â¿A quÃ© hora deseas " + tipoPedido + "?* (entre 7:00 a.m. y 12:30 p.m.)");
      delete campos._horaFueraRango;
      datosCampos.set(clienteNumero, campos);
      return;
    }

    const faltante = siguienteCampoFaltante(clienteNumero, esOrdenDomicilio, esPreventa);
    if (faltante && (faltante.campo === "correo" || faltante.campo === "referencia")) {
      const fueMarcado = manejarOpcional(clienteNumero, faltante.campo, textoOriginal);
      if (!fueMarcado && faltante.campo === "referencia") {
        const camposActuales = datosCampos.get(clienteNumero) || {};
        camposActuales.referencia = textoOriginal.trim();
        datosCampos.set(clienteNumero, camposActuales);
        persistirEstado(clienteNumero);
      }
      if (!fueMarcado && faltante.campo === "correo") {
  const camposActuales = datosCampos.get(clienteNumero) || {};
  // Solo guardar si parece un correo vÃ¡lido
  if (/[\w.+-]+@[\w-]+\.[a-z]{2,}/i.test(textoOriginal.trim())) {
    camposActuales.correo = textoOriginal.trim();
    datosCampos.set(clienteNumero, camposActuales);
    persistirEstado(clienteNumero);
  }
}
    }

    acumularDatos(clienteNumero, textoOriginal);

    if (camposCompletos(clienteNumero, esOrdenDomicilio, esPreventa)) {
      const camposActuales = datosCampos.get(clienteNumero);
      if (esPreventa && camposActuales.hora) horaEntregaPreventa.set(clienteNumero, camposActuales.hora);
      const textoFinal = camposATexto(clienteNumero);
      datosRecibidos.add(clienteNumero);
      historial.length = 0;
      historial.push({ role: "user",      content: textoFinal });
      historial.push({ role: "assistant", content: "Datos recibidos. MENU TACOS JAVIER enviado." });
      const formCompleto = mostrarFormularioProgresivo(clienteNumero, esOrdenDomicilio, esPreventa);
      await msg.reply(formCompleto + "\n\nPerfecto, datos recibidos! Aqui te mando el menu.");
      await new Promise(r => setTimeout(r, 600));
      await msg.reply(MENU_FORMATO);
      return;
    }

    const siguienteFaltante = siguienteCampoFaltante(clienteNumero, esOrdenDomicilio, esPreventa);
    const formProgresivo    = mostrarFormularioProgresivo(clienteNumero, esOrdenDomicilio, esPreventa);

    if (siguienteFaltante) {
      await msg.reply(formProgresivo + "\n\n" + siguienteFaltante.pregunta);
    } else {
      const camposActuales = datosCampos.get(clienteNumero) || {};
      if (!camposActuales.correo) { camposActuales.correo = "no proporcionÃ³"; correoPreguntas.add(clienteNumero); }
      if (esOrdenDomicilio && !camposActuales.referencia) { camposActuales.referencia = "sin referencia"; referenciaPreguntas.add(clienteNumero); }
      datosCampos.set(clienteNumero, camposActuales);
      persistirEstado(clienteNumero);
      const formActualizado = mostrarFormularioProgresivo(clienteNumero, esOrdenDomicilio, esPreventa);
      await msg.reply(formActualizado + "\n\n*Â¿Son correctos los datos?*");
    }
    return;
  }

  // â”€â”€ 4. CONFIRMACIÃ“N FINAL DEL PEDIDO â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€
  const palabrasConfirmacion = /^(si|sÃ­|s[iÃ­]\s+por\s+fa(vor)?|ok|okey|va|dale|listo|sale|andale|Ã¡ndale|adelante|confirmo|confirmado|correcto|asi|asÃ­|si\s+porfavor|sÃ­\s+porfavor|si\s+por\s+favor|sÃ­\s+por\s+favor|claro|perfecto|va\s+bien|dale\s+pues|Ã¡ndale|Ã³rale|orale|va\s+que\s+va|de\s+una|eso\s+es|asÃ­\s+es|asi\s+es|todo\s+bien|estÃ¡\s+bien|esta\s+bien|sip|sep|simÃ³n|simon|chido|bueno|bien|afirmativo|positivo|exacto|exactamente|procede|proceder|pa\s+delante|p'adelante|con\s+eso|con\s+eso\s+voy|va\s+ese|nel\s+az)$/i;

  // â”€â”€ EDICIÃ“N DESDE RESUMEN PENDIENTE â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€
  if (resumenPendiente.has(clienteNumero)) {
    const edicion = detectarEdicion(textoOriginal);
    if (edicion) {
      const pendienteActual = resumenPendiente.get(clienteNumero);
      const ordenExtraida = extraerOrdenDeResumen(pendienteActual.texto);
      const esOrdenDomEdit = historial.some(h => h.content && h.content.includes("domicilio"));

      // QUITAR ÃTEM
      if (edicion.campo === "quitar_item") {
        const resultado = quitarItemDeOrden(ordenExtraida, textoOriginal);
        if (resultado.exito) {
          const resumenNuevo = generarResumen(clienteNumero, resultado.nuevaOrden, esOrdenDomEdit, esPreventa);
          resumenPendiente.set(clienteNumero, { texto: resumenNuevo.texto, esTransferencia: resumenNuevo.esTransferencia });
          persistirEstado(clienteNumero);
          await msg.reply("Listo! AquÃ­ estÃ¡ tu pedido actualizado:\n\n" + resumenNuevo.texto);
        } else if (resultado.razon === "ambiguo") {
          await msg.reply(`Tengo varios productos similares. Â¿CuÃ¡l deseas quitar?\n\n${resultado.opciones}\n\nEscrÃ­beme cuÃ¡l exactamente.`);
        } else if (resultado.razon === "quedaria_vacio") {
          await msg.reply("No puedo quitar ese producto porque quedarÃ­a tu pedido vacÃ­o. *Â¿Deseas cancelar el pedido o cambiarlo?*");
        } else if (resultado.razon === "solo_un_item") {
          await msg.reply("Solo tienes un producto en tu pedido. Si deseas cancelarlo escribe *cancelar*.");
        } else {
          await msg.reply("No encontrÃ© ese producto en tu pedido. *Â¿QuÃ© deseas quitar?*");
        }
        return;
      }

      // MÃ‰TODO â€” preguntar
      if (edicion.campo === "metodo" && edicion.preguntar) {
        const pregMetodo = esOrdenDomEdit
          ? "*Â¿CÃ³mo vas a pagar?* Efectivo o transferencia."
          : "*Â¿CÃ³mo vas a pagar?* Efectivo, tarjeta o transferencia.";
        esperandoEdicion.set(clienteNumero, { campo: "metodo", contexto: "resumen", ordenTexto: ordenExtraida });
        await msg.reply(pregMetodo);
        return;
      }

      // MÃ‰TODO â€” valor directo, validar tarjeta en domicilio
      if (edicion.campo === "metodo" && !edicion.preguntar) {
        if (esOrdenDomEdit && /tarjeta/i.test(edicion.valor)) {
          await msg.reply("Para pedidos a domicilio solo aceptamos *efectivo o transferencia*. *Â¿CuÃ¡l prefieres?*");
          esperandoEdicion.set(clienteNumero, { campo: "metodo", contexto: "resumen", ordenTexto: ordenExtraida });
          return;
        }
        aplicarEdicion(clienteNumero, edicion);
        const resumenNuevo = generarResumen(clienteNumero, ordenExtraida, esOrdenDomEdit, esPreventa);
        resumenPendiente.set(clienteNumero, { texto: resumenNuevo.texto, esTransferencia: resumenNuevo.esTransferencia });
        persistirEstado(clienteNumero);
        await msg.reply("Perfecto! AquÃ­ estÃ¡ tu pedido actualizado:\n\n" + resumenNuevo.texto);
        return;
      }

      // HORA â€” validar rango
      if (edicion.campo === "hora" && !edicion.preguntar) {
        const horaValida = validarHora(edicion.valor);
        if (!horaValida) {
          await msg.reply("Esa hora estÃ¡ fuera de nuestro horario. *Â¿A quÃ© hora deseas tu pedido?* (entre 7:00 a.m. y 12:30 p.m.)");
          esperandoEdicion.set(clienteNumero, { campo: "hora", contexto: "resumen", ordenTexto: ordenExtraida });
          return;
        }
        edicion.valor = horaValida;
        aplicarEdicion(clienteNumero, edicion);
        horaEntregaPreventa.set(clienteNumero, horaValida);
        const resumenNuevo = generarResumen(clienteNumero, ordenExtraida, esOrdenDomEdit, esPreventa);
        resumenPendiente.set(clienteNumero, { texto: resumenNuevo.texto, esTransferencia: resumenNuevo.esTransferencia });
        persistirEstado(clienteNumero);
        await msg.reply("Perfecto! AquÃ­ estÃ¡ tu pedido actualizado:\n\n" + resumenNuevo.texto);
        return;
      }

      // CAMPOS QUE PREGUNTAN
      if (edicion.preguntar) {
        esperandoEdicion.set(clienteNumero, { campo: edicion.campo, contexto: "resumen", ordenTexto: ordenExtraida });
        await msg.reply(edicion.pregunta);
        return;
      }

      // CAMPOS CON VALOR DIRECTO
      aplicarEdicion(clienteNumero, edicion);
      const resumenNuevo = generarResumen(clienteNumero, ordenExtraida, esOrdenDomEdit, esPreventa);
      resumenPendiente.set(clienteNumero, { texto: resumenNuevo.texto, esTransferencia: resumenNuevo.esTransferencia });
      persistirEstado(clienteNumero);
      await msg.reply("Perfecto! AquÃ­ estÃ¡ tu pedido actualizado:\n\n" + resumenNuevo.texto);
      return;
    }
  }

  // â”€â”€ CAMBIO A DOMICILIO DESDE RESUMEN â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€
  if (resumenPendiente.has(clienteNumero) && (
    /cambi(a|ar|ame|amelo|arme)\s*(a|al|para)\s*domicilio/i.test(textoOriginal)
    || /mejor\s*(a\s*)?domicilio/i.test(textoOriginal)
    || /que\s+sea\s+(a\s+)?domicilio/i.test(textoOriginal)
    || /para\s+domicilio/i.test(textoOriginal)
    || /a\s+domicilio/i.test(textoOriginal)
    || /mejor\s*(que\s*)?(me\s*)?(lo\s*)?(env[Ã­i]a|manda|lleva|trae)(melo|me|lo)?/i.test(textoOriginal)
    || /^(env[Ã­i]amelo|mandamelo|traemelo|llevamelo)$/i.test(textoOriginal.trim())
  )) {
    const pendienteActual = resumenPendiente.get(clienteNumero);
    const ordenExtraida = extraerOrdenDeResumen(pendienteActual.texto);
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
    if (camposDom.calle && camposDom.colonia) {
      const resumenNuevo = generarResumen(clienteNumero, ordenExtraida, true, esPreventa);
      resumenPendiente.set(clienteNumero, { texto: resumenNuevo.texto, esTransferencia: resumenNuevo.esTransferencia });
      persistirEstado(clienteNumero);
      await msg.reply("Perfecto! CambiÃ© tu pedido a domicilio.\n\n" + resumenNuevo.texto);
    } else {
      if (ordenExtraida) esperandoAgregarMas.set(clienteNumero, ordenExtraida);
      resumenPendiente.delete(clienteNumero);
      datosRecibidos.delete(clienteNumero);
      persistirEstado(clienteNumero);
      await msg.reply("Perfecto! Para cambiar a domicilio necesito tu direcciÃ³n.\n*Â¿CuÃ¡l es tu calle y nÃºmero?*");
    }
    return;
  }

  // â”€â”€ CAMBIO A MOSTRADOR DESDE RESUMEN â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€
  if (resumenPendiente.has(clienteNumero) && (
    /cambi(a|ar|ame|amelo|arme)\s*(a|al|para|el)?\s*mostrador/i.test(textoOriginal)
    || /mejor\s*(al?\s*)?mostrador/i.test(textoOriginal)
    || /mejor\s*(lo\s*)?(recojo|voy|paso)/i.test(textoOriginal)
    || /que\s+sea\s+(en\s+)?mostrador/i.test(textoOriginal)
    || /para\s+mostrador/i.test(textoOriginal)
    || /que\s+sea\s+a\s+mostrador/i.test(textoOriginal)
    || /voy\s*(a\s*)?(pasar|recoger)/i.test(textoOriginal)
    || /paso\s*(yo\s*)?(a\s*recoger)?/i.test(textoOriginal)
    || /yo\s*(voy|paso)\s*(a\s*)?(recoger)?/i.test(textoOriginal)
  )) {
    const pendienteActual = resumenPendiente.get(clienteNumero);
    const ordenExtraida = extraerOrdenDeResumen(pendienteActual.texto);
    const idxTipo = historial.findIndex(h => h.content && (h.content.includes("domicilio") || h.content.includes("mostrador")));
    if (idxTipo !== -1) historial[idxTipo].content = "Mi pedido es para recoger en mostrador.";
    const campos = datosCampos.get(clienteNumero) || {};
    campos.calle = null; campos.colonia = null; campos.referencia = null;
    campos.tipoEntrega = "mostrador";
    datosCampos.set(clienteNumero, campos);
    resumenPendiente.delete(clienteNumero);
    if (ordenExtraida) {
      const resumenNuevo = generarResumen(clienteNumero, ordenExtraida, false, esPreventa);
      resumenPendiente.set(clienteNumero, { texto: resumenNuevo.texto, esTransferencia: resumenNuevo.esTransferencia });
      persistirEstado(clienteNumero);
      await msg.reply("Perfecto! CambiÃ© tu pedido a mostrador.\n\n" + resumenNuevo.texto);
    }
    return;
  }

  if (resumenPendiente.has(clienteNumero) && /transferencia|efectivo|tarjeta/i.test(textoOriginal)) {
    const esCambio = /cambiar|cambio|mejor|voy\s+a\s+pagar|quiero\s+pagar|pagar\s+con|con\s+(efectivo|tarjeta|transferencia)/i.test(textoOriginal)
      || /^(efectivo|tarjeta|transferencia)$/i.test(textoOriginal.trim());
    if (esCambio) {
      const campos = datosCampos.get(clienteNumero) || {};
      if (/transferencia/i.test(textoOriginal))     campos.metodo = "transferencia";
      else if (/tarjeta/i.test(textoOriginal))      campos.metodo = "tarjeta";
      else if (/efectivo/i.test(textoOriginal))     campos.metodo = "efectivo";
      datosCampos.set(clienteNumero, campos);
      const pendienteActual = resumenPendiente.get(clienteNumero);
      const ordenExtraida = extraerOrdenDeResumen(pendienteActual.texto);
      resumenPendiente.delete(clienteNumero);
      if (ordenExtraida) {
        const esOrdenDomAux = historial.some(h => h.content && h.content.includes("domicilio"));
        const resumenNuevo  = generarResumen(clienteNumero, ordenExtraida, esOrdenDomAux, esPreventa);
        resumenPendiente.set(clienteNumero, { texto: resumenNuevo.texto, esTransferencia: resumenNuevo.esTransferencia });
        await msg.reply(resumenNuevo.texto);
        return;
      }
    }
  }

  if (resumenPendiente.has(clienteNumero) && (
    /agrega(me|r|nos)?|agra[gq]a|aÃ±ade|tambiÃ©n\s+quiero|y\s+tambiÃ©n|y\s+ademÃ¡s|suma(me)?|ponme\s+(tambiÃ©n|ademÃ¡s)|quiero\s+tambiÃ©n|tambiÃ©n\s+dame|y\s+dame/i.test(textoOriginal)
  )) {
    const pendienteActual = resumenPendiente.get(clienteNumero);
    const ordenExtraida = extraerOrdenDeResumen(pendienteActual.texto);
    const jsonNuevo = parsearPedidoSimple(textoOriginal);
    if (jsonNuevo && jsonNuevo.tipo === "pedido" && Array.isArray(jsonNuevo.items) && jsonNuevo.items.length > 0) {
      const resultadoNuevo = jsonALineas(jsonNuevo);
      pedidoJSONActual.set(clienteNumero, { _esModificacionResumen: true, ordenBase: ordenExtraida, jsonNuevo });
      esperandoConfirmacionItem.set(clienteNumero, { lineas: resultadoNuevo.texto, _esModificacionResumen: true, ordenBase: ordenExtraida, jsonNuevo });
      resumenPendiente.delete(clienteNumero);
      persistirEstado(clienteNumero);
      await msg.reply(resultadoNuevo.texto + "\n\n*Â¿Agrego esto a tu pedido?*");
      return;
    }
    const pedidoParcialAgregar = parsearSinCorteItems(textoOriginal);
    if (pedidoParcialAgregar && detectarSinCorte(textoOriginal)) {
      pedidoParcialAgregar._indiceActual = 0;
      pedidoParcialAgregar._ordenBase = ordenExtraida;
      pedidoParcialAgregar._esModificacionResumen = true;
      esperandoCorte.set(clienteNumero, pedidoParcialAgregar);
      resumenPendiente.delete(clienteNumero);
      const primerItem = pedidoParcialAgregar.items[0];
      const desc = primerItem.presentacion === "taco"   ? `los ${primerItem.cantidad} tacos`
                 : primerItem.presentacion === "torta"  ? `las ${primerItem.cantidad} tortas`
                 : primerItem.presentacion === "gramos" ? `los ${primerItem.gramos}g`
                 : `los $${primerItem.monto}`;
      await msg.reply(`*Â¿De quÃ© tipo de carne quieres ${desc}?*\nTenemos: Surtido, Carne, Buche, Cuero o Lengua`);
      return;
    }
    resumenPendiente.delete(clienteNumero);
    if (ordenExtraida) esperandoAgregarMas.set(clienteNumero, ordenExtraida);
  }

  if (resumenPendiente.has(clienteNumero) && /^no[,\s]/i.test(textoOriginal.trim())) {
    const pendienteActual = resumenPendiente.get(clienteNumero);
    const ordenExtraida = extraerOrdenDeResumen(pendienteActual.texto);
    const pedidoParcialAgregar = parsearSinCorteItems(textoOriginal);
    if (pedidoParcialAgregar && detectarSinCorte(textoOriginal)) {
      pedidoParcialAgregar._indiceActual = 0;
      pedidoParcialAgregar._ordenBase = ordenExtraida;
      pedidoParcialAgregar._esModificacionResumen = true;
      esperandoCorte.set(clienteNumero, pedidoParcialAgregar);
      resumenPendiente.delete(clienteNumero);
      const primerItem = pedidoParcialAgregar.items[0];
      const desc = primerItem.presentacion === "taco"   ? `los ${primerItem.cantidad} tacos`
                 : primerItem.presentacion === "torta"  ? `las ${primerItem.cantidad} tortas`
                 : primerItem.presentacion === "gramos" ? `los ${primerItem.gramos}g`
                 : `los $${primerItem.monto}`;
      await msg.reply(`*Â¿De quÃ© tipo de carne quieres ${desc}?*\nTenemos: Surtido, Carne, Buche, Cuero o Lengua`);
      return;
    }
    resumenPendiente.delete(clienteNumero);
    if (ordenExtraida) esperandoAgregarMas.set(clienteNumero, ordenExtraida);
  }

  if (resumenPendiente.has(clienteNumero) && /^(no|nel|nop|nope|nah|negativo)$/i.test(textoOriginal.trim())) {
    resumenPendiente.delete(clienteNumero);
    await msg.reply("Entendido! *Â¿QuÃ© te gustarÃ­a cambiar o agregar?*");
    await new Promise(r => setTimeout(r, 300));
    await msg.reply(MENU_FORMATO);
    return;
  }

  if (resumenPendiente.has(clienteNumero) && palabrasConfirmacion.test(textoOriginal.trim())) {
    const pendiente  = resumenPendiente.get(clienteNumero);
    const horaVenta  = new Date().toLocaleTimeString("es-MX", { hour: "2-digit", minute: "2-digit" });
    const infoPedido = extraerDatosPedido(pendiente.texto);

    if (pendiente.esTransferencia) {
      esperandoCaptura.set(clienteNumero, { resumen: pendiente.texto, telefono: infoPedido.telefono });
      resumenPendiente.delete(clienteNumero);
      await msg.reply(DATOS_BANCO);
      return;
    }

    const grupoId = process.env.GRUPO_ID;
    if (grupoId) {
      try {
        await client.sendMessage(grupoId, `Nueva venta!\nHora: ${horaVenta}\n\n${pendiente.texto}\n\nUsa: !confirmar ${infoPedido.telefono}`);
      } catch (e) { console.error("Error al notificar grupo:", e.message); }
    }

    pendientesConfirmacion.set(clienteNumero, { ...infoPedido, resumen: pendiente.texto, hora: horaVenta });

    try {
      const telefonoLimpio = infoPedido.telefono
        || clienteNumero.replace("@c.us", "").replace("@lid", "").split(":")[0]
        || null;
      const nombreParts   = (infoPedido.nombre || "Cliente").split(" ");
      const camposCliente = datosCampos.get(clienteNumero) || {};

      const apellido     = nombreParts.slice(1).join(" ") || null;
      const correo       = (camposCliente.correo && camposCliente.correo !== "no proporcionÃ³")
                             ? camposCliente.correo : null;
      const calle_numero = camposCliente.calle      || null;
      const colonia      = camposCliente.colonia    || null;
      const referencia   = (camposCliente.referencia && camposCliente.referencia !== "sin referencia")
                             ? camposCliente.referencia : null;
      const hora_entrega = horaEntregaPreventa.get(clienteNumero) || null;
      const total        = parseFloat((infoPedido.total || "0").replace(/[^0-9.]/g, "")) || 0;
      const metodo_pago  = /transferencia/i.test(pendiente.texto) ? "transferencia"
                         : /tarjeta/i.test(pendiente.texto)       ? "tarjeta"
                         : "efectivo";

      const cliente = upsertCliente({
        nombre:       nombreParts[0] || null,
        apellido,
        telefono:     telefonoLimpio,
        correo,
        calle_numero,
        colonia,
        referencia,
      });

      const pedidoId = registrarPedido({
        cliente_id:   cliente ? cliente.id : null,
        tipo:         infoPedido.tipo || "mostrador",
        orden:        (pendiente.texto || "").substring(0, 500),
        total,
        metodo_pago,
        estado:       "pendiente",
        hora_entrega,
      });

      console.log(`BD: Pedido #${pedidoId} registrado para ${telefonoLimpio}`);
    } catch (e) {
      console.error("BD Error tipo:", typeof e);
      console.error("BD Error completo:", e);
    }

    if (infoPedido.telefono) {
      telefonosReales.set(clienteNumero, infoPedido.telefono);
      try { guardarTelefonoReal(clienteNumero, infoPedido.telefono); } catch (e) {}
    }

    pedidosConfirmados.set(clienteNumero, { nombre: infoPedido.nombre, telefono: infoPedido.telefono, total: infoPedido.total, resumen: pendiente.texto, confirmadoEn: Date.now() });
    clientesNuevos.delete(clienteNumero);
    limpiarTodo(clienteNumero);
    clientesNuevos.add(clienteNumero);
    await msg.reply("Listo! Tu pedido fue recibido y esta en espera de confirmacion de nuestro equipo.\nEn breve te avisamos. Gracias por tu preferencia!\n\n_Si deseas cancelar tu pedido escribe *cancelar*._");
    return;
  }

  // â”€â”€ CATCH-ALL RESUMEN PENDIENTE â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€
  // Si el cliente manda cualquier mensaje mientras hay resumen pendiente y no
  // coincidiÃ³ con ninguna acciÃ³n, re-enviamos el resumen para no perder el hilo.
  if (resumenPendiente.has(clienteNumero)) {
    const _pendiente = resumenPendiente.get(clienteNumero);
    await replyConTyping(msg, "Tienes un pedido pendiente de confirmar ðŸ‘‡\n\n" + _pendiente.texto);
    return;
  }

  // â”€â”€ 4B. TOMA DE PEDIDO â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€
  const esOrdenDom     = historial.some(h => h.content && h.content.includes("domicilio"));
  const esConfirmacion = /^(si|sÃ­|ok|va|dale|correcto|exacto|claro|perfecto|sale|andale|Ã³rale|Ã¡ndale)$/i.test(textoOriginal.trim());
  const esRechazo      = /^(nel|nop|nope|incorrecto|cambia|error|no\s+es\s+correcto|no\s+est[aÃ¡]\s+bien)$/i.test(textoOriginal.trim());
  const esAgregarSi    = /^(si|sÃ­|ok|va|dale|claro|sale|andale|quiero|agrega|mÃ¡s|mas)$/i.test(textoOriginal.trim());
  const esAgregarNo    = /^(no|nel|nop|nada\s*m[aÃ¡]s?|ya\s*es\s*todo|eso\s*es\s*todo|listo|ya|solo\s*eso|eso|no\s*,?\s*(gracias|gra|gras)|as[iÃ­]\s*est[aÃ¡](\s*bien)?|ya\s*fue|ya\s*con\s*eso)$/i.test(textoOriginal.trim());

  // â”€â”€ CAMBIO DE TIPO DURANTE TOMA DE PEDIDO â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€
  const esCambioAMostrador = /cambi(a|ar|ame)\s*(a|al)?\s*mostrador|que\s+sea\s+(a\s+|en\s+)?mostrador|para\s+mostrador|mejor\s+mostrador|voy\s+a\s+recoger|paso\s+a\s+recoger|yo\s+recojo/i.test(textoOriginal);
  const esCambioADomicilio = /cambi(a|ar|ame)\s*(a|al)?\s*domicilio|que\s+sea\s+(a\s+)?domicilio|para\s+domicilio|mejor\s+domicilio|a\s+domicilio/i.test(textoOriginal);

  if (esCambioAMostrador || esCambioADomicilio) {
    const nuevoTipo = esCambioAMostrador ? "mostrador" : "domicilio";
    const camposActuales = datosCampos.get(clienteNumero) || {};
    camposActuales.tipoEntrega = nuevoTipo;
    tipoEntregaCliente.set(clienteNumero, nuevoTipo);
    if (esCambioAMostrador) {
      camposActuales.calle = null; camposActuales.colonia = null; camposActuales.referencia = null;
    }
    if (esCambioADomicilio) {
      const telActual = camposActuales.telefono || null;
      if (telActual) {
        const clienteBD = getCliente(telActual);
        if (clienteBD) {
          if (!camposActuales.calle)      camposActuales.calle      = clienteBD.calle_numero || null;
          if (!camposActuales.colonia)    camposActuales.colonia    = clienteBD.colonia      || null;
          if (!camposActuales.referencia) camposActuales.referencia = clienteBD.referencia   || null;
        }
      }
    }
    datosCampos.set(clienteNumero, camposActuales);
    const idxTipo = historial.findIndex(h => h.content && (h.content.includes("domicilio") || h.content.includes("mostrador")));
    if (idxTipo !== -1) historial[idxTipo].content = nuevoTipo === "mostrador" ? "Mi pedido es para recoger en mostrador." : "Mi pedido es a domicilio.";
    await msg.reply(`Perfecto! CambiÃ© tu pedido a ${nuevoTipo}. *Â¿QuÃ© deseas ordenar?*`);
    await new Promise(r => setTimeout(r, 300));
    await msg.reply(MENU_FORMATO);
    return;
  }

  // â”€â”€ CONFIRMACIÃ“N DEL ÃTEM â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€
  if (esperandoConfirmacionItem.has(clienteNumero)) {
    const itemData = esperandoConfirmacionItem.get(clienteNumero);

    const quiereModificar = /quit(a|ar|ame|amelo|amelos)|elimina|borra|cambia|sin\s+los?|no\s+(quiero|pongas?)\s+los?/i.test(textoOriginal);
    if (quiereModificar && pedidoJSONActual.has(clienteNumero)) {
      const jsonActual = pedidoJSONActual.get(clienteNumero);
      esperandoConfirmacionItem.delete(clienteNumero);
      historial.push({ role: "user", content: textoOriginal });
      historial.push({ role: "system", content: `El pedido actual en JSON es: ${JSON.stringify(jsonActual)}. El cliente quiere modificarlo. Devuelve el JSON actualizado con los cambios solicitados.` });
      if (historial.length > 15) historial.splice(2, 2);
      try {
        const systemPrompt = buildPrompt({ tomandoPedido: true, textoCliente: textoOriginal, horaConfirmada: horaEntregaPreventa.get(clienteNumero) || null, esPreventa });
        const respMod = await groq.chat.completions.create({
          model: "llama-3.3-70b-versatile", max_tokens: 400, temperature: 0.2,
          messages: [{ role: "system", content: systemPrompt }, ...historial],
        });
        const textoMod = respMod.choices[0]?.message?.content?.trim() || "";
        let jsonMod = null;
        try { jsonMod = JSON.parse(textoMod.replace(/```json|```/g, "").trim()); } catch (_) {}
        if (jsonMod && jsonMod.tipo === "pedido" && Array.isArray(jsonMod.items)) {
          pedidoJSONActual.set(clienteNumero, jsonMod);
          const resultado = jsonALineas(jsonMod);
          esperandoConfirmacionItem.set(clienteNumero, { lineas: resultado.texto });
          historial.push({ role: "assistant", content: textoMod });
          await msg.reply(resultado.texto + "\n\n*Â¿Es correcto?*");
          return;
        }
      } catch (e) { console.error("Error modificando JSON:", e.message); }
    }

    if (esRechazo || /^no$/i.test(textoOriginal.trim())) {
      esperandoConfirmacionItem.delete(clienteNumero);
      esperandoAgregarMas.delete(clienteNumero);
      const hist = getHistorial(clienteNumero);
      if (hist.length >= 2 && hist[hist.length - 1].role === "assistant")
        hist.splice(hist.length - 2, 2);
      await msg.reply("No pasa nada! *Â¿QuÃ© deseas ordenar?* ðŸ˜Š");
      await new Promise(r => setTimeout(r, 400));
      await msg.reply(MENU_FORMATO);
      return;
    }

    if (esConfirmacion) {
      esperandoConfirmacionItem.delete(clienteNumero);

      if (itemData._esModificacionResumen) {
        const ordenBase = (itemData.ordenBase || "").split("\n")
          .filter(l => {
            const t = l.trim();
            if (!t) return false;
            if (/^ðŸ“|^ðŸ“Œ|^ðŸ›µ|^ðŸ’µ|^ðŸ’°|^ðŸ’³|^ðŸ•–/u.test(t)) return false;
            if (/direcci[oÃ³]n|referencia|subtotal|tarifa|domicilio:\s*\$|total:/i.test(t)) return false;
            return true;
          }).join("\n");
        const jsonNuevo = itemData.jsonNuevo;
        const { texto: lineasNuevas } = jsonALineas(jsonNuevo);
        const lineasFiltradas = lineasNuevas.split("\n")
          .filter(l => {
            const t = l.trim();
            if (!t) return false;
            if (/^ðŸ“|^ðŸ“Œ|^ðŸ›µ|^ðŸ’µ|^ðŸ’°|^ðŸ’³|^ðŸ•–/u.test(t)) return false;
            if (/subtotal|tarifa|domicilio:\s*\$|direcci[oÃ³]n|referencia|total:/i.test(t)) return false;
            if (ordenBase.includes(t)) return false;
            return true;
          }).join("\n");
        const ordenCombinada = ordenBase ? ordenBase + "\n" + lineasFiltradas : lineasFiltradas;
        const resumenNuevo   = generarResumen(clienteNumero, ordenCombinada, esOrdenDom, esPreventa);
        resumenPendiente.set(clienteNumero, { texto: resumenNuevo.texto, esTransferencia: resumenNuevo.esTransferencia });
        esperandoAgregarMas.delete(clienteNumero);
        historial.push({ role: "user", content: "si, agrega" });
        historial.push({ role: "assistant", content: resumenNuevo.texto });
        persistirEstado(clienteNumero);
        await msg.reply(resumenNuevo.texto);
        return;
      }

      const ordenActual = esperandoAgregarMas.get(clienteNumero) || "";
      const lineasNuevas = itemData.lineas.split("\n")
        .filter(l => {
          const t = l.trim();
          if (!t) return false;
          if (/^ðŸ“|^ðŸ“Œ|^ðŸ›µ|^ðŸ’µ|^ðŸ’°|^ðŸ’³|^ðŸ•–/u.test(t)) return false;
          if (/subtotal|tarifa|direcci[oÃ³]n|referencia|total:/i.test(t)) return false;
          if (ordenActual.includes(t)) return false;
          return true;
        }).join("\n");
      const nuevaOrden = ordenActual ? ordenActual + "\n" + lineasNuevas : lineasNuevas;
      esperandoAgregarMas.set(clienteNumero, nuevaOrden);
      historial.push({ role: "user", content: "si, correcto" });
      historial.push({ role: "assistant", content: itemData.lineas });
      persistirEstado(clienteNumero);
      await msg.reply("*Â¿Deseas agregar algo mÃ¡s a tu pedido?*");
      return;
    }

    await msg.reply(itemData.lineas + "\n\n*Â¿Es correcto?*");
    return;
  }

  // â”€â”€ ESPERANDO SI AGREGA MÃS â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€
  if (esperandoAgregarMas.has(clienteNumero)) {
    if (esAgregarNo) {
      const ordenRaw = esperandoAgregarMas.get(clienteNumero);
      const ordenCompleta = ordenRaw.split("\n")
        .filter(l => {
          const t = l.trim();
          if (!t) return false;
          if (/^ðŸ“|^ðŸ“Œ|^ðŸ›µ|^ðŸ’µ|^ðŸ’°|^ðŸ’³|^ðŸ•–/u.test(t)) return false;
          if (/direcci[oÃ³]n|referencia|subtotal|tarifa|domicilio:\s*\$|total:/i.test(t)) return false;
          return true;
        }).join("\n");
      esperandoAgregarMas.delete(clienteNumero);
      const resumenGenerado = generarResumen(clienteNumero, ordenCompleta, esOrdenDom, esPreventa);
      resumenPendiente.set(clienteNumero, { texto: resumenGenerado.texto, esTransferencia: resumenGenerado.esTransferencia });
      historial.push({ role: "user", content: textoOriginal });
      historial.push({ role: "assistant", content: resumenGenerado.texto });
      await msg.reply(resumenGenerado.texto);
      return;
    }

    if (esAgregarSi) {
      const ordenActual = esperandoAgregarMas.get(clienteNumero) || "";
      const listaActual = formatearListaAcumulada(ordenActual);
      await msg.reply(listaActual);
      await new Promise(r => setTimeout(r, 400));
      await msg.reply(MENU_FORMATO);
      await new Promise(r => setTimeout(r, 400));
      await msg.reply("*Â¿QuÃ© mÃ¡s te gustarÃ­a agregar de nuestro menÃº?*");
      return;
    }
  }

  // Si hay resumen pendiente y el cliente manda un pedido nuevo, tratarlo como "agregar"
  if (resumenPendiente.has(clienteNumero)) {
    const pendienteActual = resumenPendiente.get(clienteNumero);
    const ordenExtraida = extraerOrdenDeResumen(pendienteActual.texto);
    const jsonNuevo = parsearPedidoSimple(textoOriginal);
    if (jsonNuevo && jsonNuevo.tipo === "pedido" && Array.isArray(jsonNuevo.items) && jsonNuevo.items.length > 0) {
      const resultadoNuevo = jsonALineas(jsonNuevo);
      pedidoJSONActual.set(clienteNumero, { _esModificacionResumen: true, ordenBase: ordenExtraida, jsonNuevo });
      esperandoConfirmacionItem.set(clienteNumero, { lineas: resultadoNuevo.texto, _esModificacionResumen: true, ordenBase: ordenExtraida, jsonNuevo });
      resumenPendiente.delete(clienteNumero);
      persistirEstado(clienteNumero);
      await msg.reply(resultadoNuevo.texto + "\n\n*Â¿Agrego esto a tu pedido?*");
      return;
    }
  }

  // â”€â”€ PRE-FILTRO SIN GROQ â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€
  const jsonSimple = parsearPedidoSimple(textoOriginal);
  if (jsonSimple && jsonSimple.tipo === "pedido") {
    pedidoJSONActual.set(clienteNumero, jsonSimple);
    persistirEstado(clienteNumero);
    const resultado = jsonALineas(jsonSimple);
    esperandoConfirmacionItem.set(clienteNumero, { lineas: resultado.texto });
    historial.push({ role: "user", content: textoOriginal });
    historial.push({ role: "assistant", content: resultado.texto });
    await msg.reply(resultado.texto + "\n\n*Â¿Es correcto?*");
    console.log(`Bot: [PARSER LOCAL] Subtotal: $${resultado.subtotal} â€” sin llamar a Groq`);
    return;
  }

  // â”€â”€ RESPUESTA AL CORTE PENDIENTE â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€
  if (esperandoCorte.has(clienteNumero)) {
    const t = textoOriginal.trim().toLowerCase().normalize("NFD").replace(/[\u0300-\u036f]/g, "");
    const CORTES_MAP = {
      surtido:"surtido", surtida:"surtido", mixto:"surtido", mixta:"surtido",
      carne:"carne", carner:"carne", masiza:"carne", maciza:"carne", carnita:"carne", carnitas:"carne",
      buche:"buche", buchito:"buche", buchon:"buche", buchones:"buche",
      cuero:"cuero", cueros:"cuero", cueritos:"cuero", cuerito:"cuero",
      lengua:"lengua", lenguita:"lengua", lenguitas:"lengua",
    };
    const matchCorteRespuesta = t.match(/\b(surtido|surtida|mixto|mixta|carne|carner|masiza|maciza|carnita|carnitas|buche|buchito|buchon|buchones|cuero|cueros|cueritos|cuerito|lengua|lenguita|lenguitas)\b/);
    const corteDetectado = matchCorteRespuesta ? CORTES_MAP[matchCorteRespuesta[1]] || null : null;
    if (corteDetectado) {
      const pedidoParcial = esperandoCorte.get(clienteNumero);
      const idx = pedidoParcial._indiceActual || 0;
      pedidoParcial.items[idx].corte = corteDetectado;
      const siguienteIdx = pedidoParcial.items.findIndex((item, i) => i > idx && !item.corte);
      if (siguienteIdx !== -1) {
        pedidoParcial._indiceActual = siguienteIdx;
        esperandoCorte.set(clienteNumero, pedidoParcial);
        const sigItem = pedidoParcial.items[siguienteIdx];
        const desc = sigItem.presentacion === "taco"   ? `los ${sigItem.cantidad} tacos`
                   : sigItem.presentacion === "torta"  ? `las ${sigItem.cantidad} tortas`
                   : sigItem.presentacion === "gramos" ? `los ${sigItem.gramos}g`
                   : `los $${sigItem.monto}`;
        await msg.reply(`*Â¿De quÃ© tipo de carne quieres ${desc}?*\nTenemos: Surtido, Carne, Buche, Cuero o Lengua`);
        return;
      }

      esperandoCorte.delete(clienteNumero);
      if (pedidoParcial._esModificacionResumen === true && pedidoParcial._ordenBase) {
        const jsonCompletoCorte = { tipo: "pedido", items: pedidoParcial.items };
        const { texto: lineasNuevas } = jsonALineas(jsonCompletoCorte);
        pedidoJSONActual.set(clienteNumero, { _esModificacionResumen: true, ordenBase: pedidoParcial._ordenBase, jsonNuevo: jsonCompletoCorte });
        esperandoConfirmacionItem.set(clienteNumero, { lineas: lineasNuevas, _esModificacionResumen: true, ordenBase: pedidoParcial._ordenBase, jsonNuevo: jsonCompletoCorte });
        historial.push({ role: "user", content: textoOriginal });
        historial.push({ role: "assistant", content: lineasNuevas });
        await msg.reply(lineasNuevas + "\n\n*Â¿Agrego esto a tu pedido?*");
        return;
      }

      const jsonCompletoCorte = { tipo: "pedido", items: pedidoParcial.items };
      pedidoJSONActual.set(clienteNumero, jsonCompletoCorte);
      persistirEstado(clienteNumero);
      const resultado = jsonALineas(jsonCompletoCorte);
      esperandoConfirmacionItem.set(clienteNumero, { lineas: resultado.texto });
      historial.push({ role: "user", content: textoOriginal });
      historial.push({ role: "assistant", content: resultado.texto });
      await msg.reply(resultado.texto + "\n\n*Â¿Es correcto?*");
      console.log(`Bot: [CORTE COMPLETADO] Subtotal: $${resultado.subtotal}`);
      return;
    }
  }

  // â”€â”€ DETECCIÃ“N SIN CORTE â€” preguntar antes de llamar a Groq â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€
  const tipoPedidoSinCorte = detectarSinCorte(textoOriginal);
  if (tipoPedidoSinCorte) {
    const pedidoParcial = parsearSinCorteItems(textoOriginal);
    if (pedidoParcial) {
      pedidoParcial._indiceActual = 0;
      esperandoCorte.set(clienteNumero, pedidoParcial);
      const primerItem = pedidoParcial.items[0];
      const desc = primerItem.presentacion === "taco"   ? `los ${primerItem.cantidad} tacos`
                 : primerItem.presentacion === "torta"  ? `las ${primerItem.cantidad} tortas`
                 : primerItem.presentacion === "gramos" ? `los ${primerItem.gramos}g`
                 : `los $${primerItem.monto}`;
      await msg.reply(`*Â¿De quÃ© tipo de carne quieres ${desc}?*\nTenemos: Surtido, Carne, Buche, Cuero o Lengua`);
    } else {
      await msg.reply("*Â¿De quÃ© tipo de carne lo quieres?*\nTenemos: Surtido, Carne, Buche, Cuero o Lengua");
    }
    return;
  }

  // â”€â”€ MODIFICACIONES SOBRE ÃTEM ACTUAL â€” sin Groq â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€
  if (esperandoAgregarMas.has(clienteNumero)) {
    const modificacion = detectarModificacion(textoOriginal);
    if (modificacion) {
      const ordenActual = esperandoAgregarMas.get(clienteNumero);
      const ordenModificada = aplicarModificacion(modificacion, ordenActual);
      if (ordenModificada) {
        esperandoAgregarMas.set(clienteNumero, ordenModificada);
        const { calcularSubtotal } = require("../pedido/precios");
        const subtotal = calcularSubtotal(ordenModificada);
        const lineas = ordenModificada.split("\n").filter(l => l.trim());
        await msg.reply(lineas.join("\n") + `\nðŸ’° Subtotal: $${subtotal}\n\n*Â¿Es correcto?*`);
        console.log(`Bot: [MODIFICACIÃ“N LOCAL] tipo: ${modificacion.tipo}`);
        return;
      }
    }
  }

  // â”€â”€ LLAMADA A GROQ â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€
  historial.push({ role: "user", content: textoOriginal });
  if (historial.length > 15) historial.splice(2, 2);

  try {
    const systemPrompt = buildPrompt({
      tomandoPedido:  true,
      textoCliente:   textoOriginal,
      horaConfirmada: horaEntregaPreventa.get(clienteNumero) || null,
      esPreventa,
    });

    const respuestaGroq = await groq.chat.completions.create({
      model: "llama-3.3-70b-versatile",
      max_tokens: 400,
      temperature: 0.2,
      messages: [{ role: "system", content: systemPrompt }, ...historial],
    });

    let respuestaTexto = respuestaGroq.choices[0]?.message?.content?.trim() || "";
    historial.push({ role: "assistant", content: respuestaTexto });

    let jsonData = null;
    try {
      const clean = respuestaTexto.replace(/```json|```/g, "").trim();
      jsonData = JSON.parse(clean);
    } catch (_) {}

    if (jsonData && jsonData.tipo === "pedido" && Array.isArray(jsonData.items)) {
      pedidoJSONActual.set(clienteNumero, jsonData);
      persistirEstado(clienteNumero);
      const resultado = jsonALineas(jsonData);
      esperandoConfirmacionItem.set(clienteNumero, { lineas: resultado.texto });
      await replyConTyping(msg, resultado.texto + "\n\n*Â¿Es correcto?*");
      console.log(`Bot: [JSONâ†’LÃNEAS] Subtotal: $${resultado.subtotal}`);
      return;
    }

    if (jsonData && jsonData.tipo === "pregunta" && jsonData.mensaje) {
      await replyConTyping(msg, jsonData.mensaje);
      return;
    }

    if (jsonData && jsonData.tipo === "info" && jsonData.mensaje) {
      await replyConTyping(msg, jsonData.mensaje);
      if (!enFlujoActivo(clienteNumero)) await replyConTyping(msg, MENU_FORMATO);
      return;
    }

    if (respuestaTexto) {
      await replyConTyping(msg, respuestaTexto);
      console.log(`Bot: ${respuestaTexto.substring(0, 80)}...`);
      if (!enFlujoActivo(clienteNumero)) await replyConTyping(msg, MENU_FORMATO);
    } else {
      await msg.reply("Disculpa, no entendi. Me repites tu pedido?");
    }

  } catch (error) {
    console.error("Error:", error.message);
    try { await msg.reply("Disculpa, tuve un problemita. Me vuelves a decir que quieres?"); } catch (_) {}
  }
}

module.exports = { handleMensaje };
