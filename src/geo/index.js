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

// ── Caché de config geo (TTL 60s) ─────────────────────────────────────────────
let _cfg = null;
let _cfgTs = 0;

function _geoConfig() {
  const now = Date.now();
  if (!_cfg || now - _cfgTs > CACHE_TTL) {
    _cfg = {
      fallback: parseInt(getConfig('domicilio_costo') || '50'),
      lat:      parseFloat(getConfig('negocio_lat')   || '0'),
      lon:      parseFloat(getConfig('negocio_lon')   || '0'),
    };
    _cfgTs = now;
  }
  return _cfg;
}

function invalidarCacheConfig() {
  _cfg = null;
  _cfgTs = 0;
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
    // Puntuación residual al final (coma, punto, punto-y-coma, etc.)
    .replace(/[,;:.!?]+$/, '')
    // Colapsar espacios múltiples
    .replace(/\s{2,}/g, ' ')
    .trim();
}

// Verifica que `needle` aparezca como palabra(s) completa(s) dentro de `haystack`
function _esPalabraEn(haystack, needle) {
  const esc = needle.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
  return new RegExp(`(?:^|\\s)${esc}(?:\\s|$)`).test(haystack);
}

// Retorna todos los strings de búsqueda de una colonia: nombre + aliases normalizados.
function _targets(colonia) {
  let aliases = [];
  try { if (colonia.aliases) aliases = JSON.parse(colonia.aliases); } catch (_) {}
  return [colonia.nombre, ...aliases.filter(Boolean)].map(normalizar).filter(s => s.length >= 2);
}

// ── Búsqueda con scoring ──────────────────────────────────────────────────────
function buscarColonia(nombre) {
  if (!nombre) return null;
  const norm = normalizar(nombre);
  if (!norm || norm.length < 2) return null;

  const todas = _colonias();

  // 1. Coincidencia exacta contra nombre o cualquier alias (normalizado)
  for (const c of todas) {
    if (_targets(c).includes(norm)) return c;
  }

  // 2. Coincidencia por conjunto de palabras — maneja orden diferente y artículos extra.
  //    Se evalúa contra nombre y aliases.
  //    Ej: "fresnos infonavit" → "INFONAVIT los Fresnos".
  //    Solo aplica cuando el input tiene ≥ 2 palabras significativas (> 2 chars).
  const inputWords = new Set(norm.split(/\s+/).filter(w => w.length > 2));
  if (inputWords.size >= 2) {
    let mejorConj  = null;
    let mejorScore = 0;
    let cantConj   = 0;
    for (const c of todas) {
      for (const target of _targets(c)) {
        const cnWords = target.split(/\s+/);
        const cnSet   = new Set(cnWords);
        if ([...inputWords].every(w => cnSet.has(w))) {
          cantConj++;
          const score = inputWords.size / cnWords.length;
          if (score > mejorScore) { mejorScore = score; mejorConj = c; }
          break; // una coincidencia por colonia es suficiente
        }
      }
    }
    if (cantConj === 1 || (cantConj > 1 && mejorScore >= 0.7)) return mejorConj;
  }

  // 3. Coincidencia parcial con puntaje — word-boundary contra nombre y aliases.
  //    Umbral 0.5 normal; excepción: exactamente UN candidato con word-boundary.
  let mejorMatch = null;
  let mejorPuntaje = 0;
  let candidatos = 0;

  for (const c of todas) {
    let maxPuntaje = 0;
    for (const target of _targets(c)) {
      let puntaje = 0;
      if (_esPalabraEn(target, norm)) {
        puntaje = norm.length / target.length;
      } else if (_esPalabraEn(norm, target)) {
        puntaje = target.length / norm.length;
      }
      if (puntaje > maxPuntaje) maxPuntaje = puntaje;
    }
    if (maxPuntaje > 0) candidatos++;
    if (maxPuntaje > mejorPuntaje) {
      mejorPuntaje = maxPuntaje;
      mejorMatch = c;
    }
  }

  return (mejorPuntaje >= 0.5 || (mejorPuntaje > 0 && candidatos === 1)) ? mejorMatch : null;
}

// ── Cálculo de tarifa ─────────────────────────────────────────────────────────
function calcularTarifaDomicilio(nombreColonia) {
  const { fallback, lat: negocioLat, lon: negocioLon } = _geoConfig();

  if (!negocioLat || !negocioLon) {
    console.warn('[GEO] negocio_lat/negocio_lon no configurados — todos los domicilios usan tarifa plana');
    return { tarifa: fallback, zona: null, distancia: null, encontrada: false, fueraDeCobertura: false, coloniaNombre: null };
  }

  const colonia = buscarColonia(nombreColonia);
  if (!colonia) {
    return { tarifa: fallback, zona: null, distancia: null, encontrada: false, fueraDeCobertura: false, coloniaNombre: null };
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
        coloniaNombre: colonia.nombre,
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
      coloniaNombre: colonia.nombre,
    };
  }

  return { tarifa: fallback, zona: null, distancia: Math.round(distancia * 10) / 10, encontrada: false, fueraDeCobertura: false, coloniaNombre: null };
}

module.exports = { haversine, normalizar, buscarColonia, calcularTarifaDomicilio, invalidarCacheColonias, invalidarCacheConfig };
