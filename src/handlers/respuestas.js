// src/handlers/respuestas.js
// Respuestas automáticas a preguntas frecuentes y modificaciones — sin Groq
// Compatible con cualquier negocio configurado en la BD

const { getConfig, getMensaje, getHorarios, getBanco, getItemTypes, getMenuItems, getTipoServicio } = require("../db");
const { getPrecios } = require("../pedido/precios");
const { estaEnHorario } = require("../horario");
const { MENU_FORMATO } = require("../config");

// ── HELPERS ───────────────────────────────────────────────────────────────────
function getNegocio() {
  return getConfig("nombre_negocio") || "el negocio";
}

function getUbicacion() {
  return getConfig("ubicacion") || getConfig("direccion") || null;
}

function getMetodosPago(esDomicilio = false) {
  try {
    if (esDomicilio) return getConfig("metodos_domicilio") || "efectivo, tarjeta y transferencia";
    return getConfig("metodos_mostrador") || "efectivo, tarjeta y transferencia";
  } catch (e) {
    return "efectivo, tarjeta y transferencia";
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
    const precios     = getPrecios();
    const negocio     = getNegocio();
    const _giroR = (() => { try { const { getGiroActivo } = require('../giros'); return getGiroActivo(); } catch(_) { return null; } })();
    const notaPrecios = (getMensaje("menu_nota_precios") ?? _giroR?.mensajesDefaults?.menu_nota_precios ?? '').replace(/{negocio}/g, negocio);

    // Obtener item_types activos — separar formatos de precio por unidad de gramos/pesos
    let itemTypes = [];
    try { itemTypes = getItemTypes() || []; } catch (_) {}
    // Solo formatos que se venden por unidad (taco, torta, etc.) — gramos/pesos se manejan aparte
    const formatosPrecio = itemTypes.filter(it => !it.soporta_gramos && !it.soporta_pesos);
    const tieneGramos    = itemTypes.some(t => t.soporta_gramos);
    const itGramos       = tieneGramos ? itemTypes.find(t => t.soporta_gramos) : null;

    // Obtener cortes y precios desde menu_items del tenant (fuente de verdad del panel)
    let cortes = [];
    let preciosMI = {}; // { slug: { formatoSlug: precio } }
    try {
      const miCortes = getMenuItems('corte');
      const slugsUnicos = [...new Set(miCortes.map(i => i.producto_slug))];
      for (const item of miCortes) {
        if (!preciosMI[item.producto_slug]) preciosMI[item.producto_slug] = {};
        if (item.formato_slug) preciosMI[item.producto_slug][item.formato_slug] = item.precio || 0;
      }
      const cortesDB = require('../giros/catalogo-tenant').getCortesTenant();
      const porSlug  = Object.fromEntries(cortesDB.map(c => [c.slug, c]));
      cortes = slugsUnicos.map(s => porSlug[s]).filter(Boolean).filter(c => c.slug !== 'surtido');
    } catch (_) {}

    // Precio para un corte en un formato específico
    const precioCorteFormato = (corteId, formatoSlug) => {
      const it = itemTypes.find(t => t.slug === formatoSlug);
      // 1. Desde menu_items — solo si el precio está configurado (> 0)
      const miPrice = preciosMI[corteId]?.[formatoSlug];
      if (miPrice !== undefined && miPrice > 0) return miPrice;
      // 2. Fallback: catálogo de cortes o precio global del item_type
      const pc = precios.porCorte[corteId] || precios;
      const precioCatalogo = Number(pc.precios?.[formatoSlug] || 0);
      if (precioCatalogo > 0) return precioCatalogo;
      const precioCorte = it?.precio_campo === 'precio_torta' ? Number(pc.pTorta || 0)
        : it?.precio_campo === 'precio_taco' ? Number(pc.pTaco || 0) : 0;
      if (precioCorte > 0) return precioCorte;
      if (Number(it?.precio_base || 0) > 0) return Number(it.precio_base);
      return it?.precio_campo === 'precio_torta' ? precios.pTorta : precios.pTaco;
    };

    if (producto) {
      const slugProducto = producto.toLowerCase();
      const pc = precios.porCorte[slugProducto] || precios;
      let resp = `💰 *Precios en ${negocio}:*\n\n🥩 *${producto.charAt(0).toUpperCase() + producto.slice(1)}*\n`;
      for (const it of formatosPrecio) {
        const p = precioCorteFormato(slugProducto, it.slug);
        resp += `   ${it.emoji} ${it.nombre_plural}: *$${p}*\n`;
      }
      if (tieneGramos) resp += `   ⚖️ Por 100g: *$${itGramos?.precio_base || (pc.p100g ?? precios.p100g)}*\n`;
      return resp + `\n` + notaPrecios;
    }

    // Vista completa — desglose por corte
    const todosIguales = !cortes.length || cortes.every(c => {
      const key = c.slug || c.nombre?.toLowerCase();
      return formatosPrecio.every(it => {
        const p  = precioCorteFormato(key, it.slug);
        const pb = it.precio_campo === 'precio_torta' ? precios.pTorta : precios.pTaco;
        return p === pb;
      });
    });

    if (todosIguales || !cortes.length) {
      const nombres = cortes.length
        ? cortes.map(c => (c.nombre || c.slug).charAt(0).toUpperCase() + (c.nombre || c.slug).slice(1)).join(", ")
        : 'Ninguno activo';
      let lineasPrecios = "";
      for (const it of formatosPrecio) {
        const p = it.precio_base || (it.precio_campo === 'precio_torta' ? precios.pTorta : precios.pTaco);
        lineasPrecios += `${it.emoji} *${(it.nombre_plural || it.nombre).charAt(0).toUpperCase() + (it.nombre_plural || it.nombre).slice(1)}* — $${p} c/u\n`;
      }
      if (tieneGramos) lineasPrecios += `⚖️ *Por gramos* — $${itGramos?.precio_base || precios.p100g} / 100g\n`;
      return `💰 *Precios en ${negocio}:*\n\n` + lineasPrecios + `\n🥩 Cortes disponibles: ${nombres}\n\n*(Las combinaciones "X con Y" tienen el precio del corte más caro)*\n\n` + notaPrecios;
    }

    // Precios diferentes por corte — desglose completo
    let resp = `💰 *Precios en ${negocio}:*\n\n`;
    for (const c of cortes) {
      const key    = c.slug || c.nombre?.toLowerCase();
      const nombre = (c.nombre || c.slug).charAt(0).toUpperCase() + (c.nombre || c.slug).slice(1);
      const pc     = precios.porCorte[key] || precios;
      resp += `🥩 *${nombre}*\n`;
      const partes = formatosPrecio.map(it => `${it.emoji} $${precioCorteFormato(key, it.slug)}`);
      if (tieneGramos) partes.push(`⚖️ $${itGramos?.precio_base || (pc.p100g ?? precios.p100g)}/100g`);
      resp += `   ${partes.join(' · ')}\n\n`;
    }
    resp += `*(Combina cualquier corte al gusto — precio del más caro)*\n\n` + notaPrecios;
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
  const negocio = getNegocio();
  const ts = getTipoServicio();

  if (ts === "solo_mostrador") {
    return `🏪 *${negocio}* solo atiende en mostrador.\n\nNo contamos con servicio a domicilio, pero con gusto te preparamos tu pedido para que pases a recoger. 😊`;
  }

  const zonaCobertura = getConfig("zona_cobertura") || null;
  let resp = `🛵 *Servicio a domicilio de ${negocio}:*\n\n`;
  resp += `✅ Sí hacemos domicilio\n`;
  resp += `💵 Costo: _El precio se ajusta a la distancia de tu colonia_ 📍\n`;
  if (zonaCobertura) resp += `📍 Zona de cobertura: ${zonaCobertura}\n`;
  resp += `\n_¿Te hacemos un pedido a domicilio?_ 😊`;
  return resp;
}

// ── RESPUESTA: MENÚ ───────────────────────────────────────────────────────────
// Delega a MENU_FORMATO (config.js) — fuente única de construcción del menú.
function respuestaMenu() {
  try {
    return MENU_FORMATO();
  } catch (e) {
    const ts = getTipoServicio();
    if (ts !== "ambos") return "¡Con gusto te comparto el menú! ¿Qué se te antoja? 😊";
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

  // Construir patrón dinámico de nombres de ítem-type (plural y singular)
  let _itemNombresPat = 'tacos?|tortas?';
  try {
    const its = getItemTypes();
    if (its.length) {
      const words = [];
      for (const it of its) {
        if (it.nombre_plural) words.push(it.nombre_plural.replace(/[.*+?^${}()|[\]\\]/g, '\\$&'));
        if (it.nombre)        words.push(it.nombre.replace(/[.*+?^${}()|[\]\\]/g, '\\$&'));
      }
      if (words.length) _itemNombresPat = words.sort((a, b) => b.length - a.length).join('|');
    }
  } catch (_) {}
  const _reItem = new RegExp(`(\\d+)\\s+(${_itemNombresPat})`, 'i');

  function _reducirLinea(arr, filtroCorte) {
    for (let i = arr.length - 1; i >= 0; i--) {
      const m = arr[i].match(_reItem);
      if (!m) continue;
      if (filtroCorte && !arr[i].toLowerCase().includes(filtroCorte.toLowerCase())) continue;
      const cantActual = parseInt(m[1]);
      // Si este ítem ya tiene qty=1, seguir buscando hacia atrás (no cortar el loop)
      if (cantActual <= 1) continue;
      const nuevoQty = cantActual - 1;
      // Actualizar cantidad
      arr[i] = arr[i].replace(_reItem, (match) => {
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
  const catalogo = require('../giros/catalogo-tenant');
  const activos = new Set(catalogo.getMenuItemsActivos('corte').map(i => i.producto_slug));
  const productos = catalogo.getCortesTenant().filter(c => activos.has(c.slug));
  const prod = catalogo.getDefinicionProducto('corte', corte || '');
  const desc = prod && activos.has(prod.slug) ? prod.descripcion : null;
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

/**
 * Aplica una operación neutral (src/giros/modificaciones.js) sobre el texto
 * de la orden acumulada. Bridge de migración: traduce neutral→texto hasta que
 * los handlers operen sobre el modelo neutral completo (Fase 8).
 */
function aplicarModificacionNeutral(op, ordenTexto) {
  if (!op || !ordenTexto) return null;
  switch (op.tipo) {
    case 'reducir_cantidad':
      return aplicarQuitarUno(ordenTexto, op.selector?.productoSlug || null);
    case 'cambiar_variante':
      return aplicarCambiarCorte(ordenTexto, op.de, op.a);
    default:
      return null;
  }
}

module.exports = {
  generarRespuestaAutomatica,
  aplicarModificacion,
  aplicarModificacionNeutral,
  respuestaPrecio,
  respuestaHorario,
  respuestaDomicilio,
  respuestaMenu,
  respuestaUbicacion,
  respuestaMetodosPago,
  respuestaDescripcionCorte,
};
