'use strict';

/**
 * src/giros/taqueria/nlu.js — NLU específico del giro Taquería
 *
 * Importa utilidades genéricas de src/nlu/core.js y agrega lógica propia:
 *   - Catálogo de cortes (carnitas + asada) con caché TTL
 *   - Fuzzy matching contra ese catálogo
 *   - Parsers de pedido: simple, multi-ítem, mitad-mitad, todo-menos-X
 *   - Detectores: sinCorte, sinTipo, modificacion, preguntasFrecuentes
 *   - Separador de refrescos/salsas del texto de pedido
 *
 * Misma interfaz de exports que el pedidoParser.js original → backward compat.
 */

const core = require('../../nlu/core');
const { getConfig } = require('../../db');

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
let _cortesCache      = null; let _cortesCacheTs      = 0;
let _refrescosCache   = null; let _refrescosCacheTs   = 0;
let _salsasCache      = null; let _salsasCacheTs      = 0;
let _cortesRegexCache = null; let _cortesRegexCacheTs = 0;
const _CORTES_TTL = 60 * 1000;

function invalidarCacheCortes() {
  _cortesCache      = null; _cortesCacheTs      = 0;
  _refrescosCache   = null; _refrescosCacheTs   = 0;
  _salsasCache      = null; _salsasCacheTs      = 0;
  _cortesRegexCache = null; _cortesRegexCacheTs = 0;
  invalidarCacheItemTypes();
  try { require('../../db/cortes').invalidarCacheCortesBD(); } catch (_) {}
}

// ── CATÁLOGO DE CORTES ────────────────────────────────────────────────────────

function _cortesDefault() {
  try {
    const { getGiroActivo } = require('../../giros');
    const giro = getGiroActivo();
    if (giro?.fallbackCortes) return { ...giro.fallbackCortes };
  } catch (_) {}
  return {};
}

function _filtrarPorSeccion(mapa) {
  try {
    const seccion = getConfig('seccion_taqueria') || 'ambas';
    if (seccion === 'ambas') return mapa;
    const { getGiroActivo } = require('../../giros');
    const giro = getGiroActivo();
    if (!giro?.cortes) return mapa;
    const permitidos = new Set(giro.cortes.filter(c => c.seccion === seccion).map(c => c.slug));
    const filtrado = {};
    for (const [alias, slug] of Object.entries(mapa)) {
      if (permitidos.has(slug)) filtrado[alias] = slug;
    }
    return filtrado;
  } catch (_) {
    return mapa;
  }
}

function getCortes() {
  const ahora = Date.now();
  if (_cortesCache && ahora - _cortesCacheTs < _CORTES_TTL) return _cortesCache;
  try {
    const { getCortesBD } = require('../../db');
    const cortesBD = getCortesBD();
    if (cortesBD && Object.keys(cortesBD).length > 0) {
      const mapa = { ...cortesBD };
      _cortesCache   = _filtrarPorSeccion(mapa);
      _cortesCacheTs = Date.now();
      return _cortesCache;
    }
  } catch (_) {}
  _cortesCache = {};
  _cortesCacheTs = Date.now();
  return _cortesCache;
}

function getRefrescos() {
  const ahora = Date.now();
  if (_refrescosCache && ahora - _refrescosCacheTs < _CORTES_TTL) return _refrescosCache;
  try {
    const { getBebidasTenant } = require('../catalogo-tenant');
    _refrescosCache = getBebidasTenant().filter(x => x.activo && x.disponible);
    _refrescosCacheTs = Date.now();
    return _refrescosCache;
  } catch (_) { return []; }
}

function getSalsas() {
  const ahora = Date.now();
  if (_salsasCache && ahora - _salsasCacheTs < _CORTES_TTL) return _salsasCache;
  try {
    const { getSalsasTenant } = require('../catalogo-tenant');
    _salsasCache = getSalsasTenant().filter(x => x.activo && x.disponible);
    _salsasCacheTs = Date.now();
    return _salsasCache;
  } catch (_) { return []; }
}

function getRegexCortes() {
  const cortes   = getCortes();
  const palabras = Object.keys(cortes).sort((a, b) => b.length - a.length).join('|');
  return new RegExp(`(?:de\\s*|\\b)(${palabras})\\b`, 'gi');
}

function getCortesRegex() {
  const ahora = Date.now();
  if (_cortesRegexCache && ahora - _cortesRegexCacheTs < _CORTES_TTL) return _cortesRegexCache;
  const palabras    = Object.keys(getCortes()).sort((a, b) => b.length - a.length).join('|');
  _cortesRegexCache = new RegExp(`\\b(${palabras})\\b`, 'i');
  _cortesRegexCacheTs = ahora;
  return _cortesRegexCache;
}

// ── TEXTO CON PALABRAS DE CORTE ───────────────────────────────────────────────

function textoANumero(texto) {
  return core.textoANumero(texto, [...new Set(Object.values(getCortes()))]);
}

// ── FUZZY MATCHING ────────────────────────────────────────────────────────────

function buscarCorteFuzzy(palabra) {
  palabra = normalizar(String(palabra || '')).trim();
  const cortes = getCortes();
  if (cortes[palabra]) return cortes[palabra];
  if (palabra.length < 4) return null;
  // Los tipos de producto pertenecen al catálogo del Giro y nunca deben
  // reinterpretarse como cortes por similitud (p. ej. "burritos" → "cuero").
  if (detectarTipoItemDesdeTexto(palabra)) return null;
  let mejorCorte = null, mejorDist = Infinity, empate = false;
  for (const [key, val] of Object.entries(cortes)) {
    if (Math.abs(key.length - palabra.length) > 2) continue;
    const dist = levenshtein(palabra, key);
    if (dist < mejorDist) { mejorCorte = val; mejorDist = dist; empate = false; }
    else if (dist === mejorDist && val !== mejorCorte) empate = true;
  }
  return mejorDist <= 2 && !empate ? mejorCorte : null;
}

// ── DETECTORES DE SALSA Y REFRESCO ───────────────────────────────────────────

function detectarSalsa(texto) {
  const salsas = getSalsas();
  if (!salsas.length) return null;
  const t = normalizar(texto);
  if (/\bsal(?:sa)?\s+de\s+la\s+casa\b|\bla\s+que\s+(?:tengan?|haya)\b|\bcualquier\s+salsa\b/i.test(t)) {
    return salsas.map(s => s.nombre);
  }
  const encontradas = [];
  for (const s of salsas) {
    const palabras = [s.nombre, ...(s.sinonimos || '').split(',').map(p => p.trim()).filter(Boolean)];
    for (const p of palabras) {
      if (!p) continue;
      const escaped = normalizar(p).replace(/[.*+?^${}()|[\]\\]/g, '\\$&').replace(/\s+/g, '\\s+');
      const match   = new RegExp(`\\b${escaped}\\b`, 'i').exec(t);
      if (match && !_tieneNegacionAntes(t, match.index)) {
        if (!encontradas.includes(s.nombre)) encontradas.push(s.nombre);
        break;
      }
    }
  }
  return encontradas.length > 0 ? encontradas : null;
}

function detectarRefresco(texto) {
  const refrescos = getRefrescos();
  if (!refrescos.length) return null;
  const t = normalizar(texto);
  for (const ref of refrescos) {
    const palabras = [ref.nombre, ...(ref.sinonimos || '').split(',').map(s => s.trim()).filter(Boolean)];
    for (const p of palabras) {
      if (!p) continue;
      const escaped  = normalizar(p).replace(/[.*+?^${}()|[\]\\]/g, '\\$&').replace(/\s+/g, '\\s+');
      const match    = new RegExp(`\\b${escaped}\\b`, 'i').exec(t);
      if (match && !_tieneNegacionAntes(t, match.index)) {
        const vicinidad = t.slice(Math.max(0, match.index - 30), match.index + match[0].length + 5);
        const mNear     = vicinidad.match(/\b([1-9]\d?)\b/);
        const cantidad  = mNear ? Math.min(parseInt(mNear[1]), 20) : 1;
        return { nombre: ref.nombre, cantidad, precio: ref.precio_taco };
      }
    }
  }
  return null;
}

/**
 * Reconoce complementos canónicos que existen en Giro pero no pueden venderse
 * en WhatsApp por estar deshabilitados por Superadmin o agotados por el tenant.
 * Las negaciones ("sin limón") se excluyen deliberadamente.
 */
function detectarComplementosNoDisponibles(texto) {
  const { getBebidasTenant, getSalsasTenant } = require('../catalogo-tenant');
  const t = normalizar(texto);
  const encontrados = [];
  for (const [categoria, items] of [['refresco', getBebidasTenant()], ['salsa', getSalsasTenant()]]) {
    for (const item of items.filter(x => !x.activo || !x.disponible)) {
      const variantes = [item.nombre, ...(item.sinonimos || '').split(',').map(x => x.trim()).filter(Boolean)];
      for (const variante of variantes) {
        const escaped = normalizar(variante).replace(/[.*+?^${}()|[\]\\]/g, '\\$&').replace(/\s+/g, '\\s+');
        const match = new RegExp(`\\b${escaped}\\b`, 'i').exec(t);
        if (match && !_tieneNegacionAntes(t, match.index)) {
          encontrados.push({ nombre: item.nombre, categoria, agotado: Boolean(item.activo && !item.disponible) });
          break;
        }
      }
    }
  }
  return encontrados;
}

// ── EXTRAER CORTE ─────────────────────────────────────────────────────────────

function extraerCorte(fragmento) {
  const regex   = getRegexCortes();
  const matches = [...fragmento.matchAll(regex)];
  const cortes  = getCortes();

  if (matches.length) {
    const cortesDetectados = [...new Set(matches.map(m => cortes[m[1].toLowerCase()]).filter(Boolean))];
    if (cortesDetectados.length > 0)
      return cortesDetectados.length === 1 ? cortesDetectados[0] : cortesDetectados.join(', ');
  }

  const DESCARTAR = /^(taco|tacos|torta|tortas|gramo|gramos|kilo|kilos|cuarto|medio|mitad|todo|todos|menos|excepto|por|para|favor|quiero|dame|ponme|manda|pesos|solo|unos|como|nada|cada)$/;
  for (const palabra of normalizar(fragmento).split(/\s+/)) {
    if (palabra.length < 4 || DESCARTAR.test(palabra)) continue;
    // Guardia: si la palabra es un item type, no la buscar como corte (falso positivo fuzzy)
    if (detectarTipoItemDesdeTexto(palabra)) continue;
    const corte = buscarCorteFuzzy(palabra);
    if (corte) return corte;
  }
  return null;
}

// ── SISTEMA DE SCORE ──────────────────────────────────────────────────────────

function calcularScore(texto) {
  const t = normalizar(texto);
  let score = 0;

  if (SEÑALES_COMPLEJO.test(t))        score -= 10;
  if (PATRON_DISTRIBUCION.test(texto)) score -= 10;

  if (/\b\d+\b/.test(t))                                   score += 2;
  if (detectarTipoItemDesdeTexto(t))                        score += 2;
  if (/\b\d+\s*g(?:r(?:amos?)?)?\b/.test(t))               score += 2;
  if (MEDIDAS.some(m => m.re.test(t)))                      score += 2;

  const DESCARTAR_SCORE = /^(taco|tacos|torta|tortas|gramo|gramos|kilo|kilos|cuarto|medio|mitad|todo|todos|menos|excepto|por|para|favor|quiero|dame|ponme|manda|pesos|solo|unos|como|nada|cada)$/;
  if (getCortesRegex().test(t)) {
    score += 2;
  } else if (t.split(/\s+/).some(p => p.length >= 4 && !DESCARTAR_SCORE.test(p) && buscarCorteFuzzy(p))) {
    score += 2;
  }

  const partes = dividirEnItems(texto);
  if (partes.length > 1) {
    const partesReales = partes.filter(p => !_FILLER_PART.test(normalizar(p).trim()));
    const todasTienenNumero = partesReales.every(p => /\b\d+\b/.test(normalizar(p)));
    score += todasTienenNumero ? 2 : -2;
  }
  return score;
}

// ── PATRONES DE MODIFICACIÓN ──────────────────────────────────────────────────

const PATRON_QUITAR_UNO    = /quita(?:me|le)?\s+(?:uno|un[ao]?\s+(?:taco|torta))(?:\s+(?:de(?:\s+(?:los?|las?))?\s+)?(\w+))?|quita(?:me|le)?\s+(?:el|la|los|las)(?:\s+de)?\s+(\w+)|b[aá]ja(?:le|me)?\s+uno|saca\s+uno|uno\s+menos(?:\s+(?:de\s+)?(\w+))?|menos\s+uno(?:\s+(?:de\s+)?(\w+))?|un\s+(?:taco|torta)\s+menos(?:\s+(?:de\s+)?(\w+))?|reduce\s+uno/i;
const PATRON_AGREGAR_MAS   = /agrega(?:le|me)?\s+(?:otros?|m[aá]s)\s+(\d+)(?:\s+(?:de\s+)?(\w+))?|(\d+)\s+m[aá]s(?:\s+(?:de\s+)?(\w+))?|(?:ponme|s[úu]mame|a[ñn]ade(?:me)?)\s+(?:(?:otros?|m[aá]s)\s+)?(\d+)(?:\s+(?:de\s+)?(\w+))?|tambi[eé]n\s+(?:quiero|quieres?|pide|agrega|manda)\s+(\d+)(?:\s+(?:de\s+)?(\w+))?/i;
const PATRON_CAMBIAR_CORTE = /cambia(?:me|le)?\s+(?:el|la|los|las)?\s*(\w+)\s+(?:por|a)\s+(\w+)|(?:sin|quita)\s+(\w+)\s+(?:y\s+)?(?:pon|agrega)\s+(\w+)|en\s+(?:lugar|vez)\s+de\s+(?:(?:el|la|los|las)\s+)?(\w+)\s+(?:ponme|quiero|dame|pon)\s+(\w+)|mejor\s+(\w+)\s+(?:que|en\s+lugar\s+de)\s+(?:(?:el|la|los|las)\s+)?(\w+)/i;

function detectarModificacion(texto) {
  const t    = normalizar(texto);
  const tNum = normalizar(textoANumero(t));
  if (PATRON_QUITAR_UNO.test(t)) {
    const mQ      = t.match(PATRON_QUITAR_UNO);
    const corteRaw = (mQ[1] || mQ[2] || mQ[3] || mQ[4] || mQ[5] || '').toLowerCase().trim();
    const corte   = corteRaw ? (getCortes()[corteRaw] || buscarCorteFuzzy(corteRaw) || null) : null;
    return { tipo: 'quitar_uno', corte };
  }
  if (PATRON_AGREGAR_MAS.test(tNum)) {
    const m        = tNum.match(PATRON_AGREGAR_MAS);
    const cantidad = parseInt(m[1] || m[3] || m[5] || m[7] || '1');
    const _corteRaw = (m[2] || m[4] || m[6] || m[8] || '').toLowerCase();
    const _corte   = _corteRaw ? (getCortes()[_corteRaw] || buscarCorteFuzzy(_corteRaw) || null) : null;
    return { tipo: 'agregar_mas', cantidad, corte: _corte };
  }
  if (PATRON_CAMBIAR_CORTE.test(t)) {
    const m      = t.match(PATRON_CAMBIAR_CORTE);
    const cortes = getCortes();
    const rawDe  = normalizar(m[1] || m[3] || m[5] || m[8] || '');
    const rawPor = normalizar(m[2] || m[4] || m[6] || m[7] || '');
    const de     = cortes[rawDe]  || buscarCorteFuzzy(rawDe)  || null;
    const por    = cortes[rawPor] || buscarCorteFuzzy(rawPor) || null;
    if (de && por) return { tipo: 'cambiar_corte', de, por };
  }
  return null;
}

// ── SURTIDO ESPECIAL ──────────────────────────────────────────────────────────

function _aplicarSurtidoEspecial(item) {
  if (!item || !item.corte) return item;
  if (typeof item.corte === 'string' && item.corte.includes(', ')) {
    item.combinacion = item.corte.split(', ').join(' con ');
    item.corte = 'surtido especial';
  }
  return item;
}

// ── PARSEAR ÍTEM ──────────────────────────────────────────────────────────────

function parsearItem(fragmento) {
  const t = normalizar(fragmento);
  const corte = extraerCorte(fragmento);

  const _itPattern = _buildItemTypesPattern();
  const matchPieza = _itPattern ? t.match(new RegExp(`\\b(\\d+)\\s+(${_itPattern})s?\\b`)) : null;
  if (matchPieza) {
    const cantidad      = parseInt(matchPieza[1]);
    const tipoDetectado = detectarTipoItemDesdeTexto(matchPieza[2]);
    const presentacion  = tipoDetectado ? tipoDetectado.slug : matchPieza[2];
    if (tipoDetectado?.soporta_gramos || presentacion === 'gramos') {
      const medida = MEDIDAS.find(m => m.re.test(t));
      const gramos = medida?.gramos ?? cantidad;
      if (!corte) return { _sinCorte: true, presentacion: 'gramos', gramos };
      return { presentacion: 'gramos', gramos, corte };
    }
    if (!corte) return { _sinCorte: true, presentacion, cantidad };
    return { presentacion, cantidad, corte };
  }

  for (const medida of MEDIDAS) {
    if (medida.re.test(t)) {
      if (!corte) return { _sinCorte: true, presentacion: 'gramos', gramos: medida.gramos };
      return { presentacion: 'gramos', gramos: medida.gramos, corte };
    }
  }

  const matchGramos = t.match(/\b(\d+)\s*g(?:r(?:amos?)?)?\b/);
  if (matchGramos) {
    const gramos = parseInt(matchGramos[1]);
    if (!corte) return { _sinCorte: true, presentacion: 'gramos', gramos };
    return { presentacion: 'gramos', gramos, corte };
  }

  const matchMonto = t.match(/\b(\d+)\b/);
  if (matchMonto) {
    const num = parseInt(matchMonto[1]);
    if (num > 40) {
      if (!corte) return { _sinCorte: true, presentacion: 'pesos', monto: num };
      return { presentacion: 'pesos', monto: num, corte };
    }
  }
  return null;
}

function parsearItemHeredado(fragmento, tipoPrevio) {
  const t     = normalizar(fragmento);
  const corte = extraerCorte(fragmento);
  if (!corte) return null;
  const matchNum = t.match(/\b(\d+)\b/);
  if (!matchNum) return null;
  const cantidad = parseInt(matchNum[1]);
  if (cantidad > 40) return { presentacion: 'pesos', monto: cantidad, corte };
  return { presentacion: tipoPrevio, cantidad, corte };
}

// ── PARSERS DE PEDIDO ESPECIALES ──────────────────────────────────────────────

const PATRON_MITAD_CAPTURA = /(?:la\s+)?mitad\s+(?:de\s+)?(\w+)\s+(?:y\s+)?(?:la\s+otra\s+)?mitad\s+(?:de\s+)?(\w+)|medio\s+(\w+)\s+y\s+medio\s+(\w+)/i;

function parsearMitadMitad(texto) {
  const t = normalizar(texto);
  const m = t.match(PATRON_MITAD_CAPTURA);
  if (!m) return null;
  const corte1 = buscarCorteFuzzy(m[1] || m[3]);
  const corte2 = buscarCorteFuzzy(m[2] || m[4]);
  if (!corte1 || !corte2) return null;
  const corteStr = `${corte1}, ${corte2}`;

  const _itPat = _buildItemTypesPattern();
  const matchPieza = _itPat ? t.match(new RegExp(`\\b(\\d+)\\s+(${_itPat})s?\\b`)) : null;
  if (matchPieza) {
    const tipo = detectarTipoItemDesdeTexto(matchPieza[2]);
    return { tipo: 'pedido', items: [_aplicarSurtidoEspecial({ presentacion: tipo ? tipo.slug : matchPieza[2], cantidad: parseInt(matchPieza[1]), corte: corteStr })] };
  }
  for (const medida of MEDIDAS)
    if (medida.re.test(t))
      return { tipo: 'pedido', items: [_aplicarSurtidoEspecial({ presentacion: 'gramos', gramos: medida.gramos, corte: corteStr })] };

  const matchGramos = t.match(/\b(\d+)\s*g(?:r(?:amos?)?)?\b/);
  if (matchGramos)
    return { tipo: 'pedido', items: [_aplicarSurtidoEspecial({ presentacion: 'gramos', gramos: parseInt(matchGramos[1]), corte: corteStr })] };
  return null;
}

const PATRON_TODO_MENOS = /(?:de\s+todo|de\s+todos?\s+(?:los\s+)?cortes?)\s+(?:menos|excepto|sin)\s+(\w+)|surtido\s+(?:pero\s+)?sin\s+(\w+)/i;

function parsearTodoMenosCorte(texto) {
  const t = normalizar(texto);
  const m = t.match(PATRON_TODO_MENOS);
  if (!m) return null;
  const excluido = buscarCorteFuzzy(m[1] || m[2]);
  if (!excluido) return null;
  const todosCortes     = [...new Set(Object.values(getCortes()))].filter(c => c !== 'surtido especial');
  const cortesResultantes = todosCortes.filter(c => c !== excluido);
  if (!cortesResultantes.length) return null;
  const corteStr = cortesResultantes.join(', ');

  const _itPat = _buildItemTypesPattern();
  const matchPieza = _itPat ? t.match(new RegExp(`\\b(\\d+)\\s+(${_itPat})s?\\b`)) : null;
  if (matchPieza) {
    const tipo = detectarTipoItemDesdeTexto(matchPieza[2]);
    return { tipo: 'pedido', items: [_aplicarSurtidoEspecial({ presentacion: tipo ? tipo.slug : matchPieza[2], cantidad: parseInt(matchPieza[1]), corte: corteStr })] };
  }
  for (const medida of MEDIDAS)
    if (medida.re.test(t))
      return { tipo: 'pedido', items: [_aplicarSurtidoEspecial({ presentacion: 'gramos', gramos: medida.gramos, corte: corteStr })] };

  const matchGramos = t.match(/\b(\d+)\s*g(?:r(?:amos?)?)?\b/);
  if (matchGramos)
    return { tipo: 'pedido', items: [_aplicarSurtidoEspecial({ presentacion: 'gramos', gramos: parseInt(matchGramos[1]), corte: corteStr })] };
  return null;
}

function parsearPedidoMultiLinea(texto) {
  const lineas = texto.split(/\n+/).map(l => l.trim()).filter(l => l.length > 2);
  if (lineas.length < 2) return null;
  const items = [];
  for (const linea of lineas) {
    const res = parsearPedidoSimple(linea);
    if (!res || res.tipo !== 'pedido' || !Array.isArray(res.items) || !res.items.length) return null;
    items.push(...res.items);
  }
  return items.length >= 2 ? { tipo: 'pedido', items } : null;
}

// ── PARSER PRINCIPAL ──────────────────────────────────────────────────────────

function parsearPedidoSimple(texto) {
  const mitad = parsearMitadMitad(texto);
  if (mitad) return mitad;

  const todoMenos = parsearTodoMenosCorte(texto);
  if (todoMenos) return todoMenos;

  if (/\n/.test(texto)) {
    const multiLinea = parsearPedidoMultiLinea(texto);
    if (multiLinea) return multiLinea;
  }

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
        items.push(_aplicarSurtidoEspecial(item));
      }
    }
    if (items.length > 0) return { tipo: 'pedido', items };
    return null;
  }

  const corteRaw  = extraerCorte(texto);
  const corteInfo = (corteRaw && corteRaw.includes(', '))
    ? { corte: 'surtido especial', combinacion: corteRaw.split(', ').join(' con ') }
    : { corte: corteRaw };

  const _itPat    = _buildItemTypesPattern();
  const matchPieza = _itPat ? t.match(new RegExp(`\\b(\\d+)\\s+(${_itPat})s?\\b`)) : null;
  if (matchPieza) {
    const cantidad     = parseInt(matchPieza[1]);
    const tipoDetect   = detectarTipoItemDesdeTexto(matchPieza[2]);
    const presentacion = tipoDetect ? tipoDetect.slug : 'taco';
    if (!corteRaw) return null;
    if (tipoDetect?.soporta_gramos || presentacion === 'gramos') {
      const medida = MEDIDAS.find(m => m.re.test(t));
      return { tipo: 'pedido', items: [{ presentacion: 'gramos', gramos: medida?.gramos ?? cantidad, ...corteInfo }] };
    }
    return { tipo: 'pedido', items: [{ presentacion, cantidad, ...corteInfo }] };
  }

  for (const medida of MEDIDAS) {
    if (medida.re.test(t)) {
      if (!corteRaw) return null;
      return { tipo: 'pedido', items: [{ presentacion: 'gramos', gramos: medida.gramos, ...corteInfo }] };
    }
  }

  const matchGramos = t.match(/\b(\d+)\s*g(?:r(?:amos?)?)?\b/);
  if (matchGramos) {
    const gramos = parseInt(matchGramos[1]);
    if (!corteRaw) return null;
    return { tipo: 'pedido', items: [{ presentacion: 'gramos', gramos, ...corteInfo }] };
  }

  const matchMonto = t.match(/\b(\d+)\b/);
  if (matchMonto) {
    const num = parseInt(matchMonto[1]);
    if (num > 40 && corteRaw) return { tipo: 'pedido', items: [{ presentacion: 'pesos', monto: num, ...corteInfo }] };
    if (num <= 100) return null;
  }

  // Fallback: tipo de ítem sin número ("taco de buche") → cantidad implícita 1
  if (corteRaw) {
    const matchTipoSolo = _itPat ? t.match(new RegExp(`\\b(${_itPat})s?\\b`)) : null;
    if (matchTipoSolo) {
      const tipoDetect   = detectarTipoItemDesdeTexto(matchTipoSolo[1]);
      const presentacion = tipoDetect ? tipoDetect.slug : 'taco';
      return { tipo: 'pedido', items: [{ presentacion, cantidad: 1, ...corteInfo }] };
    }
  }
  return null;
}

// ── DETECTAR SIN CORTE ────────────────────────────────────────────────────────

function detectarSinCorte(texto) {
  texto = textoANumero(texto);
  const t = normalizar(texto);
  if (SEÑALES_COMPLEJO.test(t) || PATRON_DISTRIBUCION.test(texto)) return null;
  const partes = dividirEnItems(texto);
  let tieneItemConCorte = false;
  for (const parte of partes) {
    const item = parsearItem(parte);
    if (item && item._sinCorte) return item.presentacion;
    if (item && !item._sinCorte) tieneItemConCorte = true;
  }
  if (tieneItemConCorte) return null;
  // Fallback: tipo mencionado sin número ni corte ("quiero tortas")
  const tipoSolo = detectarTipoItemDesdeTexto(t);
  const corte    = extraerCorte(texto);
  if (tipoSolo && !corte) return tipoSolo.slug;
  return null;
}

// ── DETECTAR SIN TIPO ─────────────────────────────────────────────────────────

function detectarSinTipo(texto) {
  texto = textoANumero(texto);
  const t = normalizar(texto);
  if (SEÑALES_COMPLEJO.test(t) || PATRON_DISTRIBUCION.test(texto)) return null;
  const partes = dividirEnItems(texto);
  const partesReales = partes.filter(p => !_FILLER_PART.test(normalizar(p).trim()));
  if (partesReales.length > 1) return null;
  if (detectarTipoItemDesdeTexto(t)) return null;
  if (MEDIDAS.some(m => m.re.test(t))) return null;
  if (/\b\d+\s*g(?:r(?:amos?)?)?\b/.test(t)) return null;
  const corte = extraerCorte(texto);
  if (!corte) return null;
  const matchNum = t.match(/\b(\d+)\b/);
  if (!matchNum) return null;
  const cantidad = parseInt(matchNum[1]);
  if (cantidad > 40) return null;
  return { cantidad, corte };
}

// ── DISTRIBUCIÓN DE CORTES ────────────────────────────────────────────────────

function parsearDistribucionCortes(texto) {
  const NUMS_TEXTO = { un: 1, una: 1, uno: 1, dos: 2, tres: 3, cuatro: 4 };
  texto = texto.replace(/(\d)([a-zA-ZáéíóúüñÁÉÍÓÚÜÑ])/g, '$1 $2');
  texto = textoANumero(texto);
  const t        = normalizar(texto);
  const CORTES_MAP = getCortes();
  const patron   = /\b(\d+|un[ao]?|dos|tres|cuatro)\s+(?:de\s+)?(\w+)(?:\s+y\s+(?!\d)(\w+))?/gi;
  const matches  = [...t.matchAll(patron)];
  if (matches.length < 2) return null;
  const items = [];
  for (const m of matches) {
    const cantStr  = m[1].toLowerCase();
    const cantidad = parseInt(cantStr) || NUMS_TEXTO[cantStr] || null;
    if (!cantidad) return null;
    const corte1 = CORTES_MAP[m[2].toLowerCase()] || buscarCorteFuzzy(m[2].toLowerCase()) || null;
    if (!corte1) return null;
    const corte2 = m[3] ? (CORTES_MAP[m[3].toLowerCase()] || buscarCorteFuzzy(m[3].toLowerCase()) || null) : null;
    items.push({ cantidad, corte: corte2 ? `${corte1}, ${corte2}` : corte1 });
  }
  return items.length >= 2 ? items : null;
}

// ── DISTRIBUCIÓN DE REFRESCOS ─────────────────────────────────────────────────

function parsearDistribucionRefrescos(texto) {
  const NUMS_TEXTO = { un: 1, una: 1, uno: 1, dos: 2, tres: 3, cuatro: 4 };
  texto = texto.replace(/(\d)([a-zA-ZáéíóúüñÁÉÍÓÚÜÑ])/g, '$1 $2');
  texto = textoANumero(texto);
  const t         = normalizar(texto);
  const refrescos = getRefrescos();
  if (!refrescos.length) return null;
  const encontrados = [];
  for (const ref of refrescos) {
    const palabras = [ref.nombre, ...(ref.sinonimos || '').split(',').map(s => s.trim()).filter(Boolean)];
    for (const p of palabras) {
      if (!p) continue;
      const escaped = normalizar(p).replace(/[.*+?^${}()|[\]\\]/g, '\\$&').replace(/\s+/g, '\\s+');
      const m = t.match(new RegExp(`\\b(\\d+|un[ao]?|dos|tres|cuatro)\\s+(?:refrescos?\\s+)?(?:de\\s+)?${escaped}s?\\b`, 'i'));
      if (m) {
        const cantStr  = m[1].toLowerCase();
        const cantidad = parseInt(cantStr) || NUMS_TEXTO[cantStr] || 1;
        encontrados.push({ nombre: ref.nombre, cantidad, precio: ref.precio_taco });
        break;
      }
    }
  }
  return encontrados.length >= 2 ? encontrados : null;
}

// ── SEPARAR REFRESCO Y SALSA ──────────────────────────────────────────────────

function separarRefresco(texto) {
  texto = texto.replace(/(\d)([a-zA-ZáéíóúüñÁÉÍÓÚÜÑ])/g, '$1 $2');
  const NUMS_TEXTO = { un: 1, una: 1, uno: 1, unos: 1, unas: 1, dos: 2, tres: 3, cuatro: 4 };

  function _limpiar(t) {
    return t.replace(/^\s*[,y]\s*/i, '').replace(/\s{2,}/g, ' ').trim();
  }

  const textNorm    = normalizar(texto);
  let   textoActual = textNorm;

  // Paso 1: refrescos específicos
  const refrescos             = getRefrescos();
  const refrescosEncontrados  = [];
  for (const ref of refrescos) {
    const variantes = [ref.nombre, ...(ref.sinonimos || '').split(',').map(s => s.trim()).filter(Boolean)];
    for (const variante of variantes) {
      if (!variante) continue;
      const varNorm = normalizar(variante);
      const escaped = varNorm.replace(/[.*+?^${}()|[\]\\]/g, '\\$&').replace(/\s+/g, '\\s+');
      if (!new RegExp(`\\b${escaped}s?\\b`).test(textoActual)) continue;
      const mCant   = textoActual.match(new RegExp(`\\b([1-9]\\d?)\\s+${escaped}s?\\b`))
                   || textoActual.match(new RegExp(`\\b([1-9]\\d?)\\s+refrescos?\\s+(?:de\\s+)?${escaped}s?\\b`));
      const cantidad = mCant ? parseInt(mCant[1]) : 1;
      const reRemove = new RegExp(`(?:\\s*(?:,|y|mas|tambien|con|\\+))?\\s*(?:[1-9]\\d?|un[ao]?)?\\s*(?:refrescos?\\s+(?:de\\s+)?)?${escaped}s?\\b`, 'g');
      textoActual = _limpiar(textoActual.replace(reRemove, ''));
      refrescosEncontrados.push({ nombre: ref.nombre, cantidad, precio: ref.precio_taco });
      break;
    }
  }

  // Paso 2: refresco genérico
  if (refrescosEncontrados.length === 0) {
    const mGen = textoActual.match(/\b([1-9]\d?|un[ao]?s?|dos|tres|cuatro)\s+refrescos?\b/);
    if (mGen) {
      const cantStr  = mGen[1];
      const cantidad = /^\d+$/.test(cantStr) ? parseInt(cantStr) : (NUMS_TEXTO[cantStr] || 1);
      const reRemove = new RegExp(`(?:\\s*(?:,|y|mas|tambien|con|\\+))?\\s*(?:[1-9]\\d?|un[ao]?s?|dos|tres|cuatro)?\\s*refrescos?\\b`, 'g');
      textoActual = _limpiar(textoActual.replace(reRemove, ''));
      refrescosEncontrados.push({ nombre: null, cantidad, precio: 0, esGenerico: true });
    }
  }

  // Paso 3: salsas específicas
  const salsasEncontradas = [];
  for (const sal of getSalsas()) {
    const variantes = [sal.nombre, ...(sal.sinonimos || '').split(',').map(s => s.trim()).filter(Boolean)];
    for (const variante of variantes) {
      if (!variante) continue;
      const varNorm = normalizar(variante);
      const escaped = varNorm.replace(/[.*+?^${}()|[\]\\]/g, '\\$&').replace(/\s+/g, '\\s+');
      const matchVariante = new RegExp(`\\b${escaped}s?\\b`).exec(textoActual);
      if (!matchVariante || _tieneNegacionAntes(textoActual, matchVariante.index)) continue;
      const cantPat = '[1-9]\\d?|un[ao]?s?|dos|tres|cuatro';
      const mCant   = textoActual.match(new RegExp(`\\b(${cantPat})\\s+${escaped}s?\\b`))
                   || textoActual.match(new RegExp(`\\b(${cantPat})\\s+salsas?\\s+(?:de\\s+)?${escaped}s?\\b`));
      const cantidad = mCant ? (/^\\d+$/.test(mCant[1]) ? parseInt(mCant[1]) : (NUMS_TEXTO[mCant[1]] || 1)) : 1;
      const reRemove = new RegExp(`(?:\\s*(?:,|y|mas|tambien|con|\\+))?\\s*(?:${cantPat})?\\s*(?:salsas?\\s+(?:de\\s+)?)?${escaped}s?\\b`, 'g');
      textoActual = _limpiar(textoActual.replace(reRemove, ''));
      salsasEncontradas.push({ nombre: sal.nombre, cantidad });
      break;
    }
  }

  // Paso 4: salsa genérica
  if (salsasEncontradas.length === 0) {
    const mSalsa = textoActual.match(/\b([1-9]\d?|un[ao]?s?|dos|tres|cuatro)\s+salsas?(?:\s+extras?)?\b/);
    if (mSalsa) {
      const cantStr  = mSalsa[1];
      const cantidad = /^\d+$/.test(cantStr) ? parseInt(cantStr) : (NUMS_TEXTO[cantStr] || 1);
      const reRemove = new RegExp(`(?:\\s*(?:,|y|mas|tambien|con|\\+))?\\s*(?:[1-9]\\d?|un[ao]?s?|dos|tres|cuatro)?\\s*salsas?(?:\\s+extras?)?\\b`, 'g');
      textoActual = _limpiar(textoActual.replace(reRemove, ''));
      salsasEncontradas.push({ nombre: null, cantidad, esGenerico: true });
    }
  }

  if (refrescosEncontrados.length === 0 && salsasEncontradas.length === 0)
    return { textoLimpio: texto, refrescos: [], salsas: [] };
  return { textoLimpio: textoActual || '', refrescos: refrescosEncontrados, salsas: salsasEncontradas };
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
  {
    const _mTienen = t.match(/\b(?:tienen?|manejan?|hay\s+de|venden?|ofrecen?|cuentan?\s+con)\s+(\w+)/i);
    if (_mTienen) {
      const _word   = _mTienen[1].toLowerCase();
      const _corte  = getCortes()[_word] || buscarCorteFuzzy(_word);
      if (_corte) return { tipo: 'descripcion_corte', producto: _corte };
    }
  }
  if (/ya\s+(?:est[aá][ns]?\s+(?:listo?|lista?|listos?)|qued[oó]\s+(?:listo?|lista?))(?:\s+(?:mi|el|los|las|tu)\s*(?:pedido|tacos?|tortas?|orden))?/i.test(t))
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

  const _mTienenTodas = t.match(/\b(?:tienen?|manejan?|hay\s+de|venden?|ofrecen?|cuentan?\s+con)\s+(\w+)/i);
  if (_mTienenTodas) {
    const _word  = _mTienenTodas[1].toLowerCase();
    const _corte = getCortes()[_word] || buscarCorteFuzzy(_word);
    if (_corte) resultados.push({ tipo: 'descripcion_corte', producto: _corte });
  }

  if (/ya\s+(?:est[aá][ns]?\s+(?:listo?|lista?|listos?)|qued[oó]\s+(?:listo?|lista?))(?:\s+(?:mi|el|los|las|tu)\s*(?:pedido|tacos?|tortas?|orden))?/i.test(t))
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

// ── EXPORTS ───────────────────────────────────────────────────────────────────

module.exports = {
  // Parsing de pedidos
  parsearPedidoSimple,
  detectarSinCorte,
  detectarSinTipo,
  detectarPreguntaFrecuente,
  detectarTodasPreguntasFrecuentes,
  detectarModificacion,
  detectarRepetirPedido,
  calcularScore,
  // Catálogo
  getCortes,
  getRefrescos,
  detectarRefresco,
  getSalsas,
  detectarSalsa,
  detectarComplementosNoDisponibles,
  invalidarCacheCortes,
  // Item types (delegados a core)
  detectarTipoItemDesdeTexto,
  listaItemTypes,
  // Utilidades de texto
  normalizar,
  separarRefresco,
  textoANumero,
  buscarCorteFuzzy,
  parsearDistribucionCortes,
  parsearDistribucionRefrescos,
};
