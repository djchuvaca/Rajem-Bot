// src/handlers/pedidoParser.js
// Pre-procesador de pedidos simples — evita llamar a Groq cuando el patrón es claro
// Solo maneja casos inequívocos; el resto pasa a Groq

const { getConfig } = require("../db");

// ── CORTES VÁLIDOS ────────────────────────────────────────────────────────────
const CORTES = {
  surtido: "surtido",
  carne:   "carne", carner: "carne", masiza: "carne", maciza: "carne",
  buche:   "buche",
  cuero:   "cuero", cueros: "cuero",
  lengua:  "lengua",
};

const REGEX_CORTE = /\b(surtido|carne|carner|masiza|maciza|buche|cuero|cueros|lengua)\b/i;

// ── FRACCIONES Y MEDIDAS CONOCIDAS ────────────────────────────────────────────
const MEDIDAS = [
  { re: /\bun\s+cuarto\b|\b1\/4\b|\b250\s*g/i,        gramos: 250  },
  { re: /\bmedio\s+kilo\b|\bmedio\b|\b1\/2\b|\b500\s*g/i, gramos: 500 },
  { re: /\btres\s+cuartos\b|\b3\/4\b|\b750\s*g/i,     gramos: 750  },
  { re: /\bun\s+kilo\b|\b1\s*kg\b|\b1000\s*g/i,       gramos: 1000 },
];

// ── SEÑALES DE COMPLEJIDAD — si aparecen, pasar a Groq ───────────────────────
const SEÑALES_GROQ = /y\s+aparte|para\s+m[ií]|para\s+ella|para\s+[eé]l|separado|otro\s+plato|de\s+\d+\s+en\s+\d+|de\s+a\s+\d+|en\s+pares|en\s+tr[ií]os|platos?\s+de|cada\s+uno|para\s+cada|con\s+lengua|con\s+buche|con\s+cuero|con\s+carne|y\s+tambi[eé]n|\+/i;

/**
 * Intenta parsear el pedido sin Groq.
 * Retorna objeto JSON compatible con jsonALineas(), o null si no puede.
 */
function parsearPedidoSimple(texto) {
  const t = texto.trim().toLowerCase()
    .normalize("NFD").replace(/[\u0300-\u036f]/g, "");

  // Si hay señales de complejidad → pasar a Groq
  if (SEÑALES_GROQ.test(t)) return null;

  // ── Intentar extraer corte ────────────────────────────────────────────────
  const matchCorte = texto.match(REGEX_CORTE);
  const corte = matchCorte ? CORTES[matchCorte[1].toLowerCase()] : null;

  // ── CASO 1: "N tacos/tortas de [corte]" ──────────────────────────────────
  const matchPieza = t.match(/\b(\d+)\s+(tacos?|tortas?)\b/);
  if (matchPieza) {
    const cantidad = parseInt(matchPieza[1]);
    const esTaco   = /taco/i.test(matchPieza[2]);

    // Sin corte → necesita Groq para preguntar
    if (!corte) return null;

    return {
      tipo: "pedido",
      items: [{
        presentacion: esTaco ? "taco" : "torta",
        cantidad,
        corte,
      }]
    };
  }

  // ── CASO 2: Medida conocida + corte ("medio kilo de buche") ──────────────
  for (const medida of MEDIDAS) {
    if (medida.re.test(t)) {
      if (!corte) return null; // sin corte → Groq pregunta
      return {
        tipo: "pedido",
        items: [{ presentacion: "gramos", gramos: medida.gramos, corte }]
      };
    }
  }

  // ── CASO 3: Número en gramos explícito ("350g de surtido") ───────────────
  const matchGramos = t.match(/\b(\d+)\s*g(?:ramos?)?\b/);
  if (matchGramos) {
    const gramos = parseInt(matchGramos[1]);
    if (!corte) return null;
    return {
      tipo: "pedido",
      items: [{ presentacion: "gramos", gramos, corte }]
    };
  }

  // ── CASO 4: Monto en pesos > 100 sin unidad ("200 de surtido") ───────────
  const matchMonto = t.match(/\b(\d+)\b/);
  if (matchMonto) {
    const num = parseInt(matchMonto[1]);
    if (num > 100 && corte) {
      return {
        tipo: "pedido",
        items: [{ presentacion: "pesos", monto: num, corte }]
      };
    }
    // número ≤ 100 sin taco/torta → Groq pregunta
    if (num <= 100) return null;
  }

  // No se pudo parsear → pasar a Groq
  return null;
}

module.exports = { parsearPedidoSimple };
