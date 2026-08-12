// prompts/base.js — Identidad + piezas + nomenclatura + reglas generales
// Se usa en TODAS las llamadas a Groq
// ~400 tokens (vs ~2500 del prompt completo)

const { getConfig, getProductos } = require("../db");

function buildBase() {
  const negocio     = getConfig("nombre_negocio")   || "el negocio";
  const tipoNegocio = getConfig("tipo_negocio")      || "comida";
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

  // Resolver giro activo para secciones dinámicas
  let giro;
  try {
    const { getGiroActivo } = require('../giros');
    giro = getGiroActivo();
  } catch (_) {}

  // Sección PRECIOS construida desde los item_types del giro
  let preciosLineas = '';
  for (const it of (giro?.itemTypes || [])) {
    const p = it.precio_campo === 'precio_torta' ? pTorta : pTaco;
    const nombre = it.nombre.charAt(0).toUpperCase() + it.nombre.slice(1);
    preciosLineas += `- ${nombre}: $${p} c/u (incluye salsas)\n`;
  }
  if ((giro?.comportamiento?.soportaVentaPorPeso || (giro?.itemTypes || []).some(t => t.soporta_gramos)) && parseInt(p100g) > 0) {
    preciosLineas += `- Por gramos: $${p100g}/100g = $${parseInt(p100g) * 10} el kilo (incluye tortillas y salsas)\n`;
    preciosLineas += `- Por cantidad en $: gramos = (dinero / ${p100g}) * 100\n`;
  }
  preciosLineas += `- Domicilio: $${pDom} extra, pago en ${mDom}\n`;
  preciosLineas += `- Mostrador: pago en ${mMost}`;

  const reglaTarjeta = giro?.comportamiento?.tarjetaSoloMostrador
    ? '\n- Tarjeta SOLO en mostrador, NUNCA a domicilio.'
    : '';

  let base = `Eres el asistente de ventas de "${negocio}", negocio de ${tipoNegocio}.
Atiendes clientes por WhatsApp de forma ágil, natural y con personalidad mexicana.

PRECIOS:
${preciosLineas}

PRODUCTOS DISPONIBLES: ${nombres}
${sinonimosRules}
- COMBINACIONES: cualquier combinación de productos es válida.
  SIEMPRE incluir AMBAS piezas mencionadas tal como las dijo el cliente.

REGLAS GENERALES:
- Español mexicano coloquial, amigable y con personalidad. Nada robótico.
- Máximo 4 líneas por respuesta, excepto al mostrar líneas del pedido.${reglaTarjeta}
- Los totales sin decimales.
- NUNCA pidas código postal.
- Si el cliente pide algo fuera del menú: "Aquí somos especialistas en ${tipoNegocio} 😊 Lo que buscas no lo manejamos, pero te aseguro que lo que tenemos no te va a decepcionar. ¿Te animas?"
- Si no entiendes algo, pregunta amablemente.`;

  // Inyectar instrucciones específicas del giro (nomenclatura, flujo particular, etc.)
  if (giro && typeof giro.promptOverride === 'function') {
    base += giro.promptOverride({ negocio, tipoNegocio });
  }

  return base;
}

module.exports = { buildBase };