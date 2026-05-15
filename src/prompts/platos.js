// prompts/platos.js — ya no necesita instrucciones de cálculo, el código lo hace todo

function buildPlatos() {
  return ""; // Las instrucciones de platos ya están en pedido.js
}

function necesitaPlatos(texto) {
  return /y\s+aparte|para\s+m[ií]|para\s+ella|para\s+[eé]l|separado|otro\s+plato|y\s+adem[aá]s|de\s+\d+\s+en\s+\d+|de\s+a\s+\d+|en\s+pares|en\s+tr[ií]os|platos?\s+de|[oó]rdenes?\s+de|porciones?\s+de|cada\s+uno|para\s+cada/i.test(texto);
}

module.exports = { buildPlatos, necesitaPlatos };