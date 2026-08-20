let coloniasGeoJSON = null;

// Llamado desde _cargarColoniasGeoTepic() tras cargar las colonias
function _buildColoniasGeoJSON(colonias) {
  coloniasGeoJSON = turf.featureCollection(
    colonias.map(c => turf.point([c.lng, c.lat], { nombre: c.nombre, lat: c.lat, lng: c.lng }))
  );
}

// ── Consultas espaciales ──────────────────────────────────────────────────────

function obtenerColoniasDentroCuadrante(id) {
  const c = cuadrantesMap.get(id);
  if (!c || !coloniasGeoJSON) return [];
  const dentro = turf.pointsWithinPolygon(coloniasGeoJSON, c.layer.toGeoJSON());
  return dentro.features.map(f => ({
    nombre: f.properties.nombre,
    lat:    f.properties.lat,
    lng:    f.properties.lng,
  }));
}

function obtenerCuadrantesDeColonia(nombreColonia) {
  const entrada = coloniasMap.get(nombreColonia);
  if (!entrada || !coloniasGeoJSON) return { colonia: nombreColonia, cuadrantes: [] };

  const punto = turf.point([entrada.data.lng, entrada.data.lat]);
  const ids = [];
  for (const [id, c] of cuadrantesMap) {
    if (turf.booleanPointInPolygon(punto, c.layer.toGeoJSON())) ids.push(id);
  }
  return { colonia: nombreColonia, cuadrantes: ids };
}

// Solo considera cuadrantes de nivel 1 para "sin asignar"
function obtenerColoniasSinCuadrante() {
  if (!coloniasGeoJSON) return [];

  const n1 = Array.from(cuadrantesMap.values()).filter(c => c.nivel === 1);
  if (n1.length === 0) {
    return coloniasGeoJSON.features.map(f => ({
      nombre: f.properties.nombre, lat: f.properties.lat, lng: f.properties.lng,
    }));
  }

  const cubiertas = new Set();
  for (const c of n1) {
    turf.pointsWithinPolygon(coloniasGeoJSON, c.layer.toGeoJSON())
      .features.forEach(f => cubiertas.add(f.properties.nombre));
  }

  return coloniasGeoJSON.features
    .filter(f => !cubiertas.has(f.properties.nombre))
    .map(f => ({ nombre: f.properties.nombre, lat: f.properties.lat, lng: f.properties.lng }));
}

// ── Análisis de cuadrante ─────────────────────────────────────────────────────

function analizarCuadrante(id) {
  const c = cuadrantesMap.get(id);
  if (!c) return;
  c.colonias = obtenerColoniasDentroCuadrante(id);
}

// ── Estilos de markers de colonias ────────────────────────────────────────────

const _ESTILO_COLONIA_NORMAL = {
  radius: 5, fillColor: '#3b82f6', color: '#1e40af',
  weight: 1, opacity: 1, fillOpacity: 0.75,
};
const _ESTILO_COLONIA_RESALTADA = {
  radius: 7, fillColor: '#ef4444', color: '#991b1b',
  weight: 2, opacity: 1, fillOpacity: 0.9,
};
const _ESTILO_COLONIA_ATENUADA = {
  radius: 4, fillColor: '#3b82f6', color: '#1e40af',
  weight: 1, opacity: 0.35, fillOpacity: 0.3,
};

function _resaltarColoniasDeCuadrante(id) {
  const c = cuadrantesMap.get(id);
  const dentroSet = c ? new Set(c.colonias.map(col => col.nombre)) : new Set();

  for (const [nombre, entrada] of coloniasMap) {
    entrada.marker.setStyle(
      dentroSet.has(nombre) ? _ESTILO_COLONIA_RESALTADA : _ESTILO_COLONIA_ATENUADA
    );
  }
}

function _restaurarEstiloColonias() {
  for (const [, entrada] of coloniasMap) {
    entrada.marker.setStyle(_ESTILO_COLONIA_NORMAL);
  }
}

// ── Validación geométrica ─────────────────────────────────────────────────────

function _estaCompletamenteDentro(childLayer, parentLayer) {
  try {
    const child  = childLayer.toGeoJSON();
    const parent = parentLayer.toGeoJSON();
    return turf.booleanContains(parent, child);
  } catch (e) {
    console.warn('[GeoTepic] Error en validación geométrica:', e);
    return false;
  }
}

