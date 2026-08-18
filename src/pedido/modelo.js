'use strict';

/**
 * Modelo neutral de pedido.
 *
 * No conoce tacos, tortas, cortes ni sabores. Durante la migración convive
 * con el JSON histórico y proporciona adaptadores sin pérdida de información.
 */

const VERSION_MODELO_PEDIDO = 1;
const TIPOS_CANTIDAD = Object.freeze(['unidad', 'peso', 'importe']);
const TIPOS_PARTIDA = Object.freeze(['producto', 'agrupacion']);

function _numeroPositivo(valor) {
  const numero = Number(valor);
  return Number.isFinite(numero) && numero > 0 ? numero : null;
}

function crearCantidad(tipo, valor) {
  if (!TIPOS_CANTIDAD.includes(tipo)) throw new TypeError(`Tipo de cantidad inválido: ${tipo}`);
  const numero = _numeroPositivo(valor);
  if (numero == null) throw new TypeError(`La cantidad ${tipo} debe ser mayor que cero`);
  return { tipo, valor: numero };
}

function crearPartidaProducto({ formatoSlug, productoSlug = null, cantidad, combinacion = [], extras = [], metadata = {} }) {
  if (typeof formatoSlug !== 'string' || !formatoSlug.trim()) {
    throw new TypeError('Una partida de producto requiere formatoSlug');
  }
  if (!cantidad || !TIPOS_CANTIDAD.includes(cantidad.tipo) || _numeroPositivo(cantidad.valor) == null) {
    throw new TypeError('Una partida de producto requiere una cantidad válida');
  }
  return {
    tipo: 'producto',
    formatoSlug: formatoSlug.trim(),
    productoSlug: typeof productoSlug === 'string' && productoSlug.trim() ? productoSlug.trim() : null,
    cantidad: crearCantidad(cantidad.tipo, cantidad.valor),
    combinacion: Array.isArray(combinacion) ? [...combinacion] : [],
    extras: Array.isArray(extras) ? [...extras] : [],
    metadata: metadata && typeof metadata === 'object' ? { ...metadata } : {},
  };
}

function crearPartidaAgrupacion({ modo, grupos = 1, numero = null, partidas, metadata = {} }) {
  if (!['repetida', 'separada'].includes(modo)) throw new TypeError(`Modo de agrupación inválido: ${modo}`);
  if (!Array.isArray(partidas) || partidas.length === 0) throw new TypeError('Una agrupación requiere partidas');
  const cantidadGrupos = _numeroPositivo(grupos);
  if (cantidadGrupos == null || !Number.isInteger(cantidadGrupos)) throw new TypeError('grupos debe ser un entero positivo');
  return {
    tipo: 'agrupacion',
    modo,
    grupos: cantidadGrupos,
    numero: numero == null ? null : Number(numero),
    partidas: partidas.map(partida => ({ ...partida })),
    metadata: metadata && typeof metadata === 'object' ? { ...metadata } : {},
  };
}

function crearPedido(partidas, metadata = {}) {
  if (!Array.isArray(partidas)) throw new TypeError('partidas debe ser un arreglo');
  return {
    tipo: 'pedido',
    versionModelo: VERSION_MODELO_PEDIDO,
    partidas,
    metadata: metadata && typeof metadata === 'object' ? { ...metadata } : {},
  };
}

function _combinacionDesdeLegacy(item) {
  if (Array.isArray(item.corte)) return [...item.corte];
  if (typeof item.combinacion === 'string' && item.combinacion.trim()) {
    return item.combinacion.split(/\s+con\s+|\s*,\s*/i).map(x => x.trim()).filter(Boolean);
  }
  if (typeof item.corte === 'string' && item.corte.includes(', ')) return item.corte.split(', ').filter(Boolean);
  return [];
}

function partidaDesdeLegacy(item) {
  if (!item || typeof item !== 'object') throw new TypeError('Ítem legacy inválido');

  if (item.presentacion === 'grupo_repetido') {
    return crearPartidaAgrupacion({
      modo: 'repetida',
      grupos: item.grupos,
      partidas: (item.items_por_grupo || []).map(partidaDesdeLegacy),
      metadata: { presentacionLegacy: 'grupo_repetido' },
    });
  }
  if (item.presentacion === 'plato_separado') {
    return crearPartidaAgrupacion({
      modo: 'separada',
      grupos: 1,
      numero: item.numero,
      partidas: (item.items || []).map(partidaDesdeLegacy),
      metadata: { presentacionLegacy: 'plato_separado' },
    });
  }

  let cantidad;
  if (item.presentacion === 'gramos' || item.gramos != null) cantidad = crearCantidad('peso', item.gramos);
  else if (item.presentacion === 'pesos' || item.monto != null) cantidad = crearCantidad('importe', item.monto);
  else cantidad = crearCantidad('unidad', item.cantidad);

  const conocidos = new Set(['presentacion', 'corte', 'cantidad', 'gramos', 'monto', 'combinacion', 'extras']);
  const metadata = {};
  for (const [clave, valor] of Object.entries(item)) if (!conocidos.has(clave)) metadata[clave] = valor;

  return crearPartidaProducto({
    formatoSlug: item.presentacion,
    productoSlug: typeof item.corte === 'string' ? item.corte : null,
    cantidad,
    combinacion: _combinacionDesdeLegacy(item),
    extras: item.extras || [],
    metadata,
  });
}

function pedidoDesdeLegacy(pedido) {
  if (!pedido || pedido.tipo !== 'pedido' || !Array.isArray(pedido.items)) return null;
  return crearPedido(pedido.items.map(partidaDesdeLegacy), { origen: 'legacy' });
}

function partidaALegacy(partida) {
  if (!partida || !TIPOS_PARTIDA.includes(partida.tipo)) throw new TypeError('Partida neutral inválida');
  if (partida.tipo === 'agrupacion') {
    if (partida.modo === 'repetida') {
      return {
        presentacion: 'grupo_repetido',
        grupos: partida.grupos,
        items_por_grupo: partida.partidas.map(partidaALegacy),
      };
    }
    return {
      presentacion: 'plato_separado',
      numero: partida.numero,
      items: partida.partidas.map(partidaALegacy),
    };
  }

  const item = { presentacion: partida.formatoSlug };
  if (partida.cantidad.tipo === 'unidad') item.cantidad = partida.cantidad.valor;
  else if (partida.cantidad.tipo === 'peso') item.gramos = partida.cantidad.valor;
  else item.monto = partida.cantidad.valor;
  if (partida.productoSlug) item.corte = partida.productoSlug;
  if (partida.combinacion?.length) item.combinacion = partida.combinacion.join(' con ');
  if (partida.extras?.length) item.extras = [...partida.extras];
  Object.assign(item, partida.metadata || {});
  return item;
}

function pedidoALegacy(pedido) {
  const validacion = validarPedido(pedido);
  if (!validacion.valido) throw new TypeError(`Pedido neutral inválido: ${validacion.errores.join('; ')}`);
  return { tipo: 'pedido', items: pedido.partidas.map(partidaALegacy) };
}

function validarPedido(pedido) {
  const errores = [];
  if (!pedido || typeof pedido !== 'object') return { valido: false, errores: ['el pedido debe ser un objeto'] };
  if (pedido.tipo !== 'pedido') errores.push('tipo debe ser "pedido"');
  if (pedido.versionModelo !== VERSION_MODELO_PEDIDO) errores.push(`versionModelo debe ser ${VERSION_MODELO_PEDIDO}`);
  if (!Array.isArray(pedido.partidas)) errores.push('partidas debe ser un arreglo');

  const validarPartida = (partida, ruta) => {
    if (!partida || !TIPOS_PARTIDA.includes(partida.tipo)) {
      errores.push(`${ruta}.tipo no es válido`);
      return;
    }
    if (partida.tipo === 'producto') {
      if (typeof partida.formatoSlug !== 'string' || !partida.formatoSlug) errores.push(`${ruta}.formatoSlug es requerido`);
      if (!partida.cantidad || !TIPOS_CANTIDAD.includes(partida.cantidad.tipo)) errores.push(`${ruta}.cantidad no es válida`);
      else if (_numeroPositivo(partida.cantidad.valor) == null) errores.push(`${ruta}.cantidad.valor debe ser mayor que cero`);
      return;
    }
    if (!['repetida', 'separada'].includes(partida.modo)) errores.push(`${ruta}.modo no es válido`);
    if (!Number.isInteger(partida.grupos) || partida.grupos < 1) errores.push(`${ruta}.grupos debe ser un entero positivo`);
    if (!Array.isArray(partida.partidas) || partida.partidas.length === 0) errores.push(`${ruta}.partidas no puede estar vacío`);
    else partida.partidas.forEach((hija, i) => validarPartida(hija, `${ruta}.partidas[${i}]`));
  };
  if (Array.isArray(pedido.partidas)) pedido.partidas.forEach((partida, i) => validarPartida(partida, `partidas[${i}]`));
  return { valido: errores.length === 0, errores };
}

module.exports = {
  VERSION_MODELO_PEDIDO,
  TIPOS_CANTIDAD,
  TIPOS_PARTIDA,
  crearCantidad,
  crearPartidaProducto,
  crearPartidaAgrupacion,
  crearPedido,
  partidaDesdeLegacy,
  pedidoDesdeLegacy,
  partidaALegacy,
  pedidoALegacy,
  validarPedido,
};

