process.env.TENANT_ID = '_test_geo';
'use strict';
// Tests para src/geo/index.js — normalizar, buscarColonia, calcularTarifaDomicilio

const { test, describe, before } = require('node:test');
const assert = require('node:assert/strict');

const { initDB, run, queryOne } = require('../src/db/core');
const { seedDB }                 = require('../src/db/seed');
const {
  normalizar,
  buscarColonia,
  calcularTarifaDomicilio,
  invalidarCacheColonias,
  invalidarCacheConfig,
} = require('../src/geo');
const { esTenantTepic, resolverTenant } = require('../src/geo/geotepic');
const diccionarioTepic = require('../src/geo/geotepic/diccionario_colonias_tepic');

describe('GeoTepic — alcance territorial', () => {
  const tenants = [
    { id: 'tepic', ciudad: 'Tepic', estado: 'Nayarit', db_path: 'data/tepic.db' },
    { id: 'xalisco', ciudad: 'Xalisco', estado: 'Nayarit', db_path: 'data/xalisco.db' },
  ];

  test('solo reconoce tenants de Tepic, Nayarit', () => {
    assert.strictEqual(esTenantTepic(tenants[0]), true);
    assert.strictEqual(esTenantTepic(tenants[1]), false);
  });

  test('resuelve el tenant por id o por nombre de su base', () => {
    assert.strictEqual(resolverTenant(tenants, 'tepic')?.id, 'tepic');
    assert.strictEqual(resolverTenant(tenants, 'xalisco')?.id, 'xalisco');
  });

  test('incluye el catálogo canónico completo para instalaciones nuevas', () => {
    const catalogo = Object.values(diccionarioTepic.COLONIAS);
    assert.strictEqual(catalogo.length, 300);
    assert.strictEqual(new Set(catalogo.map(c => c.id)).size, 300);
    assert.ok(catalogo.every(c => c.nombre && Number.isFinite(c.coordenadas.latitud) && Number.isFinite(c.coordenadas.longitud)));
  });
});

describe('GeoTepic — diccionario enriquecido', () => {
  test('contiene 300 asentamientos con coordenadas y trazabilidad', () => {
    const colonias = Object.values(diccionarioTepic.COLONIAS);
    assert.strictEqual(colonias.length, 300);
    assert.ok(colonias.every(c => c.id && c.nombre && Number.isFinite(c.coordenadas.latitud) && Number.isFinite(c.coordenadas.longitud)));
    assert.strictEqual(colonias.filter(c => c.coordenadas.verificada).length, 163);
  });

  test('detecta nombres ambiguos sin seleccionar arbitrariamente', () => {
    const r = diccionarioTepic.buscarColonia('Los Fresnos');
    assert.strictEqual(r.estado, 'ambigua');
    assert.deepStrictEqual(r.opciones.map(o => o.nombre).sort(), ['Los Fresnos', 'Los Fresnos Oriente', 'Los Fresnos Poniente'].sort());
  });

  test('reconoce una forma coloquial sin artículos', () => {
    const r = diccionarioTepic.buscarColonia('vistas cantera');
    assert.strictEqual(r.estado, 'encontrada');
    assert.strictEqual(r.colonia.nombre, 'Vistas de La Cantera');
  });

  test('una frase genérica inexistente no produce una colonia', () => {
    assert.strictEqual(diccionarioTepic.buscarColonia('colonia que no existe').estado, 'no_encontrada');
  });
});

// Colonias de prueba — coordenadas ficticias pero coherentes
const _COLONIAS = [
  { nombre: 'Centro Histórico',      lat: 20.0,  lon: -103.0, aliases: ['["Centro","centro historico","col centro"]'] },
  { nombre: 'INFONAVIT Los Fresnos', lat: 20.05, lon: -103.1, aliases: ['["Los Fresnos","Fresnos Infonavit"]'] },
  { nombre: 'Lomas del Valle',       lat: 20.1,  lon: -103.2, aliases: ['[]'] },
  { nombre: 'Residencial San Juan',  lat: 20.15, lon: -103.3, aliases: ['["San Juan Residencial","Res. San Juan"]'] },
  { nombre: 'El Paraíso',            lat: 20.5,  lon: -103.5, aliases: ['[]'] },
];

const _ZONAS = [
  { nombre_zona: 'Zona 1 — Cerca',    distancia_max: 5,    tarifa: 30 },
  { nombre_zona: 'Zona 2 — Media',    distancia_max: 10,   tarifa: 50 },
  { nombre_zona: 'Zona 3 — Lejos',    distancia_max: 20,   tarifa: 80 },
  { nombre_zona: 'Zona 4 — Muy lejos', distancia_max: 9999, tarifa: 120 },
];

// negocio en lat=20.0, lon=-103.0 (mismo punto que Centro Histórico = 0 km)
const _NEG_LAT = '20.0';
const _NEG_LON = '-103.0';

before(async () => {
  await initDB();
  await seedDB();

  // Limpiar y poblar con datos de prueba aislados
  run('DELETE FROM colonias');
  run('DELETE FROM tarifas_zonas');
  for (const c of _COLONIAS) {
    run(
      'INSERT INTO colonias (nombre, lat, lon, activo, slug, tipo, aliases) VALUES (?,?,?,1,?,?,?)',
      [c.nombre, c.lat, c.lon, '', 'colonia', c.aliases[0]]
    );
  }
  for (const z of _ZONAS) {
    run(
      'INSERT INTO tarifas_zonas (nombre_zona, distancia_max, tarifa) VALUES (?,?,?)',
      [z.nombre_zona, z.distancia_max, z.tarifa]
    );
  }
  run("INSERT OR REPLACE INTO configuracion (clave, valor) VALUES ('negocio_lat', ?)", [_NEG_LAT]);
  run("INSERT OR REPLACE INTO configuracion (clave, valor) VALUES ('negocio_lon', ?)", [_NEG_LON]);
  run("INSERT OR REPLACE INTO configuracion (clave, valor) VALUES ('domicilio_costo', '50')");
  run("INSERT OR REPLACE INTO configuracion (clave, valor) VALUES ('geo_tarifa_aproximada', '1')");

  // Forzar recarga de cachés
  invalidarCacheColonias();
  invalidarCacheConfig();
});

// ═══════════════════════════════════════════════════════════════════════════
// normalizar()
// ═══════════════════════════════════════════════════════════════════════════
describe('normalizar', () => {
  test('texto vacío retorna string vacío', () => {
    assert.strictEqual(normalizar(''), '');
    assert.strictEqual(normalizar(null), '');
    assert.strictEqual(normalizar(undefined), '');
  });

  test('elimina acentos y convierte a minúsculas', () => {
    assert.strictEqual(normalizar('Colonia Álvarez'), 'alvarez');
  });

  test('elimina prefijo "colonia"', () => {
    assert.strictEqual(normalizar('colonia Centro'), 'centro');
    assert.strictEqual(normalizar('col. Centro'),   'centro');
    assert.strictEqual(normalizar('col Centro'),    'centro');
  });

  test('elimina prefijo "fraccionamiento"', () => {
    assert.strictEqual(normalizar('fraccionamiento Las Flores'), 'las flores');
    assert.strictEqual(normalizar('fracc. Las Flores'),          'las flores');
  });

  test('elimina prefijo "residencial"', () => {
    assert.strictEqual(normalizar('residencial San Juan'), 'san juan');
  });

  test('elimina artículo antes del prefijo', () => {
    assert.strictEqual(normalizar('la colonia Centro'), 'centro');
    assert.strictEqual(normalizar('el fracc. Norte'),   'norte');
  });

  test('elimina puntuación al final', () => {
    assert.strictEqual(normalizar('Centro,'), 'centro');
    assert.strictEqual(normalizar('Valle.'),  'valle');
  });

  test('colapsa espacios múltiples', () => {
    assert.strictEqual(normalizar('Lomas   del  Valle'), 'lomas del valle');
  });
});

// ═══════════════════════════════════════════════════════════════════════════
// buscarColonia()
// ═══════════════════════════════════════════════════════════════════════════
describe('buscarColonia — coincidencia exacta por nombre', () => {
  test('nombre exacto retorna la colonia', () => {
    const r = buscarColonia('Centro Histórico');
    assert.ok(r, 'debe encontrar la colonia');
    assert.strictEqual(r.nombre, 'Centro Histórico');
  });

  test('nombre exacto sin acento retorna la colonia', () => {
    const r = buscarColonia('Centro Historico');
    assert.ok(r);
    assert.strictEqual(r.nombre, 'Centro Histórico');
  });

  test('nombre con prefijo "colonia" retorna la colonia', () => {
    const r = buscarColonia('colonia Centro Histórico');
    assert.ok(r);
    assert.strictEqual(r.nombre, 'Centro Histórico');
  });

  test('nombre en mayúsculas retorna la colonia', () => {
    const r = buscarColonia('LOMAS DEL VALLE');
    assert.ok(r);
    assert.strictEqual(r.nombre, 'Lomas del Valle');
  });
});

describe('buscarColonia — coincidencia exacta por alias', () => {
  test('alias principal retorna la colonia correcta', () => {
    const r = buscarColonia('Centro');
    assert.ok(r, 'debe encontrar por alias "Centro"');
    assert.strictEqual(r.nombre, 'Centro Histórico');
  });

  test('alias con espacios retorna la colonia correcta', () => {
    const r = buscarColonia('centro historico');
    assert.ok(r);
    assert.strictEqual(r.nombre, 'Centro Histórico');
  });

  test('alias con prefijo "col" retorna la colonia correcta', () => {
    const r = buscarColonia('col centro');
    assert.ok(r);
    assert.strictEqual(r.nombre, 'Centro Histórico');
  });

  test('alias compuesto retorna la colonia correcta', () => {
    const r = buscarColonia('Fresnos Infonavit');
    assert.ok(r, 'debe encontrar por alias "Fresnos Infonavit"');
    assert.strictEqual(r.nombre, 'INFONAVIT Los Fresnos');
  });

  test('alias "Res. San Juan" normaliza y retorna la colonia', () => {
    const r = buscarColonia('Res. San Juan');
    assert.ok(r);
    assert.strictEqual(r.nombre, 'Residencial San Juan');
  });
});

describe('buscarColonia — coincidencia por conjunto de palabras', () => {
  test('palabras en orden diferente encuentran la colonia', () => {
    const r = buscarColonia('Fresnos Los INFONAVIT');
    assert.ok(r);
    assert.strictEqual(r.nombre, 'INFONAVIT Los Fresnos');
  });

  test('palabras clave sin stopwords encuentran la colonia', () => {
    const r = buscarColonia('San Juan Residencial');
    assert.ok(r);
    assert.strictEqual(r.nombre, 'Residencial San Juan');
  });
});

describe('buscarColonia — coincidencia parcial', () => {
  test('substring significativo de nombre retorna la colonia', () => {
    const r = buscarColonia('Paraíso');
    assert.ok(r);
    assert.strictEqual(r.nombre, 'El Paraíso');
  });

  test('string de 1 char retorna null (guard de longitud)', () => {
    assert.strictEqual(buscarColonia('x'), null);
    assert.strictEqual(buscarColonia('a'), null);
  });

  test('stopword sola "el" encuentra el único candidato con word-boundary', () => {
    // El algoritmo retorna candidato único aunque el score sea bajo — comportamiento esperado
    const r = buscarColonia('el');
    assert.ok(r !== null, '"el" debe encontrar El Paraíso (único candidato)');
    assert.strictEqual(r.nombre, 'El Paraíso');
  });
});

describe('buscarColonia — casos nulos', () => {
  test('null retorna null', () => assert.strictEqual(buscarColonia(null),      null));
  test('undefined retorna null', () => assert.strictEqual(buscarColonia(undefined), null));
  test('string vacío retorna null', () => assert.strictEqual(buscarColonia(''),   null));
  test('nombre sin coincidencia retorna null', () => {
    assert.strictEqual(buscarColonia('ColoniaQueNoExisteXYZ'), null);
  });
});

// ═══════════════════════════════════════════════════════════════════════════
// calcularTarifaDomicilio()
// ═══════════════════════════════════════════════════════════════════════════
describe('calcularTarifaDomicilio', () => {
  test('una coordenada aproximada usa tarifa plana si el tenant no la autoriza', () => {
    run("UPDATE colonias SET verificada=0 WHERE nombre='Centro Histórico'");
    run("INSERT OR REPLACE INTO configuracion (clave, valor) VALUES ('geo_tarifa_aproximada', '0')");
    invalidarCacheColonias(); invalidarCacheConfig();
    const r = calcularTarifaDomicilio('Centro Histórico');
    assert.strictEqual(r.encontrada, true);
    assert.strictEqual(r.requiereVerificacion, true);
    assert.strictEqual(r.tarifa, 50);
    run("UPDATE colonias SET verificada=1 WHERE nombre='Centro Histórico'");
    run("INSERT OR REPLACE INTO configuracion (clave, valor) VALUES ('geo_tarifa_aproximada', '1')");
    invalidarCacheColonias(); invalidarCacheConfig();
  });
  test('colonia no encontrada usa tarifa fallback', () => {
    const r = calcularTarifaDomicilio('ColoniaInexistente');
    assert.strictEqual(r.encontrada, false);
    assert.strictEqual(r.tarifa, 50); // domicilio_costo por defecto
  });

  test('colonia en misma ubicación que el negocio queda en Zona 1', () => {
    // Centro Histórico está en lat=20.0 lon=-103.0, igual que el negocio → ~0 km
    const r = calcularTarifaDomicilio('Centro Histórico');
    assert.strictEqual(r.encontrada, true);
    assert.strictEqual(r.zona, 'Zona 1 — Cerca');
    assert.strictEqual(r.tarifa, 30);
    assert.ok(r.distancia <= 5);
    assert.strictEqual(r.fueraDeCobertura, false);
    assert.strictEqual(r.coloniaNombre, 'Centro Histórico');
  });

  test('colonia por alias también calcula correctamente', () => {
    const r = calcularTarifaDomicilio('Centro');
    assert.strictEqual(r.encontrada, true);
    assert.strictEqual(r.coloniaNombre, 'Centro Histórico');
  });

  test('colonia lejana queda en zona superior', () => {
    // El Paraíso está en lat=20.5 lon=-103.5, distancia al negocio ~67 km
    const r = calcularTarifaDomicilio('El Paraíso');
    assert.strictEqual(r.encontrada, true);
    assert.ok(r.distancia > 20);
    assert.strictEqual(r.zona, 'Zona 4 — Muy lejos');
    assert.strictEqual(r.tarifa, 120);
  });

  test('sin coordenadas del negocio usa tarifa fallback', () => {
    run("UPDATE configuracion SET valor='' WHERE clave='negocio_lat'");
    invalidarCacheConfig();
    const r = calcularTarifaDomicilio('Centro Histórico');
    assert.strictEqual(r.tarifa, 50);
    assert.strictEqual(r.encontrada, false);
    // Restaurar para tests siguientes
    run("UPDATE configuracion SET valor=? WHERE clave='negocio_lat'", [_NEG_LAT]);
    invalidarCacheConfig();
  });
});
