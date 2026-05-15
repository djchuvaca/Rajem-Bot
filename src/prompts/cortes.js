// prompts/cortes.js — Descripciones detalladas de los cortes
// Se usa SOLO cuando el cliente pregunta explícitamente por un corte

const { getProductos } = require("../db");

function buildCortes() {
  const productos = getProductos();

  let texto = "\nDESCRIPCIÓN DE CORTES:\n";
  for (const p of productos) {
    const nombre = p.nombre.toUpperCase();
    texto += `\n🥩 *${nombre}* — ${p.descripcion}`;
  }
  texto += "\n\nDescribe el corte con entusiasmo y luego pregunta si le gustaría pedirlo.";
  return texto;
}

// Detectar si el mensaje pregunta por algún corte
function preguntaCorte(texto) {
  return /qu[eé]\s+es\s+(el\s+)?(surtido|carner|carne|buche|cuero|lengua)|cu[eé]ntame|c[oó]mo\s+es\s+(el\s+)?(surtido|carner|carne|buche|cuero|lengua)|qu[eé]\s+tiene|de\s+qu[eé]\s+(es|tiene|se\s+trata)/i.test(texto);
}

module.exports = { buildCortes, preguntaCorte };