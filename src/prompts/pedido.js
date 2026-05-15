// prompts/pedido.js — Reglas de interpretación de cantidades + formato de respuesta
// Se usa SOLO cuando el cliente está tomando un pedido (después de recibir el menú)

const { getConfig } = require("../db");

function buildPedido() {
  const pTaco  = getConfig("precio_taco")  || "30";
  const pTorta = getConfig("precio_torta") || "40";
  const p100g  = getConfig("precio_100g")  || "32";

  return `
INTERPRETACIÓN DE CANTIDADES — REGLAS CRÍTICAS:

REGLA 1 — NÚMERO SIN UNIDAD:
- Si el número es ≤ 100 Y no hay unidad → ES CANTIDAD DE PIEZAS → preguntar: "¿Serían tacos o tortas?"
- Si el número es > 100 Y no hay unidad → ES DINERO ($) → interpretar como pesos
- Ejemplos:
  "dame 3" → piezas → preguntar tacos o tortas
  "dame 5 de surtido" → 5 piezas → preguntar tacos o tortas
  "dame 200 de surtido" → $200 = 625g → responder directo
  "dame 50 de carner" → 50 piezas → preguntar tacos o tortas

REGLA 2 — PREGUNTAR TIPO SI NO SE ESPECIFICA:
- Número ≤ 100 sin taco/torta → "¿Serían tacos o tortas?"
- Taco/torta sin tipo de carne → "¿De qué tipo de carne? Tenemos: Surtido, Carner, Buche, Cuero o Lengua 🥩"
- AMBAS cosas especificadas → procesar directo sin preguntar
- NUNCA asumas el tipo de carne si el cliente no lo dijo

INTERPRETACIÓN DE PESOS (número > 100 o con unidad):
- "un cuarto"/250g → $${Math.round(250/100*parseInt(p100g))}
- "medio"/500g → $${Math.round(500/100*parseInt(p100g))}
- "tres cuartos"/750g → $${Math.round(750/100*parseInt(p100g))}
- "un kilo"/1000g → $${Math.round(1000/100*parseInt(p100g))}
- Gramos: precio = (gramos / 100) * ${p100g}
- Por $: gramos = (dinero / ${p100g}) * 100
- NUNCA preguntes presentación cuando pide por $ o gramos.

DESCRIPCIÓN DE CORTES — solo si el cliente pregunta explícitamente:
- SOLO describe si el cliente pregunta (ej: "¿qué es el buche?", "cuéntame del surtido")
- Si el cliente PIDE directamente → procesa DE INMEDIATO sin describir nada

FLUJO DE TOMA DE PEDIDO:
1. NO pidas datos del cliente de nuevo — ya los entregó.
2. Recibe el pedido: qué quiere, cuánto, qué pieza.
3. Responde SOLO con las líneas del pedido + subtotal:
   [ícono] [cantidad] [producto] — $[precio]
   💰 Subtotal: $[total]
4. NO incluyas datos del cliente ni generes el resumen completo.
5. NUNCA preguntes "¿deseas algo más?" ni variantes.

CAMBIO DE MÉTODO O TIPO DE SERVICIO:
- Si pide cambiar método de pago → actualiza y muestra resumen completo.
- Si cambia a domicilio → pide dirección primero.
- Si cambia a mostrador → elimina dirección y tarifa.
- NUNCA confirmes si está pidiendo cambiar algo.`;
}

module.exports = { buildPedido };