'use strict';

const { describe, test, before, after } = require('node:test');
const assert = require('node:assert/strict');
const os = require('os');
const path = require('path');
const fs = require('fs');

const dbPath = path.join(os.tmpdir(), `rajem-logistica-regresion-${process.pid}.db`);
process.env.ADMIN_DB_PATH = dbPath;
process.env.SUPERADMIN_INITIAL_PASSWORD = 'password-segura-regresion';

const { getAdminDB } = require('../src/db/admin');
const geo = require('../src/geo/geotepic');
const logistica = require('../src/logistica');

const POLIGONO = { type: 'Polygon', coordinates: [[
  [-105, 21], [-104, 21], [-104, 22], [-105, 22], [-105, 21],
]] };
let cuadrante;

function cotizar(opciones = {}) {
  return logistica.cotizarEntrega({
    tenantId: opciones.tenantId || 'tenant-a',
    colonia: opciones.colonia || 'Centro Pruebas',
    origenLat: 21.5,
    origenLon: -104.75,
    momento: opciones.momento || new Date('2030-02-10T18:00:00Z'),
    condicionesSimuladas: opciones.condiciones ?? [],
    usarBorrador: Boolean(opciones.borrador),
    persistir: Boolean(opciones.persistir),
  });
}

before(() => {
  const db = getAdminDB();
  db.prepare('DELETE FROM geo_tepic_cuadrantes').run();
  db.prepare('DELETE FROM geo_tepic_colonias').run();
  geo.guardarColonia({ nombre: 'Centro Pruebas', lat: 21.5, lon: -104.75, verificada: 1 });
  geo.guardarColonia({ nombre: 'Lejana Pruebas', lat: 21.565, lon: -104.75, verificada: 1 });
  cuadrante = geo.crearCuadrante({ nombre: 'Acceso controlado', geometry: POLIGONO });
  logistica.actualizarPolitica({ redondeo: 5, tarifa_minima: 25, tarifa_maxima: 80 });

  logistica.guardarRegla({ nombre: 'Corta 0-5', categoria: 'distancia',
    condicion: { desde_km: 0, hasta_km: 5 }, tipo_ajuste: 'fijo', valor: 30, acumulable: false });
  logistica.guardarRegla({ nombre: 'Larga desde 5', categoria: 'distancia',
    condicion: { desde_km: 5, hasta_km: null }, tipo_ajuste: 'fijo', valor: 50, acumulable: false });
  logistica.guardarRegla({ nombre: 'Cuadrante difícil', categoria: 'territorio',
    condicion: { cuadrante_id: cuadrante.id }, tipo_ajuste: 'fijo', valor: 10 });
  logistica.guardarRegla({ nombre: 'Lluvia fuerte', categoria: 'clima',
    condicion: { nivel: 'lluvia_fuerte' }, tipo_ajuste: 'porcentaje', valor: 10 });
  logistica.guardarRegla({ nombre: 'Navidad', categoria: 'calendario',
    condicion: { nivel: 'navidad', fecha: '2030-12-25' }, tipo_ajuste: 'fijo', valor: 20 });
  logistica.guardarRegla({ nombre: 'Nocturno', categoria: 'horario',
    condicion: { hora_desde: '22:00', hora_hasta: '06:00' }, tipo_ajuste: 'fijo', valor: 5 });
  logistica.publicarPolitica();
});

after(() => {
  try { getAdminDB().close(); } catch (_) {}
  try { fs.unlinkSync(dbPath); } catch (_) {}
});

describe('Regresión integral de tarifas logísticas', () => {
  test('selecciona una sola banda por distancia y conserva el orden estructural', () => {
    const corta = cotizar();
    assert.deepStrictEqual(corta.desglose.map(x => x.categoria), ['distancia', 'territorio']);
    assert.strictEqual(corta.tarifa, 40);
    const larga = cotizar({ colonia: 'Lejana Pruebas' });
    assert.ok(larga.distanciaKm > 5);
    assert.strictEqual(larga.desglose.filter(x => x.categoria === 'distancia').length, 1);
    assert.strictEqual(larga.tarifa, 60);
  });

  test('rechaza bandas con huecos, traslapes o sin comenzar en cero', () => {
    const ids = logistica.listarReglas().filter(r => r.categoria === 'distancia').map(r => r.id);
    for (const id of ids) logistica.eliminarRegla(id);
    logistica.guardarRegla({ nombre: 'Empieza tarde', categoria: 'distancia',
      condicion: { desde_km: 1, hasta_km: null }, tipo_ajuste: 'fijo', valor: 30 });
    assert.throws(() => logistica.publicarPolitica(), /comenzar en 0/i);
    for (const r of logistica.listarReglas().filter(x => x.categoria === 'distancia')) logistica.eliminarRegla(r.id);
    logistica.guardarRegla({ nombre: 'Primera', categoria: 'distancia',
      condicion: { desde_km: 0, hasta_km: 5 }, tipo_ajuste: 'fijo', valor: 30 });
    logistica.guardarRegla({ nombre: 'Con hueco', categoria: 'distancia',
      condicion: { desde_km: 6, hasta_km: null }, tipo_ajuste: 'fijo', valor: 50 });
    assert.throws(() => logistica.publicarPolitica(), /huecos ni traslapes/i);
    for (const r of logistica.listarReglas().filter(x => x.categoria === 'distancia')) logistica.eliminarRegla(r.id);
    logistica.guardarRegla({ nombre: 'Corta 0-5', categoria: 'distancia',
      condicion: { desde_km: 0, hasta_km: 5 }, tipo_ajuste: 'fijo', valor: 30, acumulable: false });
    logistica.guardarRegla({ nombre: 'Larga desde 5', categoria: 'distancia',
      condicion: { desde_km: 5, hasta_km: null }, tipo_ajuste: 'fijo', valor: 50, acumulable: false });
  });

  test('la versión publicada permanece estable aunque el borrador cambie', () => {
    assert.strictEqual(cotizar().tarifa, 40);
    logistica.guardarRegla({ nombre: 'Extra borrador', categoria: 'extraordinario',
      condicion: { nivel: 'prueba' }, tipo_ajuste: 'fijo', valor: 25 });
    assert.strictEqual(cotizar().tarifa, 40);
    assert.strictEqual(cotizar({ borrador: true, condiciones: [{ tipo: 'extraordinario', nivel: 'prueba' }] }).tarifa, 65);
  });

  test('clima es exclusivo y se puede apagar', () => {
    assert.deepStrictEqual(logistica.alternarFiltroClima('lluvia_fuerte', 'test'), { activa: true, nivel: 'lluvia_fuerte' });
    const lluvia = logistica.cotizarEntrega({ tenantId: 'tenant-a', colonia: 'Centro Pruebas',
      origenLat: 21.5, origenLon: -104.75, persistir: false });
    assert.ok(lluvia.desglose.some(x => x.categoria === 'clima'));
    assert.deepStrictEqual(logistica.alternarFiltroClima('lluvia_fuerte', 'test'), { activa: false, nivel: null });
    assert.strictEqual(logistica.listarCondiciones().filter(x => x.tipo === 'clima' && x.activa).length, 0);
  });

  test('festivo entra y sale exactamente a medianoche de Tepic', () => {
    const antes = cotizar({ momento: new Date('2030-12-25T05:59:00Z') });
    const inicio = cotizar({ momento: new Date('2030-12-25T06:00:00Z') });
    const final = cotizar({ momento: new Date('2030-12-26T06:00:00Z') });
    assert.ok(!antes.desglose.some(x => x.categoria === 'calendario'));
    assert.ok(inicio.desglose.some(x => x.categoria === 'calendario'));
    assert.ok(!final.desglose.some(x => x.categoria === 'calendario'));
  });

  test('franja nocturna se repite diariamente y cruza medianoche', () => {
    const antes = cotizar({ momento: new Date('2030-02-11T03:59:00Z') }); // 21:59 Tepic
    const inicio = cotizar({ momento: new Date('2030-02-11T04:00:00Z') }); // 22:00 Tepic
    const madrugada = cotizar({ momento: new Date('2030-02-11T11:59:00Z') }); // 05:59 Tepic
    const final = cotizar({ momento: new Date('2030-02-11T12:00:00Z') }); // 06:00 Tepic
    assert.ok(!antes.desglose.some(x => x.categoria === 'horario'));
    assert.ok(inicio.desglose.some(x => x.categoria === 'horario'));
    assert.ok(madrugada.desglose.some(x => x.categoria === 'horario'));
    assert.ok(!final.desglose.some(x => x.categoria === 'horario'));
  });

  test('aplica redondeo y después limita exactamente por tarifa máxima', () => {
    const resultado = cotizar({ momento: new Date('2030-02-11T04:30:00Z'),
      condiciones: [{ tipo: 'clima', nivel: 'lluvia_fuerte', nombre: 'Lluvia fuerte' }] });
    assert.strictEqual(resultado.tarifa, 50); // (30+10)*1.10 + 5 horario = 49; redondea a 50
    const saturada = cotizar({ colonia: 'Lejana Pruebas', momento: new Date('2030-12-26T04:30:00Z'),
      condiciones: [{ tipo: 'clima', nivel: 'lluvia_fuerte', nombre: 'Lluvia fuerte' }] });
    assert.strictEqual(saturada.tarifa, 80);
    assert.strictEqual(saturada.tarifaMaximaAplicada, true);
    assert.strictEqual(saturada.desglose.at(-1).categoria, 'limite');
  });

  test('todos los tenants consumen la misma política sin mezclar cotizaciones', () => {
    const a = cotizar({ tenantId: 'tenant-a', persistir: true });
    const b = cotizar({ tenantId: 'tenant-b', persistir: true });
    assert.strictEqual(a.tarifa, b.tarifa);
    assert.notStrictEqual(a.cotizacionId, b.cotizacionId);
    const filas = logistica.listarCotizaciones(10).filter(x => [a.cotizacionId, b.cotizacionId].includes(x.id));
    assert.deepStrictEqual(new Set(filas.map(x => x.tenant_id)), new Set(['tenant-a', 'tenant-b']));
  });

  test('una cotización queda vinculada una sola vez al pedido', () => {
    const c = cotizar({ persistir: true });
    assert.strictEqual(logistica.vincularCotizacion(c.cotizacionId, 9001), true);
    assert.strictEqual(logistica.vincularCotizacion(c.cotizacionId, 9002), false);
    const guardada = logistica.listarCotizaciones(20).find(x => x.id === c.cotizacionId);
    assert.strictEqual(guardada.pedido_id, 9001);
    assert.strictEqual(guardada.estado, 'aceptada');
  });
});
