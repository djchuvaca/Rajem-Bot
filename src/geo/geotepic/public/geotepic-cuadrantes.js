// ── Estado ────────────────────────────────────────────────────────────────────
// cuadrantesMap: key = String(db_id), value = { id, codigo, nombre, tipo, parentId, nivel, layer, colonias[] }

const cuadrantesMap         = new Map();
let cuadranteSeleccionadoId = null; // String(db_id) | null
let _cuadranteEditandoId    = null;
let _pendingParentId        = null; // String(db_id) del padre para el próximo polígono dibujado
let _geometriaOriginal      = null; // backup GeoJSON antes de editar

const _ESTILO_NORMAL = {
  color: '#f59e0b', fillColor: '#f59e0b', fillOpacity: 0.2, weight: 2,
};
const _ESTILO_SELECCIONADO = {
  color: '#ef4444', fillColor: '#ef4444', fillOpacity: 0.3, weight: 3,
};

// ── Lista / árbol ─────────────────────────────────────────────────────────────

function renderListaCuadrantes() {
  const lista   = document.getElementById('geotepic-lista-cuadrantes');
  const vacio   = document.getElementById('geotepic-panel-vacio');
  const detalle = document.getElementById('geotepic-detalle');

  lista.innerHTML = '';

  if (cuadrantesMap.size === 0) {
    vacio.style.display   = '';
    detalle.style.display = 'none';
    return;
  }

  vacio.style.display = 'none';

  const raices = Array.from(cuadrantesMap.values())
    .filter(c => c.parentId === null)
    .sort((a, b) => Number(a.id) - Number(b.id));

  for (const c of raices) _renderNodoArbol(lista, c.id, 0);
}

// ── Detalle colonias ──────────────────────────────────────────────────────────

function _renderColoniasDetalle(id) {
  const c        = cuadrantesMap.get(id);
  const colonias = c ? c.colonias : [];

  document.getElementById('gc-colonias-count').textContent = colonias.length;

  const lista = document.getElementById('gc-colonias-lista');
  lista.innerHTML = '';
  for (const col of colonias) {
    const item = document.createElement('div');
    item.className   = 'geotepic-colonia-item';
    item.textContent = col.nombre;
    lista.appendChild(item);
  }
}

// ── Ruta jerárquica ───────────────────────────────────────────────────────────

function _actualizarRutaPanel(id) {
  const rutaEl = document.getElementById('gc-ruta');
  if (!rutaEl) return;
  const ruta = obtenerRutaZona(id);
  if (ruta.length <= 1) { rutaEl.style.display = 'none'; return; }
  rutaEl.style.display = '';
  rutaEl.textContent   = ruta.slice(0, -1).join(' › ') + ' ›';
}

// ── Recalcular ────────────────────────────────────────────────────────────────

function recalcularCuadrante(id) {
  analizarCuadrante(id);
  actualizarConflictos();
  if (id === cuadranteSeleccionadoId) {
    _renderColoniasDetalle(id);
    _resaltarColoniasDeCuadrante(id);
  }
}

// ── Estado del panel (3 estados: NORMAL / EDITANDO / CREANDO) ─────────────────

function _actualizarEstadoPanel() {
  const editando = !!_cuadranteEditandoId;
  const creando  = !!_pendingParentId;

  const badge            = document.getElementById('gc-estado');
  const btnEditar        = document.getElementById('gc-btn-editar');
  const btnTerminar      = document.getElementById('gc-btn-terminar');
  const btnCancelarEd    = document.getElementById('gc-btn-cancelar-edicion');
  const btnSubcuadrante  = document.getElementById('gc-btn-subcuadrante');
  const btnCancelarCrear = document.getElementById('gc-btn-cancelar-subcuadrante');
  const btnEliminar      = document.getElementById('gc-btn-eliminar');
  const hintCrear        = document.getElementById('gc-crear-hint');

  if (!badge) return;

  if (editando) {
    badge.textContent          = 'EDITANDO';
    badge.className            = 'geotepic-estado-badge geotepic-estado-editando';
    btnEditar.style.display        = 'none';
    btnTerminar.style.display      = '';
    btnCancelarEd.style.display    = '';
    btnSubcuadrante.style.display  = 'none';
    btnCancelarCrear.style.display = 'none';
    btnEliminar.style.display      = 'none';
    hintCrear.style.display        = 'none';
  } else if (creando) {
    badge.textContent          = 'CREANDO';
    badge.className            = 'geotepic-estado-badge geotepic-estado-creando';
    btnEditar.style.display        = 'none';
    btnTerminar.style.display      = 'none';
    btnCancelarEd.style.display    = 'none';
    btnSubcuadrante.style.display  = 'none';
    btnCancelarCrear.style.display = '';
    btnEliminar.style.display      = 'none';
    hintCrear.style.display        = '';
  } else {
    badge.textContent          = 'NORMAL';
    badge.className            = 'geotepic-estado-badge geotepic-estado-normal';
    btnEditar.style.display        = '';
    btnTerminar.style.display      = 'none';
    btnCancelarEd.style.display    = 'none';
    btnSubcuadrante.style.display  = '';
    btnCancelarCrear.style.display = 'none';
    btnEliminar.style.display      = '';
    hintCrear.style.display        = 'none';
    _limpiarErrorEdicion();
  }
}

// ── Selección ────────────────────────────────────────────────────────────────

function seleccionarCuadrante(id) {
  // Cancelar edición activa de otro cuadrante (sin guardar)
  if (_cuadranteEditandoId && _cuadranteEditandoId !== id) cancelarEdicionCuadrante();
  // Cancelar creación pendiente de subcuadrante
  if (_pendingParentId) _cancelarCreacionSubcuadrante();

  // Cerrar paneles de confirmación
  const confirmEl   = document.getElementById('gc-confirm-eliminar');
  const bloqueadoEl = document.getElementById('gc-confirm-bloqueado');
  if (confirmEl   && confirmEl.style.display   !== 'none') _cancelarEliminar();
  if (bloqueadoEl && bloqueadoEl.style.display !== 'none') _cancelarBloqueado();

  // Restaurar estilos anteriores
  if (cuadranteSeleccionadoId && cuadrantesMap.has(cuadranteSeleccionadoId)) {
    cuadrantesMap.get(cuadranteSeleccionadoId).layer.setStyle(_ESTILO_NORMAL);
  }
  _restaurarEstiloColonias();

  cuadranteSeleccionadoId = id;
  const c = cuadrantesMap.get(id);
  if (!c) return;

  c.layer.setStyle(_ESTILO_SELECCIONADO);
  analizarCuadrante(id);
  _resaltarColoniasDeCuadrante(id);

  document.getElementById('gc-id').textContent              = c.codigo;
  document.getElementById('gc-nivel').textContent           = c.nivel;
  const _gcPadre = obtenerPadre(id);
  document.getElementById('gc-padre-val').textContent       = _gcPadre ? (_gcPadre.nombre || _gcPadre.codigo) : '—';
  document.getElementById('gc-nombre-input').value          = c.nombre;
  const _gcListaEl = document.getElementById('gc-colonias-lista');
  if (_gcListaEl) _gcListaEl.style.display = 'none';
  document.getElementById('geotepic-detalle').style.display = 'flex';

  _actualizarRutaPanel(id);
  _renderColoniasDetalle(id);
  _actualizarEstadoPanel();
  renderListaCuadrantes();
}

// ── Nombre ───────────────────────────────────────────────────────────────────

function actualizarNombreCuadrante(id, nombre) {
  const c = cuadrantesMap.get(id);
  if (!c) return;
  const nombreLimpio = nombre.trim() || c.nombre;
  c.nombre = nombreLimpio;
  c.layer.unbindTooltip();
  c.layer.bindTooltip(nombreLimpio, {
    permanent: true, direction: 'center', className: 'geotepic-cuadrante-label',
  });
  renderListaCuadrantes();
  window.dispatchEvent(new CustomEvent('geotepic:cuadrantes-cambiaron'));
}

async function _guardarNombreCuadrante() {
  if (!cuadranteSeleccionadoId) return;
  const nombre = document.getElementById('gc-nombre-input').value.trim();
  if (!nombre) return;
  try {
    const resp = await fetch(`/api/geo/tepic/cuadrantes/${cuadranteSeleccionadoId}`, {
      method: 'PUT',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ nombre }),
    });
    const data = await resp.json();
    if (!resp.ok) throw new Error(data.error || 'Error al guardar nombre');
    actualizarNombreCuadrante(cuadranteSeleccionadoId, nombre);
  } catch (err) {
    _mostrarErrorEdicion(`Error al guardar nombre: ${err.message}`);
  }
}

// ── Mapa ─────────────────────────────────────────────────────────────────────

function centrarEnCuadrante(id) {
  const c = cuadrantesMap.get(id);
  if (!c) return;
  _gtMap.fitBounds(c.layer.getBounds(), { padding: [40, 40] });
}

function _centrarEnCuadranteSeleccionado() { centrarEnCuadrante(cuadranteSeleccionadoId); }

// ── GeoJSON ──────────────────────────────────────────────────────────────────

function obtenerGeoJSONCuadrante(id) {
  const c = cuadrantesMap.get(id);
  return c ? c.layer.toGeoJSON() : null;
}

// ── Mensajes de error ─────────────────────────────────────────────────────────

function _mostrarErrorEdicion(msg) {
  const el = document.getElementById('gc-error-edicion');
  if (!el) return;
  el.textContent   = msg;
  el.style.display = '';
}

function _limpiarErrorEdicion() {
  const el = document.getElementById('gc-error-edicion');
  if (el) el.style.display = 'none';
}

// ── Edición de geometría ──────────────────────────────────────────────────────

function iniciarEdicionCuadrante(id) {
  if (_cuadranteEditandoId) return;
  const c = cuadrantesMap.get(id);
  if (!c) return;

  _cuadranteEditandoId = id;
  _geometriaOriginal   = c.layer.toGeoJSON();
  c.layer.unbindTooltip();
  c.layer.pm.enable({ allowSelfIntersection: false });
  _actualizarEstadoPanel();
}

async function terminarEdicionCuadrante() {
  if (!_cuadranteEditandoId) return;
  const id = _cuadranteEditandoId;
  const c  = cuadrantesMap.get(id);

  if (!c) {
    _cuadranteEditandoId = null;
    _geometriaOriginal   = null;
    _actualizarEstadoPanel();
    return;
  }

  // Validar que todos los hijos sigan dentro del padre editado
  const hijosInvalidos = obtenerHijos(id).filter(h => !_estaCompletamenteDentro(h.layer, c.layer));
  if (hijosInvalidos.length > 0) {
    const nombres = hijosInvalidos.map(h => `"${h.nombre}"`).join(', ');
    _mostrarErrorEdicion(
      `${hijosInvalidos.length > 1 ? 'Los subcuadrantes' : 'El subcuadrante'} ${nombres} quedaría fuera. Corrige la geometría o cancela la edición.`
    );
    return;
  }

  _limpiarErrorEdicion();
  c.layer.pm.disable();
  c.layer.bindTooltip(c.nombre, {
    permanent: true, direction: 'center', className: 'geotepic-cuadrante-label',
  });

  const geometry = c.layer.toGeoJSON().geometry;
  try {
    const resp = await fetch(`/api/geo/tepic/cuadrantes/${id}`, {
      method: 'PUT',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ geometry }),
    });
    const data = await resp.json();
    if (!resp.ok) throw new Error(data.error || 'Error al guardar geometría');

    _geometriaOriginal   = null;
    _cuadranteEditandoId = null;
    recalcularCuadrante(id);
    _actualizarEstadoPanel();
  } catch (err) {
    // Revertir geometría si el servidor rechazó
    if (_geometriaOriginal) {
      const coords  = _geometriaOriginal.geometry.coordinates[0];
      const latlngs = coords.slice(0, -1).map(p => L.latLng(p[1], p[0]));
      c.layer.setLatLngs([latlngs]);
      c.layer.redraw();
    }
    _geometriaOriginal   = null;
    _cuadranteEditandoId = null;
    _actualizarEstadoPanel();
    _mostrarErrorEdicion(`Error al guardar: ${err.message}. Geometría revertida.`);
  }
}

function cancelarEdicionCuadrante() {
  if (!_cuadranteEditandoId) return;
  const id = _cuadranteEditandoId;
  const c  = cuadrantesMap.get(id);

  if (c && _geometriaOriginal) {
    c.layer.pm.disable();
    const coords  = _geometriaOriginal.geometry.coordinates[0];
    const latlngs = coords.slice(0, -1).map(p => L.latLng(p[1], p[0]));
    c.layer.setLatLngs([latlngs]);
    c.layer.redraw();
    c.layer.bindTooltip(c.nombre, {
      permanent: true, direction: 'center', className: 'geotepic-cuadrante-label',
    });
  }

  _limpiarErrorEdicion();
  _cuadranteEditandoId = null;
  _geometriaOriginal   = null;
  _actualizarEstadoPanel();
}

// ── Wrappers para onclick del HTML ────────────────────────────────────────────

function _iniciarEdicionSeleccionado()               { iniciarEdicionCuadrante(cuadranteSeleccionadoId); }
function _terminarEdicionSeleccionado()              { terminarEdicionCuadrante(); }
function _cancelarEdicionSeleccionado()              { cancelarEdicionCuadrante(); }
function _iniciarCreacionSubcuadranteSeleccionado()  { _iniciarCreacionSubcuadrante(); }
function _cancelarCreacionSubcuadranteSeleccionado() { _cancelarCreacionSubcuadrante(); }
function _cancelarBloqueadoEliminar()                { _cancelarBloqueado(); }

function _toggleVerColonias() {
  const lista = document.getElementById('gc-colonias-lista');
  if (!lista) return;
  lista.style.display = lista.style.display === 'none' ? '' : 'none';
}

// ── Creación de subcuadrante ──────────────────────────────────────────────────

function _iniciarCreacionSubcuadrante() {
  if (!cuadranteSeleccionadoId) return;
  _pendingParentId = cuadranteSeleccionadoId;
  _actualizarEstadoPanel();
  _gtMap.pm.enableDraw('Polygon');
}

function _cancelarCreacionSubcuadrante() {
  _pendingParentId = null;
  _gtMap.pm.disableDraw();
  _actualizarEstadoPanel();
}

// ── Eliminación ───────────────────────────────────────────────────────────────

function _pedirConfirmacionEliminar() {
  if (!cuadranteSeleccionadoId) return;
  const c = cuadrantesMap.get(cuadranteSeleccionadoId);
  if (!c) return;

  const hijos = obtenerHijos(cuadranteSeleccionadoId);
  if (hijos.length > 0) {
    document.getElementById('gc-bloqueado-count').textContent = hijos.length;
    document.getElementById('gc-confirm-bloqueado').style.display = 'flex';
    document.getElementById('geotepic-detalle-acciones').style.display = 'none';
    return;
  }

  document.getElementById('gc-confirm-nombre').textContent = `"${c.nombre}"`;
  document.getElementById('gc-confirm-eliminar').style.display = 'flex';
  document.getElementById('geotepic-detalle-acciones').style.display = 'none';
}

function _cancelarEliminar() {
  const el = document.getElementById('gc-confirm-eliminar');
  if (el) el.style.display = 'none';
  const acc = document.getElementById('geotepic-detalle-acciones');
  if (acc) acc.style.display = 'flex';
}

function _cancelarBloqueado() {
  const el = document.getElementById('gc-confirm-bloqueado');
  if (el) el.style.display = 'none';
  const acc = document.getElementById('geotepic-detalle-acciones');
  if (acc) acc.style.display = 'flex';
}

async function eliminarCuadrante(id) {
  // Limpiar estado de edición si aplica
  if (_cuadranteEditandoId === id) {
    const c = cuadrantesMap.get(id);
    if (c) c.layer.pm.disable();
    _cuadranteEditandoId = null;
    _geometriaOriginal   = null;
  }
  const c = cuadrantesMap.get(id);
  if (!c) return;

  try {
    const resp = await fetch(`/api/geo/tepic/cuadrantes/${id}`, { method: 'DELETE' });
    const data = await resp.json();
    if (!resp.ok) throw new Error(data.error || 'Error al eliminar');

    _capaParaNivel(c.nivel).removeLayer(c.layer);
    cuadrantesMap.delete(id);
    if (cuadranteSeleccionadoId === id) {
      cuadranteSeleccionadoId = null;
      document.getElementById('geotepic-detalle').style.display = 'none';
    }

    _restaurarEstiloColonias();
    actualizarConflictos();
    renderListaCuadrantes();
    window.dispatchEvent(new CustomEvent('geotepic:cuadrantes-cambiaron'));
  } catch (err) {
    // Restaurar panel de acciones si falló
    const acc = document.getElementById('geotepic-detalle-acciones');
    if (acc) acc.style.display = 'flex';
    _mostrarErrorEdicion(`Error al eliminar: ${err.message}`);
  }
}

function _confirmarEliminar() {
  const id = cuadranteSeleccionadoId;
  _cancelarEliminar();
  eliminarCuadrante(id); // async; errores manejados internamente
}

// ── Carga inicial desde backend ───────────────────────────────────────────────

async function _cargarCuadrantesGeoTepic() {
  // Limpiar estado existente
  for (const [, c] of cuadrantesMap) _capaParaNivel(c.nivel).removeLayer(c.layer);
  cuadrantesMap.clear();
  cuadranteSeleccionadoId = null;
  _cuadranteEditandoId    = null;
  _pendingParentId        = null;
  _geometriaOriginal      = null;
  renderListaCuadrantes();

  try {
    const resp = await fetch('/api/geo/tepic/cuadrantes');
    if (!resp.ok) throw new Error('Error cargando cuadrantes');
    const zonas = await resp.json();

    // Procesar en orden: nivel 1 antes que nivel 2, etc.
    zonas.sort((a, b) => a.nivel - b.nivel || a.codigo.localeCompare(b.codigo));

    for (const zona of zonas) {
      const id       = String(zona.id);
      const geometry = typeof zona.geometry === 'string' ? JSON.parse(zona.geometry) : zona.geometry;
      const layer    = L.geoJSON({ type: 'Feature', geometry }).getLayers()[0];

      cuadrantesMap.set(id, {
        id,
        codigo:   zona.codigo,
        nombre:   zona.nombre,
        tipo:     'cuadrante',
        parentId: zona.parent_id ? String(zona.parent_id) : null,
        nivel:    zona.nivel,
        layer,
        colonias: [],
      });

      _bindLayerCuadrante(layer, id);
      _capaParaNivel(zona.nivel).addLayer(layer);
    }

    for (const [id] of cuadrantesMap) analizarCuadrante(id);
    renderListaCuadrantes();
    window.dispatchEvent(new CustomEvent('geotepic:cuadrantes-cambiaron'));

    if (zonas.length > 0) console.log(`[GeoTepic] ${zonas.length} cuadrante(s) cargados`);
  } catch (err) {
    console.error('[GeoTepic] Error cargando cuadrantes:', err);
  }
}

// ── Bind de layer ─────────────────────────────────────────────────────────────

function _bindLayerCuadrante(layer, id) {
  const c = cuadrantesMap.get(id);
  layer.setStyle(_ESTILO_NORMAL);
  layer.bindTooltip(c?.nombre || c?.codigo || id, {
    permanent: true, direction: 'center', className: 'geotepic-cuadrante-label',
  });
  layer.on('click', () => seleccionarCuadrante(id));
}

// ── Init ──────────────────────────────────────────────────────────────────────

function initCuadrantesGeoTepic() {
  _gtMap.pm.addControls({
    position: 'topleft',
    drawMarker: false, drawCircleMarker: false, drawPolyline: false,
    drawCircle: false, drawText: false, drawPolygon: true, drawRectangle: true,
    editMode: false, dragMode: false, removalMode: false, cutPolygon: false, rotateMode: false,
  });

  _gtMap.on('pm:create', async (e) => {
    const parentId = _pendingParentId;
    _pendingParentId = null; // Limpiar inmediatamente antes de cualquier await

    const layer = e.layer;
    _gtMap.removeLayer(layer); // Mover a capaCuadrantes; evitar duplicado

    // Validar que el subcuadrante esté dentro del padre (frontend)
    if (parentId) {
      const parent = cuadrantesMap.get(parentId);
      if (!parent || !_estaCompletamenteDentro(layer, parent.layer)) {
        _actualizarEstadoPanel();
        const errEl = document.getElementById('gc-error-subcuadrante');
        if (errEl) {
          errEl.textContent   = `El subcuadrante debe estar completamente dentro de "${parent?.nombre || 'el cuadrante padre'}".`;
          errEl.style.display = '';
          setTimeout(() => { errEl.style.display = 'none'; }, 5000);
        }
        return;
      }
    }

    // POST al backend
    const geometry    = layer.toGeoJSON().geometry;
    const parentIdNum = parentId ? Number(parentId) : null;

    try {
      const resp = await fetch('/api/geo/tepic/cuadrantes', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ nombre: '', parentId: parentIdNum, geometry }),
      });
      const data = await resp.json();
      if (!resp.ok) throw new Error(data.error || 'Error al guardar cuadrante');

      const zona = data.cuadrante;
      const id   = String(zona.id);

      cuadrantesMap.set(id, {
        id,
        codigo:   zona.codigo,
        nombre:   zona.nombre,
        tipo:     'cuadrante',
        parentId: zona.parent_id ? String(zona.parent_id) : null,
        nivel:    zona.nivel,
        layer,
        colonias: [],
      });

      _bindLayerCuadrante(layer, id);
      _capaParaNivel(zona.nivel).addLayer(layer);

      analizarCuadrante(id);
      actualizarConflictos();
      _actualizarEstadoPanel();
      renderListaCuadrantes();
      seleccionarCuadrante(id);
      window.dispatchEvent(new CustomEvent('geotepic:cuadrantes-cambiaron'));

      console.log('[GeoTepic] Zona guardada:', { id, codigo: zona.codigo, nivel: zona.nivel, parentId });
    } catch (err) {
      console.error('[GeoTepic] Error guardando cuadrante:', err);
      _actualizarEstadoPanel();
      const errEl = document.getElementById('gc-error-subcuadrante');
      if (errEl) {
        errEl.textContent   = `Error al guardar: ${err.message}`;
        errEl.style.display = '';
        setTimeout(() => { errEl.style.display = 'none'; }, 6000);
      }
    }
  });

  // Dibujo cancelado sin completar (Escape)
  _gtMap.on('pm:drawend', () => {
    if (_pendingParentId) {
      _pendingParentId = null;
      _actualizarEstadoPanel();
    }
  });
}
