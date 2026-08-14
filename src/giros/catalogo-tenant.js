'use strict';

// Única fachada de catálogo para el panel del tenant. Las definiciones salen
// del giro; SQLite aporta únicamente el estado mutable de este tenant.
const { getGiroActivo, getCatalogo } = require('./index');
const { queryAll } = require('../db/core');

function _slug() { return getGiroActivo().slug; }

function getFormatosTenant({ todos = false } = {}) {
  const giro = getGiroActivo();
  const filas = queryAll(`SELECT it.* FROM item_types it
    JOIN business_types bt ON bt.id=it.business_type_id WHERE bt.slug=?`, [giro.slug]) || [];
  const porSlug = new Map(filas.map(f => [f.slug, f]));
  return (giro.itemTypes || []).map(def => {
    const fila = porSlug.get(def.slug);
    return { ...def, id: fila?.id, business_type_id: fila?.business_type_id,
      activo: fila?.activo ?? 0, precio_base: fila?.precio_base ?? def.precio_base ?? 0,
      aliases_json: JSON.stringify(def.aliases || []) };
  }).filter(f => todos || f.activo);
}

function getCortesTenant() {
  const giro = getGiroActivo();
  const filas = queryAll(`SELECT c.* FROM cortes c JOIN business_types bt ON bt.id=c.giro_id WHERE bt.slug=?`, [giro.slug]) || [];
  const porSlug = new Map(filas.map(f => [f.slug, f]));
  return (giro.cortes || []).map(def => {
    const fila = porSlug.get(def.slug);
    return { ...def, id: fila?.id, giro_id: fila?.giro_id, activo: fila?.activo ?? 1,
      precio_base: fila?.precio_base ?? def.precio_base ?? 0, precios_json: fila?.precios_json || '{}',
      descripcion: def.descripcion || '', aliases_json: JSON.stringify(def.aliases || []) };
  });
}

function _complementos(categoria) {
  const defs = categoria === 'refresco' ? getCatalogo(_slug()).bebidas : getCatalogo(_slug()).salsas;
  const filas = queryAll('SELECT * FROM productos WHERE categoria=?', [categoria]) || [];
  return defs.map(def => {
    const fila = filas.find(f => f.nombre.toLowerCase() === def.nombre.toLowerCase());
    return { ...def, id: fila?.id, activo: fila?.activo ?? 0,
      precio: fila?.precio_taco ?? def.precio ?? 0, precio_taco: fila?.precio_taco ?? def.precio ?? 0 };
  });
}

function getBebidasTenant() { return _complementos('refresco'); }
function getSalsasTenant() { return _complementos('salsa'); }

function getMenuItemsTenant(categoria = null) {
  const giro = getGiroActivo();
  const validos = {
    corte: new Set((giro.cortes || []).map(x => x.slug)),
    refresco: new Set((giro.refrescos || []).map(x => x.nombre)),
    salsa: new Set((giro.salsas || []).map(x => x.nombre)),
  };
  return (queryAll('SELECT * FROM menu_items WHERE eliminado=0 ORDER BY categoria,producto_slug') || [])
    .filter(i => (!categoria || i.categoria === categoria) && validos[i.categoria]?.has(i.producto_slug));
}

function esProductoValido(categoria, slug) {
  const giro = getGiroActivo();
  if (categoria === 'corte') return (giro.cortes || []).some(x => x.slug === slug);
  if (categoria === 'refresco') return (giro.refrescos || []).some(x => x.nombre === slug);
  if (categoria === 'salsa') return (giro.salsas || []).some(x => x.nombre === slug);
  return false;
}

function esFormatoIdValido(id) { return getFormatosTenant({ todos: true }).some(x => x.id === id); }

module.exports = { getFormatosTenant, getCortesTenant, getBebidasTenant, getSalsasTenant, getMenuItemsTenant, esProductoValido, esFormatoIdValido };
