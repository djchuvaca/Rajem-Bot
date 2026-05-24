// src/handlers/flujos/utils.js
// Estado local y utilidades compartidas entre todos los flujos

const {
  clientesNuevos, esperandoCorte, esperandoConfirmacionItem,
  esperandoAgregarMas, datosRecibidos, resumenPendiente,
  esperandoEdicion, esperandoConfirmacionDatos, esperandoTipoItem,
  datosCampos, limpiarTodo,
} = require("../../estado");
const { getWhatsappClient } = require("../../panel/whatsapp-bridge");
const { getProductos } = require("../../db");

// ── Mapas de estado local (no persisten entre reinicios) ─────────────────────
const telefonosReales    = new Map();
const ultimoPedido       = new Map();
const ultimaActividad    = new Map();
const recordatorioEnviado = new Map(); // numero → timestamp del recordatorio

// ── Timeouts de inactividad ────────────────────────────────────────────────────
const TIMEOUT_RECORDATORIO_MS = 30 * 60 * 1000; // 30 min → recordatorio
const TIMEOUT_SESION_MS       = 45 * 60 * 1000; // 45 min → limpiar sesión

function _textoRecordatorio(numero) {
  if (resumenPendiente.has(numero)) {
    const p = resumenPendiente.get(numero);
    return `Hola! 👋 Tienes un pedido pendiente de confirmar:\n\n${p.texto}\n\n*¿Lo confirmamos?* Responde *sí* para confirmar o *cancelar* para cancelarlo.`;
  }
  if (esperandoConfirmacionItem.has(numero)) {
    const d = esperandoConfirmacionItem.get(numero);
    return `Hola! 👋 Quedamos pendientes aquí:\n\n${d.lineas}\n\n*¿Es correcto?*`;
  }
  if (esperandoAgregarMas.has(numero)) {
    return "Hola! 👋 ¿Sigues ahí? ¿Deseas agregar algo más a tu pedido o ya es todo?";
  }
  if (esperandoCorte.has(numero)) {
    const ped  = esperandoCorte.get(numero);
    const item = ped.items[ped._indiceActual || 0];
    const desc = item.presentacion === "taco"   ? `los ${item.cantidad} tacos`
               : item.presentacion === "torta"  ? `las ${item.cantidad} tortas`
               : item.presentacion === "gramos" ? `los ${item.gramos}g`
               : `los $${item.monto}`;
    const listaCortes = getProductos().map(p => p.nombre.charAt(0).toUpperCase() + p.nombre.slice(1)).join(", ") || "los cortes disponibles";
    return `Hola! 👋 Quedamos esperando el tipo de carne para ${desc}.\n*¿Cuál prefieres?* ${listaCortes}`;
  }
  if (esperandoTipoItem.has(numero)) {
    const d = esperandoTipoItem.get(numero);
    return `Hola! 👋 Quedamos pendientes aquí. Los ${d.cantidad} de ${d.corte}... *¿serían tacos o tortas?*`;
  }
  if (datosCampos.has(numero) || clientesNuevos.has(numero)) {
    return "Hola! 👋 Estabas en proceso de hacer tu pedido. *¿Deseas continuar?*";
  }
  return null;
}

setInterval(async () => {
  const client = getWhatsappClient();
  const ahora  = Date.now();

  for (const [numero, ts] of ultimaActividad.entries()) {
    const inactivo = ahora - ts;

    // Fase 2 — limpiar sesión (45 min sin respuesta tras recordatorio)
    if (inactivo > TIMEOUT_SESION_MS) {
      const estaActivo = enFlujoActivo(numero)
        || clientesNuevos.has(numero)
        || datosCampos.has(numero);
      if (estaActivo) {
        console.log(`[TIMEOUT] Limpiando sesión inactiva: ${numero}`);
        limpiarTodo(numero);
        clientesNuevos.delete(numero);
        esperandoTipoItem.delete(numero);
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
        await client.sendMessage(numero, texto, { linkPreview: false });
        console.log(`[RECORDATORIO] Enviado a ${numero}`);
      } catch (e) {
        console.error(`[RECORDATORIO] Error enviando a ${numero}:`, e.message);
      }
    }
  }
}, 10 * 60 * 1000);

// ── Helpers ───────────────────────────────────────────────────────────────────
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

function parsearSinCorteItems(texto) {
  const MEDIDAS_ITEMS = [
    { re: /\bun\s+cuarto\b|\b1\/4\b|\b250\s*g/i,           gramos: 250  },
    { re: /\bmedio\s+kilo\b|\bmedio\b|\b1\/2\b|\b500\s*g/i, gramos: 500  },
    { re: /\btres\s+cuartos\b|\b3\/4\b|\b750\s*g/i,        gramos: 750  },
    { re: /\bun\s+kilo\b|\b1\s*kg\b|\b1000\s*g/i,          gramos: 1000 },
  ];
  const partes = texto
    .split(/\n+|,\s*(?:y\s+)?|\s+y\s+tambi[eé]n\s+|\s+y\s+(?=\d|\bun\b|\bmedio\b|\btres\b|\b1\/)/i)
    .map(p => p.trim().replace(/^y\s+/i, ""))
    .filter(Boolean);
  const items = [];
  for (const parte of partes) {
    const tp = parte.trim().toLowerCase().normalize("NFD").replace(/[̀-ͯ]/g, "");
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

const palabrasConfirmacion = /^(si|sí|s[ií]\s+por\s+fa(vor)?|ok|okey|va|dale|listo|sale|andale|ándale|adelante|confirmo|confirmado|correcto|asi|así|si\s+porfavor|sí\s+porfavor|si\s+por\s+favor|sí\s+por\s+favor|claro|perfecto|va\s+bien|dale\s+pues|ándale|órale|orale|va\s+que\s+va|de\s+una|eso\s+es|así\s+es|asi\s+es|todo\s+bien|está\s+bien|esta\s+bien|sip|sep|simón|simon|chido|bueno|bien|afirmativo|positivo|exacto|exactamente|procede|proceder|pa\s+delante|p'adelante|con\s+eso|con\s+eso\s+voy|va\s+ese|nel\s+az|ya|ya\s+dale|ya\s+pues|ya\s+va)$/i;

module.exports = {
  telefonosReales,
  ultimoPedido,
  ultimaActividad,
  recordatorioEnviado,
  enFlujoActivo,
  replyConTyping,
  parsearSinCorteItems,
  quitarItemDeOrden,
  validarHora,
  palabrasConfirmacion,
};
