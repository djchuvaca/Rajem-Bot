'use strict';

/**
 * Modelo neutral de operaciones de modificación de pedido.
 *
 * No conoce tacos, cortes ni sabores. Las operaciones son estructuras
 * inmutables que cualquier handler puede aplicar sobre el modelo neutral de
 * pedido (src/pedido/modelo.js) sin volver a interpretar el texto del cliente.
 *
 * Convive con el sistema de modificaciones heredado (detectarModificacion /
 * aplicarModificacion en respuestas.js). Los handlers se migrarán gradualmente
 * en la Fase 8.
 */

const VERSION_OPERACION = 1;

const TIPOS_OPERACION = Object.freeze([
  'eliminar_partida',
  'reducir_cantidad',
  'cambiar_variante',
  'cambiar_formato',
  'agregar_item',
  'cambiar_agrupacion',
]);

// ── Fábricas ──────────────────────────────────────────────────────────────────

function crearSelector({ formatoSlug = null, productoSlug = null, cantidad = null } = {}) {
  return { formatoSlug, productoSlug, cantidad };
}

function crearOperacion(tipo, params = {}) {
  if (!TIPOS_OPERACION.includes(tipo)) throw new TypeError(`Tipo de operación inválido: ${tipo}`);
  return { tipo, version: VERSION_OPERACION, ...params };
}

// ── Validación ────────────────────────────────────────────────────────────────

function validarOperacion(op) {
  const errores = [];
  if (!op || typeof op !== 'object') return { valida: false, errores: ['la operación debe ser un objeto'] };
  if (!TIPOS_OPERACION.includes(op.tipo)) {
    return { valida: false, errores: [`tipo "${op.tipo}" no es válido`] };
  }
  switch (op.tipo) {
    case 'eliminar_partida':
      if (!op.selector || typeof op.selector !== 'object') errores.push('eliminar_partida requiere selector');
      break;
    case 'reducir_cantidad':
      if (!op.selector || typeof op.selector !== 'object') errores.push('reducir_cantidad requiere selector');
      if (typeof op.cantidad !== 'number' || op.cantidad <= 0) errores.push('reducir_cantidad requiere cantidad > 0');
      break;
    case 'cambiar_variante':
      if (!op.de || typeof op.de !== 'string') errores.push('cambiar_variante requiere de');
      if (!op.a  || typeof op.a  !== 'string') errores.push('cambiar_variante requiere a');
      break;
    case 'cambiar_formato':
      if (!op.de || typeof op.de !== 'string') errores.push('cambiar_formato requiere de');
      if (!op.a  || typeof op.a  !== 'string') errores.push('cambiar_formato requiere a');
      break;
    case 'agregar_item':
      if (!op.item || typeof op.item !== 'object') errores.push('agregar_item requiere item');
      break;
    case 'cambiar_agrupacion':
      if (!op.selector || typeof op.selector !== 'object') errores.push('cambiar_agrupacion requiere selector');
      break;
  }
  return { valida: errores.length === 0, errores };
}

// ── Matching de selector ──────────────────────────────────────────────────────

function _coincideSelector(partida, selector) {
  if (!selector || partida.tipo !== 'producto') return false;
  if (selector.formatoSlug  != null && partida.formatoSlug  !== selector.formatoSlug)  return false;
  if (selector.productoSlug != null && partida.productoSlug !== selector.productoSlug) return false;
  if (selector.cantidad     != null && partida.cantidad?.valor !== selector.cantidad)   return false;
  return true;
}

// ── Aplicación de operaciones ─────────────────────────────────────────────────

/**
 * Aplica una operación neutral sobre un pedido en formato modelo neutral.
 * Devuelve `{ pedido }` en caso de éxito o `{ error }` en caso de fallo.
 * Nunca muta el pedido original — retorna una copia nueva.
 */
function aplicarOperacion(operacion, pedido) {
  const validacion = validarOperacion(operacion);
  if (!validacion.valida) return { error: `Operación inválida: ${validacion.errores.join('; ')}` };
  if (!pedido || pedido.tipo !== 'pedido' || !Array.isArray(pedido.partidas)) {
    return { error: 'El pedido neutral es inválido' };
  }
  switch (operacion.tipo) {
    case 'eliminar_partida': return _eliminarPartida(operacion, pedido);
    case 'reducir_cantidad': return _reducirCantidad(operacion, pedido);
    case 'cambiar_variante': return _cambiarVariante(operacion, pedido);
    case 'cambiar_formato':  return _cambiarFormato(operacion, pedido);
    case 'agregar_item':     return _agregarItem(operacion, pedido);
    default: return { error: `Operación "${operacion.tipo}" no implementada aún` };
  }
}

function _eliminarPartida(op, pedido) {
  const indices = pedido.partidas.reduce((acc, p, i) => {
    if (_coincideSelector(p, op.selector)) acc.push(i);
    return acc;
  }, []);
  if (indices.length === 0) return { error: 'No se encontró la partida a eliminar' };
  // Ambigüedad solo si el selector no discrimina suficientemente
  if (indices.length > 1 && !op.selector.productoSlug && !op.selector.formatoSlug) {
    return { error: 'La indicación es ambigua: hay varias partidas que podrían eliminarse' };
  }
  const idx = indices[0];
  const nuevasPartidas = [...pedido.partidas.slice(0, idx), ...pedido.partidas.slice(idx + 1)];
  if (nuevasPartidas.length === 0) return { error: 'No puede quedar un pedido vacío' };
  return { pedido: { ...pedido, partidas: nuevasPartidas } };
}

function _reducirCantidad(op, pedido) {
  const idx = pedido.partidas.findIndex(p => _coincideSelector(p, op.selector));
  if (idx === -1) return { error: 'No se encontró la partida a reducir' };
  const partida = pedido.partidas[idx];
  if (partida.cantidad.tipo !== 'unidad') return { error: 'Solo se pueden reducir partidas de tipo unidad' };
  const nuevaCantidad = partida.cantidad.valor - op.cantidad;
  if (nuevaCantidad <= 0) {
    const nuevasPartidas = [...pedido.partidas.slice(0, idx), ...pedido.partidas.slice(idx + 1)];
    if (nuevasPartidas.length === 0) return { error: 'No puede quedar un pedido vacío' };
    return { pedido: { ...pedido, partidas: nuevasPartidas } };
  }
  const nuevaPartida = { ...partida, cantidad: { ...partida.cantidad, valor: nuevaCantidad } };
  const nuevasPartidas = [
    ...pedido.partidas.slice(0, idx),
    nuevaPartida,
    ...pedido.partidas.slice(idx + 1),
  ];
  return { pedido: { ...pedido, partidas: nuevasPartidas } };
}

function _cambiarVariante(op, pedido) {
  let encontrado = false;
  const nuevasPartidas = pedido.partidas.map(p => {
    if (p.tipo === 'producto' && p.productoSlug === op.de) {
      encontrado = true;
      return { ...p, productoSlug: op.a };
    }
    return p;
  });
  if (!encontrado) return { error: `No se encontró la variante "${op.de}" en el pedido` };
  return { pedido: { ...pedido, partidas: nuevasPartidas } };
}

function _cambiarFormato(op, pedido) {
  let encontrado = false;
  const nuevasPartidas = pedido.partidas.map(p => {
    if (p.tipo === 'producto' && p.formatoSlug === op.de) {
      encontrado = true;
      return { ...p, formatoSlug: op.a };
    }
    return p;
  });
  if (!encontrado) return { error: `No se encontró el formato "${op.de}" en el pedido` };
  return { pedido: { ...pedido, partidas: nuevasPartidas } };
}

function _agregarItem(op, pedido) {
  const { item } = op;
  const { formatoSlug = null, productoSlug = null, cantidad: cantOp } = item;
  const incremento = (cantOp?.tipo === 'unidad' && cantOp.valor > 0) ? cantOp.valor : 1;

  // Buscar partida existente compatible para incrementar
  const idx = pedido.partidas.findIndex(p =>
    p.tipo === 'producto' &&
    (formatoSlug  == null || p.formatoSlug  === formatoSlug) &&
    (productoSlug == null || p.productoSlug === productoSlug)
  );
  if (idx !== -1) {
    const partida = pedido.partidas[idx];
    if (partida.cantidad.tipo !== 'unidad') {
      return { error: 'Solo se puede incrementar partidas de tipo unidad' };
    }
    const nuevaPartida = {
      ...partida,
      cantidad: { ...partida.cantidad, valor: partida.cantidad.valor + incremento },
    };
    const nuevasPartidas = [
      ...pedido.partidas.slice(0, idx),
      nuevaPartida,
      ...pedido.partidas.slice(idx + 1),
    ];
    return { pedido: { ...pedido, partidas: nuevasPartidas } };
  }

  // Nueva partida — requiere formatoSlug mínimo
  if (!formatoSlug) {
    return { error: 'No se encontró partida existente para agregar y no se especificó presentación' };
  }
  const nuevaPartida = {
    tipo: 'producto',
    formatoSlug,
    productoSlug,
    cantidad: { tipo: 'unidad', valor: incremento },
    combinacion: [],
    extras: [],
    metadata: {},
  };
  return { pedido: { ...pedido, partidas: [...pedido.partidas, nuevaPartida] } };
}

module.exports = {
  VERSION_OPERACION,
  TIPOS_OPERACION,
  crearSelector,
  crearOperacion,
  validarOperacion,
  aplicarOperacion,
};
