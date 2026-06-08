// src/handlers/pedidoParser.js
// Parser inteligente de pedidos — sin Groq para casos manejables
// Sistema de score para decidir si parsear local o pasar a Groq

const { getConfig, getProductos } = require("../db");

// ── CARGAR CORTES DESDE BD (con fallback) ────────────────────────────────────
let _cortesCache = null;
let _cortesCacheTs = 0;
let _refrescosCache = null;
let _refrescosCacheTs = 0;
let _salsasCache = null;
let _salsasCacheTs = 0;
let _cortesRegexCache = null;
let _cortesRegexCacheTs = 0;
const _CORTES_TTL = 60 * 1000;

function invalidarCacheCortes() {
  _cortesCache = null;
  _cortesCacheTs = 0;
  _refrescosCache = null;
  _refrescosCacheTs = 0;
  _salsasCache = null;
  _salsasCacheTs = 0;
  _cortesRegexCache = null;
  _cortesRegexCacheTs = 0;
}

function getCortes() {
  const ahora = Date.now();
  if (_cortesCache && ahora - _cortesCacheTs < _CORTES_TTL) return _cortesCache;
  try {
    const productos = getProductos();
    if (!productos || !productos.length) return _cortesDefault();
    const mapa = {};
    for (const p of productos) {
      if (p.categoria === "refresco" || p.categoria === "salsa") continue;
      const nombre = p.nombre.toLowerCase().trim();
      mapa[nombre] = nombre;
      // Plural simple: termina en vocal → +s, en consonante → +es
      const plural = /[aeiouáéíóú]$/i.test(nombre) ? nombre + "s" : nombre + "es";
      mapa[plural] = nombre;
      if (p.sinonimos) {
        for (const s of p.sinonimos.split(",").map(s => s.trim().toLowerCase()).filter(Boolean)) {
          mapa[s] = nombre;
        }
      }
    }
    _cortesCache = mapa;
    _cortesCacheTs = Date.now();
    return mapa;
  } catch (e) { return _cortesDefault(); }
}

function getRefrescos() {
  const ahora = Date.now();
  if (_refrescosCache && ahora - _refrescosCacheTs < _CORTES_TTL) return _refrescosCache;
  try {
    const productos = getProductos();
    _refrescosCache = (productos || []).filter(p => p.categoria === "refresco");
    _refrescosCacheTs = Date.now();
    return _refrescosCache;
  } catch (e) { return []; }
}

function getSalsas() {
  const ahora = Date.now();
  if (_salsasCache && ahora - _salsasCacheTs < _CORTES_TTL) return _salsasCache;
  try {
    const productos = getProductos();
    _salsasCache = (productos || []).filter(p => p.categoria === "salsa");
    _salsasCacheTs = Date.now();
    return _salsasCache;
  } catch (e) { return []; }
}

function detectarSalsa(texto) {
  const salsas = getSalsas();
  if (!salsas.length) return null;
  const t = normalizar(texto);
  // "salsa de la casa" / "la que tengan" → todas las salsas disponibles
  if (/\bsal(?:sa)?\s+de\s+la\s+casa\b|\bla\s+que\s+(?:tengan?|haya)\b|\bcualquier\s+salsa\b/i.test(t)) {
    return salsas.map(s => s.nombre);
  }
  const encontradas = [];
  for (const s of salsas) {
    const palabras = [s.nombre, ...(s.sinonimos || "").split(",").map(p => p.trim()).filter(Boolean)];
    for (const p of palabras) {
      if (!p) continue;
      const escaped = normalizar(p).replace(/[.*+?^${}()|[\]\\]/g, "\\$&").replace(/\s+/g, "\\s+");
      const match = new RegExp(`\\b${escaped}\\b`, "i").exec(t);
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
    const palabras = [ref.nombre, ...(ref.sinonimos || "").split(",").map(s => s.trim()).filter(Boolean)];
    for (const p of palabras) {
      if (!p) continue;
      const escaped = normalizar(p).replace(/[.*+?^${}()|[\]\\]/g, "\\$&").replace(/\s+/g, "\\s+");
      const match = new RegExp(`\\b${escaped}\\b`, "i").exec(t);
      if (match && !_tieneNegacionAntes(t, match.index)) {
        // Buscar el número más cercano al refresco (hasta 30 chars antes)
        const vicinidad = t.slice(Math.max(0, match.index - 30), match.index + match[0].length + 5);
        const mNear = vicinidad.match(/\b([1-9]\d?)\b/);
        const cantidad = mNear ? Math.min(parseInt(mNear[1]), 20) : 1;
        return { nombre: ref.nombre, cantidad, precio: ref.precio_taco };
      }
    }
  }
  return null;
}

function _cortesDefault() {
  return {
    surtido: "surtido", surtida: "surtido", surtidos: "surtido", mixto: "surtido", mixta: "surtido",
    carne: "carne", carnes: "carne", carner: "carne", masiza: "carne", maciza: "carne", carnita: "carne", carnitas: "carne",
    buche: "buche", buches: "buche", buchito: "buche", buchon: "buche", buchones: "buche",
    cuero: "cuero", cueros: "cuero", cueritos: "cuero", cuerito: "cuero",
    lengua: "lengua", lenguas: "lengua", lenguita: "lengua", lenguitas: "lengua",
  };
}

function getRegexCortes() {
  const cortes = getCortes();
  const palabras = Object.keys(cortes).join("|");
  return new RegExp(`(?:de\\s*|\\b)(${palabras})\\b`, "gi");
}

// ── FRACCIONES Y MEDIDAS CONOCIDAS ────────────────────────────────────────────
const MEDIDAS = [
  { re: /\bun\s+cuarto\b|\b1\s+cuarto\b|\b1\/4\b|\b250\s*g/i,                            gramos: 250  },
  { re: /\bmedio\s+kilo\b|\bmedio\b|\b1\/2\s*(?:de\s*)?\w*\b|\b500\s*g/i,                gramos: 500  },
  { re: /\btres\s+cuartos?\b|\b3\s+cuartos?\b|\b3\/4\b|\b750\s*g/i,                      gramos: 750  },
  { re: /\bun\s+kilo\b|\b1\s+kilo\b|\b1\s*kg\b|\b1000\s*g/i,                            gramos: 1000 },
];

// ── SEÑALES DE COMPLEJIDAD → GROQ ─────────────────────────────────────────────
const SEÑALES_GROQ        = /para\s+ella|para\s+[eé]l|separado|otro\s+plato|en\s+pares|en\s+tr[ií]os|platos?\s+de|cada\s+uno|para\s+cada/i;
const PATRON_DISTRIBUCION = /de\s+\d+\s+en\s+\d+|de\s+a\s+\d+|alternado|uno\s+de\s+cada|intercalado/i;

// ── PATRONES DE MODIFICACIÓN ──────────────────────────────────────────────────
const PATRON_QUITAR_UNO    = /quita(?:me|le)?\s+(?:uno|un[ao]?\s+(?:taco|torta))(?:\s+(?:de(?:\s+(?:los?|las?))?\s+)?(\w+))?|b[aá]ja(?:le|me)?\s+uno|saca\s+uno|uno\s+menos(?:\s+(?:de\s+)?(\w+))?|menos\s+uno(?:\s+(?:de\s+)?(\w+))?|un\s+(?:taco|torta)\s+menos(?:\s+(?:de\s+)?(\w+))?|reduce\s+uno/i;
const PATRON_AGREGAR_MAS   = /agrega(?:le|me)?\s+(?:otros?|m[aá]s)\s+(\d+)(?:\s+(?:de\s+)?(\w+))?|(\d+)\s+m[aá]s(?:\s+(?:de\s+)?(\w+))?|(?:ponme|s[úu]mame|a[ñn]ade(?:me)?)\s+(?:(?:otros?|m[aá]s)\s+)?(\d+)(?:\s+(?:de\s+)?(\w+))?|tambi[eé]n\s+(?:quiero|quieres?|pide|agrega|manda)\s+(\d+)(?:\s+(?:de\s+)?(\w+))?/i;
const PATRON_CAMBIAR_CORTE = /cambia(?:me|le)?\s+(?:el|la|los|las)?\s*(\w+)\s+(?:por|a)\s+(\w+)|(?:sin|quita)\s+(\w+)\s+(?:y\s+)?(?:pon|agrega)\s+(\w+)|en\s+(?:lugar|vez)\s+de\s+(?:(?:el|la|los|las)\s+)?(\w+)\s+(?:ponme|quiero|dame|pon)\s+(\w+)|mejor\s+(\w+)\s+(?:que|en\s+lugar\s+de)\s+(?:(?:el|la|los|las)\s+)?(\w+)/i;

// ── PREGUNTAS FRECUENTES ──────────────────────────────────────────────────────
const PREGUNTAS_PRECIO    = /cu[aá]nto\s+(?:cuesta|vale|est[aá]|cobran|es|salen?|cuestan?)|precio\s+(?:del?|de\s+los?|del?\s+men[uú])?|a\s+(?:c[oó]mo|cu[aá]nto)\s+(?:est[aá]n?|cobran?|venden?|los|las)|tienen?\s+precios?|^precios?$/i;
const PREGUNTAS_HORARIO   = /(?:a\s+qu[eé]\s+hora|cu[aá]ndo)\s+(?:abren?|cierran?|atienden?|llegan?)|qu[eé]\s+hora(?:rio)?|est[aá]n?\s+abiertos?|hasta\s+qu[eé]\s+hora|trabajan?\s+hoy|ya\s+(?:cerraron?|abrieron?|est[aá]n?\s+abiertos?)|abren?\s+(?:hoy|ma[nñ]ana|los\s+\w+|el\s+\w+)|siguen?\s+abiertos?|est[aá]n?\s+trabajando|a[uú]n\s+abren?/i;
const PREGUNTAS_DOMICILIO = /(?:hacen?|tienen?|mandan?|llevan?|reparten?)\s+domicilio|env[ií]o|costo\s+(?:del?|de\s+)?domicilio|cobran?\s+(?:(?:por|de)\s+)?domicilio|cu[aá]nto\s+(?:\w+\s+){0,3}(?:domicilio|env[ií]o)|domicilio\s+(?:gratis|incluido|cuesta|vale)|se\s+tarda|en\s+cu[aá]nto\s+tiempo|cu[aá]nto\s+tiempo|me\s+(?:llegan?|traen?(?:\s+a\s+casa)?)|van\s+hasta\s+\w|llevan?\s+hasta/i;
const PREGUNTAS_MENU      = /qu[eé]\s+(?:tienen?|hay|venden?|ofrecen?|manejan?)|men[uú]|me\s+mandas?\s+(?:el\s+)?men[uú]|me\s+mandas?\s+(?:la\s+)?info/i;
const PREGUNTAS_UBICACION = /d[oó]nde\s+(?:est[aá]n?|quedan?)|direcci[oó]n|ubicaci[oó]n|c[oó]mo\s+llegar/i;
const PREGUNTAS_PAGO      = /(?:c[oó]mo|de\s+qu[eé]\s+forma)\s+(?:pago|puedo\s+pagar|aceptan?)|m[eé]todos?\s+de\s+pago|aceptan?\s+(?:tarjeta|transferencia|efectivo)/i;
const PREGUNTAS_TOTAL     = /cu[aá]nto\s+(?:llevo|voy|me\s+toca|es\s+(?:mi\s+)?total|va\s+(?:mi\s+)?total|va\s+todo|es\s+en\s+total|llevo\s+acumulado|tengo\s+acumulado)|(?:mi\s+)?total\s+(?:hasta\s+ahora|parcial|por\s+favor)|cu[aá]nto\s+es\s+(?:en\s+total|todo|lo\s+que\s+llevo)|cu[aá]nto\s+suma|cu[aá]nto\s+(?:va|asciende|llega)\s+(?:mi\s+)?(?:pedido|total|cuenta)/i;
const PATRON_EN_CAMINO    = /\b(?:ya\s+(?:voy|vengo|andamos|vamos|sal[ií]|estoy\s+(?:en\s+camino|saliendo|yendo|por\s+llegar|cerca))|estoy\s+(?:en\s+camino|por\s+llegar|cerca|llegando)|en\s+camino|ya\s+lleg[uú][eé]|ya\s+llegamos|ya\s+estoy\s+afuera?|ya\s+llegamos|ya\s+andamos)\b/i;
const PATRON_DESPEDIDA    = /^(?:gracias|grax|grac|muchas\s+gracias|muy\s+amable|que\s+les?\s+vaya\s+bien|hasta\s+luego|hasta\s+pronto|nos\s+vemos|buen\s+provecho|adios|adi[oó]s|hasta\s+ma[nñ]ana|chao|chau|bye|ciao)$/i;

// Detecta preguntas sobre qué es un corte específico ("¿qué es el buche?")
const PREGUNTAS_DESCRIPCION_CORTE = /qu[eé]\s+(?:es|son|tiene|lleva|contiene)|c[oó]mo\s+(?:es|est[aá]|sabe|queda|se\s+come)|de\s+qu[eé]\s+(?:es|est[aá]\s+hecho|parte)|qu[eé]\s+parte\s+es/i;

// ── NORMALIZAR ────────────────────────────────────────────────────────────────
function normalizar(texto) {
  return texto.trim().toLowerCase().normalize("NFD").replace(/[̀-ͯ]/g, "");
}

// Devuelve true si hay una negación ("no", "sin", "menos"…) justo antes del índice dado.
// No cuenta como negación si el producto va directamente después de "con".
function _tieneNegacionAntes(texto, posicion) {
  const ventana = texto.slice(Math.max(0, posicion - 50), posicion);
  if (/\bcon\s+(?:\w+\s+){0,1}$/i.test(ventana)) return false;
  return /\b(?:no|sin|menos|excepto)\b(?:\s+\w+){0,4}\s*$/.test(ventana);
}

// ── MEJORA 3: PREPROCESAR CANTIDADES INFORMALES ───────────────────────────────
function preprocesarCantidades(texto) {
  return texto
    .replace(/\by\s+aparte\b/gi, "")
    .replace(/\bunos?\s+(?=\d)/gi, "")
    .replace(/\bcomo\s+(?=\d)/gi, "")
    .replace(/\bnada\s+m[aá]s\s+(?=\d)/gi, "")
    .replace(/\bsolo?\s+(?=\d)/gi, "")
    .replace(/\btan\s+solo\s+(?=\d)/gi, "");
}

// ── MEJORA 5 (nueva): CONVERSIÓN DE NÚMEROS EN TEXTO A DÍGITOS ───────────────
// Permite que "tres tacos de carne" funcione igual que "3 tacos de carne".
function textoANumero(texto) {
  // Compuestos: "treinta y dos" → "32", "veinte y uno" → "21"
  texto = texto.replace(
    /\b(veinte|treinta|cuarenta|cincuenta|sesenta|setenta|ochenta|noventa)\s+y\s+(un[ao]?|dos|tres|cuatro|cinco|seis|siete|ocho|nueve)\b/gi,
    (_, dec, uni) => {
      const D = { veinte:20, treinta:30, cuarenta:40, cincuenta:50, sesenta:60, setenta:70, ochenta:80, noventa:90 };
      const U = { un:1,una:1,uno:1,dos:2,tres:3,cuatro:4,cinco:5,seis:6,siete:7,ocho:8,nueve:9 };
      return String((D[dec.toLowerCase()]||0) + (U[uni.toLowerCase()]||0));
    }
  );
  return texto
    .replace(/\buna?\s+docena\s+(?:de\s+)?/gi, "12 ")
    .replace(/\bmedia\s+docena\s+(?:de\s+)?/gi,  "6 ")
    .replace(/\bun\s+par\s+(?:de\s+)?/gi,         "2 ")
    // Compuestos 21-29 (antes que "veinte" para no cortar a mitad)
    .replace(/\bveintinueve\b/gi,   "29")
    .replace(/\bveintiocho\b/gi,    "28")
    .replace(/\bveintisiete?\b/gi,  "27")
    .replace(/\bveintis[eé]is\b/gi, "26")
    .replace(/\bveinticinco\b/gi,   "25")
    .replace(/\bveinticuatro\b/gi,  "24")
    .replace(/\bveintitr[eé]s\b/gi, "23")
    .replace(/\bveintid[oó]s\b/gi,  "22")
    .replace(/\bveintiun[ao]?\b/gi, "21")
    .replace(/\bveinti[uú]n\b/gi,   "21")
    // Compuestos 16-19 (antes que "diez" y "seis"/"siete"/etc.)
    .replace(/\bdiecinueve\b/gi,    "19")
    .replace(/\bdieciocho\b/gi,     "18")
    .replace(/\bdiecisiete\b/gi,    "17")
    .replace(/\bdiecis[eé]is\b/gi,  "16")
    .replace(/\bnoventa\b/gi,  "90")
    .replace(/\bochenta\b/gi,  "80")
    .replace(/\bsetenta\b/gi,  "70")
    .replace(/\bsesenta\b/gi,  "60")
    .replace(/\bcincuenta\b/gi,"50")
    .replace(/\bcuarenta\b/gi, "40")
    .replace(/\btreinta\b/gi,  "30")
    .replace(/\bveinte\b/gi,   "20")
    .replace(/\bquince\b/gi,   "15")
    .replace(/\bcatorce\b/gi,  "14")
    .replace(/\btrece\b/gi,    "13")
    .replace(/\bdoce\b/gi,     "12")
    .replace(/\bonce\b/gi,     "11")
    .replace(/\bdiez\b/gi,     "10")
    .replace(/\bnueve\b/gi,     "9")
    .replace(/\bocho\b/gi,      "8")
    .replace(/\bsiete\b/gi,     "7")
    .replace(/\bseis\b/gi,      "6")
    .replace(/\bcinco\b/gi,     "5")
    .replace(/\bcuatro\b/gi,    "4")
    .replace(/\btres\b/gi,      "3")
    .replace(/\bdos\b/gi,       "2")
    .replace(/\buno\b/gi,       "1")
    .replace(new RegExp(`\\bun[ao]?\\s+(?=taco|torta|kilo|cuarto|medio|${[...new Set(Object.values(getCortes()))].join("|")})`, "gi"), "1 ");
}

// ── MEJORA 2: FUZZY MATCHING PARA CORTES ─────────────────────────────────────
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

function buscarCorteFuzzy(palabra) {
  const cortes = getCortes();
  if (cortes[palabra]) return cortes[palabra];
  if (palabra.length < 4) return null;
  let mejorCorte = null, mejorDist = Infinity, empate = false;
  for (const [key, val] of Object.entries(cortes)) {
    if (Math.abs(key.length - palabra.length) > 2) continue;
    const dist = levenshtein(palabra, key);
    if (dist < mejorDist) { mejorCorte = val; mejorDist = dist; empate = false; }
    else if (dist === mejorDist && val !== mejorCorte) empate = true;
  }
  return mejorDist <= 2 && !empate ? mejorCorte : null;
}

// ── CACHÉ DE REGEX DE CORTES ──────────────────────────────────────────────────
function getCortesRegex() {
  const ahora = Date.now();
  if (_cortesRegexCache && ahora - _cortesRegexCacheTs < _CORTES_TTL) return _cortesRegexCache;
  const palabras = Object.keys(getCortes()).join("|");
  _cortesRegexCache = new RegExp(`\\b(${palabras})\\b`, "i");
  _cortesRegexCacheTs = Date.now();
  return _cortesRegexCache;
}

// ── SISTEMA DE SCORE ──────────────────────────────────────────────────────────
function calcularScore(texto) {
  const t = normalizar(texto);
  let score = 0;

  if (SEÑALES_GROQ.test(t))            score -= 10;
  if (PATRON_DISTRIBUCION.test(texto)) score -= 10;

  if (/\b\d+\b/.test(t))                          score += 2;
  if (/\b(tacos?|tortas?)\b/.test(t))              score += 2;
  if (/\b\d+\s*g(?:ramos?)?\b/.test(t))            score += 2;
  if (MEDIDAS.some(m => m.re.test(t)))             score += 2;

  const DESCARTAR_SCORE = /^(taco|tacos|torta|tortas|gramo|gramos|kilo|kilos|cuarto|medio|mitad|todo|todos|menos|excepto|por|para|favor|quiero|dame|ponme|manda|pesos|solo|unos|como|nada|cada)$/;
  if (getCortesRegex().test(t)) {
    score += 2;
  } else if (t.split(/\s+/).some(p => p.length >= 4 && !DESCARTAR_SCORE.test(p) && buscarCorteFuzzy(p))) {
    score += 2;
  }

  const partes = dividirEnItems(texto);
  if (partes.length > 1) {
    const todasTienenNumero = partes.every(p => /\b\d+\b/.test(normalizar(p)));
    score += todasTienenNumero ? 2 : -2;
  }

  return score;
}

// ── EXTRAER CORTE(S) ──────────────────────────────────────────────────────────
function extraerCorte(fragmento) {
  const regex = getRegexCortes();
  const matches = [...fragmento.matchAll(regex)];
  const cortes = getCortes();

  if (matches.length) {
    const cortesDetectados = [...new Set(matches.map(m => cortes[m[1].toLowerCase()]).filter(Boolean))];
    if (cortesDetectados.length > 0)
      return cortesDetectados.length === 1 ? cortesDetectados[0] : cortesDetectados.join(", ");
  }

  const DESCARTAR = /^(taco|tacos|torta|tortas|gramo|gramos|kilo|kilos|cuarto|medio|mitad|todo|todos|menos|excepto|por|para|favor|quiero|dame|ponme|manda|pesos|solo|unos|como|nada|cada)$/;
  for (const palabra of normalizar(fragmento).split(/\s+/)) {
    if (palabra.length < 4 || DESCARTAR.test(palabra)) continue;
    const corte = buscarCorteFuzzy(palabra);
    if (corte) return corte;
  }

  return null;
}

// ── DIVIDIR EN ÍTEMS ──────────────────────────────────────────────────────────
function dividirEnItems(texto) {
  const partes = texto
    .split(/\n+|,\s*(?:y\s+)?|\s+m[aá]s\s+(?=\d|\bun[ao]?\b|\bmedio\b)|\s+y\s+tambi[eé]n\s+|\s+y\s+(?=\d|\bun\b|\bmedio\b|\btres\b|\b1\/)|\s+(?=\d+\s+(?:de|del|se)\s+)/i)
    .map(p => p.trim().replace(/^(?:y|m[aá]s)\s+/i, ""))
    .filter(Boolean);
  return partes.length > 1 ? partes : [texto];
}

function parsearItemHeredado(fragmento, tipoPrevio) {
  const t = normalizar(fragmento);
  const corte = extraerCorte(fragmento);
  if (!corte) return null;
  const matchNum = t.match(/\b(\d+)\b/);
  if (!matchNum) return null;
  const cantidad = parseInt(matchNum[1]);
  if (cantidad > 40) return { presentacion: "pesos", monto: cantidad, corte };
  return { presentacion: tipoPrevio, cantidad, corte };
}

// ── PARSEAR UN ÍTEM ───────────────────────────────────────────────────────────
function parsearItem(fragmento) {
  const t = normalizar(fragmento);
  const corte = extraerCorte(fragmento);

  const matchPieza = t.match(/\b(\d+)\s+(tacos?|tortas?)\b/);
  if (matchPieza) {
    const cantidad = parseInt(matchPieza[1]);
    const tipo = /taco/i.test(matchPieza[2]) ? "taco" : "torta";
    if (!corte) return { _sinCorte: true, presentacion: tipo, cantidad };
    return { presentacion: tipo, cantidad, corte };
  }

  for (const medida of MEDIDAS) {
    if (medida.re.test(t)) {
      if (!corte) return { _sinCorte: true, presentacion: "gramos", gramos: medida.gramos };
      return { presentacion: "gramos", gramos: medida.gramos, corte };
    }
  }

  const matchGramos = t.match(/\b(\d+)\s*g(?:ramos?)?\b/);
  if (matchGramos) {
    const gramos = parseInt(matchGramos[1]);
    if (!corte) return { _sinCorte: true, presentacion: "gramos", gramos };
    return { presentacion: "gramos", gramos, corte };
  }

  const matchMonto = t.match(/\b(\d+)\b/);
  if (matchMonto) {
    const num = parseInt(matchMonto[1]);
    if (num > 40) {
      if (!corte) return { _sinCorte: true, presentacion: "pesos", monto: num };
      return { presentacion: "pesos", monto: num, corte };
    }
  }

  return null;
}

// ── DETECTAR SIN CORTE ────────────────────────────────────────────────────────
function detectarSinCorte(texto) {
  texto = textoANumero(texto);
  const t = normalizar(texto);
  if (SEÑALES_GROQ.test(t) || PATRON_DISTRIBUCION.test(texto)) return null;
  const partes = dividirEnItems(texto);
  for (const parte of partes) {
    const item = parsearItem(parte);
    if (item && item._sinCorte) return item.presentacion;
  }
  return null;
}

// ── DETECTAR PREGUNTA FRECUENTE ───────────────────────────────────────────────
function detectarPreguntaFrecuente(texto) {
  const t = normalizar(texto);
  // Intents contextuales simples (no necesitan lógica de negocio)
  if (PATRON_EN_CAMINO.test(t))  return { tipo: "ya_en_camino" };
  if (PATRON_DESPEDIDA.test(t))  return { tipo: "despedida" };
  if (PREGUNTAS_TOTAL.test(t))   return { tipo: "total_parcial" };
  if (PREGUNTAS_DOMICILIO.test(t)) return { tipo: "domicilio" };
  if (PREGUNTAS_PRECIO.test(t)) {
    const m = t.match(getCortesRegex());
    return { tipo: "precio", producto: m ? getCortes()[m[1].toLowerCase()] : null };
  }
  // Descripción de corte debe ir antes de menú para que "¿qué es el buche?" no sea capturado como menú
  if (PREGUNTAS_DESCRIPCION_CORTE.test(t)) {
    const m = t.match(getCortesRegex());
    if (m) return { tipo: "descripcion_corte", producto: getCortes()[m[1].toLowerCase()] };
  }
  // "¿Tienen buche?", "¿Manejan lengua?", "¿Hay cuero?" con corte conocido
  {
    const _mTienen = t.match(/\b(?:tienen?|manejan?|hay\s+de|venden?|ofrecen?|cuentan?\s+con)\s+(\w+)/i);
    if (_mTienen) {
      const _cortesTienen = getCortes();
      const _word = _mTienen[1].toLowerCase();
      const _corteTienen = _cortesTienen[_word] || buscarCorteFuzzy(_word);
      if (_corteTienen) return { tipo: "descripcion_corte", producto: _corteTienen };
    }
  }
  // "¿ya está listo mi pedido?" — check BEFORE horario para evitar responder con horario de apertura
  if (/ya\s+(?:est[aá][ns]?\s+(?:listo?|lista?|listos?)|qued[oó]\s+(?:listo?|lista?))(?:\s+(?:mi|el|los|las|tu)\s*(?:pedido|tacos?|tortas?|orden))?/i.test(t)) return { tipo: "pedido_listo" };
  if (PREGUNTAS_HORARIO.test(t))   return { tipo: "horario" };
  if (PREGUNTAS_MENU.test(t))      return { tipo: "menu" };
  if (PREGUNTAS_UBICACION.test(t)) return { tipo: "ubicacion" };
  if (PREGUNTAS_PAGO.test(t))      return { tipo: "metodos_pago" };
  return null;
}

// ── DETECTAR TODAS LAS PREGUNTAS FRECUENTES (multi-intent) ───────────────────
function detectarTodasPreguntasFrecuentes(texto) {
  const t = normalizar(texto);
  const resultados = [];

  if (PATRON_EN_CAMINO.test(t))    resultados.push({ tipo: "ya_en_camino" });
  if (PATRON_DESPEDIDA.test(t))    resultados.push({ tipo: "despedida" });
  if (PREGUNTAS_TOTAL.test(t))     resultados.push({ tipo: "total_parcial" });
  if (PREGUNTAS_DOMICILIO.test(t)) resultados.push({ tipo: "domicilio" });

  if (PREGUNTAS_PRECIO.test(t)) {
    const m = t.match(getCortesRegex());
    resultados.push({ tipo: "precio", producto: m ? getCortes()[m[1].toLowerCase()] : null });
  }

  if (PREGUNTAS_DESCRIPCION_CORTE.test(t)) {
    const m = t.match(getCortesRegex());
    if (m) resultados.push({ tipo: "descripcion_corte", producto: getCortes()[m[1].toLowerCase()] });
  }

  const _mTienenTodas = t.match(/\b(?:tienen?|manejan?|hay\s+de|venden?|ofrecen?|cuentan?\s+con)\s+(\w+)/i);
  if (_mTienenTodas) {
    const _word = _mTienenTodas[1].toLowerCase();
    const _corte = getCortes()[_word] || buscarCorteFuzzy(_word);
    if (_corte) resultados.push({ tipo: "descripcion_corte", producto: _corte });
  }

  if (/ya\s+(?:est[aá][ns]?\s+(?:listo?|lista?|listos?)|qued[oó]\s+(?:listo?|lista?))(?:\s+(?:mi|el|los|las|tu)\s*(?:pedido|tacos?|tortas?|orden))?/i.test(t))
    resultados.push({ tipo: "pedido_listo" });

  if (PREGUNTAS_HORARIO.test(t))   resultados.push({ tipo: "horario" });
  if (PREGUNTAS_MENU.test(t))      resultados.push({ tipo: "menu" });
  if (PREGUNTAS_UBICACION.test(t)) resultados.push({ tipo: "ubicacion" });
  if (PREGUNTAS_PAGO.test(t))      resultados.push({ tipo: "metodos_pago" });

  const vistos = new Set();
  return resultados.filter(r => {
    const k = r.tipo + (r.producto || "");
    if (vistos.has(k)) return false;
    vistos.add(k);
    return true;
  });
}

// ── DETECTAR MODIFICACIÓN ─────────────────────────────────────────────────────
function detectarModificacion(texto) {
  const t = normalizar(texto);
  if (PATRON_QUITAR_UNO.test(t)) {
    const mQ = t.match(PATRON_QUITAR_UNO);
    const corteRaw = (mQ[1] || mQ[2] || mQ[3] || mQ[4] || "").toLowerCase().trim();
    const corte = corteRaw ? (getCortes()[corteRaw] || buscarCorteFuzzy(corteRaw) || null) : null;
    return { tipo: "quitar_uno", corte };
  }
  if (PATRON_AGREGAR_MAS.test(t)) {
    const m = t.match(PATRON_AGREGAR_MAS);
    const cantidad = parseInt(m[1] || m[3] || m[5] || m[7] || "1");
    const _corteRaw = (m[2] || m[4] || m[6] || m[8] || "").toLowerCase();
    const _corte = _corteRaw ? (getCortes()[_corteRaw] || buscarCorteFuzzy(_corteRaw) || null) : null;
    return { tipo: "agregar_mas", cantidad, corte: _corte };
  }
  if (PATRON_CAMBIAR_CORTE.test(t)) {
    const m = t.match(PATRON_CAMBIAR_CORTE);
    const cortes = getCortes();
    const rawDe  = normalizar(m[1] || m[3] || m[5] || m[8] || "");
    const rawPor = normalizar(m[2] || m[4] || m[6] || m[7] || "");
    const de  = cortes[rawDe]  || buscarCorteFuzzy(rawDe)  || null;
    const por = cortes[rawPor] || buscarCorteFuzzy(rawPor) || null;
    if (de && por) return { tipo: "cambiar_corte", de, por };
  }
  return null;
}

// ── MEJORA 1 (sesión anterior): PARSEAR MITAD/MITAD ──────────────────────────
const PATRON_MITAD_CAPTURA = /(?:la\s+)?mitad\s+(?:de\s+)?(\w+)\s+(?:y\s+)?(?:la\s+otra\s+)?mitad\s+(?:de\s+)?(\w+)|medio\s+(\w+)\s+y\s+medio\s+(\w+)/i;

function parsearMitadMitad(texto) {
  const t = normalizar(texto);
  const m = t.match(PATRON_MITAD_CAPTURA);
  if (!m) return null;
  const corte1 = buscarCorteFuzzy(m[1] || m[3]);
  const corte2 = buscarCorteFuzzy(m[2] || m[4]);
  if (!corte1 || !corte2) return null;
  const corteStr = `${corte1}, ${corte2}`;

  const matchPieza = t.match(/\b(\d+)\s+(tacos?|tortas?)\b/);
  if (matchPieza)
    return { tipo: "pedido", items: [{ presentacion: /taco/i.test(matchPieza[2]) ? "taco" : "torta", cantidad: parseInt(matchPieza[1]), corte: corteStr }] };

  for (const medida of MEDIDAS)
    if (medida.re.test(t))
      return { tipo: "pedido", items: [{ presentacion: "gramos", gramos: medida.gramos, corte: corteStr }] };

  const matchGramos = t.match(/\b(\d+)\s*g(?:ramos?)?\b/);
  if (matchGramos)
    return { tipo: "pedido", items: [{ presentacion: "gramos", gramos: parseInt(matchGramos[1]), corte: corteStr }] };

  return null;
}

// ── MEJORA 4 (sesión anterior): PARSEAR "DE TODO MENOS X" ────────────────────
const PATRON_TODO_MENOS = /(?:de\s+todo|de\s+todos?\s+(?:los\s+)?cortes?)\s+(?:menos|excepto|sin)\s+(\w+)|surtido\s+(?:pero\s+)?sin\s+(\w+)/i;

function parsearTodoMenosCorte(texto) {
  const t = normalizar(texto);
  const m = t.match(PATRON_TODO_MENOS);
  if (!m) return null;
  const excluido = buscarCorteFuzzy(m[1] || m[2]);
  if (!excluido) return null;
  const todosCortes = [...new Set(Object.values(getCortes()))];
  const cortesResultantes = todosCortes.filter(c => c !== excluido);
  if (!cortesResultantes.length) return null;
  const corteStr = cortesResultantes.join(", ");

  const matchPieza = t.match(/\b(\d+)\s+(tacos?|tortas?)\b/);
  if (matchPieza)
    return { tipo: "pedido", items: [{ presentacion: /taco/i.test(matchPieza[2]) ? "taco" : "torta", cantidad: parseInt(matchPieza[1]), corte: corteStr }] };

  for (const medida of MEDIDAS)
    if (medida.re.test(t))
      return { tipo: "pedido", items: [{ presentacion: "gramos", gramos: medida.gramos, corte: corteStr }] };

  const matchGramos = t.match(/\b(\d+)\s*g(?:ramos?)?\b/);
  if (matchGramos)
    return { tipo: "pedido", items: [{ presentacion: "gramos", gramos: parseInt(matchGramos[1]), corte: corteStr }] };

  return null;
}

// ── MEJORA: PEDIDO MULTI-LÍNEA ────────────────────────────────────────────────
// Cada línea se parsea de forma independiente y se combinan los ítems.
function parsearPedidoMultiLinea(texto) {
  const lineas = texto.split(/\n+/).map(l => l.trim()).filter(l => l.length > 2);
  if (lineas.length < 2) return null;
  const items = [];
  for (const linea of lineas) {
    const res = parsearPedidoSimple(linea);
    if (!res || res.tipo !== "pedido" || !Array.isArray(res.items) || !res.items.length) return null;
    items.push(...res.items);
  }
  return items.length >= 2 ? { tipo: "pedido", items } : null;
}

// ── MEJORA: REPETIR PEDIDO ANTERIOR ──────────────────────────────────────────
const PATRON_LO_MISMO = /\b(lo\s+mismo(?:\s+de\s+(?:siempre|antes|ayer|antier|la\s+semana\s+pasada))?|igual\s+que\s+(?:la\s+)?(?:vez\s+pasada|[uú]ltima\s+vez)|repite?\s+(?:mi\s+)?pedido|lo\s+de\s+siempre|lo\s+mismo\s+de\s+(?:antes|ayer|antier)|lo\s+anterior|el\s+de\s+ayer|el\s+pedido\s+de\s+(?:ayer|antier)|el\s+de\s+la\s+semana\s+pasada)\b/i;

function detectarRepetirPedido(texto) {
  return PATRON_LO_MISMO.test(normalizar(texto));
}

// ── PARSER PRINCIPAL ──────────────────────────────────────────────────────────
function parsearPedidoSimple(texto) {
  const mitad = parsearMitadMitad(texto);
  if (mitad) return mitad;

  const todoMenos = parsearTodoMenosCorte(texto);
  if (todoMenos) return todoMenos;

  // Multi-línea: si el texto tiene saltos de línea, intentar parsear línea por línea
  if (/\n/.test(texto)) {
    const multiLinea = parsearPedidoMultiLinea(texto);
    if (multiLinea) return multiLinea;
  }

  // Normalizar texto antes del score
  texto = textoANumero(preprocesarCantidades(texto));
  const t = normalizar(texto);

  if (SEÑALES_GROQ.test(t) || PATRON_DISTRIBUCION.test(texto)) return null;
  if (calcularScore(texto) < 4) return null;

  const partes = dividirEnItems(texto);

  if (partes.length > 1) {
    const items = [];
    let ultimoTipo = null;
    for (const parte of partes) {
      let item = parsearItem(parte);
      if (!item && ultimoTipo) item = parsearItemHeredado(parte, ultimoTipo);
      if (!item || item._sinCorte) return null;
      if (item.presentacion === "taco" || item.presentacion === "torta") ultimoTipo = item.presentacion;
      items.push(item);
    }
    if (items.length > 0) return { tipo: "pedido", items };
    return null;
  }

  const corte = extraerCorte(texto);

  const matchPieza = t.match(/\b(\d+)\s+(tacos?|tortas?)\b/);
  if (matchPieza) {
    const cantidad = parseInt(matchPieza[1]);
    const esTaco   = /taco/i.test(matchPieza[2]);
    if (!corte) return null;
    return { tipo: "pedido", items: [{ presentacion: esTaco ? "taco" : "torta", cantidad, corte }] };
  }

  for (const medida of MEDIDAS) {
    if (medida.re.test(t)) {
      if (!corte) return null;
      return { tipo: "pedido", items: [{ presentacion: "gramos", gramos: medida.gramos, corte }] };
    }
  }

  const matchGramos = t.match(/\b(\d+)\s*g(?:ramos?)?\b/);
  if (matchGramos) {
    const gramos = parseInt(matchGramos[1]);
    if (!corte) return null;
    return { tipo: "pedido", items: [{ presentacion: "gramos", gramos, corte }] };
  }

  const matchMonto = t.match(/\b(\d+)\b/);
  if (matchMonto) {
    const num = parseInt(matchMonto[1]);
    if (num > 40 && corte) return { tipo: "pedido", items: [{ presentacion: "pesos", monto: num, corte }] };
    if (num <= 100) return null;
  }

  return null;
}

// ── DETECTAR SIN TIPO ────────────────────────────────────────────────────────
function detectarSinTipo(texto) {
  texto = textoANumero(texto);
  const t = normalizar(texto);
  if (SEÑALES_GROQ.test(t) || PATRON_DISTRIBUCION.test(texto)) return null;
  const partes = dividirEnItems(texto);
  if (partes.length > 1) return null;
  if (/\b(tacos?|tortas?)\b/i.test(t)) return null;
  if (MEDIDAS.some(m => m.re.test(t))) return null;
  if (/\b\d+\s*g(?:ramos?)?\b/.test(t)) return null;
  const corte = extraerCorte(texto);
  if (!corte) return null;
  const matchNum = t.match(/\b(\d+)\b/);
  if (!matchNum) return null;
  const cantidad = parseInt(matchNum[1]);
  if (cantidad > 40) return null;
  return { cantidad, corte };
}

// ── DISTRIBUCIÓN DE CORTES ────────────────────────────────────────────────────
// "1 de carne, 2 de surtido, 1 de lengua"  → [{cantidad:1,corte:"carne"}, ...]
// "uno de carne y lengua, 2 de surtido, 1 de cuero" → [{cantidad:1,corte:"carne, lengua"}, ...]
// "N de corte1 y corte2" se interpreta como 1 ítem con corte combinado (sin número antes del y).
// Requiere al menos 2 pares (cantidad + corte válido). Retorna null si no aplica.
function parsearDistribucionCortes(texto) {
  const NUMS_TEXTO = { un: 1, una: 1, uno: 1, dos: 2, tres: 3, cuatro: 4 };
  texto = texto.replace(/(\d)([a-zA-ZáéíóúüñÁÉÍÓÚÜÑ])/g, "$1 $2");
  texto = textoANumero(texto);
  const t = normalizar(texto);
  const CORTES_MAP = getCortes();
  const patron = /\b(\d+|un[ao]?|dos|tres|cuatro)\s+(?:de\s+)?(\w+)(?:\s+y\s+(?!\d)(\w+))?/gi;
  const matches = [...t.matchAll(patron)];
  if (matches.length < 2) return null;
  const items = [];
  for (const m of matches) {
    const cantStr = m[1].toLowerCase();
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
// "2 de fanta y 1 de manzana" → [{nombre:"fanta",cantidad:2,...}, {nombre:"manzana",cantidad:1,...}]
// Requiere al menos 2 tipos distintos. Retorna null si no aplica.
function parsearDistribucionRefrescos(texto) {
  const NUMS_TEXTO = { un: 1, una: 1, uno: 1, dos: 2, tres: 3, cuatro: 4 };
  texto = texto.replace(/(\d)([a-zA-ZáéíóúüñÁÉÍÓÚÜÑ])/g, "$1 $2");
  texto = textoANumero(texto);
  const t = normalizar(texto);
  const refrescos = getRefrescos();
  if (!refrescos.length) return null;
  const encontrados = [];
  for (const ref of refrescos) {
    const palabras = [ref.nombre, ...(ref.sinonimos || "").split(",").map(s => s.trim()).filter(Boolean)];
    for (const p of palabras) {
      if (!p) continue;
      const escaped = normalizar(p).replace(/[.*+?^${}()|[\]\\]/g, "\\$&").replace(/\s+/g, "\\s+");
      const m = t.match(new RegExp(`\\b(\\d+|un[ao]?|dos|tres|cuatro)\\s+(?:refrescos?\\s+)?(?:de\\s+)?${escaped}s?\\b`, "i"));
      if (m) {
        const cantStr = m[1].toLowerCase();
        const cantidad = parseInt(cantStr) || NUMS_TEXTO[cantStr] || 1;
        encontrados.push({ nombre: ref.nombre, cantidad, precio: ref.precio_taco });
        break;
      }
    }
  }
  return encontrados.length >= 2 ? encontrados : null;
}

// ── SEPARAR REFRESCO Y/O SALSA DE UN MENSAJE MIXTO ───────────────────────────
// "2 tacos y una coca"                   → { textoLimpio:"2 tacos", refrescos:[{…}], salsas:[] }
// "dos tacos, 2 cocas, 1 fanta y salsa"  → { textoLimpio:"dos tacos", refrescos:[{…},{…}], salsas:[{…}] }
// Sin coincidencias                      → { textoLimpio: texto (original), refrescos:[], salsas:[] }
function separarRefresco(texto) {
  texto = texto.replace(/(\d)([a-zA-ZáéíóúüñÁÉÍÓÚÜÑ])/g, "$1 $2");
  const NUMS_TEXTO = { un: 1, una: 1, uno: 1, unos: 1, unas: 1, dos: 2, tres: 3, cuatro: 4 };

  function _limpiar(t) {
    return t.replace(/^\s*[,y]\s*/i, "").replace(/\s{2,}/g, " ").trim();
  }

  const textNorm   = normalizar(texto);
  let   textoActual = textNorm;

  // ── PASO 1: refrescos específicos del catálogo — itera todos para capturar varios ──
  const refrescos = getRefrescos();
  const refrescosEncontrados = [];
  for (const ref of refrescos) {
    const variantes = [ref.nombre, ...(ref.sinonimos || "").split(",").map(s => s.trim()).filter(Boolean)];
    for (const variante of variantes) {
      if (!variante) continue;
      const varNorm = normalizar(variante);
      const escaped = varNorm.replace(/[.*+?^${}()|[\]\\]/g, "\\$&").replace(/\s+/g, "\\s+");
      if (!new RegExp(`\\b${escaped}s?\\b`).test(textoActual)) continue;

      const mCant   = textoActual.match(new RegExp(`\\b([1-9]\\d?)\\s+${escaped}s?\\b`))
                   || textoActual.match(new RegExp(`\\b([1-9]\\d?)\\s+refrescos?\\s+(?:de\\s+)?${escaped}s?\\b`));
      const cantidad = mCant ? parseInt(mCant[1]) : 1;

      const reRemove = new RegExp(
        `(?:\\s*(?:,|y|mas|tambien|con|\\+))?\\s*(?:[1-9]\\d?|un[ao]?)?\\s*(?:refrescos?\\s+(?:de\\s+)?)?${escaped}s?\\b`,
        "g"
      );
      textoActual = _limpiar(textoActual.replace(reRemove, ""));
      refrescosEncontrados.push({ nombre: ref.nombre, cantidad, precio: ref.precio_taco });
      break; // siguiente refresco del catálogo
    }
  }

  // ── PASO 2: refresco genérico ("2 refrescos"…) solo si no se encontró ninguno específico ──
  if (refrescosEncontrados.length === 0) {
    const mGen = textoActual.match(/\b([1-9]\d?|un[ao]?s?|dos|tres|cuatro)\s+refrescos?\b/);
    if (mGen) {
      const cantStr  = mGen[1];
      const cantidad = /^\d+$/.test(cantStr) ? parseInt(cantStr) : (NUMS_TEXTO[cantStr] || 1);
      const reRemove = new RegExp(
        `(?:\\s*(?:,|y|mas|tambien|con|\\+))?\\s*(?:[1-9]\\d?|un[ao]?s?|dos|tres|cuatro)?\\s*refrescos?\\b`,
        "g"
      );
      textoActual = _limpiar(textoActual.replace(reRemove, ""));
      refrescosEncontrados.push({ nombre: null, cantidad, precio: 0, esGenerico: true });
    }
  }

  // ── PASO 3: salsas específicas del catálogo ──
  const salsasEncontradas = [];
  for (const sal of getSalsas()) {
    const variantes = [sal.nombre, ...(sal.sinonimos || "").split(",").map(s => s.trim()).filter(Boolean)];
    for (const variante of variantes) {
      if (!variante) continue;
      const varNorm = normalizar(variante);
      const escaped = varNorm.replace(/[.*+?^${}()|[\]\\]/g, "\\$&").replace(/\s+/g, "\\s+");
      if (!new RegExp(`\\b${escaped}s?\\b`).test(textoActual)) continue;

      const mCant   = textoActual.match(new RegExp(`\\b([1-9]\\d?)\\s+${escaped}s?\\b`))
                   || textoActual.match(new RegExp(`\\b([1-9]\\d?)\\s+salsas?\\s+(?:de\\s+)?${escaped}s?\\b`));
      const cantidad = mCant ? parseInt(mCant[1]) : 1;

      const reRemove = new RegExp(
        `(?:\\s*(?:,|y|mas|tambien|con|\\+))?\\s*(?:[1-9]\\d?|un[ao]?)?\\s*(?:salsas?\\s+(?:de\\s+)?)?${escaped}s?\\b`,
        "g"
      );
      textoActual = _limpiar(textoActual.replace(reRemove, ""));
      salsasEncontradas.push({ nombre: sal.nombre, cantidad });
      break; // siguiente salsa del catálogo
    }
  }

  // ── PASO 4: salsa genérica ("2 salsas", "unas salsas extras"…) solo si no hubo específicas ──
  if (salsasEncontradas.length === 0) {
    const mSalsa = textoActual.match(/\b([1-9]\d?|un[ao]?s?|dos|tres|cuatro)\s+salsas?(?:\s+extras?)?\b/);
    if (mSalsa) {
      const cantStr  = mSalsa[1];
      const cantidad = /^\d+$/.test(cantStr) ? parseInt(cantStr) : (NUMS_TEXTO[cantStr] || 1);
      const reRemove = new RegExp(
        `(?:\\s*(?:,|y|mas|tambien|con|\\+))?\\s*(?:[1-9]\\d?|un[ao]?s?|dos|tres|cuatro)?\\s*salsas?(?:\\s+extras?)?\\b`,
        "g"
      );
      textoActual = _limpiar(textoActual.replace(reRemove, ""));
      salsasEncontradas.push({ nombre: null, cantidad, esGenerico: true });
    }
  }

  if (refrescosEncontrados.length === 0 && salsasEncontradas.length === 0) return { textoLimpio: texto, refrescos: [], salsas: [] };
  return { textoLimpio: textoActual || "", refrescos: refrescosEncontrados, salsas: salsasEncontradas };
}

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
  normalizar,
  separarRefresco,
  textoANumero,
  buscarCorteFuzzy,
  parsearDistribucionCortes,
  parsearDistribucionRefrescos,
};
