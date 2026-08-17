'use strict';

// NLU de soporte para pedidos que el parser local no pudo interpretar.
// Groq solo devuelve JSON estructurado — nunca escribe texto al cliente.

const { groqJSON } = require('./client');

const _SISTEMA = `Eres un parser NLU para taquería mexicana. Devuelve SOLO JSON válido.
Si el mensaje contiene un pedido:
{"tipo":"pedido","items":[{"presentacion":"<slug_tipo>","cantidad":<número>,"corte":"<nombre_corte_o_null>"}]}
Si no hay pedido claro: {"tipo":"null"}
Reglas:
- cantidad es entero positivo, máximo 50
- Si el mensaje mezcla pedido con pregunta, extrae solo el pedido e ignora la pregunta
- Si no estás seguro del corte, usa null (no inventes cortes fuera de la lista)
- Solo usa cortes exactamente como aparecen en la lista proporcionada`;

/**
 * Intenta interpretar un pedido que el NLU local no pudo parsear.
 * @param {string} texto - Mensaje original del cliente
 * @param {Object} cortes - Mapa nombre→slug devuelto por getCortes()
 * @param {Array}  itemTypes - Array de item types devuelto por getItemTypes()
 * @returns {Object|null} JSON en formato {tipo:"pedido", items:[...]} o null
 */
async function interpretarPedidoConGroq(texto, cortes, itemTypes) {
  const cortesStr = Object.keys(cortes).join(', ');
  const tiposStr  = itemTypes.map(t => t.slug).join(', ');
  const user      = `Cortes disponibles: ${cortesStr}\nTipos de ítem: ${tiposStr}\nMensaje del cliente: "${texto}"`;

  const res = await groqJSON(_SISTEMA, user);
  if (!res || res.tipo === 'null') return null;
  if (res.tipo !== 'pedido' || !Array.isArray(res.items) || res.items.length === 0) return null;

  const slugsValidos = new Set(itemTypes.map(t => t.slug));
  const items = [];

  for (const i of res.items) {
    const cant = Math.floor(Number(i.cantidad));
    if (!cant || cant <= 0 || cant > 50) continue;

    const presentacion = slugsValidos.has(i.presentacion) ? i.presentacion : 'taco';

    // Mapear nombre de corte → slug (Groq devuelve el nombre, necesitamos el slug)
    let corte = null;
    if (i.corte) {
      const key = String(i.corte).toLowerCase().trim();
      corte = cortes[key] || null;
      // Match parcial si no hubo match exacto (ej: "surtida" → "surtido")
      if (!corte) {
        const parcial = Object.keys(cortes).find(k => k.startsWith(key) || key.startsWith(k));
        if (parcial) corte = cortes[parcial];
      }
    }

    items.push({ presentacion, cantidad: cant, corte });
  }

  if (items.length === 0) return null;
  return { tipo: 'pedido', items };
}

module.exports = { interpretarPedidoConGroq };
