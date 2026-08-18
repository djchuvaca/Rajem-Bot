const { queryAll } = require('../db/core');
const { getConfig } = require('../db/config');
const diccionarioTepic = require('./geotepic/diccionario_colonias_tepic');

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
      permitirAproximada: getConfig('geo_tarifa_aproximada') === '1',
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
  let s = (texto || '')
    .toLowerCase()
    .normalize('NFD').replace(/[̀-ͯ]/g, '');
  // Números cardinales → dígito (cubre colonias con nombres de fecha)
  s = s
    .replace(/\btreinta\s+y\s+un[ao]?\b/g, '31')
    .replace(/\buno\b/g, '1').replace(/\bdos\b/g, '2').replace(/\btres\b/g, '3')
    .replace(/\bcuatro\b/g, '4').replace(/\bcinco\b/g, '5').replace(/\bseis\b/g, '6')
    .replace(/\bsiete\b/g, '7').replace(/\bocho\b/g, '8').replace(/\bnueve\b/g, '9')
    .replace(/\bdiez\b/g, '10').replace(/\bonce\b/g, '11').replace(/\bdoce\b/g, '12')
    .replace(/\btrece\b/g, '13').replace(/\bcatorce\b/g, '14').replace(/\bquince\b/g, '15')
    .replace(/\bdieciseis\b/g, '16').replace(/\bdiecisiete\b/g, '17').replace(/\bdieciocho\b/g, '18')
    .replace(/\bdiecinueve\b/g, '19').replace(/\bveinte\b/g, '20')
    .replace(/\bveintiuno\b|\bveintiun\b/g, '21').replace(/\bveintidos\b/g, '22')
    .replace(/\bveintitres\b/g, '23').replace(/\bveinticuatro\b/g, '24')
    .replace(/\bveinticinco\b/g, '25').replace(/\bveintiseis\b/g, '26')
    .replace(/\bveintisiete\b/g, '27').replace(/\bveintiocho\b/g, '28')
    .replace(/\bveintinueve\b/g, '29').replace(/\btreinta\b/g, '30');
  return s
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
function _buscarColoniaLegacy(nombre) {
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

function buscarColoniaDetallada(nombre) {
  if (!nombre) return { estado: 'no_encontrada', confianza: 0 };
  const activas = _colonias();
  const localPara = coloniaDiccionario => {
    const targetsDiccionario = [coloniaDiccionario.nombre, coloniaDiccionario.nombreOficial, ...(coloniaDiccionario.alias || [])]
      .map(normalizar).filter(Boolean);
    return activas.find(c => _targets(c).some(t => targetsDiccionario.includes(t))) || null;
  };
  const resultado = diccionarioTepic.buscarColonia(nombre);
  if (resultado.estado === 'encontrada') {
    const local = localPara(resultado.colonia);
    if (local) return { ...resultado, colonia: local };
  }
  if (resultado.estado === 'ambigua') {
    const opcionesActivas = [...new Map((resultado.opciones || [])
      .map(o => localPara(diccionarioTepic.COLONIAS[o.id])).filter(Boolean)
      .map(c => [c.id, c])).values()];
    if (opcionesActivas.length === 1)
      return { estado: 'encontrada', colonia: opcionesActivas[0], confianza: resultado.confianza, metodo: 'ambiguedad_resuelta_por_activacion' };
    if (opcionesActivas.length > 1)
      return { ...resultado, opciones: opcionesActivas.map(c => ({ id: c.geo_tepic_id || c.id, nombre: c.nombre, tipo: c.tipo, codigoPostal: c.codigo_postal })) };
  }
  const legacy = _buscarColoniaLegacy(nombre);
  return legacy
    ? { estado: 'encontrada', colonia: legacy, confianza: 0.8, metodo: 'catalogo_tenant' }
    : { estado: 'no_encontrada', confianza: 0 };
}

function buscarColonia(nombre) {
  const resultado = buscarColoniaDetallada(nombre);
  return resultado.estado === 'encontrada' ? resultado.colonia : null;
}

// ── Cálculo de tarifa ─────────────────────────────────────────────────────────
function calcularTarifaDomicilio(nombreColonia) {
  const { fallback, lat: negocioLat, lon: negocioLon, permitirAproximada } = _geoConfig();

  if (!negocioLat || !negocioLon) {
    console.warn('[GEO] negocio_lat/negocio_lon no configurados — todos los domicilios usan tarifa plana');
    return { tarifa: fallback, zona: null, distancia: null, encontrada: false, fueraDeCobertura: false, coloniaNombre: null };
  }

  const colonia = buscarColonia(nombreColonia);
  if (!colonia) {
    return { tarifa: fallback, zona: null, distancia: null, encontrada: false, fueraDeCobertura: false, coloniaNombre: null };
  }

  if (!colonia.verificada && !permitirAproximada) {
    return { tarifa: fallback, zona: null, distancia: null, encontrada: true, fueraDeCobertura: false,
      coloniaNombre: colonia.nombre, requiereVerificacion: true };
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

module.exports = { haversine, normalizar, buscarColonia, buscarColoniaDetallada, calcularTarifaDomicilio, invalidarCacheColonias, invalidarCacheConfig };
