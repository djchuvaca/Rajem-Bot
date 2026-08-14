'use strict';

/**
 * src/giros/pizzeria/nlu.js — NLU específico del giro Pizzería
 *
 * Implementa la misma interfaz que taqueria/nlu.js adaptada al dominio pizza:
 *   - "corte" = sabor de pizza (hawaiana, pepperoni, mexicana…)
 *   - No soporta mitad-mitad clásica (se gestiona como combo de sabores)
 *   - No soporta venta por gramos/pesos
 */

const core = require('../../nlu/core');

const {
  normalizar,
  _tieneNegacionAntes,
  preprocesarCantidades,
  levenshtein,
  SEÑALES_COMPLEJO,
  PATRON_DISTRIBUCION,
  MEDIDAS,
  _FILLER_PART,
  PATRON_EN_CAMINO,
  PATRON_DESPEDIDA,
  PREGUNTAS_PRECIO,
  PREGUNTAS_HORARIO,
  PREGUNTAS_DOMICILIO,
  PREGUNTAS_MENU,
  PREGUNTAS_UBICACION,
  PREGUNTAS_PAGO,
  PREGUNTAS_TOTAL,
  PREGUNTAS_DESCRIPCION_CORTE,
  _getItemTypesActivos,
  detectarTipoItemDesdeTexto,
  _buildItemTypesPattern,
  listaItemTypes,
  dividirEnItems,
  _subDividirSiTipoEmbebido,
  detectarRepetirPedido,
  invalidarCacheItemTypes,
} = core;

// ── CACHÉ LOCAL ───────────────────────────────────────────────────────────────
let _saboresCache     = null; let _saboresCacheTs     = 0;
let _cortesRegexCache = null; let _cortesRegexCacheTs = 0;
const _CACHE_TTL = 60 * 1000;

function invalidarCacheCortes() {
  _saboresCache     = null; _saboresCacheTs     = 0;
  _cortesRegexCache = null; _cortesRegexCacheTs = 0;
  invalidarCacheItemTypes();
  try { require('../../db/cortes').invalidarCacheCortesBD(); } catch (_) {}
}

// ── CATÁLOGO DE SABORES ───────────────────────────────────────────────────────

function _saboresDefault() {
  try {
    const { getGiroActivo } = require('../../giros');
    const giro = getGiroActivo();
    if (giro?.fallbackCortes) return { ...giro.fallbackCortes };
  } catch (_) {}
  return {};
}

function getCortes() {
  const ahora = Date.now();
  if (_saboresCache && ahora - _saboresCacheTs < _CACHE_TTL) return _saboresCache;
  try {
    const { getCortesBD } = require('../../db');
    const bd = getCortesBD();
    if (bd && Object.keys(bd).length > 0) {
      _saboresCache   = bd;
      _saboresCacheTs = Date.now();
      return _saboresCache;
    }
  } catch (_) {}
  _saboresCache = {};
  _saboresCacheTs = Date.now();
  return _saboresCache;
}

function getRefrescos() {
  return require('../catalogo-tenant').getBebidasTenant().filter(x => x.activo);
}
function getSalsas() {
  return require('../catalogo-tenant').getSalsasTenant().filter(x => x.activo);
}

function getCortesRegex() {
  const ahora = Date.now();
  if (_cortesRegexCache && ahora - _cortesRegexCacheTs < _CACHE_TTL) return _cortesRegexCache;
  const palabras    = Object.keys(getCortes()).sort((a, b) => b.length - a.length).join('|');
  _cortesRegexCache = new RegExp(`\\b(${palabras || '__ninguna__'})\\b`, 'i');
  _cortesRegexCacheTs = ahora;
  return _cortesRegexCache;
}

function getRegexSabores() {
  const palabras = Object.keys(getCortes()).sort((a, b) => b.length - a.length).join('|');
  return new RegExp(`(?:de\\s*|\\b)(${palabras || '__ninguna__'})\\b`, 'gi');
}

function textoANumero(texto) {
  return core.textoANumero(texto, [...new Set(Object.values(getCortes()))]);
}

// ── FUZZY MATCHING ────────────────────────────────────────────────────────────

function buscarCorteFuzzy(palabra) {
  const sabores = getCortes();
  if (sabores[palabra]) return sabores[palabra];
  if (palabra.length < 4) return null;
  let mejor = null, mejorDist = Infinity, empate = false;
  for (const [key, val] of Object.entries(sabores)) {
    if (Math.abs(key.length - palabra.length) > 2) continue;
    const dist = levenshtein(palabra, key);
    if (dist < mejorDist) { mejor = val; mejorDist = dist; empate = false; }
    else if (dist === mejorDist && val !== mejor) empate = true;
  }
  return mejorDist <= 2 && !empate ? mejor : null;
}

// ── EXTRAER SABOR ─────────────────────────────────────────────────────────────

function extraerCorte(fragmento) {
  const regex   = getRegexSabores();
  const matches = [...fragmento.matchAll(regex)];
  const sabores = getCortes();

  if (matches.length) {
    const encontrados = [...new Set(matches.map(m => sabores[m[1].toLowerCase()]).filter(Boolean))];
    if (encontrados.length > 0) return encontrados[0];
  }

  const DESCARTAR = /^(pizza|pizzas|individual|familiar|grande|chica|pequeña|todo|todos|menos|excepto|por|para|favor|quiero|dame|ponme|manda|solo|unos|como|nada|cada)$/;
  for (const palabra of normalizar(fragmento).split(/\s+/)) {
    if (palabra.length < 4 || DESCARTAR.test(palabra)) continue;
    if (detectarTipoItemDesdeTexto(palabra)) continue;
    const sabor = buscarCorteFuzzy(palabra);
    if (sabor) return sabor;
  }
  return null;
}

// ── SCORE ─────────────────────────────────────────────────────────────────────

function calcularScore(texto) {
  const t = normalizar(texto);
  let score = 0;
  if (SEÑALES_COMPLEJO.test(t))        score -= 10;
  if (PATRON_DISTRIBUCION.test(texto)) score -= 10;
  if (/\b\d+\b/.test(t))              score += 2;
  if (detectarTipoItemDesdeTexto(t))  score += 2;
  if (getCortesRegex().test(t)) {
    score += 2;
  } else if (t.split(/\s+/).some(p => p.length >= 4 && buscarCorteFuzzy(p))) {
    score += 2;
  }
  const partes = dividirEnItems(texto);
  if (partes.length > 1) {
    const reales = partes.filter(p => !_FILLER_PART.test(normalizar(p).trim()));
    score += reales.every(p => /\b\d+\b/.test(normalizar(p))) ? 2 : -2;
  }
  return score;
}

// ── PARSEAR ÍTEM ──────────────────────────────────────────────────────────────

function parsearItem(fragmento) {
  const t      = normalizar(fragmento);
  const sabor  = extraerCorte(fragmento);
  const _itPat = _buildItemTypesPattern();

  const matchPieza = _itPat ? t.match(new RegExp(`\\b(\\d+)\\s+(${_itPat})s?\\b`)) : null;
  if (matchPieza) {
    const cantidad     = parseInt(matchPieza[1]);
    const tipoDetectado = detectarTipoItemDesdeTexto(matchPieza[2]);
    const presentacion = tipoDetectado ? tipoDetectado.slug : matchPieza[2];
    if (!sabor) return { _sinCorte: true, presentacion, cantidad };
    return { presentacion, cantidad, corte: sabor };
  }
  return null;
}

function parsearItemHeredado(fragmento, tipoPrevio) {
  const t    = normalizar(fragmento);
  const sabor = extraerCorte(fragmento);
  if (!sabor) return null;
  const matchNum = t.match(/\b(\d+)\b/);
  if (!matchNum) return null;
  return { presentacion: tipoPrevio, cantidad: parseInt(matchNum[1]), corte: sabor };
}

// ── PARSER PRINCIPAL ──────────────────────────────────────────────────────────

function parsearPedidoSimple(texto) {
  texto = textoANumero(preprocesarCantidades(texto));
  const t = normalizar(texto);
  if (SEÑALES_COMPLEJO.test(t) || PATRON_DISTRIBUCION.test(texto)) return null;
  if (calcularScore(texto) < 4) return null;

  const partes = dividirEnItems(texto);

  if (partes.length > 1) {
    const items = [];
    let ultimoTipo = null;
    const _slugsUnidad = new Set(_getItemTypesActivos().filter(it => !it.soporta_gramos && !it.soporta_pesos).map(it => it.slug));
    for (const parte of partes) {
      if (_FILLER_PART.test(normalizar(parte).trim())) continue;
      const subPartes = _subDividirSiTipoEmbebido(parte);
      for (const sub of subPartes) {
        let item = parsearItem(sub);
        if (!item && ultimoTipo) item = parsearItemHeredado(sub, ultimoTipo);
        if (!item || item._sinCorte) return null;
        if (_slugsUnidad.has(item.presentacion)) ultimoTipo = item.presentacion;
        items.push(item);
      }
    }
    if (items.length > 0) return { tipo: 'pedido', items };
    return null;
  }

  const saborRaw  = extraerCorte(texto);
  const _itPat    = _buildItemTypesPattern();
  const matchPieza = _itPat ? t.match(new RegExp(`\\b(\\d+)\\s+(${_itPat})s?\\b`)) : null;

  if (matchPieza) {
    const cantidad     = parseInt(matchPieza[1]);
    const tipoDetect   = detectarTipoItemDesdeTexto(matchPieza[2]);
    const presentacion = tipoDetect ? tipoDetect.slug : 'pizza_individual';
    if (!saborRaw) return null;
    return { tipo: 'pedido', items: [{ presentacion, cantidad, corte: saborRaw }] };
  }

  // Fallback sin número → cantidad 1
  if (saborRaw) {
    const matchTipoSolo = _itPat ? t.match(new RegExp(`\\b(${_itPat})s?\\b`)) : null;
    if (matchTipoSolo) {
      const tipoDetect   = detectarTipoItemDesdeTexto(matchTipoSolo[1]);
      const presentacion = tipoDetect ? tipoDetect.slug : 'pizza_individual';
      return { tipo: 'pedido', items: [{ presentacion, cantidad: 1, corte: saborRaw }] };
    }
  }
  return null;
}

// ── DETECTAR SIN SABOR (≡ sinCorte) ──────────────────────────────────────────

function detectarSinCorte(texto) {
  texto = textoANumero(texto);
  const t = normalizar(texto);
  if (SEÑALES_COMPLEJO.test(t) || PATRON_DISTRIBUCION.test(texto)) return null;
  const partes = dividirEnItems(texto);
  for (const parte of partes) {
    const item = parsearItem(parte);
    if (item && item._sinCorte) return item.presentacion;
  }
  const tipoSolo = detectarTipoItemDesdeTexto(t);
  const sabor    = extraerCorte(texto);
  if (tipoSolo && !sabor) return tipoSolo.slug;
  return null;
}

// ── DETECTAR SIN TIPO ─────────────────────────────────────────────────────────

function detectarSinTipo(texto) {
  texto = textoANumero(texto);
  const t = normalizar(texto);
  if (SEÑALES_COMPLEJO.test(t) || PATRON_DISTRIBUCION.test(texto)) return null;
  const partes = dividirEnItems(texto);
  const reales = partes.filter(p => !_FILLER_PART.test(normalizar(p).trim()));
  if (reales.length > 1) return null;
  if (detectarTipoItemDesdeTexto(t)) return null;
  const sabor = extraerCorte(texto);
  if (!sabor) return null;
  const matchNum = t.match(/\b(\d+)\b/);
  if (!matchNum) return null;
  const cantidad = parseInt(matchNum[1]);
  if (cantidad > 20) return null;
  return { cantidad, corte: sabor };
}

// ── MODIFICACIONES ────────────────────────────────────────────────────────────

const PATRON_QUITAR_UNO  = /quita(?:me|le)?\s+(?:uno|una?\s+pizzas?)(?:\s+(?:de(?:\s+(?:los?|las?))?\s+)?(\w+))?|b[aá]ja(?:le|me)?\s+uno|saca\s+uno|uno\s+menos(?:\s+(?:de\s+)?(\w+))?/i;
const PATRON_AGREGAR_MAS = /agrega(?:le|me)?\s+(?:otras?|m[aá]s)\s+(\d+)(?:\s+(?:de\s+)?(\w+))?|(\d+)\s+m[aá]s(?:\s+(?:de\s+)?(\w+))?|(?:ponme|s[úu]mame)\s+(?:otras?\s+)?(\d+)(?:\s+(?:de\s+)?(\w+))?/i;

function detectarModificacion(texto) {
  const t    = normalizar(texto);
  const tNum = normalizar(textoANumero(t));
  if (PATRON_QUITAR_UNO.test(t)) {
    const mQ      = t.match(PATRON_QUITAR_UNO);
    const saborRaw = (mQ[1] || mQ[2] || '').toLowerCase().trim();
    const corte   = saborRaw ? (getCortes()[saborRaw] || buscarCorteFuzzy(saborRaw) || null) : null;
    return { tipo: 'quitar_uno', corte };
  }
  if (PATRON_AGREGAR_MAS.test(tNum)) {
    const m         = tNum.match(PATRON_AGREGAR_MAS);
    const cantidad  = parseInt(m[1] || m[3] || m[5] || '1');
    const saborRaw  = (m[2] || m[4] || m[6] || '').toLowerCase();
    const corte     = saborRaw ? (getCortes()[saborRaw] || buscarCorteFuzzy(saborRaw) || null) : null;
    return { tipo: 'agregar_mas', cantidad, corte };
  }
  return null;
}

// ── PREGUNTAS FRECUENTES ──────────────────────────────────────────────────────

function detectarPreguntaFrecuente(texto) {
  const t = normalizar(texto);
  if (PATRON_EN_CAMINO.test(t))    return { tipo: 'ya_en_camino' };
  if (PATRON_DESPEDIDA.test(t))    return { tipo: 'despedida' };
  if (PREGUNTAS_TOTAL.test(t))     return { tipo: 'total_parcial' };
  if (PREGUNTAS_DOMICILIO.test(t)) return { tipo: 'domicilio' };
  if (PREGUNTAS_PRECIO.test(t)) {
    const m = t.match(getCortesRegex());
    return { tipo: 'precio', producto: m ? getCortes()[m[1].toLowerCase()] : null };
  }
  if (PREGUNTAS_DESCRIPCION_CORTE.test(t)) {
    const m = t.match(getCortesRegex());
    if (m) return { tipo: 'descripcion_corte', producto: getCortes()[m[1].toLowerCase()] };
  }
  if (/ya\s+(?:est[aá][ns]?\s+(?:listo?|lista?|listos?)|qued[oó]\s+(?:listo?|lista?))/i.test(t))
    return { tipo: 'pedido_listo' };
  if (PREGUNTAS_HORARIO.test(t))   return { tipo: 'horario' };
  if (PREGUNTAS_MENU.test(t))      return { tipo: 'menu' };
  if (PREGUNTAS_UBICACION.test(t)) return { tipo: 'ubicacion' };
  if (PREGUNTAS_PAGO.test(t))      return { tipo: 'metodos_pago' };
  return null;
}

function detectarTodasPreguntasFrecuentes(texto) {
  const t          = normalizar(texto);
  const resultados = [];
  if (PATRON_EN_CAMINO.test(t))    resultados.push({ tipo: 'ya_en_camino' });
  if (PATRON_DESPEDIDA.test(t))    resultados.push({ tipo: 'despedida' });
  if (PREGUNTAS_TOTAL.test(t))     resultados.push({ tipo: 'total_parcial' });
  if (PREGUNTAS_DOMICILIO.test(t)) resultados.push({ tipo: 'domicilio' });
  if (PREGUNTAS_PRECIO.test(t)) {
    const m = t.match(getCortesRegex());
    resultados.push({ tipo: 'precio', producto: m ? getCortes()[m[1].toLowerCase()] : null });
  }
  if (PREGUNTAS_DESCRIPCION_CORTE.test(t)) {
    const m = t.match(getCortesRegex());
    if (m) resultados.push({ tipo: 'descripcion_corte', producto: getCortes()[m[1].toLowerCase()] });
  }
  if (/ya\s+(?:est[aá][ns]?\s+(?:listo?|lista?|listos?)|qued[oó]\s+(?:listo?|lista?))/i.test(t))
    resultados.push({ tipo: 'pedido_listo' });
  if (PREGUNTAS_HORARIO.test(t))   resultados.push({ tipo: 'horario' });
  if (PREGUNTAS_MENU.test(t))      resultados.push({ tipo: 'menu' });
  if (PREGUNTAS_UBICACION.test(t)) resultados.push({ tipo: 'ubicacion' });
  if (PREGUNTAS_PAGO.test(t))      resultados.push({ tipo: 'metodos_pago' });
  const vistos = new Set();
  return resultados.filter(r => {
    const k = r.tipo + (r.producto || '');
    if (vistos.has(k)) return false;
    vistos.add(k);
    return true;
  });
}

// ── STUBS DE INTERFAZ ─────────────────────────────────────────────────────────

function detectarSalsa()               { return null; }
function detectarRefresco()            { return null; }
function separarRefresco(texto)        { return { textoLimpio: texto, refrescos: [], salsas: [] }; }
function parsearDistribucionCortes()   { return null; }
function parsearDistribucionRefrescos(){ return null; }

// ── EXPORTS ───────────────────────────────────────────────────────────────────

module.exports = {
  parsearPedidoSimple,
  detectarSinCorte,
  detectarSinTipo,
  detectarPreguntaFrecuente,
  detectarTodasPreguntasFrecuentes,
  detectarModificacion,
  detectarRepetirPedido,
  calcularScore,
  getCortes,
  getRefrescos,
  detectarRefresco,
  getSalsas,
  detectarSalsa,
  invalidarCacheCortes,
  detectarTipoItemDesdeTexto,
  listaItemTypes,
  normalizar,
  separarRefresco,
  textoANumero,
  buscarCorteFuzzy,
  parsearDistribucionCortes,
  parsearDistribucionRefrescos,
};
