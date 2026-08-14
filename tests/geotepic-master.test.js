'use strict';

const { test, describe } = require('node:test');
const assert = require('node:assert/strict');
const os = require('os');
const path = require('path');

process.env.ADMIN_DB_PATH = path.join(os.tmpdir(), `rajem-admin-geotepic-${process.pid}.db`);
process.env.SUPERADMIN_INITIAL_PASSWORD = 'test-password-not-production';

const { getAdminDB } = require('../src/db/admin');
const { sincronizarCatalogoMaestro, guardarColonia, eliminarColonia, restaurarColonia, listarAuditoria } = require('../src/geo/geotepic');

describe('GeoTepic — migración del catálogo maestro', () => {
  test('importa los 300 registros con metadata enriquecida', () => {
    assert.strictEqual(sincronizarCatalogoMaestro(), 300);
    const db = getAdminDB();
    const resumen = db.prepare(`SELECT COUNT(*) total,
      SUM(verificada) verificadas,
      SUM(CASE WHEN codigo_postal IS NULL THEN 1 ELSE 0 END) sin_cp
      FROM geo_tepic_colonias WHERE diccionario_id IS NOT NULL`).get();
    assert.deepStrictEqual(resumen, { total: 300, verificadas: 163, sin_cp: 2 });
    const muestra = db.prepare("SELECT * FROM geo_tepic_colonias WHERE diccionario_id='zitacua'").get();
    assert.strictEqual(muestra.nombre, 'Zitácua');
    assert.strictEqual(muestra.codigo_postal, '63174');
    assert.strictEqual(muestra.fuente_coordenadas, 'usuario_verificada');
  });

  test('es idempotente y conserva la activación decidida por el administrador', () => {
    const db = getAdminDB();
    db.prepare("UPDATE geo_tepic_colonias SET activo=0 WHERE diccionario_id='zitacua'").run();
    assert.strictEqual(sincronizarCatalogoMaestro(), 0);
    assert.strictEqual(db.prepare("SELECT activo FROM geo_tepic_colonias WHERE diccionario_id='zitacua'").get().activo, 0);
    assert.strictEqual(db.prepare('SELECT COUNT(*) total FROM geo_tepic_colonias').get().total, 300);
  });

  test('un override del superadmin sobrevive a la sincronización', () => {
    const db = getAdminDB();
    const colonia = db.prepare("SELECT * FROM geo_tepic_colonias WHERE diccionario_id='zitacua'").get();
    guardarColonia({ ...colonia, id: colonia.id, nombre: 'Zitácua Corregida', aliases: JSON.parse(colonia.aliases), palabras_clave: JSON.parse(colonia.palabras_clave) });
    sincronizarCatalogoMaestro();
    const actual = db.prepare('SELECT nombre,administrada FROM geo_tepic_colonias WHERE id=?').get(colonia.id);
    assert.deepStrictEqual(actual, { nombre: 'Zitácua Corregida', administrada: 1 });
  });

  test('una exclusión no reaparece y puede restaurarse', () => {
    const db = getAdminDB();
    const colonia = db.prepare("SELECT id FROM geo_tepic_colonias WHERE diccionario_id='12_de_diciembre'").get();
    assert.strictEqual(eliminarColonia(colonia.id), true);
    sincronizarCatalogoMaestro();
    assert.strictEqual(db.prepare('SELECT excluida FROM geo_tepic_colonias WHERE id=?').get(colonia.id).excluida, 1);
    assert.strictEqual(restaurarColonia(colonia.id), true);
    assert.strictEqual(db.prepare('SELECT excluida,administrada FROM geo_tepic_colonias WHERE id=?').get(colonia.id).excluida, 0);
    assert.ok(listarAuditoria().length >= 3);
  });

  test('permite crear una colonia administrativa con auditoría', () => {
    const id = guardarColonia({ nombre: 'Colonia de prueba administrativa', tipo: 'colonia', lat: 21.5, lon: -104.9, aliases: ['Prueba administrativa'] });
    const fila = getAdminDB().prepare('SELECT administrada,diccionario_id FROM geo_tepic_colonias WHERE id=?').get(id);
    assert.deepStrictEqual(fila, { administrada: 1, diccionario_id: null });
  });
});
