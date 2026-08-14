// Diccionario maestro de colonias de Tepic, Nayarit.
// La definición vive en admin.db; cada tenant conserva solamente su activación.

const fs = require('fs');
const path = require('path');
const Database = require('better-sqlite3');
const { getAdminDB } = require('../../db/admin');
const DICCIONARIO = require('./diccionario_colonias_tepic');

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

function _catalogo({ incluirExcluidas = false } = {}) {
  return getAdminDB().prepare(`SELECT id, diccionario_id, nombre, nombre_oficial, slug, tipo,
    codigo_postal, municipio, ciudad, zona, lat, lon, aliases, fuente_coordenadas,
    precision_coordenadas, confianza, verificada, palabras_clave, grupo_ambiguedad, origen,
    administrada, excluida, activo FROM geo_tepic_colonias
    ${incluirExcluidas ? '' : 'WHERE excluida=0'} ORDER BY nombre COLLATE NOCASE`).all();
}

function _auditar(db, coloniaId, accion, antes, despues, usuario = 'sistema') {
  db.prepare('INSERT INTO geo_tepic_auditoria (colonia_id,accion,datos_antes,datos_despues,usuario) VALUES (?,?,?,?,?)')
    .run(coloniaId || null, accion, antes ? JSON.stringify(antes) : null, despues ? JSON.stringify(despues) : null, usuario);
}

function _filaDiccionario(c) {
  return {
    diccionario_id: c.id,
    nombre: c.nombre,
    nombre_oficial: c.nombreOficial || c.nombre,
    slug: slugify(c.nombre),
    tipo: c.tipo || 'colonia',
    codigo_postal: c.codigoPostal || null,
    municipio: c.municipio || 'Tepic',
    ciudad: c.ciudad || 'Tepic',
    zona: c.zona || 'urbana',
    lat: c.coordenadas.latitud,
    lon: c.coordenadas.longitud,
    aliases: _normalizarAliases(c.alias),
    fuente_coordenadas: c.coordenadas.fuente || null,
    precision_coordenadas: c.coordenadas.precision || null,
    confianza: c.coordenadas.confianza || null,
    verificada: c.coordenadas.verificada ? 1 : 0,
    palabras_clave: JSON.stringify(c.palabrasClave || []),
    grupo_ambiguedad: c.grupoAmbiguedad || null,
    origen: c.origen || null,
    activo: c.activa === false ? 0 : 1,
  };
}

function sincronizarCatalogoMaestro() {
  const db = getAdminDB();
  const columnas = `diccionario_id,nombre,nombre_oficial,slug,tipo,codigo_postal,municipio,ciudad,zona,
    lat,lon,aliases,fuente_coordenadas,precision_coordenadas,confianza,verificada,palabras_clave,
    grupo_ambiguedad,origen,activo`;
  const insertar = db.prepare(`INSERT INTO geo_tepic_colonias (${columnas})
    VALUES (@diccionario_id,@nombre,@nombre_oficial,@slug,@tipo,@codigo_postal,@municipio,@ciudad,@zona,
      @lat,@lon,@aliases,@fuente_coordenadas,@precision_coordenadas,@confianza,@verificada,@palabras_clave,
      @grupo_ambiguedad,@origen,@activo)`);
  const actualizar = db.prepare(`UPDATE geo_tepic_colonias SET diccionario_id=@diccionario_id,
    nombre=@nombre,nombre_oficial=@nombre_oficial,slug=@slug,tipo=@tipo,codigo_postal=@codigo_postal,
    municipio=@municipio,ciudad=@ciudad,zona=@zona,lat=@lat,lon=@lon,aliases=@aliases,
    fuente_coordenadas=@fuente_coordenadas,precision_coordenadas=@precision_coordenadas,
    confianza=@confianza,verificada=@verificada,palabras_clave=@palabras_clave,
    grupo_ambiguedad=@grupo_ambiguedad,origen=@origen,updated_at=datetime('now','localtime') WHERE id=@row_id`);
  let cambios = 0;
  db.transaction(() => {
    for (const colonia of Object.values(DICCIONARIO.COLONIAS)) {
      const fila = _filaDiccionario(colonia);
      const existente = db.prepare(`SELECT id, activo, administrada, excluida FROM geo_tepic_colonias
        WHERE diccionario_id=? OR slug=? OR lower(nombre)=lower(?) ORDER BY diccionario_id IS NOT NULL DESC LIMIT 1`)
        .get(fila.diccionario_id, fila.slug, fila.nombre);
      if (existente && !existente.administrada && !existente.excluida) actualizar.run({ ...fila, activo: existente.activo, row_id: existente.id });
      else if (existente) continue;
      else { insertar.run(fila); cambios++; }
    }
  })();
  return cambios;
}

function respaldarCatalogoMaestro() {
  const db = getAdminDB();
  const filas = _catalogo({ incluirExcluidas: true });
  if (!filas.length) return null;
  const dbFile = db.name || path.join(ROOT_PATH, 'data/admin.db');
  const carpeta = path.join(path.dirname(dbFile), 'backups', 'geotepic');
  fs.mkdirSync(carpeta, { recursive: true });
  const fecha = new Date().toISOString().slice(0, 10);
  const destino = path.join(carpeta, `geotepic-${fecha}.json`);
  if (!fs.existsSync(destino)) fs.writeFileSync(destino, JSON.stringify({ generado: new Date().toISOString(), colonias: filas }, null, 2), 'utf8');
  return destino;
}

function inicializarDesdeTenants(tenants = []) {
  const admin = getAdminDB();
  respaldarCatalogoMaestro();
  const importadas = sincronizarCatalogoMaestro();
  if (admin.prepare('SELECT COUNT(*) n FROM geo_tepic_colonias').get().n > 0) return importadas;
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

function listarColonias({ incluirInactivas = true, incluirExcluidas = false } = {}) {
  const rows = _catalogo({ incluirExcluidas });
  return incluirInactivas ? rows : rows.filter(c => c.activo);
}

function guardarColonia({ id, nombre, nombre_oficial = null, tipo = 'colonia', codigo_postal = null,
  municipio = 'Tepic', ciudad = 'Tepic', zona = 'urbana', lat, lon, aliases = [], activo = 1,
  fuente_coordenadas = 'superadmin', precision_coordenadas = 'punto_manual', confianza = 'media',
  verificada = 0, palabras_clave = [], grupo_ambiguedad = null, origen = 'superadmin', usuario = 'superadmin' }) {
  const db = getAdminDB();
  const slug = slugify(nombre);
  if (!nombre || !slug || !Number.isFinite(Number(lat)) || !Number.isFinite(Number(lon))) throw new Error('Datos de colonia inválidos');
  if (id) {
    const antes = db.prepare('SELECT * FROM geo_tepic_colonias WHERE id=?').get(Number(id));
    const result = db.prepare(`UPDATE geo_tepic_colonias SET nombre=?,nombre_oficial=?,slug=?,tipo=?,codigo_postal=?,municipio=?,ciudad=?,zona=?,lat=?,lon=?,aliases=?,activo=?,fuente_coordenadas=?,precision_coordenadas=?,confianza=?,verificada=?,palabras_clave=?,grupo_ambiguedad=?,origen=?,administrada=1,excluida=0,updated_at=datetime('now','localtime') WHERE id=?`)
      .run(nombre.trim(), nombre_oficial || nombre.trim(), slug, tipo, codigo_postal, municipio, ciudad, zona,
        Number(lat), Number(lon), _normalizarAliases(aliases), activo ? 1 : 0, fuente_coordenadas,
        precision_coordenadas, confianza, verificada ? 1 : 0, _normalizarAliases(palabras_clave),
        grupo_ambiguedad, origen, Number(id));
    if (!result.changes) throw new Error('Colonia maestra no encontrada');
    _auditar(db, Number(id), 'actualizar', antes, db.prepare('SELECT * FROM geo_tepic_colonias WHERE id=?').get(Number(id)), usuario);
    return Number(id);
  }
  const nuevoId = db.prepare(`INSERT INTO geo_tepic_colonias (nombre,nombre_oficial,slug,tipo,codigo_postal,municipio,ciudad,zona,lat,lon,aliases,activo,fuente_coordenadas,precision_coordenadas,confianza,verificada,palabras_clave,grupo_ambiguedad,origen,administrada) VALUES (?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,1)`)
    .run(nombre.trim(), nombre_oficial || nombre.trim(), slug, tipo, codigo_postal, municipio, ciudad, zona,
      Number(lat), Number(lon), _normalizarAliases(aliases), activo ? 1 : 0, fuente_coordenadas,
      precision_coordenadas, confianza, verificada ? 1 : 0, _normalizarAliases(palabras_clave),
      grupo_ambiguedad, origen).lastInsertRowid;
  _auditar(db, nuevoId, 'crear', null, db.prepare('SELECT * FROM geo_tepic_colonias WHERE id=?').get(nuevoId), usuario);
  return nuevoId;
}

function eliminarColonia(id, usuario = 'superadmin') {
  const db = getAdminDB();
  const antes = db.prepare('SELECT * FROM geo_tepic_colonias WHERE id=?').get(Number(id));
  if (!antes) return false;
  const result = antes.diccionario_id
    ? db.prepare("UPDATE geo_tepic_colonias SET excluida=1,activo=0,administrada=1,updated_at=datetime('now','localtime') WHERE id=?").run(Number(id))
    : db.prepare('DELETE FROM geo_tepic_colonias WHERE id=?').run(Number(id));
  if (result.changes) _auditar(db, Number(id), antes.diccionario_id ? 'excluir' : 'eliminar', antes, null, usuario);
  return result.changes > 0;
}

function restaurarColonia(id, usuario = 'superadmin') {
  const db = getAdminDB();
  const antes = db.prepare('SELECT * FROM geo_tepic_colonias WHERE id=? AND diccionario_id IS NOT NULL').get(Number(id));
  if (!antes) return false;
  const result = db.prepare("UPDATE geo_tepic_colonias SET excluida=0,activo=1,administrada=0,updated_at=datetime('now','localtime') WHERE id=?").run(Number(id));
  sincronizarCatalogoMaestro();
  _auditar(db, Number(id), 'restaurar', antes, db.prepare('SELECT * FROM geo_tepic_colonias WHERE id=?').get(Number(id)), usuario);
  return result.changes > 0;
}

function listarAuditoria(limite = 200) {
  return getAdminDB().prepare('SELECT * FROM geo_tepic_auditoria ORDER BY id DESC LIMIT ?').all(Math.min(1000, Math.max(1, Number(limite) || 200)));
}

function sincronizarTenant(tenant) {
  if (!esTenantTepic(tenant)) throw new Error('GeoTepic solo está disponible para tenants de Tepic, Nayarit');
  const dbPath = _tenantPath(tenant);
  if (!fs.existsSync(dbPath)) throw new Error('Base de datos del tenant no encontrada');
  const db = new Database(dbPath);
  db.pragma('busy_timeout = 5000');
  try {
    try { db.exec('ALTER TABLE colonias ADD COLUMN geo_tepic_id INTEGER'); } catch (_) {}
    for (const sql of [
      'ALTER TABLE colonias ADD COLUMN codigo_postal TEXT',
      'ALTER TABLE colonias ADD COLUMN fuente_coordenadas TEXT',
      'ALTER TABLE colonias ADD COLUMN precision_coordenadas TEXT',
      'ALTER TABLE colonias ADD COLUMN confianza TEXT',
      'ALTER TABLE colonias ADD COLUMN verificada INTEGER NOT NULL DEFAULT 0',
      'ALTER TABLE colonias ADD COLUMN grupo_ambiguedad TEXT',
    ]) { try { db.exec(sql); } catch (_) {} }
    db.exec('CREATE UNIQUE INDEX IF NOT EXISTS idx_colonias_geo_tepic_id ON colonias(geo_tepic_id) WHERE geo_tepic_id IS NOT NULL');
    const master = _catalogo();
    const configCobertura = Object.fromEntries(db.prepare("SELECT clave,valor FROM configuracion WHERE clave IN ('geo_radio_cobertura_km','negocio_lat','negocio_lon')").all().map(c => [c.clave, c.valor]));
    const radioConfigurado = Number(configCobertura.geo_radio_cobertura_km);
    const negocioLat = Number(configCobertura.negocio_lat);
    const negocioLon = Number(configCobertura.negocio_lon);
    const activoInicial = c => c.activo && (!(radioConfigurado > 0) || !Number.isFinite(negocioLat) || !Number.isFinite(negocioLon) || _haversine(negocioLat, negocioLon, c.lat, c.lon) <= radioConfigurado);
    const porSlug = db.prepare('SELECT id, activo FROM colonias WHERE slug=?');
    const porNombre = db.prepare('SELECT id, activo FROM colonias WHERE lower(nombre)=lower(?)');
    const link = db.prepare('UPDATE colonias SET geo_tepic_id=?,nombre=?,slug=?,tipo=?,lat=?,lon=?,aliases=?,codigo_postal=?,fuente_coordenadas=?,precision_coordenadas=?,confianza=?,verificada=?,grupo_ambiguedad=? WHERE id=?');
    const update = db.prepare('UPDATE colonias SET nombre=?,slug=?,tipo=?,lat=?,lon=?,aliases=?,codigo_postal=?,fuente_coordenadas=?,precision_coordenadas=?,confianza=?,verificada=?,grupo_ambiguedad=? WHERE geo_tepic_id=?');
    const insert = db.prepare(`INSERT INTO colonias (nombre,slug,tipo,lat,lon,aliases,codigo_postal,fuente_coordenadas,precision_coordenadas,confianza,verificada,grupo_ambiguedad,activo,geo_tepic_id) VALUES (?,?,?,?,?,?,?,?,?,?,?,?,?,?)`);
    const activacionInicialPendiente = !db.prepare("SELECT 1 FROM configuracion WHERE clave='geo_colonias_inicializadas_v2'").get();
    db.transaction(() => {
      for (const c of master) {
        const existingLinked = db.prepare('SELECT id FROM colonias WHERE geo_tepic_id=?').get(c.id);
        if (existingLinked) update.run(c.nombre, c.slug, c.tipo, c.lat, c.lon, c.aliases, c.codigo_postal, c.fuente_coordenadas, c.precision_coordenadas, c.confianza, c.verificada, c.grupo_ambiguedad, c.id);
        else {
          const legacy = porSlug.get(c.slug) || porNombre.get(c.nombre);
          if (legacy) link.run(c.id, c.nombre, c.slug, c.tipo, c.lat, c.lon, c.aliases, c.codigo_postal, c.fuente_coordenadas, c.precision_coordenadas, c.confianza, c.verificada, c.grupo_ambiguedad, legacy.id);
          else insert.run(c.nombre, c.slug, c.tipo, c.lat, c.lon, c.aliases, c.codigo_postal, c.fuente_coordenadas, c.precision_coordenadas, c.confianza, c.verificada, c.grupo_ambiguedad, activoInicial(c) ? 1 : 0, c.id);
        }
        if (!c.activo) db.prepare('UPDATE colonias SET activo=0 WHERE geo_tepic_id=?').run(c.id);
      }
      db.prepare(`UPDATE colonias SET activo=0 WHERE geo_tepic_id IS NOT NULL AND geo_tepic_id NOT IN (${master.map(() => '?').join(',') || 'NULL'})`)
        .run(...master.map(c => c.id));
      if (activacionInicialPendiente) {
        const idsActivos = master.filter(activoInicial).map(c => c.id);
        db.prepare(`UPDATE colonias SET activo=1 WHERE geo_tepic_id IN (${idsActivos.map(() => '?').join(',') || 'NULL'})`).run(...idsActivos);
        db.prepare("INSERT OR REPLACE INTO configuracion (clave,valor) VALUES ('geo_colonias_inicializadas_v2','1')").run();
      }
    })();
    return master.length;
  } finally { db.close(); }
}

function aplicarRadioCobertura(tenant, negocioLat, negocioLon, radioKm) {
  if (!esTenantTepic(tenant)) throw new Error('GeoTepic solo está disponible para tenants de Tepic, Nayarit');
  const lat = Number(negocioLat);
  const lon = Number(negocioLon);
  const radio = Number(radioKm);
  if (!Number.isFinite(lat) || lat < -90 || lat > 90 || !Number.isFinite(lon) || lon < -180 || lon > 180) throw new Error('Configura coordenadas válidas para el negocio antes de aplicar el radio');
  if (!Number.isFinite(radio) || radio <= 0 || radio > 100) throw new Error('El radio debe ser mayor a 0 y máximo de 100 km');

  sincronizarTenant(tenant);
  const masterActivas = new Set(_catalogo().filter(c => c.activo).map(c => c.id));
  const db = new Database(_tenantPath(tenant));
  db.pragma('busy_timeout = 5000');
  try {
    const colonias = db.prepare('SELECT id,geo_tepic_id,lat,lon FROM colonias WHERE geo_tepic_id IS NOT NULL').all();
    const actualizar = db.prepare('UPDATE colonias SET activo=? WHERE id=?');
    let activas = 0;
    let inactivas = 0;
    db.transaction(() => {
      for (const colonia of colonias) {
        const distancia = _haversine(lat, lon, Number(colonia.lat), Number(colonia.lon));
        const activo = masterActivas.has(colonia.geo_tepic_id) && distancia <= radio;
        actualizar.run(activo ? 1 : 0, colonia.id);
        if (activo) activas++; else inactivas++;
      }
      db.prepare("INSERT OR REPLACE INTO configuracion (clave,valor) VALUES ('geo_radio_cobertura_km',?)").run(String(radio));
    })();
    return { radioKm: radio, activas, inactivas, total: colonias.length };
  } finally { db.close(); }
}

function _haversine(lat1, lon1, lat2, lon2) {
  const R = 6371;
  const rad = grados => grados * Math.PI / 180;
  const dLat = rad(lat2 - lat1);
  const dLon = rad(lon2 - lon1);
  const a = Math.sin(dLat / 2) ** 2 + Math.cos(rad(lat1)) * Math.cos(rad(lat2)) * Math.sin(dLon / 2) ** 2;
  return R * 2 * Math.atan2(Math.sqrt(a), Math.sqrt(1 - a));
}

function listarParaTenant(tenant) {
  sincronizarTenant(tenant);
  const master = new Map(_catalogo().filter(c => c.activo).map(c => [c.id, c]));
  const db = new Database(_tenantPath(tenant), { readonly: true });
  try {
    return db.prepare('SELECT * FROM colonias WHERE geo_tepic_id IS NOT NULL ORDER BY nombre COLLATE NOCASE').all()
      .filter(c => master.has(c.geo_tepic_id))
      .map(c => ({ ...master.get(c.geo_tepic_id), id: c.id, geo_tepic_id: c.geo_tepic_id, activo: c.activo }));
  }
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

module.exports = { esTenantTepic, resolverTenant, inicializarDesdeTenants, sincronizarCatalogoMaestro, respaldarCatalogoMaestro, listarColonias, guardarColonia, eliminarColonia, restaurarColonia, listarAuditoria, sincronizarTenant, listarParaTenant, activarEnTenant, aplicarRadioCobertura };
