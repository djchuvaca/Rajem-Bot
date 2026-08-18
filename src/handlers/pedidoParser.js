'use strict';

/**
 * src/handlers/pedidoParser.js — Router delgado de NLU
 *
 * Delegación: carga el módulo NLU del giro activo y re-exporta su interfaz.
 * Todos los importadores existentes continúan funcionando sin cambios.
 *
 * Giros soportados: cualquiera que tenga src/giros/{slug}/nlu.js
 * Fallback automático a taquería si el NLU del giro no existe.
 */

const core = require('../nlu/core');

// ── RESOLUCIÓN LAZY DEL NLU ───────────────────────────────────────────────────
// El NLU se resuelve una sola vez tras el primer uso (la BD ya está lista).
// Se limpia en invalidarCacheCortes() para que el siguiente llamado re-evalúe.

let _nluCache = null;

function _getNlu() {
  if (_nluCache) return _nluCache;
  try {
    const { getGiroActivo } = require('../giros');
    const giro = getGiroActivo();
    try {
      _nluCache = require(`../giros/${giro.slug}/nlu`);
    } catch (_) {
      _nluCache = require('../giros/taqueria/nlu');
    }
  } catch (_) {
    _nluCache = require('../giros/taqueria/nlu');
  }
  return _nluCache;
}

// ── INVALIDAR CACHÉ ───────────────────────────────────────────────────────────

function invalidarCacheCortes() {
  const nluAnterior = _nluCache;
  _nluCache = null;
  try { _getNlu().invalidarCacheCortes(); } catch (_) {}
  // Si el giro cambió, también limpiar el NLU anterior
  if (nluAnterior && nluAnterior !== _nluCache) {
    try { nluAnterior.invalidarCacheCortes(); } catch (_) {}
  }
  core.invalidarCacheItemTypes();
}

// ── PROXY HELPERS ─────────────────────────────────────────────────────────────
// Cada función delega al NLU del giro activo en tiempo de llamada.

const _p = fn => (...args) => _getNlu()[fn](...args);

// ── EXPORTS ───────────────────────────────────────────────────────────────────
// Interfaz idéntica al pedidoParser.js original — cero cambios en importadores.

module.exports = {
  // ── Parsing de pedidos (giro-específico) ─────────────────────────────────
  parsearPedidoSimple:              _p('parsearPedidoSimple'),
  detectarSinCorte:                 _p('detectarSinCorte'),
  detectarSinTipo:                  _p('detectarSinTipo'),
  detectarPreguntaFrecuente:        _p('detectarPreguntaFrecuente'),
  detectarTodasPreguntasFrecuentes: _p('detectarTodasPreguntasFrecuentes'),
  detectarModificacion:             _p('detectarModificacion'),
  // Fase 5 — proxy seguro: null si el giro no lo implementa todavía
  detectarModificacionNeutral: (...args) => {
    const fn = _getNlu()['detectarModificacionNeutral'];
    return typeof fn === 'function' ? fn(...args) : null;
  },
  calcularScore:                    _p('calcularScore'),
  // ── Catálogo (giro-específico) ────────────────────────────────────────────
  getCortes:                        _p('getCortes'),
  getRefrescos:                     _p('getRefrescos'),
  getSalsas:                        _p('getSalsas'),
  detectarRefresco:                 _p('detectarRefresco'),
  detectarSalsa:                    _p('detectarSalsa'),
  detectarComplementosNoDisponibles:_p('detectarComplementosNoDisponibles'),
  separarRefresco:                  _p('separarRefresco'),
  buscarCorteFuzzy:                 _p('buscarCorteFuzzy'),
  parsearDistribucionCortes:        _p('parsearDistribucionCortes'),
  parsearDistribucionRefrescos:     _p('parsearDistribucionRefrescos'),
  detectarPlanPorcionado:           _p('detectarPlanPorcionado'),
  resolverPorcionadoPendiente:      _p('resolverPorcionadoPendiente'),
  // ── Cache ─────────────────────────────────────────────────────────────────
  invalidarCacheCortes,
  // ── Utilidades genéricas (core — giro-independiente) ─────────────────────
  detectarTipoItemDesdeTexto:       core.detectarTipoItemDesdeTexto,
  listaItemTypes:                   core.listaItemTypes,
  normalizar:                       core.normalizar,
  textoANumero:                     (...args) => _getNlu().textoANumero(...args),
  detectarRepetirPedido:            core.detectarRepetirPedido,
};
