/**
 * pedido/precios.js
 * Funciones puras de cálculo de precios — sin estado, sin BD directa.
 * Lee precios desde la BD solo cuando se llama getPrecios().
 */

function getPrecios() {
  const { getConfig, getProductos } = require("../db");
  const pTaco  = parseInt(getConfig("precio_taco")  || "30");
  const pTorta = parseInt(getConfig("precio_torta") || "40");
  const p100g  = parseInt(getConfig("precio_100g")  || "32");
  const pSalsa = parseInt(getConfig("precio_salsa") || "15");

  const porCorte = {};

  // Fuente primaria: tabla `productos` — precios configurados por el admin desde el panel
  try {
    const productos = getProductos();
    for (const p of (productos || [])) {
      if (p.categoria === "refresco" || p.categoria === "salsa") continue;
      const key = p.nombre.toLowerCase();
      porCorte[key] = {
        pTaco:   parseInt(p.precio_taco  || pTaco),
        pTorta:  parseInt(p.precio_torta || pTorta),
        p100g:   parseInt(p.precio_100g  || p100g),
        // pTacoBD guarda el valor crudo de BD (0 = sin precio propio; >0 = precio explícito)
        pTacoBD: p.precio_taco != null ? parseInt(p.precio_taco) : null,
        precios: {},
      };
    }
  } catch (_) {}

  // Complementario: tabla `cortes` — agrega cortes nuevos (asada, tripa, pastor…)
  // y enriquece con precios_json para formatos dinámicos
  try {
    const { getCortesBDObj } = require("../db/cortes");
    for (const c of (getCortesBDObj() || [])) {
      let precios = {};
      try { precios = JSON.parse(c.precios_json || '{}'); } catch (_) {}
      const entry = {
        pTaco:  precios.taco  ?? c.precio_base ?? pTaco,
        pTorta: precios.torta ?? c.precio_base ?? pTorta,
        p100g:  precios['100g'] ?? p100g,
        precios,
      };
      // Si ya existe en productos, solo enriquecer con precios_json para formatos dinámicos
      if (porCorte[c.slug]) {
        porCorte[c.slug].precios = precios;
      } else {
        porCorte[c.slug] = entry;
      }
      // Nombre del corte también como clave (compat con código que usa el nombre)
      const nom = c.nombre.toLowerCase();
      if (!porCorte[nom]) porCorte[nom] = porCorte[c.slug];
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
  // Ítem mixto con combinacion (mecanismo _aplicarSurtidoEspecial)
  if (item.corte === 'surtido especial' && item.combinacion) {
    // Si el producto 'surtido especial' tiene precio propio (> 0 en BD), usarlo directamente
    const pcSE = precios.porCorte && precios.porCorte['surtido especial'];
    if (pcSE && pcSE.pTacoBD > 0) {
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
