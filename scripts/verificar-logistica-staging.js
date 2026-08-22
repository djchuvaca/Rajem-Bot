'use strict';

const fs = require('fs');
const path = require('path');
const Database = require('better-sqlite3');

const raiz = path.resolve(__dirname, '..');
const adminPath = process.env.ADMIN_DB_PATH || path.join(raiz, 'data', 'admin.db');
const tenantsPath = path.join(raiz, 'data', 'tenants.json');
const errores = [];
const avisos = [];

function error(texto) { errores.push(texto); }
function aviso(texto) { avisos.push(texto); }
function existeTabla(db, tabla) {
  return Boolean(db.prepare("SELECT 1 FROM sqlite_master WHERE type='table' AND name=?").get(tabla));
}

if (!fs.existsSync(adminPath)) error(`No existe ${adminPath}`);
if (!fs.existsSync(tenantsPath)) error(`No existe ${tenantsPath}`);

if (!errores.length) {
  const db = new Database(adminPath, { readonly: true, fileMustExist: true });
  db.pragma('query_only = ON');
  for (const tabla of ['logistica_politicas_globales', 'logistica_reglas_globales',
    'logistica_versiones_globales', 'logistica_cotizaciones_globales', 'geo_tepic_colonias']) {
    if (!existeTabla(db, tabla)) error(`Falta la tabla ${tabla}`);
  }
  if (!errores.length) {
    const politica = db.prepare("SELECT * FROM logistica_politicas_globales WHERE ambito='tepic-nayarit' AND activa=1").get();
    if (!politica) error('No existe la política global de Tepic');
    else if (!politica.version_publicada) error('La política global todavía no está publicada');
    else {
      const reglas = db.prepare(`SELECT categoria,condicion_json,valor FROM logistica_reglas_globales
        WHERE politica_id=? AND version=? AND activa=1`).all(politica.id, politica.version_publicada);
      const categorias = Object.fromEntries(reglas.map(r => [r.categoria, (reglas.filter(x => x.categoria === r.categoria)).length]));
      const bandas = reglas.filter(r => r.categoria === 'distancia').map(r => {
        const c = JSON.parse(r.condicion_json); return { desde: Number(c.desde_km || 0), hasta: c.hasta_km == null ? Infinity : Number(c.hasta_km) };
      }).sort((a, b) => a.desde - b.desde);
      if (!bandas.length) error('No existen tarifas por distancia publicadas');
      else {
        if (bandas[0].desde !== 0) error('Las tarifas por distancia no comienzan en 0 km');
        for (let i = 1; i < bandas.length; i += 1) if (bandas[i].desde !== bandas[i - 1].hasta) error('Las tarifas por distancia tienen huecos o traslapes');
      }
      console.log('[logística] versión publicada:', politica.version_publicada);
      console.log('[logística] reglas por categoría:', categorias);
    }
    const colonias = db.prepare('SELECT COUNT(*) total FROM geo_tepic_colonias WHERE activo=1 AND excluida=0').get().total;
    if (!colonias) error('GeoTepic no tiene colonias activas');
    else console.log('[GeoTepic] colonias activas:', colonias);
  }
  db.close();
}

if (fs.existsSync(tenantsPath)) {
  const registro = JSON.parse(fs.readFileSync(tenantsPath, 'utf8'));
  const tepic = (registro.tenants || []).filter(t => String(t.ciudad).toLowerCase() === 'tepic' && String(t.estado).toLowerCase() === 'nayarit');
  if (!tepic.length) aviso('No hay tenants registrados como Tepic, Nayarit');
  for (const tenant of tepic) {
    const dbPath = path.isAbsolute(tenant.db_path) ? tenant.db_path : path.join(raiz, tenant.db_path);
    if (!fs.existsSync(dbPath)) { error(`${tenant.id}: no existe ${dbPath}`); continue; }
    const db = new Database(dbPath, { readonly: true, fileMustExist: true });
    db.pragma('query_only = ON');
    const config = existeTabla(db, 'configuracion') ? Object.fromEntries(db.prepare(
      "SELECT clave,valor FROM configuracion WHERE clave IN ('negocio_lat','negocio_lon')").all().map(x => [x.clave, x.valor])) : {};
    const lat = Number(config.negocio_lat), lon = Number(config.negocio_lon);
    if (!Number.isFinite(lat) || !Number.isFinite(lon) || lat < 20 || lat > 23 || lon < -106 || lon > -103) error(`${tenant.id}: faltan coordenadas válidas del negocio en Nayarit`);
    else console.log(`[tenant] ${tenant.id}: coordenadas OK`);
    db.close();
  }
}

for (const texto of avisos) console.warn('AVISO:', texto);
for (const texto of errores) console.error('ERROR:', texto);
if (errores.length) {
  console.error(`Diagnóstico fallido: ${errores.length} problema(s).`);
  process.exitCode = 1;
} else console.log('Diagnóstico de staging correcto (solo lectura).');
