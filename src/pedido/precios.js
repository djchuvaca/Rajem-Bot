/**
 * pedido/precios.js
 * Funciones puras de cálculo de precios — sin estado, sin BD directa.
 * Lee precios desde la BD solo cuando se llama getPrecios().
 */

function getPrecios() {
  const { getConfig } = require("../db");
  return {
    pTaco:  parseInt(getConfig("precio_taco")  || "30"),
    pTorta: parseInt(getConfig("precio_torta") || "40"),
    p100g:  parseInt(getConfig("precio_100g")  || "32"),
  };
}

function calcularPrecioItem(item, precios) {
  const { pTaco, pTorta, p100g } = precios;
  switch (item.presentacion) {
    case "taco":    return item.cantidad * pTaco;
    case "torta":   return item.cantidad * pTorta;
    case "gramos":  return Math.round((item.gramos / 100) * p100g);
    case "pesos":   return item.monto;
    case "grupo_repetido":
      return item.grupos * item.items_por_grupo.reduce((s, i) => s + calcularPrecioItem(i, precios), 0);
    case "plato_separado":
      return item.items.reduce((s, i) => s + calcularPrecioItem(i, precios), 0);
    default: return 0;
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
