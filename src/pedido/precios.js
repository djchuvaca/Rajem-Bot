/**
 * pedido/precios.js
 * Funciones puras de cálculo de precios — sin estado, sin BD directa.
 * Lee precios desde la BD solo cuando se llama getPrecios().
 *
 * [LEGACY] Este módulo es la API heredada de precios.
 * La ruta migrada es: getContratoGiroActivo().calcularPrecioPartida(partida).
 * Ver: src/migration/legacy-tracker.js y plan/acople.txt Etapa 4.
 */

const { registrar: _legacyRegistrar } = require("../migration/legacy-tracker");

function getPrecios() {
  if (process.env.PRECIOS_GIRO_UNICO === 'true')
    throw new Error('[LEGACY] getPrecios() deshabilitado — usar calcularPrecioPartida()');
  if (process.env.LEGACY_READ_FALLBACK === 'false')
    throw new Error('[LEGACY] getPrecios() deshabilitado por LEGACY_READ_FALLBACK');
  _legacyRegistrar("getPrecios");
  const { getConfig } = require("../db");
  const catalogoTenant = require("../giros/catalogo-tenant");
  const pTaco  = parseInt(getConfig("precio_taco")  || "30");
  const pTorta = parseInt(getConfig("precio_torta") || "40");
  const p100g  = parseInt(getConfig("precio_100g")  || "32");
  const pSalsa = parseInt(getConfig("precio_salsa") || "15");

  const porCorte = {};

  // Única fuente operativa: definiciones del Giro + overlay menu_items del tenant.
  try {
    const items = catalogoTenant.getMenuItemsActivos('corte');
    const defs = catalogoTenant.getCortesTenant();
    for (const def of defs) {
      const filas = items.filter(i => i.producto_slug === def.slug);
      if (!filas.length) continue;
      const precios = Object.fromEntries(filas.filter(i => i.formato_slug).map(i => [i.formato_slug, Number(i.precio || 0)]));
      const entry = {
        pTaco: precios.taco ?? 0,
        pTorta: precios.torta ?? 0,
        p100g: precios.gramos ?? 0,
        pTacoBD: precios.taco ?? null,
        precios,
      };
      porCorte[def.slug] = entry;
      porCorte[def.nombre.toLowerCase()] = entry;
    }
  } catch (_) {}

  return { pTaco, pTorta, p100g, pSalsa, porCorte };
}

function _preciosParaCorte(item, precios) {
  const corte = item && item.corte;
  if (corte && precios.porCorte && precios.porCorte[corte]) return precios.porCorte[corte];
  return precios;
}

/**
 * Devuelve el precio de un ítem para un formato dinámico (quesadilla, vampiro, burrito…).
 * Cadena de fallback: precios_json[formato] → precio_base del item_type → config global.
 */
function _precioFormatoDinamico(item, precios) {
  const corteKey = item.corte && item.corte !== 'surtido especial' ? item.corte : null;

  // Resolver el precio del item_type (quesadilla, vampiro, burrito, etc.)
  // Presentaciones desconocidas deben devolver 0, NO pTaco del corte como fallback.
  let itPrecio = null;
  try {
    const { getItemTypeBySlug } = require("../db");
    const it = getItemTypeBySlug(item.presentacion);
    if (it) {
      itPrecio = it.precio_base || (it.precio_campo === 'precio_torta' ? precios.pTorta : precios.pTaco);
    }
  } catch (_) {}

  // Desde tabla cortes (precios_json puede tener precio específico por formato)
  if (corteKey && precios.porCorte && precios.porCorte[corteKey]) {
    const pc = precios.porCorte[corteKey];
    if (pc.precios && pc.precios[item.presentacion] !== undefined) return pc.precios[item.presentacion];
    // Usar precio del item_type si existe, sino 0 (presentación desconocida)
    return itPrecio !== null ? itPrecio : 0;
  }

  // Desde item_type directamente (sin corte conocido)
  if (itPrecio !== null) return itPrecio;

  // Presentación completamente desconocida → $0
  return 0;
}

function calcularPrecioItem(item, precios) {
  if (process.env.PRECIOS_GIRO_UNICO === 'true')
    throw new Error('[LEGACY] calcularPrecioItem() deshabilitado — usar calcularPrecioPartida()');
  if (process.env.LEGACY_READ_FALLBACK === 'false')
    throw new Error('[LEGACY] calcularPrecioItem() deshabilitado por LEGACY_READ_FALLBACK');
  _legacyRegistrar("calcularPrecioItem");
  // Ítem mixto con combinacion (mecanismo _aplicarSurtidoEspecial)
  if (item.corte === 'surtido especial' && item.combinacion) {
    // Si el producto 'surtido especial' tiene precio propio (> 0 en BD), usarlo directamente
    const pcSE = precios.porCorte && precios.porCorte['surtido especial'];
    if (pcSE && pcSE.pTacoBD !== null) {
      return item.cantidad * pcSE.pTaco;
    }
    // Sin precio propio → calcular el precio máximo de los cortes componentes
    try {
      const { getCortesBD, calcularPrecioMixto } = require("../db/cortes");
      const mapa = getCortesBD();
      const slugs = item.combinacion.split(/\s+con\s+/i).map(n => mapa[n.trim().toLowerCase()] || n.trim()).filter(Boolean);
      if (slugs.length) {
        const precioUnit = calcularPrecioMixto(slugs, item.presentacion || 'taco');
        return item.cantidad * precioUnit;
      }
    } catch (_) {}
  }

  const pc = _preciosParaCorte(item, precios);
  const { pTaco, pTorta, p100g } = pc;

  switch (item.presentacion) {
    case "taco":   return item.cantidad * pTaco;
    case "torta":  return item.cantidad * pTorta;
    case "gramos": return Math.round((item.gramos / 100) * p100g);
    case "pesos":  return item.monto;
    case "grupo_repetido":
      return item.grupos * item.items_por_grupo.reduce((s, i) => s + calcularPrecioItem(i, precios), 0);
    case "plato_separado":
      return item.items.reduce((s, i) => s + calcularPrecioItem(i, precios), 0);
    default: {
      // Formatos dinámicos: quesadilla, vampiro, burrito, etc.
      if (item.cantidad) return item.cantidad * _precioFormatoDinamico(item, precios);
      return 0;
    }
  }
}

function calcularSubtotal(texto) {
  const lineas = texto.split("\n").filter(l => l.trim());
  let suma = 0;
  for (const linea of lineas) {
    if (/subtotal|💰|total|direcci[oó]n|referencia|tarifa|domicilio:\s*\$|📍|📌|🛵/i.test(linea)) continue;
    const mRep = linea.match(/(\d+)x\s*\[.*?\]\s*[—\-]\s*\$(\d+)/i);
    if (mRep) { suma += parseInt(mRep[1]) * parseInt(mRep[2]); continue; }
    const mPlato = linea.match(/plato\s*\d+.*?[—\-]\s*\$(\d+)/i);
    if (mPlato) { suma += parseInt(mPlato[1]); continue; }
    const mNorm = linea.match(/[—\-]\s*\$(\d+)\s*$/);
    if (mNorm) { suma += parseInt(mNorm[1]); continue; }
  }
  return suma;
}

module.exports = { getPrecios, calcularPrecioItem, calcularSubtotal };
