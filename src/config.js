const { getConfig, getBanco, getMensaje, getProductos, getItemTypes } = require("./db");
const { getPrecios } = require("./pedido/precios");
const { getRangoHorario } = require("./horario");

// ── DATOS BANCO ───────────────────────────────────────────────────────────────
function getDatosBanco() {
  try {
    const b = getBanco();
    if (!b) return _datosBancoDefault();
    return (
      `💳 *Datos para transferencia:*\n` +
      `━━━━━━━━━━━━━━━━━━\n` +
      `🏦 *Banco:* ${b.banco}\n` +
      `👤 *Beneficiario:* ${b.beneficiario}\n` +
      `🔢 *CLABE:* ${b.clabe}\n` +
      `━━━━━━━━━━━━━━━━━━\n` +
      `Una vez realizada, mándanos la captura de pantalla como comprobante 📸`
    );
  } catch (e) { return _datosBancoDefault(); }
}

function _datosBancoDefault() {
  return `💳 Los datos bancarios aún no están configurados.\nPor favor contacta al negocio directamente.`;
}

// ── MENÚ FORMATO ──────────────────────────────────────────────────────────────

function getMenuFormato() {
  try {
    const productos   = getProductos();
    const cortes      = productos.filter(p => p.categoria === "corte" && p.nombre !== "surtido especial");
    const refrescos   = productos.filter(p => p.categoria === "refresco");
    const salsas      = productos.filter(p => p.categoria === "salsa");
    const nombres     = cortes.map(p => p.nombre.charAt(0).toUpperCase() + p.nombre.slice(1)).join(" · ");
    const negocio    = getConfig("nombre_negocio")  || "el negocio";
    const pSalsa     = parseInt(getConfig("precio_salsa") || "15");
    const precios    = getPrecios();
    const notaTaco     = getMensaje("menu_taco_nota")    || "_(combinaciones al gusto)_";
    const notaGramos   = getMensaje("menu_gramos_nota")  || "Cualquier pieza o combinación\n_Incluye tortillas y salsas_";
    const notaSalsas   = getMensaje("menu_salsas_nota")  || "_(Los tacos y tortas ya incluyen salsas gratis)_";
    const pieSalsas    = getMensaje("menu_pie_salsas")   || "";
    const notaCantidad = getMensaje("menu_por_cantidad") || "Tú decides cuánto gastar, nosotros pesamos\n_Incluye tortillas y salsas_";
    // ── Sección de precios dinámica según item_types ──────────────────────────
    const itemTypes     = getItemTypes();
    const preciosUniformes = cortes.length === 0 || cortes.every(c => {
      const pc = precios.porCorte[c.nombre.toLowerCase()] || precios;
      return pc.pTaco === precios.pTaco && pc.pTorta === precios.pTorta && pc.p100g === precios.p100g;
    });
    let seccionPrecios = "";
    for (const it of itemTypes) {
      const campo       = it.precio_campo || 'precio_taco';
      const pBase       = campo === 'precio_torta' ? precios.pTorta : precios.pTaco;
      if (preciosUniformes) {
        seccionPrecios += `${it.emoji} *${it.nombre_plural.toUpperCase()}* — $${pBase} c/u\n${notaTaco}\n\n`;
      } else {
        const preKey = campo === 'precio_torta' ? 'pTorta' : 'pTaco';
        const minP   = cortes.length ? Math.min(...cortes.map(c => (precios.porCorte[c.nombre.toLowerCase()] || precios)[preKey])) : pBase;
        seccionPrecios += `${it.emoji} *${it.nombre_plural.toUpperCase()}* — desde $${minP} c/u\n`;
      }
    }
    if (!preciosUniformes && cortes.length) {
      seccionPrecios += `_(El precio varía por variante — escribe *precios* para ver el desglose)_\n\n`;
    }
    const soportaGramos = itemTypes.some(t => t.soporta_gramos);
    if (soportaGramos) {
      seccionPrecios += preciosUniformes
        ? `⚖️ *POR GRAMOS* — $${precios.p100g} / 100g\n${notaGramos}\n\n`
        : `⚖️ *POR GRAMOS* — desde $${precios.p100g} / 100g\n${notaGramos}\n\n`;
    }

    let refrescosSeccion = "";
    if (refrescos.length > 0) {
      const refNombres = refrescos.map(r => r.nombre.charAt(0).toUpperCase() + r.nombre.slice(1)).join(" · ");
      refrescosSeccion =
        `🥤 *REFRESCOS* — $${refrescos[0].precio_taco} c/u\n` +
        `${refNombres}\n\n`;
    }

    let salsasSeccion = "";
    if (salsas.length > 0) {
      const salNombres = salsas.map(s => s.nombre.charAt(0).toUpperCase() + s.nombre.slice(1)).join(" · ");
      // Si todas las salsas tienen precio_taco = 0 en BD, usar el global como fallback
      const precioRef = salsas.every(s => s.precio_taco === 0) ? pSalsa : null;
      const todosIgual = !precioRef && salsas.every(s => s.precio_taco === salsas[0].precio_taco);
      const precioDisplay = precioRef
        ? `$${precioRef} c/u`
        : todosIgual
          ? `$${salsas[0].precio_taco} c/u`
          : `precio variable`;
      salsasSeccion =
        `🌶️ *SALSAS EXTRA* — ${precioDisplay}\n` +
        `${salNombres}\n` +
        `${notaSalsas}` +
        (pieSalsas ? `\n${pieSalsas}` : ``) +
        `\n\n`;
    }

    const soportaPesos   = itemTypes.some(t => t.soporta_pesos);
    const seccionPesos   = soportaPesos ? `💵 *POR CANTIDAD EN $*\n${notaCantidad}\n\n` : "";
    const etiquetaItems  = itemTypes.length > 0
      ? itemTypes[0].emoji + " " + itemTypes.map(t => t.nombre_plural.charAt(0).toUpperCase() + t.nombre_plural.slice(1)).join(" / ")
      : "🥩 Piezas";

    const variedadesSeccion = cortes.length > 0 ? `🥩 *Variedades disponibles:* ${nombres}\n\n` : "";
    const notaDomicilio     = getMensaje("menu_domicilio_nota") ?? "🛵 Domicilio: _precio según distancia a tu colonia_ 📍";
    const domicilioSeccion  = notaDomicilio ? `${notaDomicilio}\n\n` : "";

    return (
      `\n${itemTypes[0]?.emoji || "🍽️"} *MENÚ ${negocio.toUpperCase()}* ${itemTypes[0]?.emoji || "🍽️"}\n` +
      `━━━━━━━━━━━━━━━━━━\n\n` +
      seccionPrecios +
      seccionPesos +
      variedadesSeccion +
      refrescosSeccion +
      salsasSeccion +
      `━━━━━━━━━━━━━━━━━━\n` +
      domicilioSeccion +
      `*¿Qué te vamos a preparar?* 😊\n`
    );
  } catch (e) { return _menuDefault(); }
}

function _menuDefault() {
  const negocio = getConfig("nombre_negocio") || "el negocio";
  const precios = getPrecios();
  const itemTypes = (() => { try { return getItemTypes() || []; } catch (_) { return []; } })();
  let lineas = "";
  for (const it of itemTypes) {
    const campo = it.precio_campo || 'precio_taco';
    const p     = campo === 'precio_torta' ? precios.pTorta : precios.pTaco;
    lineas += `${it.emoji} *${it.nombre_plural.toUpperCase()}* — $${p} c/u\n`;
  }
  if (itemTypes.some(t => t.soporta_gramos)) {
    lineas += `⚖️ *POR GRAMOS* — $${precios.p100g} / 100g\n`;
  }
  return `\n${itemTypes[0]?.emoji || '🍽️'} *MENÚ ${negocio.toUpperCase()}* ${itemTypes[0]?.emoji || '🍽️'}\n━━━━━━━━━━━━━━━━━━\n\n${lineas}\n━━━━━━━━━━━━━━━━━━\n¿Qué te vamos a preparar? 😊\n`;
}

// ── FORMULARIOS ───────────────────────────────────────────────────────────────
const SEP = `━━━━━━━━━━━━━━━━━━`;

function getFormMostrador(tel = "") {
  return (
    `📋 *Datos para tu pedido*\n` +
    `${SEP}\n` +
    `👤 *Nombre y apellido:*\n` +
    `📱 *Teléfono:* ${tel ? tel + " ✅" : ""}\n` +
    `📧 *Correo (opcional):*\n` +
    `💳 *Método de pago:* efectivo · tarjeta · transferencia\n` +
    `${SEP}\n` +
    `_Puedes mandarlos todos juntos_ 😊`
  );
}

function getFormDomicilio(tel = "") {
  return (
    `📋 *Datos para tu pedido*\n` +
    `${SEP}\n` +
    `👤 *Nombre y apellido:*\n` +
    `📱 *Teléfono:* ${tel ? tel + " ✅" : ""}\n` +
    `📧 *Correo (opcional):*\n` +
    `📍 *Calle y número:*\n` +
    `🏘️ *Colonia:*\n` +
    `📌 *Referencia (opcional):*\n` +
    `💳 *Método de pago:* efectivo · transferencia\n` +
    `${SEP}\n` +
    `_Puedes mandarlos todos juntos_ 😊`
  );
}

function getFormPreventaMostrador(tel = "") {
  return (
    `📋 *Datos para tu pedido — Preventa*\n` +
    `${SEP}\n` +
    `👤 *Nombre y apellido:*\n` +
    `📱 *Teléfono:* ${tel ? tel + " ✅" : ""}\n` +
    `📧 *Correo (opcional):*\n` +
    `💳 *Método de pago:* efectivo · tarjeta · transferencia\n` +
    `🕖 *Hora de recolección:* (entre ${getRangoHorario()})\n` +
    `${SEP}\n` +
    `_Puedes mandarlos todos juntos_ 😊`
  );
}

function getFormPreventaDomicilio(tel = "") {
  return (
    `📋 *Datos para tu pedido — Preventa*\n` +
    `${SEP}\n` +
    `👤 *Nombre y apellido:*\n` +
    `📱 *Teléfono:* ${tel ? tel + " ✅" : ""}\n` +
    `📧 *Correo (opcional):*\n` +
    `📍 *Calle y número:*\n` +
    `🏘️ *Colonia:*\n` +
    `📌 *Referencia (opcional):*\n` +
    `💳 *Método de pago:* efectivo · transferencia\n` +
    `🕖 *Hora de entrega:* (entre ${getRangoHorario()})\n` +
    `${SEP}\n` +
    `_Puedes mandarlos todos juntos_ 😊`
  );
}

function getSaludo() {
  const negocio = getConfig("nombre_negocio") || "el negocio";
  const emojiGiro = (() => {
    try { const { getGiroActivo } = require('./giros'); return getGiroActivo()?.emoji || '🍽️'; }
    catch (_) { return '🍽️'; }
  })();
  try {
    const msg = getMensaje("saludo") || `¡Bienvenido a *${negocio}*! ${emojiGiro}🔥\n\n*¿Tu pedido será para domicilio* 🛵 *o pasas a recoger al mostrador?* 🏪`;
    return msg.replace(/{negocio}/g, negocio);
  } catch (e) {
    return `¡Bienvenido a *${negocio}*! ${emojiGiro}🔥\n\n¿Tu pedido será para *domicilio* 🛵 o pasas a *recoger al mostrador* 🏪?`;
  }
}

module.exports = {
  DATOS_BANCO:             getDatosBanco,
  MENU_FORMATO:            getMenuFormato,
  FORM_MOSTRADOR:          (tel) => getFormMostrador(tel),
  FORM_DOMICILIO:          (tel) => getFormDomicilio(tel),
  FORM_PREVENTA_MOSTRADOR: (tel) => getFormPreventaMostrador(tel),
  FORM_PREVENTA_DOMICILIO: (tel) => getFormPreventaDomicilio(tel),
  SALUDO:                  getSaludo,
};