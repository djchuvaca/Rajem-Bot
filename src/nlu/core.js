'use strict';

/**
 * src/nlu/core.js — Utilidades genéricas de NLU
 *
 * Sin conocimiento de dominio: no sabe qué es un corte, una pizza ni una hamburguesa.
 * Seguro de importar desde cualquier giro. Todos los giros comparten estas funciones.
 *
 * Única dependencia de BD: tabla item_types (universal para todos los giros).
 */

const { getItemTypes, invalidarCacheItemTypes } = require('../db');

// ── CACHÉ DE ITEM TYPES ───────────────────────────────────────────────────────
let _itemTypesCache    = null;
let _itemTypesCacheTs  = 0;
const _CACHE_TTL       = 60 * 1000;

function invalidarCacheCore() {
  _itemTypesCache   = null;
  _itemTypesCacheTs = 0;
  try { invalidarCacheItemTypes(); } catch (_) {}
}

// ── ITEM TYPES (BD → genérico) ────────────────────────────────────────────────

function _getItemTypesActivos() {
  const ahora = Date.now();
  if (_itemTypesCache && ahora - _itemTypesCacheTs < _CACHE_TTL) return _itemTypesCache;
  try {
    _itemTypesCache = getItemTypes() || [];
  } catch (_) {
    _itemTypesCache = [];
  }
  _itemTypesCacheTs = ahora;
  return _itemTypesCache;
}

function _getItemTypeAliases(type) {
  try { return JSON.parse(type.aliases_json || '[]'); } catch (_) { return []; }
}

function _getItemTypeWords() {
  const types = _getItemTypesActivos();
  const words = [];
  for (const t of types) {
    words.push(t.slug, t.nombre, t.nombre_plural, ..._getItemTypeAliases(t));
  }
  return [...new Set(words.filter(Boolean))];
}

/**
 * Dado un texto, devuelve el item_type cuyo nombre/alias coincide.
 * Ej: "tacos" → { slug: "taco", nombre: "taco", … }
 */
function detectarTipoItemDesdeTexto(texto) {
  if (!texto) return null;
  const types = _getItemTypesActivos();
  const tNorm = normalizar(texto);
  for (const type of types) {
    const words = [type.slug, type.nombre, type.nombre_plural, ..._getItemTypeAliases(type)].filter(Boolean);
    for (const word of words) {
      const wNorm   = normalizar(word);
      const escaped = wNorm.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
      if (new RegExp(`\\b${escaped}s?\\b`, 'i').test(tNorm)) return type;
    }
  }
  return null;
}

/** Construye el patrón alternativo de todos los item types para usar en RegExp */
function _buildItemTypesPattern() {
  const words = _getItemTypeWords();
  return words
    .sort((a, b) => b.length - a.length)
    .map(w => normalizar(w).replace(/[.*+?^${}()|[\]\\]/g, '\\$&'))
    .join('|');
}

/**
 * String legible para mostrar al cliente: "tacos o tortas"
 * soloUnidad=true excluye tipos por gramos/pesos.
 */
function listaItemTypes(soloUnidad = false) {
  const types = _getItemTypesActivos();
  const filtered = soloUnidad ? types.filter(t => !t.soporta_gramos && !t.soporta_pesos) : types;
  if (filtered.length) return filtered.map(t => t.nombre_plural).join(' o ');
  try {
    const { getGiroActivo } = require('../giros');
    const giro = getGiroActivo();
    if (giro?.itemTypes?.length) {
      const gf = soloUnidad ? giro.itemTypes.filter(t => !t.soporta_gramos && !t.soporta_pesos) : giro.itemTypes;
      return gf.map(t => t.nombre_plural).join(' o ');
    }
  } catch (_) {}
  return '';
}

// ── NORMALIZACIÓN DE TEXTO ────────────────────────────────────────────────────

function normalizar(texto) {
  return texto.trim().toLowerCase().normalize('NFD').replace(/[̀-ͯ]/g, '');
}

/** True si hay una negación ("no", "sin", "menos"…) justo antes del índice dado. */
function _tieneNegacionAntes(texto, posicion) {
  const ventana = texto.slice(Math.max(0, posicion - 50), posicion);
  if (/\bcon\s+(?:\w+\s+){0,1}$/i.test(ventana)) return false;
  return /\b(?:no|sin|menos|excepto)\b(?:\s+\w+){0,4}\s*$/.test(ventana);
}

function preprocesarCantidades(texto) {
  return texto
    .replace(/\by\s+aparte\b/gi, '')
    // Frases distributivas — "de uno en uno", "de a uno", "uno por uno", etc.
    // deben eliminarse antes de que textoANumero convierta "uno" → "1"
    .replace(/\bde\s+un[ao]?\s+en\s+un[ao]?\b/gi, '')
    .replace(/\bde\s+a\s+un[ao]?\b/gi, '')
    .replace(/\bun[ao]?\s+a\s+un[ao]?\b/gi, '')
    .replace(/\bun[ao]?\s+por\s+un[ao]?\b/gi, '')
    .replace(/\bunos?\s+(?=\d)/gi, '')
    .replace(/\bcomo\s+(?=\d)/gi, '')
    .replace(/\bnada\s+m[aá]s\s+(?=\d)/gi, '')
    .replace(/\bsolo?\s+(?=\d)/gi, '')
    .replace(/\btan\s+solo\s+(?=\d)/gi, '');
}

/**
 * Convierte números en texto a dígitos.
 * extraPalabras: lista adicional de palabras que activan "un X" → "1 X" (p.ej. cortes del giro).
 */
function textoANumero(texto, extraPalabras = []) {
  // Compuestos: "treinta y dos" → "32", etc.
  texto = texto.replace(
    /\b(veinte|treinta|cuarenta|cincuenta|sesenta|setenta|ochenta|noventa)\s+y\s+(un[ao]?|dos|tres|cuatro|cinco|seis|siete|ocho|nueve)\b/gi,
    (_, dec, uni) => {
      const D = { veinte:20, treinta:30, cuarenta:40, cincuenta:50, sesenta:60, setenta:70, ochenta:80, noventa:90 };
      const U = { un:1, una:1, uno:1, dos:2, tres:3, cuatro:4, cinco:5, seis:6, siete:7, ocho:8, nueve:9 };
      return String((D[dec.toLowerCase()] || 0) + (U[uni.toLowerCase()] || 0));
    }
  );
  texto = texto
    .replace(/\buna?\s+docena\s+(?:de\s+)?/gi,  '12 ')
    .replace(/\bmedia\s+docena\s+(?:de\s+)?/gi,  '6 ')
    .replace(/\bun\s+par\s+(?:de\s+)?/gi,         '2 ')
    .replace(/\bveintinueve\b/gi,   '29')
    .replace(/\bveintiocho\b/gi,    '28')
    .replace(/\bveintisiete?\b/gi,  '27')
    .replace(/\bveintis[eé]is\b/gi, '26')
    .replace(/\bveinticinco\b/gi,   '25')
    .replace(/\bveinticuatro\b/gi,  '24')
    .replace(/\bveintitr[eé]s\b/gi, '23')
    .replace(/\bveintid[oó]s\b/gi,  '22')
    .replace(/\bveintiun[ao]?\b/gi, '21')
    .replace(/\bveinti[uú]n\b/gi,   '21')
    .replace(/\bdiecinueve\b/gi,    '19')
    .replace(/\bdieciocho\b/gi,     '18')
    .replace(/\bdiecisiete\b/gi,    '17')
    .replace(/\bdiecis[eé]is\b/gi,  '16')
    .replace(/\bnoventa\b/gi,  '90')
    .replace(/\bochenta\b/gi,  '80')
    .replace(/\bsetenta\b/gi,  '70')
    .replace(/\bsesenta\b/gi,  '60')
    .replace(/\bcincuenta\b/gi,'50')
    .replace(/\bcuarenta\b/gi, '40')
    .replace(/\btreinta\b/gi,  '30')
    .replace(/\bveinte\b/gi,   '20')
    .replace(/\bquince\b/gi,   '15')
    .replace(/\bcatorce\b/gi,  '14')
    .replace(/\btrece\b/gi,    '13')
    .replace(/\bdoce\b/gi,     '12')
    .replace(/\bonce\b/gi,     '11')
    .replace(/\bdiez\b/gi,     '10')
    .replace(/\bnueve\b/gi,     '9')
    .replace(/\bocho\b/gi,      '8')
    .replace(/\bsiete\b/gi,     '7')
    .replace(/\bseis\b/gi,      '6')
    .replace(/\bcinco\b/gi,     '5')
    .replace(/\bcuatro\b/gi,    '4')
    .replace(/\btres\b/gi,      '3')
    .replace(/\bdos\b/gi,       '2')
    .replace(/\buno\b/gi,       '1');

  // "un taco", "una torta", "un buche" → "1 taco", "1 torta", "1 buche"
  const palabrasLookahead = [..._getItemTypeWords(), 'kilo', 'cuarto', 'medio', ...extraPalabras];
  const escaped = [...new Set(palabrasLookahead.filter(Boolean))]
    .map(w => w.replace(/[.*+?^${}()|[\]\\]/g, '\\$&'))
    .join('|');
  if (escaped) {
    texto = texto.replace(new RegExp(`\\bun[ao]?\\s+(?=${escaped})`, 'gi'), '1 ');
  }
  return texto;
}

// ── ALGORITMO FUZZY ───────────────────────────────────────────────────────────

function levenshtein(a, b) {
  const m = a.length, n = b.length;
  const dp = Array.from({ length: m + 1 }, (_, i) =>
    Array.from({ length: n + 1 }, (_, j) => (i === 0 ? j : j === 0 ? i : 0))
  );
  for (let i = 1; i <= m; i++)
    for (let j = 1; j <= n; j++)
      dp[i][j] = a[i - 1] === b[j - 1]
        ? dp[i - 1][j - 1]
        : 1 + Math.min(dp[i - 1][j], dp[i][j - 1], dp[i - 1][j - 1]);
  return dp[m][n];
}

// ── SEÑALES Y PATRONES GENÉRICOS ──────────────────────────────────────────────

const SEÑALES_COMPLEJO    = /para\s+ella|para\s+[eé]l|separado|otro\s+plato|en\s+pares|en\s+tr[ií]os|platos?\s+de|cada\s+uno|para\s+cada/i;
const PATRON_DISTRIBUCION = /de\s+\d+\s+en\s+\d+|de\s+a\s+\d+|alternado|uno\s+de\s+cada|intercalado/i;

const MEDIDAS = [
  { re: /\bun\s+cuarto\b|\b1\s+cuarto\b|\b1\/4\b|\b250\s*g/i,                            gramos: 250  },
  { re: /\bmedio\s+kilo\b|\bmedio\b|\b1\/2\s*(?:de\s*)?\w*\b|\b500\s*g/i,                gramos: 500  },
  { re: /\btres\s+cuartos?\b|\b3\s+cuartos?\b|\b3\/4\b|\b750\s*g/i,                      gramos: 750  },
  { re: /\bun\s+kilo\b|\b1\s+kilo\b|\b1\s*kg\b|\b1000\s*g/i,                            gramos: 1000 },
];

// Palabras relleno sin contenido semántico ("dame 200 de carne" → "dame" es filler)
const _FILLER_PART = /^(?:quiero|dame|ponme|para|pues|manda|tambi[eé]n|oye|hola|buenas?|oiga|me\s+da|me\s+pones?|a\s+ver|d[eé]jame|y\s+pues|y\s+bueno)(?:\s+(?:favor|me|pues|por\s+favor|tambi[eé]n|para|por|un[ao]?))*$/i;

const PATRON_LO_MISMO   = /\b(lo\s+mismo(?:\s+de\s+(?:siempre|antes|ayer|antier|la\s+semana\s+pasada))?|igual\s+que\s+(?:la\s+)?(?:vez\s+pasada|[uú]ltima\s+vez)|repite?\s+(?:mi\s+)?pedido|lo\s+de\s+siempre|lo\s+mismo\s+de\s+(?:antes|ayer|antier)|lo\s+anterior|el\s+de\s+ayer|el\s+pedido\s+de\s+(?:ayer|antier)|el\s+de\s+la\s+semana\s+pasada)\b/i;
const PATRON_EN_CAMINO  = /\b(?:ya\s+(?:voy|vengo|andamos|vamos|sal[ií]|estoy\s+(?:en\s+camino|saliendo|yendo|por\s+llegar|cerca))|estoy\s+(?:en\s+camino|por\s+llegar|cerca|llegando)|en\s+camino|ya\s+lleg[uú][eé]|ya\s+llegamos|ya\s+estoy\s+afuera?|ya\s+llegamos|ya\s+andamos)\b/i;
const PATRON_DESPEDIDA  = /^(?:gracias(?:[,.]?\s+(?:hasta\s+(?:luego|pronto|ma[nñ]ana)|nos\s+vemos|bye|adios|adi[oó]s|chao|chau|ciao))?|grax|grac|muchas\s+gracias|muy\s+amable|que\s+les?\s+vaya\s+bien|hasta\s+luego|hasta\s+pronto|nos\s+vemos|buen\s+provecho|adios|adi[oó]s|hasta\s+ma[nñ]ana|chao|chau|bye|ciao)$/i;

// ── PATRONES FAQ (sin conocimiento de dominio) ────────────────────────────────

const PREGUNTAS_PRECIO    = /cu[aá]nto\s+(?:cuesta|vale|est[aá]|cobran|es|salen?|cuestan?)|precio\s+(?:del?|de\s+los?|del?\s+men[uú])?|a\s+(?:c[oó]mo|cu[aá]nto)\s+(?:est[aá]n?|cobran?|venden?|los|las)|tienen?\s+precios?|^precios?$/i;
const PREGUNTAS_HORARIO   = /(?:a\s+qu[eé]\s+hora|cu[aá]ndo)\s+(?:abren?|cierran?|atienden?|llegan?)|qu[eé]\s+hora(?:rio)?|est[aá]n?\s+abiertos?|hasta\s+qu[eé]\s+hora|trabajan?\s+hoy|ya\s+(?:cerraron?|abrieron?|est[aá]n?\s+abiertos?)|abren?\s+(?:hoy|ma[nñ]ana|los\s+\w+|el\s+\w+)|siguen?\s+abiertos?|est[aá]n?\s+trabajando|a[uú]n\s+abren?/i;
const PREGUNTAS_DOMICILIO = /(?:hacen?|tienen?|mandan?|llevan?|reparten?)\s+domicilio|env[ií]o|costo\s+(?:del?|de\s+)?domicilio|cobran?\s+(?:(?:por|de)\s+)?domicilio|cu[aá]nto\s+(?:\w+\s+){0,3}(?:domicilio|env[ií]o)|domicilio\s+(?:gratis|incluido|cuesta|vale)|se\s+tarda|en\s+cu[aá]nto\s+tiempo|cu[aá]nto\s+tiempo|me\s+(?:llegan?|traen?(?:\s+a\s+casa)?)|van\s+hasta\s+\w|llevan?\s+hasta/i;
const PREGUNTAS_MENU      = /qu[eé]\s+(?:tienen?|hay|venden?|ofrecen?|manejan?)|men[uú]|me\s+mandas?\s+(?:el\s+)?men[uú]|me\s+mandas?\s+(?:la\s+)?info/i;
const PREGUNTAS_UBICACION = /d[oó]nde\s+(?:est[aá]n?|quedan?)|direcci[oó]n|ubicaci[oó]n|c[oó]mo\s+llegar/i;
const PREGUNTAS_PAGO      = /(?:c[oó]mo|de\s+qu[eé]\s+forma)\s+(?:pago|puedo\s+pagar|aceptan?)|m[eé]todos?\s+de\s+pago|aceptan?\s+(?:tarjeta|transferencia|efectivo)/i;
const PREGUNTAS_TOTAL     = /cu[aá]nto\s+(?:llevo|voy|me\s+toca|es\s+(?:mi\s+)?total|va\s+(?:mi\s+)?total|va\s+todo|es\s+en\s+total|llevo\s+acumulado|tengo\s+acumulado)|(?:mi\s+)?total\s+(?:hasta\s+ahora|parcial|por\s+favor)|cu[aá]nto\s+es\s+(?:en\s+total|todo|lo\s+que\s+llevo)|cu[aá]nto\s+suma|cu[aá]nto\s+(?:va|asciende|llega)\s+(?:mi\s+)?(?:pedido|total|cuenta)/i;
const PREGUNTAS_DESCRIPCION_CORTE = /qu[eé]\s+(?:es|son|tiene|lleva|contiene)|c[oó]mo\s+(?:es|est[aá]|sabe|queda|se\s+come)|de\s+qu[eé]\s+(?:es|est[aá]\s+hecho|parte)|qu[eé]\s+parte\s+es/i;

// ── DIVIDIR EN ÍTEMS ──────────────────────────────────────────────────────────

function dividirEnItems(texto) {
  const _itPat = _buildItemTypesPattern();
  // Activar split extra solo si el texto arranca con "N tipoItem" — evita romper "quiero 3 tacos"
  const _itReInicio = _itPat ? new RegExp(`^\\d+\\s+(?:${_itPat})s?\\b`, 'i') : null;
  const _addItemSplit = (_itReInicio && _itReInicio.test(texto))
    ? [`\\s+(?=\\d+\\s+(?:${_itPat})s?\\b)`]
    : [];

  const _splitRe = new RegExp(
    [
      String.raw`\n+`,
      String.raw`,\s*(?:y\s+)?`,
      String.raw`\s+m[aá]s\s+(?=\d|\bun[ao]?\b|\bmedio\b)`,
      String.raw`\s+y\s+tambi[eé]n\s+`,
      String.raw`\s+y\s+(?=\d|\bun\b|\bmedio\b|\btres\b|\b1\/)`,
      String.raw`\s+(?=\d+\s+(?:de|del|se)\s+)`,
      ..._addItemSplit,
    ].join('|'),
    'i'
  );

  const partes = texto
    .split(_splitRe)
    .map(p => p.trim().replace(/^(?:y|m[aá]s)\s+/i, ''))
    .filter(Boolean);
  return partes.length > 1 ? partes : [texto];
}

/**
 * Sub-divide un fragmento si contiene un tipo de ítem embebido con número.
 * Ej: "2 de surtido 1 quesadilla de costilla" → ["2 de surtido", "1 quesadilla de costilla"]
 */
function _subDividirSiTipoEmbebido(fragmento) {
  const _itPat = _buildItemTypesPattern();
  if (!_itPat) return [fragmento];
  const re = new RegExp(`\\s+(?=\\d+\\s+(?:${_itPat})s?\\b)`, 'i');
  const partes = fragmento.split(re).map(p => p.trim()).filter(Boolean);
  return partes.length > 1 ? partes : [fragmento];
}

// ── DETECTORES GENÉRICOS ──────────────────────────────────────────────────────

function detectarRepetirPedido(texto) {
  return PATRON_LO_MISMO.test(normalizar(texto));
}

// ── EXPORTS ───────────────────────────────────────────────────────────────────

module.exports = {
  // Cache
  invalidarCacheItemTypes: invalidarCacheCore,
  // Item types (BD → genérico)
  _getItemTypesActivos,
  _getItemTypeAliases,
  _getItemTypeWords,
  detectarTipoItemDesdeTexto,
  _buildItemTypesPattern,
  listaItemTypes,
  // Texto
  normalizar,
  _tieneNegacionAntes,
  preprocesarCantidades,
  textoANumero,
  levenshtein,
  // Señales y patrones
  SEÑALES_COMPLEJO,
  PATRON_DISTRIBUCION,
  MEDIDAS,
  _FILLER_PART,
  PATRON_LO_MISMO,
  PATRON_EN_CAMINO,
  PATRON_DESPEDIDA,
  // Patrones FAQ
  PREGUNTAS_PRECIO,
  PREGUNTAS_HORARIO,
  PREGUNTAS_DOMICILIO,
  PREGUNTAS_MENU,
  PREGUNTAS_UBICACION,
  PREGUNTAS_PAGO,
  PREGUNTAS_TOTAL,
  PREGUNTAS_DESCRIPCION_CORTE,
  // Split
  dividirEnItems,
  _subDividirSiTipoEmbebido,
  // Detectores
  detectarRepetirPedido,
};
