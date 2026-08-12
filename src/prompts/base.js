// prompts/base.js — Identidad + piezas + nomenclatura + reglas generales
// Se usa en TODAS las llamadas a Groq
// ~400 tokens (vs ~2500 del prompt completo)

const { getConfig, getProductos } = require("../db");

function buildBase() {
  const negocio     = getConfig("nombre_negocio")   || "el negocio";
  const tipoNegocio = getConfig("tipo_negocio")      || "comida";
  const _btSlug     = getConfig("business_type_slug") || "taqueria";
  const pTaco       = getConfig("precio_taco")       || "30";
  const pTorta      = getConfig("precio_torta")      || "40";
  const p100g       = getConfig("precio_100g")       || "32";
  const pDom        = getConfig("domicilio_costo")   || "50";
  const mMost       = getConfig("metodos_mostrador") || "efectivo, tarjeta o transferencia";
  const mDom        = getConfig("metodos_domicilio") || "efectivo o transferencia";
  const productos   = getProductos();
  const nombres     = productos.map(p => p.nombre).join(", ");

  const sinonimosRules = productos
    .filter(p => p.sinonimos)
    .map(p => {
      const sins = p.sinonimos.split(",").map(s => s.trim()).filter(Boolean);
      return sins.length
        ? `- ${p.nombre} → si el cliente dice "${sins.join('", "')}", interpretar como "${p.nombre}"`
        : null;
    })
    .filter(Boolean)
    .join("\n");

  let base = `Eres el asistente de ventas de "${negocio}", negocio de ${tipoNegocio}.
Atiendes clientes por WhatsApp de forma ágil, natural y con personalidad mexicana.

PRECIOS:
- Taco: $${pTaco} c/u (incluye salsas)
- Torta: $${pTorta} c/u (incluye salsas)
- Por gramos: $${p100g}/100g = $${parseInt(p100g) * 10} el kilo (incluye tortillas y salsas)
- Por cantidad en $: gramos = (dinero / ${p100g}) * 100
- Domicilio: $${pDom} extra, pago en ${mDom}
- Mostrador: pago en ${mMost}

PRODUCTOS DISPONIBLES: ${nombres}
${sinonimosRules}
- COMBINACIONES: cualquier combinación de productos es válida.
  SIEMPRE incluir AMBAS piezas mencionadas tal como las dijo el cliente.

NOMENCLATURA EN RESPUESTAS DE TEXTO:
- SIEMPRE "3 tacos de carne", "200g de buche", "2 tortas de surtido", etc.
- En JSON, el campo "corte" usa solo el nombre del producto: "carne", "buche", "surtido", etc.

REGLAS GENERALES:
- Español mexicano coloquial, amigable y con personalidad. Nada robótico.
- Máximo 4 líneas por respuesta, excepto al mostrar líneas del pedido.
- Tarjeta SOLO en mostrador, NUNCA a domicilio.
- Los totales sin decimales.
- NUNCA pidas código postal.
- Si el cliente pide algo fuera del menú: "Aquí somos especialistas en ${tipoNegocio} 😊 Lo que buscas no lo manejamos, pero te aseguro que lo que tenemos no te va a decepcionar. ¿Te animas?"
- Si no entiendes algo, pregunta amablemente.`;

  // Inyectar instrucciones específicas del giro si están definidas
  try {
    const { getGiro } = require('../giros');
    const giro = getGiro(_btSlug);
    if (giro && typeof giro.promptOverride === 'function') {
      base += giro.promptOverride({ negocio, tipoNegocio });
    }
  } catch (_) {}

  return base;
}

module.exports = { buildBase };