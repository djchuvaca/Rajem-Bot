'use strict';

const { describe, test, before, after } = require('node:test');
const assert = require('node:assert/strict');
const os = require('os');
const path = require('path');
const fs = require('fs');

const dbPath = path.join(os.tmpdir(), `rajem-logistica-${process.pid}.db`);
process.env.ADMIN_DB_PATH = dbPath;
process.env.SUPERADMIN_INITIAL_PASSWORD = 'password-segura-para-pruebas';

const { getAdminDB } = require('../src/db/admin');
const geoTepic = require('../src/geo/geotepic');
const logistica = require('../src/logistica');

let cuadrante;

const POLIGONO = {
  type: 'Polygon',
  coordinates: [[[-105, 21], [-104, 21], [-104, 22], [-105, 22], [-105, 21]]],
};

before(() => {
  const db = getAdminDB();
  db.prepare('DELETE FROM geo_tepic_cuadrantes').run();
  db.prepare('DELETE FROM geo_tepic_colonias').run();
  geoTepic.guardarColonia({ nombre: 'Colonia Logística', lat: 21.5, lon: -104.75, verificada: 1 });
  cuadrante = geoTepic.crearCuadrante({ nombre: 'Acceso especial', geometry: POLIGONO });
  logistica.actualizarPolitica({ redondeo: 5, tarifa_minima: 40, tarifa_maxima: 70 });
});

after(() => {
  try { getAdminDB().close(); } catch (_) {}
  try { fs.unlinkSync(dbPath); } catch (_) {}
});

describe('Motor logístico central', () => {
  test('no reemplaza la tarifa tenant mientras la política global no está publicada', () => {
    assert.deepStrictEqual(logistica.cotizarEntrega({
      tenantId: 'sin-convenio', colonia: 'Colonia Logística', origenLat: 21.5, origenLon: -104.75,
    }), { configurada: false });
  });

  test('publica una versión global inmutable y abre un nuevo borrador', () => {
    logistica.guardarRegla({ nombre: 'Base 0–20 km', categoria: 'distancia',
      condicion: { desde_km: 0, hasta_km: 20 }, tipo_ajuste: 'fijo', valor: 50, prioridad: 999, acumulable: false });
    logistica.guardarRegla({ nombre: 'Acceso especial', categoria: 'territorio',
      condicion: { cuadrante_id: cuadrante.id }, tipo_ajuste: 'fijo', valor: 15, prioridad: 1 });
    logistica.guardarRegla({ nombre: 'Lluvia media', categoria: 'clima',
      condicion: { nivel: 'media' }, tipo_ajuste: 'porcentaje', valor: 10, prioridad: 30 });
    logistica.guardarRegla({ nombre: 'Lluvia fuerte', categoria: 'clima',
      condicion: { nivel: 'fuerte' }, tipo_ajuste: 'porcentaje', valor: 20, prioridad: 40 });
    logistica.guardarRegla({ nombre: 'Navidad', categoria: 'calendario',
      condicion: { nivel: 'navidad', fecha: '2030-12-25' }, tipo_ajuste: 'fijo', valor: 20, prioridad: 1 });

    const publicada = logistica.publicarPolitica();
    assert.strictEqual(publicada.version_publicada, 1);
    assert.strictEqual(publicada.version_borrador, 2);
    assert.strictEqual(logistica.listarReglas(1).length, 5);
    assert.strictEqual(logistica.listarReglas(2).length, 5);
  });

  test('impide que un recargo reemplace la base por kilómetros', () => {
    assert.throws(() => logistica.guardarRegla({ nombre: 'Reemplazo peligroso', categoria: 'clima',
      condicion: { nivel: 'fuerte' }, tipo_ajuste: 'reemplazo', valor: 10 }), /no está permitido/i);
  });

  test('el simulador puede evaluar el borrador sin publicarlo', () => {
    logistica.guardarRegla({ nombre: 'Servicio nocturno', categoria: 'horario',
      condicion: { hora_desde: '22:00', hora_hasta: '06:00' }, tipo_ajuste: 'fijo', valor: 10, prioridad: 1 });
    const resultado = logistica.cotizarEntrega({ tenantId: 'tenant-prueba', colonia: 'Colonia Logística',
      origenLat: 21.5, origenLon: -104.75, usarBorrador: true, persistir: false,
      momento: new Date('2030-01-02T05:30:00Z'),
      condicionesSimuladas: [{ tipo: 'clima', nivel: 'fuerte', nombre: 'Lluvia fuerte' }] });
    assert.strictEqual(resultado.esBorrador, true);
    assert.strictEqual(resultado.politicaVersion, 2);
    assert.ok(resultado.desglose.some(d => d.nombre === 'Lluvia fuerte'));
    assert.ok(resultado.desglose.some(d => d.nombre === 'Servicio nocturno'));
    const diurno = logistica.cotizarEntrega({ tenantId: 'tenant-prueba', colonia: 'Colonia Logística',
      origenLat: 21.5, origenLon: -104.75, usarBorrador: true, persistir: false,
      momento: new Date('2030-01-02T18:00:00Z'), condicionesSimuladas: [] });
    assert.ok(!diurno.desglose.some(d => d.nombre === 'Servicio nocturno'));
  });

  test('combina distancia, cuadrante y clima con redondeo', () => {
    const ahora = new Date();
    // Editar el nuevo borrador no puede alterar los parámetros de la v1 publicada.
    logistica.actualizarPolitica({ redondeo: 100 });
    logistica.guardarCondicion({ tipo: 'clima', nivel: 'media', nombre: 'Lluvia media',
      inicio: new Date(ahora.getTime() - 60000), fin: new Date(ahora.getTime() + 3600000) }, 'tester');
    const resultado = logistica.cotizarEntrega({ tenantId: 'tenant-prueba', colonia: 'Colonia Logística',
      origenLat: 21.5, origenLon: -104.75, momento: ahora });
    assert.strictEqual(resultado.configurada, true);
    assert.strictEqual(resultado.disponible, true);
    assert.strictEqual(resultado.tarifa, 70); // 71.5 redondea a 75 y el máximo lo limita a 70
    assert.deepStrictEqual(resultado.desglose.map(d => d.categoria), ['distancia', 'territorio', 'clima', 'limite']);
    assert.strictEqual(resultado.tarifaMaximaAplicada, true);
    assert.ok(resultado.cotizacionId.startsWith('cot_'));
    const guardada = logistica.listarCotizaciones(1)[0];
    assert.strictEqual(guardada.politica_version, 1);
    assert.strictEqual(guardada.tarifa, 70);
  });

  test('activa automáticamente un festivo durante su fecha en Tepic', () => {
    const resultado = logistica.cotizarEntrega({ tenantId: 'tenant-prueba', colonia: 'Colonia Logística',
      origenLat: 21.5, origenLon: -104.75, momento: new Date('2030-12-25T18:00:00Z'), persistir: false });
    assert.strictEqual(resultado.tarifa, 70); // 85 se limita al máximo global de 70
    assert.ok(resultado.desglose.some(d => d.categoria === 'calendario' && d.nombre === 'Navidad'));
  });

  test('solo conserva un filtro climático activo y permite apagarlo', () => {
    assert.deepStrictEqual(logistica.alternarFiltroClima('fuerte', 'tester'), { activa: true, nivel: 'fuerte' });
    assert.deepStrictEqual(logistica.alternarFiltroClima('media', 'tester'), { activa: true, nivel: 'media' });
    let activas = logistica.listarCondiciones().filter(c => c.tipo === 'clima' && c.activa);
    assert.deepStrictEqual(activas.map(c => c.nivel), ['media']);
    assert.deepStrictEqual(logistica.alternarFiltroClima('media', 'tester'), { activa: false, nivel: null });
    activas = logistica.listarCondiciones().filter(c => c.tipo === 'clima' && c.activa);
    assert.strictEqual(activas.length, 0);
  });

  test('una versión posterior puede bloquear un cuadrante sin alterar la anterior', () => {
    logistica.guardarRegla({ nombre: 'Zona temporalmente fuera de servicio', categoria: 'restriccion',
      condicion: { cuadrante_id: cuadrante.id }, tipo_ajuste: 'bloqueo', valor: 0, prioridad: 1 });
    const publicada = logistica.publicarPolitica();
    assert.strictEqual(publicada.version_publicada, 2);
    assert.strictEqual(logistica.listarReglas(1).length, 5);
    const resultado = logistica.cotizarEntrega({ tenantId: 'tenant-prueba', colonia: 'Colonia Logística',
      origenLat: 21.5, origenLon: -104.75, persistir: false });
    assert.strictEqual(resultado.disponible, false);
    assert.match(resultado.motivo, /fuera de servicio/i);
  });
});
