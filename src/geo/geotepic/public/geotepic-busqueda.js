// ── Búsqueda de colonias ──────────────────────────────────────────────────────

function _buscarColonia(texto) {
  const resultados = document.getElementById('gc-buscar-colonia-results');
  if (!resultados) return;

  const q = texto.trim().toLowerCase();
  if (!q) { resultados.style.display = 'none'; return; }

  const matches = [];
  for (const [nombre] of coloniasMap) {
    if (nombre.toLowerCase().includes(q)) matches.push(nombre);
    if (matches.length >= 8) break;
  }

  resultados.innerHTML = '';
  if (matches.length === 0) { resultados.style.display = 'none'; return; }

  for (const nombre of matches) {
    const item = document.createElement('div');
    item.className = 'geotepic-busqueda-result';
    item.textContent = nombre;
    item.onmousedown = (e) => {
      e.preventDefault();
      document.getElementById('gc-buscar-colonia').value = nombre;
      resultados.style.display = 'none';
      _seleccionarColoniaResultado(nombre);
    };
    resultados.appendChild(item);
  }
  resultados.style.display = '';
}

function _seleccionarColoniaResultado(nombre) {
  const entrada = coloniasMap.get(nombre);
  if (!entrada) return;
  const { data, marker } = entrada;

  _restaurarEstiloColonias();
  marker.setStyle(_ESTILO_COLONIA_RESALTADA);
  _gtMap.setView([data.lat, data.lng], Math.max(_gtMap.getZoom(), 15));
  marker.setPopupContent(_popupColoniaConRuta(data)).openPopup();
}

function _popupColoniaConRuta(c) {
  const div = document.createElement('div');

  const tit = document.createElement('strong');
  tit.textContent = c.nombre;
  div.appendChild(tit);

  const { cuadrantes: ids } = obtenerCuadrantesDeColonia(c.nombre);
  if (ids.length > 0) {
    const hr = document.createElement('hr');
    hr.style.cssText = 'margin:5px 0;border-color:#333';
    div.appendChild(hr);

    const todos = ids.map(id => cuadrantesMap.get(id)).filter(Boolean);
    todos.sort((a, b) => a.nivel - b.nivel);

    for (const z of todos) {
      const fila = document.createElement('div');
      fila.style.fontSize = '12px';
      const lbl = document.createElement('span');
      lbl.style.color = '#6b7280';
      lbl.textContent = z.nivel === 1 ? 'Cuadrante: ' : 'Subcuadrante: ';
      const val = document.createElement('span');
      val.textContent = z.nombre || z.codigo;
      fila.appendChild(lbl);
      fila.appendChild(val);
      div.appendChild(fila);
    }

    const ruta = obtenerRutaZona(todos[todos.length - 1].id);
    if (ruta.length > 1) {
      const rutaEl = document.createElement('div');
      rutaEl.style.cssText = 'font-size:11px;color:#6b7280;margin-top:3px';
      rutaEl.textContent = 'Ruta: ' + ruta.join(' > ');
      div.appendChild(rutaEl);
    }
  } else {
    const sin = document.createElement('div');
    sin.style.cssText = 'font-size:12px;color:#6b7280;margin-top:4px';
    sin.textContent = 'Sin cuadrante asignado';
    div.appendChild(sin);
  }
  return div;
}

// ── Búsqueda de cuadrantes ────────────────────────────────────────────────────

function _buscarCuadrante(texto) {
  const resultados = document.getElementById('gc-buscar-cuadrante-results');
  if (!resultados) return;

  const q = texto.trim().toLowerCase();
  if (!q) { resultados.style.display = 'none'; return; }

  const matches = [];
  for (const [id, c] of cuadrantesMap) {
    const hayMatch = (c.nombre && c.nombre.toLowerCase().includes(q)) ||
                     c.codigo.toLowerCase().includes(q);
    if (hayMatch) matches.push(id);
    if (matches.length >= 8) break;
  }

  resultados.innerHTML = '';
  if (matches.length === 0) { resultados.style.display = 'none'; return; }

  for (const id of matches) {
    const c = cuadrantesMap.get(id);
    const item = document.createElement('div');
    item.className = 'geotepic-busqueda-result';

    const cod = document.createElement('span');
    cod.style.cssText = 'font-size:10px;color:#6b7280;margin-right:6px;font-family:monospace';
    cod.textContent = c.codigo;
    const nom = document.createElement('span');
    nom.textContent = c.nombre || '(sin nombre)';

    item.appendChild(cod);
    item.appendChild(nom);
    item.onmousedown = (e) => {
      e.preventDefault();
      document.getElementById('gc-buscar-cuadrante').value = c.nombre || c.codigo;
      resultados.style.display = 'none';
      seleccionarCuadrante(id);
      centrarEnCuadrante(id);
    };
    resultados.appendChild(item);
  }
  resultados.style.display = '';
}

// ── Cerrar dropdowns al enfocar afuera ────────────────────────────────────────

document.addEventListener('click', (e) => {
  const resCol = document.getElementById('gc-buscar-colonia-results');
  const resCua = document.getElementById('gc-buscar-cuadrante-results');
  if (resCol && !resCol.contains(e.target) && e.target.id !== 'gc-buscar-colonia')
    resCol.style.display = 'none';
  if (resCua && !resCua.contains(e.target) && e.target.id !== 'gc-buscar-cuadrante')
    resCua.style.display = 'none';
});
