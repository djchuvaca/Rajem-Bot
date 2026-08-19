let _colonias = [];
let _geoTenant = null;
let _mcMap = null, _mcMarker = null;
let _zonas = [];

function geoTab(tab, el) {
  if(tab==='zonas' && !_geoTenant){ toast('Selecciona un negocio de Tepic para administrar sus zonas','err'); return; }
  document.querySelectorAll('#sec-geo .tab').forEach(t=>t.classList.remove('active'));
  el.classList.add('active');
  document.getElementById('geo-colonias').style.display = tab==='colonias'?'':'none';
  document.getElementById('geo-zonas').style.display    = tab==='zonas'?'':'none';
  if(tab==='zonas') loadZonas();
}

async function loadGeo() {
  const id = document.getElementById('geo-tenant-select').value;
  _geoTenant = id || null;
  document.getElementById('geo-content').style.display='block';
  await loadColonias();
}

async function loadColonias() {
  const incluirExcluidas = document.getElementById('col-excluidas')?.checked ? '1' : '0';
  const r = await fetch('/api/geo/tepic/colonias?incluir_excluidas='+incluirExcluidas);
  if(!r.ok) {
    document.getElementById('colonias-tbody').innerHTML='<tr><td colspan="6" class="empty">Error al cargar colonias</td></tr>';
    return;
  }
  _colonias = await r.json();
  renderColonias();
}

function filtrarColonias() {
  const q = document.getElementById('col-search').value.toLowerCase();
  const filtered = _colonias.filter(c => [c.nombre,c.nombre_oficial,c.codigo_postal,c.tipo,c.fuente_coordenadas]
    .filter(Boolean).some(v => String(v).toLowerCase().includes(q)));
  renderColoniasData(filtered);
}

function renderColonias() { renderColoniasData(_colonias); }

function renderColoniasData(data) {
  document.getElementById('colonias-tbody').innerHTML = data.map(c => `
    <tr>
      <td>${esc(c.nombre)}</td>
      <td><span class="chip">${c.tipo||'colonia'}</span></td>
      <td>${esc(c.codigo_postal||'—')}</td>
      <td><span title="${esc(c.fuente_coordenadas||'Sin fuente')}">${c.verificada?'<span class="badge badge-green">Verificadas</span>':'<span class="badge badge-yellow">Aproximadas</span>'}<br><small>${c.lat?.toFixed(4)||'—'}, ${c.lon?.toFixed(4)||'—'}</small></span></td>
      <td><span class="badge ${c.confianza==='alta'?'badge-green':'badge-yellow'}">${esc(c.confianza||'sin clasificar')}</span></td>
      <td>${c.excluida?'<span class="badge badge-gray">Excluida</span>':c.activo?'<span class="badge badge-green">Activo</span>':'<span class="badge badge-red">Inactivo</span>'}</td>
      <td style="display:flex;gap:4px">
        ${c.excluida?`<button class="btn btn-secondary btn-sm" onclick="restoreColonia(${c.id})">Restaurar</button>`:`<button class="btn btn-secondary btn-sm" onclick="editColonia(${c.id})">Editar</button><button class="btn btn-danger btn-sm" onclick="deleteColonia(${c.id})">✕</button>`}
      </td>
    </tr>`).join('') || '<tr><td colspan="7" class="empty">Sin colonias configuradas. Agrégalas desde esta sección.</td></tr>';
}

function openColoniaModal(id) {
  document.getElementById('modal-colonia-title').textContent = id ? 'Editar colonia' : 'Agregar colonia';
  document.getElementById('mc-id').value = id||'';
  document.getElementById('mc-nombre').value=''; document.getElementById('mc-aliases').value='';
  document.getElementById('mc-lat').value=''; document.getElementById('mc-lon').value='';
  document.getElementById('mc-tipo').value='colonia'; document.getElementById('mc-activo').value='1';
  openModal('modal-colonia');
  setTimeout(()=>{
    if(!_mcMap){
      _mcMap = L.map('mc-mapa').setView([21.51,-104.89],12);
      L.tileLayer('https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png',{attribution:'© OSM'}).addTo(_mcMap);
      _mcMap.on('click',e=>{
        const {lat,lng} = e.latlng;
        document.getElementById('mc-lat').value=lat.toFixed(7);
        document.getElementById('mc-lon').value=lng.toFixed(7);
        if(_mcMarker)_mcMarker.setLatLng(e.latlng);
        else _mcMarker=L.marker(e.latlng).addTo(_mcMap);
      });
    } else _mcMap.invalidateSize();
  },200);
}

function editColonia(id) {
  const c = _colonias.find(x=>x.id===id); if(!c) return;
  openColoniaModal(id);
  setTimeout(()=>{
    document.getElementById('mc-id').value=c.id;
    document.getElementById('mc-nombre').value=c.nombre;
    document.getElementById('mc-tipo').value=c.tipo||'colonia';
    document.getElementById('mc-activo').value=String(c.activo??1);
    document.getElementById('mc-lat').value=c.lat;
    document.getElementById('mc-lon').value=c.lon;
    const aliases = (() => { try { return JSON.parse(c.aliases||'[]').join(', '); } catch(_){ return c.aliases||''; } })();
    document.getElementById('mc-aliases').value=aliases;
    if(c.lat && c.lon){
      _mcMap.setView([c.lat,c.lon],14);
      if(_mcMarker)_mcMarker.setLatLng([c.lat,c.lon]);
      else _mcMarker=L.marker([c.lat,c.lon]).addTo(_mcMap);
    }
  },250);
}

function syncMapFromInputs() {
  const lat=parseFloat(document.getElementById('mc-lat').value);
  const lon=parseFloat(document.getElementById('mc-lon').value);
  if(isNaN(lat)||isNaN(lon)||!_mcMap) return;
  _mcMap.setView([lat,lon],14);
  if(_mcMarker)_mcMarker.setLatLng([lat,lon]);
  else _mcMarker=L.marker([lat,lon]).addTo(_mcMap);
}

function inferTipo() {
  const n = document.getElementById('mc-nombre').value.toLowerCase();
  let tipo='colonia';
  if(/infonavit/.test(n)) tipo='infonavit';
  else if(/fovissste/.test(n)) tipo='fovissste';
  else if(/fracc|fraccionamiento/.test(n)) tipo='fraccionamiento';
  else if(/^residencial/.test(n)) tipo='residencial';
  else if(/^ampl|ampliaci[oó]n/.test(n)) tipo='ampliacion';
  else if(/^unidad\s/.test(n)) tipo='unidad';
  else if(/^privada\s/.test(n)) tipo='privada';
  document.getElementById('mc-tipo').value=tipo;
}

async function saveColonia() {
  const id=document.getElementById('mc-id').value;
  const nombre=document.getElementById('mc-nombre').value.trim();
  const lat=parseFloat(document.getElementById('mc-lat').value);
  const lon=parseFloat(document.getElementById('mc-lon').value);
  const tipo=document.getElementById('mc-tipo').value;
  const activo=parseInt(document.getElementById('mc-activo').value);
  const aliasesRaw=document.getElementById('mc-aliases').value;
  const aliases=aliasesRaw.split(',').map(s=>s.trim()).filter(Boolean);
  if(!nombre||isNaN(lat)||isNaN(lon)){toast('Faltan datos','err');return;}
  const url = id ? `/api/geo/tepic/colonias/${id}` : '/api/geo/tepic/colonias';
  const method = id ? 'PUT' : 'POST';
  const existente = id ? _colonias.find(c=>c.id===parseInt(id)) : null;
  const r = await fetch(url,{method,headers:{'Content-Type':'application/json'},body:JSON.stringify({...existente,nombre,lat,lon,tipo,activo,aliases})});
  if(r.ok){closeModal('modal-colonia');loadColonias();toast(id?'Colonia actualizada':'Colonia agregada');}
  else toast('Error al guardar','err');
}

async function deleteColonia(id) {
  const c=_colonias.find(x=>x.id===id);
  if(!confirm(`¿Eliminar "${c?.nombre||id}"?`)) return;
  const r=await fetch(`/api/geo/tepic/colonias/${id}`,{method:'DELETE'});
  if(r.ok){loadColonias();toast('Colonia eliminada');}
  else toast('Error','err');
}

async function restoreColonia(id) {
  const r=await fetch(`/api/geo/tepic/colonias/${id}/restaurar`,{method:'POST'});
  if(r.ok){loadColonias();toast('Colonia restaurada desde el diccionario oficial');}
  else toast('Error al restaurar','err');
}

async function loadZonas() {
  if(!_geoTenant) return;
  const r=await fetch(`/api/tenants/${_geoTenant}/zonas`); if(!r.ok) return;
  _zonas=await r.json(); renderZonas();
}

function renderZonas() {
  document.getElementById('zonas-form').innerHTML = _zonas.map((z,i)=>`
    <div style="display:flex;gap:8px;margin-bottom:8px;align-items:center">
      <input type="text" value="${z.nombre_zona}" onchange="_zonas[${i}].nombre_zona=this.value" style="flex:2" placeholder="Ej. Zona Centro">
      <input type="number" value="${z.distancia_max||''}" onchange="_zonas[${i}].distancia_max=parseFloat(this.value)" style="flex:1" placeholder="Ej. 3" min="0.1" step="0.1">
      <input type="number" value="${z.tarifa||''}" onchange="_zonas[${i}].tarifa=parseFloat(this.value)" style="flex:1" placeholder="Ej. 40" min="0" step="1">
      <button class="btn btn-danger btn-sm" onclick="_zonas.splice(${i},1);renderZonas()">✕</button>
    </div>`).join('');
}

function addZonaRow() { _zonas.push({nombre_zona:'',distancia_max:0,tarifa:0}); renderZonas(); }

async function saveZonas() {
  const r=await fetch(`/api/tenants/${_geoTenant}/zonas`,{method:'PUT',headers:{'Content-Type':'application/json'},body:JSON.stringify({zonas:_zonas})});
  r.ok ? toast('Zonas guardadas') : toast('Error','err');
}
