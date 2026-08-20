'use strict';

const { booleanPointInPolygon } = require('@turf/boolean-point-in-polygon');
const { point, featureCollection } = require('@turf/helpers');
const { intersect } = require('@turf/intersect');
const { getAdminDB } = require('../../../db/admin');

class GeoTepicError extends Error {
  constructor(codigo, mensaje) {
    super(mensaje);
    this.name = 'GeoTepicError';
    this.codigo = codigo;
  }
}

let _indiceColonias = null;
let _colonias = null;

function normalizarNombre(nombre) {
  return String(nombre || '')
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '')
    .toLowerCase()
    .trim()
    .replace(/\s+/g, ' ');
}

function _parsearLista(valor) {
  if (Array.isArray(valor)) return valor;
  try {
    const lista = JSON.parse(valor || '[]');
    return Array.isArray(lista) ? lista : [];
  } catch (_) {
    return [];
  }
}

function invalidarIndiceColonias() {
  _indiceColonias = null;
  _colonias = null;
}

function _cargarIndiceColonias() {
  if (_indiceColonias) return;
  const filas = getAdminDB().prepare(`SELECT id,nombre,nombre_oficial,lat,lon,aliases
    FROM geo_tepic_colonias WHERE activo=1 AND excluida=0 ORDER BY nombre COLLATE NOCASE`).all();
  const indice = new Map();

  for (const fila of filas) {
    const colonia = {
      id: fila.id,
      nombre: fila.nombre,
      lat: Number(fila.lat),
      lng: Number(fila.lon),
    };
    const variantes = [fila.nombre, fila.nombre_oficial, ..._parsearLista(fila.aliases)];
    for (const variante of variantes) {
      const clave = normalizarNombre(variante);
      if (clave && !indice.has(clave)) indice.set(clave, colonia);
    }
  }

  _colonias = filas.map(fila => ({
    id: fila.id,
    nombre: fila.nombre,
    lat: Number(fila.lat),
    lng: Number(fila.lon),
  }));
  _indiceColonias = indice;
}

function _buscarColonia(nombre) {
  _cargarIndiceColonias();
  return _indiceColonias.get(normalizarNombre(nombre)) || null;
}

function _validarCoordenadas(lat, lng) {
  const latitud = Number(lat);
  const longitud = Number(lng);
  if (!Number.isFinite(latitud) || latitud < -90 || latitud > 90
    || !Number.isFinite(longitud) || longitud < -180 || longitud > 180) {
    throw new GeoTepicError('COORDENADAS_INVALIDAS', 'Las coordenadas proporcionadas no son válidas');
  }
  return { lat: latitud, lng: longitud };
}

function _listarCuadrantes() {
  return getAdminDB().prepare(`SELECT id,codigo,nombre,nivel,parent_id,geometry
    FROM geo_tepic_cuadrantes ORDER BY nivel,codigo COLLATE NOCASE`).all().map(fila => ({
    id: fila.id,
    codigo: fila.codigo,
    nombre: fila.nombre,
    nivel: fila.nivel,
    parentId: fila.parent_id,
    geometry: JSON.parse(fila.geometry),
  }));
}

function _zonaPublica(zona) {
  return {
    id: zona.id,
    codigo: zona.codigo,
    nombre: zona.nombre,
    nivel: zona.nivel,
  };
}

function _zonasQueContienen(lat, lng, cuadrantes = _listarCuadrantes()) {
  const punto = point([lng, lat]);
  return cuadrantes
    .filter(zona => booleanPointInPolygon(punto, zona.geometry))
    .sort((a, b) => a.nivel - b.nivel || a.codigo.localeCompare(b.codigo, 'es'));
}

function obtenerZonaPorCoordenadas(lat, lng) {
  const coordenadas = _validarCoordenadas(lat, lng);
  const zonas = _zonasQueContienen(coordenadas.lat, coordenadas.lng).map(_zonaPublica);
  return {
    ...coordenadas,
    enCobertura: zonas.length > 0,
    zonas,
  };
}

function obtenerZonaDeColonia(nombre) {
  const colonia = _buscarColonia(nombre);
  if (!colonia) throw new GeoTepicError('COLONIA_NO_ENCONTRADA', 'La colonia no existe en el catálogo activo de GeoTepic');
  const resultado = obtenerZonaPorCoordenadas(colonia.lat, colonia.lng);
  return {
    colonia: colonia.nombre,
    ubicacion: { lat: colonia.lat, lng: colonia.lng },
    enCobertura: resultado.enCobertura,
    zonas: resultado.zonas,
    ruta: resultado.zonas.map(zona => zona.nombre),
  };
}

function obtenerRutaGeograficaPorColonia(nombre) {
  return obtenerZonaDeColonia(nombre);
}

function obtenerColoniasPorCuadrante(id) {
  const cuadranteId = Number(id);
  if (!Number.isInteger(cuadranteId) || cuadranteId <= 0) {
    throw new GeoTepicError('CUADRANTE_INVALIDO', 'El identificador del cuadrante no es válido');
  }
  const cuadrante = _listarCuadrantes().find(zona => zona.id === cuadranteId);
  if (!cuadrante) throw new GeoTepicError('CUADRANTE_NO_ENCONTRADO', 'El cuadrante solicitado no existe');

  _cargarIndiceColonias();
  const colonias = _colonias
    .filter(colonia => booleanPointInPolygon(point([colonia.lng, colonia.lat]), cuadrante.geometry))
    .map(({ nombre, lat, lng }) => ({ nombre, lat, lng }));

  return {
    cuadrante: _zonaPublica(cuadrante),
    total: colonias.length,
    colonias,
  };
}

function sonColoniasMismaZona(coloniaA, coloniaB, nivel) {
  const nivelNumero = Number(nivel);
  if (!Number.isInteger(nivelNumero) || nivelNumero < 1) {
    throw new GeoTepicError('NIVEL_INVALIDO', 'El nivel debe ser un entero mayor o igual a 1');
  }
  const zonaA = obtenerZonaDeColonia(coloniaA);
  const zonaB = obtenerZonaDeColonia(coloniaB);
  const idsB = new Set(zonaB.zonas.filter(z => z.nivel === nivelNumero).map(z => z.id));
  const compartidas = zonaA.zonas.filter(z => z.nivel === nivelNumero && idsB.has(z.id));
  return {
    mismaZona: compartidas.length > 0,
    zona: compartidas[0]?.nombre || null,
    zonas: compartidas,
    nivel: nivelNumero,
  };
}

function _contarConflictosColonias(colonias, cuadrantes) {
  const porNivel = new Map();
  for (const cuadrante of cuadrantes) {
    if (!porNivel.has(cuadrante.nivel)) porNivel.set(cuadrante.nivel, []);
    porNivel.get(cuadrante.nivel).push(cuadrante);
  }
  let conflictos = 0;
  for (const colonia of colonias) {
    const puntoColonia = point([colonia.lng, colonia.lat]);
    if ([...porNivel.values()].some(zonas => zonas.filter(z => booleanPointInPolygon(puntoColonia, z.geometry)).length > 1)) conflictos++;
  }
  return conflictos;
}

function _contarSolapamientos(cuadrantes) {
  const porPadre = new Map();
  for (const cuadrante of cuadrantes) {
    const clave = cuadrante.parentId ?? '__root__';
    if (!porPadre.has(clave)) porPadre.set(clave, []);
    porPadre.get(clave).push(cuadrante);
  }
  let total = 0;
  for (const hermanos of porPadre.values()) {
    for (let i = 0; i < hermanos.length; i++) {
      for (let j = i + 1; j < hermanos.length; j++) {
        try {
          if (intersect(featureCollection([
            { type: 'Feature', properties: {}, geometry: hermanos[i].geometry },
            { type: 'Feature', properties: {}, geometry: hermanos[j].geometry },
          ]))) total++;
        } catch (_) {
          total++;
        }
      }
    }
  }
  return total;
}

function obtenerEstado() {
  _cargarIndiceColonias();
  const cuadrantes = _listarCuadrantes();
  const nivelUno = cuadrantes.filter(c => c.nivel === 1);
  const sinAsignar = _colonias.filter(colonia => !_zonasQueContienen(colonia.lat, colonia.lng, nivelUno).length).length;
  const conflictosColonias = _contarConflictosColonias(_colonias, cuadrantes);
  const solapamientos = _contarSolapamientos(cuadrantes);
  return {
    colonias: _colonias.length,
    cuadrantes: nivelUno.length,
    subcuadrantes: cuadrantes.length - nivelUno.length,
    sinAsignar,
    conflictos: conflictosColonias + solapamientos,
    detalleConflictos: { colonias: conflictosColonias, solapamientos },
  };
}

module.exports = {
  GeoTepicError,
  normalizarNombre,
  invalidarIndiceColonias,
  obtenerZonaDeColonia,
  obtenerZonaPorCoordenadas,
  obtenerColoniasPorCuadrante,
  sonColoniasMismaZona,
  obtenerRutaGeograficaPorColonia,
  obtenerEstado,
};
