const { queryAll } = require('../db/core');
const { getConfig } = require('../db/config');

function haversine(lat1, lon1, lat2, lon2) {
  const R = 6371;
  const toRad = d => d * Math.PI / 180;
  const dLat = toRad(lat2 - lat1);
  const dLon = toRad(lon2 - lon1);
  const a = Math.sin(dLat / 2) ** 2 + Math.cos(toRad(lat1)) * Math.cos(toRad(lat2)) * Math.sin(dLon / 2) ** 2;
  return R * 2 * Math.atan2(Math.sqrt(a), Math.sqrt(1 - a));
}

// ── Caché de colonias (TTL 60s) ───────────────────────────────────────────────
let _cache = null;
let _cacheTs = 0;
const CACHE_TTL = 60_000;

function _colonias() {
  const now = Date.now();
  if (!_cache || now - _cacheTs > CACHE_TTL) {
    _cache = queryAll('SELECT * FROM colonias WHERE activo = 1');
    _cacheTs = now;
  }
  return _cache;
}

function invalidarCacheColonias() {
  _cache = null;
  _cacheTs = 0;
}

// ── Normalización ─────────────────────────────────────────────────────────────
function normalizar(texto) {
  return (texto || '')
    .toLowerCase()
    .normalize('NFD').replace(/[̀-ͯ]/g, '')
    // Artículo opcional ANTES de prefijo de colonia: "la colonia X" → "X"
    .replace(/^(?:la|el|los|las)\s+(?=col(?:onia)?[\s.]|fracc(?:ionamiento)?[\s.]|residencial\s|unidad\s|privada\s|ampl(?:iacion)?[\s.])/i, '')
    // Prefijos de colonia (incluyendo "col " sin punto)
    .replace(/^(?:col(?:onia)?\.?\s+|fracc(?:ionamiento)?\.?\s+|residencial\s+|unidad\s+|privada\s+|ampl(?:iacion)?\.?\s+)/i, '')
    .trim();
}

// ── Búsqueda con scoring ──────────────────────────────────────────────────────
function buscarColonia(nombre) {
  if (!nombre) return null;
  const norm = normalizar(nombre);
  if (!norm || norm.length < 2) return null;

  const todas = _colonias();

  // 1. Coincidencia exacta
  for (const c of todas) {
    if (normalizar(c.nombre) === norm) return c;
  }

  // 2. Coincidencia parcial con puntaje
  // - cn.includes(norm): cliente escribió fragmento del nombre → puntaje = norm.length / cn.length
  // - norm.includes(cn): cliente escribió más que el nombre → puntaje = cn.length / norm.length
  // Se elige el match con mayor puntaje (más específico). Umbral mínimo 0.4.
  let mejorMatch = null;
  let mejorPuntaje = 0;

  for (const c of todas) {
    const cn = normalizar(c.nombre);
    let puntaje = 0;
    if (cn.includes(norm)) {
      puntaje = norm.length / cn.length;
    } else if (norm.includes(cn)) {
      puntaje = cn.length / norm.length;
    }
    if (puntaje > mejorPuntaje) {
      mejorPuntaje = puntaje;
      mejorMatch = c;
    }
  }

  return mejorPuntaje >= 0.4 ? mejorMatch : null;
}

// ── Cálculo de tarifa ─────────────────────────────────────────────────────────
function calcularTarifaDomicilio(nombreColonia) {
  const fallback   = parseInt(getConfig('domicilio_costo') || '50');
  const negocioLat = parseFloat(getConfig('negocio_lat')  || '0');
  const negocioLon = parseFloat(getConfig('negocio_lon')  || '0');

  if (!negocioLat || !negocioLon) {
    console.warn('[GEO] negocio_lat/negocio_lon no configurados — todos los domicilios usan tarifa plana');
    return { tarifa: fallback, zona: null, distancia: null, encontrada: false, fueraDeCobertura: false };
  }

  const colonia = buscarColonia(nombreColonia);
  if (!colonia) {
    return { tarifa: fallback, zona: null, distancia: null, encontrada: false, fueraDeCobertura: false };
  }

  const distancia = haversine(negocioLat, negocioLon, colonia.lat, colonia.lon);
  const zonas     = queryAll('SELECT * FROM tarifas_zonas ORDER BY distancia_max ASC');

  for (const zona of zonas) {
    if (distancia <= zona.distancia_max) {
      return {
        tarifa:    zona.tarifa,
        zona:      zona.nombre_zona,
        distancia: Math.round(distancia * 10) / 10,
        encontrada: true,
        fueraDeCobertura: false,
      };
    }
  }

  if (zonas.length > 0) {
    const ultima = zonas[zonas.length - 1];
    console.warn(`[GEO] "${nombreColonia}" (${Math.round(distancia * 10) / 10} km) supera zona máxima (${ultima.distancia_max} km) — tarifa máxima aplicada`);
    return {
      tarifa:    ultima.tarifa,
      zona:      ultima.nombre_zona,
      distancia: Math.round(distancia * 10) / 10,
      encontrada: true,
      fueraDeCobertura: true,
    };
  }

  return { tarifa: fallback, zona: null, distancia: Math.round(distancia * 10) / 10, encontrada: false, fueraDeCobertura: false };
}

module.exports = { haversine, buscarColonia, calcularTarifaDomicilio, invalidarCacheColonias };
