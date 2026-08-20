// ── Conflictos y estadísticas ─────────────────────────────────────────────────

let _conflictosColonias   = [];
let _solapamientosPoligon = [];
let _coloniasSinCuad      = [];
let _mostrandoConflictos  = false;

const _ESTILO_CUADRANTE_CONFLICTO = {
  color: '#ef4444', fillColor: '#ef4444', fillOpacity: 0.15, weight: 3, dashArray: '6 4',
};

// ── Punto de entrada: recalcula todo y actualiza UI ───────────────────────────

function actualizarConflictos() {
  _coloniasSinCuad      = obtenerColoniasSinCuadrante();
  _conflictosColonias   = _detectarConflictosColonias();
  _solapamientosPoligon = _detectarSolapamientosPoligonos();

  _actualizarStatsPanel();
  _renderSolapamientosPoligonos();
  _renderConflictosColonias();
  _renderListaSinCuadrante();
  if (_mostrandoConflictos) _aplicarEstiloConflictos();
}

// ── Estadísticas ──────────────────────────────────────────────────────────────

function _actualizarStatsPanel() {
  let n1 = 0, sub = 0;
  for (const [, c] of cuadrantesMap) { if (c.nivel === 1) n1++; else sub++; }

  const sinAsignar = _coloniasSinCuad.length;
  const asignadas  = coloniasMap.size - sinAsignar;
  const confTotal  = _conflictosColonias.length + _solapamientosPoligon.length;

  _gset('gs-colonias-total', coloniasMap.size > 0 ? coloniasMap.size : '—');
  _gset('gs-cuadrantes-n1',  n1);
  _gset('gs-subcuadrantes',  sub);
  _gset('gs-asignadas',      coloniasMap.size > 0 ? asignadas : '—');
  _gset('gs-sin-asignar',    coloniasMap.size > 0 ? sinAsignar : '—');
  _gset('gs-conflictos',     confTotal);

  const sinFila  = document.getElementById('gs-sin-fila');
  const confFila = document.getElementById('gs-conflictos-fila');
  if (sinFila)  sinFila.classList.toggle('geotepic-stat-alerta',  sinAsignar > 0 && coloniasMap.size > 0);
  if (confFila) confFila.classList.toggle('geotepic-stat-alerta', confTotal > 0);
}

function _gset(id, val) {
  const el = document.getElementById(id);
  if (el) el.textContent = val;
}

// ── Conflictos de colonias (mismo nivel, más de un cuadrante) ─────────────────

function _detectarConflictosColonias() {
  if (!coloniasGeoJSON || cuadrantesMap.size === 0) return [];

  const porNivel = new Map();
  for (const [id, c] of cuadrantesMap) {
    if (!porNivel.has(c.nivel)) porNivel.set(c.nivel, []);
    porNivel.get(c.nivel).push(id);
  }

  const conflictos = [];
  for (const f of coloniasGeoJSON.features) {
    const nombre = f.properties.nombre;
    const punto  = turf.point([f.properties.lng, f.properties.lat]);
    const porNivelConflicto = [];

    for (const [nivel, ids] of porNivel) {
      const conteniendo = ids.filter(id => {
        const c = cuadrantesMap.get(id);
        try { return c && turf.booleanPointInPolygon(punto, c.layer.toGeoJSON()); }
        catch { return false; }
      });
      if (conteniendo.length > 1) porNivelConflicto.push({ nivel, cuadrantes: conteniendo });
    }
    if (porNivelConflicto.length > 0) conflictos.push({ nombre, porNivelConflicto });
  }
  return conflictos;
}

// ── Solapamientos entre polígonos hermanos (mismo padre) ─────────────────────

function _detectarSolapamientosPoligonos() {
  if (cuadrantesMap.size < 2) return [];

  const grupos = new Map();
  for (const [id, c] of cuadrantesMap) {
    const key = c.parentId !== null ? c.parentId : '__root__';
    if (!grupos.has(key)) grupos.set(key, []);
    grupos.get(key).push(id);
  }

  const solapamientos = [];
  for (const [, ids] of grupos) {
    if (ids.length < 2) continue;
    for (let i = 0; i < ids.length; i++) {
      for (let j = i + 1; j < ids.length; j++) {
        const a = cuadrantesMap.get(ids[i]);
        const b = cuadrantesMap.get(ids[j]);
        if (!a || !b) continue;
        try {
          const inter = turf.intersect(a.layer.toGeoJSON(), b.layer.toGeoJSON());
          if (inter) solapamientos.push({
            idA: a.id, idB: b.id,
            nombreA: a.nombre || a.codigo,
            nombreB: b.nombre || b.codigo,
          });
        } catch { /* geometría inválida */ }
      }
    }
  }
  return solapamientos;
}

// ── Render de listas ──────────────────────────────────────────────────────────

function _renderSolapamientosPoligonos() {
  const el = document.getElementById('gc-solapamientos-poligonos');
  if (!el) return;
  el.innerHTML = '';
  for (const s of _solapamientosPoligon) {
    const item = document.createElement('div');
    item.className = 'geotepic-conflicto-item geotepic-conflicto-warning';
    const txt = document.createElement('span');
    txt.textContent = `⚠ "${s.nombreA}" y "${s.nombreB}" se superponen`;
    const btn = document.createElement('button');
    btn.className = 'btn btn-secondary btn-xs';
    btn.textContent = 'Ver';
    btn.onclick = () => _centrarEnSolapamiento(s.idA, s.idB);
    item.appendChild(txt);
    item.appendChild(btn);
    el.appendChild(item);
  }
}

function _renderConflictosColonias() {
  const el = document.getElementById('gc-conflictos-colonias');
  if (!el) return;
  el.innerHTML = '';
  for (const conf of _conflictosColonias) {
    const item = document.createElement('div');
    item.className = 'geotepic-conflicto-item';

    const nom = document.createElement('strong');
    nom.style.fontSize = '12px';
    nom.textContent = conf.nombre;
    item.appendChild(nom);

    for (const { nivel, cuadrantes: ids } of conf.porNivelConflicto) {
      const sub = document.createElement('div');
      sub.className = 'geotepic-conflicto-sub';
      sub.textContent = `N${nivel}: ` + ids.map(id => {
        const c = cuadrantesMap.get(id);
        return c ? `${c.codigo} ${c.nombre}`.trim() : id;
      }).join(', ');
      item.appendChild(sub);
    }

    const btn = document.createElement('button');
    btn.className = 'btn btn-secondary btn-xs';
    btn.style.alignSelf = 'flex-start';
    btn.textContent = 'Ver';
    btn.onclick = () => _centrarEnColonia(conf.nombre);
    item.appendChild(btn);
    el.appendChild(item);
  }

  // Mensaje vacío si no hay nada
  const vaciEl = document.getElementById('gc-conflictos-vacio');
  if (vaciEl) {
    vaciEl.style.display =
      (_conflictosColonias.length === 0 && _solapamientosPoligon.length === 0) ? '' : 'none';
  }
}

function _renderListaSinCuadrante() {
  const lista = document.getElementById('gc-lista-sin-cuadrante');
  if (!lista) return;
  lista.innerHTML = '';

  if (_coloniasSinCuad.length === 0) {
    const msg = document.createElement('div');
    msg.className = 'geotepic-colonia-item';
    msg.style.color = 'var(--muted)';
    msg.textContent = 'Todas las colonias están asignadas.';
    lista.appendChild(msg);
    return;
  }
  for (const col of _coloniasSinCuad) {
    const item = document.createElement('div');
    item.className = 'geotepic-colonia-item geotepic-colonia-clickable';
    item.textContent = col.nombre;
    item.onclick = () => _centrarEnColonia(col.nombre);
    lista.appendChild(item);
  }
}

// ── Toggle paneles ────────────────────────────────────────────────────────────

function _verColoniasSinCuadrante() {
  const panel = document.getElementById('gc-panel-sin-cuadrante');
  if (panel) panel.style.display = panel.style.display !== 'none' ? 'none' : '';
}

function _togglePanelConflictos() {
  const panel = document.getElementById('gc-panel-conflictos');
  if (panel) panel.style.display = panel.style.display !== 'none' ? 'none' : '';
}

// ── Toggle estilo conflictos en mapa ──────────────────────────────────────────

function _toggleMostrarConflictos(visible) {
  _mostrandoConflictos = visible;
  visible ? _aplicarEstiloConflictos() : _limpiarEstiloConflictos();
}

function _idsEnConflicto() {
  const ids = new Set();
  for (const s of _solapamientosPoligon) { ids.add(s.idA); ids.add(s.idB); }
  for (const conf of _conflictosColonias) {
    for (const { cuadrantes } of conf.porNivelConflicto) {
      for (const id of cuadrantes) ids.add(id);
    }
  }
  return ids;
}

function _aplicarEstiloConflictos() {
  const ids = _idsEnConflicto();
  for (const [id, c] of cuadrantesMap) {
    if (ids.has(id) && id !== cuadranteSeleccionadoId) c.layer.setStyle(_ESTILO_CUADRANTE_CONFLICTO);
  }
}

function _limpiarEstiloConflictos() {
  const ids = _idsEnConflicto();
  for (const id of ids) {
    const c = cuadrantesMap.get(id);
    if (c && id !== cuadranteSeleccionadoId) c.layer.setStyle(_ESTILO_NORMAL);
  }
}

// ── Navegación ────────────────────────────────────────────────────────────────

function _centrarEnSolapamiento(idA, idB) {
  const a = cuadrantesMap.get(idA);
  const b = cuadrantesMap.get(idB);
  if (!a || !b) return;
  _gtMap.fitBounds(a.layer.getBounds().extend(b.layer.getBounds()), { padding: [40, 40] });
}

function _centrarEnColonia(nombre) {
  const entrada = coloniasMap.get(nombre);
  if (!entrada) return;
  const { data, marker } = entrada;
  _restaurarEstiloColonias();
  marker.setStyle(_ESTILO_COLONIA_RESALTADA);
  _gtMap.setView([data.lat, data.lng], Math.max(_gtMap.getZoom(), 15));
  marker.openPopup();
}
