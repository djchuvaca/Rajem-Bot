const API = '';
const GIRO_CATALOG = [
  { slug: 'taqueria',       label: '🌮 Taquería' },
  { slug: 'pizzeria',       label: '🍕 Pizzería' },
  { slug: 'hamburgueseria', label: '🍔 Hamburguesería' },
];
const GIRO_LABEL = Object.fromEntries(GIRO_CATALOG.map(g => [g.slug, g.label]));

function esc(s){ return String(s||'').replace(/&/g,'&amp;').replace(/</g,'&lt;').replace(/>/g,'&gt;').replace(/"/g,'&quot;'); }

async function api(url, opts = {}) {
  const { method = 'GET', body } = opts;
  const init = { method, headers: {} };
  if (body !== undefined) {
    init.headers['Content-Type'] = 'application/json';
    init.body = JSON.stringify(body);
  }
  const r = await fetch(url, init);
  const data = await r.json().catch(() => ({}));
  if (!r.ok) throw new Error(data.error || data.mensaje || `HTTP ${r.status}`);
  return data;
}

function toast(msg, type='ok') {
  const t = document.getElementById('toast');
  t.textContent = (type==='ok'?'✅ ':'❌ ') + msg;
  t.className = 'show'; setTimeout(()=>t.className='', 2500);
}

function openModal(id) { document.getElementById(id).classList.add('open'); }
function closeModal(id) { document.getElementById(id).classList.remove('open'); }

async function populateTenantSelects() {
  const r=await fetch('/api/tenants'); if(!r.ok) return;
  const data=await r.json();
  const opts=data.map(t=>`<option value="${t.id}">${t.nombre}</option>`).join('');
  const geoOpts=data.filter(t=>(t.ciudad||'').toLowerCase()==='tepic' && (t.estado||'').toLowerCase()==='nayarit')
    .map(t=>`<option value="${t.id}">${t.nombre}</option>`).join('');
  const base='<option value="">-- selecciona --</option>'+opts;
  document.getElementById('geo-tenant-select').innerHTML='<option value="">-- selecciona --</option>'+geoOpts;
  if (geoOpts) {
    document.getElementById('geo-tenant-select').selectedIndex = 1;
    loadGeo();
  } else loadColonias();
  document.getElementById('tc-tenant-select').innerHTML=base;
  document.getElementById('mand-tenant-select').innerHTML=base;
  document.getElementById('atencion-tenant-select').innerHTML=base;
  loadTenants();
}
