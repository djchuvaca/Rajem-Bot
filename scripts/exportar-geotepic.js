#!/usr/bin/env node
'use strict';

// Genera el catálogo canónico versionable desde una BD Tepic ya validada.
const fs = require('fs');
const path = require('path');
const Database = require('better-sqlite3');

const source = path.resolve(process.argv[2] || path.join(__dirname, '../data/tacos_javier.db'));
const target = path.resolve(process.argv[3] || path.join(__dirname, '../src/geo/geotepic/tepic-nayarit.json'));
if (!fs.existsSync(source)) throw new Error(`BD origen no encontrada: ${source}`);

const db = new Database(source, { readonly: true, fileMustExist: true });
let rows;
try {
  rows = db.prepare(`SELECT nombre, slug, tipo, lat, lon, aliases
    FROM colonias ORDER BY nombre COLLATE NOCASE`).all().map(c => ({
      nombre: c.nombre,
      slug: c.slug,
      tipo: c.tipo || 'colonia',
      lat: c.lat,
      lon: c.lon,
      aliases: (() => { try { return JSON.parse(c.aliases || '[]'); } catch (_) { return []; } })(),
    }));
} finally { db.close(); }

if (rows.length < 100) throw new Error(`Catálogo incompleto: sólo ${rows.length} colonias`);
if (rows.some(c => !c.nombre || !c.slug || !Number.isFinite(c.lat) || !Number.isFinite(c.lon))) {
  throw new Error('El catálogo contiene registros inválidos');
}
fs.writeFileSync(target, `${JSON.stringify(rows, null, 2)}\n`, 'utf8');
console.log(`GeoTepic exportado: ${rows.length} colonias -> ${target}`);
