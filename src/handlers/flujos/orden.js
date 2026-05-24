// src/handlers/flujos/orden.js
const Groq = require("groq-sdk");
const {
  esperandoTipoItem, esperandoConfirmacionItem, esperandoAgregarMas,
  esperandoCorte, resumenPendiente, pedidoJSONActual, tipoEntregaCliente,
  datosCampos, horaEntregaPreventa, clientesPreventa, persistirEstado,
  detectarEdicion, aplicarEdicion, mostrarFormularioProgresivo,
} = require("../../estado");
const { generarResumen, jsonALineas, extraerOrdenDeResumen, formatearListaAcumulada } = require("../../pedido/resumen");
const {
  parsearPedidoSimple, detectarSinCorte, detectarSinTipo,
  detectarModificacion, detectarRepetirPedido, getCortes, detectarPreguntaFrecuente,
} = require("../pedidoParser");
const { generarRespuestaAutomatica, aplicarModificacion } = require("../respuestas");
const { calcularSubtotal, getPrecios } = require("../../pedido/precios");
const { getUltimoPedido } = require("../../db");
const { buildPrompt } = require("../../prompts/index");
const { MENU_FORMATO } = require("../../config");
const {
  telefonosReales, ultimoPedido, replyConTyping, parsearSinCorteItems, palabrasConfirmacion,
} = require("./utils");

const groq = new Groq({ apiKey: process.env.GROQ_API_KEY });
const GROQ_TIMEOUT_MS = 15000;

// ── ERRORES CONSECUTIVOS EN PREGUNTAS CRÍTICAS ────────────────────────────────
const _erroresConsec = new Map();
function _sumarError(num) { _erroresConsec.set(num, (_erroresConsec.get(num) || 0) + 1); return _erroresConsec.get(num); }
function _resetError(num) { _erroresConsec.delete(num); }

function groqConTimeout(params) {
  return Promise.race([
    groq.chat.completions.create(params),
    new Promise((_, reject) =>
      setTimeout(() => reject(new Error("GROQ_TIMEOUT")), GROQ_TIMEOUT_MS)
    ),
  ]);
}

// ── ESPERANDO TIPO DE ÍTEM (taco/torta) ──────────────────────────────────────
async function handleEsperandoTipoItem(msg, textoOriginal, clienteNumero, historial, esOrdenDom) {
  if (!esperandoTipoItem.has(clienteNumero)) return false;

  const pendiente = esperandoTipoItem.get(clienteNumero);
  const tNorm = textoOriginal.trim().toLowerCase().normalize("NFD").replace(/[̀-ͯ]/g, "");
  const esTaco  = /\btacos?\b/.test(tNorm);
  const esTorta = /\btortas?\b/.test(tNorm);
  const cortesMap = getCortes ? getCortes() : {};
  const palabrasCorte = Object.keys(cortesMap).join("|");
  const soloCorteTipoItem = !esTaco && !esTorta && palabrasCorte
    && new RegExp(`\\b(${palabrasCorte})\\b`, "i").test(tNorm)
    && pendiente.cantidad <= 4;

  if (!esTaco && !esTorta && !soloCorteTipoItem) {
    const errores = _sumarError(clienteNumero);
    const extra = errores >= 2 ? "\n\n_Por ejemplo escríbeme: *tacos* o *tortas*_" : "";
    await msg.reply("Disculpa, no entendí. *¿Serían tacos o tortas?*" + extra);
    return true;
  }

  esperandoTipoItem.delete(clienteNumero);
  _resetError(clienteNumero);
  const tipo = esTorta ? "torta" : "taco";
  const json = { tipo: "pedido", items: [{ presentacion: tipo, cantidad: pendiente.cantidad, corte: pendiente.corte }] };
  pedidoJSONActual.set(clienteNumero, json);
  const resultado = jsonALineas(json);
  historial.push({ role: "user",      content: textoOriginal });
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
  return true;
}

// ── CAMBIO DE TIPO DURANTE TOMA DE PEDIDO ────────────────────────────────────
async function handleCambioTipoDuranteTomaPedido(msg, textoOriginal, clienteNumero, historial) {
  const esCambioAMostrador = /cambi(a|ar|ame)\s*(a|al)?\s*mostrador|que\s+sea\s+(a\s+|en\s+)?mostrador|para\s+mostrador|mejor\s+mostrador|voy\s+a\s+recoger|paso\s+a\s+recoger|yo\s+recojo/i.test(textoOriginal);
  const esCambioADomicilio = /cambi(a|ar|ame)\s*(a|al)?\s*domicilio|que\s+sea\s+(a\s+)?domicilio|para\s+domicilio|mejor\s+domicilio|a\s+domicilio/i.test(textoOriginal);
  if (!esCambioAMostrador && !esCambioADomicilio) return false;

  const nuevoTipo = esCambioAMostrador ? "mostrador" : "domicilio";
  const campos = datosCampos.get(clienteNumero) || {};
  campos.tipoEntrega = nuevoTipo;
  tipoEntregaCliente.set(clienteNumero, nuevoTipo);
  if (esCambioAMostrador) {
    campos.calle = null; campos.colonia = null; campos.referencia = null;
  }
  if (esCambioADomicilio) {
    const telActual = campos.telefono || null;
    if (telActual) {
      const { getCliente } = require("../../db");
      const clienteBD = getCliente(telActual);
      if (clienteBD) {
        if (!campos.calle)      campos.calle      = clienteBD.calle_numero || null;
        if (!campos.colonia)    campos.colonia    = clienteBD.colonia      || null;
        if (!campos.referencia) campos.referencia = clienteBD.referencia   || null;
      }
    }
  }
  datosCampos.set(clienteNumero, campos);
  const idxTipo = historial.findIndex(h => h.content && (h.content.includes("domicilio") || h.content.includes("mostrador")));
  if (idxTipo !== -1) historial[idxTipo].content = nuevoTipo === "mostrador" ? "Mi pedido es para recoger en mostrador." : "Mi pedido es a domicilio.";
  await msg.reply(`Perfecto! Cambié tu pedido a ${nuevoTipo}. *¿Qué deseas ordenar?*`);
  await new Promise(r => setTimeout(r, 300));
  await msg.reply(MENU_FORMATO);
  return true;
}

// ── CONFIRMACIÓN DEL ÍTEM ─────────────────────────────────────────────────────
async function handleConfirmacionItem(msg, textoOriginal, clienteNumero, historial, esOrdenDom) {
  if (!esperandoConfirmacionItem.has(clienteNumero)) return false;

  const itemData = esperandoConfirmacionItem.get(clienteNumero);
  const esConfirmacion = /^(si|sí|s[ií]\s+por\s+fa(vor)?|ok|okey|va|dale|listo|sale|andale|ándale|adelante|confirmo|confirmado|correcto|asi|así|claro|perfecto|va\s+bien|dale\s+pues|órale|orale|va\s+que\s+va|de\s+una|eso\s+es|así\s+es|asi\s+es|todo\s+bien|está\s+bien|esta\s+bien|sip|sep|simón|simon|chido|bueno|bien|afirmativo|positivo|exacto|exactamente|procede|ya|ya\s+dale|ya\s+pues|ya\s+va)$/i.test(textoOriginal.trim());
  const esRechazo       = /^(nel|nop|nope|incorrecto|cambia|error|no\s+es\s+correcto|no\s+est[aá]\s+bien)$/i.test(textoOriginal.trim());

  const quiereModificar = /quit(a|ar|ame|amelo|amelos)|elimina|borra|cambia|sin\s+los?|no\s+(quiero|pongas?)\s+los?/i.test(textoOriginal);
  if (quiereModificar) {
    const modLocal = detectarModificacion(textoOriginal);
    if (modLocal) {
      const textoMod = aplicarModificacion(modLocal, itemData.lineas);
      if (textoMod) {
        const subtotalMod = calcularSubtotal(textoMod);
        const textoFinalMod = textoMod + "\n💰 Subtotal: $" + subtotalMod;
        pedidoJSONActual.delete(clienteNumero);
        esperandoConfirmacionItem.set(clienteNumero, { ...itemData, lineas: textoFinalMod });
        historial.push({ role: "user",      content: textoOriginal });
        historial.push({ role: "assistant", content: textoFinalMod });
        await msg.reply(textoFinalMod + "\n\n*¿Es correcto?*");
        console.log(`Bot: [MOD LOCAL confirmación] tipo: ${modLocal.tipo}`);
        return true;
      }
    }
    await msg.reply("No entendí qué quieres cambiar. *¿Me dices qué modificar?*\n_(Ej: 'quita uno', 'cámbiame el surtido a buche')_");
    return true;
  }

  if (esRechazo || /^no$/i.test(textoOriginal.trim())) {
    esperandoConfirmacionItem.delete(clienteNumero);
    esperandoAgregarMas.delete(clienteNumero);
    _resetError(clienteNumero);
    const textoSinNo = textoOriginal.replace(/^(?:no|nel|nop)[,\s]+/i, "").trim();
    if (textoSinNo.length > 3) {
      const jsonRechazoPed = parsearPedidoSimple(textoSinNo);
      if (jsonRechazoPed && jsonRechazoPed.tipo === "pedido") {
        pedidoJSONActual.set(clienteNumero, jsonRechazoPed);
        persistirEstado(clienteNumero);
        const resRechazo = jsonALineas(jsonRechazoPed);
        esperandoConfirmacionItem.set(clienteNumero, { lineas: resRechazo.texto });
        historial.push({ role: "user",      content: textoOriginal });
        historial.push({ role: "assistant", content: resRechazo.texto });
        await msg.reply(resRechazo.texto + "\n\n*¿Es correcto?*");
        console.log(`Bot: [RECHAZO+PEDIDO] sin llamar a Groq`);
        return true;
      }
    }
    const hist = historial;
    if (hist.length >= 2 && hist[hist.length - 1].role === "assistant")
      hist.splice(hist.length - 2, 2);
    await msg.reply("No pasa nada! *¿Qué deseas ordenar?* 😊");
    await new Promise(r => setTimeout(r, 400));
    await msg.reply(MENU_FORMATO);
    return true;
  }

  if (esConfirmacion) {
    esperandoConfirmacionItem.delete(clienteNumero);
    _resetError(clienteNumero);

    if (itemData._esModificacionResumen) {
      const ordenBase = (itemData.ordenBase || "").split("\n").filter(l => {
        const t = l.trim();
        if (!t) return false;
        if (/^📍|^📌|^🛵|^💵|^💰|^💳|^🕖/u.test(t)) return false;
        if (/direcci[oó]n|referencia|subtotal|tarifa|domicilio:\s*\$|total:/i.test(t)) return false;
        return true;
      }).join("\n");
      const jsonNuevo = itemData.jsonNuevo;
      const { texto: lineasNuevas } = jsonALineas(jsonNuevo);
      const lineasFiltradas = lineasNuevas.split("\n").filter(l => {
        const t = l.trim();
        if (!t) return false;
        if (/^📍|^📌|^🛵|^💵|^💰|^💳|^🕖/u.test(t)) return false;
        if (/subtotal|tarifa|domicilio:\s*\$|direcci[oó]n|referencia|total:/i.test(t)) return false;
        return true;
      }).join("\n");
      const ordenCombinada = ordenBase ? ordenBase + "\n" + lineasFiltradas : lineasFiltradas;
      const esPreventa = clientesPreventa.has(clienteNumero);
      const resumenNuevo = generarResumen(clienteNumero, ordenCombinada, esOrdenDom, esPreventa);
      resumenPendiente.set(clienteNumero, { texto: resumenNuevo.texto, esTransferencia: resumenNuevo.esTransferencia });
      esperandoAgregarMas.delete(clienteNumero);
      historial.push({ role: "user",      content: "si, agrega" });
      historial.push({ role: "assistant", content: resumenNuevo.texto });
      persistirEstado(clienteNumero);
      await msg.reply(resumenNuevo.texto);
      return true;
    }

    const ordenActual   = esperandoAgregarMas.get(clienteNumero) || "";
    const lineasNuevas  = itemData.lineas.split("\n").filter(l => {
      const t = l.trim();
      if (!t) return false;
      if (/^📍|^📌|^🛵|^💵|^💰|^💳|^🕖/u.test(t)) return false;
      if (/subtotal|tarifa|direcci[oó]n|referencia|total:/i.test(t)) return false;
      if (ordenActual.includes(t)) return false;
      return true;
    }).join("\n");
    const nuevaOrden = ordenActual ? ordenActual + "\n" + lineasNuevas : lineasNuevas;
    esperandoAgregarMas.set(clienteNumero, nuevaOrden);
    historial.push({ role: "user",      content: "si, correcto" });
    historial.push({ role: "assistant", content: itemData.lineas });
    persistirEstado(clienteNumero);
    await msg.reply("*¿Deseas agregar algo más a tu pedido?*");
    return true;
  }

  // FAQ durante confirmación: responder y volver a pedir confirmación
  const faqConf = detectarPreguntaFrecuente(textoOriginal);
  if (faqConf && ["precio", "menu", "descripcion_corte", "domicilio"].includes(faqConf.tipo)) {
    const respFaqConf = generarRespuestaAutomatica(faqConf, { esDomicilio: esOrdenDom });
    if (respFaqConf) {
      await msg.reply(respFaqConf);
      await msg.reply(itemData.lineas + "\n\n*¿Es correcto?*");
      return true;
    }
  }

  const erroresConf = _sumarError(clienteNumero);
  const extraConf = erroresConf >= 2 ? "\n\n_Puedes responder: *sí*, *dale*, *correcto* para confirmar, o *no*, *nel* para cancelar_" : "";
  await msg.reply(itemData.lineas + "\n\n*¿Es correcto?*" + extraConf);
  return true;
}

// ── ESPERANDO SI AGREGA MÁS ───────────────────────────────────────────────────
async function handleAgregarMas(msg, textoOriginal, clienteNumero, historial, esOrdenDom, esPreventa) {
  if (!esperandoAgregarMas.has(clienteNumero)) return false;

  const esAgregarNo = /^(no|nel|nop|nada\s*m[aá]s?|ya\s*es\s*todo|eso\s*es\s*todo|listo|ya|solo\s*eso|eso|no\s*,?\s*(gracias|gra|gras)|as[ií]\s*est[aá](\s*bien)?|ya\s*fue|ya\s*con\s*eso)$/i.test(textoOriginal.trim());
  const esAgregarSi = /^(si|sí|ok|va|dale|claro|sale|andale|quiero|agrega|más|mas)$/i.test(textoOriginal.trim());

  // "¿Cuánto llevo?" — subtotal acumulado
  if (/cu[aá]nto\s+(?:llevo|tengo|es(?:\s+todo)?(?:\s+lo\s+que\s+llevo)?(?:\s+hasta\s+ahorita)?)|(?:total|subtotal)\s+(?:hasta\s+ahorita|por\s+ahora|de\s+lo\s+que\s+llevo)|cu[aá]nto\s+(?:llega|asciende|va)\s+mi\s+pedido/i.test(textoOriginal)) {
    const ordSub = esperandoAgregarMas.get(clienteNumero) || "";
    if (ordSub) {
      const subAct   = calcularSubtotal(ordSub);
      const listaAct = formatearListaAcumulada(ordSub);
      await msg.reply(`${listaAct}\n\n💰 *Total acumulado: $${subAct}*`);
      await new Promise(r => setTimeout(r, 300));
      await msg.reply("*¿Deseas agregar algo más?*");
      return true;
    }
  }

  if (!esAgregarNo && !esAgregarSi) {
    const faqAgMas = detectarPreguntaFrecuente(textoOriginal);
    if (faqAgMas && ["precio", "menu", "descripcion_corte", "domicilio"].includes(faqAgMas.tipo)) {
      const esOrdenDomAgMas = tipoEntregaCliente.get(clienteNumero) === "domicilio";
      const respFaq = generarRespuestaAutomatica(faqAgMas, { esDomicilio: esOrdenDomAgMas });
      if (respFaq) {
        await msg.reply(respFaq);
        await msg.reply("*¿Deseas agregar algo más a tu pedido?*");
        return true;
      }
    }
  }

  const edAgMas = !esAgregarNo && !esAgregarSi ? detectarEdicion(textoOriginal) : null;
  if (edAgMas) {
    const ordAgMas = esperandoAgregarMas.get(clienteNumero);
    if (edAgMas.preguntar) {
      const { esperandoEdicion } = require("../../estado");
      esperandoEdicion.set(clienteNumero, { campo: edAgMas.campo, contexto: "agregarMas", ordenTexto: ordAgMas });
      await msg.reply(edAgMas.pregunta);
      return true;
    }
    aplicarEdicion(clienteNumero, edAgMas);
    const formAgMas = mostrarFormularioProgresivo(clienteNumero, esOrdenDom, esPreventa);
    await msg.reply("Perfecto! Datos actualizados:\n\n" + formAgMas + "\n\n*¿Qué deseas ordenar?*");
    return true;
  }

  if (esAgregarNo) {
    _resetError(clienteNumero);
    const ordenRaw = esperandoAgregarMas.get(clienteNumero);
    const ordenCompleta = ordenRaw.split("\n").filter(l => {
      const t = l.trim();
      if (!t) return false;
      if (/^📍|^📌|^🛵|^💵|^💰|^💳|^🕖/u.test(t)) return false;
      if (/direcci[oó]n|referencia|subtotal|tarifa|domicilio:\s*\$|total:/i.test(t)) return false;
      return true;
    }).join("\n");
    esperandoAgregarMas.delete(clienteNumero);
    const resumenGenerado = generarResumen(clienteNumero, ordenCompleta, esOrdenDom, esPreventa);
    resumenPendiente.set(clienteNumero, { texto: resumenGenerado.texto, esTransferencia: resumenGenerado.esTransferencia });
    historial.push({ role: "user",      content: textoOriginal });
    historial.push({ role: "assistant", content: resumenGenerado.texto });
    await msg.reply(resumenGenerado.texto);
    return true;
  }

  if (esAgregarSi) {
    _resetError(clienteNumero);
    const ordenActual = esperandoAgregarMas.get(clienteNumero) || "";
    const listaActual = formatearListaAcumulada(ordenActual);
    await msg.reply(listaActual);
    await new Promise(r => setTimeout(r, 400));
    await msg.reply(MENU_FORMATO);
    await new Promise(r => setTimeout(r, 400));
    await msg.reply("*¿Qué más te gustaría agregar de nuestro menú?*");
    return true;
  }

  const erroresAgMas = _sumarError(clienteNumero);
  const extraAgMas = erroresAgMas >= 2 ? "\n\n_Puedes responder: *sí* para agregar algo, o *no* / *ya es todo* para terminar_" : "";
  await msg.reply("*¿Deseas agregar algo más a tu pedido?*" + extraAgMas);
  return true;
}

// ── FAQ DURANTE TOMA DE PEDIDO ────────────────────────────────────────────────
async function handleFAQDurantePedido(msg, textoOriginal, clienteNumero, esOrdenDom) {
  const faqP = detectarPreguntaFrecuente(textoOriginal);
  const tipoP = faqP ? faqP.tipo : null;
  if (tipoP !== "precio" && tipoP !== "menu" && tipoP !== "domicilio" && tipoP !== "descripcion_corte") return false;

  const rP = generarRespuestaAutomatica(faqP, { esDomicilio: esOrdenDom });
  if (!rP) return false;

  console.log("Bot: [FAQ pedido] tipo: " + tipoP);
  await msg.reply(rP);
  const fu = esperandoAgregarMas.has(clienteNumero) ? "*¿Qué más deseas agregar?*" : "*¿Qué deseas ordenar?*";
  await msg.reply(fu);
  return true;
}

// ── REPETIR PEDIDO ANTERIOR ───────────────────────────────────────────────────
async function handleRepetirPedido(msg, textoOriginal, clienteNumero, historial) {
  if (!detectarRepetirPedido(textoOriginal)) return false;

  let ultimoJSON = ultimoPedido.get(clienteNumero);
  if (!ultimoJSON) {
    const telRepetir = telefonosReales.get(clienteNumero);
    if (telRepetir) ultimoJSON = getUltimoPedido(telRepetir) || null;
    if (ultimoJSON) ultimoPedido.set(clienteNumero, ultimoJSON);
  }
  if (!ultimoJSON) {
    await msg.reply("No tengo registrado un pedido anterior tuyo. *¿Qué deseas ordenar?* 😊");
    await new Promise(r => setTimeout(r, 300));
    await msg.reply(MENU_FORMATO);
    return true;
  }
  pedidoJSONActual.set(clienteNumero, ultimoJSON);
  persistirEstado(clienteNumero);
  const resUltimo = jsonALineas(ultimoJSON);
  esperandoConfirmacionItem.set(clienteNumero, { lineas: resUltimo.texto });
  historial.push({ role: "user",      content: textoOriginal });
  historial.push({ role: "assistant", content: resUltimo.texto });
  await msg.reply(resUltimo.texto + "\n\n*¿Te preparo lo mismo?*");
  console.log(`Bot: [REPETIR PEDIDO] sin llamar a Groq`);
  return true;
}

// ── PARSER LOCAL (pedido completo con corte) ──────────────────────────────────
async function handlePedidoSimple(msg, textoOriginal, clienteNumero, historial) {
  const jsonSimple = parsearPedidoSimple(textoOriginal);
  if (!jsonSimple || jsonSimple.tipo !== "pedido") return false;

  pedidoJSONActual.set(clienteNumero, jsonSimple);
  persistirEstado(clienteNumero);
  const resultado = jsonALineas(jsonSimple);
  esperandoConfirmacionItem.set(clienteNumero, { lineas: resultado.texto });
  historial.push({ role: "user",      content: textoOriginal });
  historial.push({ role: "assistant", content: resultado.texto });
  await msg.reply(resultado.texto + "\n\n*¿Es correcto?*");
  console.log(`Bot: [PARSER LOCAL] Subtotal: $${resultado.subtotal} — sin llamar a Groq`);
  return true;
}

// ── ESPERANDO CORTE ───────────────────────────────────────────────────────────
async function handleEsperandoCorte(msg, textoOriginal, clienteNumero, historial, esOrdenDom) {
  if (!esperandoCorte.has(clienteNumero)) return false;

  // Pedido completo enviado en lugar de solo el corte (solo si todos los ítems son tacos/tortas)
  const jsonGreedy = parsearPedidoSimple(textoOriginal);
  if (jsonGreedy && jsonGreedy.tipo === "pedido" && Array.isArray(jsonGreedy.items) && jsonGreedy.items.length > 0
      && jsonGreedy.items.every(i => i.presentacion === "taco" || i.presentacion === "torta")) {
    esperandoCorte.delete(clienteNumero);
    pedidoJSONActual.set(clienteNumero, jsonGreedy);
    persistirEstado(clienteNumero);
    const resGreedy = jsonALineas(jsonGreedy);
    esperandoConfirmacionItem.set(clienteNumero, { lineas: resGreedy.texto });
    historial.push({ role: "user",      content: textoOriginal });
    historial.push({ role: "assistant", content: resGreedy.texto });
    await msg.reply(resGreedy.texto + "\n\n*¿Es correcto?*");
    console.log(`Bot: [GREEDY CORTE→PEDIDO] sin llamar a Groq`);
    return true;
  }

  // FAQ durante espera de corte
  const faqCorte = detectarPreguntaFrecuente(textoOriginal);
  if (faqCorte && ["precio", "menu", "descripcion_corte"].includes(faqCorte.tipo)) {
    const respFaqCorte = generarRespuestaAutomatica(faqCorte, { esDomicilio: esOrdenDom });
    if (respFaqCorte) {
      const pedParcFaq = esperandoCorte.get(clienteNumero);
      const itemFaq    = pedParcFaq.items[pedParcFaq._indiceActual || 0];
      const descFaq    = itemFaq.presentacion === "taco"   ? `los ${itemFaq.cantidad} tacos`
                       : itemFaq.presentacion === "torta"  ? `las ${itemFaq.cantidad} tortas`
                       : itemFaq.presentacion === "gramos" ? `los ${itemFaq.gramos}g`
                       : `los $${itemFaq.monto}`;
      await msg.reply(respFaqCorte);
      await msg.reply(`*¿Y de qué tipo de carne quieres ${descFaq}?*\nTenemos: Surtido, Carne, Buche, Cuero o Lengua`);
      return true;
    }
  }

  const t = textoOriginal.trim().toLowerCase().normalize("NFD").replace(/[̀-ͯ]/g, "");
  const CORTES_MAP = getCortes();
  const palabrasCorteEsp = Object.keys(CORTES_MAP).join("|");
  const matchCorteRespuesta = t.match(new RegExp(`\\b(${palabrasCorteEsp})\\b`));
  const corteDetectado = matchCorteRespuesta ? CORTES_MAP[matchCorteRespuesta[1]] || null : null;

  if (!corteDetectado) {
    const _pedPend  = esperandoCorte.get(clienteNumero);
    const _itemPend = _pedPend.items[_pedPend._indiceActual || 0];
    const _descPend = _itemPend.presentacion === "taco"   ? `los ${_itemPend.cantidad} tacos`
                    : _itemPend.presentacion === "torta"  ? `las ${_itemPend.cantidad} tortas`
                    : _itemPend.presentacion === "gramos" ? `los ${_itemPend.gramos}g`
                    : `los $${_itemPend.monto}`;
    const errores = _sumarError(clienteNumero);
    const extra = errores >= 2 ? "\n\n_Por ejemplo escríbeme: *surtido*, *carne*, *buche*, *cuero* o *lengua*_" : "";
    await msg.reply(`Necesito que me digas el tipo de carne para ${_descPend}.\n*¿Cuál prefieres?* Surtido, Carne, Buche, Cuero o Lengua` + extra);
    return true;
  }

  _resetError(clienteNumero);
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
    return true;
  }

  esperandoCorte.delete(clienteNumero);
  const esPreventa = clientesPreventa.has(clienteNumero);

  // Vino de confirmación acumulada
  if (pedidoParcial._baseConfirmacion !== undefined) {
    const jsonCorteConf = { tipo: "pedido", items: pedidoParcial.items };
    const { texto: lineasCorteConf } = jsonALineas(jsonCorteConf);
    const baseConf   = pedidoParcial._baseConfirmacion.split("\n").filter(l => l.trim() && !/subtotal/i.test(l)).join("\n");
    const nuevasConf = lineasCorteConf.split("\n").filter(l => l.trim() && !/subtotal/i.test(l)).join("\n");
    const combConf   = baseConf + "\n" + nuevasConf;
    const subtConf   = calcularSubtotal(combConf);
    const textoBC    = combConf + "\n💰 Subtotal: $" + subtConf;
    esperandoConfirmacionItem.set(clienteNumero, { lineas: textoBC });
    historial.push({ role: "user",      content: textoOriginal });
    historial.push({ role: "assistant", content: textoBC });
    await msg.reply(textoBC + "\n\n*¿Es correcto?*");
    return true;
  }

  if (pedidoParcial._esModificacionResumen === true && pedidoParcial._ordenBase) {
    const jsonCompletoCorte = { tipo: "pedido", items: pedidoParcial.items };
    const { texto: lineasNuevas } = jsonALineas(jsonCompletoCorte);
    pedidoJSONActual.set(clienteNumero, { _esModificacionResumen: true, ordenBase: pedidoParcial._ordenBase, jsonNuevo: jsonCompletoCorte });
    esperandoConfirmacionItem.set(clienteNumero, { lineas: lineasNuevas, _esModificacionResumen: true, ordenBase: pedidoParcial._ordenBase, jsonNuevo: jsonCompletoCorte });
    historial.push({ role: "user",      content: textoOriginal });
    historial.push({ role: "assistant", content: lineasNuevas });
    await msg.reply(lineasNuevas + "\n\n*¿Agrego esto a tu pedido?*");
    return true;
  }

  const jsonCompletoCorte = { tipo: "pedido", items: pedidoParcial.items };
  pedidoJSONActual.set(clienteNumero, jsonCompletoCorte);
  persistirEstado(clienteNumero);
  const resultado = jsonALineas(jsonCompletoCorte);
  esperandoConfirmacionItem.set(clienteNumero, { lineas: resultado.texto });
  historial.push({ role: "user",      content: textoOriginal });
  historial.push({ role: "assistant", content: resultado.texto });
  await msg.reply(resultado.texto + "\n\n*¿Es correcto?*");
  console.log(`Bot: [CORTE COMPLETADO] Subtotal: $${resultado.subtotal}`);
  return true;
}

// ── DETECCIÓN SIN CORTE ───────────────────────────────────────────────────────
async function handleSinCorte(msg, textoOriginal, clienteNumero) {
  if (!detectarSinCorte(textoOriginal)) return false;

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
  return true;
}

// ── DETECCIÓN SIN TIPO (taco/torta) ──────────────────────────────────────────
async function handleSinTipo(msg, textoOriginal, clienteNumero) {
  const itemSinTipo = detectarSinTipo(textoOriginal);
  if (!itemSinTipo) return false;

  const ordenBase = esperandoAgregarMas.get(clienteNumero) || null;
  if (ordenBase) esperandoAgregarMas.delete(clienteNumero);
  esperandoTipoItem.set(clienteNumero, { ...itemSinTipo, ordenBase });
  await msg.reply(`*¿Los ${itemSinTipo.cantidad} de ${itemSinTipo.corte} serían tacos o tortas?*`);
  return true;
}

// ── MODIFICACIÓN SOBRE ÍTEM ACTUAL (esperandoAgregarMas) ─────────────────────
async function handleModificacionAgregarMas(msg, textoOriginal, clienteNumero) {
  if (!esperandoAgregarMas.has(clienteNumero)) return false;

  const modificacion = detectarModificacion(textoOriginal);
  if (!modificacion) return false;

  const ordenActual     = esperandoAgregarMas.get(clienteNumero);
  const ordenModificada = aplicarModificacion(modificacion, ordenActual);
  if (!ordenModificada) return false;

  esperandoAgregarMas.set(clienteNumero, ordenModificada);
  const subtotal = calcularSubtotal(ordenModificada);
  const lineas   = ordenModificada.split("\n").filter(l => l.trim());
  await msg.reply(lineas.join("\n") + `\n💰 Subtotal: $${subtotal}\n\n*¿Es correcto?*`);
  console.log(`Bot: [MODIFICACIÓN LOCAL] tipo: ${modificacion.tipo}`);
  return true;
}

// ── PRESUPUESTO INVERSO ───────────────────────────────────────────────────────
async function handlePresupuestoInverso(msg, textoOriginal) {
  const mPres = textoOriginal.match(/cu[aá]ntos?\s+(?:tacos?|tortas?)\s+(?:son|me\s+da[ns]?)\s+(?:con\s+)?\$?(\d+)|con\s+\$?(\d+)\s+cu[aá]ntos?|(?:tengo|trae[nm]e)\s+\$?(\d+)\s+pesos?\s+(?:de\s+)?tacos?|qu[eé]\s+me\s+da[ns]?\s+con\s+\$?(\d+)/i);
  if (!mPres) return false;

  const monto = parseInt(mPres[1] || mPres[2] || mPres[3] || mPres[4]);
  if (!monto || monto <= 0) return false;

  try {
    const prs    = getPrecios();
    const tacos  = Math.floor(monto / prs.pTaco);
    const tortas = Math.floor(monto / prs.pTorta);
    let rPres = `💰 Con *$${monto}* puedes llevarte:\n\n`;
    if (tacos  > 0) rPres += `🌮 *${tacos} tacos* ($${prs.pTaco} c/u)\n`;
    if (tortas > 0) rPres += `🥖 *${tortas} tortas* ($${prs.pTorta} c/u)\n`;
    rPres += `\n_¿Qué te preparamos?_ 😊`;
    await msg.reply(rPres);
    return true;
  } catch (_) { return false; }
}

// ── FALLBACK A GROQ ───────────────────────────────────────────────────────────
async function handleGroqFallback(msg, textoOriginal, clienteNumero, historial, esPreventa) {
  historial.push({ role: "user", content: textoOriginal });
  if (historial.length > 15) historial.splice(0, 2);

  const { enFlujoActivo } = require("./utils");
  try {
    const systemPrompt = buildPrompt({
      tomandoPedido:  true,
      textoCliente:   textoOriginal,
      horaConfirmada: horaEntregaPreventa.get(clienteNumero) || null,
      esPreventa,
    });
    const respuestaGroq = await groqConTimeout({
      model:       "llama-3.3-70b-versatile",
      max_tokens:  400,
      temperature: 0.2,
      messages:    [{ role: "system", content: systemPrompt }, ...historial],
    });
    let respuestaTexto = respuestaGroq.choices[0]?.message?.content?.trim() || "";
    historial.push({ role: "assistant", content: respuestaTexto });

    let jsonData = null;
    try { const clean = respuestaTexto.replace(/```json|```/g, "").trim(); jsonData = JSON.parse(clean); } catch (_) {}

    if (jsonData && jsonData.tipo === "pedido" && Array.isArray(jsonData.items)) {
      pedidoJSONActual.set(clienteNumero, jsonData);
      persistirEstado(clienteNumero);
      const resultado = jsonALineas(jsonData);
      esperandoConfirmacionItem.set(clienteNumero, { lineas: resultado.texto });
      await replyConTyping(msg, resultado.texto + "\n\n*¿Es correcto?*");
      console.log(`Bot: [JSON→LÍNEAS] Subtotal: $${resultado.subtotal}`);
      return;
    }
    if (jsonData && jsonData.tipo === "pregunta" && jsonData.mensaje) {
      await replyConTyping(msg, jsonData.mensaje); return;
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
    if (error.message === "GROQ_TIMEOUT") {
      console.warn("Groq timeout — sin respuesta en 15s");
      try { await msg.reply("Disculpa, tardé demasiado en responder. ¿Me repites qué deseas ordenar? 😊"); } catch (_) {}
      return;
    }
    console.error("Error Groq (1er intento):", error.message);
    try {
      await new Promise(r => setTimeout(r, 1000));
      const systemPromptRetry = buildPrompt({
        tomandoPedido:  true,
        textoCliente:   textoOriginal,
        horaConfirmada: horaEntregaPreventa.get(clienteNumero) || null,
        esPreventa,
      });
      const respuestaRetry = await groqConTimeout({
        model:       "llama-3.3-70b-versatile",
        max_tokens:  400,
        temperature: 0.2,
        messages:    [{ role: "system", content: systemPromptRetry }, ...historial],
      });
      const textoRetry = respuestaRetry.choices[0]?.message?.content?.trim() || "";
      if (textoRetry) {
        historial.push({ role: "assistant", content: textoRetry });
        await replyConTyping(msg, textoRetry);
      } else {
        await msg.reply("Disculpa, no entendi. Me repites tu pedido?");
        if (!enFlujoActivo(clienteNumero)) await msg.reply(MENU_FORMATO);
      }
    } catch (retryErr) {
      const esTimeout = retryErr.message === "GROQ_TIMEOUT";
      console.error(`Error Groq (reintento${esTimeout ? " — timeout" : ""}):`, retryErr.message);
      try { await msg.reply("Disculpa, tuve un problemita. Me vuelves a decir que quieres?"); } catch (_) {}
    }
  }
}

module.exports = {
  handleEsperandoTipoItem,
  handleCambioTipoDuranteTomaPedido,
  handleConfirmacionItem,
  handleAgregarMas,
  handleFAQDurantePedido,
  handleRepetirPedido,
  handlePedidoSimple,
  handleEsperandoCorte,
  handleSinCorte,
  handleSinTipo,
  handleModificacionAgregarMas,
  handlePresupuestoInverso,
  handleGroqFallback,
};
