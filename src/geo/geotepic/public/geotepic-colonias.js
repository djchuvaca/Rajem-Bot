const coloniasMap = new Map();

function _popupColonia(c) {
  const div = document.createElement('div');
  const nombre = document.createElement('strong');
  nombre.textContent = c.nombre;
  div.appendChild(nombre);
  div.appendChild(document.createElement('br'));
  div.appendChild(document.createTextNode(`Latitud: ${c.lat}`));
  div.appendChild(document.createElement('br'));
  div.appendChild(document.createTextNode(`Longitud: ${c.lng}`));
  return div;
}

async function _cargarColoniasGeoTepic() {
  const contadorColonias = document.getElementById('contadorColonias');
  contadorColonias.textContent = '…';

  try {
    const r = await fetch('/api/geo/tepic/mapa-colonias');
    if (!r.ok) throw new Error(`Error ${r.status}`);
    const colonias = await r.json();

    capaColonias.clearLayers();
    coloniasMap.clear();

    for (const c of colonias) {
      const tooltipEl = document.createElement('span');
      tooltipEl.textContent = c.nombre;

      const marker = L.circleMarker([c.lat, c.lng], {
        radius: 5,
        fillColor: '#3b82f6',
        color: '#1e40af',
        weight: 1,
        opacity: 1,
        fillOpacity: 0.75,
      })
        .bindTooltip(tooltipEl, { direction: 'top', offset: [0, -5] })
        .bindPopup(_popupColonia(c));

      marker.addTo(capaColonias);
      coloniasMap.set(c.nombre, { data: c, marker });
    }

    contadorColonias.textContent = colonias.length;

    const puntos = colonias
      .filter(c => typeof c.lat === 'number' && typeof c.lng === 'number')
      .map(c => [c.lat, c.lng]);

    if (puntos.length > 0) {
      const bounds = L.latLngBounds(puntos);
      _gtMap.fitBounds(bounds, { padding: [30, 30] });
    }

    // Construir FeatureCollection para análisis Turf y re-analizar cuadrantes existentes
    _buildColoniasGeoJSON(colonias);
    for (const [id] of cuadrantesMap) analizarCuadrante(id);
  } catch (e) {
    contadorColonias.textContent = 'Error';
  }
}
