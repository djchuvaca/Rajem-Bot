// src/handlers/respuestas.js
// Respuestas automáticas a preguntas frecuentes y modificaciones — sin Groq
// Compatible con cualquier negocio configurado en la BD

const { getConfig, getMensaje, getProductos, getHorarios, getBanco, getItemTypes } = require("../db");
const { getPrecios } = require("../pedido/precios");
const { estaEnHorario } = require("../horario");

// ── HELPERS ───────────────────────────────────────────────────────────────────
function getNegocio() {
  return getConfig("nombre_negocio") || "el negocio";
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
    const precios     = getPrecios();
    const negocio     = getNegocio();
    const notaPrecios = (getMensaje("menu_nota_precios") || "_Los precios incluyen tortillas y salsas_ 😊").replace(/{negocio}/g, negocio);

    // Obtener item_types activos para construir columnas de precio
    let itemTypes = [];
    try { itemTypes = getItemTypes() || []; } catch (_) {}
    if (!itemTypes.length) itemTypes = [
      { slug: 'taco',  nombre: 'taco',  nombre_plural: 'tacos',  emoji: '🌮', soporta_gramos: 1, precio_campo: 'precio_taco'  },
      { slug: 'torta', nombre: 'torta', nombre_plural: 'tortas', emoji: '🥖', soporta_gramos: 0, precio_campo: 'precio_torta' },
    ];

    // Obtener cortes desde tabla cortes (nueva) con fallback a productos
    let cortes = [];
    try {
      const { getCortesBDObj } = require("../db/cortes");
      cortes = (getCortesBDObj() || []).filter(c => c.slug !== 'surtido');
    } catch (_) {}
    if (!cortes.length) {
      try {
        cortes = getProductos().filter(p => p.categoria === "corte" && p.nombre !== "surtido especial");
      } catch (_) {}
    }

    // Precio para un corte en un formato específico
    const precioCorteFormato = (corteId, formatoSlug) => {
      const pc = precios.porCorte[corteId] || precios;
      const it = itemTypes.find(t => t.slug === formatoSlug);
      // 1. Precio explícito por corte+formato (precios_json del corte)
      if (pc.precios && pc.precios[formatoSlug] !== undefined) return pc.precios[formatoSlug];
      // 2. Formatos clásicos: usar precio por corte de productos
      if (it?.precio_campo === 'precio_torta') return pc.pTorta ?? precios.pTorta;
      if (it?.precio_campo === 'precio_taco')  return pc.pTaco  ?? precios.pTaco;
      // 3. Formatos dinámicos (quesadilla, vampiro, burrito): precio_base del item_type
      if (it?.precio_base) return it.precio_base;
      return pc.pTaco ?? precios.pTaco;
    };

    if (producto) {
      const slugProducto = producto.toLowerCase();
      const pc = precios.porCorte[slugProducto] || precios;
      let resp = `💰 *Precios en ${negocio}:*\n\n🥩 *${producto.charAt(0).toUpperCase() + producto.slice(1)}*\n`;
      for (const it of itemTypes) {
        const p = precioCorteFormato(slugProducto, it.slug);
        resp += `   ${it.emoji} ${it.nombre_plural}: *$${p}*\n`;
      }
      if (itemTypes.some(t => t.soporta_gramos)) resp += `   ⚖️ Por 100g: *$${pc.p100g ?? precios.p100g}*\n`;
      return resp + `\n` + notaPrecios;
    }

    // Vista completa — desglose por corte
    const todosIguales = !cortes.length || cortes.every(c => {
      const key = c.slug || c.nombre?.toLowerCase();
      const pc  = precios.porCorte[key] || precios;
      return itemTypes.every(it => {
        const p  = precioCorteFormato(key, it.slug);
        const pb = it.precio_campo === 'precio_torta' ? precios.pTorta : precios.pTaco;
        return p === pb;
      });
    });

    if (todosIguales || !cortes.length) {
      const nombres = cortes.length
        ? cortes.map(c => (c.nombre || c.slug).charAt(0).toUpperCase() + (c.nombre || c.slug).slice(1)).join(", ")
        : "Asada, Tripa, Al Pastor, Suadero, Carnitas";
      let lineasPrecios = "";
      for (const it of itemTypes) {
        const p = it.precio_base || (it.precio_campo === 'precio_torta' ? precios.pTorta : precios.pTaco);
        lineasPrecios += `${it.emoji} *${(it.nombre_plural || it.nombre).charAt(0).toUpperCase() + (it.nombre_plural || it.nombre).slice(1)}* — $${p} c/u\n`;
      }
      if (itemTypes.some(t => t.soporta_gramos)) lineasPrecios += `⚖️ *Por gramos* — $${precios.p100g} / 100g\n`;
      return `💰 *Precios en ${negocio}:*\n\n` + lineasPrecios + `\n🥩 Cortes disponibles: ${nombres}\n\n*(Las combinaciones "X con Y" tienen el precio del corte más caro)*\n\n` + notaPrecios;
    }

    // Precios diferentes por corte — desglose completo
    let resp = `💰 *Precios en ${negocio}:*\n\n`;
    for (const c of cortes) {
      const key    = c.slug || c.nombre?.toLowerCase();
      const nombre = (c.nombre || c.slug).charAt(0).toUpperCase() + (c.nombre || c.slug).slice(1);
      const pc     = precios.porCorte[key] || precios;
      resp += `🥩 *${nombre}*\n`;
      const partes = itemTypes.map(it => `${it.emoji} $${precioCorteFormato(key, it.slug)}`);
      const tieneGramos = itemTypes.some(it => it.soporta_gramos);
      if (tieneGramos) partes.push(`⚖️ $${pc.p100g ?? precios.p100g}/100g`);
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
  const negocio  = getNegocio();
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

    const itemTypes   = getItemTypes();
    let seccionPrecios = "";
    for (const it of itemTypes) {
      const campo  = it.precio_campo || 'precio_taco';
      const preKey = campo === 'precio_torta' ? 'pTorta' : 'pTaco';
      if (preciosUniformes) {
        const pBase = precios[preKey];
        seccionPrecios += `${it.emoji} *${it.nombre_plural.toUpperCase()}* — $${pBase} c/u\n${notaTaco}\n\n`;
      } else {
        const minP = cortes.length
          ? Math.min(...cortes.map(p => (precios.porCorte[p.nombre.toLowerCase()] || precios)[preKey]))
          : precios[preKey];
        seccionPrecios += `${it.emoji} *${it.nombre_plural.toUpperCase()}* — desde $${minP} c/u\n`;
      }
    }
    if (!itemTypes.length) {
      // fallback si no hay item_types configurados
      seccionPrecios = preciosUniformes
        ? `🌮 *TACOS* — $${precios.pTaco} c/u\n${notaTaco}\n\n🥖 *TORTAS* — $${precios.pTorta} c/u\n${notaTaco}\n\n`
        : `🌮 *TACOS* — desde $${Math.min(...cortes.map(p => (precios.porCorte[p.nombre.toLowerCase()] || precios).pTaco))} c/u\n🥖 *TORTAS* — desde $${Math.min(...cortes.map(p => (precios.porCorte[p.nombre.toLowerCase()] || precios).pTorta))} c/u\n`;
    }
    if (!preciosUniformes && cortes.length) {
      seccionPrecios += `_(El precio varía por variante — escribe *precios* para ver el desglose)_\n\n`;
    }
    const soportaGramos = itemTypes.some(t => t.soporta_gramos);
    const soportaPesos  = itemTypes.some(t => t.soporta_pesos);
    if (soportaGramos) {
      seccionPrecios += preciosUniformes
        ? `⚖️ *POR GRAMOS* — $${precios.p100g} / 100g\n${notaGramos}\n\n`
        : `⚖️ *POR GRAMOS* — desde $${precios.p100g} / 100g\n${notaGramos}\n\n`;
    }
    const headerEmoji = itemTypes[0]?.emoji || '🌮';
    const seccionPesos = soportaPesos ? `💵 *POR CANTIDAD EN $*\n${notaCantidad}\n\n` : "";
    const tiposNombres = itemTypes.map(t => t.nombre_plural).join(" y ");
    const notaPieDyn   = getMensaje("menu_pie_salsas") || `🟢 Todos los ${tiposNombres || "tacos y tortas"} incluyen salsas`;

    return (
      `\n${headerEmoji} *MENÚ ${negocio.toUpperCase()}* ${headerEmoji}\n` +
      `━━━━━━━━━━━━━━━━━━\n\n` +
      seccionPrecios +
      seccionPesos +
      `🥩 *Piezas disponibles:* ${nombres}\n\n` +
      `━━━━━━━━━━━━━━━━━━\n` +
      `${notaPieDyn}\n` +
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