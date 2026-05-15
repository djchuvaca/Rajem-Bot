// prompts/index.js — Constructor dinámico del prompt según contexto

const { necesitaPlatos } = require("./platos");
const { preguntaCorte }  = require("./cortes");

function buildPrompt({ tomandoPedido = false, textoCliente = "", horaConfirmada = null, esPreventa = false } = {}) {
  // Require lazy para que la BD ya esté inicializada cuando se llame
  const { buildBase }   = require("./base");
  const { buildPedido } = require("./pedido");
  const { buildPlatos } = require("./platos");
  const { buildCortes } = require("./cortes");

  let prompt = buildBase();

  if (tomandoPedido) {
    prompt += buildPedido();

    if (necesitaPlatos(textoCliente)) {
      prompt += buildPlatos();
    }

    if (preguntaCorte(textoCliente)) {
      prompt += buildCortes();
    }
  }

  if (esPreventa && horaConfirmada) {
    prompt += `\n\nIMPORTANTE: Este es un pedido de PREVENTA. El cliente recogerá/recibirá su pedido a las ${horaConfirmada}. Incluye este dato en el resumen como "Recolección" o "Hora de entrega" según corresponda.`;
  }

  return prompt;
}

const SYSTEM_PROMPT = "";

module.exports = { buildPrompt, SYSTEM_PROMPT };