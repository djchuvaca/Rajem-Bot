/**
 * db/business-types.js
 * CRUD y caché para tipos de negocio (business_types) y tipos de ítem (item_types).
 *
 * Cada tenant tiene 'business_type_slug' en configuracion que determina qué
 * plantilla de item_types y NLU patterns usa el bot. Los item_types reemplazan
 * el concepto hardcodeado de "taco/torta" con tipos configurables por negocio.
 */

const { queryAll, queryOne, run } = require('./core');

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
// El tenant activa los tipos desde el panel; el menú refleja solo lo configurado.
function _defaultItemTypes() { return []; }

// ── BUSINESS TYPES ────────────────────────────────────────────────────────────

function getAllBusinessTypes() {
  try {
    return queryAll('SELECT * FROM business_types WHERE activo = 1 ORDER BY nombre') || [];
  } catch (_) { return []; }
}

function getBusinessType(slug) {
  try {
    return queryOne('SELECT * FROM business_types WHERE slug = ? AND activo = 1', [slug]) || null;
  } catch (_) { return null; }
}

function createBusinessType(datos) {
  run(
    'INSERT INTO business_types (slug, nombre, descripcion, emoji) VALUES (?,?,?,?)',
    [datos.slug, datos.nombre, datos.descripcion || null, datos.emoji || '🍽️']
  );
  _bustCache();
  return getBusinessType(datos.slug);
}

function updateBusinessType(id, datos) {
  run(
    'UPDATE business_types SET nombre=?, descripcion=?, emoji=?, activo=? WHERE id=?',
    [datos.nombre, datos.descripcion || null, datos.emoji || '🍽️', datos.activo ?? 1, id]
  );
  _bustCache();
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

/**
 * Busca un item_type por su slug dentro del business_type activo del tenant.
 */
function getItemTypeBySlug(itemSlug, businessTypeSlug) {
  const tipos = getItemTypes(businessTypeSlug);
  return tipos.find(t => t.slug === itemSlug) || null;
}

function createItemType(businessTypeSlug, datos) {
  const bt = getBusinessType(businessTypeSlug);
  if (!bt) throw new Error(`Business type no encontrado: ${businessTypeSlug}`);
  run(
    `INSERT INTO item_types
       (business_type_id, slug, nombre, nombre_plural, emoji, aliases_json,
        soporta_gramos, soporta_pesos, precio_campo)
     VALUES (?,?,?,?,?,?,?,?,?)`,
    [
      bt.id, datos.slug, datos.nombre, datos.nombre_plural,
      datos.emoji || '🍽️', JSON.stringify(datos.aliases || []),
      datos.soporta_gramos ? 1 : 0, datos.soporta_pesos ? 1 : 0,
      datos.precio_campo || 'precio_taco',
    ]
  );
  _bustCache();
}

function updateItemType(id, datos) {
  run(
    `UPDATE item_types
     SET nombre=?, nombre_plural=?, emoji=?, aliases_json=?,
         soporta_gramos=?, soporta_pesos=?, precio_campo=?, activo=?
     WHERE id=?`,
    [
      datos.nombre, datos.nombre_plural, datos.emoji || '🍽️',
      JSON.stringify(datos.aliases || []),
      datos.soporta_gramos ? 1 : 0, datos.soporta_pesos ? 1 : 0,
      datos.precio_campo || 'precio_taco', datos.activo ?? 1, id,
    ]
  );
  _bustCache();
}

function deleteItemType(id) {
  run('UPDATE item_types SET activo = 0 WHERE id = ?', [id]);
  _bustCache();
}

function invalidarCacheItemTypes() { _bustCache(); }

// ── TEMPLATE PRODUCTS ─────────────────────────────────────────────────────────

/**
 * Compatibilidad de API: deriva el catálogo directamente del módulo de giro.
 * No existe una segunda fuente de plantillas en SQLite.
 */
function getTemplateProducts(businessTypeSlug) {
  try {
    const { getCatalogo } = require('../giros');
    const catalogo = getCatalogo(businessTypeSlug);
    return [
      ...catalogo.cortes.map(c => ({
        nombre: c.nombre, descripcion: c.descripcion || '', categoria: 'corte',
        precio_taco: c.precio_base || 0, precio_torta: c.precio_base || 0,
        precio_100g: c.precio_base || 0, sinonimos: (c.aliases || []).join(','),
        catalogo_slug: c.slug,
      })),
      ...catalogo.bebidas.map(p => ({
        nombre: p.nombre, descripcion: p.descripcion || '', categoria: 'refresco',
        precio_taco: p.precio || 0, precio_torta: p.precio || 0, precio_100g: 0,
        sinonimos: p.sinonimos || '', catalogo_slug: p.slug || p.nombre,
      })),
      ...catalogo.salsas.map(p => ({
        nombre: p.nombre, descripcion: p.descripcion || '', categoria: 'salsa',
        precio_taco: p.precio || 0, precio_torta: p.precio || 0, precio_100g: 0,
        sinonimos: p.sinonimos || '', catalogo_slug: p.slug || p.nombre,
      })),
    ];
  } catch (_) { return []; }
}

function getBusinessTypeSlug() {
  try {
    const { getConfig } = require('./config');
    return getConfig('business_type_slug') || 'taqueria';
  } catch (_) { return 'taqueria'; }
}

module.exports = {
  // Business types
  getAllBusinessTypes,
  getBusinessType,
  createBusinessType,
  updateBusinessType,
  // Item types
  getItemTypes,
  getItemTypeBySlug,
  createItemType,
  updateItemType,
  deleteItemType,
  invalidarCacheItemTypes,
  // Templates
  getTemplateProducts,
  getBusinessTypeSlug,
};
