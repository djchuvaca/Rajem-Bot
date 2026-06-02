// src/handlers/respuestas.js
// Respuestas automáticas a preguntas frecuentes y modificaciones — sin Groq
// Compatible con cualquier negocio configurado en la BD

const { getConfig, getProductos, getHorarios, getBanco } = require("../db");
const { getPrecios } = require("../pedido/precios");
const { estaEnHorario } = require("../horario");

// ── HELPERS ───────────────────────────────────────────────────────────────────
function getNegocio() {
  return getConfig("nombre_negocio") || "el negocio";
}

function getDomCosto() {
  return parseInt(getConfig("domicilio_costo") || "50");
}

function getUbicacion() {
  return getConfig("ubicacion") || getConfig("direccion") || null;
}

function getMetodosPago(esDomicilio = false) {
  try {
    if (esDomicilio) return getConfig("metodos_domicilio") || "efectivo y transferencia";
    return getConfig("metodos_mostrador") || "efectivo, tarjeta y transferencia";
  } catch (e) {
    return esDomicilio ? "efectivo y transferencia" : "efectivo, tarjeta y transferencia";
  }
}

// ── FORMATEAR HORARIO ─────────────────────────────────────────────────────────
function formatearHorario() {
  try {
    const horarios = getHorarios();
    if (!horarios || !horarios.length) return null;

    const DIAS = ["Domingo", "Lunes", "Martes", "Miércoles", "Jueves", "Viernes", "Sábado"];
    const abiertos = horarios.filter(h => h.abierto);
    if (!abiertos.length) return "Por el momento estamos cerrados.";

    // Agrupar días con mismo horario
    const grupos = [];
    let grupoActual = null;
    for (const h of abiertos) {
      const horarioStr = `${h.hora_inicio} - ${h.hora_fin}`;
      if (grupoActual && grupoActual.horario === horarioStr) {
        grupoActual.dias.push(DIAS[h.dia]);
      } else {
        if (grupoActual) grupos.push(grupoActual);
        grupoActual = { dias: [DIAS[h.dia]], horario: horarioStr };
      }
    }
    if (grupoActual) grupos.push(grupoActual);

    return grupos.map(g => `${g.dias.join(", ")}: ${g.horario}`).join("\n");
  } catch (e) { return null; }
}

// ── RESPUESTA: PRECIO ─────────────────────────────────────────────────────────
function respuestaPrecio(producto = null) {
  try {
    const precios  = getPrecios();
    const negocio  = getNegocio();
    const productos = getProductos();
    const nombres  = productos.length
      ? productos.map(p => p.nombre.charAt(0).toUpperCase() + p.nombre.slice(1)).join(", ")
      : "Surtido, Carne, Buche, Cuero, Lengua";

    if (producto) {
      return (
        `💰 *Precios en ${negocio}:*\n\n` +
        `🌮 Taco de ${producto}: *$${precios.pTaco}*\n` +
        `🥖 Torta de ${producto}: *$${precios.pTorta}*\n` +
        `⚖️ Por 100g de ${producto}: *$${precios.p100g}*\n\n` +
        `_Los precios incluyen tortillas y salsas_ 😊`
      );
    }

    return (
      `💰 *Precios en ${negocio}:*\n\n` +
      `🌮 *Tacos* — $${precios.pTaco} c/u\n` +
      `🥖 *Tortas* — $${precios.pTorta} c/u\n` +
      `⚖️ *Por gramos* — $${precios.p100g} / 100g\n\n` +
      `🥩 Piezas disponibles: ${nombres}\n\n` +
      `_Los precios incluyen tortillas y salsas_ 😊`
    );
  } catch (e) {
    return "Ahorita no tengo los precios disponibles. ¿Me dices qué quieres y te digo cuánto es?";
  }
}

// ── RESPUESTA: HORARIO ────────────────────────────────────────────────────────
function respuestaHorario() {
  const negocio = getNegocio();
  const horario = formatearHorario();
  const abiertosAhora = estaEnHorario();
  const estadoActual  = abiertosAhora
    ? "✅ *En este momento estamos abiertos.*\n\n"
    : "🔴 *En este momento estamos cerrados.*\n\n";

  if (!horario) {
    const horaInicio = getConfig("hora_inicio") || "7:00";
    const horaFin    = getConfig("hora_fin")    || "12:30";
    return `🕖 *Horario de ${negocio}:*\n\n${estadoActual}Lunes a Sábado de ${horaInicio} a.m. a ${horaFin} p.m.\n\n_¡Te esperamos!_ 😊`;
  }

  return `🕖 *Horario de ${negocio}:*\n\n${estadoActual}${horario}\n\n_¡Te esperamos!_ 😊`;
}

// ── RESPUESTA: DOMICILIO ──────────────────────────────────────────────────────
function respuestaDomicilio() {
  const negocio  = getNegocio();
  const domCosto = getDomCosto();
  const zonaCobertura = getConfig("zona_cobertura") || null;

  let resp = `🛵 *Servicio a domicilio de ${negocio}:*\n\n`;
  resp += `✅ Sí hacemos domicilio\n`;
  resp += `💵 Costo: *$${domCosto}*\n`;
  if (zonaCobertura) resp += `📍 Zona de cobertura: ${zonaCobertura}\n`;
  resp += `\n_¿Te hacemos un pedido a domicilio?_ 😊`;

  return resp;
}

// ── RESPUESTA: MENÚ ───────────────────────────────────────────────────────────
function respuestaMenu() {
  try {
    const precios   = getPrecios();
    const negocio   = getNegocio();
    const productos = getProductos();
    const domCosto  = getDomCosto();
    const nombres   = productos.length
      ? productos.map(p => p.nombre.charAt(0).toUpperCase() + p.nombre.slice(1)).join(" · ")
      : "Surtido · Carne · Buche · Cuero · Lengua";

    return (
      `\n🌮 *MENÚ ${negocio.toUpperCase()}* 🌮\n` +
      `━━━━━━━━━━━━━━━━━━\n\n` +
      `🌮 *TACOS* — $${precios.pTaco} c/u\n` +
      `_(combinaciones al gusto)_\n\n` +
      `🥖 *TORTAS* — $${precios.pTorta} c/u\n` +
      `_(combinaciones al gusto)_\n\n` +
      `⚖️ *POR GRAMOS* — $${precios.p100g} / 100g\n` +
      `Cualquier pieza o combinación\n` +
      `_Incluye tortillas y salsas_\n\n` +
      `💵 *POR CANTIDAD EN $*\n` +
      `Tú decides cuánto gastar, nosotros pesamos\n` +
      `_Incluye tortillas y salsas_\n\n` +
      `🥩 *Piezas disponibles:* ${nombres}\n\n` +
      `━━━━━━━━━━━━━━━━━━\n` +
      `🟢 Todos los tacos y tortas incluyen salsas\n` +
      `🛵 Domicilio: $${domCosto} extra\n\n` +
      `*¿Qué te vamos a preparar?* 😊\n`
    );
  } catch (e) {
    return "¡Con gusto te comparto el menú! ¿Me dices si tu pedido es para domicilio o mostrador?";
  }
}

// ── RESPUESTA: UBICACIÓN ──────────────────────────────────────────────────────
function respuestaUbicacion() {
  const negocio   = getNegocio();
  const ubicacion = getUbicacion();
  const mapas     = getConfig("link_maps") || null;

  if (!ubicacion && !mapas) {
    return `📍 Para conocer nuestra ubicación escríbenos directamente y con gusto te decimos cómo llegar a *${negocio}*. 😊`;
  }

  let resp = `📍 *Ubicación de ${negocio}:*\n\n`;
  if (ubicacion) resp += `${ubicacion}\n`;
  if (mapas)     resp += `\n🗺️ ${mapas}\n`;
  resp += `\n_¡Te esperamos!_ 😊`;

  return resp;
}

// ── RESPUESTA: MÉTODOS DE PAGO ────────────────────────────────────────────────
function respuestaMetodosPago(esDomicilio = false) {
  const negocio = getNegocio();
  const metodos = getMetodosPago(esDomicilio);

  return (
    `💳 *Métodos de pago en ${negocio}:*\n\n` +
    `Aceptamos: *${metodos}*\n\n` +
    `_¿Te hacemos un pedido?_ 😊`
  );
}

// ── RESPUESTA: MODIFICACIÓN — QUITAR UNO ─────────────────────────────────────
function aplicarQuitarUno(ordenTexto, corteEspecificado = null) {
  const lineas = ordenTexto.split("\n").filter(l => l.trim() && !/subtotal/i.test(l));
  if (!lineas.length) return null;

  function _reducirLinea(arr, filtroCorte) {
    for (let i = arr.length - 1; i >= 0; i--) {
      const m = arr[i].match(/(\d+)\s+(tacos?|tortas?)/i);
      if (!m) continue;
      if (filtroCorte && !arr[i].toLowerCase().includes(filtroCorte.toLowerCase())) continue;
      const cantActual = parseInt(m[1]);
      if (cantActual <= 1) return null;
      arr[i] = arr[i].replace(/\d+\s+(tacos?|tortas?)/i, (match) => {
        const partes = match.split(/\s+/);
        return `${parseInt(partes[0]) - 1} ${partes.slice(1).join(" ")}`;
      });
      return arr.join("\n");
    }
    return null;
  }

  if (corteEspecificado) {
    const res = _reducirLinea([...lineas], corteEspecificado);
    if (res) return res;
  }
  return _reducirLinea(lineas, null);
}

// ── RESPUESTA: MODIFICACIÓN — CAMBIAR CORTE ──────────────────────────────────
function aplicarCambiarCorte(ordenTexto, de, por) {
  if (!de || !por) return null;
  const regex = new RegExp(de, "gi");
  if (!regex.test(ordenTexto)) return null;
  return ordenTexto.replace(new RegExp(de, "gi"), por);
}

// ── RESPUESTA: DESCRIPCIÓN DE CORTE ──────────────────────────────────────────
function respuestaDescripcionCorte(corte) {
  const negocio  = getNegocio();
  const productos = getProductos();
  const prod = productos.find(p => p.nombre.toLowerCase() === corte?.toLowerCase());
  const desc = prod?.descripcion;
  if (!desc) {
    const nombres = productos.length
      ? productos.map(p => p.nombre.charAt(0).toUpperCase() + p.nombre.slice(1)).join(", ")
      : "nuestros cortes disponibles";
    return `En *${negocio}* tenemos: ${nombres}. ¿Cuál te llama la atención? 😊`;
  }
  const nombre = corte ? corte.charAt(0).toUpperCase() + corte.slice(1) : corte;
  return `🥩 *${nombre}:* ${desc}\n\n_¿Te lo preparamos?_ 😊`;
}

// ── FUNCIÓN PRINCIPAL: GENERAR RESPUESTA AUTOMÁTICA ──────────────────────────
/**
 * Dado el tipo de pregunta detectado por detectarPreguntaFrecuente,
 * genera la respuesta adecuada sin llamar a Groq.
 */
function generarRespuestaAutomatica(pregunta, opciones = {}) {
  const { esDomicilio = false, ordenTexto = null } = opciones;

  switch (pregunta.tipo) {
    case "precio":
      return respuestaPrecio(pregunta.producto);

    case "horario":
      return respuestaHorario();

    case "domicilio":
      return respuestaDomicilio();

    case "menu":
      return respuestaMenu();

    case "ubicacion":
      return respuestaUbicacion();

    case "metodos_pago":
      return respuestaMetodosPago(esDomicilio);

    case "descripcion_corte":
      return respuestaDescripcionCorte(pregunta.producto);

    case "pedido_listo":
      return `¡En cuanto esté listo tu pedido te avisamos aquí mismo! 😊 Si tienes dudas o quieres hacer algún cambio, con gusto te ayudamos.`;

    case "ya_en_camino":
      return `¡Te esperamos! 🏃 En cuanto llegues te atendemos de inmediato 😊`;

    case "despedida":
      return `¡Hasta luego! Fue un placer atenderte 😊 Cuando gustes volver, aquí estaremos.`;

    case "total_parcial":
      return null; // requiere contexto del pedido — se maneja en orden.js

    default:
      return null;
  }
}

/**
 * Dado el tipo de modificación detectado por detectarModificacion,
 * aplica el cambio a la orden y retorna la orden modificada o null.
 */
function aplicarModificacion(modificacion, ordenTexto) {
  if (!ordenTexto) return null;

  switch (modificacion.tipo) {
    case "quitar_uno":
      return aplicarQuitarUno(ordenTexto, modificacion.corte || null);

    case "cambiar_corte":
      return aplicarCambiarCorte(ordenTexto, modificacion.de, modificacion.por);

    case "agregar_mas":
      // Este caso se maneja en mensajes.js porque necesita el contexto del pedido actual
      return null;

    default:
      return null;
  }
}

module.exports = {
  generarRespuestaAutomatica,
  aplicarModificacion,
  respuestaPrecio,
  respuestaHorario,
  respuestaDomicilio,
  respuestaMenu,
  respuestaUbicacion,
  respuestaMetodosPago,
  respuestaDescripcionCorte,
};