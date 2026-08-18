'use strict';

/**
 * Contrato público de un Giro.
 *
 * Esta capa normaliza los módulos históricos sin cambiar todavía a sus
 * consumidores. Los handlers podrán migrarse gradualmente a esta interfaz y
 * dejar de conocer conceptos particulares como taco, corte o plato.
 */

const VERSION_CONTRATO_GIRO = 1;
const modeloPedido = require('../pedido/modelo');
const { crearConversacionGiro } = require('./conversacion');
const modeloModificaciones = require('./modificaciones');
const motorPrecios = require('./precios');

const CAMPOS_GIRO_REQUERIDOS = Object.freeze([
  'slug',
  'nombre',
  'itemTypes',
  'cortes',
  'vocabulario',
  'comportamiento',
]);

const FUNCIONES_NLU_REQUERIDAS = Object.freeze([
  'parsearPedidoSimple',
  'detectarSinCorte',
  'detectarSinTipo',
  'detectarPreguntaFrecuente',
  'detectarTodasPreguntasFrecuentes',
  'detectarModificacion',
  'calcularScore',
]);

function _assertCadena(valor, ruta, errores) {
  if (typeof valor !== 'string' || !valor.trim()) errores.push(`${ruta} debe ser una cadena no vacía`);
}

function validarDefinicionGiro(giro) {
  const errores = [];
  if (!giro || typeof giro !== 'object') return { valido: false, errores: ['el Giro debe ser un objeto'] };

  for (const campo of CAMPOS_GIRO_REQUERIDOS) {
    if (giro[campo] == null) errores.push(`falta el campo requerido "${campo}"`);
  }
  _assertCadena(giro.slug, 'slug', errores);
  _assertCadena(giro.nombre, 'nombre', errores);

  if (!Array.isArray(giro.itemTypes) || giro.itemTypes.length === 0) {
    errores.push('itemTypes debe contener al menos una presentación');
  } else {
    const slugs = new Set();
    giro.itemTypes.forEach((item, i) => {
      _assertCadena(item?.slug, `itemTypes[${i}].slug`, errores);
      _assertCadena(item?.nombre, `itemTypes[${i}].nombre`, errores);
      if (item?.slug && slugs.has(item.slug)) errores.push(`itemTypes contiene el slug duplicado "${item.slug}"`);
      if (item?.slug) slugs.add(item.slug);
    });
  }

  if (!Array.isArray(giro.cortes)) errores.push('cortes debe ser un arreglo');
  else {
    const slugs = new Set();
    giro.cortes.forEach((producto, i) => {
      _assertCadena(producto?.slug, `cortes[${i}].slug`, errores);
      _assertCadena(producto?.nombre, `cortes[${i}].nombre`, errores);
      if (producto?.slug && slugs.has(producto.slug)) errores.push(`cortes contiene el slug duplicado "${producto.slug}"`);
      if (producto?.slug) slugs.add(producto.slug);
    });
  }

  if (giro.vocabulario && typeof giro.vocabulario !== 'object') errores.push('vocabulario debe ser un objeto');
  if (giro.comportamiento && typeof giro.comportamiento !== 'object') errores.push('comportamiento debe ser un objeto');
  return { valido: errores.length === 0, errores };
}

function validarNluGiro(nlu) {
  const errores = [];
  if (!nlu || typeof nlu !== 'object') return { valido: false, errores: ['el NLU debe ser un objeto'] };
  for (const funcion of FUNCIONES_NLU_REQUERIDAS) {
    if (typeof nlu[funcion] !== 'function') errores.push(`falta la función NLU "${funcion}"`);
  }
  return { valido: errores.length === 0, errores };
}

function _resultadoDatoFaltante(tipo, detalle = {}) {
  return Object.freeze({ estado: 'dato_faltante', campo: tipo, ...detalle });
}

function crearContratoGiro(giro, cargarNlu) {
  const definicion = validarDefinicionGiro(giro);
  if (!definicion.valido) {
    throw new TypeError(`[giros:${giro?.slug || 'desconocido'}] Contrato inválido: ${definicion.errores.join('; ')}`);
  }
  if (typeof cargarNlu !== 'function') throw new TypeError(`[giros:${giro.slug}] cargarNlu debe ser una función`);

  // Módulos opcionales de Giro — cargados de forma diferida por convención de ruta.
  // Si el giro no los implementa (ej. pizzería en Fase 6), la función retorna null.
  let _preciosMod;
  const obtenerModuloPrecios = () => {
    if (_preciosMod === undefined) {
      try { _preciosMod = require(`./${giro.slug}/precios`); } catch (_) { _preciosMod = null; }
    }
    return _preciosMod;
  };

  let _presentacionMod;
  const obtenerModuloPresentacion = () => {
    if (_presentacionMod === undefined) {
      try { _presentacionMod = require(`./${giro.slug}/presentacion`); } catch (_) { _presentacionMod = null; }
    }
    return _presentacionMod;
  };

  let nluCache;
  const obtenerNlu = () => {
    if (!nluCache) {
      nluCache = cargarNlu();
      const validacion = validarNluGiro(nluCache);
      if (!validacion.valido) {
        throw new TypeError(`[giros:${giro.slug}] NLU incompatible: ${validacion.errores.join('; ')}`);
      }
    }
    return nluCache;
  };
  const llamar = (nombre, fallback, ...args) => {
    const fn = obtenerNlu()[nombre];
    return typeof fn === 'function' ? fn(...args) : fallback;
  };

  const conversacion = crearConversacionGiro(giro);
  const contrato = {
    version: VERSION_CONTRATO_GIRO,
    slug: giro.slug,
    identidad: Object.freeze({
      slug: giro.slug,
      nombre: giro.nombre,
      emoji: giro.emoji || '',
      descripcion: giro.descripcion || '',
    }),
    catalogo: Object.freeze({
      presentaciones: giro.itemTypes,
      variantes: giro.cortes,
      bebidas: giro.refrescos || [],
      complementos: giro.salsas || [],
    }),
    vocabulario: giro.vocabulario,
    capacidades: Object.freeze({
      ventaPorPeso: !!giro.comportamiento.soportaVentaPorPeso,
      mitadMitad: !!giro.comportamiento.soportaMitadMitad,
      todoMenos: !!giro.comportamiento.soportaTodoMenosX,
      porcionado: !!giro.comportamiento.soportaPorcionado,
      tarjetaSoloMostrador: !!giro.comportamiento.tarjetaSoloMostrador,
    }),
    conversacion,

    // API neutral que consumirán progresivamente los handlers.
    parsearPedido: (texto, _contexto = {}) => llamar('parsearPedidoSimple', null, texto),
    parsearPedidoNormalizado: (texto, _contexto = {}) => {
      const resultado = llamar('parsearPedidoSimple', null, texto);
      return resultado?.tipo === 'pedido' ? modeloPedido.pedidoDesdeLegacy(resultado) : resultado;
    },
    normalizarPedido: modeloPedido.pedidoDesdeLegacy,
    convertirPedidoLegacy: modeloPedido.pedidoALegacy,
    validarPedido: modeloPedido.validarPedido,
    detectarDatoFaltante: (texto, _contexto = {}) => {
      const variante = llamar('detectarSinCorte', null, texto);
      if (variante) return _resultadoDatoFaltante('variante', { presentacion: variante });
      const presentacion = llamar('detectarSinTipo', null, texto);
      if (presentacion) return _resultadoDatoFaltante('presentacion', { detalle: presentacion });
      return null;
    },
    detectarModificacion: (texto, _pedido, _contexto = {}) => llamar('detectarModificacion', null, texto),
    // Fase 5 — operaciones neutrales (opcional por Giro; pizzería/hamburguesería devuelven null)
    detectarModificacionNeutral: (texto, _contexto = {}) => llamar('detectarModificacionNeutral', null, texto),
    aplicarOperacion: modeloModificaciones.aplicarOperacion,
    // Fase 6 — precios y presentación neutrales (opcional por Giro; 0 / '' si no implementado)
    calcularPrecioPartida: (partida) => {
      const mod = obtenerModuloPrecios();
      if (!mod) return 0;
      return motorPrecios.calcularPartida(partida, mod.crearResolver());
    },
    calcularPrecioPedido: (pedido) => {
      const mod = obtenerModuloPrecios();
      if (!mod) return 0;
      return motorPrecios.calcularPedido(pedido, mod.crearResolver());
    },
    formatearPartida: (partida, precio) => {
      const mod = obtenerModuloPresentacion();
      if (!mod) return '';
      return mod.formatearPartida(partida, precio, giro);
    },
    formatearPedido: (pedido) => {
      const modPres = obtenerModuloPresentacion();
      const modPrec = obtenerModuloPrecios();
      if (!modPres || !modPrec) return '';
      return modPres.formatearPedido(pedido, modPrec.crearResolver(), giro);
    },
    detectarPregunta: texto => llamar('detectarPreguntaFrecuente', null, texto),
    detectarPreguntas: texto => llamar('detectarTodasPreguntasFrecuentes', [], texto),
    calcularConfianza: texto => llamar('calcularScore', 0, texto),
    separarComplementos: texto => llamar('separarRefresco', { textoLimpio: texto, refrescos: [], salsas: [] }, texto),
    parsearPorcionado: (texto, _contexto = {}) => llamar('parsearPorcionado', null, texto),
    parsearDistribucionVariantes: texto => llamar('parsearDistribucionCortes', null, texto),
    // Acceso a variantes/cortes del Giro activo — sin acoplar handlers al NLU directamente.
    listaVariantes: () => {
      try {
        const catalogo = require('./catalogo-tenant');
        const cortesItems = catalogo.getMenuItemsActivos('corte');
        if (cortesItems.length > 0) {
          const cortesDB = catalogo.getCortesTenant();
          const porSlug = Object.fromEntries(cortesDB.map(c => [c.slug, c]));
          const excluidos = new Set(giro.comportamiento?.variantesExcluidasLista || []);
          const slugsUnicos = [...new Set(cortesItems.map(i => i.producto_slug))].filter(s => !excluidos.has(s));
          const nombres = slugsUnicos.map(s => porSlug[s]?.nombre || s).filter(Boolean);
          if (nombres.length > 0) return nombres.map(n => n.charAt(0).toUpperCase() + n.slice(1)).join(', ');
        }
      } catch (_) {}
      const nlu = obtenerNlu();
      const cortes = typeof nlu.getCortes === 'function' ? nlu.getCortes() : {};
      const unicos = [...new Set(Object.values(cortes))];
      if (unicos.length === 0) return giro.vocabulario?.sinVariantes || 'las opciones disponibles';
      return unicos.map(c => c.charAt(0).toUpperCase() + c.slice(1)).join(', ');
    },
    buscarVariante: (texto) => llamar('buscarCorteFuzzy', null, texto),
    getMapaVariantes: () => llamar('getCortes', {}),
    obtenerNlu,
  };

  return Object.freeze(contrato);
}

module.exports = {
  VERSION_CONTRATO_GIRO,
  CAMPOS_GIRO_REQUERIDOS,
  FUNCIONES_NLU_REQUERIDAS,
  validarDefinicionGiro,
  validarNluGiro,
  crearContratoGiro,
};
