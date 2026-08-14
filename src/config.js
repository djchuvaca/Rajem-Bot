const { getConfig, getBanco, getMensaje, getItemTypes } = require("./db");
const { getPrecios } = require("./pedido/precios");
const { getRangoHorario } = require("./horario");
const { getGiroActivo } = require("./giros");
const catalogoTenant = require('./giros/catalogo-tenant');

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
    const giro  = (() => { try { return getGiroActivo(); } catch { return null; } })();
    const md    = giro?.mensajesDefaults || {};
    const cd    = giro?.configDefaults   || {};

    const negocio     = getConfig("nombre_negocio") || "el negocio";
    const pSalsa      = parseInt(getConfig("precio_salsa") || cd.precio_salsa || "15");
    const precios     = getPrecios();
    const itemTypes   = getItemTypes();

    const notaTaco     = getMensaje("menu_taco_nota")    || md.menu_taco_nota    || '';
    const notaGramos   = getMensaje("menu_gramos_nota")  || md.menu_gramos_nota  || '';
    const notaSalsas   = getMensaje("menu_salsas_nota")  || md.menu_salsas_nota  || '';
    const pieSalsas    = getMensaje("menu_pie_salsas")   || md.menu_pie_salsas   || '';
    const notaCantidad = getMensaje("menu_por_cantidad") || md.menu_por_cantidad || '';

    // ── Leer el menú configurado por el tenant (menu_items) ───────────────────
    const miAll       = catalogoTenant.getMenuItemsActivos();
    const cortesItems = miAll.filter(i => i.categoria === 'corte');
    const bebidasItems = miAll.filter(i => i.categoria === 'refresco');
    const salsasItems  = miAll.filter(i => i.categoria === 'salsa');

    // ── Cortes activos: nombres desde tabla cortes por slug ───────────────────
    const { getCortesBDObj } = require('./db/cortes');
    const cortesDB      = catalogoTenant.getCortesTenant();
    const cortesPorSlug = Object.fromEntries(cortesDB.map(c => [c.slug, c]));
    const corteSlugs    = [...new Set(cortesItems.map(i => i.producto_slug))];
    const cortesActivos = corteSlugs.map(s => cortesPorSlug[s]).filter(Boolean);
    const nombres       = cortesActivos.map(c => c.nombre.charAt(0).toUpperCase() + c.nombre.slice(1)).join(" · ");

    // ── Sección de precios por item_type ──────────────────────────────────────
    // Separar formatos por unidad (taco, torta…) de gramos/pesos que tienen sección propia
    const itsPorUnidad = itemTypes.filter(it => !it.soporta_gramos && !it.soporta_pesos);
    const itGramos     = itemTypes.find(t => t.soporta_gramos) || null;
    const itPorPesos   = itemTypes.find(t => t.soporta_pesos)  || null;

    let seccionPrecios = "";
    for (const it of itsPorUnidad) {
      const campo = it.precio_campo || 'precio_taco';

      // Precios de menu_items para este formato
      const preciosFormato = cortesItems
        .filter(i => i.formato_slug === it.slug)
        .map(i => i.precio || 0)
        .filter(p => p > 0);

      let precioDisplay;
      if (preciosFormato.length === 0) {
        // Sin items configurados → usar precio_base del item_type o global
        const pBase = it.precio_base || (campo === 'precio_torta' ? precios.pTorta : precios.pTaco);
        precioDisplay = `$${pBase} c/u`;
      } else {
        const minP = Math.min(...preciosFormato);
        const maxP = Math.max(...preciosFormato);
        precioDisplay = minP === maxP ? `$${minP} c/u` : `desde $${minP} c/u`;
      }
      seccionPrecios += `${it.emoji} *${it.nombre_plural.toUpperCase()}* — ${precioDisplay}\n${notaTaco}\n\n`;
    }

    // ── Sección por gramos ────────────────────────────────────────────────────
    if (itGramos) {
      const p100g = itGramos.precio_base || precios.p100g;
      seccionPrecios += `⚖️ *POR GRAMOS* — $${p100g} / 100g\n${notaGramos}\n\n`;
    }

    // ── Sección por cantidad en $ ─────────────────────────────────────────────
    const seccionPesos = itPorPesos ? `💵 *POR CANTIDAD EN $*\n${notaCantidad}\n\n` : "";

    // ── Variedades ─────────────────────────────────────────────────────────────
    const variedadesSeccion = cortesActivos.length > 0 ? `🥩 *Variedades disponibles:* ${nombres}\n\n` : "";

    // ── Bebidas ───────────────────────────────────────────────────────────────
    let refrescosSeccion = "";
    if (bebidasItems.length > 0) {
      const refNombres  = bebidasItems.map(b => b.producto_slug.charAt(0).toUpperCase() + b.producto_slug.slice(1)).join(" · ");
      const presBebidas = bebidasItems.map(b => b.precio || 0).filter(p => p > 0);
      const minB = presBebidas.length ? Math.min(...presBebidas) : 0;
      const maxB = presBebidas.length ? Math.max(...presBebidas) : 0;
      const pBDisplay = presBebidas.length === 0 ? '' : (minB === maxB ? `$${minB} c/u` : `desde $${minB} c/u`);
      refrescosSeccion = `🥤 *REFRESCOS*${pBDisplay ? ` — ${pBDisplay}` : ''}\n${refNombres}\n\n`;
    }

    // ── Salsas ────────────────────────────────────────────────────────────────
    let salsasSeccion = "";
    if (salsasItems.length > 0) {
      const salNombres  = salsasItems.map(s => s.producto_slug.charAt(0).toUpperCase() + s.producto_slug.slice(1)).join(" · ");
      const presSalsas  = salsasItems.map(s => s.precio || 0);
      const todosCero   = presSalsas.every(p => p === 0);
      const todosIgual  = !todosCero && presSalsas.every(p => p === presSalsas[0]);
      const precioDisplay = todosCero
        ? (pSalsa ? `$${pSalsa} c/u` : '')
        : todosIgual ? `$${presSalsas[0]} c/u` : 'precio variable';
      salsasSeccion =
        `🌶️ *SALSAS EXTRA*${precioDisplay ? ` — ${precioDisplay}` : ''}\n` +
        `${salNombres}\n` +
        `${notaSalsas}` +
        (pieSalsas ? `\n${pieSalsas}` : ``) +
        `\n\n`;
    }

    const notaDomicilio    = getMensaje("menu_domicilio_nota") ?? md.menu_domicilio_nota ?? '';
    const domicilioSeccion = notaDomicilio ? `${notaDomicilio}\n\n` : "";

    const _menuEmoji = itsPorUnidad[0]?.emoji || itemTypes[0]?.emoji || "🍽️";
    return (
      `\n${_menuEmoji} *MENÚ ${negocio.toUpperCase()}* ${_menuEmoji}\n` +
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
  const porUnidad = itemTypes.filter(it => !it.soporta_gramos && !it.soporta_pesos);
  const itGramos  = itemTypes.find(t => t.soporta_gramos);
  let lineas = "";
  for (const it of porUnidad) {
    const campo = it.precio_campo || 'precio_taco';
    const p     = campo === 'precio_torta' ? precios.pTorta : precios.pTaco;
    lineas += `${it.emoji} *${it.nombre_plural.toUpperCase()}* — $${p} c/u\n`;
  }
  if (itGramos) lineas += `⚖️ *POR GRAMOS* — $${itGramos.precio_base || precios.p100g} / 100g\n`;
  const emoji = porUnidad[0]?.emoji || itemTypes[0]?.emoji || '🍽️';
  return `\n${emoji} *MENÚ ${negocio.toUpperCase()}* ${emoji}\n━━━━━━━━━━━━━━━━━━\n\n${lineas}\n━━━━━━━━━━━━━━━━━━\n¿Qué te vamos a preparar? 😊\n`;
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
  const giro = (() => { try { return getGiroActivo(); } catch (_) { return null; } })();
  try {
    const fallback = giro?.mensajesDefaults?.saludo
      || `¡Bienvenido a *${negocio}*! ${giro?.emoji || '🍽️'}🔥\n\n¿Tu pedido será para *domicilio* 🛵 o pasas a *recoger al mostrador* 🏪?`;
    const msg = getMensaje("saludo") || fallback;
    return msg.replace(/{negocio}/g, negocio);
  } catch (e) {
    return `¡Bienvenido a *${negocio}*! ${giro?.emoji || '🍽️'}🔥\n\n¿Tu pedido será para *domicilio* 🛵 o pasas a *recoger al mostrador* 🏪?`;
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
