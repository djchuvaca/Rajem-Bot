let _gtMap = null;

const capaColonias      = L.layerGroup();
const capaCuadrantes    = L.featureGroup();  // nivel 1
const capaSubcuadrantes = L.featureGroup();  // nivel 2+

// Devuelve la capa correcta según el nivel del cuadrante
function _capaParaNivel(nivel) {
  return nivel <= 1 ? capaCuadrantes : capaSubcuadrantes;
}

function initMapaGeoTepic() {
  _gtMap = L.map('geotepic-mapa').setView([21.5049, -104.8945], 12);

  L.tileLayer('https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png', {
    attribution: '© <a href="https://openstreetmap.org">OpenStreetMap</a> contributors',
    maxZoom: 19,
  }).addTo(_gtMap);

  capaColonias.addTo(_gtMap);
  capaCuadrantes.addTo(_gtMap);
  capaSubcuadrantes.addTo(_gtMap);
  // El control de capas lo manejan los checkboxes del panel
}

// ── Toggles de capas ──────────────────────────────────────────────────────────

function _toggleCapaColonias(visible) {
  if (visible) { if (!_gtMap.hasLayer(capaColonias)) capaColonias.addTo(_gtMap); }
  else          { _gtMap.removeLayer(capaColonias); }
}

function _toggleNombresColonias(visible) {
  for (const [nombre, { marker }] of coloniasMap) {
    if (visible) {
      const el = document.createElement('span');
      el.textContent = nombre;
      marker.bindTooltip(el, { direction: 'top', offset: [0, -5] });
    } else {
      marker.unbindTooltip();
    }
  }
}

function _toggleCapaCuadrantes(visible) {
  if (visible) { if (!_gtMap.hasLayer(capaCuadrantes)) capaCuadrantes.addTo(_gtMap); }
  else          { _gtMap.removeLayer(capaCuadrantes); }
}

function _toggleCapaSubcuadrantes(visible) {
  if (visible) { if (!_gtMap.hasLayer(capaSubcuadrantes)) capaSubcuadrantes.addTo(_gtMap); }
  else          { _gtMap.removeLayer(capaSubcuadrantes); }
}

function _toggleSoloSeleccion(visible) {
  if (!visible) {
    if (!_gtMap.hasLayer(capaColonias)) capaColonias.addTo(_gtMap);
    _restaurarEstiloColonias();
    for (const [id, c] of cuadrantesMap) {
      if (id !== cuadranteSeleccionadoId) c.layer.setStyle(_ESTILO_NORMAL);
    }
    return;
  }
  _gtMap.removeLayer(capaColonias);
  for (const [id, c] of cuadrantesMap) {
    if (id !== cuadranteSeleccionadoId) {
      c.layer.setStyle({ opacity: 0.12, fillOpacity: 0.02, color: '#f59e0b', fillColor: '#f59e0b', weight: 1 });
    }
  }
}
