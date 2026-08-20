// ── Consultas jerárquicas ─────────────────────────────────────────────────────

function obtenerHijos(parentId) {
  return Array.from(cuadrantesMap.values())
    .filter(c => c.parentId === parentId)
    .sort((a, b) => Number(a.id) - Number(b.id));
}

function obtenerPadre(id) {
  const c = cuadrantesMap.get(id);
  if (!c || !c.parentId) return null;
  return cuadrantesMap.get(c.parentId) || null;
}

function obtenerAncestros(id) {
  const ancestros = [];
  let actual = cuadrantesMap.get(id);
  while (actual && actual.parentId) {
    const padre = cuadrantesMap.get(actual.parentId);
    if (!padre) break;
    ancestros.unshift(padre);
    actual = padre;
  }
  return ancestros;
}

function obtenerDescendientes(id) {
  const resultado = [];
  function _collect(pid) {
    for (const h of obtenerHijos(pid)) {
      resultado.push(h);
      _collect(h.id);
    }
  }
  _collect(id);
  return resultado;
}

function obtenerRutaZona(id) {
  const c = cuadrantesMap.get(id);
  if (!c) return [];
  return [...obtenerAncestros(id).map(a => a.nombre), c.nombre];
}

// ── Árbol en el panel ─────────────────────────────────────────────────────────

function _renderNodoArbol(container, id, depth) {
  const c = cuadrantesMap.get(id);
  if (!c) return;

  const item = document.createElement('div');
  item.className = 'geotepic-lista-item' + (id === cuadranteSeleccionadoId ? ' activo' : '');
  item.style.paddingLeft = `${10 + depth * 14}px`;

  if (depth > 0) {
    const conn = document.createElement('span');
    conn.className = 'geotepic-tree-conn';
    conn.textContent = '└ ';
    item.appendChild(conn);
  }

  const idEl = document.createElement('span');
  idEl.className = 'item-id';
  idEl.textContent = c.codigo;

  const nombreEl = document.createElement('span');
  nombreEl.className = 'item-nombre';
  nombreEl.textContent = c.nombre;

  item.appendChild(idEl);
  item.appendChild(nombreEl);
  item.addEventListener('click', () => seleccionarCuadrante(id));
  container.appendChild(item);

  for (const hijo of obtenerHijos(id)) {
    _renderNodoArbol(container, hijo.id, depth + 1);
  }
}
