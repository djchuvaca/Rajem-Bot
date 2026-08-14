// src/superadmin/tenant-reader.js
// Lee data/tenants.json y abre conexiones de solo lectura a las BDs de cada tenant.
// El super-admin consulta estas conexiones para mostrar métricas sin modificar datos operativos.

const path     = require('path');
const fs       = require('fs');
const Database = require('better-sqlite3');
const { encrypt, decrypt } = require('../security/secrets');

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
  const tmp = `${TENANTS_PATH}.tmp`;
  fs.writeFileSync(tmp, JSON.stringify({ tenants }, null, 2), 'utf8');
  fs.renameSync(tmp, TENANTS_PATH);
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

function _dbPath(tenant) {
  return path.isAbsolute(tenant.db_path) ? tenant.db_path : path.join(ROOT_PATH, tenant.db_path);
}

function _openWritable(tenant) {
  const dbPath = _dbPath(tenant);
  if (!fs.existsSync(dbPath)) return null;
  const db = new Database(dbPath, { fileMustExist: true });
  db.pragma('busy_timeout = 5000');
  return db;
}

function _tenantSecret(tenant) {
  const envPath = path.join(ROOT_PATH, 'envs', `${tenant.id}.env`);
  try {
    const line = fs.readFileSync(envPath, 'utf8').split(/\r?\n/).find(l => l.startsWith('PANEL_SECRET='));
    return line ? line.slice('PANEL_SECRET='.length).trim() : '';
  } catch (_) { return ''; }
}

function _decodeTenantConfig(tenant, clave, valor) {
  if (clave !== 'pasarela_config') return valor;
  return decrypt(valor, _tenantSecret(tenant));
}

function _encodeTenantConfig(tenant, clave, valor) {
  if (clave !== 'pasarela_config') return String(valor ?? '');
  return encrypt(String(valor ?? '{}'), _tenantSecret(tenant));
}

function _invalidateTenant(tenant) {
  if (_dbCache.has(tenant.id)) { _dbCache.get(tenant.id).close(); _dbCache.delete(tenant.id); }
}

function _getTenantDB(tenant) {
  if (_dbCache.has(tenant.id)) return _dbCache.get(tenant.id);
  const dbPath = path.isAbsolute(tenant.db_path)
    ? tenant.db_path
    : path.join(ROOT_PATH, tenant.db_path);
  if (!fs.existsSync(dbPath)) return null;
  const db = new Database(dbPath, { readonly: true, fileMustExist: true });
  db.pragma('busy_timeout = 5000');
  db.pragma('query_only = ON');
  _dbCache.set(tenant.id, db);
  return db;
}

// ── Métricas por tenant ───────────────────────────────────────────────────────
function getTenantStats(tenant) {
  const db = _getTenantDB(tenant);
  if (!db) return { error: 'BD no encontrada', pedidos_hoy: 0, clientes: 0, sesiones_activas: 0 };

  try {
    const pedidosHoy = db.prepare(
      `SELECT COUNT(*) as n FROM pedidos WHERE date(fecha, 'localtime') = date('now','localtime')`
    ).get()?.n || 0;

    const confirmadosHoy = db.prepare(
      `SELECT COUNT(*) as n FROM pedidos WHERE date(fecha,'localtime')=date('now','localtime') AND estado IN ('confirmado','listo','en_camino')`
    ).get()?.n || 0;

    const ventasHoy = db.prepare(
      `SELECT ROUND(SUM(total),2) as v FROM pedidos WHERE date(fecha,'localtime')=date('now','localtime') AND estado IN ('confirmado','listo','en_camino')`
    ).get()?.v || 0;

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
    rows.forEach(r => { cfg[r.clave] = _decodeTenantConfig(tenant, r.clave, r.valor); });
    return cfg;
  } catch (_) { return {}; }
}

function setTenantConfig(tenant, clave, valor) {
  const db = _openWritable(tenant);
  if (!db) return false;
  try {
    db.prepare('INSERT OR REPLACE INTO configuracion (clave, valor) VALUES (?,?)').run(clave, _encodeTenantConfig(tenant, clave, valor));
    // Invalidar caché de readonly para que próxima lectura vea el cambio
    _invalidateTenant(tenant);
    return true;
  } catch (_) { return false; }
  finally { db.close(); }
}

function setTenantConfigBulk(tenant, config) {
  const db = _openWritable(tenant);
  if (!db) return false;
  try {
    const stmt = db.prepare('INSERT OR REPLACE INTO configuracion (clave, valor) VALUES (?,?)');
    db.transaction(() => {
      for (const [clave, valor] of Object.entries(config)) stmt.run(clave, _encodeTenantConfig(tenant, clave, valor));
    })();
    _invalidateTenant(tenant);
    return true;
  } catch (_) { return false; }
  finally { db.close(); }
}

function getTenantPanelUsuario(tenant) {
  const db = _getTenantDB(tenant);
  if (!db) return null;
  try {
    const row = db.prepare('SELECT id,usuario FROM usuarios_panel ORDER BY id LIMIT 1').get();
    return row ? { id: row.id, usuario: row.usuario } : null;
  } catch (_) { return null; }
}

function updateTenantPanelCredentials(tenant, { usuario, passwordHash }) {
  const db = _openWritable(tenant);
  if (!db) return false;
  try {
    const actual = db.prepare('SELECT id FROM usuarios_panel ORDER BY id LIMIT 1').get();
    if (!actual) return false;
    const duplicado = db.prepare('SELECT id FROM usuarios_panel WHERE usuario=? AND id<>?').get(usuario, actual.id);
    if (duplicado) throw new Error('El usuario ya existe');
    if (passwordHash) db.prepare('UPDATE usuarios_panel SET usuario=?,password=? WHERE id=?').run(usuario, passwordHash, actual.id);
    else db.prepare('UPDATE usuarios_panel SET usuario=? WHERE id=?').run(usuario, actual.id);
    _invalidateTenant(tenant);
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

function getTenantZonas(tenant) {
  const db = _getTenantDB(tenant);
  if (!db) return [];
  try {
    return db.prepare('SELECT * FROM tarifas_zonas ORDER BY distancia_max ASC').all();
  } catch (_) { return []; }
}

function setTenantZonas(tenant, zonas) {
  const db = _openWritable(tenant);
  if (!db) return false;
  try {
    const tx = db.transaction(() => {
      db.prepare('DELETE FROM tarifas_zonas').run();
      const stmt = db.prepare('INSERT INTO tarifas_zonas (nombre_zona, distancia_max, tarifa) VALUES (?,?,?)');
      for (const z of zonas) stmt.run(z.nombre_zona, parseFloat(z.distancia_max), parseFloat(z.tarifa));
    });
    tx();
    _invalidateTenant(tenant);
    return true;
  } catch (_) { return false; }
  finally { db.close(); }
}

// Lee bot_pausado de configuracion con conexion fresca — activo | pausado | inactivo
function getTenantBotEstado(tenant) {
  if (tenant.activo === false) return 'inactivo';
  const dbPath = path.isAbsolute(tenant.db_path)
    ? tenant.db_path
    : path.join(ROOT_PATH, tenant.db_path);
  if (!fs.existsSync(dbPath)) return 'inactivo';
  let db;
  try {
    db = new Database(dbPath, { readonly: true });
    const rows = db.prepare("SELECT clave,valor FROM configuracion WHERE clave IN ('bot_pausado','bot_heartbeat')").all();
    const cfg = Object.fromEntries(rows.map(r => [r.clave, r.valor]));
    if (!cfg.bot_heartbeat || Date.now() - Date.parse(cfg.bot_heartbeat) > 120000) return 'inactivo';
    return cfg.bot_pausado === '1' ? 'pausado' : 'activo';
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

// ── PLAN DE MEMBRESÍA ─────────────────────────────────────────────────────────
function getTenantPlan(tenant) {
  // Preferir plan en tenants.json (sin acceso a BD) para el dashboard de velocidad.
  // Si no está ahí, leer de la BD del tenant como fallback.
  if (tenant.plan && ['basico', 'plus', 'pro'].includes(tenant.plan)) return tenant.plan;
  try {
    const cfg = getTenantConfig(tenant);
    return cfg.plan_activo || 'basico';
  } catch (_) { return 'basico'; }
}

function setTenantPlan(tenant, plan) {
  if (!['basico', 'plus', 'pro'].includes(plan)) return false;
  const ok = setTenantConfig(tenant, 'plan_activo', plan);
  if (ok) {
    // Sincronizar en tenants.json para que el dashboard no necesite acceder a cada BD
    const tenants = getTenants();
    const idx = tenants.findIndex(t => t.id === tenant.id);
    if (idx >= 0) { tenants[idx].plan = plan; saveTenants(tenants); }
  }
  return ok;
}

// ── SOLICITUDES GEO ───────────────────────────────────────────────────────────
function getTenantSolicitudesGeo(tenant) {
  const db = _getTenantDB(tenant);
  if (!db) return [];
  try {
    return db.prepare('SELECT * FROM solicitudes_geo ORDER BY created_at DESC').all();
  } catch (_) { return []; }
}

function updateTenantSolicitudGeo(tenant, id, { estado, respuesta }) {
  const db = _openWritable(tenant);
  if (!db) return false;
  try {
    db.prepare('UPDATE solicitudes_geo SET estado=?, respuesta=? WHERE id=?')
      .run(estado, respuesta || null, id);
    if (_dbCache.has(tenant.id)) { _dbCache.get(tenant.id).close(); _dbCache.delete(tenant.id); }
    return true;
  } catch (_) { return false; }
  finally { db.close(); }
}

function applyTenantGeoSolicitud(tenant, solicitud) {
  const db = _openWritable(tenant);
  if (!db) return false;
  try {
    const datos = typeof solicitud.datos_propuestos === 'string'
      ? JSON.parse(solicitud.datos_propuestos)
      : solicitud.datos_propuestos;

    if (solicitud.tipo === 'tarifas') {
      const zonas = Array.isArray(datos.zonas) ? datos.zonas : [];
      db.transaction(() => {
        db.prepare('DELETE FROM tarifas_zonas').run();
        const stmt = db.prepare('INSERT INTO tarifas_zonas (nombre_zona, distancia_max, tarifa) VALUES (?,?,?)');
        for (const z of zonas) stmt.run(z.nombre_zona, parseFloat(z.distancia_max), parseFloat(z.tarifa));
      })();
    } else {
      const clavesPorTipo = {
        ubicacion:      ['negocio_lat', 'negocio_lon'],
        direccion:      ['negocio_calle', 'negocio_colonia', 'negocio_referencia'],
        domicilio_costo: ['domicilio_costo'],
      };
      const claves = clavesPorTipo[solicitud.tipo] || [];
      const stmt = db.prepare('INSERT OR REPLACE INTO configuracion (clave, valor) VALUES (?,?)');
      for (const clave of claves) {
        if (datos[clave] !== undefined) stmt.run(clave, String(datos[clave]));
      }
    }
    if (_dbCache.has(tenant.id)) { _dbCache.get(tenant.id).close(); _dbCache.delete(tenant.id); }
    return true;
  } catch (_) { return false; }
  finally { db.close(); }
}

// ── REPARTIDORES ──────────────────────────────────────────────────────────────
function getTenantRepartidores(tenant) {
  const db = _getTenantDB(tenant);
  if (!db) return [];
  try {
    return db.prepare('SELECT * FROM repartidores ORDER BY activo DESC, en_ruta DESC, nombre').all();
  } catch (_) { return []; }
}

function updateTenantRepartidor(tenant, id, { nombre, activo }) {
  const db = _openWritable(tenant);
  if (!db) return false;
  try {
    if (nombre !== undefined) db.prepare('UPDATE repartidores SET nombre=? WHERE id=?').run(nombre, id);
    if (activo !== undefined) db.prepare('UPDATE repartidores SET activo=? WHERE id=?').run(activo ? 1 : 0, id);
    if (_dbCache.has(tenant.id)) { _dbCache.get(tenant.id).close(); _dbCache.delete(tenant.id); }
    return true;
  } catch (_) { return false; }
  finally { db.close(); }
}

function deleteTenantRepartidor(tenant, id) {
  const db = _openWritable(tenant);
  if (!db) return false;
  try {
    db.prepare('DELETE FROM repartidores WHERE id=?').run(id);
    if (_dbCache.has(tenant.id)) { _dbCache.get(tenant.id).close(); _dbCache.delete(tenant.id); }
    return true;
  } catch (_) { return false; }
  finally { db.close(); }
}

function getTenantMandaditosConfig(tenant) {
  const cfg = getTenantConfig(tenant);
  return {
    mandaditos_silencio_min:     cfg.mandaditos_silencio_min     || '15',
    mandaditos_recordatorio_min: cfg.mandaditos_recordatorio_min || '30',
    mandaditos_timeout_post_min: cfg.mandaditos_timeout_post_min || '20',
  };
}

function setTenantMandaditosConfig(tenant, config) {
  const claves = ['mandaditos_silencio_min', 'mandaditos_recordatorio_min', 'mandaditos_timeout_post_min'];
  const db = _openWritable(tenant);
  if (!db) return false;
  try {
    const stmt = db.prepare('INSERT OR REPLACE INTO configuracion (clave, valor) VALUES (?,?)');
    for (const clave of claves) {
      if (config[clave] !== undefined) stmt.run(clave, String(parseInt(config[clave], 10) || 0));
    }
    if (_dbCache.has(tenant.id)) { _dbCache.get(tenant.id).close(); _dbCache.delete(tenant.id); }
    return true;
  } catch (_) { return false; }
  finally { db.close(); }
}

function getTenantEntregasHistorial(tenant, { repartidorId = null, desde = null, hasta = null } = {}) {
  const db = _getTenantDB(tenant);
  if (!db) return [];
  try {
    const condiciones = ['1=1'];
    const params      = [];
    if (repartidorId) { condiciones.push('h.repartidor_id=?'); params.push(repartidorId); }
    if (desde)        { condiciones.push('h.fecha>=?');        params.push(desde); }
    if (hasta)        { condiciones.push('h.fecha<=?');        params.push(hasta); }
    return db.prepare(`
      SELECT h.*, r.nombre AS repartidor_nombre
      FROM entregas_historial h
      JOIN repartidores r ON r.id = h.repartidor_id
      WHERE ${condiciones.join(' AND ')}
      ORDER BY h.creado_en DESC
      LIMIT 500
    `).all(...params);
  } catch (_) { return []; }
}

function getTenantReporteReparto(tenant, { desde = null, hasta = null } = {}) {
  const db = _getTenantDB(tenant);
  if (!db) return [];
  try {
    return db.prepare(`
      SELECT r.id, r.nombre, r.activo, r.promedio_entrega_min AS promedio_global,
             COUNT(h.id)                                              AS total_entregas,
             SUM(CASE WHEN h.confirmado=1 THEN 1 ELSE 0 END)         AS confirmadas,
             SUM(CASE WHEN h.confirmado=0 THEN 1 ELSE 0 END)         AS timeouts,
             ROUND(AVG(CASE WHEN h.confirmado=1 THEN h.minutos END), 1) AS promedio_min_periodo
      FROM repartidores r
      LEFT JOIN entregas_historial h
        ON h.repartidor_id = r.id
        AND (? IS NULL OR h.fecha >= ?)
        AND (? IS NULL OR h.fecha <= ?)
      GROUP BY r.id
      ORDER BY total_entregas DESC, r.nombre
    `).all(desde, desde, hasta, hasta);
  } catch (_) { return []; }
}

module.exports = {
  getTenants, saveTenants, getTenant, upsertTenant, deleteTenant,
  getTenantStats, getTenantConfig, setTenantConfig, setTenantConfigBulk,
  getTenantPanelUsuario, updateTenantPanelCredentials,
  getTenantPedidos,
  getTenantZonas, setTenantZonas, getTenantQR, getTenantBotEstado,
  getTenantSolicitudesGeo, updateTenantSolicitudGeo, applyTenantGeoSolicitud,
  getTenantPlan, setTenantPlan,
  getTenantRepartidores, updateTenantRepartidor, deleteTenantRepartidor,
  getTenantMandaditosConfig, setTenantMandaditosConfig,
  getTenantEntregasHistorial, getTenantReporteReparto,
};
