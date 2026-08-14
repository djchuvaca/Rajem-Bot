'use strict';

/**
 * src/giros/index.js — Registry de giros de negocio
 *
 * Cada módulo de giro exporta: slug, nombre, emoji, descripcion,
 * configDefaults, itemTypes, cortes, productos, fallbackCortes, promptOverride.
 *
 * Para agregar un nuevo giro: crear src/giros/mi-giro.js y llamar _register().
 */

const _registry = new Map();

function _register(giro) {
  if (!giro || !giro.slug) throw new Error(`[giros] Módulo inválido: falta campo "slug"`);
  _registry.set(giro.slug, Object.freeze(giro));
}

// ── Registro de giros disponibles ─────────────────────────────────────────────
_register(require('./taqueria'));
_register(require('./pizzeria'));
_register(require('./hamburgueseria'));

/**
 * Devuelve el módulo de giro por slug.
 * Nunca retorna null — fallback a taquería si el slug no existe.
 */
function getGiro(slug) {
  return _registry.get(slug) || _registry.get('taqueria');
}

/**
 * Devuelve el giro activo del tenant leyendo business_type_slug de la BD.
 * Uso único en todo el sistema para obtener el giro en tiempo de ejecución.
 * Require lazy de db/config para evitar dependencias circulares.
 */
function getGiroActivo() {
  try {
    const { getConfig } = require('../db/config');
    const slug = (getConfig('business_type_slug') || 'taqueria').trim().toLowerCase();
    return _registry.get(slug) || _registry.get('taqueria');
  } catch (_) {
    return _registry.get('taqueria');
  }
}

/** Lista completa de giros registrados (objetos). */
function listGiros() {
  return [..._registry.values()];
}

/** Lista de slugs disponibles. Útil para validaciones y CLI. */
function getSlugs() {
  return [..._registry.keys()];
}

/**
 * Catálogo canónico del giro. Las tablas SQLite son únicamente una proyección
 * configurable por tenant; ninguna otra plantilla debe definir productos.
 */
function getCatalogo(slug) {
  const giro = getGiro(slug);
  return {
    cortes: (giro.cortes || []).map(c => ({ ...c, categoria: 'corte' })),
    bebidas: (giro.refrescos || []).map(p => ({ ...p, categoria: 'refresco' })),
    salsas: (giro.salsas || []).map(p => ({ ...p, categoria: 'salsa' })),
  };
}

module.exports = { getGiro, getGiroActivo, listGiros, getSlugs, getCatalogo };
