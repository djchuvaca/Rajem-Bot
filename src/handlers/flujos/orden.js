// src/handlers/flujos/orden.js
const Groq = require("groq-sdk");
const {
  esperandoTipoItem, esperandoConfirmacionItem, esperandoAgregarMas,
  esperandoCorte, resumenPendiente, pedidoJSONActual, tipoEntregaCliente,
  datosCampos, horaEntregaPreventa, clientesPreventa, persistirEstado,
  detectarEdicion, aplicarEdicion, mostrarFormularioProgresivo,
  esperandoExtras, ordenPreResumen, datosRecibidos,
  camposCompletos, siguienteCampoFaltante, esperandoConfirmacionDatos,
} = require("../../estado");
const { generarResumen, jsonALineas, extraerOrdenDeResumen, formatearListaAcumulada } = require("../../pedido/resumen");
const {
  parsearPedidoSimple, detectarSinCorte, detectarSinTipo,
  detectarModificacion, detectarRepetirPedido, getCortes, detectarPreguntaFrecuente,
  detectarRefresco, getSalsas, detectarSalsa, separarRefresco, parsearDistribucionCortes, parsearDistribucionRefrescos, normalizar, buscarCorteFuzzy,
} = require("../pedidoParser");
const { generarRespuestaAutomatica, aplicarModificacion } = require("../respuestas");
const { calcularSubtotal, getPrecios } = require("../../pedido/precios");
const { getUltimoPedido } = require("../../db");
const { buildPrompt } = require("../../prompts/index");
const { MENU_FORMATO } = require("../../config");
const {
  telefonosReales, ultimoPedido, replyConTyping, parsearSinCorteItems, palabrasConfirmacion, listaCortes,
} = require("./utils");

const groq = new Groq({ apiKey: process.env.GROQ_API_KEY });
const GROQ_TIMEOUT_MS = parseInt(process.env.GROQ_TIMEOUT_MS || "15000");

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

// ── HELPERS PARA EXTRAS ───────────────────────────────────────────────────────
function _listaNombresRefrescos() {
  const refs = require("../pedidoParser").getRefrescos();
  return refs.length > 0
    ? refs.map(r => r.nombre.charAt(0).toUpperCase() + r.nombre.slice(1)).join(" · ")
    : "Coca Cola · Fanta · Sprite";
}

function _listaNombresSalsas() {
  const sals = getSalsas();
  return sals.length > 0
    ? sals.map(s => s.nombre.charAt(0).toUpperCase() + s.nombre.slice(1)).join(" · ")
    : "picada · cebolla · suave · roja · limones";
}


// Calcula el precio total de salsas usando el precio individual de cada una desde la BD.
// items: array de strings (nombres) o array de {nombre, cantidad}.
// Cae al precio global (precios.pSalsa) si la salsa no tiene precio configurado.
function _calcularPrecioSalsas(items, cantTotal, precios) {
  const salsasDB = getSalsas();
  const getPrecio = nombre => {
    const sal = salsasDB.find(s => s.nombre === nombre.toLowerCase());
    return (sal && sal.precio_taco > 0) ? sal.precio_taco : precios.pSalsa;
  };
  if (items.length > 0 && typeof items[0] === "object") {
    return items.reduce((acc, s) => acc + (s.cantidad || 1) * getPrecio(s.nombre), 0);
  }
  if (items.length === 1) return cantTotal * getPrecio(items[0]);
  return items.reduce((acc, nombre) => acc + getPrecio(nombre), 0);
}

function _formatearSalsaExtra(nombres, cantidad, precioTotal) {
  return `🌶️ ${cantidad} salsa${cantidad > 1 ? "s" : ""} extra (${nombres}) — $${precioTotal}`;
}

async function _mostrarConfirmacionFinal(msg, clienteNumero, historial, ordenTexto, esOrdenDom, esPreventa) {
  esperandoExtras.delete(clienteNumero);
  const subtotal = calcularSubtotal(ordenTexto);
  const textoFinal = ordenTexto + "\n💰 Subtotal: $" + subtotal;
  esperandoConfirmacionItem.set(clienteNumero, {
    lineas: textoFinal,
    _esOrdenFinalCompleta: true,
    _esOrdenDom: esOrdenDom,
    _esPreventa: esPreventa,
  });
  persistirEstado(clienteNumero);
  historial.push({ role: "user", content: "" });
  historial.push({ role: "assistant", content: textoFinal });
  await msg.reply(textoFinal + "\n\n*¿Es correcto?*");
}

async function _avanzarExtrasOConfirmar(msg, clienteNumero, historial, json, refrescos, salsas, esOrdenDom, esPreventa) {
  const precios = getPrecios();
  const { texto: itemsTexto } = jsonALineas(json);
  let ordenAcum = itemsTexto.split("\n")
    .filter(l => l.trim() && !/subtotal/i.test(l))
    .join("\n");

  for (const ref of refrescos.filter(r => !r.esGenerico)) {
    ordenAcum += "\n" + _formatearRefresco(ref);
  }

  const salsasEsp = salsas.filter(s => !s.esGenerico);
  if (salsasEsp.length > 0) {
    const nombres   = salsasEsp.map(s => s.nombre.charAt(0).toUpperCase() + s.nombre.slice(1)).join(", ");
    const cantTotal = salsasEsp.reduce((acc, s) => acc + (s.cantidad || 1), 0);
    ordenAcum += "\n" + _formatearSalsaExtra(nombres, cantTotal, _calcularPrecioSalsas(salsasEsp, cantTotal, precios));
  }

  const refGen = refrescos.find(r => r.esGenerico);
  const salGen = salsas.find(s => s.esGenerico);

  if (refGen) {
    const listaRef = _listaNombresRefrescos();
    const cantMsg = refGen.cantidad > 1 ? `${refGen.cantidad} refrescos` : "un refresco";
    esperandoExtras.set(clienteNumero, {
      ordenTexto: ordenAcum,
      esOrdenDom, esPreventa,
      tieneRefresco: refrescos.some(r => !r.esGenerico),
      tieneSalsa: salsasEsp.length > 0,
      fase: "especRefresco",
      _cantidadRefPendiente: refGen.cantidad,
      _cantidadSalPendiente: salGen ? salGen.cantidad : null,
      _flujoUnificado: true,
    });
    persistirEstado(clienteNumero);
    await msg.reply(`Quieres *${cantMsg}* 🥤 ¿Cuáles serían?\n\n*${listaRef}*`);
    return;
  }

  if (salGen) {
    const listaSalsas = _listaNombresSalsas();
    const cantMsg = salGen.cantidad > 1 ? `${salGen.cantidad} salsas` : "una salsa";
    esperandoExtras.set(clienteNumero, {
      ordenTexto: ordenAcum,
      esOrdenDom, esPreventa,
      tieneRefresco: refrescos.some(r => !r.esGenerico),
      tieneSalsa: false,
      fase: "especSalsa",
      _cantidadSalPendiente: salGen.cantidad,
      _cantidadRefPendiente: null,
      _flujoUnificado: true,
    });
    persistirEstado(clienteNumero);
    await msg.reply(`También quieres *${cantMsg}* extra 🌶️ ¿Cuáles serían?\n\n*${listaSalsas}*`);
    return;
  }

  pedidoJSONActual.set(clienteNumero, json);
  await _mostrarConfirmacionFinal(msg, clienteNumero, historial, ordenAcum, esOrdenDom, esPreventa);
}

function _formatearRefresco(ref) {
  const nombreDisplay = ref.nombre.charAt(0).toUpperCase() + ref.nombre.slice(1);
  const precio = ref.precio * ref.cantidad;
  return ref.cantidad > 1
    ? `🥤 ${ref.cantidad}x ${nombreDisplay} — $${precio}`
    : `🥤 ${nombreDisplay} — $${precio}`;
}

async function _iniciarFormPostOrden(msg, clienteNumero, ordenTexto, esOrdenDom, esPreventa, historial) {
  // Si en esta misma sesión ya se confirmaron los datos, ir directo al resumen
  if (datosRecibidos.has(clienteNumero) && camposCompletos(clienteNumero, esOrdenDom, esPreventa)) {
    const resumenGenerado = generarResumen(clienteNumero, ordenTexto, esOrdenDom, esPreventa);
    resumenPendiente.set(clienteNumero, { texto: resumenGenerado.texto, esTransferencia: resumenGenerado.esTransferencia });
    historial.push({ role: "user",      content: "no, ya es todo" });
    historial.push({ role: "assistant", content: resumenGenerado.texto });
    persistirEstado(clienteNumero);
    await msg.reply(resumenGenerado.texto);
    return;
  }

  // Asegurarse de que tipoEntrega esté en datosCampos (solo si ya se conoce)
  const campos = datosCampos.get(clienteNumero) || {};
  if (!campos.tipoEntrega && tipoEntregaCliente.has(clienteNumero)) {
    campos.tipoEntrega = tipoEntregaCliente.get(clienteNumero);
    datosCampos.set(clienteNumero, campos);
  }

  // Guardar la orden ANTES de preguntar el tipo, para que handleFormularioProgresivo
  // pueda activarse en la siguiente respuesta del cliente.
  ordenPreResumen.set(clienteNumero, ordenTexto);

  // Si el tipo de entrega aún no se conoce, preguntarlo antes del formulario
  if (!campos.tipoEntrega && !tipoEntregaCliente.has(clienteNumero)) {
    persistirEstado(clienteNumero);
    await msg.reply("Para confirmar tu pedido, *¿será para domicilio o pasas a recoger al mostrador?*");
    return;
  }

  const esCompleto = camposCompletos(clienteNumero, esOrdenDom, esPreventa);
  if (esCompleto) {
    // Cliente con datos precargados: pedir confirmación
    const formPrecargado = mostrarFormularioProgresivo(clienteNumero, esOrdenDom, esPreventa);
    esperandoConfirmacionDatos.set(clienteNumero, { tipoEntrega: campos.tipoEntrega, esPreventa });
    persistirEstado(clienteNumero);
    await msg.reply("Para confirmar tu pedido necesito tus datos:\n\n" + formPrecargado + "\n\n*¿Son correctos los datos?*");
  } else {
    // Cliente nuevo o con datos incompletos: recopilar progresivamente
    const faltante = siguienteCampoFaltante(clienteNumero, esOrdenDom, esPreventa);
    const formProg  = mostrarFormularioProgresivo(clienteNumero, esOrdenDom, esPreventa);
    persistirEstado(clienteNumero);
    await msg.reply(
      "Para confirmar tu pedido necesito algunos datos:\n\n" +
      (faltante ? formProg + "\n\n" + faltante.pregunta : formProg + "\n\n*¿Son correctos los datos?*")
    );
  }
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

    if (pendiente._fromExtras) {
      // Loop back to extras after confirmation
      esperandoExtras.set(clienteNumero, { ...pendiente._fromExtras, ordenTexto: nuevaOrden, fase: "pregunta" });
    } else {
      esperandoAgregarMas.set(clienteNumero, nuevaOrden);
    }
    esperandoConfirmacionItem.set(clienteNumero, { lineas: resultado.texto, _refrescosPendientes: pendiente._refrescosPendientes || [], _salsasPendientes: pendiente._salsasPendientes || [] });
    persistirEstado(clienteNumero);
    await msg.reply(resultado.texto + "\n\n*¿Agrego esto a tu pedido?*");
  } else {
    const esOrdDom = tipoEntregaCliente.get(clienteNumero) === "domicilio";
    const esPrev   = clientesPreventa.has(clienteNumero);
    await _avanzarExtrasOConfirmar(msg, clienteNumero, historial, json, pendiente._refrescosPendientes || [], pendiente._salsasPendientes || [], esOrdDom, esPrev);
  }
  console.log(`Bot: [SIN TIPO → ${tipo}] corte: ${pendiente.corte}, cantidad: ${pendiente.cantidad}`);
  return true;
}

// ── CAMBIO DE TIPO DURANTE TOMA DE PEDIDO ────────────────────────────────────
async function handleCambioTipoDuranteTomaPedido(msg, textoOriginal, clienteNumero, historial) {
  // Durante formulario post-orden, handleCambioTipoDuranteFormulario (formulario.js) lo maneja
  if (ordenPreResumen.has(clienteNumero)) return false;

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
  await msg.reply(MENU_FORMATO());
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
    esperandoExtras.delete(clienteNumero);
    _resetError(clienteNumero);
    const textoSinNo = textoOriginal.replace(/^(?:no|nel|nop)[,\s]+/i, "").trim();
    if (textoSinNo.length > 3) {
      let jsonRechazoPed = parsearPedidoSimple(textoSinNo);
      if (!jsonRechazoPed) {
        const matchNum = textoSinNo.match(/\b(\d+)\b/);
        const esTacoR  = /\btacos?\b/i.test(textoSinNo);
        const esTortaR = /\btortas?\b/i.test(textoSinNo);
        if (matchNum && (esTacoR || esTortaR)) {
          const cortesMap = getCortes();
          const palabrasC = Object.keys(cortesMap).join("|");
          const mCorte    = itemData.lineas.match(new RegExp(`\\b(${palabrasC})\\b`, "i"));
          if (mCorte) {
            const corteR = cortesMap[mCorte[1].toLowerCase()];
            jsonRechazoPed = { tipo: "pedido", items: [{ presentacion: esTortaR ? "torta" : "taco", cantidad: parseInt(matchNum[1]), corte: corteR }] };
          }
        }
      }
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
    await msg.reply(MENU_FORMATO());
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

    // Orden completa resuelta (flujo unificado) → ir al formulario directamente
    if (itemData._esOrdenFinalCompleta) {
      const ordenCompleta = itemData.lineas.split("\n")
        .filter(l => l.trim() && !/subtotal/i.test(l))
        .join("\n");
      const esPrev   = clientesPreventa.has(clienteNumero);
      const esOrdDom = itemData._esOrdenDom !== undefined ? itemData._esOrdenDom : esOrdenDom;
      historial.push({ role: "user",      content: "si, correcto" });
      historial.push({ role: "assistant", content: itemData.lineas });
      persistirEstado(clienteNumero);
      await _iniciarFormPostOrden(msg, clienteNumero, ordenCompleta, esOrdDom, esPrev, historial);
      return true;
    }

    // ── Nuevo flujo extras o flujo legacy ─────────────────────────────────────
    const extrasCtx = esperandoExtras.has(clienteNumero) ? esperandoExtras.get(clienteNumero) : null;
    const ordenActual = extrasCtx ? extrasCtx.ordenTexto : (esperandoAgregarMas.get(clienteNumero) || "");

    const lineasNuevas = itemData.lineas.split("\n").filter(l => {
      const t = l.trim();
      if (!t) return false;
      if (/^📍|^📌|^🛵|^💵|^💰|^💳|^🕖/u.test(t)) return false;
      if (/subtotal|tarifa|direcci[oó]n|referencia|total:/i.test(t)) return false;
      if (ordenActual.includes(t)) return false;
      return true;
    }).join("\n");
    const nuevaOrden = ordenActual ? ordenActual + "\n" + lineasNuevas : lineasNuevas;

    historial.push({ role: "user",      content: "si, correcto" });
    historial.push({ role: "assistant", content: itemData.lineas });
    persistirEstado(clienteNumero);

    if (extrasCtx || !esperandoAgregarMas.has(clienteNumero)) {
      // Nuevo flujo: ir a extras
      const esPreventa = clientesPreventa.has(clienteNumero);
      const refrescosPendientes = itemData._refrescosPendientes || [];
      const salsasPendientes    = itemData._salsasPendientes    || [];
      const esGenericoRef  = refrescosPendientes.length === 1 && refrescosPendientes[0]?.esGenerico === true;
      const esGenericoSal  = salsasPendientes.length   === 1 && salsasPendientes[0]?.esGenerico   === true;
      const specificRefs   = refrescosPendientes.filter(r => !r.esGenerico);
      const specificSals   = salsasPendientes.filter(s => !s.esGenerico);

      let ordenConExtras = nuevaOrden;
      let tieneRefrescoInicial = extrasCtx?.tieneRefresco || false;
      let tieneSalsaInicial    = extrasCtx?.tieneSalsa    || false;

      if (specificRefs.length > 0) {
        for (const ref of specificRefs) ordenConExtras += "\n" + _formatearRefresco(ref);
        tieneRefrescoInicial = true;
      }
      if (specificSals.length > 0) {
        const nombresSals = specificSals.map(s => s.nombre.charAt(0).toUpperCase() + s.nombre.slice(1)).join(", ");
        ordenConExtras += `\n🌶️ Salsas: ${nombresSals}`;
        tieneSalsaInicial = true;
      }

      const faseInicial = esGenericoRef                                                          ? "especRefresco"
                        : (specificRefs.length > 0 || esGenericoSal || specificSals.length > 0) ? "especSalsa"
                        : "pregunta";

      esperandoExtras.set(clienteNumero, {
        ordenTexto:            ordenConExtras,
        esOrdenDom,
        esPreventa,
        tieneRefresco:         tieneRefrescoInicial,
        tieneSalsa:            tieneSalsaInicial,
        fase:                  faseInicial,
        _cantidadRefPendiente: esGenericoRef ? refrescosPendientes[0].cantidad : null,
        _cantidadSalPendiente: esGenericoSal ? salsasPendientes[0].cantidad   : null,
      });

      const listaSalsas = _listaNombresSalsas();
      if (esGenericoRef) {
        const listaRef = _listaNombresRefrescos();
        const cantMsg = refrescosPendientes[0].cantidad > 1 ? `${refrescosPendientes[0].cantidad} refrescos` : "un refresco";
        await msg.reply(`Anotado, quieres *${cantMsg}*! 🥤 ¿Cuáles serían?\n\n*${listaRef}*`);
      } else if (specificRefs.length > 0 && esGenericoSal) {
        const refNombres = specificRefs.map(r => `*${r.nombre.charAt(0).toUpperCase() + r.nombre.slice(1)}*`).join(" y ");
        const cantSalMsg = salsasPendientes[0].cantidad > 1 ? `${salsasPendientes[0].cantidad} salsas` : "una salsa";
        await msg.reply(
          `Agregué ${refNombres} a tu pedido! 🥤\n\n` +
          `También quieres *${cantSalMsg}* extra 🌶️ ¿Cuáles serían?\n\n*${listaSalsas}*`
        );
      } else if (specificRefs.length > 0 && specificSals.length > 0) {
        const refNombres = specificRefs.map(r => `*${r.nombre.charAt(0).toUpperCase() + r.nombre.slice(1)}*`).join(" y ");
        const salNombres = specificSals.map(s => s.nombre.charAt(0).toUpperCase() + s.nombre.slice(1)).join(", ");
        await msg.reply(
          `Agregué ${refNombres} y salsas (${salNombres}) a tu pedido! 🥤🌶️\n\n` +
          `¿Deseas agregar algo más? _(Escribe *no* si ya es todo)_`
        );
      } else if (specificRefs.length > 0) {
        const refNombres = specificRefs.map(r => `*${r.nombre.charAt(0).toUpperCase() + r.nombre.slice(1)}*`).join(" y ");
        await msg.reply(
          `Agregué ${refNombres} a tu pedido! 🥤\n\n` +
          `¿Quieres también alguna *Salsa* extra? 🌶️\n\n*${listaSalsas}*\n\n` +
          `_(O escribe *no* si no quieres)_`
        );
      } else if (esGenericoSal) {
        const cantSalMsg = salsasPendientes[0].cantidad > 1 ? `${salsasPendientes[0].cantidad} salsas` : "una salsa";
        await msg.reply(`Anotado, quieres *${cantSalMsg}* extra 🌶️ ¿Cuáles serían?\n\n*${listaSalsas}*`);
      } else if (specificSals.length > 0) {
        const salNombres = specificSals.map(s => s.nombre.charAt(0).toUpperCase() + s.nombre.slice(1)).join(", ");
        await msg.reply(
          `Agregué salsas (${salNombres}) a tu pedido! 🌶️\n\n` +
          `¿Quieres también algún *Refresco*? 🥤\n\n*${_listaNombresRefrescos()}*\n\n` +
          `_(O escribe *no* si no quieres)_`
        );
      } else {
        await msg.reply("¿Deseas agregar algún *Refresco* o *Salsa* extra? 🌶️🥤\n\n_(O escribe *no* si ya es todo)_");
      }
    } else {
      // Flujo legacy (resumen fallback): mantener en esperandoAgregarMas
      esperandoAgregarMas.set(clienteNumero, nuevaOrden);
      await msg.reply("*¿Deseas agregar algo más a tu pedido?*");
    }
    return true;
  }

  // Extras agregados desde el "¿Es correcto?" final (flujo unificado)
  if (itemData._esOrdenFinalCompleta) {
    const { textoLimpio, refrescos: refsDetectados, salsas: salsDetectados } = separarRefresco(textoOriginal);
    const jsonExtra = textoLimpio.trim().length > 2 ? parsearPedidoSimple(textoLimpio) : null;
    const tieneExtras = refsDetectados.length > 0 || salsDetectados.length > 0 || (jsonExtra?.tipo === "pedido");

    if (tieneExtras) {
      const esPrev   = clientesPreventa.has(clienteNumero);
      const esOrdDom = itemData._esOrdenDom !== undefined ? itemData._esOrdenDom : esOrdenDom;
      let nuevaBase  = itemData.lineas.split("\n")
        .filter(l => l.trim() && !/subtotal/i.test(l))
        .join("\n");

      if (jsonExtra?.tipo === "pedido") {
        const { texto: extraTexto } = jsonALineas(jsonExtra);
        const extraLineas = extraTexto.split("\n").filter(l => l.trim() && !/subtotal/i.test(l)).join("\n");
        nuevaBase += "\n" + extraLineas;
      }

      const refEsp = refsDetectados.filter(r => !r.esGenerico);
      const salEsp = salsDetectados.filter(s => !s.esGenerico);
      const refGen = refsDetectados.find(r => r.esGenerico);
      const salGen = salsDetectados.find(s => s.esGenerico);

      for (const ref of refEsp) nuevaBase += "\n" + _formatearRefresco(ref);
      if (salEsp.length > 0) {
        const precios  = getPrecios();
        const nombres  = salEsp.map(s => s.nombre.charAt(0).toUpperCase() + s.nombre.slice(1)).join(", ");
        const cant     = salEsp.reduce((acc, s) => acc + (s.cantidad || 1), 0);
        nuevaBase += "\n" + _formatearSalsaExtra(nombres, cant, _calcularPrecioSalsas(salEsp, cant, precios));
      }

      esperandoConfirmacionItem.delete(clienteNumero);

      if (refGen) {
        const listaRef = _listaNombresRefrescos();
        const cantMsg  = refGen.cantidad > 1 ? `${refGen.cantidad} refrescos` : "un refresco";
        esperandoExtras.set(clienteNumero, {
          ordenTexto: nuevaBase, esOrdenDom: esOrdDom, esPreventa: esPrev,
          tieneRefresco: refEsp.length > 0, tieneSalsa: salEsp.length > 0,
          fase: "especRefresco",
          _cantidadRefPendiente: refGen.cantidad,
          _cantidadSalPendiente: salGen ? salGen.cantidad : null,
          _flujoUnificado: true,
        });
        persistirEstado(clienteNumero);
        await msg.reply(`¿Cuál *${cantMsg}*? 🥤\n\n*${listaRef}*`);
        return true;
      }

      if (salGen) {
        const listaSal = _listaNombresSalsas();
        const cantMsg  = salGen.cantidad > 1 ? `${salGen.cantidad} salsas` : "una salsa";
        esperandoExtras.set(clienteNumero, {
          ordenTexto: nuevaBase, esOrdenDom: esOrdDom, esPreventa: esPrev,
          tieneRefresco: refEsp.length > 0, tieneSalsa: false,
          fase: "especSalsa",
          _cantidadSalPendiente: salGen.cantidad,
          _cantidadRefPendiente: null,
          _flujoUnificado: true,
        });
        persistirEstado(clienteNumero);
        await msg.reply(`¿Cuál *${cantMsg}* extra? 🌶️\n\n*${listaSal}*`);
        return true;
      }

      historial.push({ role: "user", content: textoOriginal });
      await _mostrarConfirmacionFinal(msg, clienteNumero, historial, nuevaBase, esOrdDom, esPrev);
      return true;
    }
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

// ── EXTRAS (Refresco / Salsa / más items) ────────────────────────────────────
async function handleExtras(msg, textoOriginal, clienteNumero, historial, esOrdenDom, esPreventa) {
  if (!esperandoExtras.has(clienteNumero)) return false;

  const ctx = esperandoExtras.get(clienteNumero);
  const { ordenTexto, tieneRefresco, tieneSalsa, fase } = ctx;

  // Normalizar dígito+letra pegados: "2fantas" → "2 fantas"
  const textoNorm = textoOriginal.replace(/(\d)([a-zA-ZáéíóúüñÁÉÍÓÚÜÑ])/g, "$1 $2");

  const esNo = /^(no|nel|nop|nada\s*m[aá]s?|ya\s*es\s*todo|eso\s*es\s*todo|listo|ya|solo\s*eso|eso|no\s*,?\s*(gracias|gra|gras)|as[ií]\s*est[aá](\s*bien)?|ya\s*fue|ya\s*con\s*eso|ninguno|ninguna|paso|nada)$/i.test(textoOriginal.trim());
  const esSi = palabrasConfirmacion.test(textoOriginal.trim());

  // ── FASE: CONFIRMACIÓN DE MÚLTIPLES REFRESCOS ───────────────────────────────
  if (fase === "confirmMultiRefresco") {
    const pendRefs = ctx.pendientesRefrescos || [];
    let nuevaOrden = ordenTexto;
    for (const ref of pendRefs) nuevaOrden += "\n" + _formatearRefresco(ref);
    if (!tieneSalsa && ctx._cantidadSalPendiente) {
      const listaSalsas = _listaNombresSalsas();
      const cantMsg = ctx._cantidadSalPendiente > 1 ? `${ctx._cantidadSalPendiente} salsas` : "una salsa";
      esperandoExtras.set(clienteNumero, { ...ctx, ordenTexto: nuevaOrden, tieneRefresco: true, fase: "especSalsa", pendientesRefrescos: null });
      persistirEstado(clienteNumero);
      await msg.reply(`También quieres *${cantMsg}* extra 🌶️ ¿Cuáles serían?\n\n*${listaSalsas}*`);
    } else if (!tieneSalsa && !ctx._flujoUnificado) {
      const listaSalsas = _listaNombresSalsas();
      esperandoExtras.set(clienteNumero, { ...ctx, ordenTexto: nuevaOrden, tieneRefresco: true, fase: "especSalsa", pendientesRefrescos: null });
      persistirEstado(clienteNumero);
      await msg.reply(`Anotado! 🥤 ¿Quieres también alguna *Salsa* extra? 🌶️\n\n*${listaSalsas}*\n\n_(O escribe *no* si no quieres)_`);
    } else {
      await _mostrarConfirmacionFinal(msg, clienteNumero, historial, nuevaOrden, ctx.esOrdenDom, ctx.esPreventa);
    }
    return true;
  }

  // ── FASE: CONFIRMACIÓN DE REFRESCO ──────────────────────────────────────────
  if (fase === "confirmRefresco") {
    const pendRef = ctx.pendienteRefresco;
    const lineaRef = _formatearRefresco(pendRef);
    const nuevaOrden = ordenTexto + "\n" + lineaRef;
    if (!tieneSalsa && ctx._cantidadSalPendiente) {
      const listaSalsas = _listaNombresSalsas();
      const cantMsg = ctx._cantidadSalPendiente > 1 ? `${ctx._cantidadSalPendiente} salsas` : "una salsa";
      esperandoExtras.set(clienteNumero, { ...ctx, ordenTexto: nuevaOrden, tieneRefresco: true, fase: "especSalsa", pendienteRefresco: null });
      persistirEstado(clienteNumero);
      await msg.reply(`También quieres *${cantMsg}* extra 🌶️ ¿Cuáles serían?\n\n*${listaSalsas}*`);
    } else if (!tieneSalsa && !ctx._flujoUnificado) {
      const listaSalsas = _listaNombresSalsas();
      esperandoExtras.set(clienteNumero, { ...ctx, ordenTexto: nuevaOrden, tieneRefresco: true, fase: "especSalsa", pendienteRefresco: null });
      persistirEstado(clienteNumero);
      await msg.reply(`Anotado! 🥤 ¿Quieres también alguna *Salsa* extra? 🌶️\n\n*${listaSalsas}*\n\n_(O escribe *no* si no quieres)_`);
    } else {
      await _mostrarConfirmacionFinal(msg, clienteNumero, historial, nuevaOrden, ctx.esOrdenDom, ctx.esPreventa);
    }
    return true;
  }

  // ── FASE: ESPECIFICAR REFRESCO ───────────────────────────────────────────────
  if (fase === "especRefresco") {
    if (esNo) {
      if (!tieneSalsa) {
        const listaSalsas = _listaNombresSalsas();
        esperandoExtras.set(clienteNumero, { ...ctx, fase: "especSalsa" });
        if (ctx._cantidadSalPendiente) {
          const cantMsg = ctx._cantidadSalPendiente > 1 ? `${ctx._cantidadSalPendiente} salsas` : "una salsa";
          await msg.reply(`Quieres *${cantMsg}* extra 🌶️ ¿Cuáles serían?\n\n*${listaSalsas}*`);
        } else {
          await msg.reply(`¿Quieres agregar alguna *Salsa* extra? 🌶️\n\n*${listaSalsas}*\n\n_(O escribe *no* si no quieres)_`);
        }
      } else {
        await _mostrarConfirmacionFinal(msg, clienteNumero, historial, ordenTexto, ctx.esOrdenDom, ctx.esPreventa);
      }
      return true;
    }
    // Distribución multi-tipo: "2 de fanta y 1 de manzana"
    if (ctx._cantidadRefPendiente > 1) {
      const distRef = parsearDistribucionRefrescos(textoNorm);
      if (distRef) {
        const totalRef = distRef.reduce((s, r) => s + r.cantidad, 0);
        if (totalRef !== ctx._cantidadRefPendiente) {
          const listaRef = _listaNombresRefrescos();
          await msg.reply(`Quieres *${ctx._cantidadRefPendiente} refrescos* pero me escribiste *${totalRef}* 🤔\n¿Cuáles serían?\n\n*${listaRef}*`);
          return true;
        }
        const lineasRef = distRef.map(r => _formatearRefresco(r)).join("\n");
        let nuevaOrdenMulti = ordenTexto + "\n" + lineasRef;
        if (!tieneSalsa && ctx._cantidadSalPendiente) {
          const listaSalsas = _listaNombresSalsas();
          const cantMsg = ctx._cantidadSalPendiente > 1 ? `${ctx._cantidadSalPendiente} salsas` : "una salsa";
          esperandoExtras.set(clienteNumero, { ...ctx, ordenTexto: nuevaOrdenMulti, tieneRefresco: true, fase: "especSalsa", _cantidadRefPendiente: null, pendientesRefrescos: null });
          persistirEstado(clienteNumero);
          await msg.reply(`También quieres *${cantMsg}* extra 🌶️ ¿Cuáles serían?\n\n*${listaSalsas}*`);
        } else if (!tieneSalsa && !ctx._flujoUnificado) {
          const listaSalsas = _listaNombresSalsas();
          esperandoExtras.set(clienteNumero, { ...ctx, ordenTexto: nuevaOrdenMulti, tieneRefresco: true, fase: "especSalsa", _cantidadRefPendiente: null, pendientesRefrescos: null });
          persistirEstado(clienteNumero);
          await msg.reply(`Anotado! 🥤 ¿Quieres también alguna *Salsa* extra? 🌶️\n\n*${listaSalsas}*\n\n_(O escribe *no* si no quieres)_`);
        } else {
          await _mostrarConfirmacionFinal(msg, clienteNumero, historial, nuevaOrdenMulti, ctx.esOrdenDom, ctx.esPreventa);
        }
        return true;
      }
    }
    // Refresco único
    const refresco = detectarRefresco(textoNorm);
    if (refresco) {
      const cantFinal = (ctx._cantidadRefPendiente && refresco.cantidad === 1)
        ? ctx._cantidadRefPendiente : refresco.cantidad;
      const refFinal = cantFinal !== refresco.cantidad ? { ...refresco, cantidad: cantFinal } : refresco;
      const lineaRef = _formatearRefresco(refFinal);
      const nuevaOrden = ordenTexto + "\n" + lineaRef;
      if (!tieneSalsa && ctx._cantidadSalPendiente) {
        const listaSalsas = _listaNombresSalsas();
        const cantMsg = ctx._cantidadSalPendiente > 1 ? `${ctx._cantidadSalPendiente} salsas` : "una salsa";
        esperandoExtras.set(clienteNumero, { ...ctx, ordenTexto: nuevaOrden, tieneRefresco: true, fase: "especSalsa", _cantidadRefPendiente: null });
        persistirEstado(clienteNumero);
        await msg.reply(`También quieres *${cantMsg}* extra 🌶️ ¿Cuáles serían?\n\n*${listaSalsas}*`);
      } else if (!tieneSalsa && !ctx._flujoUnificado) {
        const listaSalsas = _listaNombresSalsas();
        esperandoExtras.set(clienteNumero, { ...ctx, ordenTexto: nuevaOrden, tieneRefresco: true, fase: "especSalsa", _cantidadRefPendiente: null });
        persistirEstado(clienteNumero);
        await msg.reply(`Anotado! 🥤 ¿Quieres también alguna *Salsa* extra? 🌶️\n\n*${listaSalsas}*\n\n_(O escribe *no* si no quieres)_`);
      } else {
        await _mostrarConfirmacionFinal(msg, clienteNumero, historial, nuevaOrden, ctx.esOrdenDom, ctx.esPreventa);
      }
      return true;
    }
    const listaRef = _listaNombresRefrescos();
    await msg.reply(`No entendí. ¿Cuántos refrescos y de cuáles? 🥤\n\n*${listaRef}*`);
    return true;
  }

  // ── FASE: CONFIRMACIÓN DE SALSA ──────────────────────────────────────────────
  if (fase === "confirmSalsa") {
    const pendSalsa = ctx.pendienteSalsas;
    const precios = getPrecios();
    const cantSal = ctx._cantidadSalPendiente || pendSalsa.length;
    const nombres = pendSalsa.map(s => s.charAt(0).toUpperCase() + s.slice(1)).join(", ");
    const lineaSalsa = _formatearSalsaExtra(nombres, cantSal, _calcularPrecioSalsas(pendSalsa, cantSal, precios));
    const nuevaOrden = ordenTexto + "\n" + lineaSalsa;
    if (!tieneRefresco && !ctx._flujoUnificado) {
      const listaRef = _listaNombresRefrescos();
      esperandoExtras.set(clienteNumero, { ...ctx, ordenTexto: nuevaOrden, tieneSalsa: true, fase: "especRefresco", pendienteSalsas: null });
      persistirEstado(clienteNumero);
      await msg.reply(`¿Quieres agregar algún *Refresco*? 🥤\n\n*${listaRef}*\n\n_(O escribe *no* si no quieres)_`);
    } else {
      await _mostrarConfirmacionFinal(msg, clienteNumero, historial, nuevaOrden, ctx.esOrdenDom, ctx.esPreventa);
    }
    return true;
  }

  // ── FASE: ESPECIFICAR SALSA ──────────────────────────────────────────────────
  if (fase === "especSalsa") {
    if (esNo) {
      if (!tieneRefresco && !ctx._flujoUnificado) {
        const listaRef = _listaNombresRefrescos();
        esperandoExtras.set(clienteNumero, { ...ctx, fase: "especRefresco" });
        persistirEstado(clienteNumero);
        await msg.reply(`¿Quieres agregar algún *Refresco*? 🥤\n\n*${listaRef}*\n\n_(O escribe *no* si no quieres)_`);
      } else {
        await _mostrarConfirmacionFinal(msg, clienteNumero, historial, ordenTexto, ctx.esOrdenDom, ctx.esPreventa);
      }
      return true;
    }
    const salsas = detectarSalsa(textoNorm);
    if (salsas && salsas.length > 0) {
      const precios = getPrecios();
      const cantSal = ctx._cantidadSalPendiente || salsas.length;
      const nombres = salsas.map(s => s.charAt(0).toUpperCase() + s.slice(1)).join(", ");
      const lineaSalsa = _formatearSalsaExtra(nombres, cantSal, _calcularPrecioSalsas(salsas, cantSal, precios));
      const nuevaOrden = ordenTexto + "\n" + lineaSalsa;
      if (!tieneRefresco && !ctx._flujoUnificado) {
        const listaRef = _listaNombresRefrescos();
        esperandoExtras.set(clienteNumero, { ...ctx, ordenTexto: nuevaOrden, tieneSalsa: true, fase: "especRefresco", pendienteSalsas: null });
        persistirEstado(clienteNumero);
        await msg.reply(`¿Quieres agregar algún *Refresco*? 🥤\n\n*${listaRef}*\n\n_(O escribe *no* si no quieres)_`);
      } else {
        await _mostrarConfirmacionFinal(msg, clienteNumero, historial, nuevaOrden, ctx.esOrdenDom, ctx.esPreventa);
      }
      return true;
    }
    const listaSalsas = _listaNombresSalsas();
    await msg.reply(`No entendí. ¿Cuáles salsas deseas? 🌶️\n\n*${listaSalsas}*`);
    return true;
  }

  // ── FASE: PREGUNTA INICIAL ─────────────────────────────────────────────────
  // (fase === "pregunta" u otra no reconocida)

  // Subtotal acumulado
  if (/cu[aá]nto\s+(?:llevo|tengo|es(?:\s+todo)?(?:\s+lo\s+que\s+llevo)?|llega|va)|(?:total|subtotal)\s+(?:hasta\s+ahorita|por\s+ahora|de\s+lo\s+que\s+llevo)/i.test(textoOriginal)) {
    const lista = formatearListaAcumulada(ordenTexto);
    await msg.reply(lista);
    await new Promise(r => setTimeout(r, 300));
    await msg.reply("¿Deseas agregar algún *Refresco* o *Salsa* extra? 🌶️🥤");
    return true;
  }

  // FAQ
  const faqExt = detectarPreguntaFrecuente(textoOriginal);
  if (faqExt && ["precio", "menu", "descripcion_corte", "domicilio"].includes(faqExt.tipo)) {
    const respFaq = generarRespuestaAutomatica(faqExt, { esDomicilio: esOrdenDom });
    if (respFaq) {
      await msg.reply(respFaq);
      await msg.reply("¿Deseas agregar algún *Refresco* o *Salsa* extra? 🌶️🥤\n\n_(O escribe *no* si ya es todo)_");
      return true;
    }
  }

  // Edición de datos del formulario
  const edExt = detectarEdicion(textoOriginal);
  if (edExt) {
    if (edExt.preguntar) {
      const { esperandoEdicion } = require("../../estado");
      esperandoEdicion.set(clienteNumero, { campo: edExt.campo, contexto: "extras", extrasCtx: ctx });
      await msg.reply(edExt.pregunta);
      return true;
    }
    aplicarEdicion(clienteNumero, edExt);
    const formAct = mostrarFormularioProgresivo(clienteNumero, esOrdenDom, esPreventa);
    await msg.reply("Perfecto! Datos actualizados:\n\n" + formAct + "\n\n¿Deseas agregar algún *Refresco* o *Salsa* extra? 🌶️🥤");
    return true;
  }

  // "no" → mostrar confirmación final unificada
  if (esNo) {
    await _mostrarConfirmacionFinal(msg, clienteNumero, historial, ordenTexto, ctx.esOrdenDom, ctx.esPreventa);
    return true;
  }

  // Multi-refresco: "2 de fanta y 1 de sprite"
  const multiRefPregunta = parsearDistribucionRefrescos(textoNorm);
  if (multiRefPregunta) {
    let nuevaOrdenMultiRef = ordenTexto;
    for (const ref of multiRefPregunta) nuevaOrdenMultiRef += "\n" + _formatearRefresco(ref);
    await _mostrarConfirmacionFinal(msg, clienteNumero, historial, nuevaOrdenMultiRef, ctx.esOrdenDom, ctx.esPreventa);
    return true;
  }

  const refrescoPregunta = detectarRefresco(textoNorm);
  const salsasPregunta   = detectarSalsa(textoNorm);

  // Refresco + salsa en el mismo mensaje: "una coca y salsa picada"
  if (refrescoPregunta && salsasPregunta && salsasPregunta.length > 0) {
    const precios    = getPrecios();
    const lineaRef   = _formatearRefresco(refrescoPregunta);
    const salNombres = salsasPregunta.map(s => s.charAt(0).toUpperCase() + s.slice(1)).join(", ");
    const lineaSalsa = _formatearSalsaExtra(salNombres, salsasPregunta.length, _calcularPrecioSalsas(salsasPregunta, salsasPregunta.length, precios));
    const nuevaOrden = ordenTexto + "\n" + lineaRef + "\n" + lineaSalsa;
    await _mostrarConfirmacionFinal(msg, clienteNumero, historial, nuevaOrden, ctx.esOrdenDom, ctx.esPreventa);
    return true;
  }

  // Refresco único
  if (refrescoPregunta) {
    const lineaRef   = _formatearRefresco(refrescoPregunta);
    const nuevaOrden = ordenTexto + "\n" + lineaRef;
    await _mostrarConfirmacionFinal(msg, clienteNumero, historial, nuevaOrden, ctx.esOrdenDom, ctx.esPreventa);
    return true;
  }

  // Salsa detectada
  if (salsasPregunta && salsasPregunta.length > 0) {
    const precios    = getPrecios();
    const salNombres = salsasPregunta.map(s => s.charAt(0).toUpperCase() + s.slice(1)).join(", ");
    const lineaSalsa = _formatearSalsaExtra(salNombres, salsasPregunta.length, _calcularPrecioSalsas(salsasPregunta, salsasPregunta.length, precios));
    const nuevaOrden = ordenTexto + "\n" + lineaSalsa;
    await _mostrarConfirmacionFinal(msg, clienteNumero, historial, nuevaOrden, ctx.esOrdenDom, ctx.esPreventa);
    return true;
  }

  // "sí" genérico → preguntar qué quiere
  if (esSi) {
    const listaRef  = _listaNombresRefrescos();
    const listaSal  = _listaNombresSalsas();
    await msg.reply(
      "¡Claro! ¿Qué deseas agregar?\n\n" +
      `🥤 *Refrescos:* ${listaRef}\n` +
      `🌶️ *Salsas:* ${listaSal}\n\n` +
      "_O escríbeme directamente qué quieres_"
    );
    return true;
  }

  // Pedido completo detectado (más tacos/tortas)
  const jsonNuevo = parsearPedidoSimple(textoOriginal);
  if (jsonNuevo && jsonNuevo.tipo === "pedido") {
    pedidoJSONActual.set(clienteNumero, jsonNuevo);
    persistirEstado(clienteNumero);
    const resultado = jsonALineas(jsonNuevo);
    esperandoConfirmacionItem.set(clienteNumero, { lineas: resultado.texto });
    historial.push({ role: "user",      content: textoOriginal });
    historial.push({ role: "assistant", content: resultado.texto });
    await msg.reply(resultado.texto + "\n\n*¿Agrego esto a tu pedido?*");
    return true;
  }

  // Sin corte: preguntar corte
  if (detectarSinCorte(textoOriginal)) {
    const pedidoParcial = parsearSinCorteItems(textoOriginal);
    if (pedidoParcial) {
      pedidoParcial._indiceActual = 0;
      esperandoCorte.set(clienteNumero, pedidoParcial);
      const primerItem = pedidoParcial.items[0];
      const desc = primerItem.presentacion === "taco"   ? `los ${primerItem.cantidad} tacos`
                 : primerItem.presentacion === "torta"  ? `las ${primerItem.cantidad} tortas`
                 : primerItem.presentacion === "gramos" ? `los ${primerItem.gramos}g`
                 : `los $${primerItem.monto}`;
      await msg.reply(`*¿De qué tipo de carne quieres ${desc}?*\nTenemos: ${listaCortes()}`);
      return true;
    }
  }

  // Sin tipo: preguntar taco o torta
  const itemSinTipo = detectarSinTipo(textoOriginal);
  if (itemSinTipo) {
    esperandoTipoItem.set(clienteNumero, { ...itemSinTipo, ordenBase: ordenTexto, _fromExtras: ctx });
    await msg.reply(`*¿Los ${itemSinTipo.cantidad} de ${itemSinTipo.corte} serían tacos o tortas?*`);
    return true;
  }

  // No entendido → repetir pregunta con opciones
  const listaRefR  = _listaNombresRefrescos();
  const listaSalR  = _listaNombresSalsas();
  await msg.reply(
    "No entendí. ¿Quieres agregar algo? 😊\n\n" +
    `🥤 *Refrescos:* ${listaRefR}\n` +
    `🌶️ *Salsas:* ${listaSalR}\n\n` +
    "_O escribe *no* si ya terminaste tu pedido_"
  );
  return true;
}

// ── FAQ DURANTE TOMA DE PEDIDO ────────────────────────────────────────────────
async function handleFAQDurantePedido(msg, textoOriginal, clienteNumero, esOrdenDom) {
  const faqP = detectarPreguntaFrecuente(textoOriginal);
  const tipoP = faqP ? faqP.tipo : null;

  // "ya voy en camino" y "despedida" → ack simple, sin seguimiento
  if (tipoP === "ya_en_camino" || tipoP === "despedida") {
    const rSimple = generarRespuestaAutomatica(faqP, { esDomicilio: esOrdenDom });
    if (rSimple) { await msg.reply(rSimple); return true; }
  }

  // "¿cuánto llevo?" → mostrar subtotal del pedido en curso
  if (tipoP === "total_parcial") {
    const ordenActual = esperandoAgregarMas.get(clienteNumero);
    if (ordenActual) {
      const sub = calcularSubtotal(ordenActual);
      await msg.reply(`💰 Tu pedido hasta ahora suma *$${sub}*\n\n*¿Deseas agregar algo más?*`);
    } else {
      await msg.reply("*¿Qué deseas ordenar?* 😊");
    }
    return true;
  }

  const TIPOS_FAQ_PEDIDO = new Set(["precio", "menu", "domicilio", "descripcion_corte", "horario", "ubicacion", "metodos_pago"]);
  if (!TIPOS_FAQ_PEDIDO.has(tipoP)) return false;

  const rP = generarRespuestaAutomatica(faqP, { esDomicilio: esOrdenDom });
  if (!rP) return false;

  console.log("Bot: [FAQ pedido] tipo: " + tipoP);

  if (tipoP === "precio") {
    const ordenActual = esperandoAgregarMas.get(clienteNumero)
      || (esperandoExtras.has(clienteNumero) ? esperandoExtras.get(clienteNumero).ordenTexto : null);
    if (ordenActual) {
      const subFaq = calcularSubtotal(ordenActual);
      await msg.reply(rP + `\n\n_Tu pedido actual: *$${subFaq}*_`);
    } else {
      await msg.reply(rP);
    }
  } else {
    await msg.reply(rP);
  }
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
    await msg.reply(MENU_FORMATO());
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
  const { textoLimpio, refrescos: refrescosPendientes, salsas: salsasPendientes } = separarRefresco(textoOriginal);
  const jsonSimple = parsearPedidoSimple(textoLimpio);
  if (!jsonSimple || jsonSimple.tipo !== "pedido") return false;

  const esOrdenDom = tipoEntregaCliente.get(clienteNumero) === "domicilio";
  const esPreventa = clientesPreventa.has(clienteNumero);
  historial.push({ role: "user", content: textoOriginal });
  await _avanzarExtrasOConfirmar(msg, clienteNumero, historial, jsonSimple, refrescosPendientes, salsasPendientes, esOrdenDom, esPreventa);
  console.log(`Bot: [PARSER LOCAL] sin llamar a Groq`);
  return true;
}

// ── ESPERANDO CORTE ───────────────────────────────────────────────────────────
async function handleEsperandoCorte(msg, textoOriginal, clienteNumero, historial, esOrdenDom) {
  if (!esperandoCorte.has(clienteNumero)) return false;

  // Pedido completo enviado en lugar de solo el corte
  const jsonGreedy = parsearPedidoSimple(textoOriginal);
  if (jsonGreedy && jsonGreedy.tipo === "pedido" && Array.isArray(jsonGreedy.items) && jsonGreedy.items.length > 0
      && jsonGreedy.items.every(i => i.presentacion === "taco" || i.presentacion === "torta")) {
    const _corteGreedy = esperandoCorte.get(clienteNumero);
    const refrescosPendientesGreedy = _corteGreedy?._refrescosPendientes || [];
    const salsasPendientesGreedy      = _corteGreedy?._salsasPendientes      || [];
    esperandoCorte.delete(clienteNumero);
    pedidoJSONActual.set(clienteNumero, jsonGreedy);
    persistirEstado(clienteNumero);
    const resGreedy = jsonALineas(jsonGreedy);
    esperandoConfirmacionItem.set(clienteNumero, { lineas: resGreedy.texto, _refrescosPendientes: refrescosPendientesGreedy, _salsasPendientes: salsasPendientesGreedy });
    historial.push({ role: "user",      content: textoOriginal });
    historial.push({ role: "assistant", content: resGreedy.texto });
    await msg.reply(resGreedy.texto + "\n\n*¿Es correcto?*");
    console.log(`Bot: [GREEDY CORTE→PEDIDO] sin llamar a Groq`);
    return true;
  }

  // Distribución de cortes (dos sub-casos comparten la misma finalización)
  {
    const pedParcDist = esperandoCorte.get(clienteNumero);
    const idxDist = pedParcDist._indiceActual || 0;
    const itemDist = pedParcDist.items[idxDist];
    if (itemDist && (itemDist.presentacion === "taco" || itemDist.presentacion === "torta")) {
      let nuevosItems = null;

      // Sub-caso A: "todas de carne de 1 en 1" → expande en N ítems individuales con ese corte
      const PATRON_UNO_EN_UNO = /\bde\s+1\s+en\s+1\b|\bde\s+uno\s+en\s+uno\b|\buno\s+(?:a|por)\s+uno\b|\bde\s+a\s+(?:1|uno)\b/i;
      if (PATRON_UNO_EN_UNO.test(textoOriginal)) {
        const CORTES_UNO = getCortes();
        // Quitar el patrón "de 1 en 1" para leer cantidad y cortes sin interferencia
        const textoSinPatron = textoOriginal.replace(PATRON_UNO_EN_UNO, "").trim();
        const tUno = normalizar(textoSinPatron);
        const palabrasUno = Object.keys(CORTES_UNO).join("|");
        const matchesUno = [...tUno.matchAll(new RegExp(`\\b(${palabrasUno})\\b`, "g"))];
        const cortesUno = [...new Set(matchesUno.map(m => CORTES_UNO[m[1]]))];
        const corteUno = cortesUno.length > 0 ? cortesUno.join(", ") : null;
        if (corteUno) {
          // Detectar cantidad explícita ("2 de buche de 1 en 1" → 2)
          const NUMS_UNO = { un: 1, una: 1, uno: 1, dos: 2, tres: 3, cuatro: 4 };
          const matchCant = tUno.match(/\b(\d+|un[ao]?|dos|tres|cuatro)\b/);
          const cantExp = matchCant ? (parseInt(matchCant[1]) || NUMS_UNO[matchCant[1].toLowerCase()] || null) : null;
          const cantUno = (cantExp && cantExp < itemDist.cantidad) ? cantExp : itemDist.cantidad;
          _resetError(clienteNumero);
          nuevosItems = Array.from({ length: cantUno }, () => ({ ...itemDist, cantidad: 1, corte: corteUno }));
          // Si es parcial, agregar el ítem restante sin corte para seguir preguntando
          if (cantUno < itemDist.cantidad) {
            nuevosItems.push({ ...itemDist, cantidad: itemDist.cantidad - cantUno });
          }
        }
      }

      // Sub-caso B': "1 de carne y 1 de buche, 2 platos iguales" → N platos con misma composición
      if (!nuevosItems) {
        const NUMS_PLATOS = { dos: 2, tres: 3, cuatro: 4 };
        const matchPlatos = textoOriginal.match(/\b(\d+|dos|tres|cuatro)\s+platos?\s*(?:iguales?|igual)?\b/i);
        if (matchPlatos) {
          const nStr = matchPlatos[1].toLowerCase();
          const n = parseInt(nStr) || NUMS_PLATOS[nStr] || null;
          if (n && n >= 2) {
            const textoSinPlatos = textoOriginal.replace(matchPlatos[0], "").trim();
            const distPorPlato = parsearDistribucionCortes(textoSinPlatos);
            if (distPorPlato) {
              const totalPorPlato = distPorPlato.reduce((s, d) => s + d.cantidad, 0);
              if (n * totalPorPlato === itemDist.cantidad) {
                _resetError(clienteNumero);
                nuevosItems = [{
                  presentacion: "grupo_repetido",
                  grupos: n,
                  items_por_grupo: distPorPlato.map(d => ({
                    presentacion: itemDist.presentacion,
                    cantidad: d.cantidad,
                    corte: d.corte,
                  })),
                }];
              }
            }
          }
        }
      }

      // Sub-caso B: "1 de carne, 2 de surtido, 1 de lengua" → distribución explícita
      if (!nuevosItems) {
        const distribucion = parsearDistribucionCortes(textoOriginal);
        if (distribucion) {
          const totalDist = distribucion.reduce((s, d) => s + d.cantidad, 0);
          if (totalDist !== itemDist.cantidad) {
            _sumarError(clienteNumero);
            const tipo = itemDist.presentacion === "torta" ? "tortas" : "tacos";
            await msg.reply(`Quieres *${itemDist.cantidad} ${tipo}* pero lo que me escribiste suma *${totalDist}* 🤔\n¿Cómo los distribuyes? Por ejemplo: _1 de carne, 2 de surtido, 1 de lengua_`);
            return true;
          }
          _resetError(clienteNumero);
          nuevosItems = distribucion.map(d => ({ ...itemDist, cantidad: d.cantidad, corte: d.corte }));
        }
      }

      // Sub-caso C: "igual", "el mismo", "lo mismo" → aplicar corte del ítem anterior
      if (!nuevosItems && idxDist > 0) {
        const PATRON_IGUAL = /\bigual(?:\s+(?:para\s+(?:todos?|el\s+resto|las?\s+dem[aá]s?))?)?\b|\bel\s+mismos?\b|\blo\s+mismos?\b|\blos\s+mismos?\b|\btambién\s+(?:de\s+)?(?:ese|eso|el\s+mismo)\b/i;
        if (PATRON_IGUAL.test(textoOriginal)) {
          const cortePrevio = pedParcDist.items[idxDist - 1].corte;
          if (cortePrevio) {
            _resetError(clienteNumero);
            nuevosItems = [{ ...itemDist, corte: cortePrevio }];
          }
        }
      }

      // Finalización compartida
      if (nuevosItems) {
        pedParcDist.items.splice(idxDist, 1, ...nuevosItems);
        const siguienteIdx = pedParcDist.items.findIndex((item, i) => i >= idxDist + nuevosItems.length && !item.corte && item.presentacion !== "grupo_repetido");
        if (siguienteIdx !== -1) {
          pedParcDist._indiceActual = siguienteIdx;
          esperandoCorte.set(clienteNumero, pedParcDist);
          const sigItem = pedParcDist.items[siguienteIdx];
          const desc = sigItem.presentacion === "taco"   ? `los ${sigItem.cantidad} tacos`
                     : sigItem.presentacion === "torta"  ? `las ${sigItem.cantidad} tortas`
                     : sigItem.presentacion === "gramos" ? `los ${sigItem.gramos}g`
                     : `los $${sigItem.monto}`;
          await msg.reply(`*¿De qué tipo de carne quieres ${desc}?*\nTenemos: ${listaCortes()}`);
          return true;
        }
        esperandoCorte.delete(clienteNumero);
        if (pedParcDist._baseConfirmacion !== undefined) {
          const jsonCorteConf = { tipo: "pedido", items: pedParcDist.items };
          const { texto: lineasCorteConf } = jsonALineas(jsonCorteConf);
          const baseConf   = pedParcDist._baseConfirmacion.split("\n").filter(l => l.trim() && !/subtotal/i.test(l)).join("\n");
          const nuevasConf = lineasCorteConf.split("\n").filter(l => l.trim() && !/subtotal/i.test(l)).join("\n");
          const combConf   = baseConf + "\n" + nuevasConf;
          const textoBC    = combConf + "\n💰 Subtotal: $" + calcularSubtotal(combConf);
          esperandoConfirmacionItem.set(clienteNumero, { lineas: textoBC, _refrescosPendientes: pedParcDist._refrescosPendientes || [], _salsasPendientes: pedParcDist._salsasPendientes || [] });
          historial.push({ role: "user", content: textoOriginal });
          historial.push({ role: "assistant", content: textoBC });
          await msg.reply(textoBC + "\n\n*¿Es correcto?*");
          return true;
        }
        if (pedParcDist._esModificacionResumen === true && pedParcDist._ordenBase) {
          const jsonCompletoCorte = { tipo: "pedido", items: pedParcDist.items };
          const { texto: lineasNuevas } = jsonALineas(jsonCompletoCorte);
          pedidoJSONActual.set(clienteNumero, { _esModificacionResumen: true, ordenBase: pedParcDist._ordenBase, jsonNuevo: jsonCompletoCorte });
          esperandoConfirmacionItem.set(clienteNumero, { lineas: lineasNuevas, _esModificacionResumen: true, ordenBase: pedParcDist._ordenBase, jsonNuevo: jsonCompletoCorte, _refrescosPendientes: pedParcDist._refrescosPendientes || [], _salsasPendientes: pedParcDist._salsasPendientes || [] });
          historial.push({ role: "user", content: textoOriginal });
          historial.push({ role: "assistant", content: lineasNuevas });
          await msg.reply(lineasNuevas + "\n\n*¿Agrego esto a tu pedido?*");
          return true;
        }
        const jsonCompletoCorte = { tipo: "pedido", items: pedParcDist.items };
        pedidoJSONActual.set(clienteNumero, jsonCompletoCorte);
        persistirEstado(clienteNumero);
        const resultado = jsonALineas(jsonCompletoCorte);
        esperandoConfirmacionItem.set(clienteNumero, { lineas: resultado.texto, _refrescosPendientes: pedParcDist._refrescosPendientes || [], _salsasPendientes: pedParcDist._salsasPendientes || [] });
        historial.push({ role: "user", content: textoOriginal });
        historial.push({ role: "assistant", content: resultado.texto });
        await msg.reply(resultado.texto + "\n\n*¿Es correcto?*");
        console.log(`Bot: [DISTRIBUCIÓN CORTES] Subtotal: $${resultado.subtotal}`);
        return true;
      }
    }
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
      await msg.reply(`*¿Y de qué tipo de carne quieres ${descFaq}?*\nTenemos: ${listaCortes()}`);
      return true;
    }
  }

  const t = textoOriginal.trim().toLowerCase().normalize("NFD").replace(/[̀-ͯ]/g, "");
  const CORTES_MAP = getCortes();
  const palabrasCorteEsp = Object.keys(CORTES_MAP).join("|");
  const allMatchesCorte = [...t.matchAll(new RegExp(`\\b(${palabrasCorteEsp})\\b`, "g"))];
  const cortesEncontrados = [...new Set(allMatchesCorte.map(m => CORTES_MAP[m[1].toLowerCase()]).filter(Boolean))];
  let corteDetectado = cortesEncontrados.length > 0
    ? (cortesEncontrados.length === 1 ? cortesEncontrados[0] : cortesEncontrados.join(", "))
    : null;
  // Fuzzy fallback para typos: "cueroo", "surtidoo", "lngua"
  if (!corteDetectado) {
    const DESCARTAR_FUZZY = /^(taco|tacos|torta|tortas|gramo|gramos|kilo|kilos|cuarto|medio|mitad|todo|todos|menos|excepto|por|para|favor|quiero|dame|ponme|manda|pesos|solo|unos|como|nada|cada)$/;
    for (const palabra of t.split(/\s+/)) {
      if (palabra.length < 4 || DESCARTAR_FUZZY.test(palabra)) continue;
      const cf = buscarCorteFuzzy(palabra);
      if (cf) { corteDetectado = cf; break; }
    }
  }

  // "de todos" / "de todo" / "cualquiera" → surtido
  if (!corteDetectado && /\b(?:todos?|de\s+todos?|de\s+todas?|cualquier(?:a)?|de\s+todo)\b/i.test(textoOriginal)) {
    if (Object.values(getCortes()).includes("surtido")) corteDetectado = "surtido";
  }

  if (!corteDetectado) {
    const _pedPend  = esperandoCorte.get(clienteNumero);
    const _itemPend = _pedPend.items[_pedPend._indiceActual || 0];
    const _descPend = _itemPend.presentacion === "taco"   ? `los ${_itemPend.cantidad} tacos`
                    : _itemPend.presentacion === "torta"  ? `las ${_itemPend.cantidad} tortas`
                    : _itemPend.presentacion === "gramos" ? `los ${_itemPend.gramos}g`
                    : `los $${_itemPend.monto}`;
    const errores = _sumarError(clienteNumero);
    const extra = errores >= 2 ? `\n\n_Por ejemplo escríbeme: *${listaCortes().toLowerCase()}*_` : "";
    await msg.reply(`Necesito que me digas el tipo de carne para ${_descPend}.\n*¿Cuál prefieres?* ${listaCortes()}` + extra);
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
    await msg.reply(`*¿De qué tipo de carne quieres ${desc}?*\nTenemos: ${listaCortes()}`);
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
    esperandoConfirmacionItem.set(clienteNumero, { lineas: textoBC, _refrescosPendientes: pedidoParcial._refrescosPendientes || [], _salsasPendientes: pedidoParcial._salsasPendientes || [] });
    historial.push({ role: "user",      content: textoOriginal });
    historial.push({ role: "assistant", content: textoBC });
    await msg.reply(textoBC + "\n\n*¿Es correcto?*");
    return true;
  }

  if (pedidoParcial._esModificacionResumen === true && pedidoParcial._ordenBase) {
    const jsonCompletoCorte = { tipo: "pedido", items: pedidoParcial.items };
    const { texto: lineasNuevas } = jsonALineas(jsonCompletoCorte);
    pedidoJSONActual.set(clienteNumero, { _esModificacionResumen: true, ordenBase: pedidoParcial._ordenBase, jsonNuevo: jsonCompletoCorte });
    esperandoConfirmacionItem.set(clienteNumero, { lineas: lineasNuevas, _esModificacionResumen: true, ordenBase: pedidoParcial._ordenBase, jsonNuevo: jsonCompletoCorte, _refrescosPendientes: pedidoParcial._refrescosPendientes || [], _salsasPendientes: pedidoParcial._salsasPendientes || [] });
    historial.push({ role: "user",      content: textoOriginal });
    historial.push({ role: "assistant", content: lineasNuevas });
    await msg.reply(lineasNuevas + "\n\n*¿Agrego esto a tu pedido?*");
    return true;
  }

  const jsonCompletoCorte = { tipo: "pedido", items: pedidoParcial.items };
  historial.push({ role: "user", content: textoOriginal });
  await _avanzarExtrasOConfirmar(msg, clienteNumero, historial, jsonCompletoCorte, pedidoParcial._refrescosPendientes || [], pedidoParcial._salsasPendientes || [], esOrdenDom, esPreventa);
  console.log(`Bot: [CORTE COMPLETADO]`);
  return true;
}

// ── DETECCIÓN SIN CORTE ───────────────────────────────────────────────────────
async function handleSinCorte(msg, textoOriginal, clienteNumero) {
  const { textoLimpio, refrescos: refrescosPendientes, salsas: salsasPendientes } = separarRefresco(textoOriginal);
  if (!detectarSinCorte(textoLimpio)) return false;

  const pedidoParcial = parsearSinCorteItems(textoLimpio);
  if (pedidoParcial) {
    const primerSinCorte = pedidoParcial.items.findIndex(i => !i.corte);
    pedidoParcial._indiceActual = primerSinCorte !== -1 ? primerSinCorte : 0;
    pedidoParcial._refrescosPendientes = refrescosPendientes;
    pedidoParcial._salsasPendientes      = salsasPendientes;
    esperandoCorte.set(clienteNumero, pedidoParcial);
    const primerItem = pedidoParcial.items[pedidoParcial._indiceActual];
    const desc = primerItem.presentacion === "taco"   ? `los ${primerItem.cantidad} tacos`
               : primerItem.presentacion === "torta"  ? `las ${primerItem.cantidad} tortas`
               : primerItem.presentacion === "gramos" ? `los ${primerItem.gramos}g`
               : `los $${primerItem.monto}`;
    await msg.reply(`*¿De qué tipo de carne quieres ${desc}?*\nTenemos: ${listaCortes()}`);
  } else {
    await msg.reply(`*¿De qué tipo de carne lo quieres?*\nTenemos: ${listaCortes()}`);
  }
  return true;
}

// ── DETECCIÓN SIN TIPO (taco/torta) ──────────────────────────────────────────
async function handleSinTipo(msg, textoOriginal, clienteNumero) {
  const { textoLimpio, refrescos: refrescosPendientes, salsas: salsasPendientes } = separarRefresco(textoOriginal);
  const itemSinTipo = detectarSinTipo(textoLimpio);
  if (!itemSinTipo) return false;

  // Check both extras and legacy agregar mas contexts
  const extrasCtx = esperandoExtras.has(clienteNumero) ? esperandoExtras.get(clienteNumero) : null;
  const ordenBase = extrasCtx ? extrasCtx.ordenTexto : (esperandoAgregarMas.get(clienteNumero) || null);
  if (!extrasCtx && ordenBase) esperandoAgregarMas.delete(clienteNumero);

  esperandoTipoItem.set(clienteNumero, { ...itemSinTipo, ordenBase, _fromExtras: extrasCtx || false, _refrescosPendientes: refrescosPendientes, _salsasPendientes: salsasPendientes });
  await msg.reply(`*¿Los ${itemSinTipo.cantidad} de ${itemSinTipo.corte} serían tacos o tortas?*`);
  return true;
}

// ── MODIFICACIÓN SOBRE ORDEN ACUMULADA (flujo legacy esperandoAgregarMas) ────
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

// ── ESPERANDO SI AGREGA MÁS (flujo legacy para fallback desde resumen) ────────
async function handleAgregarMas(msg, textoOriginal, clienteNumero, historial, esOrdenDom, esPreventa) {
  if (!esperandoAgregarMas.has(clienteNumero)) return false;

  const esAgregarNo = /^(no|nel|nop|nada\s*m[aá]s?|ya\s*es\s*todo|eso\s*es\s*todo|listo|ya|solo\s*eso|eso|no\s*,?\s*(gracias|gra|gras)|as[ií]\s*est[aá](\s*bien)?|ya\s*fue|ya\s*con\s*eso)$/i.test(textoOriginal.trim());
  const esAgregarSi = /^(si|sí|ok|va|dale|claro|sale|andale|quiero|agrega|más|mas)$/i.test(textoOriginal.trim());

  // "¿Cuánto llevo?"
  if (/cu[aá]nto\s+(?:llevo|tengo|es(?:\s+todo)?(?:\s+lo\s+que\s+llevo)?(?:\s+hasta\s+ahorita)?)|(?:total|subtotal)\s+(?:hasta\s+ahorita|por\s+ahora|de\s+lo\s+que\s+llevo)|cu[aá]nto\s+(?:llega|asciende|va)\s+mi\s+pedido/i.test(textoOriginal)) {
    const ordSub = esperandoAgregarMas.get(clienteNumero) || "";
    if (ordSub) {
      const listaAct = formatearListaAcumulada(ordSub);
      await msg.reply(listaAct);
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
    // Pasar a extras
    esperandoExtras.set(clienteNumero, {
      ordenTexto:    ordenCompleta,
      esOrdenDom:    tipoEntregaCliente.get(clienteNumero) === "domicilio",
      esPreventa:    clientesPreventa.has(clienteNumero),
      tieneRefresco: false,
      tieneSalsa:    false,
      fase:          "pregunta",
    });
    persistirEstado(clienteNumero);
    historial.push({ role: "user", content: textoOriginal });
    await msg.reply("¿Deseas agregar algún *Refresco* o *Salsa* extra? 🌶️🥤\n\n_(O escribe *no* si ya es todo)_");
    return true;
  }

  if (esAgregarSi) {
    _resetError(clienteNumero);
    const ordenActual = esperandoAgregarMas.get(clienteNumero) || "";
    const listaActual = formatearListaAcumulada(ordenActual);
    await msg.reply(listaActual);
    await new Promise(r => setTimeout(r, 400));
    await msg.reply(MENU_FORMATO());
    await new Promise(r => setTimeout(r, 400));
    await msg.reply("*¿Qué más te gustaría agregar de nuestro menú?*");
    return true;
  }

  const erroresAgMas = _sumarError(clienteNumero);
  const extraAgMas = erroresAgMas >= 2 ? "\n\n_Puedes responder: *sí* para agregar algo, o *no* / *ya es todo* para terminar_" : "";
  await msg.reply("*¿Deseas agregar algo más a tu pedido?*" + extraAgMas);
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
      if (!enFlujoActivo(clienteNumero)) await replyConTyping(msg, MENU_FORMATO());
      return;
    }
    if (respuestaTexto) {
      await replyConTyping(msg, respuestaTexto);
      console.log(`Bot: ${respuestaTexto.substring(0, 80)}...`);
      if (!enFlujoActivo(clienteNumero)) await replyConTyping(msg, MENU_FORMATO());
    } else {
      await msg.reply("Disculpa, no entendi. Me repites tu pedido?");
      if (!enFlujoActivo(clienteNumero)) await msg.reply(MENU_FORMATO());
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
        temperature: 0.35,
        messages:    [{ role: "system", content: systemPromptRetry }, ...historial],
      });
      const textoRetry = respuestaRetry.choices[0]?.message?.content?.trim() || "";
      if (textoRetry) {
        historial.push({ role: "assistant", content: textoRetry });
        await replyConTyping(msg, textoRetry);
      } else {
        await msg.reply("Disculpa, no entendi. Me repites tu pedido?");
        if (!enFlujoActivo(clienteNumero)) await msg.reply(MENU_FORMATO());
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
  handleExtras,
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
