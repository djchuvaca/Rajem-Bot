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
    const productos = getProductos();
    const nombres   = productos.length > 0
      ? productos.map(p => p.nombre.charAt(0).toUpperCase() + p.nombre.slice(1)).join(" · ")
      : "Surtido · Carne · Buche · Cuero · Lengua";
    const p = productos[0] || { precio_taco: 30, precio_torta: 40, precio_100g: 32 };
    const domCosto  = getConfig("domicilio_costo") || "50";
    const negocio   = getConfig("nombre_negocio")  || "Tacos Javier";

    return (
      `\n🌮 *MENÚ ${negocio.toUpperCase()}* 🌮\n` +
      `━━━━━━━━━━━━━━━━━━\n\n` +
      `🌮 *TACOS* — $${p.precio_taco} c/u\n` +
      `_(combinaciones al gusto)_\n\n` +
      `🥖 *TORTAS* — $${p.precio_torta} c/u\n` +
      `_(combinaciones al gusto)_\n\n` +
      `⚖️ *POR GRAMOS* — $${p.precio_100g} / 100g\n` +
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
  get DATOS_BANCO()              { return getDatosBanco(); },
  get MENU_FORMATO()             { return getMenuFormato(); },
  FORM_MOSTRADOR:          (tel) => getFormMostrador(tel),
  FORM_DOMICILIO:          (tel) => getFormDomicilio(tel),
  FORM_PREVENTA_MOSTRADOR: (tel) => getFormPreventaMostrador(tel),
  FORM_PREVENTA_DOMICILIO: (tel) => getFormPreventaDomicilio(tel),
  get SALUDO()                   { return getSaludo(); },
};