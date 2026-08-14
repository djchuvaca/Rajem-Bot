/**
 * db/business-types.js
 * Consultas y caché para tipos de negocio (business_types) y presentaciones.
 *
 * Cada tenant tiene 'business_type_slug' en configuracion que determina qué
 * plantilla de item_types y NLU patterns usa el bot. Los item_types reemplazan
 * el concepto hardcodeado de "taco/torta" con tipos configurables por negocio.
 */

const { queryAll, queryOne } = require('./core');

const _TTL_MS = 60 * 1000;

// ── CACHÉ ─────────────────────────────────────────────────────────────────────
let _cache     = null;
let _cacheTs   = 0;
let _cacheSlug = null;

function _bustCache() {
  _cache     = null;
  _cacheTs   = 0;
  _cacheSlug = null;
}

// Sin fallback hardcodeado — si no hay item_types activos en BD, devuelve vacío.
// El Superadmin activa los tipos; el menú refleja solo lo habilitado para el tenant.
function _defaultItemTypes() { return []; }

// ── BUSINESS TYPES ────────────────────────────────────────────────────────────

function getBusinessType(slug) {
  try {
    return queryOne('SELECT * FROM business_types WHERE slug = ? AND activo = 1', [slug]) || null;
  } catch (_) { return null; }
}

// ── ITEM TYPES ────────────────────────────────────────────────────────────────

/**
 * Devuelve los item_types activos para el business_type_slug indicado.
 * Si no se pasa slug, lee 'business_type_slug' de configuracion.
 * Cachea con TTL de 60s.
 */
function getItemTypes(businessTypeSlug) {
  const { getConfig } = require('./config');
  const slug = businessTypeSlug || getConfig('business_type_slug') || 'taqueria';
  const ahora = Date.now();

  if (_cache && _cacheSlug === slug && ahora - _cacheTs < _TTL_MS) return _cache;

  try {
    const bt = queryOne('SELECT id FROM business_types WHERE slug = ?', [slug]);
    if (!bt) {
      _cache = _defaultItemTypes();
    } else {
      const tipos = queryAll(
        'SELECT * FROM item_types WHERE business_type_id = ? AND activo = 1 ORDER BY id',
        [bt.id]
      );
      _cache = tipos && tipos.length ? tipos : _defaultItemTypes();
    }
  } catch (_) {
    _cache = _defaultItemTypes();
  }

  _cacheTs   = ahora;
  _cacheSlug = slug;
  return _cache;
}

function invalidarCacheItemTypes() { _bustCache(); }

function getBusinessTypeSlug() {
  try {
    const { getConfig } = require('./config');
    return getConfig('business_type_slug') || 'taqueria';
  } catch (_) { return 'taqueria'; }
}

module.exports = {
  // Business types
  getBusinessType,
  // Item types
  getItemTypes,
  invalidarCacheItemTypes,
  getBusinessTypeSlug,
};
