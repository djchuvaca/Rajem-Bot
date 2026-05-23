const Groq = require("groq-sdk");
const { detectarTipoEntrega } = require("./entrega");
const { buildPrompt } = require("../prompts/index");
const { calcularSubtotal, getPrecios } = require("../pedido/precios");
const { parsearPedidoSimple, detectarSinCorte, detectarSinTipo, detectarPreguntaFrecuente, detectarModificacion, detectarRepetirPedido, getCortes } = require("./pedidoParser");
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
  esperandoTipoItem,
  detectarEdicion,
  aplicarEdicion,
} = require("../estado");

const groq = new Groq({ apiKey: process.env.GROQ_API_KEY });
const { upsertCliente, registrarPedido, actualizarEstadoPedido, getCliente, guardarTelefonoReal, getTelefonoReal, guardarUltimoPedido, getUltimoPedido, guardarJIDReal } = require("../db");

// Clientes frecuentes
const telefonosReales = new Map();
const ultimoPedido = new Map();

// Timeout de sesiones zombi: limpiar clientes inactivos después de 45 minutos
const ultimaActividad = new Map();
const TIMEOUT_SESION_MS = 45 * 60 * 1000;
setInterval(() => {
  const ahora = Date.now();
  for (const [numero, ts] of ultimaActividad.entries()) {
    if (ahora - ts > TIMEOUT_SESION_MS && enFlujoActivo(numero)) {
      console.log(`[TIMEOUT] Limpiando sesión inactiva: ${numero}`);
      limpiarTodo(numero);
      clientesNuevos.delete(numero);
      esperandoTipoItem.delete(numero);
      ultimaActividad.delete(numero);
    }
  }
}, 10 * 60 * 1000);

function enFlujoActivo(clienteNumero) {
  return esperandoCorte.has(clienteNumero)
    || esperandoConfirmacionItem.has(clienteNumero)
    || esperandoAgregarMas.has(clienteNumero)
    || datosRecibidos.has(clienteNumero)
    || resumenPendiente.has(clienteNumero)
    || esperandoEdicion.has(clienteNumero)
    || esperandoConfirmacionDatos.has(clienteNumero)
    || esperandoTipoItem.has(clienteNumero);
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

// â"€â"€ PARSER SIN CORTE â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€
function parsearSinCorteItems(texto) {
  const MEDIDAS_ITEMS = [
    { re: /\bun\s+cuarto\b|\b1\/4\b|\b250\s*g/i,           gramos: 250  },
    { re: /\bmedio\s+kilo\b|\bmedio\b|\b1\/2\b|\b500\s*g/i, gramos: 500  },
    { re: /\btres\s+cuartos\b|\b3\/4\b|\b750\s*g/i,        gramos: 750  },
    { re: /\bun\s+kilo\b|\b1\s*kg\b|\b1000\s*g/i,          gramos: 1000 },
  ];
  const partes = texto
    .split(/,\s*(?:y\s+)?|\s+y\s+tambi[eé]n\s+|\s+y\s+(?=\d|\bun\b|\bmedio\b|\btres\b|\b1\/)/i)
    .map(p => p.trim().replace(/^y\s+/i, ""))
    .filter(Boolean);
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
    if (matchMonto && parseInt(matchMonto[1]) > 40) { items.push({ presentacion: "pesos", monto: parseInt(matchMonto[1]), corte }); continue; }
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
  texto = texto
    .replace(/\bsiete\s+y\s+media\b/gi, "7:30")
    .replace(/\bocho\s+y\s+media\b/gi,  "8:30")
    .replace(/\bnueve\s+y\s+media\b/gi,  "9:30")
    .replace(/\bdiez\s+y\s+media\b/gi,  "10:30")
    .replace(/\bonce\s+y\s+media\b/gi,  "11:30")
    .replace(/\bdoce\s+y\s+media\b/gi,  "12:30")
    .replace(/\bsiete\b/gi,  "7").replace(/\bocho\b/gi,  "8")
    .replace(/\bnueve\b/gi,  "9").replace(/\bdiez\b/gi,  "10")
    .replace(/\bonce\b/gi,  "11").replace(/\bdoce\b/gi,  "12");
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
  ultimaActividad.set(clienteNumero, Date.now());
  // Deshabilitar link previews en todas las respuestas de este handler
  const _origReply = msg.reply.bind(msg);
  msg.reply = (content, chatId, opts = {}) => {
    if (typeof content === 'string') console.log('[Bot]: ' + content.substring(0, 200) + (content.length > 200 ? '...' : ''));
    return _origReply(content, chatId, { linkPreview: false, ...opts });
  };

  // â"€â"€ ESPERANDO CAPTURA â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€
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
              `Solicitud de Cancelacion\nHora: ${horaCancel}\nCliente: (canceló antes de enviar captura)\nTelefono: ${datosCaptura?.telefono || "—"}\nMotivo: Canceló durante espera de transferencia`
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
          console.log(`Bot: [RESPUESTA AUTOMÁTICA] tipo: ${_pregFaqCap.tipo}`);
          await replyConTyping(msg, _respFaqCap);
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

  if (msg.type === 'ptt' || (msg.hasMedia && msg.type === 'audio')) {
    if (esperandoCaptura.has(clienteNumero)) {
      await msg.reply("Necesito la *captura de pantalla* de tu transferencia, no una nota de voz. 📸");
    } else {
      await msg.reply("Solo proceso mensajes de texto. Escríbeme tu pedido y con gusto te atiendo 😊");
    }
    return;
  }
  if (!msg.body || !msg.body.trim()) return;
  let textoOriginal = msg.body.trim();
  if (/^[👍✅☑🙌💯👌🤙]+$/u.test(textoOriginal)) textoOriginal = "si";
  else if (/^[👎❌🚫🙅]+$/u.test(textoOriginal)) textoOriginal = "no";
  if (textoOriginal.length < 2) return;

  // Ignorar previews automáticos de WhatsApp
  if (/^[\w.-]+\.[a-z]{2,}$/i.test(textoOriginal)) return;
  if (/^https?:\/\//i.test(textoOriginal)) return;
  if (/^[\w.+-]+@[\w-]+\.[a-z]{2,}$/i.test(textoOriginal) && datosRecibidos.has(clienteNumero)) return;
  if (/^[a-z0-9.-]+\.[a-z]{2,}(\n[\w.+-]+@[\w-]+\.[a-z]{2,})?(\n[a-z0-9.-]+\.[a-z]{2,})?$/i.test(textoOriginal.trim())) return;

  console.log(`\n[Usuario ${clienteNumero}]: ${textoOriginal}`);

  // â"€â"€ PREGUNTAS FRECUENTES â€" disponibles en toda la conversación â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€
  // Se omite si el cliente está en un flujo activo para evitar colisiones de palabras clave
  {
    const _pregFaq = !enFlujoActivo(clienteNumero) ? detectarPreguntaFrecuente(textoOriginal) : null;
    if (_pregFaq) {
      const _histFaq = getHistorial(clienteNumero);
      const _esDomFaq = tipoEntregaCliente.get(clienteNumero) === "domicilio"
        || (tipoEntregaCliente.get(clienteNumero) == null && _histFaq.some(h => h.content && h.content.includes("domicilio")));
      const _respFaq = generarRespuestaAutomatica(_pregFaq, { esDomicilio: _esDomFaq });
      if (_respFaq) {
        if (!clientesNuevos.has(clienteNumero)) clientesNuevos.add(clienteNumero);
        console.log(`Bot: [RESPUESTA AUTOMÁTICA] tipo: ${_pregFaq.tipo}`);
        await replyConTyping(msg, _respFaq);
        if (!estaEnHorario() && !clientesPreventa.has(clienteNumero)) {
          await replyConTyping(msg, mensajeFueraDeHorario());
        } else if (estaEnHorario() && !enFlujoActivo(clienteNumero)) {
          if (_histFaq.length > 0 && !datosRecibidos.has(clienteNumero)) {
            // En medio del formulario — re-mostrar progreso en vez de MENU_FORMATO
            const _camposFaqForm = datosCampos.get(clienteNumero) || {};
            const _esDomFaqForm  = _camposFaqForm.tipoEntrega === "domicilio";
            const _esPrevFaqForm = clientesPreventa.has(clienteNumero);
            const _formFaqResp   = mostrarFormularioProgresivo(clienteNumero, _esDomFaqForm, _esPrevFaqForm);
            const _faltFaqResp   = siguienteCampoFaltante(clienteNumero, _esDomFaqForm, _esPrevFaqForm);
            await replyConTyping(msg, _formFaqResp + (_faltFaqResp ? "\n\n" + _faltFaqResp.pregunta : "\n\n*¿Son correctos los datos?*"));
          } else {
            await replyConTyping(msg, MENU_FORMATO);
          }
        }
        return;
      }
    }
  }

  const quiereCancelar = /cancelar|cancela|cancel|cancelo|cancelame|cancelado|ya no quiero|ya no/i.test(textoOriginal);
  const quiereEmpezarDeNuevo = /\b(empez(?:ar|emos)\s+de\s+nuevo|reinici(?:ar|o)|volver\s+a\s+empezar|otro\s+pedido|nuevo\s+pedido|quiero\s+(?:hacer\s+)?otro\s+pedido|olvida(?:mos)?\s+(?:todo|mi\s+pedido)|borremos?\s+todo)\b/i.test(textoOriginal);

  // â"€â"€ CANCELACIÓN DE PEDIDO CONFIRMADO â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€
  if (pedidosConfirmados.has(clienteNumero)) {
    const datosPedido = pedidosConfirmados.get(clienteNumero);
    const minutosTranscurridos = (Date.now() - (datosPedido.confirmadoEn || 0)) / 60000;
    if (quiereCancelar) {
      if (minutosTranscurridos > 15) {
        await msg.reply("Lo sentimos, el tiempo para cancelar tu pedido ya venció (15 minutos).\nSi tienes algún problema, comunícate directamente con nosotros. Gracias por tu comprensión!");
        return;
      }
      esperandoMotivoCancelacion.set(clienteNumero, { nombre: datosPedido.nombre, telefono: datosPedido.telefono, notificarGrupo: true });
      pedidosConfirmados.delete(clienteNumero);
      clientesNuevos.delete(clienteNumero);
      await msg.reply("Lamento escuchar eso. *¿Podrías indicarme el motivo de tu cancelación?*");
      return;
    }
    const minRestantes = Math.max(0, Math.ceil(15 - minutosTranscurridos));
    const _msgPedConf = "Tu pedido ya fue recibido y esta en espera de confirmacion de nuestro equipo.\n" +
      (minRestantes > 0 ? `Si deseas cancelarlo tienes ${minRestantes} minuto${minRestantes !== 1 ? "s" : ""} para escribir *cancelar*.\n\n` : "El tiempo para cancelar ya venció.\n\n") +
      "_Si deseas hacer un nuevo pedido escribe *nuevo pedido*._";
    await msg.reply(_msgPedConf);
    if (quiereEmpezarDeNuevo) {
      pedidosConfirmados.delete(clienteNumero);
      clientesNuevos.delete(clienteNumero);
      limpiarTodo(clienteNumero);
      await replyConTyping(msg, SALUDO);
    }
    return;
  }

  // â"€â"€ MOTIVO DE CANCELACIÓN â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€
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
    esperandoTipoItem.delete(clienteNumero);
    try { actualizarEstadoPedido(datosCancelacion.telefono, "cancelado"); } catch (e) {}
    await msg.reply("Tu solicitud de cancelacion fue enviada a nuestro equipo.\nEn breve se comunicaran contigo para confirmarte. Disculpa los inconvenientes!");
    return;
  }

  // â"€â"€ 1. PRIMER MENSAJE â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€
  if (!clientesNuevos.has(clienteNumero)) {
    clientesNuevos.add(clienteNumero);
    if (!estaEnHorario()) { await replyConTyping(msg, mensajeFueraDeHorario()); return; }
    await replyConTyping(msg, SALUDO);
    // Si el primer mensaje ya incluye tipo de entrega, continuar el flujo sin esperar otro mensaje
    const _tNormPrimer = textoOriginal.toLowerCase().normalize("NFD").replace(/[̀-ͯ]/g, "");
    if (!/\bdomicilio\b|\benvio\b|\ba\s+casa\b|\bmostrador\b|\brecoger\b|\bpara\s+llevar\b/.test(_tNormPrimer)) return;
    // fall through al bloque de tipo de entrega
  }

  // â"€â"€ 1B. FUERA DE HORARIO â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€
  if (!estaEnHorario() && !clientesPreventa.has(clienteNumero)) {
    const aceptaPreventa  = /^(si|sí|s[ií]\s+por\s+fa(vor)?|ok|okey|va|dale|quiero|claro|adelante|sale|andale|ándale|órale|orale|de\s+una|venga|eso|perfecto|listo|con\s+gusto|me\s+apunto|apuntame|ponme|anotame|anota(me)?|por\s+fa(vor)?|please|plis|sip|sep|simón|simon|chido|chale\s+va|esta\s+bien|está\s+bien|bueno|bien|ah\s+si|ah\s+sí)$/i.test(textoOriginal.trim());
    const rechazaPreventa = /^(no|nel|nop|nope|nah|naa|para\s+nada|nones|negativo|nei|nein|no\s+gracias|no\s+gra(s|cias)?|no\s+por\s+fa(vor)?|mejor\s+no|al\s+rato|luego|despues|después|ahorita\s+no|otro\s+dia|otro\s+día|mañana)$/i.test(textoOriginal.trim());
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

  // â"€â"€ RESPUESTA A EDICIÓN PENDIENTE â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€
  if (esperandoEdicion.has(clienteNumero)) {
    const edicionPendiente = esperandoEdicion.get(clienteNumero);
    const esOrdenDomEdit = tipoEntregaCliente.get(clienteNumero) === "domicilio"
      || (tipoEntregaCliente.get(clienteNumero) == null && historial.some(h => h.content && h.content.includes("domicilio")));
    let valorNuevo = textoOriginal.trim();

    if (edicionPendiente.campo === "telefono") {
      const _telEditMatch = valorNuevo.match(/(?:\+?52\s*)?(\d{3}[\s.-]?\d{3}[\s.-]?\d{4}|\d{10})/);
      if (_telEditMatch) valorNuevo = _telEditMatch[1].replace(/[\s.-]/g, "");
      if (!/^\d{10}$/.test(valorNuevo)) {
        await msg.reply("El número debe tener exactamente 10 dígitos. *¿Cuál es tu nuevo teléfono?*");
        return;
      }
    }

    if (edicionPendiente.campo === "metodo") {
      const vNorm = valorNuevo.toLowerCase().normalize("NFD").replace(/[\u0300-\u036f]/g, "");
      const metodoValido = /^(efectivo|tarjeta|transferencia)$/.test(vNorm);
      if (!metodoValido) {
        const pregMetodo = esOrdenDomEdit
          ? "*¿Cómo vas a pagar?* Efectivo o transferencia."
          : "*¿Cómo vas a pagar?* Efectivo, tarjeta o transferencia.";
        await msg.reply("Opción no válida. " + pregMetodo);
        return;
      }
      if (esOrdenDomEdit && /tarjeta/i.test(valorNuevo)) {
        await msg.reply("Para pedidos a domicilio solo aceptamos *efectivo o transferencia*. *¿Cuál prefieres?*");
        return;
      }
      valorNuevo = vNorm;
    }

    if (edicionPendiente.campo === "hora") {
      const horaValida = validarHora(valorNuevo);
      if (!horaValida) {
        await msg.reply("Esa hora está fuera de nuestro horario. *¿A qué hora deseas tu pedido?* (entre 7:00 a.m. y 12:30 p.m.)");
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
      await msg.reply("Perfecto! Aquí está tu pedido actualizado:\n\n" + resumenNuevo.texto);
    } else if (edicionPendiente.contexto === 'agregarMas') {
      if (edicionPendiente.ordenTexto !== undefined)
        esperandoAgregarMas.set(clienteNumero, edicionPendiente.ordenTexto);
      const _formEdAg = mostrarFormularioProgresivo(clienteNumero, esOrdenDomEdit, esPreventa);
      await msg.reply('Perfecto! Datos actualizados:\n\n' + _formEdAg + '\n\n*¿Qué deseas ordenar?*');
    } else if (edicionPendiente.contexto === "formulario") {
      const camposAct = datosCampos.get(clienteNumero) || {};
      const esDomForm = camposAct.tipoEntrega === "domicilio";
      const formActualizado = mostrarFormularioProgresivo(clienteNumero, esDomForm, esPreventa);
      await msg.reply("Perfecto! Datos actualizados:\n\n" + formActualizado + "\n\n*¿Son correctos los datos?*");
    }
    return;
  }

  // â"€â"€ 1C. CONFIRMACIÓN DE DATOS PRECARGADOS (cliente frecuente) â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€
  if (esperandoConfirmacionDatos.has(clienteNumero)) {
    const { tipoEntrega, esPreventa: esPreventaDatos } = esperandoConfirmacionDatos.get(clienteNumero);
    const esOrdenDom = tipoEntrega === "domicilio";
    const confirma = /^(si|sí|s[ií]\s+por\s+fa(vor)?|ok|okey|va|dale|claro|correcto|sale|andale|ándale|órale|orale|perfecto|exacto|listo|así\s+es|asi\s+es|de\s+una|eso\s+es|correcto|afirmativo|todo\s+bien|está\s+bien|esta\s+bien|sip|sep|simón|simon|chido|bueno|bien|me\s+late|nel\s+az|efectivamente|positivo)$/i.test(textoOriginal.trim());
    const niega    = /^(no|nel|nop|nope|nah|incorrecto|cambia(r|me)?|cambio|error|no\s+es\s+correcto|no\s+est[aá]\s+bien|está\s+mal|esta\s+mal|hay\s+un\s+error|modifica(r|me)?|corrige|corr[íi]gelo|actualiza)$/i.test(textoOriginal.trim());

    // â"€â"€ EDICIÓN DESDE FORMULARIO (cliente frecuente) â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€
    const edicionForm = detectarEdicion(textoOriginal);
    if (edicionForm && !confirma && !niega) {
      if (edicionForm.campo === "metodo" && edicionForm.preguntar) {
        const pregMetodo = esOrdenDom
          ? "*¿Cómo vas a pagar?* Efectivo o transferencia."
          : "*¿Cómo vas a pagar?* Efectivo, tarjeta o transferencia.";
        esperandoEdicion.set(clienteNumero, { campo: "metodo", contexto: "formulario" });
        await msg.reply(pregMetodo);
        return;
      }
      if (edicionForm.campo === "metodo" && !edicionForm.preguntar) {
        if (esOrdenDom && /tarjeta/i.test(edicionForm.valor)) {
          await msg.reply("Para pedidos a domicilio solo aceptamos *efectivo o transferencia*. *¿Cuál prefieres?*");
          esperandoEdicion.set(clienteNumero, { campo: "metodo", contexto: "formulario" });
          return;
        }
        aplicarEdicion(clienteNumero, edicionForm);
        const formAct = mostrarFormularioProgresivo(clienteNumero, esOrdenDom, esPreventa);
        await msg.reply("Perfecto! Datos actualizados:\n\n" + formAct + "\n\n*¿Son correctos los datos?*");
        return;
      }
      if (edicionForm.campo === "quitar_item") {
        await msg.reply("Solo puedes quitar productos desde el resumen final. *¿Son correctos los datos?*");
        return;
      }
      if (edicionForm.preguntar) {
        esperandoEdicion.set(clienteNumero, { campo: edicionForm.campo, contexto: "formulario" });
        await msg.reply(edicionForm.pregunta);
        return;
      }
      aplicarEdicion(clienteNumero, edicionForm);
      const formAct = mostrarFormularioProgresivo(clienteNumero, esOrdenDom, esPreventa);
      await msg.reply("Perfecto! Datos actualizados:\n\n" + formAct + "\n\n*¿Son correctos los datos?*");
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
        historial.push({ role: "assistant", content: "Datos confirmados. Menú enviado." });
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
        "\n\n*¿Qué dato deseas corregir?*\n" +
        "_Dime cuál, por ejemplo: \"cambia mi nombre\", \"cambia mi teléfono\", \"cambia mi método de pago\"._"
      );
      return;
    }

    const formCompleto = mostrarFormularioProgresivo(clienteNumero, esOrdenDom, esPreventaDatos);
    await msg.reply(formCompleto + "\n\n*¿Son correctos los datos?*");
    return;
  }

  // â"€â"€ 2. TIPO DE ENTREGA â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€
  if (historial.length === 0) {
    const _tNormEntrega = textoOriginal.toLowerCase().normalize("NFD").replace(/[̀-ͯ]/g, "");
    const _esMostradorLocal = /\bpara\s+llevar\b|\bpa[`']?\s*llevar\b|\bpaso\s+(yo\s+)?a\s+recoger\b|\bvoy\s+a?\s*recoger\b|\bme\s+(?:lo\s+)?llevo\b|\bpara\s+recoger\b|\blo\s+recojo\b|\byo\s+(recojo|paso\b)/.test(_tNormEntrega);
    const tipoEntrega = _esMostradorLocal ? "mostrador" : await detectarTipoEntrega(textoOriginal);
    if (tipoEntrega === "ninguno") { await msg.reply("*¿Tu pedido será para domicilio o pasas a recoger al mostrador?*"); return; }

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
        correo:      clienteBD.correo || "no proporcionó",
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
      await msg.reply(`Hola de nuevo *${campos.nombre.split(" ")[0]}*! ðŸ˜Š Encontramos tus datos:\n\n${formPrecargado}\n\n*¿Son correctos los datos?*`);
      console.log(`Bot: [CLIENTE FRECUENTE â€" datos precargados]`);
      return;
    }

    let telAutodetectado = telefonosReales.get(clienteNumero) || getTelefonoReal(clienteNumero) || null;
    if (!telAutodetectado) {
      try {
        const contacto = await msg.getContact();
        const _numRaw  = (contacto.number || "").replace(/\D/g, "");
        const sinPais  = _numRaw.length > 10 ? _numRaw.slice(-10) : _numRaw;
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

  // â"€â"€ 2B. CANCELACIÓN DURANTE EL PEDIDO â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€
  if (quiereCancelar) {
    clientesNuevos.delete(clienteNumero);
    limpiarTodo(clienteNumero);
    esperandoTipoItem.delete(clienteNumero);
    await msg.reply("Tu pedido ha sido cancelado. Cuando gustes ordenar, aqui estaremos. Hasta pronto!");
    return;
  }

  if (quiereEmpezarDeNuevo && enFlujoActivo(clienteNumero)) {
    limpiarTodo(clienteNumero);
    esperandoTipoItem.delete(clienteNumero);
    await msg.reply("Listo! Empezamos de nuevo. 😊\n\n*¿Tu pedido será para domicilio o pasas a recoger al mostrador?*");
    return;
  }

  // â"€â"€ 2C. CAMBIO DE TIPO DURANTE FORMULARIO â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€
  if (!datosRecibidos.has(clienteNumero)) {
    const esCambioDomicilio = /cambi(a|ar|ame|amelo|arme)\s*(a|al|para|el)?\s*domicilio/i.test(textoOriginal)
      || /quiero\s*(que\s*)?(sea\s*)?a\s*domicilio/i.test(textoOriginal)
      || /mejor\s*(a\s*)?domicilio/i.test(textoOriginal)
      || /que\s+sea\s+(a\s+)?domicilio/i.test(textoOriginal)
      || /para\s+domicilio/i.test(textoOriginal)
      || /mejor\s*(que\s*)?(me\s*)?(lo\s*)?(env[íi]a|manda|lleva|trae)(melo|me|lo)?/i.test(textoOriginal)
      || /^(env[íi]amelo|mandamelo|traemelo|llevamelo|mandalos|traelos)$/i.test(textoOriginal.trim());
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
        (esCambioDomicilio ? "Perfecto, cambié tu pedido a domicilio!\n\n" : "Perfecto, cambié tu pedido a mostrador!\n\n") +
        formActualizado +
        (sfaltante ? "\n\n" + sfaltante.pregunta : "")
      );
      return;
    }
  }

  // â"€â"€ 3. FORMULARIO PROGRESIVO â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€
  if (!datosRecibidos.has(clienteNumero)) {
    const camposActualesFormulario = datosCampos.get(clienteNumero) || {};
    const esOrdenDomicilio = camposActualesFormulario.tipoEntrega === "domicilio"
      || (camposActualesFormulario.tipoEntrega == null && tipoEntregaCliente.get(clienteNumero) === "domicilio");

    const esConfirmacionDatos = /^(si|sí|ok|okey|va|dale|claro|correcto|listo|sip|sep|exacto|perfecto|todo\s+bien|está\s+bien|esta\s+bien|así\s+es|asi\s+es|afirmativo|bueno|bien)$/i.test(textoOriginal.trim());
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

    // Si el cliente manda un comando de edición durante el llenado, redirigir al checkpoint de confirmación
    if (detectarEdicion(textoOriginal)) {
      const faltanteActual = siguienteCampoFaltante(clienteNumero, esOrdenDomicilio, esPreventa);
      const formActual = mostrarFormularioProgresivo(clienteNumero, esOrdenDomicilio, esPreventa);
      await msg.reply(
        "Puedes corregir tus datos cuando te muestre el resumen completo y te pregunte si son correctos. ðŸ˜Š\n\n" +
        formActual +
        (faltanteActual ? "\n\n" + faltanteActual.pregunta : "\n\n*¿Son correctos los datos?*")
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
      await msg.reply(formProgresivo + "\n\n" + msgHora + "\n*¿A qué hora deseas " + tipoPedido + "?* (entre 7:00 a.m. y 12:30 p.m.)");
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
  // Solo guardar si parece un correo válido
  if (/[\w.+-]+@[\w-]+\.[a-z]{2,}/i.test(textoOriginal.trim())) {
    camposActuales.correo = textoOriginal.trim();
    datosCampos.set(clienteNumero, camposActuales);
    persistirEstado(clienteNumero);
  }
}
    }

    // Extrae teléfono de mensajes como "mi número es 664 123 4567" o "664-123-4567"
    {
      const _camposFormPre = datosCampos.get(clienteNumero) || {};
      if (!_camposFormPre.telefono) {
        const _telMatch = textoOriginal.match(/(?:\+?52\s*)?(\d{3}[\s.-]?\d{3}[\s.-]?\d{4}|\d{10})/);
        if (_telMatch) {
          const _telLimpio = _telMatch[1].replace(/[\s.-]/g, "");
          if (_telLimpio && _telLimpio.length === 10) {
            _camposFormPre.telefono = _telLimpio;
            datosCampos.set(clienteNumero, _camposFormPre);
          }
        }
      }
    }
    // Extrae calle + colonia de mensajes como "Av. Reforma 456, Col. Centro"
    {
      const _camposDirPre = datosCampos.get(clienteNumero) || {};
      const _esDomDir = _camposDirPre.tipoEntrega === "domicilio";
      if (_esDomDir && !_camposDirPre.calle && !_camposDirPre.colonia) {
        const _matchComa = textoOriginal.match(/^(.+?),\s*(.+)$/);
        if (_matchComa) {
          const _parte1 = _matchComa[1].trim();
          const _coloniaRaw = _matchComa[2].trim();
          const _coloniaLimpia = _coloniaRaw.replace(/^col(?:onia)?\.?\s*/i, "").trim();
          if (_parte1.length > 3 && _coloniaLimpia.length > 2 && /\d/.test(_parte1)) {
            _camposDirPre.calle = _parte1;
            _camposDirPre.colonia = _coloniaLimpia;
            datosCampos.set(clienteNumero, _camposDirPre);
          }
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
      if (!camposActuales.correo) { camposActuales.correo = "no proporcionó"; correoPreguntas.add(clienteNumero); }
      if (esOrdenDomicilio && !camposActuales.referencia) { camposActuales.referencia = "sin referencia"; referenciaPreguntas.add(clienteNumero); }
      datosCampos.set(clienteNumero, camposActuales);
      persistirEstado(clienteNumero);
      const formActualizado = mostrarFormularioProgresivo(clienteNumero, esOrdenDomicilio, esPreventa);
      await msg.reply(formActualizado + "\n\n*¿Son correctos los datos?*");
    }
    return;
  }

  // â"€â"€ 4. CONFIRMACIÓN FINAL DEL PEDIDO â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€
  const palabrasConfirmacion = /^(si|sí|s[ií]\s+por\s+fa(vor)?|ok|okey|va|dale|listo|sale|andale|ándale|adelante|confirmo|confirmado|correcto|asi|así|si\s+porfavor|sí\s+porfavor|si\s+por\s+favor|sí\s+por\s+favor|claro|perfecto|va\s+bien|dale\s+pues|ándale|órale|orale|va\s+que\s+va|de\s+una|eso\s+es|así\s+es|asi\s+es|todo\s+bien|está\s+bien|esta\s+bien|sip|sep|simón|simon|chido|bueno|bien|afirmativo|positivo|exacto|exactamente|procede|proceder|pa\s+delante|p'adelante|con\s+eso|con\s+eso\s+voy|va\s+ese|nel\s+az|ya|ya\s+dale|ya\s+pues|ya\s+va)$/i;

  // â"€â"€ EDICIÓN DESDE RESUMEN PENDIENTE â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€
  if (resumenPendiente.has(clienteNumero)) {
    if (/^(no|nel|nop|nope|no\s+est[aá]\s+bien|no\s+es\s+correcto|est[aá]\s+mal|hay\s+un\s+error|no\s+es\s+lo\s+que\s+ped[ií]|incorrecto|incompleto|falta\s+algo|no\s+coincide)$/i.test(textoOriginal.trim())) {
      await msg.reply("Entendido! ¿Qué deseas cambiar?\n\n_Por ejemplo: \"cambia la carne por buche\", \"quita los tacos\" o \"cambia el método de pago\"._");
      return;
    }
    const edicion = detectarEdicion(textoOriginal);
    if (edicion) {
      const pendienteActual = resumenPendiente.get(clienteNumero);
      const ordenExtraida = extraerOrdenDeResumen(pendienteActual.texto);
      const esOrdenDomEdit = historial.some(h => h.content && h.content.includes("domicilio"));

      // QUITAR ÍTEM
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
        return;
      }

      // MÉTODO â€" preguntar
      if (edicion.campo === "metodo" && edicion.preguntar) {
        const pregMetodo = esOrdenDomEdit
          ? "*¿Cómo vas a pagar?* Efectivo o transferencia."
          : "*¿Cómo vas a pagar?* Efectivo, tarjeta o transferencia.";
        esperandoEdicion.set(clienteNumero, { campo: "metodo", contexto: "resumen", ordenTexto: ordenExtraida });
        await msg.reply(pregMetodo);
        return;
      }

      // MÉTODO â€" valor directo, validar tarjeta en domicilio
      if (edicion.campo === "metodo" && !edicion.preguntar) {
        if (esOrdenDomEdit && /tarjeta/i.test(edicion.valor)) {
          await msg.reply("Para pedidos a domicilio solo aceptamos *efectivo o transferencia*. *¿Cuál prefieres?*");
          esperandoEdicion.set(clienteNumero, { campo: "metodo", contexto: "resumen", ordenTexto: ordenExtraida });
          return;
        }
        aplicarEdicion(clienteNumero, edicion);
        const resumenNuevo = generarResumen(clienteNumero, ordenExtraida, esOrdenDomEdit, esPreventa);
        resumenPendiente.set(clienteNumero, { texto: resumenNuevo.texto, esTransferencia: resumenNuevo.esTransferencia });
        persistirEstado(clienteNumero);
        await msg.reply("Perfecto! Aquí está tu pedido actualizado:\n\n" + resumenNuevo.texto);
        return;
      }

      // HORA â€" validar rango
      if (edicion.campo === "hora" && !edicion.preguntar) {
        const horaValida = validarHora(edicion.valor);
        if (!horaValida) {
          await msg.reply("Esa hora está fuera de nuestro horario. *¿A qué hora deseas tu pedido?* (entre 7:00 a.m. y 12:30 p.m.)");
          esperandoEdicion.set(clienteNumero, { campo: "hora", contexto: "resumen", ordenTexto: ordenExtraida });
          return;
        }
        edicion.valor = horaValida;
        aplicarEdicion(clienteNumero, edicion);
        horaEntregaPreventa.set(clienteNumero, horaValida);
        const resumenNuevo = generarResumen(clienteNumero, ordenExtraida, esOrdenDomEdit, esPreventa);
        resumenPendiente.set(clienteNumero, { texto: resumenNuevo.texto, esTransferencia: resumenNuevo.esTransferencia });
        persistirEstado(clienteNumero);
        await msg.reply("Perfecto! Aquí está tu pedido actualizado:\n\n" + resumenNuevo.texto);
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
      await msg.reply("Perfecto! Aquí está tu pedido actualizado:\n\n" + resumenNuevo.texto);
      return;
    }
  }

  // â"€â"€ CAMBIO A DOMICILIO DESDE RESUMEN â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€
  if (resumenPendiente.has(clienteNumero) && (
    /cambi(a|ar|ame|amelo|arme)\s*(a|al|para)\s*domicilio/i.test(textoOriginal)
    || /mejor\s*(a\s*)?domicilio/i.test(textoOriginal)
    || /que\s+sea\s+(a\s+)?domicilio/i.test(textoOriginal)
    || /para\s+domicilio/i.test(textoOriginal)
    || /a\s+domicilio/i.test(textoOriginal)
    || /mejor\s*(que\s*)?(me\s*)?(lo\s*)?(env[íi]a|manda|lleva|trae)(melo|me|lo)?/i.test(textoOriginal)
    || /^(env[íi]amelo|mandamelo|traemelo|llevamelo)$/i.test(textoOriginal.trim())
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
      await msg.reply("Perfecto! Cambié tu pedido a domicilio.\n\n" + resumenNuevo.texto);
    } else {
      if (ordenExtraida) esperandoAgregarMas.set(clienteNumero, ordenExtraida);
      resumenPendiente.delete(clienteNumero);
      datosRecibidos.delete(clienteNumero);
      persistirEstado(clienteNumero);
      await msg.reply("Perfecto! Para cambiar a domicilio necesito tu dirección.\n*¿Cuál es tu calle y número?*");
    }
    return;
  }

  // â"€â"€ CAMBIO A MOSTRADOR DESDE RESUMEN â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€
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
      await msg.reply("Perfecto! Cambié tu pedido a mostrador.\n\n" + resumenNuevo.texto);
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
        const esOrdenDomAux = tipoEntregaCliente.get(clienteNumero) === "domicilio"
          || (tipoEntregaCliente.get(clienteNumero) == null && historial.some(h => h.content && h.content.includes("domicilio")));
        const resumenNuevo  = generarResumen(clienteNumero, ordenExtraida, esOrdenDomAux, esPreventa);
        resumenPendiente.set(clienteNumero, { texto: resumenNuevo.texto, esTransferencia: resumenNuevo.esTransferencia });
        await msg.reply(resumenNuevo.texto);
        return;
      }
    }
  }

  if (resumenPendiente.has(clienteNumero) && (
    /agrega(me|r|nos)?|agra[gq]a|añade|también\s+quiero|y\s+también|y\s+además|suma(me)?|ponme\s+(también|además)|quiero\s+también|también\s+dame|y\s+dame/i.test(textoOriginal)
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
      await msg.reply(resultadoNuevo.texto + "\n\n*¿Agrego esto a tu pedido?*");
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
      await msg.reply(`*¿De qué tipo de carne quieres ${desc}?*\nTenemos: Surtido, Carne, Buche, Cuero o Lengua`);
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
      await msg.reply(`*¿De qué tipo de carne quieres ${desc}?*\nTenemos: Surtido, Carne, Buche, Cuero o Lengua`);
      return;
    }
    resumenPendiente.delete(clienteNumero);
    if (ordenExtraida) esperandoAgregarMas.set(clienteNumero, ordenExtraida);
  }

  if (resumenPendiente.has(clienteNumero) && /^(no|nel|nop|nope|nah|negativo)$/i.test(textoOriginal.trim())) {
    resumenPendiente.delete(clienteNumero);
    await msg.reply('Entendido! *¿Qué deseas ordenar?*');
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
      const correo       = (camposCliente.correo && camposCliente.correo !== "no proporcionó")
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
      try { guardarJIDReal(infoPedido.telefono, clienteNumero); } catch (e) {}
    }

    pedidosConfirmados.set(clienteNumero, { nombre: infoPedido.nombre, telefono: infoPedido.telefono, total: infoPedido.total, resumen: pendiente.texto, confirmadoEn: Date.now() });
    // Guardar JSON del pedido para "lo mismo de siempre"
    const _jsonUltimo = pedidoJSONActual.get(clienteNumero);
    if (_jsonUltimo) {
      ultimoPedido.set(clienteNumero, _jsonUltimo);
      const _telUltimo = telefonosReales.get(clienteNumero) || infoPedido.telefono;
      if (_telUltimo) try { guardarUltimoPedido(_telUltimo, _jsonUltimo); } catch (_) {}
    }
    clientesNuevos.delete(clienteNumero);
    limpiarTodo(clienteNumero);
    clientesNuevos.add(clienteNumero);
    await msg.reply("Listo! Tu pedido fue recibido y esta en espera de confirmacion de nuestro equipo.\nEn breve te avisamos. Gracias por tu preferencia!\n\n_Si deseas cancelar tu pedido escribe *cancelar*._");
    return;
  }

  // â"€â"€ CATCH-ALL RESUMEN PENDIENTE â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€
  // Si el cliente manda cualquier mensaje mientras hay resumen pendiente y no
  // coincidió con ninguna acción, re-enviamos el resumen para no perder el hilo.
  if (resumenPendiente.has(clienteNumero)) {
    const _pendiente = resumenPendiente.get(clienteNumero);
    await replyConTyping(msg, "Tienes un pedido pendiente de confirmar ðŸ'‡\n\n" + _pendiente.texto);
    return;
  }

  // â"€â"€ 4B. TOMA DE PEDIDO â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€
  const esOrdenDom = tipoEntregaCliente.get(clienteNumero) === "domicilio"
    || (tipoEntregaCliente.get(clienteNumero) == null && historial.some(h => h.content && h.content.includes("domicilio")));

  // â"€â"€ RESPUESTA A TIPO PENDIENTE (taco/torta) â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€
  if (esperandoTipoItem.has(clienteNumero)) {
    const pendiente = esperandoTipoItem.get(clienteNumero);
    const tNorm = textoOriginal.trim().toLowerCase().normalize("NFD").replace(/[̀-ͯ]/g, "");
    const esTaco  = /\btacos?\b/.test(tNorm);
    const esTorta = /\btortas?\b/.test(tNorm);
    const _cortesMap = getCortes ? getCortes() : {};
    const _palabrasCorte = Object.keys(_cortesMap).join("|");
    const _soloCorteTipoItem = !esTaco && !esTorta && _palabrasCorte
      && new RegExp(`\\b(${_palabrasCorte})\\b`, "i").test(tNorm)
      && pendiente.cantidad <= 4;
    if (!esTaco && !esTorta && !_soloCorteTipoItem) {
      await msg.reply("Disculpa, no entendí lo que quisiste decir. ¿Me lo puedes repetir? *¿Serían tacos o tortas?*");
      return;
    }
    esperandoTipoItem.delete(clienteNumero);
    const tipo = esTorta ? "torta" : "taco";
    const json = { tipo: "pedido", items: [{ presentacion: tipo, cantidad: pendiente.cantidad, corte: pendiente.corte }] };
    pedidoJSONActual.set(clienteNumero, json);
    const resultado = jsonALineas(json);
    historial.push({ role: "user", content: textoOriginal });
    historial.push({ role: "assistant", content: resultado.texto });
    if (pendiente.ordenBase) {
      const lineasFiltradas = resultado.texto.split("\n").filter(l => l.trim() && !/subtotal/i.test(l)).join("\n");
      const nuevaOrden = pendiente.ordenBase + "\n" + lineasFiltradas;
      esperandoAgregarMas.set(clienteNumero, nuevaOrden);
      esperandoConfirmacionItem.set(clienteNumero, { lineas: resultado.texto });
      persistirEstado(clienteNumero);
      await msg.reply(resultado.texto + "\n\n*¿Agrego esto a tu pedido?*");
    } else {
      esperandoConfirmacionItem.set(clienteNumero, { lineas: resultado.texto });
      persistirEstado(clienteNumero);
      await msg.reply(resultado.texto + "\n\n*¿Es correcto?*");
    }
    console.log(`Bot: [SIN TIPO → ${tipo}] corte: ${pendiente.corte}, cantidad: ${pendiente.cantidad}`);
    return;
  }
  const esConfirmacion = /^(si|sí|s[ií]\s+por\s+fa(vor)?|ok|okey|va|dale|listo|sale|andale|ándale|adelante|confirmo|confirmado|correcto|asi|así|claro|perfecto|va\s+bien|dale\s+pues|órale|orale|va\s+que\s+va|de\s+una|eso\s+es|así\s+es|asi\s+es|todo\s+bien|está\s+bien|esta\s+bien|sip|sep|simón|simon|chido|bueno|bien|afirmativo|positivo|exacto|exactamente|procede|ya|ya\s+dale|ya\s+pues|ya\s+va)$/i.test(textoOriginal.trim());
  const esRechazo      = /^(nel|nop|nope|incorrecto|cambia|error|no\s+es\s+correcto|no\s+est[aá]\s+bien)$/i.test(textoOriginal.trim());
  const esAgregarSi    = /^(si|sí|ok|va|dale|claro|sale|andale|quiero|agrega|más|mas)$/i.test(textoOriginal.trim());
  const esAgregarNo    = /^(no|nel|nop|nada\s*m[aá]s?|ya\s*es\s*todo|eso\s*es\s*todo|listo|ya|solo\s*eso|eso|no\s*,?\s*(gracias|gra|gras)|as[ií]\s*est[aá](\s*bien)?|ya\s*fue|ya\s*con\s*eso)$/i.test(textoOriginal.trim());

  // â"€â"€ CAMBIO DE TIPO DURANTE TOMA DE PEDIDO â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€
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
    await msg.reply(`Perfecto! Cambié tu pedido a ${nuevoTipo}. *¿Qué deseas ordenar?*`);
    await new Promise(r => setTimeout(r, 300));
    await msg.reply(MENU_FORMATO);
    return;
  }

  // â"€â"€ CONFIRMACIÓN DEL ÍTEM â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€
  if (esperandoConfirmacionItem.has(clienteNumero)) {
    const itemData = esperandoConfirmacionItem.get(clienteNumero);

    const quiereModificar = /quit(a|ar|ame|amelo|amelos)|elimina|borra|cambia|sin\s+los?|no\s+(quiero|pongas?)\s+los?/i.test(textoOriginal);
    if (quiereModificar && pedidoJSONActual.has(clienteNumero)) {
      const jsonActual = pedidoJSONActual.get(clienteNumero);
      esperandoConfirmacionItem.delete(clienteNumero);
      historial.push({ role: "user", content: textoOriginal });
      historial.push({ role: "system", content: `El pedido actual en JSON es: ${JSON.stringify(jsonActual)}. El cliente quiere modificarlo. Devuelve el JSON actualizado con los cambios solicitados.` });
      if (historial.length > 15) historial.splice(0, 2);
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
          await msg.reply(resultado.texto + "\n\n*¿Es correcto?*");
          return;
        }
      } catch (e) { console.error("Error modificando JSON:", e.message); }
    }

    if (esRechazo || /^no$/i.test(textoOriginal.trim())) {
      esperandoConfirmacionItem.delete(clienteNumero);
      esperandoAgregarMas.delete(clienteNumero);
      // Rechazo con pedido incluido: "no, mejor 5 tacos de buche"
      const _textoSinNo = textoOriginal.replace(/^(?:no|nel|nop)[,\s]+/i, "").trim();
      if (_textoSinNo.length > 3) {
        const _jsonRechazoPed = parsearPedidoSimple(_textoSinNo);
        if (_jsonRechazoPed && _jsonRechazoPed.tipo === "pedido") {
          pedidoJSONActual.set(clienteNumero, _jsonRechazoPed);
          persistirEstado(clienteNumero);
          const _resRechazo = jsonALineas(_jsonRechazoPed);
          esperandoConfirmacionItem.set(clienteNumero, { lineas: _resRechazo.texto });
          historial.push({ role: "user", content: textoOriginal });
          historial.push({ role: "assistant", content: _resRechazo.texto });
          await msg.reply(_resRechazo.texto + "\n\n*¿Es correcto?*");
          console.log(`Bot: [RECHAZO+PEDIDO] sin llamar a Groq`);
          return;
        }
      }
      const hist = getHistorial(clienteNumero);
      if (hist.length >= 2 && hist[hist.length - 1].role === "assistant")
        hist.splice(hist.length - 2, 2);
      await msg.reply("No pasa nada! *¿Qué deseas ordenar?* 😊");
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
            if (/^ðŸ"|^ðŸ"Œ|^ðŸ›µ|^ðŸ'µ|^ðŸ'°|^ðŸ'³|^ðŸ•–/u.test(t)) return false;
            if (/direcci[oó]n|referencia|subtotal|tarifa|domicilio:\s*\$|total:/i.test(t)) return false;
            return true;
          }).join("\n");
        const jsonNuevo = itemData.jsonNuevo;
        const { texto: lineasNuevas } = jsonALineas(jsonNuevo);
        const lineasFiltradas = lineasNuevas.split("\n")
          .filter(l => {
            const t = l.trim();
            if (!t) return false;
            if (/^ðŸ"|^ðŸ"Œ|^ðŸ›µ|^ðŸ'µ|^ðŸ'°|^ðŸ'³|^ðŸ•–/u.test(t)) return false;
            if (/subtotal|tarifa|domicilio:\s*\$|direcci[oó]n|referencia|total:/i.test(t)) return false;
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
          if (/^ðŸ"|^ðŸ"Œ|^ðŸ›µ|^ðŸ'µ|^ðŸ'°|^ðŸ'³|^ðŸ•–/u.test(t)) return false;
          if (/subtotal|tarifa|direcci[oó]n|referencia|total:/i.test(t)) return false;
          if (ordenActual.includes(t)) return false;
          return true;
        }).join("\n");
      const nuevaOrden = ordenActual ? ordenActual + "\n" + lineasNuevas : lineasNuevas;
      esperandoAgregarMas.set(clienteNumero, nuevaOrden);
      historial.push({ role: "user", content: "si, correcto" });
      historial.push({ role: "assistant", content: itemData.lineas });
      persistirEstado(clienteNumero);
      await msg.reply("*¿Deseas agregar algo más a tu pedido?*");
      return;
    }

    // Nuevo item con corte conocido durante confirmacion — acumular directo
    const _jsonNuevoConf = parsearPedidoSimple(textoOriginal);
    if (_jsonNuevoConf && _jsonNuevoConf.tipo === 'pedido' && Array.isArray(_jsonNuevoConf.items) && _jsonNuevoConf.items.length > 0) {
      const _resNuevoConf   = jsonALineas(_jsonNuevoConf);
      const _lineasBase     = itemData.lineas.split('\n').filter(l => l.trim() && !/subtotal/i.test(l)).join('\n');
      const _lineasNvas     = _resNuevoConf.texto.split('\n').filter(l => l.trim() && !/subtotal/i.test(l)).join('\n');
      const _combinadasConf = _lineasBase + '\n' + _lineasNvas;
      const _subtotalConf   = calcularSubtotal(_combinadasConf);
      const _textoConf      = _combinadasConf + '\n💰 Subtotal: $' + _subtotalConf;
      esperandoConfirmacionItem.set(clienteNumero, { ...itemData, lineas: _textoConf });
      await msg.reply(_textoConf + '\n\n*¿Es correcto?*');
      return;
    }
    // Nuevo item sin corte durante confirmacion — preguntar corte y luego acumular
    const _sinCorteConf = detectarSinCorte(textoOriginal);
    if (_sinCorteConf) {
      const _parcialConf = parsearSinCorteItems(textoOriginal);
      if (_parcialConf) {
        _parcialConf._indiceActual = 0;
        _parcialConf._baseConfirmacion = itemData.lineas;
        esperandoConfirmacionItem.delete(clienteNumero);
        esperandoCorte.set(clienteNumero, _parcialConf);
        const _primerConf = _parcialConf.items[0];
        const _descConf = _primerConf.presentacion === 'taco'   ? `los ${_primerConf.cantidad} tacos`
                        : _primerConf.presentacion === 'torta'  ? `las ${_primerConf.cantidad} tortas`
                        : _primerConf.presentacion === 'gramos' ? `los ${_primerConf.gramos}g`
                        : `los ${_primerConf.monto}`;
        await msg.reply(`*¿De qué tipo de carne quieres ${_descConf}?*\nTenemos: Surtido, Carne, Buche, Cuero o Lengua`);
        return;
      }
    }

    // FAQ durante confirmación de ítem: responder y volver a pedir confirmación
    const _faqConf = detectarPreguntaFrecuente(textoOriginal);
    if (_faqConf && ['precio', 'menu', 'descripcion_corte', 'domicilio'].includes(_faqConf.tipo)) {
      const _respFaqConf = generarRespuestaAutomatica(_faqConf, { esDomicilio: esOrdenDom });
      if (_respFaqConf) {
        await msg.reply(_respFaqConf);
        await msg.reply(itemData.lineas + "\n\n*¿Es correcto?*");
        return;
      }
    }
    await msg.reply(itemData.lineas + "\n\n*¿Es correcto?*");
    return;
  }


  // â"€â"€ ESPERANDO SI AGREGA MÁS â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€
  if (esperandoAgregarMas.has(clienteNumero)) {
    // "¿Cuánto llevo?" — subtotal acumulado sin Groq
    if (/cu[aá]nto\s+(?:llevo|tengo|es(?:\s+todo)?(?:\s+lo\s+que\s+llevo)?(?:\s+hasta\s+ahorita)?)|(?:total|subtotal)\s+(?:hasta\s+ahorita|por\s+ahora|de\s+lo\s+que\s+llevo)|cu[aá]nto\s+(?:llega|asciende|va)\s+mi\s+pedido/i.test(textoOriginal)) {
      const _ordSub = esperandoAgregarMas.get(clienteNumero) || "";
      if (_ordSub) {
        const _subAct = calcularSubtotal(_ordSub);
        const _listaAct = formatearListaAcumulada(_ordSub);
        await msg.reply(`${_listaAct}\n\n💰 *Total acumulado: $${_subAct}*`);
        await new Promise(r => setTimeout(r, 300));
        await msg.reply("*¿Deseas agregar algo más?*");
        return;
      }
    }
    if (!esAgregarNo && !esAgregarSi) {
      const _faqAgMas = detectarPreguntaFrecuente(textoOriginal);
      if (_faqAgMas && ['precio', 'menu', 'descripcion_corte', 'domicilio'].includes(_faqAgMas.tipo)) {
        const _esOrdenDomAgMas = tipoEntregaCliente.get(clienteNumero) === "domicilio";
        const _respFaqAgMas = generarRespuestaAutomatica(_faqAgMas, { esDomicilio: _esOrdenDomAgMas });
        if (_respFaqAgMas) {
          await msg.reply(_respFaqAgMas);
          await msg.reply("*¿Deseas agregar algo más a tu pedido?*");
          return;
        }
      }
    }
    const _edAgMas = !esAgregarNo && !esAgregarSi ? detectarEdicion(textoOriginal) : null;
    if (_edAgMas) {
      const _ordAgMas = esperandoAgregarMas.get(clienteNumero);
      if (_edAgMas.preguntar) {
        esperandoEdicion.set(clienteNumero, { campo: _edAgMas.campo, contexto: 'agregarMas', ordenTexto: _ordAgMas });
        await msg.reply(_edAgMas.pregunta);
        return;
      }
      aplicarEdicion(clienteNumero, _edAgMas);
      const _formAgMas = mostrarFormularioProgresivo(clienteNumero, esOrdenDom, esPreventa);
      await msg.reply('Perfecto! Datos actualizados:\n\n' + _formAgMas + '\n\n*¿Qué deseas ordenar?*');
      return;
    }
    if (esAgregarNo) {
      const ordenRaw = esperandoAgregarMas.get(clienteNumero);
      const ordenCompleta = ordenRaw.split("\n")
        .filter(l => {
          const t = l.trim();
          if (!t) return false;
          if (/^ðŸ"|^ðŸ"Œ|^ðŸ›µ|^ðŸ'µ|^ðŸ'°|^ðŸ'³|^ðŸ•–/u.test(t)) return false;
          if (/direcci[oó]n|referencia|subtotal|tarifa|domicilio:\s*\$|total:/i.test(t)) return false;
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
      await msg.reply("*¿Qué más te gustaría agregar de nuestro menú?*");
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
      await msg.reply(resultadoNuevo.texto + "\n\n*¿Agrego esto a tu pedido?*");
      return;
    }
  }

  // FAQ check: precio/menu/domicilio disponible al tomar pedido
  {
    const _faqP = detectarPreguntaFrecuente(textoOriginal);
    const _tipoP = _faqP ? _faqP.tipo : null;
    if (_tipoP === 'precio' || _tipoP === 'menu' || _tipoP === 'domicilio') {
      const _rP = generarRespuestaAutomatica(_faqP, { esDomicilio: esOrdenDom });
      if (_rP) {
        console.log('Bot: [FAQ pedido] tipo: ' + _tipoP);
        await msg.reply(_rP);
        const _fu = esperandoAgregarMas.has(clienteNumero) ? '*¿Qué más deseas agregar?*' : '*¿Qué deseas ordenar?*';
        await msg.reply(_fu);
        return;
      }
    }
  }

  // â"€â"€ REPETIR PEDIDO ANTERIOR â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€
  if (detectarRepetirPedido(textoOriginal)) {
    let _ultimoJSON = ultimoPedido.get(clienteNumero);
    if (!_ultimoJSON) {
      const _telRepetir = telefonosReales.get(clienteNumero);
      if (_telRepetir) _ultimoJSON = getUltimoPedido(_telRepetir) || null;
      if (_ultimoJSON) ultimoPedido.set(clienteNumero, _ultimoJSON);
    }
    if (!_ultimoJSON) {
      await msg.reply("No tengo registrado un pedido anterior tuyo. *¿Qué deseas ordenar?* 😊");
      await new Promise(r => setTimeout(r, 300));
      await msg.reply(MENU_FORMATO);
      return;
    }
    pedidoJSONActual.set(clienteNumero, _ultimoJSON);
    persistirEstado(clienteNumero);
    const _resUltimo = jsonALineas(_ultimoJSON);
    esperandoConfirmacionItem.set(clienteNumero, { lineas: _resUltimo.texto });
    historial.push({ role: "user", content: textoOriginal });
    historial.push({ role: "assistant", content: _resUltimo.texto });
    await msg.reply(_resUltimo.texto + "\n\n*¿Te preparo lo mismo?*");
    console.log(`Bot: [REPETIR PEDIDO] sin llamar a Groq`);
    return;
  }

  // â"€â"€ PRE-FILTRO SIN GROQ â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€
  const jsonSimple = parsearPedidoSimple(textoOriginal);
  if (jsonSimple && jsonSimple.tipo === "pedido") {
    pedidoJSONActual.set(clienteNumero, jsonSimple);
    persistirEstado(clienteNumero);
    const resultado = jsonALineas(jsonSimple);
    esperandoConfirmacionItem.set(clienteNumero, { lineas: resultado.texto });
    historial.push({ role: "user", content: textoOriginal });
    historial.push({ role: "assistant", content: resultado.texto });
    await msg.reply(resultado.texto + "\n\n*¿Es correcto?*");
    console.log(`Bot: [PARSER LOCAL] Subtotal: $${resultado.subtotal} â€" sin llamar a Groq`);
    return;
  }

  // â"€â"€ RESPUESTA AL CORTE PENDIENTE â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€
  if (esperandoCorte.has(clienteNumero)) {
    // Greedy: si el cliente manda un pedido completo en vez de solo el corte, tomarlo directo
    const _jsonGreedy = parsearPedidoSimple(textoOriginal);
    if (_jsonGreedy && _jsonGreedy.tipo === "pedido" && Array.isArray(_jsonGreedy.items) && _jsonGreedy.items.length > 0) {
      esperandoCorte.delete(clienteNumero);
      pedidoJSONActual.set(clienteNumero, _jsonGreedy);
      persistirEstado(clienteNumero);
      const _resGreedy = jsonALineas(_jsonGreedy);
      esperandoConfirmacionItem.set(clienteNumero, { lineas: _resGreedy.texto });
      historial.push({ role: "user", content: textoOriginal });
      historial.push({ role: "assistant", content: _resGreedy.texto });
      await msg.reply(_resGreedy.texto + "\n\n*\u00bfEs correcto?*");
      console.log(`Bot: [GREEDY CORTE\u2192PEDIDO] sin llamar a Groq`);
      return;
    }
    // FAQ durante espera de corte: responder y volver a pedir el corte
    const _faqCorte = detectarPreguntaFrecuente(textoOriginal);
    if (_faqCorte && ['precio', 'menu', 'descripcion_corte'].includes(_faqCorte.tipo)) {
      const _respFaqCorte = generarRespuestaAutomatica(_faqCorte, { esDomicilio: esOrdenDom });
      if (_respFaqCorte) {
        const _pedParcFaq = esperandoCorte.get(clienteNumero);
        const _itemFaq = _pedParcFaq.items[_pedParcFaq._indiceActual || 0];
        const _descFaq = _itemFaq.presentacion === 'taco'   ? `los ${_itemFaq.cantidad} tacos`
                       : _itemFaq.presentacion === 'torta'  ? `las ${_itemFaq.cantidad} tortas`
                       : _itemFaq.presentacion === 'gramos' ? `los ${_itemFaq.gramos}g`
                       : `los $${_itemFaq.monto}`;
        await msg.reply(_respFaqCorte);
        await msg.reply(`*\u00bfY de qu\u00e9 tipo de carne quieres ${_descFaq}?*\nTenemos: Surtido, Carne, Buche, Cuero o Lengua`);
        return;
      }
    }
    const t = textoOriginal.trim().toLowerCase().normalize("NFD").replace(/[\u0300-\u036f]/g, "");
    const CORTES_MAP = getCortes();
    const _palabrasCorteEsp = Object.keys(CORTES_MAP).join("|");
    const matchCorteRespuesta = t.match(new RegExp(`\\b(${_palabrasCorteEsp})\\b`));
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
        await msg.reply(`*¿De qué tipo de carne quieres ${desc}?*\nTenemos: Surtido, Carne, Buche, Cuero o Lengua`);
        return;
      }

      esperandoCorte.delete(clienteNumero);
      // Vino de confirmacion acumulada (item sin corte agregado durante confirmacion)
      if (pedidoParcial._baseConfirmacion !== undefined) {
        const _jsonCorteConf = { tipo: 'pedido', items: pedidoParcial.items };
        const { texto: _lineasCorteConf } = jsonALineas(_jsonCorteConf);
        const _baseConf   = pedidoParcial._baseConfirmacion.split('\n').filter(l => l.trim() && !/subtotal/i.test(l)).join('\n');
        const _nuevasConf = _lineasCorteConf.split('\n').filter(l => l.trim() && !/subtotal/i.test(l)).join('\n');
        const _combConf   = _baseConf + '\n' + _nuevasConf;
        const _subtConf   = calcularSubtotal(_combConf);
        const _textoBC    = _combConf + '\n💰 Subtotal: $' + _subtConf;
        esperandoConfirmacionItem.set(clienteNumero, { lineas: _textoBC });
        historial.push({ role: 'user', content: textoOriginal });
        historial.push({ role: 'assistant', content: _textoBC });
        await msg.reply(_textoBC + '\n\n*¿Es correcto?*');
        return;
      }
      if (pedidoParcial._esModificacionResumen === true && pedidoParcial._ordenBase) {
        const jsonCompletoCorte = { tipo: "pedido", items: pedidoParcial.items };
        const { texto: lineasNuevas } = jsonALineas(jsonCompletoCorte);
        pedidoJSONActual.set(clienteNumero, { _esModificacionResumen: true, ordenBase: pedidoParcial._ordenBase, jsonNuevo: jsonCompletoCorte });
        esperandoConfirmacionItem.set(clienteNumero, { lineas: lineasNuevas, _esModificacionResumen: true, ordenBase: pedidoParcial._ordenBase, jsonNuevo: jsonCompletoCorte });
        historial.push({ role: "user", content: textoOriginal });
        historial.push({ role: "assistant", content: lineasNuevas });
        await msg.reply(lineasNuevas + "\n\n*¿Agrego esto a tu pedido?*");
        return;
      }

      const jsonCompletoCorte = { tipo: "pedido", items: pedidoParcial.items };
      pedidoJSONActual.set(clienteNumero, jsonCompletoCorte);
      persistirEstado(clienteNumero);
      const resultado = jsonALineas(jsonCompletoCorte);
      esperandoConfirmacionItem.set(clienteNumero, { lineas: resultado.texto });
      historial.push({ role: "user", content: textoOriginal });
      historial.push({ role: "assistant", content: resultado.texto });
      await msg.reply(resultado.texto + "\n\n*¿Es correcto?*");
      console.log(`Bot: [CORTE COMPLETADO] Subtotal: $${resultado.subtotal}`);
      return;
    }
  }

  // â"€â"€ DETECCIÓN SIN CORTE â€" preguntar antes de llamar a Groq â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€
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
      await msg.reply(`*¿De qué tipo de carne quieres ${desc}?*\nTenemos: Surtido, Carne, Buche, Cuero o Lengua`);
    } else {
      await msg.reply("*¿De qué tipo de carne lo quieres?*\nTenemos: Surtido, Carne, Buche, Cuero o Lengua");
    }
    return;
  }

  // â"€â"€ DETECCIÓN SIN TIPO â€" preguntar taco/torta antes de ir a Groq â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€
  const itemSinTipo = detectarSinTipo(textoOriginal);
  if (itemSinTipo) {
    const ordenBase = esperandoAgregarMas.get(clienteNumero) || null;
    if (ordenBase) esperandoAgregarMas.delete(clienteNumero);
    esperandoTipoItem.set(clienteNumero, { ...itemSinTipo, ordenBase });
    await msg.reply(`*¿Los ${itemSinTipo.cantidad} de ${itemSinTipo.corte} serían tacos o tortas?*`);
    return;
  }

  // â"€â"€ MODIFICACIONES SOBRE ÍTEM ACTUAL â€" sin Groq â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€
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
        await msg.reply(lineas.join("\n") + `\nðŸ'° Subtotal: $${subtotal}\n\n*¿Es correcto?*`);
        console.log(`Bot: [MODIFICACIÓN LOCAL] tipo: ${modificacion.tipo}`);
        return;
      }
    }
  }

  // ── PRESUPUESTO INVERSO: "¿cuántos tacos me da con $X?" ────────────────────────────────────
  {
    const _mPres = textoOriginal.match(/cu[aá]ntos?\s+(?:tacos?|tortas?)\s+(?:son|me\s+da[ns]?)\s+(?:con\s+)?\$?(\d+)|con\s+\$?(\d+)\s+cu[aá]ntos?|(?:tengo|trae[nm]e)\s+\$?(\d+)\s+pesos?\s+(?:de\s+)?tacos?|qu[eé]\s+me\s+da[ns]?\s+con\s+\$?(\d+)/i);
    if (_mPres) {
      const _monto = parseInt(_mPres[1] || _mPres[2] || _mPres[3] || _mPres[4]);
      if (_monto > 0) {
        try {
          const _prs = getPrecios();
          const _tacos  = Math.floor(_monto / _prs.pTaco);
          const _tortas = Math.floor(_monto / _prs.pTorta);
          let _rPres = `💰 Con *$${_monto}* puedes llevarte:\n\n`;
          if (_tacos  > 0) _rPres += `🌮 *${_tacos} tacos* ($${_prs.pTaco} c/u)\n`;
          if (_tortas > 0) _rPres += `🥖 *${_tortas} tortas* ($${_prs.pTorta} c/u)\n`;
          _rPres += `\n_¿Qué te preparamos?_ 😊`;
          await msg.reply(_rPres);
          return;
        } catch (_e) {}
      }
    }
  }

  // â"€â"€ LLAMADA A GROQ â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€
  historial.push({ role: "user", content: textoOriginal });
  if (historial.length > 15) historial.splice(0, 2);

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
      await replyConTyping(msg, resultado.texto + "\n\n*¿Es correcto?*");
      console.log(`Bot: [JSONâ†'LÍNEAS] Subtotal: $${resultado.subtotal}`);
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
      if (!enFlujoActivo(clienteNumero)) await msg.reply(MENU_FORMATO);
    }

  } catch (error) {
    console.error("Error Groq (1er intento):", error.message);
    try {
      await new Promise(r => setTimeout(r, 1000));
      const systemPromptRetry = buildPrompt({
        tomandoPedido:  true,
        textoCliente:   textoOriginal,
        horaConfirmada: horaEntregaPreventa.get(clienteNumero) || null,
        esPreventa,
      });
      const respuestaRetry = await groq.chat.completions.create({
        model: "llama-3.3-70b-versatile",
        max_tokens: 400,
        temperature: 0.2,
        messages: [{ role: "system", content: systemPromptRetry }, ...historial],
      });
      const textoRetry = respuestaRetry.choices[0]?.message?.content?.trim() || "";
      if (textoRetry) {
        historial.push({ role: "assistant", content: textoRetry });
        await replyConTyping(msg, textoRetry);
      } else {
        await msg.reply("Disculpa, no entendi. Me repites tu pedido?");
        if (!enFlujoActivo(clienteNumero)) await msg.reply(MENU_FORMATO);
      }
    } catch (_retryErr) {
      console.error("Error Groq (reintento):", _retryErr.message);
      try { await msg.reply("Disculpa, tuve un problemita. Me vuelves a decir que quieres?"); } catch (_) {}
    }
  }
}

module.exports = { handleMensaje };
