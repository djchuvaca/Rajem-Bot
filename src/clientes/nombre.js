'use strict';

/**
 * Divide un nombre capturado por WhatsApp con la regla histórica del sistema:
 * una palabra = nombre; dos = nombre/apellido; tres o más = dos nombres + apellidos.
 */
function dividirNombreCompleto(valor, fallback = 'Cliente') {
  const limpio = String(valor || fallback).trim().replace(/\s+/g, ' ') || fallback;
  const partes = limpio.split(' ');
  if (partes.length === 1) return { nombre: partes[0], apellido: null };
  if (partes.length === 2) return { nombre: partes[0], apellido: partes[1] };
  return { nombre: partes.slice(0, 2).join(' '), apellido: partes.slice(2).join(' ') };
}

module.exports = { dividirNombreCompleto };
