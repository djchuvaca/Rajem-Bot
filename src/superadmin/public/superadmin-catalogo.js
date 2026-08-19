let _catGiro  = null;
let _catDatos = null;

const _LABEL_CAT = { cortes:'cortes', itemTypes:'formatos', refrescos:'bebidas', salsas:'salsas' };
const _SS = (sel,v,opts) => opts.map(o=>`<option value="${o}"${v===o?' selected':''}>${o}</option>`).join('');

function _slugDesdeNombre(n) {
  return (n||'').toLowerCase().normalize('NFD').replace(/[̀-ͯ]/g,'')
    .replace(/\s+/g,'_').replace(/[^a-z0-9_]/g,'').replace(/_+/g,'_').replace(/^_|_$/g,'');
}

async function loadCatalogoGiros() {
  try {
    const giros = await api('/api/giros');
    const sel = document.getElementById('cat-giro-select');
    sel.innerHTML = '<option value="">— Selecciona un giro —</option>' +
      giros.map(g => `<option value="${esc(g.slug)}">${g.emoji} ${esc(g.nombre)}</option>`).join('');
    if (_catGiro) sel.value = _catGiro;
    if (!_catGiro && giros.length) await setCatGiro(giros[0].slug);
    else if (_catGiro) await setCatGiro(_catGiro);
  } catch(e) {
    document.getElementById('cat-contenido').innerHTML =
      `<div class="alert alert-error">Error al cargar giros: ${esc(e.message)}</div>`;
  }
}

async function setCatGiro(slug) {
  if (!slug) return;
  _catGiro = slug;
  const sel = document.getElementById('cat-giro-select');
  if (sel) sel.value = slug;
  const el = document.getElementById('cat-contenido');
  el.innerHTML = '<p style="color:var(--muted);padding:8px 0">Cargando catálogo…</p>';
  try {
    _catDatos = await api(`/api/giros/${slug}/catalogo`);
    renderCatalogoCompleto();
  } catch(e) {
    el.innerHTML = `<div class="alert alert-error">Error: ${esc(e.message)}</div>`;
  }
}

async function _recargarCat() {
  _catDatos = await api(`/api/giros/${_catGiro}/catalogo`);
  renderCatalogoCompleto();
}

function renderCatalogoCompleto() {
  if (!_catDatos) return;
  const s = _catDatos.soporta || {};
  document.getElementById('cat-contenido').innerHTML = [
    _htmlSeccion('cortes',    '🥩 Cortes / Variantes'),
    _htmlSeccion('itemTypes', '📦 Formatos'),
    s.refrescos ? _htmlSeccion('refrescos', '🥤 Bebidas') : '',
    s.salsas    ? _htmlSeccion('salsas',    '🌶️ Salsas')  : '',
  ].join('');
}

function _tieneSec() { return _catGiro === 'taqueria'; }

function _nc(tipo) {
  if (tipo === 'cortes')    return _tieneSec() ? 7 : 6;
  if (tipo === 'itemTypes') return 7;
  if (tipo === 'refrescos') return 5;
  return 6;
}

function _thead_cat(tipo) {
  if (tipo === 'cortes')
    return `<tr><th>Slug</th><th>Nombre</th><th>Precio</th>${_tieneSec()?'<th>Sección</th>':''}<th>Aliases NLU</th><th>Descripción</th><th>Acciones</th></tr>`;
  if (tipo === 'itemTypes')
    return '<tr><th>Slug</th><th>Nombre / Plural</th><th>Emoji</th><th>Precio</th><th>Campo</th><th>Aliases NLU</th><th>Acciones</th></tr>';
  if (tipo === 'refrescos')
    return '<tr><th>Nombre</th><th>Precio</th><th>Sinónimos NLU</th><th>Descripción</th><th>Acciones</th></tr>';
  return '<tr><th>Nombre</th><th>Emoji</th><th>Precio</th><th>Sinónimos NLU</th><th>Descripción</th><th>Acciones</th></tr>';
}

function _filaDisplay(tipo, it, idx) {
  const rid = tipo==='cortes'||tipo==='itemTypes' ? it.slug : it.nombre;
  const ac = `<td style="white-space:nowrap">
    <button class="btn btn-secondary btn-sm" onclick="catEditarFila('${tipo}',${idx})">Editar</button>
    <button class="btn btn-danger btn-sm" onclick="catEliminar('${tipo}','${esc(rid)}')">Eliminar</button></td>`;
  if (tipo === 'cortes') return `<tr data-idx="${idx}">
    <td><code style="font-size:11px;color:var(--muted)">${esc(it.slug)}</code></td>
    <td><strong>${esc(it.nombre)}</strong></td>
    <td>$${it.precio_base??0}</td>
    ${_tieneSec()?`<td><span class="badge badge-gray">${esc(it.seccion||'')}</span>${it.subclase?`<div style="font-size:10px;color:var(--muted)">${esc(it.subclase)}</div>`:''}  </td>`:''}
    <td style="font-size:11px;color:var(--muted)">${esc((it.aliases||[]).join(', '))}</td>
    <td style="font-size:11px;color:var(--muted)">${esc(it.descripcion||'')}</td>
    ${ac}</tr>`;
  if (tipo === 'itemTypes') return `<tr data-idx="${idx}">
    <td><code style="font-size:11px;color:var(--muted)">${esc(it.slug)}</code></td>
    <td><strong>${esc(it.nombre)}</strong><div style="font-size:11px;color:var(--muted)">${esc(it.nombre_plural||'')}</div></td>
    <td>${esc(it.emoji||'')}</td>
    <td>$${it.precio_base??0}</td>
    <td><code style="font-size:11px">${esc(it.precio_campo||'')}</code>${it.soporta_gramos?'<div style="font-size:10px">📊 gramos</div>':''}${it.soporta_pesos?'<div style="font-size:10px">⚖️ pesos</div>':''}</td>
    <td style="font-size:11px;color:var(--muted)">${esc((it.aliases||[]).join(', '))}</td>
    ${ac}</tr>`;
  if (tipo === 'refrescos') return `<tr data-idx="${idx}">
    <td><strong>${esc(it.nombre)}</strong></td>
    <td>$${it.precio??0}</td>
    <td style="font-size:11px;color:var(--muted)">${esc(it.sinonimos||'')}</td>
    <td style="font-size:11px;color:var(--muted)">${esc(it.descripcion||'')}</td>
    ${ac}</tr>`;
  return `<tr data-idx="${idx}">
    <td><strong>${esc(it.nombre)}</strong></td>
    <td>${esc(it.emoji||'')}</td>
    <td>$${it.precio??0}</td>
    <td style="font-size:11px;color:var(--muted)">${esc(it.sinonimos||'')}</td>
    <td style="font-size:11px;color:var(--muted)">${esc(it.descripcion||'')}</td>
    ${ac}</tr>`;
}

function _celdasInput(tipo, it, P) {
  const W = 'style="width:100%;min-width:70px;box-sizing:border-box"';
  const I = (f,v='',x='') => `<input id="${P}${f}" value="${esc(v)}" ${W} ${x}>`;
  const N = (f,v=0) => `<input id="${P}${f}" type="number" value="${v}" style="width:72px" min="0">`;
  const es = !!it;

  if (tipo === 'cortes') {
    const slugTd = es
      ? `<td><code style="font-size:11px">${esc(it.slug)}</code></td>`
      : `<td>${I('slug','','readonly style="opacity:.5;cursor:not-allowed;width:100%;min-width:70px;box-sizing:border-box"')}</td>`;
    const ni = es ? '' : `oninput="document.getElementById('${P}slug').value=_slugDesdeNombre(this.value)"`;
    const secTd = _tieneSec() ? `<td>
      <select id="${P}sec" style="width:100%;margin-bottom:3px">${_SS(1,it?.seccion,['asada','carnitas','ambas'])}</select>
      <select id="${P}sub" style="width:100%;font-size:11px">${_SS(1,it?.subclase,['res','cerdo','cerdo_adobado','viscera','piel','hueso','magra','mixto'])}</select>
    </td>` : '';
    return `${slugTd}<td>${I('nombre',it?.nombre||'',ni)}</td><td>${N('precio',it?.precio_base??0)}</td>${secTd}<td>${I('aliases',(it?.aliases||[]).join(', '))}</td><td>${I('desc',it?.descripcion||'')}</td>`;
  }
  if (tipo === 'itemTypes') {
    const slugTd = es
      ? `<td><code style="font-size:11px">${esc(it.slug)}</code></td>`
      : `<td>${I('slug','','readonly style="opacity:.5;cursor:not-allowed;width:100%;min-width:70px;box-sizing:border-box"')}</td>`;
    const ni = es ? '' : `oninput="document.getElementById('${P}slug').value=_slugDesdeNombre(this.value)"`;
    return `${slugTd}
      <td>${I('nombre',it?.nombre||'',ni)}<br><input id="${P}plural" value="${esc(it?.nombre_plural||'')}" placeholder="plural" style="width:100%;font-size:11px;margin-top:3px;box-sizing:border-box"></td>
      <td><input id="${P}emoji" value="${esc(it?.emoji||'🍽️')}" style="width:50px"></td>
      <td>${N('precio',it?.precio_base??0)}</td>
      <td><select id="${P}campo" style="width:100%;margin-bottom:3px">${_SS(1,it?.precio_campo||'precio_taco',['precio_taco','precio_torta','precio_100g'])}</select>
        <label style="font-size:11px;display:flex;align-items:center;gap:3px"><input id="${P}gramos" type="checkbox" style="width:auto" ${it?.soporta_gramos?'checked':''}> gramos</label>
        <label style="font-size:11px;display:flex;align-items:center;gap:3px"><input id="${P}pesos"  type="checkbox" style="width:auto" ${it?.soporta_pesos?'checked':''}>  pesos</label>
      </td>
      <td>${I('aliases',(it?.aliases||[]).join(', '))}</td>`;
  }
  if (tipo === 'refrescos') return `<td>${I('nombre',it?.nombre||'')}</td><td>${N('precio',it?.precio??0)}</td><td>${I('sin',it?.sinonimos||'')}</td><td>${I('desc',it?.descripcion||'')}</td>`;
  return `<td>${I('nombre',it?.nombre||'')}</td><td><input id="${P}emoji" value="${esc(it?.emoji||'')}" style="width:50px"></td><td>${N('precio',it?.precio??0)}</td><td>${I('sin',it?.sinonimos||'')}</td><td>${I('desc',it?.descripcion||'')}</td>`;
}

function _acTd(guardar, cancelar) {
  return `<td style="white-space:nowrap;vertical-align:middle">
    <button class="btn btn-primary btn-sm" onclick="${guardar}">✓ Guardar</button>
    <button class="btn btn-secondary btn-sm" onclick="${cancelar}">✕</button></td>`;
}

function _htmlSeccion(tipo, titulo) {
  const items = _catDatos?.[tipo] || [];
  const nc    = _nc(tipo);
  const filas = items.map((it,i) => _filaDisplay(tipo,it,i)).join('') ||
    `<tr><td colspan="${nc}" class="empty">Sin ${_LABEL_CAT[tipo]}. Usa "+ Agregar" para añadir.</td></tr>`;
  return `<div class="card" style="margin-bottom:20px">
    <div style="display:flex;justify-content:space-between;align-items:center;padding:12px 16px;border-bottom:1px solid var(--border)">
      <strong>${titulo}</strong>
      <button class="btn btn-primary btn-sm" onclick="catAgregarFila('${tipo}')">+ Agregar</button>
    </div>
    <div class="table-wrap" style="overflow-x:auto">
      <table><thead>${_thead_cat(tipo)}</thead>
      <tbody id="cat-tbody-${tipo}">${filas}</tbody></table>
    </div></div>`;
}

function _renderTabla(tipo) {
  const tbody = document.getElementById(`cat-tbody-${tipo}`);
  if (!tbody) return;
  const items = _catDatos?.[tipo] || [];
  tbody.innerHTML = items.map((it,i) => _filaDisplay(tipo,it,i)).join('') ||
    `<tr><td colspan="${_nc(tipo)}" class="empty">Sin ${_LABEL_CAT[tipo]}.</td></tr>`;
}

function catAgregarFila(tipo) {
  if (document.getElementById(`cat-fila-nueva-${tipo}`)) return;
  const tbody = document.getElementById(`cat-tbody-${tipo}`);
  if (!tbody) return;
  const P  = `cn${tipo}_`;
  const tr = document.createElement('tr');
  tr.id    = `cat-fila-nueva-${tipo}`;
  tr.style.background = '#f0f7ff';
  tr.innerHTML = _celdasInput(tipo, null, P) +
    _acTd(`catGuardarNuevo('${tipo}')`, `catCancelarNuevo('${tipo}')`);
  tbody.appendChild(tr);
  tr.querySelector('input:not([readonly])')?.focus();
}

function catCancelarNuevo(tipo) {
  document.getElementById(`cat-fila-nueva-${tipo}`)?.remove();
  _renderTabla(tipo);
}

function catEditarFila(tipo, idx) {
  document.getElementById(`cat-fila-nueva-${tipo}`)?.remove();
  const tbody = document.getElementById(`cat-tbody-${tipo}`);
  const tr    = tbody?.querySelector(`tr[data-idx="${idx}"]`);
  if (!tr) return;
  const item = _catDatos?.[tipo]?.[idx];
  if (!item) return;
  const P = `ce${tipo}${idx}_`;
  tr.style.background = '#f0f7ff';
  tr.innerHTML = _celdasInput(tipo, item, P) +
    _acTd(`catGuardarEdicion('${tipo}',${idx})`, `catCancelarEdicion('${tipo}',${idx})`);
  tr.querySelector('input:not([readonly])')?.focus();
}

function catCancelarEdicion(tipo, idx) { _renderTabla(tipo); }

function _leerCampos(tipo, P) {
  const v  = f => document.getElementById(`${P}${f}`)?.value?.trim() || '';
  const vn = f => parseFloat(document.getElementById(`${P}${f}`)?.value) || 0;
  const ch = f => !!document.getElementById(`${P}${f}`)?.checked;
  const nombre = v('nombre');
  if (!nombre) throw new Error('El nombre es obligatorio');
  if (tipo === 'cortes') {
    const body = { nombre, precio_base: vn('precio'), aliases: v('aliases'), descripcion: v('desc') };
    const sec = document.getElementById(`${P}sec`);
    if (sec) { body.seccion = sec.value; const sub = document.getElementById(`${P}sub`); if (sub) body.subclase = sub.value; }
    return body;
  }
  if (tipo === 'itemTypes') return {
    nombre, nombre_plural: v('plural') || nombre, emoji: v('emoji') || '🍽️',
    precio_base: vn('precio'), precio_campo: document.getElementById(`${P}campo`)?.value || 'precio_taco',
    aliases: v('aliases'), soporta_gramos: ch('gramos'), soporta_pesos: ch('pesos'),
  };
  if (tipo === 'refrescos') return { nombre, precio: vn('precio'), sinonimos: v('sin'), descripcion: v('desc') };
  return { nombre, emoji: v('emoji'), precio: vn('precio'), sinonimos: v('sin'), descripcion: v('desc') };
}

async function catGuardarNuevo(tipo) {
  try {
    const body = _leerCampos(tipo, `cn${tipo}_`);
    if (tipo === 'cortes' || tipo === 'itemTypes') body.slug = _slugDesdeNombre(body.nombre);
    await api(`/api/giros/${_catGiro}/catalogo/${tipo}`, { method: 'POST', body });
    toast('Ítem agregado y propagado a tenants');
    await _recargarCat();
  } catch(e) { toast('Error: '+e.message, 'err'); }
}

async function catGuardarEdicion(tipo, idx) {
  try {
    const item = _catDatos?.[tipo]?.[idx];
    if (!item) return;
    const body = _leerCampos(tipo, `ce${tipo}${idx}_`);
    const id   = tipo==='cortes'||tipo==='itemTypes' ? item.slug : item.nombre;
    if (tipo === 'cortes' || tipo === 'itemTypes') body.slug = item.slug;
    await api(`/api/giros/${_catGiro}/catalogo/${tipo}/${encodeURIComponent(id)}`, { method: 'PUT', body });
    toast('Ítem actualizado');
    await _recargarCat();
  } catch(e) { toast('Error: '+e.message, 'err'); }
}

async function catEliminar(tipo, id) {
  if (!confirm(`¿Eliminar "${id}"? Los tenants que lo tengan activo lo perderán.`)) return;
  try {
    await api(`/api/giros/${_catGiro}/catalogo/${tipo}/${encodeURIComponent(id)}`, { method: 'DELETE' });
    toast('Ítem eliminado');
    await _recargarCat();
  } catch(e) { toast('Error: '+e.message, 'err'); }
}
