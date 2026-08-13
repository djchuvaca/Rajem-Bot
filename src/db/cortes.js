/**
 * db/cortes.js
 * Catálogo de cortes/ingredientes del giro — separado de `productos` (bebidas/salsas).
 * Fuente de verdad para NLU y pricing desde el rediseño multi-giro.
 */

const { queryAll, queryOne, run } = require('./core');

const _TTL = 60_000;

let _cache    = null; let _cacheTs    = 0;
let _cacheObj = null; let _cacheObjTs = 0;
let _giroId   = null; let _giroIdTs   = 0;

function _invalidar() {
  _cache    = null; _cacheTs    = 0;
  _cacheObj = null; _cacheObjTs = 0;
  _giroId   = null; _giroIdTs   = 0;
}

function _getGiroId() {
  const ahora = Date.now();
  if (_giroId && ahora - _giroIdTs < _TTL) return _giroId;
  try {
    const { getConfig } = require('./config');
    const slug = getConfig('business_type_slug') || 'taqueria';
    const bt = queryOne('SELECT id FROM business_types WHERE slug = ?', [slug]);
    _giroId = bt ? bt.id : null;
    _giroIdTs = ahora;
    return _giroId;
  } catch (_) { return null; }
}

/**
 * Devuelve mapa { alias|nombre → slug } para NLU.
 * Compatible con el shape de getCortes() clásico (Map string→string).
 */
function getCortesBD() {
  const ahora = Date.now();
  if (_cache && ahora - _cacheTs < _TTL) return _cache;
  try {
    const giroId = _getGiroId();
    if (!giroId) { _cache = {}; _cacheTs = ahora; return {}; }
    // Si menu_items tiene cortes activos, solo incluir los disponibles en el NLU.
    // Fallback al catálogo completo si menu_items aún no está configurado.
    const miActivos = queryOne(
      "SELECT COUNT(*) as n FROM menu_items WHERE categoria='corte' AND activo=1 AND eliminado=0",
      []
    );
    const rows = (miActivos && miActivos.n > 0)
      ? queryAll(
          `SELECT DISTINCT c.* FROM cortes c
           INNER JOIN menu_items mi ON mi.producto_slug = c.slug
             AND mi.activo = 1 AND mi.eliminado = 0 AND mi.categoria = 'corte'
           WHERE c.giro_id = ? AND c.activo = 1 ORDER BY c.id`,
          [giroId]
        ) || []
      : queryAll(
          'SELECT * FROM cortes WHERE giro_id = ? AND activo = 1 ORDER BY id',
          [giroId]
        ) || [];
    const mapa = {};
    for (const c of rows) {
      const slug = c.slug;
      const nom  = c.nombre.toLowerCase().trim();
      mapa[nom]  = slug;
      const plural = /[aeiouáéíóú]$/i.test(nom) ? nom + 's' : nom + 'es';
      mapa[plural] = slug;
      let aliases = [];
      try { aliases = JSON.parse(c.aliases_json || '[]'); } catch (_) {}
      for (const a of aliases) { if (a) mapa[a.toLowerCase().trim()] = slug; }
    }
    _cache = mapa; _cacheTs = ahora;
    return mapa;
  } catch (_) { _cache = {}; _cacheTs = Date.now(); return {}; }
}

/** Devuelve objetos completos de cortes activos. */
function getCortesBDObj() {
  const ahora = Date.now();
  if (_cacheObj && ahora - _cacheObjTs < _TTL) return _cacheObj;
  try {
    const giroId = _getGiroId();
    _cacheObj = giroId
      ? (queryAll('SELECT * FROM cortes WHERE giro_id = ? AND activo = 1 ORDER BY id', [giroId]) || [])
      : [];
    _cacheObjTs = ahora;
    return _cacheObj;
  } catch (_) { return []; }
}

/** Todos los cortes del giro (activos e inactivos). Para el panel. */
function getAllCortesBD() {
  try {
    const giroId = _getGiroId();
    if (!giroId) return [];
    return queryAll('SELECT * FROM cortes WHERE giro_id = ? ORDER BY activo DESC, id', [giroId]) || [];
  } catch (_) { return []; }
}

/**
 * Precio de un corte para un formato específico.
 * Cadena de fallback: precios_json[formato] → precio_base → config global.
 */
function getPrecioCorteFormato(corteSlug, formatoSlug) {
  const { getConfig } = require('./config');
  const defTaco  = parseInt(getConfig('precio_taco')  || '30');
  const defTorta = parseInt(getConfig('precio_torta') || '40');
  const corte = getCortesBDObj().find(c => c.slug === corteSlug);
  if (!corte) return formatoSlug === 'torta' ? defTorta : defTaco;
  let precios = {};
  try { precios = JSON.parse(corte.precios_json || '{}'); } catch (_) {}
  if (precios[formatoSlug] !== undefined) return precios[formatoSlug];
  if (corte.precio_base)                  return corte.precio_base;
  return formatoSlug === 'torta' ? defTorta : defTaco;
}

/**
 * Precio de un ítem mixto (varios cortes) según estrategia configurada.
 *   mas_caro (default) — precio del corte más caro
 *   promedio           — promedio de precios
 */
function calcularPrecioMixto(cortesSlugs, formatoSlug) {
  const { getConfig } = require('./config');
  if (!cortesSlugs || !cortesSlugs.length) return 0;
  const estrategia = getConfig('estrategia_precio_mixto') || 'mas_caro';
  const precios = cortesSlugs.map(s => getPrecioCorteFormato(s, formatoSlug));
  if (estrategia === 'promedio') return Math.round(precios.reduce((a, b) => a + b, 0) / precios.length);
  return Math.max(...precios);
}

function invalidarCacheCortesBD() { _invalidar(); }

// ── CRUD ──────────────────────────────────────────────────────────────────────

function createCorte(datos) {
  const giroId = _getGiroId();
  if (!giroId) throw new Error('giro no configurado');
  const slug = datos.slug || datos.nombre.toLowerCase().normalize('NFD').replace(/[̀-ͯ]/g, '').replace(/\s+/g, '_').replace(/[^a-z0-9_]/g, '');
  run(
    'INSERT OR IGNORE INTO cortes (giro_id, slug, nombre, aliases_json, descripcion, precio_base, precios_json, activo) VALUES (?,?,?,?,?,?,?,?)',
    [giroId, slug, datos.nombre, JSON.stringify(datos.aliases || []), datos.descripcion || '', datos.precio_base || 30, JSON.stringify(datos.precios || {}), datos.activo ?? 1]
  );
  _invalidar();
}

function updateCorte(id, datos) {
  run(
    'UPDATE cortes SET nombre=?, aliases_json=?, descripcion=?, precio_base=?, precios_json=?, activo=? WHERE id=?',
    [datos.nombre, JSON.stringify(datos.aliases || []), datos.descripcion || '', datos.precio_base || 30, JSON.stringify(datos.precios || {}), datos.activo ?? 1, id]
  );
  _invalidar();
}

module.exports = {
  getCortesBD, getCortesBDObj, getAllCortesBD,
  getPrecioCorteFormato, calcularPrecioMixto,
  invalidarCacheCortesBD,
  createCorte, updateCorte,
};
