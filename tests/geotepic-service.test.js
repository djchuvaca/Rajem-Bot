'use strict';

const { test, describe, before, after } = require('node:test');
const assert = require('node:assert/strict');
const os = require('os');
const path = require('path');
const fs = require('fs');
const express = require('express');

process.env.ADMIN_DB_PATH = path.join(os.tmpdir(), `rajem-admin-geotepic-service-${process.pid}.db`);
process.env.SUPERADMIN_INITIAL_PASSWORD = 'test-password-not-production';

const { getAdminDB } = require('../src/db/admin');
const geoTepic = require('../src/geo/geotepic');
const crearRouterGeoTepic = require('../src/geo/geotepic/routes');

const POLIGONO_CENTRO = {
  type: 'Polygon',
  coordinates: [[[-105, 21], [-104, 21], [-104, 22], [-105, 22], [-105, 21]]],
};
const POLIGONO_OESTE = {
  type: 'Polygon',
  coordinates: [[[-105, 21], [-104.5, 21], [-104.5, 22], [-105, 22], [-105, 21]]],
};

let centro;
let centroOeste;
let servidor;
let baseUrl;

before(async () => {
  const db = getAdminDB();
  db.prepare('DELETE FROM geo_tepic_cuadrantes').run();
  db.prepare('DELETE FROM geo_tepic_colonias').run();

  geoTepic.guardarColonia({ nombre: 'San Juan', lat: 21.5, lon: -104.75, aliases: ['Colonia San Juan'] });
  geoTepic.guardarColonia({ nombre: 'Morelos', lat: 21.5, lon: -104.25 });
  geoTepic.guardarColonia({ nombre: 'Fuera', lat: 23, lon: -103 });
  centro = geoTepic.crearCuadrante({ nombre: 'Centro', geometry: POLIGONO_CENTRO });
  centroOeste = geoTepic.crearCuadrante({ nombre: 'Centro Oeste', parentId: centro.id, geometry: POLIGONO_OESTE });

  const app = express();
  app.use('/api/geotepic', crearRouterGeoTepic());
  await new Promise(resolve => {
    servidor = app.listen(0, '127.0.0.1', () => {
      baseUrl = `http://127.0.0.1:${servidor.address().port}/api/geotepic`;
      resolve();
    });
  });
});

after(async () => {
  if (servidor) await new Promise(resolve => servidor.close(resolve));
  try { getAdminDB().close(); } catch (_) {}
  try { fs.unlinkSync(process.env.ADMIN_DB_PATH); } catch (_) {}
});

describe('GeoTepic Service — consultas espaciales reutilizables', () => {
  test('encuentra una colonia mediante el índice normalizado y devuelve su jerarquía', () => {
    const resultado = geoTepic.obtenerZonaDeColonia('  SÁN   JUAN ');
    assert.strictEqual(resultado.colonia, 'San Juan');
    assert.deepStrictEqual(resultado.ubicacion, { lat: 21.5, lng: -104.75 });
    assert.strictEqual(resultado.enCobertura, true);
    assert.deepStrictEqual(resultado.zonas.map(z => z.nombre), ['Centro', 'Centro Oeste']);
    assert.deepStrictEqual(resultado.ruta, ['Centro', 'Centro Oeste']);
  });

  test('consulta coordenadas usando entrada lat,lng y devuelve todos los niveles', () => {
    const resultado = geoTepic.obtenerZonaPorCoordenadas(21.5, -104.75);
    assert.strictEqual(resultado.enCobertura, true);
    assert.deepStrictEqual(resultado.zonas.map(z => z.id), [centro.id, centroOeste.id]);
  });

  test('una coordenada fuera de los polígonos no recibe una zona inventada', () => {
    assert.deepStrictEqual(geoTepic.obtenerZonaPorCoordenadas(23, -103), {
      lat: 23,
      lng: -103,
      enCobertura: false,
      zonas: [],
    });
  });

  test('lista únicamente las colonias contenidas por el cuadrante solicitado', () => {
    const resultado = geoTepic.obtenerColoniasPorCuadrante(centroOeste.id);
    assert.strictEqual(resultado.cuadrante.nombre, 'Centro Oeste');
    assert.strictEqual(resultado.total, 1);
    assert.deepStrictEqual(resultado.colonias.map(c => c.nombre), ['San Juan']);
  });

  test('determina cercanía lógica por nivel sin usar distancia', () => {
    const nivelUno = geoTepic.sonColoniasMismaZona('San Juan', 'Morelos', 1);
    const nivelDos = geoTepic.sonColoniasMismaZona('San Juan', 'Morelos', 2);
    assert.strictEqual(nivelUno.mismaZona, true);
    assert.strictEqual(nivelUno.zona, 'Centro');
    assert.strictEqual(nivelDos.mismaZona, false);
    assert.strictEqual(nivelDos.zona, null);
  });

  test('diferencia colonia inexistente de coordenadas inválidas', () => {
    assert.throws(() => geoTepic.obtenerZonaDeColonia('No existe'), error => error.codigo === 'COLONIA_NO_ENCONTRADA');
    assert.throws(() => geoTepic.obtenerZonaPorCoordenadas(999, -104), error => error.codigo === 'COORDENADAS_INVALIDAS');
  });

  test('genera estado diagnóstico con cuadrantes, subcuadrantes y colonias sin asignar', () => {
    assert.deepStrictEqual(geoTepic.obtenerEstado(), {
      colonias: 3,
      cuadrantes: 1,
      subcuadrantes: 1,
      sinAsignar: 1,
      conflictos: 0,
      detalleConflictos: { colonias: 0, solapamientos: 0 },
    });
  });
});

describe('GeoTepic Service — endpoints', () => {
  test('GET /ubicacion expone la consulta espacial', async () => {
    const respuesta = await fetch(`${baseUrl}/ubicacion?lat=21.5&lng=-104.75`);
    const body = await respuesta.json();
    assert.strictEqual(respuesta.status, 200);
    assert.strictEqual(body.ok, true);
    assert.strictEqual(body.enCobertura, true);
    assert.deepStrictEqual(body.zonas.map(z => z.nombre), ['Centro', 'Centro Oeste']);
  });

  test('GET /cuadrantes/:id/colonias expone las colonias contenidas', async () => {
    const respuesta = await fetch(`${baseUrl}/cuadrantes/${centroOeste.id}/colonias`);
    const body = await respuesta.json();
    assert.strictEqual(respuesta.status, 200);
    assert.strictEqual(body.total, 1);
    assert.strictEqual(body.colonias[0].nombre, 'San Juan');
  });

  test('los endpoints entregan códigos de error estables', async () => {
    const colonia = await fetch(`${baseUrl}/colonia?nombre=No%20existe`);
    const coordenadas = await fetch(`${baseUrl}/ubicacion?lat=x&lng=-104`);
    assert.strictEqual(colonia.status, 404);
    assert.deepStrictEqual(await colonia.json(), { ok: false, codigo: 'COLONIA_NO_ENCONTRADA' });
    assert.strictEqual(coordenadas.status, 400);
    assert.deepStrictEqual(await coordenadas.json(), { ok: false, codigo: 'COORDENADAS_INVALIDAS' });
  });
});
