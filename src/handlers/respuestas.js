// src/handlers/respuestas.js
// Respuestas automáticas a preguntas frecuentes y modificaciones — sin Groq
// Compatible con cualquier negocio configurado en la BD

const { getConfig, getMensaje, getProductos, getHorarios, getBanco } = require("../db");
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
    const cortes   = productos.filter(p => p.categoria === "corte" && p.nombre !== "surtido especial");
    const notaPrecios = getMensaje("menu_nota_precios") || "_Los precios incluyen tortillas y salsas_ 😊";

    if (producto) {
      const pc = (precios.porCorte && precios.porCorte[producto.toLowerCase()]) || precios;
      return (
        `💰 *Precios en ${negocio}:*\n\n` +
        `🌮 Taco de ${producto}: *$${pc.pTaco}*\n` +
        `🥖 Torta de ${producto}: *$${pc.pTorta}*\n` +
        `⚖️ Por 100g de ${producto}: *$${pc.p100g}*\n\n` +
        notaPrecios
      );
    }

    // Verificar si todos los cortes tienen el mismo precio efectivo (aplicando fallback a globales)
    const todosIguales = !cortes.length || cortes.every(p => {
      const pc = precios.porCorte[p.nombre.toLowerCase()] || precios;
      return pc.pTaco === precios.pTaco && pc.pTorta === precios.pTorta && pc.p100g === precios.p100g;
    });

    if (todosIguales || !cortes.length) {
      const nombres = cortes.length
        ? cortes.map(p => p.nombre.charAt(0).toUpperCase() + p.nombre.slice(1)).join(", ")
        : "Surtido, Carne, Buche, Cuero, Lengua";
      return (
        `💰 *Precios en ${negocio}:*\n\n` +
        `🌮 *Tacos* — $${precios.pTaco} c/u\n` +
        `🥖 *Tortas* — $${precios.pTorta} c/u\n` +
        `⚖️ *Por gramos* — $${precios.p100g} / 100g\n\n` +
        `🥩 Piezas disponibles: ${nombres}\n\n` +
        notaPrecios
      );
    }

    // Precios diferentes por corte — mostrar desglose usando precio efectivo (con fallback global)
    let resp = `💰 *Precios en ${negocio}:*\n\n`;
    for (const p of cortes) {
      const nombre = p.nombre.charAt(0).toUpperCase() + p.nombre.slice(1);
      const pc = precios.porCorte[p.nombre.toLowerCase()] || precios;
      resp += `🥩 *${nombre}*\n`;
      resp += `   🌮 $${pc.pTaco} · 🥖 $${pc.pTorta} · ⚖️ $${pc.p100g}/100g\n\n`;
    }
    const se = productos.find(p => p.nombre === "surtido especial");
    if (se) {
      const sePc = precios.porCorte["surtido especial"] || precios;
      resp += `🌟 *Surtido especial* (combinación a tu gusto)\n`;
      resp += `   🌮 $${sePc.pTaco} · 🥖 $${sePc.pTorta} · ⚖️ $${sePc.p100g}/100g\n\n`;
    }
    resp += notaPrecios;
    return resp;
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
  resp += `💵 Costo: _El precio se ajusta a la distancia de tu colonia_ 📍\n`;
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
    const cortes    = productos.filter(p => p.categoria === "corte" && p.nombre !== "surtido especial");
    const nombres   = cortes.length
      ? cortes.map(p => p.nombre.charAt(0).toUpperCase() + p.nombre.slice(1)).join(" · ")
      : "Surtido · Carne · Buche · Cuero · Lengua";
    const notaTaco     = getMensaje("menu_taco_nota")    || "_(combinaciones al gusto)_";
    const notaGramos   = getMensaje("menu_gramos_nota")  || "Cualquier pieza o combinación\n_Incluye tortillas y salsas_";
    const notaCantidad = getMensaje("menu_por_cantidad") || "Tú decides cuánto gastar, nosotros pesamos\n_Incluye tortillas y salsas_";
    const notaPie      = getMensaje("menu_pie_salsas")   || "🟢 Todos los tacos y tortas incluyen salsas";

    const preciosUniformes = !cortes.length || cortes.every(p => {
      const pc = precios.porCorte[p.nombre.toLowerCase()] || precios;
      return pc.pTaco === precios.pTaco && pc.pTorta === precios.pTorta && pc.p100g === precios.p100g;
    });

    let seccionPrecios;
    if (preciosUniformes) {
      seccionPrecios =
        `🌮 *TACOS* — $${precios.pTaco} c/u\n${notaTaco}\n\n` +
        `🥖 *TORTAS* — $${precios.pTorta} c/u\n${notaTaco}\n\n` +
        `⚖️ *POR GRAMOS* — $${precios.p100g} / 100g\n${notaGramos}\n\n`;
    } else {
      const minTaco  = Math.min(...cortes.map(p => (precios.porCorte[p.nombre.toLowerCase()] || precios).pTaco));
      const minTorta = Math.min(...cortes.map(p => (precios.porCorte[p.nombre.toLowerCase()] || precios).pTorta));
      const min100g  = Math.min(...cortes.map(p => (precios.porCorte[p.nombre.toLowerCase()] || precios).p100g));
      seccionPrecios =
        `🌮 *TACOS* — desde $${minTaco} c/u\n` +
        `🥖 *TORTAS* — desde $${minTorta} c/u\n` +
        `⚖️ *POR GRAMOS* — desde $${min100g} / 100g\n` +
        `_(El precio varía por corte — escribe *precios* para ver el desglose)_\n\n`;
    }

    return (
      `\n🌮 *MENÚ ${negocio.toUpperCase()}* 🌮\n` +
      `━━━━━━━━━━━━━━━━━━\n\n` +
      seccionPrecios +
      `💵 *POR CANTIDAD EN $*\n${notaCantidad}\n\n` +
      `🥩 *Piezas disponibles:* ${nombres}\n\n` +
      `━━━━━━━━━━━━━━━━━━\n` +
      `${notaPie}\n` +
      `🛵 Domicilio: _precio según distancia a tu colonia_ 📍\n\n` +
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
      // Si este ítem ya tiene qty=1, seguir buscando hacia atrás (no cortar el loop)
      if (cantActual <= 1) continue;
      const nuevoQty = cantActual - 1;
      // Actualizar cantidad
      arr[i] = arr[i].replace(/\d+\s+(tacos?|tortas?)/i, (match) => {
        const partes = match.split(/\s+/);
        return `${nuevoQty} ${partes.slice(1).join(" ")}`;
      });
      // Actualizar precio (precio unitario = precio_total / cantActual)
      arr[i] = arr[i].replace(/[—\-]\s*\$(\d+)\s*$/, (_, oldPriceStr) => {
        const precioUnitario = Math.round(parseInt(oldPriceStr) / cantActual);
        return `— $${nuevoQty * precioUnitario}`;
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