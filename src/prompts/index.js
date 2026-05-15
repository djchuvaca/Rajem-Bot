// prompts/index.js — Constructor dinámico del prompt según contexto
// Solo carga los módulos necesarios para cada situación

const { buildBase }   = require("./base");
const { buildPedido } = require("./pedido");
const { buildPlatos, necesitaPlatos } = require("./platos");
const { buildCortes, preguntaCorte }  = require("./cortes");

/**
 * Construye el SYSTEM_PROMPT dinámico según el estado del cliente
 * @param {object} opciones
 * @param {boolean} opciones.tomandoPedido  - cliente ya recibió el menú y está pidiendo
 * @param {string}  opciones.textoCliente   - mensaje actual del cliente (para detectar módulos)
 * @param {string}  opciones.horaConfirmada - hora de preventa si aplica
 * @param {boolean} opciones.esPreventa     - si es pedido de preventa
 */
function buildPrompt({ tomandoPedido = false, textoCliente = "", horaConfirmada = null, esPreventa = false } = {}) {
  let prompt = buildBase();

  if (tomandoPedido) {
    prompt += buildPedido();

    // Solo agregar módulo de platos si el mensaje lo necesita
    if (necesitaPlatos(textoCliente)) {
      prompt += buildPlatos();
    }

    // Solo agregar descripciones si el cliente pregunta por un corte
    if (preguntaCorte(textoCliente)) {
      prompt += buildCortes();
    }
  }

  // Contexto de preventa si aplica
  if (esPreventa && horaConfirmada) {
    prompt += `\n\nIMPORTANTE: Este es un pedido de PREVENTA. El cliente recogerá/recibirá su pedido a las ${horaConfirmada}. Incluye este dato en el resumen como "Recolección" o "Hora de entrega" según corresponda.`;
  }

  return prompt;
}

// Para compatibilidad con el código existente que usa SYSTEM_PROMPT
const SYSTEM_PROMPT = buildBase() + buildPedido();

module.exports = { buildPrompt, SYSTEM_PROMPT };