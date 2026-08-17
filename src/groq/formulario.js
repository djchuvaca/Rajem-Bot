'use strict';

// Extractor de datos del formulario de pedido para mensajes que el parser local no interpretó.
// No necesita contexto de menú — solo sabe qué campos faltan y extrae del texto libre.

const { groqJSON } = require('./client');

const _SISTEMA = `Eres un extractor de datos de contacto y domicilio para una taquería. Devuelve SOLO JSON válido.
Extrae del mensaje los datos del cliente que encuentres claramente.
Campos posibles:
- nombre: nombre completo de la persona
- telefono: número mexicano de 10 dígitos (devuelve SOLO dígitos, sin espacios ni guiones ni +52)
- calle: nombre de la calle con número (ej: "Av. Reforma 456")
- colonia: nombre del barrio o fraccionamiento (ej: "Los Fresnos", "Centro", "Jardines del Sur")
- referencia: cómo llegar o punto de referencia cercano (ej: "cerca del oxxo", "junto a la preparatoria")
Omite campos ambiguos o que no puedas determinar con claridad. Si no hay ningún dato claro: {"tipo":"null"}`;

/**
 * Intenta extraer datos del formulario de un mensaje que el parser local no capturó.
 * Solo devuelve los campos que encontró con claridad; omite los ambiguos.
 * La colonia se devuelve como candidato crudo — el caller debe validarla contra el diccionario geo.
 *
 * @param {string}   texto          - Mensaje original del cliente
 * @param {string[]} camposFaltantes - Campos que aún no están en datosCampos
 * @returns {Object|null} Campos extraídos o null
 */
async function extraerDatosFormularioConGroq(texto, camposFaltantes) {
  if (!camposFaltantes || camposFaltantes.length === 0) return null;

  const user = `Campos que faltan: ${camposFaltantes.join(', ')}\nMensaje del cliente: "${texto}"`;

  const res = await groqJSON(_SISTEMA, user);
  if (!res || res.tipo === 'null') return null;

  const extraido = {};
  for (const campo of camposFaltantes) {
    const val = res[campo];
    if (val && typeof val === 'string' && val.trim()) {
      extraido[campo] = val.trim();
    }
  }

  // Validar teléfono: LADA mexicana (primer dígito 2-9), exactamente 10 dígitos
  if (extraido.telefono) {
    const tel    = extraido.telefono.replace(/\D/g, '');
    const sinPais = tel.length > 10 ? tel.slice(-10) : tel;
    if (/^[2-9]\d{9}$/.test(sinPais)) {
      extraido.telefono = sinPais;
    } else {
      delete extraido.telefono;
    }
  }

  return Object.keys(extraido).length > 0 ? extraido : null;
}

module.exports = { extraerDatosFormularioConGroq };
