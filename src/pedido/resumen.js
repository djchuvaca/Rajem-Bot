/**
 * pedido/resumen.js
 * Funciones puras de formateo y generación de resumen de pedido.
 * Generalizado para cualquier negocio — lee config desde BD.
 */

const { getPrecios, calcularPrecioItem, calcularSubtotal } = require("./precios");
const { getConfig, getProductos } = require("../db");

// ── HELPERS DE CONFIG ─────────────────────────────────────────────────────────
function getNombreNegocio() {
  try { return getConfig("nombre_negocio") || "Tacos Javier"; } catch (e) { return "Tacos Javier"; }
}

function getNombreProducto() {
  try {
    return getConfig("nombre_producto") || "carnitas";
  } catch (e) { return "carnitas"; }
}

function getDomCosto() {
  try { return parseInt(getConfig("domicilio_costo") || "50"); } catch (e) { return 50; }
}

function getTipoNegocio() {
  try { return getConfig("tipo_negocio") || "taqueria"; } catch (e) { return "taqueria"; }
}

// ── EMOJIS POR PRESENTACIÓN ───────────────────────────────────────────────────
function emojiPresentacion(presentacion, tipoNegocio) {
  const tipo = tipoNegocio || getTipoNegocio();
  const EMOJIS = {
    taqueria:   { taco: "🌮", torta: "🥖", gramos: "⚖️", pesos: "⚖️", default: "🍽️" },
    pizzeria:   { taco: "🍕", torta: "🥪", gramos: "⚖️", pesos: "⚖️", default: "🍕" },
    hamburguesa:{ taco: "🍔", torta: "🍔", gramos: "⚖️", pesos: "⚖️", default: "🍔" },
    default:    { taco: "🍽️", torta: "🍽️", gramos: "⚖️", pesos: "⚖️", default: "🍽️" },
  };
  const set = EMOJIS[tipo] || EMOJIS.default;
  return set[presentacion] || set.default;
}

// ── FORMATEAR HORA ────────────────────────────────────────────────────────────
function formatearHora(horaTexto) {
  if (!horaTexto) return horaTexto;
  const match = horaTexto.match(/(\d{1,2})(?::(\d{2}))?/);
  if (!match) return horaTexto;
  const h = parseInt(match[1]);
  const m = parseInt(match[2] || "0");
  const tienePm = /pm/i.test(horaTexto);
  const tieneAm = /am/i.test(horaTexto);
  let sufijo;
  if (tienePm)      sufijo = "p.m.";
  else if (tieneAm) sufijo = "a.m.";
  else              sufijo = (h === 12) ? "p.m." : "a.m.";
  const minStr = m > 0 ? `:${String(m).padStart(2, "0")}` : ":00";
  return `${h}${minStr} ${sufijo}`;
}

// ── PROCESAR ITEM JSON → TEXTO ────────────────────────────────────────────────
function procesarItemJSON(item, precios) {
  const { pTaco, pTorta, p100g } = precios;
  const producto = getNombreProducto();
  const tipo     = getTipoNegocio();
  const corte    = Array.isArray(item.corte) ? item.corte.join(" con ") : (item.corte || "");
  const corteStr = corte ? ` de ${corte}` : "";

  switch (item.presentacion) {
    case "taco":
      return `${emojiPresentacion("taco", tipo)} ${item.cantidad} ${item.cantidad > 1 ? "tacos" : "taco"}${corteStr} — $${item.cantidad * pTaco}`;

    case "torta":
      return `${emojiPresentacion("torta", tipo)} ${item.cantidad} ${item.cantidad > 1 ? "tortas" : "torta"}${corteStr} — $${item.cantidad * pTorta}`;

    case "gramos":
      return `${emojiPresentacion("gramos", tipo)} ${item.gramos}g${corteStr} — $${Math.round((item.gramos / 100) * p100g)}`;

    case "pesos":
      return `${emojiPresentacion("pesos", tipo)} $${item.monto}${corteStr} — (~${Math.round((item.monto / p100g) * 100)}g)`;

    case "grupo_repetido": {
      const lg = item.items_por_grupo.map(i => {
        const c = Array.isArray(i.corte) ? i.corte.join(" con ") : (i.corte || "");
        const cs = c ? ` de ${c}` : "";
        if (i.presentacion === "taco")   return `${i.cantidad} ${i.cantidad > 1 ? "tacos" : "taco"}${cs}`;
        if (i.presentacion === "torta")  return `${i.cantidad} ${i.cantidad > 1 ? "tortas" : "torta"}${cs}`;
        if (i.presentacion === "gramos") return `${i.gramos}g${cs}`;
        if (i.presentacion === "pesos")  return `$${i.monto}${cs}`;
        return "";
      }).filter(Boolean).join(" + ");
      const pg = item.items_por_grupo.reduce((s, i) => s + calcularPrecioItem(i, precios), 0);
      return `${item.grupos}x [${lg}] — $${pg} c/u`;
    }

    case "plato_separado": {
      const lp = item.items.map(i => procesarItemJSON(i, precios)).join(" + ");
      return `🍽️ Plato ${item.numero}: ${lp.replace(/^[🌮🥖⚖️🍕🍔]\s*/, "")}`;
    }

    default: return "";
  }
}

// ── JSON → LÍNEAS DE TEXTO ────────────────────────────────────────────────────
function jsonALineas(jsonData) {
  const precios  = getPrecios();
  const lineas   = jsonData.items.map(i => procesarItemJSON(i, precios)).filter(Boolean);
  const subtotal = jsonData.items.reduce((s, i) => s + calcularPrecioItem(i, precios), 0);
  lineas.push(`💰 Subtotal: $${subtotal}`);
  return { texto: lineas.join("\n"), subtotal };
}

// ── EXTRAER ORDEN DEL RESUMEN ─────────────────────────────────────────────────
function extraerOrdenDeResumen(textoResumen) {
  const m = textoResumen.match(/📋 \*Orden:\*\n([\s\S]+?)(?=\n(?:📍|📌|🛵|💵|💰|💳|🕖))/u);
  if (m) return m[1].trim();
  const m2 = textoResumen.match(/📋 \*Orden:\*\n([\s\S]+?)\n💰/);
  return m2 ? m2[1].trim() : "";
}

// ── FORMATEAR LISTA ACUMULADA ─────────────────────────────────────────────────
function formatearListaAcumulada(ordenTexto) {
  const lineas = ordenTexto.split("\n").filter(l => l.trim() && !/subtotal/i.test(l));
  const subtotal = calcularSubtotal(ordenTexto);
  let lista = "📋 *Tu pedido hasta ahora:*\n";
  lista += "━━━━━━━━━━━━━━━━━━\n";
  lineas.forEach(l => { lista += `${l.trim()}\n`; });
  lista += "━━━━━━━━━━━━━━━━━━\n";
  lista += `💰 *Subtotal: $${subtotal}*`;
  return lista;
}

// ── GENERAR RESUMEN FINAL ─────────────────────────────────────────────────────
function generarResumen(clienteNumero, ordenTexto, esDomicilio, esPreventa) {
  const { datosCampos, horaEntregaPreventa } = require("../estado");
  const c = datosCampos.get(clienteNumero) || {};

  // Fuente de verdad: datosCampos.tipoEntrega > parámetro recibido
  if (c.tipoEntrega) esDomicilio = c.tipoEntrega === "domicilio";

  const negocio  = getNombreNegocio();
  const domCosto = getDomCosto();
  const horaConf = horaEntregaPreventa.get(clienteNumero);
  const esTransf = /transferencia/i.test(c.metodo || "");
  const subtotal = calcularSubtotal(ordenTexto);
  const total    = esDomicilio ? subtotal + domCosto : subtotal;
  const ordenLimpia = ordenTexto.split("\n").filter(l => !/subtotal/i.test(l)).join("\n").trim();

  const nombreCap = (c.nombre || "—").replace(/\b\w/g, l => l.toUpperCase());

  let resumen = "━━━━━━━━━━━━━━━━━━\n";
  resumen += esDomicilio
    ? `🛵 *PEDIDO A DOMICILIO — ${negocio}*\n`
    : `🏪 *PEDIDO EN MOSTRADOR — ${negocio}*\n`;
  resumen += `👤 *Cliente:* ${nombreCap}\n`;
  resumen += `📱 *Teléfono:* ${c.telefono || "—"}\n`;
  resumen += `📧 *Correo:* ${c.correo && c.correo !== "no proporcionó" ? c.correo : "no proporcionó"}\n`;
  resumen += `📋 *Orden:*\n${ordenLimpia}\n\n`;

  if (esDomicilio) {
    resumen += `📍 *Dirección:* ${c.calle || "—"}, Col. ${c.colonia || "—"}\n`;
    resumen += `📌 *Referencia:* ${c.referencia && c.referencia !== "sin referencia" ? c.referencia : "sin referencia"}\n`;
    resumen += `💵 *Subtotal:* $${subtotal}\n`;
    resumen += `🛵 *Tarifa domicilio:* $${domCosto}\n`;
  }

  resumen += `💰 *TOTAL: $${total}*\n`;
  resumen += `💳 *Pago:* ${c.metodo || "—"}\n`;

  if (esPreventa && horaConf) {
    const hf = formatearHora(horaConf);
    resumen += esDomicilio
      ? `🕖 *Hora de entrega:* ${hf}\n`
      : `🕖 *Recolección:* ${hf}\n`;
  }

  resumen += "━━━━━━━━━━━━━━━━━━\n";
  resumen += "*¿Confirmas tu pedido?*";

  return { texto: resumen, esTransferencia: esTransf, total };
}

module.exports = {
  formatearHora,
  procesarItemJSON,
  jsonALineas,
  extraerOrdenDeResumen,
  formatearListaAcumulada,
  generarResumen,
  calcularSubtotal,
};