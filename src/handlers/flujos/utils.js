// src/handlers/flujos/utils.js
// Estado local y utilidades compartidas entre todos los flujos

const {
  clientesNuevos, esperandoCorte, esperandoConfirmacionItem,
  esperandoAgregarMas, datosRecibidos, resumenPendiente,
  esperandoEdicion, esperandoConfirmacionDatos, esperandoTipoItem,
  esperandoExtras, ordenPreResumen, datosCampos, limpiarTodo,
} = require("../../estado");
const { getWhatsappClient } = require("../../panel/whatsapp-bridge");
const { getProductos, getConfig } = require("../../db");
const { textoANumero, getCortes, buscarCorteFuzzy, detectarTipoItemDesdeTexto, listaItemTypes } = require("../pedidoParser");

// ── Mapas de estado local (no persisten entre reinicios) ─────────────────────
const telefonosReales    = new Map();
const ultimoPedido       = new Map();
const ultimaActividad    = new Map();
const recordatorioEnviado    = new Map(); // numero → timestamp del recordatorio
const ordenPendientePreventa = new Map(); // texto del primer mensaje con pedido fuera de horario

// ── Timeouts de inactividad (configurables desde BD: timeout_recordatorio_min, timeout_sesion_min) ──
function _getTimeoutRecordatorio() { return parseInt(getConfig("timeout_recordatorio_min") || "20") * 60 * 1000; }
function _getTimeoutSesion()       { return parseInt(getConfig("timeout_sesion_min")       || "35") * 60 * 1000; }

function _textoRecordatorio(numero) {
  const primerNombre = (datosCampos.get(numero) || {}).nombre?.split(" ")[0] || null;
  const saludo = primerNombre ? `Hola *${primerNombre}*! 👋` : "Hola! 👋";

  if (resumenPendiente.has(numero)) {
    const p = resumenPendiente.get(numero);
    return `${saludo} Tienes un pedido pendiente de confirmar:\n\n${p.texto}\n\n*¿Lo confirmamos?* Responde *sí* para confirmar o *cancelar* para cancelarlo.`;
  }
  if (esperandoConfirmacionItem.has(numero)) {
    const d = esperandoConfirmacionItem.get(numero);
    return `${saludo} Quedamos pendientes aquí:\n\n${d.lineas}\n\n*¿Es correcto?*`;
  }
  if (esperandoExtras.has(numero)) {
    const extCtx = esperandoExtras.get(numero);
    if (extCtx && extCtx.ordenTexto) {
      const lineas = extCtx.ordenTexto.split("\n").filter(l => l.trim() && !/^💰|subtotal/i.test(l.trim())).join("\n");
      return `${saludo} ¿Sigues ahí?\n\nLlevas en tu pedido:\n${lineas}\n\n*¿Deseas agregar algún refresco o salsa extra?*`;
    }
    return `${saludo} ¿Sigues ahí? ¿Deseas agregar algo a tu pedido?`;
  }
  if (ordenPreResumen.has(numero)) {
    return `${saludo} Quedamos pendientes de completar tus datos para confirmar tu pedido. *¿Sigues ahí?*`;
  }
  if (esperandoAgregarMas.has(numero)) {
    const ordAcum = esperandoAgregarMas.get(numero);
    if (ordAcum) {
      const lineas = ordAcum.split("\n").filter(l => l.trim() && !/^💰|subtotal/i.test(l.trim())).join("\n");
      return `${saludo} ¿Sigues ahí?\n\nLlevas en tu pedido:\n${lineas}\n\n*¿Deseas agregar algo más o ya es todo?*`;
    }
    return `${saludo} ¿Sigues ahí? ¿Deseas agregar algo más a tu pedido o ya es todo?`;
  }
  if (esperandoCorte.has(numero)) {
    const ped  = esperandoCorte.get(numero);
    const item = ped.items[ped._indiceActual || 0];
    const desc = item.presentacion === "taco"   ? `los ${item.cantidad} tacos`
               : item.presentacion === "torta"  ? `las ${item.cantidad} tortas`
               : item.presentacion === "gramos" ? `los ${item.gramos}g`
               : `los $${item.monto}`;
    const listaCortes = getProductos().filter(p => (p.categoria === "corte" || !p.categoria) && p.nombre !== "surtido especial").map(p => p.nombre.charAt(0).toUpperCase() + p.nombre.slice(1)).join(", ") || "los cortes disponibles";
    return `${saludo} Quedamos esperando el tipo de carne para ${desc}.\n*¿Cuál prefieres?* ${listaCortes}`;
  }
  if (esperandoTipoItem.has(numero)) {
    const d = esperandoTipoItem.get(numero);
    return `${saludo} Quedamos pendientes aquí. Los ${d.cantidad} de ${d.corte}... *¿serían ${listaItemTypes()}?*`;
  }
  if (datosCampos.has(numero)) {
    return `${saludo} Estabas en proceso de hacer tu pedido. *¿Deseas continuar?*`;
  }
  return null;
}

setInterval(async () => {
  const client = getWhatsappClient();
  const ahora  = Date.now();
  const TIMEOUT_RECORDATORIO_MS = _getTimeoutRecordatorio();
  const TIMEOUT_SESION_MS       = _getTimeoutSesion();

  for (const [numero, ts] of ultimaActividad.entries()) {
    const inactivo = ahora - ts;

    // Fase 2 — limpiar sesión
    if (inactivo > TIMEOUT_SESION_MS) {
      const estaActivo = enFlujoActivo(numero)
        || clientesNuevos.has(numero)
        || datosCampos.has(numero);
      if (estaActivo) {
        console.log(`[TIMEOUT] Limpiando sesión inactiva: ${numero}`);
        limpiarTodo(numero);
        clientesNuevos.delete(numero);
        esperandoTipoItem.delete(numero);
        esperandoExtras.delete(numero);
        ordenPendientePreventa.delete(numero);
        ultimaActividad.delete(numero);
        recordatorioEnviado.delete(numero);
      }
      continue;
    }

    // Fase 1 — recordatorio (30 min de inactividad, solo una vez por sesión)
    if (inactivo > TIMEOUT_RECORDATORIO_MS && !recordatorioEnviado.has(numero)) {
      const estaActivo = enFlujoActivo(numero)
        || clientesNuevos.has(numero)
        || datosCampos.has(numero);
      if (!estaActivo || !client) continue;

      const texto = _textoRecordatorio(numero);
      if (!texto) continue;

      recordatorioEnviado.set(numero, ahora);
      try {
        const jitter = 1000 + Math.floor(Math.random() * 2000);
        await new Promise(r => setTimeout(r, jitter));
        await client.sendMessage(numero, texto, { linkPreview: false });
        console.log(`[RECORDATORIO] Enviado a ${numero}`);
      } catch (e) {
        console.error(`[RECORDATORIO] Error enviando a ${numero}:`, e.message);
      }
    }
  }
}, 10 * 60 * 1000).unref(); // unref: no bloquea la salida del proceso si no hay más trabajo

// ── Helpers ───────────────────────────────────────────────────────────────────
function enFlujoActivo(clienteNumero) {
  return esperandoCorte.has(clienteNumero)
    || esperandoConfirmacionItem.has(clienteNumero)
    || esperandoAgregarMas.has(clienteNumero)
    || esperandoExtras.has(clienteNumero)
    || ordenPreResumen.has(clienteNumero)
    || resumenPendiente.has(clienteNumero)
    || esperandoEdicion.has(clienteNumero)
    || esperandoConfirmacionDatos.has(clienteNumero)
    || esperandoTipoItem.has(clienteNumero);
}

// Throttle por JID: mínimo 2s entre envíos al mismo usuario
const _ultimoEnvioJID = new Map();
const DELAY_MIN_JID_MS = 2000;

async function replyConTyping(msg, texto) {
  // Asegurar separación mínima entre mensajes al mismo JID
  const jid = msg.from || msg.to;
  if (jid) {
    const restante = DELAY_MIN_JID_MS - (Date.now() - (_ultimoEnvioJID.get(jid) || 0));
    if (restante > 0) await new Promise(r => setTimeout(r, restante));
    _ultimoEnvioJID.set(jid, Date.now());
  }

  try {
    const chat = await msg.getChat();
    const ms = Math.min(800 + texto.length * 12, 3500) + Math.floor(Math.random() * 500);
    await chat.sendStateTyping();
    await new Promise(r => setTimeout(r, ms));
    await chat.clearState();
  } catch (_) {}
  await msg.reply(texto, undefined, { linkPreview: false });
}

function parsearSinCorteItems(texto) {
  texto = textoANumero(texto);
  const MEDIDAS_ITEMS = [
    { re: /\bun\s+cuarto\b|\b1\/4\b|\b250\s*g/i,           gramos: 250  },
    { re: /\bmedio\s+kilo\b|\bmedio\b|\b1\/2\b|\b500\s*g/i, gramos: 500  },
    { re: /\btres\s+cuartos\b|\b3\/4\b|\b750\s*g/i,        gramos: 750  },
    { re: /\bun\s+kilo\b|\b1\s*kg\b|\b1000\s*g/i,          gramos: 1000 },
  ];
  const partes = texto
    .split(/\n+|,\s*(?:y\s+)?|\s+y\s+tambi[eé]n\s+|\s+y\s+(?=\d|\bun\b|\bmedio\b|\btres\b|\b1\/)|\s+(?=\d+\s+(?:de|del|se)\s+)/i)
    .map(p => p.trim().replace(/^y\s+/i, ""))
    .filter(Boolean);
  const CORTES_ACTIVOS = getCortes(); // { surtido: "surtido", buche: "buche", ... } desde BD
  const palabrasCorteActivas = Object.keys(CORTES_ACTIVOS).join("|");
  const items = [];
  let ultimoTipo = null;
  for (const parte of partes) {
    const tp = parte.trim().toLowerCase().normalize("NFD").replace(/[̀-ͯ]/g, "");
    let corte = null;
    if (palabrasCorteActivas) {
      const matchCorte = parte.match(new RegExp(`(?:de\\s*|\\b)(${palabrasCorteActivas})\\b`, "i"));
      if (matchCorte) corte = CORTES_ACTIVOS[matchCorte[1].toLowerCase()] || null;
    }
    if (!corte) {
      for (const palabra of tp.split(/\s+/)) {
        if (palabra.length < 4) continue;
        const cf = buscarCorteFuzzy(palabra);
        if (cf) { corte = cf; break; }
      }
    }
    const tipoDetectado = detectarTipoItemDesdeTexto(parte);
    if (tipoDetectado) {
      const matchNum = tp.match(/\b(\d+)\b/);
      if (matchNum) {
        items.push({ presentacion: tipoDetectado.slug, cantidad: parseInt(matchNum[1]), corte });
        ultimoTipo = tipoDetectado.slug;
        continue;
      }
    }
    let encontroMedida = false;
    for (const medida of MEDIDAS_ITEMS) {
      if (medida.re.test(tp)) { items.push({ presentacion: "gramos", gramos: medida.gramos, corte }); encontroMedida = true; break; }
    }
    if (encontroMedida) continue;
    const matchGramos = tp.match(/\b(\d+)\s*g(?:ramos?)?\b/);
    if (matchGramos) { items.push({ presentacion: "gramos", gramos: parseInt(matchGramos[1]), corte }); continue; }
    const matchMonto = tp.match(/\b(\d+)\b/);
    if (matchMonto) {
      const n = parseInt(matchMonto[1]);
      if (n > 40) { items.push({ presentacion: "pesos", monto: n, corte }); continue; }
      if (corte && ultimoTipo) { items.push({ presentacion: ultimoTipo, cantidad: n, corte }); continue; }
    }
  }
  return items.length > 0 ? { tipo: "pedido", items } : null;
}

function quitarItemDeOrden(ordenTexto, textoCliente) {
  const lineas = ordenTexto.split("\n").filter(l => l.trim() && !/subtotal/i.test(l));
  if (lineas.length <= 1) return { exito: false, razon: "solo_un_item" };

  const t = textoCliente.toLowerCase().normalize("NFD").replace(/[̀-ͯ]/g, "");
  const esTaco   = /taco/i.test(t);
  const esTorta  = /torta/i.test(t);
  const esGramos = /gramo|kilo|cuarto|medio|\bg\b/i.test(t);
  const numMatch = t.match(/\b(\d+)\b/);
  const cantidadMencionada = numMatch ? parseInt(numMatch[1]) : null;

  const lineasAQuitar = lineas.filter(l => {
    const lNorm = l.toLowerCase().normalize("NFD").replace(/[̀-ͯ]/g, "");
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
  const am = /am/i.test(texto); // eslint-disable-line no-unused-vars
  if (pm && h < 12) h += 12;
  const dec = h + min / 60;
  if (dec < 7 || dec > 12.5) return null;
  const sufijo = (pm || h >= 12) ? "p.m." : "a.m.";
  const minStr = min > 0 ? `:${String(min).padStart(2, "0")}` : ":00";
  return `${h > 12 ? h - 12 : h}${minStr} ${sufijo}`;
}

function listaCortes() {
  const cortes = getCortes();
  const unicos = [...new Set(Object.values(cortes))].filter(c => c !== "surtido especial");
  if (unicos.length > 0) return unicos.map(c => c.charAt(0).toUpperCase() + c.slice(1)).join(", ");
  try {
    const { getGiroActivo } = require('../../giros');
    const giro = getGiroActivo();
    const slugs = [...new Set(Object.values(giro?.fallbackCortes || {}))].filter(c => c !== 'surtido especial');
    return slugs.map(c => c.charAt(0).toUpperCase() + c.slice(1)).join(', ') || 'los cortes disponibles';
  } catch (_) { return 'los cortes disponibles'; }
}

const palabrasConfirmacion = /^(si|sí|s[ií]\s+por\s+fa(vor)?|ok|okey|va|dale|listo|sale|andale|ándale|adelante|confirmo|confirmado|correcto|asi|así|si\s+porfavor|sí\s+porfavor|si\s+por\s+favor|sí\s+por\s+favor|claro|perfecto|va\s+bien|dale\s+pues|ándale|órale|orale|va\s+que\s+va|de\s+una|eso\s+es|así\s+es|asi\s+es|todo\s+bien|está\s+bien|esta\s+bien|sip|sep|simón|simon|chido|bueno|bien|afirmativo|positivo|exacto|exactamente|procede|proceder|pa\s+delante|p'adelante|con\s+eso|con\s+eso\s+voy|va\s+ese|nel\s+az|ya|ya\s+dale|ya\s+pues|ya\s+va|vamos|vamos\s+pues|le\s+va|le\s+voy|sale\s+y\s+vale|sale\s+pues|andele|ándele|s[ií]\s+se[nñ]or|s[ií]\s+se[nñ]ora|apunta(?:me)?|anota(?:me)?|ch[eé]ca(?:le)?|ch[eé]cale|a\s+toda\s+madre|a\s+toda|si\s+claro|sí\s+claro|claro\s+que\s+si|claro\s+que\s+sí|con\s+gusto|ándale\s+pues|le\s+entramos|le\s+entro|le\s+echamos|ponme|apuntame)$/i;

module.exports = {
  telefonosReales,
  ultimoPedido,
  ultimaActividad,
  recordatorioEnviado,
  ordenPendientePreventa,
  enFlujoActivo,
  replyConTyping,
  parsearSinCorteItems,
  quitarItemDeOrden,
  validarHora,
  palabrasConfirmacion,
  listaCortes,
};
