const { getConfig, getBanco, getMensaje, getProductos } = require("./db");
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
    const nombres     = cortes.length > 0
      ? cortes.map(p => p.nombre.charAt(0).toUpperCase() + p.nombre.slice(1)).join(" · ")
      : "Surtido · Carne · Buche · Cuero · Lengua";
    const negocio    = getConfig("nombre_negocio")  || "Tacos Javier";
    const pSalsa     = parseInt(getConfig("precio_salsa") || "15");
    const pRef       = cortes[0] || { precio_taco: 30, precio_torta: 40, precio_100g: 32 };
    const preciosUniformes = cortes.length === 0 || cortes.every(c =>
      parseInt(c.precio_taco)  === parseInt(pRef.precio_taco) &&
      parseInt(c.precio_torta) === parseInt(pRef.precio_torta) &&
      parseInt(c.precio_100g)  === parseInt(pRef.precio_100g)
    );
    let seccionPrecios;
    if (preciosUniformes) {
      seccionPrecios =
        `🌮 *TACOS* — $${pRef.precio_taco} c/u\n_(combinaciones al gusto)_\n\n` +
        `🥖 *TORTAS* — $${pRef.precio_torta} c/u\n_(combinaciones al gusto)_\n\n` +
        `⚖️ *POR GRAMOS* — $${pRef.precio_100g} / 100g\nCualquier pieza o combinación\n_Incluye tortillas y salsas_\n\n`;
    } else {
      const minTaco  = Math.min(...cortes.map(c => parseInt(c.precio_taco)  || parseInt(pRef.precio_taco)));
      const minTorta = Math.min(...cortes.map(c => parseInt(c.precio_torta) || parseInt(pRef.precio_torta)));
      const min100g  = Math.min(...cortes.map(c => parseInt(c.precio_100g)  || parseInt(pRef.precio_100g)));
      seccionPrecios =
        `🌮 *TACOS* — desde $${minTaco} c/u\n` +
        `🥖 *TORTAS* — desde $${minTorta} c/u\n` +
        `⚖️ *POR GRAMOS* — desde $${min100g} / 100g\n` +
        `_(El precio varía por corte — escribe *precios* para ver el desglose)_\n\n`;
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
        `_(Los tacos y tortas ya incluyen salsas gratis)_\n\n`;
    }

    return (
      `\n🌮 *MENÚ ${negocio.toUpperCase()}* 🌮\n` +
      `━━━━━━━━━━━━━━━━━━\n\n` +
      seccionPrecios +
      `💵 *POR CANTIDAD EN $*\n` +
      `Tú decides cuánto gastar, nosotros pesamos\n` +
      `_Incluye tortillas y salsas_\n\n` +
      `🥩 *Piezas disponibles:* ${nombres}\n\n` +
      refrescosSeccion +
      salsasSeccion +
      `━━━━━━━━━━━━━━━━━━\n` +
      `🛵 Domicilio: _precio según distancia a tu colonia_ 📍\n\n` +
      `*¿Qué te vamos a preparar?* 😊\n`
    );
  } catch (e) { return _menuDefault(); }
}

function _menuDefault() {
  return `\n🌮 *MENÚ TACOS JAVIER* 🌮\n━━━━━━━━━━━━━━━━━━\n\n🌮 *TACOS* — $30 c/u\nSurtido · Carne · Buche · Cuero · Lengua\n\n🥖 *TORTAS* — $40 c/u\n\n⚖️ *POR GRAMOS* — $32 / 100g\n\n━━━━━━━━━━━━━━━━━━\n¿Qué te vamos a preparar? 😊\n`;
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
  try {
    const msg = getMensaje("saludo") || `¡Bienvenido a *${negocio}*! 🌮🔥\n\n*¿Tu pedido será para domicilio* 🛵 *o pasas a recoger al mostrador?* 🏪`;
    return msg.replace(/{negocio}/g, negocio);
  } catch (e) {
    return `¡Bienvenido a *${negocio}*! 🌮🔥\n\n¿Tu pedido será para *domicilio* 🛵 o pasas a *recoger al mostrador* 🏪?`;
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