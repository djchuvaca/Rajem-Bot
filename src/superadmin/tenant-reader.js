// src/superadmin/tenant-reader.js
// Lee data/tenants.json y abre conexiones de solo lectura a las BDs de cada tenant.
// El super-admin consulta estas conexiones para mostrar métricas sin modificar datos operativos.

const path     = require('path');
const fs       = require('fs');
const Database = require('better-sqlite3');

const TENANTS_PATH = path.join(__dirname, '../../data/tenants.json');
const ROOT_PATH    = path.join(__dirname, '../../');

// ── Registro de tenants ───────────────────────────────────────────────────────
function getTenants() {
  try {
    const raw = fs.readFileSync(TENANTS_PATH, 'utf8');
    return JSON.parse(raw).tenants || [];
  } catch (_) {
    return [];
  }
}

function saveTenants(tenants) {
  fs.writeFileSync(TENANTS_PATH, JSON.stringify({ tenants }, null, 2), 'utf8');
}

function getTenant(id) {
  return getTenants().find(t => t.id === id) || null;
}

function upsertTenant(datos) {
  const tenants = getTenants();
  const idx = tenants.findIndex(t => t.id === datos.id);
  if (idx >= 0) {
    tenants[idx] = { ...tenants[idx], ...datos };
  } else {
    tenants.push(datos);
  }
  saveTenants(tenants);
}

function deleteTenant(id) {
  saveTenants(getTenants().filter(t => t.id !== id));
}

// ── Conexiones a BDs de tenants (solo lectura para monitoreo) ─────────────────
const _dbCache = new Map();

function _getTenantDB(tenant) {
  if (_dbCache.has(tenant.id)) return _dbCache.get(tenant.id);
  const dbPath = path.isAbsolute(tenant.db_path)
    ? tenant.db_path
    : path.join(ROOT_PATH, tenant.db_path);
  if (!fs.existsSync(dbPath)) return null;
  const db = new Database(dbPath, { readonly: true });
  _dbCache.set(tenant.id, db);
  return db;
}

// ── Métricas por tenant ───────────────────────────────────────────────────────
function getTenantStats(tenant) {
  const db = _getTenantDB(tenant);
  if (!db) return { error: 'BD no encontrada', pedidos_hoy: 0, clientes: 0, sesiones_activas: 0 };

  try {
    const hoy = new Date().toISOString().slice(0, 10);

    const pedidosHoy = db.prepare(
      `SELECT COUNT(*) as n FROM pedidos WHERE date(fecha, 'localtime') = ?`
    ).get(hoy)?.n || 0;

    const confirmadosHoy = db.prepare(
      `SELECT COUNT(*) as n FROM pedidos WHERE date(fecha,'localtime')=? AND estado IN ('confirmado','listo','en_camino')`
    ).get(hoy)?.n || 0;

    const ventasHoy = db.prepare(
      `SELECT ROUND(SUM(total),2) as v FROM pedidos WHERE date(fecha,'localtime')=? AND estado IN ('confirmado','listo','en_camino')`
    ).get(hoy)?.v || 0;

    const pendientes = db.prepare(
      `SELECT COUNT(*) as n FROM pedidos WHERE estado='pendiente'`
    ).get()?.n || 0;

    const totalClientes = db.prepare(
      `SELECT COUNT(*) as n FROM clientes`
    ).get()?.n || 0;

    const sesiones = db.prepare(
      `SELECT COUNT(*) as n FROM sesiones_activas WHERE actualizado_en >= datetime('now','localtime','-35 minutes')`
    ).get()?.n || 0;

    const config = {};
    try {
      db.prepare('SELECT clave, valor FROM configuracion').all()
        .forEach(r => { config[r.clave] = r.valor; });
    } catch (_) {}

    return {
      pedidos_hoy:      pedidosHoy,
      confirmados_hoy:  confirmadosHoy,
      ventas_hoy:       ventasHoy,
      pendientes,
      total_clientes:   totalClientes,
      sesiones_activas: sesiones,
      nombre_negocio:   config.nombre_negocio || tenant.nombre,
      groq_activo:      config.groq_activo === '1',
      pasarela_activa:  config.pasarela_activa || null,
    };
  } catch (e) {
    return { error: e.message };
  }
}

function getTenantConfig(tenant) {
  const db = _getTenantDB(tenant);
  if (!db) return {};
  try {
    const rows = db.prepare('SELECT clave, valor FROM configuracion').all();
    const cfg = {};
    rows.forEach(r => { cfg[r.clave] = r.valor; });
    return cfg;
  } catch (_) { return {}; }
}

function setTenantConfig(tenant, clave, valor) {
  // Para escritura usamos conexión de lectura/escritura (no la readonly del caché)
  const dbPath = path.isAbsolute(tenant.db_path)
    ? tenant.db_path
    : path.join(ROOT_PATH, tenant.db_path);
  if (!fs.existsSync(dbPath)) return false;
  const db = new Database(dbPath);
  try {
    db.prepare('INSERT OR REPLACE INTO configuracion (clave, valor) VALUES (?,?)').run(clave, String(valor ?? ''));
    // Invalidar caché de readonly para que próxima lectura vea el cambio
    if (_dbCache.has(tenant.id)) {
      _dbCache.get(tenant.id).close();
      _dbCache.delete(tenant.id);
    }
    return true;
  } catch (_) { return false; }
  finally { db.close(); }
}

function getTenantPedidos(tenant, { desde, hasta, limit = 50 } = {}) {
  const db = _getTenantDB(tenant);
  if (!db) return [];
  try {
    let sql = `SELECT p.id, p.tipo, p.orden, p.total, p.estado, p.fecha,
                      c.nombre, c.apellido, c.telefono, c.colonia
               FROM pedidos p LEFT JOIN clientes c ON p.cliente_id = c.id`;
    const params = [];
    if (desde && hasta) {
      sql += ` WHERE date(p.fecha,'localtime') BETWEEN ? AND ?`;
      params.push(desde, hasta);
    }
    sql += ` ORDER BY p.fecha DESC LIMIT ?`;
    params.push(limit);
    return db.prepare(sql).all(...params);
  } catch (_) { return []; }
}

function getTenantColonias(tenant) {
  const db = _getTenantDB(tenant);
  if (!db) return [];
  try {
    return db.prepare('SELECT * FROM colonias ORDER BY nombre').all();
  } catch (_) { return []; }
}

function setTenantColonia(tenant, { id, nombre, lat, lon, activo, slug, tipo, aliases }) {
  const dbPath = path.isAbsolute(tenant.db_path)
    ? tenant.db_path
    : path.join(ROOT_PATH, tenant.db_path);
  const db = new Database(dbPath);
  try {
    if (id) {
      db.prepare(`UPDATE colonias SET nombre=?,lat=?,lon=?,activo=?,slug=?,tipo=?,aliases=? WHERE id=?`)
        .run(nombre, lat, lon, activo ?? 1, slug || '', tipo || 'colonia', JSON.stringify(aliases || []), id);
    } else {
      db.prepare(`INSERT INTO colonias (nombre,lat,lon,activo,slug,tipo,aliases) VALUES (?,?,?,?,?,?,?)`)
        .run(nombre, lat, lon, 1, slug || '', tipo || 'colonia', JSON.stringify(aliases || []));
    }
    if (_dbCache.has(tenant.id)) { _dbCache.get(tenant.id).close(); _dbCache.delete(tenant.id); }
    return true;
  } catch (_) { return false; }
  finally { db.close(); }
}

function deleteTenantColonia(tenant, id) {
  const dbPath = path.isAbsolute(tenant.db_path)
    ? tenant.db_path
    : path.join(ROOT_PATH, tenant.db_path);
  const db = new Database(dbPath);
  try {
    db.prepare('DELETE FROM colonias WHERE id=?').run(id);
    if (_dbCache.has(tenant.id)) { _dbCache.get(tenant.id).close(); _dbCache.delete(tenant.id); }
    return true;
  } catch (_) { return false; }
  finally { db.close(); }
}

function getTenantZonas(tenant) {
  const db = _getTenantDB(tenant);
  if (!db) return [];
  try {
    return db.prepare('SELECT * FROM tarifas_zonas ORDER BY distancia_max ASC').all();
  } catch (_) { return []; }
}

function setTenantZonas(tenant, zonas) {
  const dbPath = path.isAbsolute(tenant.db_path)
    ? tenant.db_path
    : path.join(ROOT_PATH, tenant.db_path);
  const db = new Database(dbPath);
  try {
    db.prepare('DELETE FROM tarifas_zonas').run();
    const stmt = db.prepare('INSERT INTO tarifas_zonas (nombre_zona, distancia_max, tarifa) VALUES (?,?,?)');
    for (const z of zonas) stmt.run(z.nombre_zona, parseFloat(z.distancia_max), parseFloat(z.tarifa));
    if (_dbCache.has(tenant.id)) { _dbCache.get(tenant.id).close(); _dbCache.delete(tenant.id); }
    return true;
  } catch (_) { return false; }
  finally { db.close(); }
}

// Lee bot_pausado de configuracion con conexion fresca — activo | pausado | inactivo
function getTenantBotEstado(tenant) {
  const dbPath = path.isAbsolute(tenant.db_path)
    ? tenant.db_path
    : path.join(ROOT_PATH, tenant.db_path);
  if (!fs.existsSync(dbPath)) return 'inactivo';
  let db;
  try {
    db = new Database(dbPath, { readonly: true });
    const row = db.prepare('SELECT valor FROM configuracion WHERE clave=?').get('bot_pausado');
    return row?.valor === '1' ? 'pausado' : 'activo';
  } catch { return 'inactivo'; }
  finally { try { db?.close(); } catch {} }
}

// Lectura de QR con conexion fresca (sin cache) para ver siempre datos recientes
function getTenantQR(tenant) {
  const dbPath = path.isAbsolute(tenant.db_path)
    ? tenant.db_path
    : path.join(ROOT_PATH, tenant.db_path);
  if (!fs.existsSync(dbPath)) return null;
  let db;
  try {
    db = new Database(dbPath, { readonly: true });
    const row = db.prepare('SELECT valor FROM configuracion WHERE clave = ?').get('qr_pendiente');
    return row?.valor || null;
  } catch (_) {
    return null;
  } finally {
    try { db?.close(); } catch {}
  }
}

module.exports = {
  getTenants, saveTenants, getTenant, upsertTenant, deleteTenant,
  getTenantStats, getTenantConfig, setTenantConfig,
  getTenantPedidos, getTenantColonias, setTenantColonia, deleteTenantColonia,
  getTenantZonas, setTenantZonas, getTenantQR, getTenantBotEstado,
};
