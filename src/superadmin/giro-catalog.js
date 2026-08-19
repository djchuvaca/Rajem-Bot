'use strict';

/**
 * src/superadmin/giro-catalog.js
 *
 * Lee y escribe el catálogo (cortes, itemTypes, refrescos, salsas) de cada
 * giro directamente en su archivo index.js — fuente de verdad del sistema.
 *
 * Flujo:
 *   leerCatalogGiro(slug)           → datos frescos del archivo (sin caché)
 *   escribirCatalogGiro(slug, {...}) → reemplaza el bloque del array en el JS
 *
 * Limitaciones:
 *   - Solo reemplaza bloques con marcador único en el archivo.
 *   - El bracket-counter asume que los strings dentro de los arrays no
 *     contienen '[' ni ']' (válido para todos los datos actuales de los giros).
 *   - La caché en-proceso del giro registry (src/giros/index.js) se actualiza
 *     solo al reiniciar el superadmin; las lecturas de este módulo siempre
 *     son frescas porque invalidan require.cache del archivo específico.
 */

const fs   = require('fs');
const path = require('path');

const ROOT = path.join(__dirname, '../../');

// Rutas absolutas de cada archivo de giro (fuente de verdad)
const _RUTAS = {
  taqueria:       path.join(ROOT, 'src/giros/taqueria/index.js'),
  hamburgueseria: path.join(ROOT, 'src/giros/hamburgueseria.js'),
  pizzeria:       path.join(ROOT, 'src/giros/pizzeria.js'),
};

// Qué secciones del catálogo soporta cada giro
const _SOPORTA = {
  taqueria:       { cortes: true, itemTypes: true, refrescos: true, salsas: true },
  hamburgueseria: { cortes: true, itemTypes: true, refrescos: false, salsas: false },
  pizzeria:       { cortes: true, itemTypes: true, refrescos: false, salsas: false },
};

// Marcadores de cada bloque array en el archivo del giro
// (cadena única que precede inmediatamente al '[' de apertura del array)
const _MARCADORES = {
  cortes:    'const _cortes = ',
  itemTypes: 'itemTypes: ',
  refrescos: 'refrescos: ',
  salsas:    'salsas: ',
};

// ── Helpers ───────────────────────────────────────────────────────────────────

function _rutaGiro(slug) {
  const ruta = _RUTAS[slug];
  if (!ruta)                throw new Error(`Giro no soportado para catálogo: ${slug}`);
  if (!fs.existsSync(ruta)) throw new Error(`Archivo de giro no encontrado: ${ruta}`);
  return ruta;
}

function _leerGiroFresh(slug) {
  const ruta = _rutaGiro(slug);
  delete require.cache[require.resolve(ruta)];
  return require(ruta);
}

// ── Lectura ───────────────────────────────────────────────────────────────────

function leerCatalogGiro(slug) {
  const giro = _leerGiroFresh(slug);
  return {
    slug:      giro.slug,
    nombre:    giro.nombre,
    emoji:     giro.emoji,
    soporta:   _SOPORTA[slug] || { cortes: false, itemTypes: false, refrescos: false, salsas: false },
    cortes:    giro.cortes    || [],
    itemTypes: giro.itemTypes || [],
    refrescos: giro.refrescos || [],
    salsas:    giro.salsas    || [],
  };
}

// ── Serialización de objetos a texto JS ──────────────────────────────────────

function _esc(str) {
  return String(str ?? '').replace(/\\/g, '\\\\').replace(/'/g, "\\'");
}

function _serCorte(c) {
  const al = (c.aliases || []).map(a => `'${_esc(a)}'`).join(', ');
  const campos = [
    `slug: '${_esc(c.slug)}'`,
    `nombre: '${_esc(c.nombre)}'`,
    `precio_base: ${Number(c.precio_base) || 0}`,
  ];
  if (c.seccion  !== undefined) campos.push(`seccion: '${_esc(c.seccion)}'`);
  if (c.subclase !== undefined) campos.push(`subclase: '${_esc(c.subclase)}'`);
  return `    { ${campos.join(', ')},\n      aliases: [${al}],\n      descripcion: '${_esc(c.descripcion || '')}' }`;
}

function _serItemType(it) {
  const al = (it.aliases || []).map(a => `'${_esc(a)}'`).join(', ');
  return [
    '    {',
    `      slug: '${_esc(it.slug)}', nombre: '${_esc(it.nombre)}', nombre_plural: '${_esc(it.nombre_plural)}', emoji: '${_esc(it.emoji || '🍽️')}',`,
    `      aliases: [${al}],`,
    `      soporta_gramos: ${!!it.soporta_gramos}, soporta_pesos: ${!!it.soporta_pesos}, precio_campo: '${_esc(it.precio_campo || 'precio_taco')}', precio_base: ${Number(it.precio_base) || 0},`,
    '    }',
  ].join('\n');
}

function _serRefresco(r) {
  return `    { nombre: '${_esc(r.nombre)}', precio: ${Number(r.precio) || 0}, sinonimos: '${_esc(r.sinonimos || '')}',\n      descripcion: '${_esc(r.descripcion || '')}' }`;
}

function _serSalsa(s) {
  return `    { nombre: '${_esc(s.nombre)}', emoji: '${_esc(s.emoji || '')}', precio: ${Number(s.precio) || 0}, sinonimos: '${_esc(s.sinonimos || '')}',\n      descripcion: '${_esc(s.descripcion || '')}' }`;
}

const _SER = {
  cortes:    _serCorte,
  itemTypes: _serItemType,
  refrescos: _serRefresco,
  salsas:    _serSalsa,
};

// ── Localización y reemplazo del bloque de array en el texto del archivo ─────

function _encontrarBloque(contenido, marcador) {
  const idx = contenido.indexOf(marcador);
  if (idx === -1) throw new Error(`Marcador no encontrado en el archivo del giro: "${marcador}"`);

  // Avanzar hasta el '[' de apertura del array
  let pos = idx + marcador.length;
  while (pos < contenido.length && contenido[pos] !== '[') pos++;
  if (pos >= contenido.length) throw new Error(`No se encontró '[' para marcador: "${marcador}"`);
  const inicio = pos;

  // Contar corchetes para encontrar el cierre correspondiente
  let depth = 0;
  while (pos < contenido.length) {
    if (contenido[pos] === '[') depth++;
    else if (contenido[pos] === ']') { depth--; if (depth === 0) break; }
    pos++;
  }
  if (pos >= contenido.length) throw new Error(`Array sin cerrar para marcador: "${marcador}"`);

  return { inicio, fin: pos + 1 };
}

function _reemplazarBloque(contenido, tipo, items) {
  const marcador = _MARCADORES[tipo];
  const ser = _SER[tipo];
  const { inicio, fin } = _encontrarBloque(contenido, marcador);
  const nuevo = items.length === 0
    ? '[]'
    : `[\n${items.map(ser).join(',\n')},\n  ]`;
  return contenido.slice(0, inicio) + nuevo + contenido.slice(fin);
}

// ── Escritura al archivo del giro ─────────────────────────────────────────────

function escribirCatalogGiro(slug, cambios) {
  const soporta = _SOPORTA[slug] || {};
  const ruta    = _rutaGiro(slug);
  let contenido = fs.readFileSync(ruta, 'utf8');

  for (const tipo of ['cortes', 'itemTypes', 'refrescos', 'salsas']) {
    if (cambios[tipo] === undefined) continue;
    if (!soporta[tipo]) throw new Error(`El giro "${slug}" no soporta la sección "${tipo}"`);
    contenido = _reemplazarBloque(contenido, tipo, cambios[tipo]);
  }

  const tmp = `${ruta}.tmp`;
  fs.writeFileSync(tmp, contenido, 'utf8');
  fs.renameSync(tmp, ruta);

  // Invalida caché del require para que próximas llamadas a leerGiroFresh vean la versión nueva
  delete require.cache[require.resolve(ruta)];
}

// ── Utilidades para validación y generación de slugs ─────────────────────────

function slugDesdeNombre(nombre) {
  return (nombre || '')
    .toLowerCase()
    .normalize('NFD').replace(/[̀-ͯ]/g, '')
    .replace(/\s+/g, '_')
    .replace(/[^a-z0-9_]/g, '')
    .replace(/_+/g, '_')
    .replace(/^_|_$/g, '');
}

function validarSlugDisponible(catalogo, tipo, slug, slugActual = null) {
  const arr   = catalogo[tipo] || [];
  const campo = (tipo === 'refrescos' || tipo === 'salsas') ? 'nombre' : 'slug';
  return !arr.some(item => item[campo] === slug && item[campo] !== slugActual);
}

module.exports = {
  leerCatalogGiro,
  escribirCatalogGiro,
  slugDesdeNombre,
  validarSlugDisponible,
  GIROS_SOPORTADOS: Object.keys(_RUTAS),
};
