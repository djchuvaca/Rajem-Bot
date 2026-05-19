// src/handlers/pedidoParser.js
// Parser inteligente de pedidos — sin Groq para casos manejables
// Sistema de score para decidir si parsear local o pasar a Groq

const { getConfig, getProductos } = require("../db");

// ── CARGAR CORTES DESDE BD (con fallback) ────────────────────────────────────
function getCortes() {
  try {
    const productos = getProductos();
    if (!productos || !productos.length) return _cortesDefault();
    const mapa = {};
    for (const p of productos) {
      const nombre = p.nombre.toLowerCase().trim();
      mapa[nombre] = nombre;
      if (nombre === "carne")   { mapa.carner = "carne"; mapa.masiza = "carne"; mapa.maciza = "carne"; mapa.carnita = "carne"; mapa.carnitas = "carne"; }
      if (nombre === "buche")   { mapa.buchito = "buche"; mapa.buchon = "buche"; mapa.buchones = "buche"; }
      if (nombre === "cuero")   { mapa.cueros = "cuero"; mapa.cueritos = "cuero"; mapa.cuerito = "cuero"; }
      if (nombre === "lengua")  { mapa.lenguita = "lengua"; mapa.lenguitas = "lengua"; }
      if (nombre === "surtido") { mapa.surtida = "surtido"; mapa.mixto = "surtido"; mapa.mixta = "surtido"; }
    }
    return mapa;
  } catch (e) { return _cortesDefault(); }
}

function _cortesDefault() {
  return {
    surtido: "surtido", surtida: "surtido", mixto: "surtido", mixta: "surtido",
    carne: "carne", carner: "carne", masiza: "carne", maciza: "carne", carnita: "carne", carnitas: "carne",
    buche: "buche", buchito: "buche", buchon: "buche", buchones: "buche",
    cuero: "cuero", cueros: "cuero", cueritos: "cuero", cuerito: "cuero",
    lengua: "lengua", lenguita: "lengua", lenguitas: "lengua",
  };
}

function getRegexCortes() {
  const cortes = getCortes();
  const palabras = Object.keys(cortes).join("|");
  return new RegExp(`(?:de\\s*|\\b)(${palabras})\\b`, "gi");
}

// ── FRACCIONES Y MEDIDAS CONOCIDAS ────────────────────────────────────────────
const MEDIDAS = [
  { re: /\bun\s+cuarto\b|\b1\/4\b|\b250\s*g/i,                           gramos: 250  },
  { re: /\bmedio\s+kilo\b|\bmedio\b|\b1\/2\s*(?:de\s*)?\w*\b|\b500\s*g/i, gramos: 500  },
  { re: /\btres\s+cuartos\b|\b3\/4\b|\b750\s*g/i,                        gramos: 750  },
  { re: /\bun\s+kilo\b|\b1\s*kg\b|\b1000\s*g/i,                          gramos: 1000 },
];

// ── SEÑALES DE COMPLEJIDAD → GROQ ─────────────────────────────────────────────
const SEÑALES_GROQ       = /y\s+aparte|para\s+m[ií]|para\s+ella|para\s+[eé]l|separado|otro\s+plato|en\s+pares|en\s+tr[ií]os|platos?\s+de|cada\s+uno|para\s+cada|y\s+tambi[eé]n|\+/i;
const PATRON_DISTRIBUCION = /de\s+\d+\s+en\s+\d+|de\s+a\s+\d+|alternado|uno\s+de\s+cada|intercalado/i;
const PATRON_MITAD        = /mitad\s+(?:y\s+mitad|de\s+cada)|la\s+mitad\s+(?:de|en)|mitad\s+\w+\s+(?:y|mitad)/i;

// ── PATRONES DE MODIFICACIÓN ──────────────────────────────────────────────────
const PATRON_QUITAR_UNO    = /quita(?:me|le)?\s+uno|menos\s+uno|un\s+(?:taco|torta)\s+menos/i;
const PATRON_AGREGAR_MAS   = /agrega(?:le|me)?\s+(?:otros?|m[aá]s)\s+(\d+)|(\d+)\s+m[aá]s/i;
const PATRON_CAMBIAR_CORTE = /cambia(?:me|le)?\s+(?:el|la|los|las)?\s*(\w+)\s+(?:por|a)\s+(\w+)|(?:sin|quita)\s+(\w+)\s+(?:y\s+)?(?:pon|agrega)\s+(\w+)/i;

// ── PREGUNTAS FRECUENTES ──────────────────────────────────────────────────────
const PREGUNTAS_PRECIO      = /cu[aá]nto\s+(?:cuesta|vale|est[aá]|cobran|es)|precio\s+(?:del?|de\s+los?)|a\s+(?:c[oó]mo|cu[aá]nto)\s+(?:est[aá]n?|cobran?|venden?)/i;
const PREGUNTAS_HORARIO     = /(?:a\s+qu[eé]\s+hora|cu[aá]ndo)\s+(?:abren?|cierran?|atienden?)|qu[eé]\s+hora(?:rio)?|est[aá]n?\s+abiertos?|hasta\s+qu[eé]\s+hora/i;
const PREGUNTAS_DOMICILIO   = /(?:hacen?|tienen?|mandan?|llevan?)\s+domicilio|env[ií]o|costo\s+(?:del?|de\s+)?domicilio|cobran?\s+(?:por\s+)?domicilio/i;
const PREGUNTAS_MENU        = /qu[eé]\s+(?:tienen?|hay|venden?|ofrecen?|manejan?)|men[uú]/i;
const PREGUNTAS_UBICACION   = /d[oó]nde\s+(?:est[aá]n?|quedan?)|direcci[oó]n|ubicaci[oó]n|c[oó]mo\s+llegar/i;
const PREGUNTAS_PAGO        = /(?:c[oó]mo|de\s+qu[eé]\s+forma)\s+(?:pago|puedo\s+pagar|aceptan?)|m[eé]todos?\s+de\s+pago|aceptan?\s+(?:tarjeta|transferencia|efectivo)/i;

// ── NORMALIZAR ────────────────────────────────────────────────────────────────
function normalizar(texto) {
  return texto.trim().toLowerCase().normalize("NFD").replace(/[\u0300-\u036f]/g, "");
}

// ── SISTEMA DE SCORE ──────────────────────────────────────────────────────────
function calcularScore(texto) {
  const t = normalizar(texto);
  let score = 0;

  if (SEÑALES_GROQ.test(t))            score -= 10;
  if (PATRON_DISTRIBUCION.test(texto)) score -= 10;
  if (PATRON_MITAD.test(texto))        score -= 5;

  if (/\b\d+\b/.test(t))                          score += 2;
  if (/\b(tacos?|tortas?)\b/.test(t))              score += 2;
  if (/\b\d+\s*g(?:ramos?)?\b/.test(t))            score += 2;
  if (MEDIDAS.some(m => m.re.test(t)))             score += 2;

  const cortes = getCortes();
  const palabrasCorte = Object.keys(cortes).join("|");
  if (new RegExp(`\\b(${palabrasCorte})\\b`, "i").test(t)) score += 2;

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
  if (!matches.length) return null;
  const cortes = getCortes();
  const cortesDetectados = [...new Set(matches.map(m => cortes[m[1].toLowerCase()]).filter(Boolean))];
  if (!cortesDetectados.length) return null;
  return cortesDetectados.length === 1 ? cortesDetectados[0] : cortesDetectados.join(", ");
}

// ── DIVIDIR EN ÍTEMS ──────────────────────────────────────────────────────────
function dividirEnItems(texto) {
  const partes = texto.split(/\s+y\s+(?=\d|\bun\b|\bmedio\b|\btres\b|\b1\/)/i)
    .map(p => p.trim()).filter(Boolean);
  return partes.length > 1 ? partes : [texto];
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
    if (num > 100) {
      if (!corte) return { _sinCorte: true, presentacion: "pesos", monto: num };
      return { presentacion: "pesos", monto: num, corte };
    }
  }

  return null;
}

// ── DETECTAR SIN CORTE ────────────────────────────────────────────────────────
function detectarSinCorte(texto) {
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
  if (PREGUNTAS_PRECIO.test(t)) {
    const cortes = getCortes();
    const palabras = Object.keys(cortes).join("|");
    const m = t.match(new RegExp(`\\b(${palabras})\\b`, "i"));
    return { tipo: "precio", producto: m ? cortes[m[1].toLowerCase()] : null };
  }
  if (PREGUNTAS_HORARIO.test(t))   return { tipo: "horario" };
  if (PREGUNTAS_DOMICILIO.test(t)) return { tipo: "domicilio" };
  if (PREGUNTAS_MENU.test(t))      return { tipo: "menu" };
  if (PREGUNTAS_UBICACION.test(t)) return { tipo: "ubicacion" };
  if (PREGUNTAS_PAGO.test(t))      return { tipo: "metodos_pago" };
  return null;
}

// ── DETECTAR MODIFICACIÓN ─────────────────────────────────────────────────────
function detectarModificacion(texto) {
  const t = normalizar(texto);
  if (PATRON_QUITAR_UNO.test(t)) return { tipo: "quitar_uno" };
  if (PATRON_AGREGAR_MAS.test(t)) {
    const m = texto.match(PATRON_AGREGAR_MAS);
    return { tipo: "agregar_mas", cantidad: parseInt(m[1] || m[2] || "1") };
  }
  if (PATRON_CAMBIAR_CORTE.test(t)) {
    const m = texto.match(PATRON_CAMBIAR_CORTE);
    const cortes = getCortes();
    const de  = cortes[(normalizar(m[1] || m[3] || ""))] || null;
    const por = cortes[(normalizar(m[2] || m[4] || ""))] || null;
    if (de && por) return { tipo: "cambiar_corte", de, por };
  }
  return null;
}

// ── PARSER PRINCIPAL ──────────────────────────────────────────────────────────
function parsearPedidoSimple(texto) {
  const t = normalizar(texto);
  if (SEÑALES_GROQ.test(t) || PATRON_DISTRIBUCION.test(texto)) return null;

  if (calcularScore(texto) < 4) return null;

  const partes = dividirEnItems(texto);

  if (partes.length > 1) {
    const items = [];
    for (const parte of partes) {
      const item = parsearItem(parte);
      if (!item || item._sinCorte) return null;
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
    if (num > 100 && corte) return { tipo: "pedido", items: [{ presentacion: "pesos", monto: num, corte }] };
    if (num <= 100) return null;
  }

  return null;
}

module.exports = {
  parsearPedidoSimple,
  detectarSinCorte,
  detectarPreguntaFrecuente,
  detectarModificacion,
  calcularScore,
  getCortes,
};