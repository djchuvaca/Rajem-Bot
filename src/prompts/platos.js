// prompts/platos.js — Lógica de platos separados y agrupados
// Se usa SOLO cuando el mensaje del cliente contiene señales de agrupación

const { getConfig } = require("../db");

function buildPlatos() {
  const pTaco  = getConfig("precio_taco")  || "30";
  const pTorta = getConfig("precio_torta") || "40";
  const p100g  = getConfig("precio_100g")  || "32";

  return `
LÓGICA DE PLATOS SEPARADOS Y AGRUPADOS:

PLATOS SEPARADOS — palabras clave: "y aparte", "para mí", "para ella", "separado", "otro plato"
Ejemplo: "3 tacos surtido para mí y aparte 2 tortas buche"
→ 🍽️ Plato 1: 3 tacos carnitas surtido — $${3*parseInt(pTaco)}
→ 🍽️ Plato 2: 2 tortas carnitas buche — $${2*parseInt(pTorta)}

AGRUPACIÓN — cantidad total dividida en grupos iguales (grupos = total ÷ unidades_por_grupo):
- "de X en X" → "6 tacos de 2 en 2" = 3x [2 tacos] — $${2*parseInt(pTaco)} c/u
- "de a X" → "9 tacos de a 3" = 3x [3 tacos] — $${3*parseInt(pTaco)} c/u
- "en pares" → grupos de 2
- "en tríos" → grupos de 3
- "X platos de Y" → X grupos de Y unidades

EJEMPLOS:
- "6 tacos surtido de 2 en 2" → 3x [2 tacos carnitas surtido] — $${2*parseInt(pTaco)} c/u → Subtotal: $${6*parseInt(pTaco)}
- "8 tacos en pares" → 4x [2 tacos] — $${2*parseInt(pTaco)} c/u → Subtotal: $${8*parseInt(pTaco)}
- "5 platos de 1 taco y 1 torta buche" → 5x [1 taco + 1 torta carnitas buche] — $${parseInt(pTaco)+parseInt(pTorta)} c/u

FORMATO RESUMEN:
- Grupos distintos: 🍽️ Plato 1, 🍽️ Plato 2...
- Grupos iguales: Nx [contenido] — $XX c/u
- NUNCA mezcles ítems de grupos distintos.`;
}

// Detectar si el mensaje necesita el módulo de platos
function necesitaPlatos(texto) {
  return /y\s+aparte|para\s+m[ií]|para\s+ella|para\s+[eé]l|separado|otro\s+plato|y\s+adem[aá]s|de\s+\d+\s+en\s+\d+|de\s+a\s+\d+|en\s+pares|en\s+tr[ií]os|platos?\s+de|[oó]rdenes?\s+de|porciones?\s+de|cada\s+uno|para\s+cada/i.test(texto);
}

module.exports = { buildPlatos, necesitaPlatos };