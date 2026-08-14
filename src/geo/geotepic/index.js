// Diccionario maestro de colonias de Tepic, Nayarit.
// La definición vive en admin.db; cada tenant conserva solamente su activación.

const fs = require('fs');
const path = require('path');
const Database = require('better-sqlite3');
const { getAdminDB } = require('../../db/admin');
const CATALOGO_INICIAL = require('./tepic-nayarit.json');

const ROOT_PATH = path.join(__dirname, '../../..');

function slugify(nombre) {
  return String(nombre || '').toLowerCase().normalize('NFD').replace(/[\u0300-\u036f]/g, '')
    .replace(/\s+/g, '-').replace(/[^a-z0-9-]/g, '').replace(/-+/g, '-').replace(/^-|-$/g, '');
}

function esTenantTepic(tenant) {
  return slugify(tenant?.ciudad) === 'tepic' && slugify(tenant?.estado) === 'nayarit';
}

function resolverTenant(tenants, tenantId, dbPath = '') {
  const dbStem = path.basename(dbPath || '', path.extname(dbPath || ''));
  return (tenants || []).find(t => t.id === tenantId)
    || (tenants || []).find(t => path.basename(t.db_path || '', path.extname(t.db_path || '')) === tenantId)
    || (tenants || []).find(t => dbStem && path.resolve(_tenantPath(t)) === path.resolve(dbPath))
    || null;
}

function _tenantPath(tenant) {
  return path.isAbsolute(tenant.db_path) ? tenant.db_path : path.join(ROOT_PATH, tenant.db_path);
}

function _normalizarAliases(aliases) {
  if (typeof aliases === 'string') {
    try { aliases = JSON.parse(aliases); } catch (_) { aliases = aliases.split(','); }
  }
  return JSON.stringify(Array.isArray(aliases) ? aliases.map(a => String(a).trim()).filter(Boolean) : []);
}

function _catalogo() {
  return getAdminDB().prepare(`SELECT id, nombre, slug, tipo, lat, lon, aliases, activo
    FROM geo_tepic_colonias ORDER BY nombre COLLATE NOCASE`).all();
}

function inicializarDesdeTenants(tenants = []) {
  const admin = getAdminDB();
  if (admin.prepare('SELECT COUNT(*) n FROM geo_tepic_colonias').get().n > 0) return 0;
  if (CATALOGO_INICIAL.length) {
    const insert = admin.prepare(`INSERT OR IGNORE INTO geo_tepic_colonias
      (nombre, slug, tipo, lat, lon, aliases, activo) VALUES (?,?,?,?,?,?,1)`);
    admin.transaction(() => {
      for (const c of CATALOGO_INICIAL) insert.run(c.nombre, c.slug || slugify(c.nombre), c.tipo || 'colonia', c.lat, c.lon, _normalizarAliases(c.aliases));
    })();
    return CATALOGO_INICIAL.length;
  }
  const origen = tenants.find(t => esTenantTepic(t) && t.db_path && fs.existsSync(_tenantPath(t)));
  if (!origen) return 0;
  const db = new Database(_tenantPath(origen), { readonly: true });
  try {
    const rows = db.prepare('SELECT nombre, slug, tipo, lat, lon, aliases FROM colonias ORDER BY id').all();
    const insert = admin.prepare(`INSERT OR IGNORE INTO geo_tepic_colonias
      (nombre, slug, tipo, lat, lon, aliases, activo) VALUES (?,?,?,?,?,?,1)`);
    const tx = admin.transaction(() => {
      for (const c of rows) insert.run(c.nombre, c.slug || slugify(c.nombre), c.tipo || 'colonia', c.lat, c.lon, _normalizarAliases(c.aliases));
    });
    tx();
    return rows.length;
  } finally { db.close(); }
}

function listarColonias({ incluirInactivas = true } = {}) {
  const rows = _catalogo();
  return incluirInactivas ? rows : rows.filter(c => c.activo);
}

function guardarColonia({ id, nombre, tipo = 'colonia', lat, lon, aliases = [], activo = 1 }) {
  const db = getAdminDB();
  const slug = slugify(nombre);
  if (!nombre || !slug || !Number.isFinite(Number(lat)) || !Number.isFinite(Number(lon))) throw new Error('Datos de colonia inválidos');
  if (id) {
    const result = db.prepare(`UPDATE geo_tepic_colonias SET nombre=?,slug=?,tipo=?,lat=?,lon=?,aliases=?,activo=?,updated_at=datetime('now','localtime') WHERE id=?`)
      .run(nombre.trim(), slug, tipo, Number(lat), Number(lon), _normalizarAliases(aliases), activo ? 1 : 0, Number(id));
    if (!result.changes) throw new Error('Colonia maestra no encontrada');
    return Number(id);
  }
  return db.prepare(`INSERT INTO geo_tepic_colonias (nombre,slug,tipo,lat,lon,aliases,activo) VALUES (?,?,?,?,?,?,?)`)
    .run(nombre.trim(), slug, tipo, Number(lat), Number(lon), _normalizarAliases(aliases), activo ? 1 : 0).lastInsertRowid;
}

function eliminarColonia(id) {
  return getAdminDB().prepare('DELETE FROM geo_tepic_colonias WHERE id=?').run(Number(id)).changes > 0;
}

function sincronizarTenant(tenant) {
  if (!esTenantTepic(tenant)) throw new Error('GeoTepic solo está disponible para tenants de Tepic, Nayarit');
  const dbPath = _tenantPath(tenant);
  if (!fs.existsSync(dbPath)) throw new Error('Base de datos del tenant no encontrada');
  const db = new Database(dbPath);
  db.pragma('busy_timeout = 5000');
  try {
    try { db.exec('ALTER TABLE colonias ADD COLUMN geo_tepic_id INTEGER'); } catch (_) {}
    db.exec('CREATE UNIQUE INDEX IF NOT EXISTS idx_colonias_geo_tepic_id ON colonias(geo_tepic_id) WHERE geo_tepic_id IS NOT NULL');
    const master = _catalogo();
    const porSlug = db.prepare('SELECT id, activo FROM colonias WHERE slug=?');
    const porNombre = db.prepare('SELECT id, activo FROM colonias WHERE lower(nombre)=lower(?)');
    const link = db.prepare('UPDATE colonias SET geo_tepic_id=?,nombre=?,slug=?,tipo=?,lat=?,lon=?,aliases=? WHERE id=?');
    const update = db.prepare('UPDATE colonias SET nombre=?,slug=?,tipo=?,lat=?,lon=?,aliases=? WHERE geo_tepic_id=?');
    const insert = db.prepare(`INSERT INTO colonias (nombre,slug,tipo,lat,lon,aliases,activo,geo_tepic_id) VALUES (?,?,?,?,?,?,0,?)`);
    db.transaction(() => {
      for (const c of master) {
        const existingLinked = db.prepare('SELECT id FROM colonias WHERE geo_tepic_id=?').get(c.id);
        if (existingLinked) update.run(c.nombre, c.slug, c.tipo, c.lat, c.lon, c.aliases, c.id);
        else {
          const legacy = porSlug.get(c.slug) || porNombre.get(c.nombre);
          if (legacy) link.run(c.id, c.nombre, c.slug, c.tipo, c.lat, c.lon, c.aliases, legacy.id);
          else insert.run(c.nombre, c.slug, c.tipo, c.lat, c.lon, c.aliases, c.id);
        }
        if (!c.activo) db.prepare('UPDATE colonias SET activo=0 WHERE geo_tepic_id=?').run(c.id);
      }
      db.prepare(`UPDATE colonias SET activo=0 WHERE geo_tepic_id IS NOT NULL AND geo_tepic_id NOT IN (${master.map(() => '?').join(',') || 'NULL'})`)
        .run(...master.map(c => c.id));
    })();
    return master.length;
  } finally { db.close(); }
}

function listarParaTenant(tenant) {
  sincronizarTenant(tenant);
  const activos = new Set(_catalogo().filter(c => c.activo).map(c => c.id));
  const db = new Database(_tenantPath(tenant), { readonly: true });
  try { return db.prepare('SELECT * FROM colonias WHERE geo_tepic_id IS NOT NULL ORDER BY nombre COLLATE NOCASE').all().filter(c => activos.has(c.geo_tepic_id)); }
  finally { db.close(); }
}

function activarEnTenant(tenant, geoTepicId, activo) {
  const master = getAdminDB().prepare('SELECT activo FROM geo_tepic_colonias WHERE id=?').get(Number(geoTepicId));
  if (!master || (activo && !master.activo)) return false;
  sincronizarTenant(tenant);
  const db = new Database(_tenantPath(tenant));
  db.pragma('busy_timeout = 5000');
  try { return db.prepare('UPDATE colonias SET activo=? WHERE geo_tepic_id=?').run(activo ? 1 : 0, Number(geoTepicId)).changes > 0; }
  finally { db.close(); }
}

module.exports = { esTenantTepic, resolverTenant, inicializarDesdeTenants, listarColonias, guardarColonia, eliminarColonia, sincronizarTenant, listarParaTenant, activarEnTenant };
