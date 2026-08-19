async function loadTenants() {
  const r = await fetch('/api/tenants'); if(!r.ok) return;
  const data = await r.json();
  const PLAN_BADGE = {basico:'badge-gray', plus:'badge-blue', pro:'badge-green'};
  document.getElementById('tenants-tbody').innerHTML = data.map(t => `
    <tr>
      <td><code style="font-size:11px">${esc(t.id)}</code></td>
      <td>${esc(t.nombre)}</td>
      <td>${esc(t.ciudad)}, ${esc(t.estado)}</td>
      <td style="font-size:12px;white-space:nowrap">${esc(GIRO_LABEL[t.business_type] || t.business_type || '🌮 Taquería')}</td>
      <td><span class="badge ${PLAN_BADGE[t.plan]||'badge-gray'}">${t.plan}</span></td>
      <td><span class="badge ${{activo:'badge-green',pausado:'badge-yellow',inactivo:'badge-gray'}[t.bot_estado]||'badge-gray'}">${{activo:'Activo',pausado:'En pausa',inactivo:'Inactivo'}[t.bot_estado]||'Inactivo'}</span></td>
      <td style="display:flex;gap:6px;flex-wrap:wrap">
        <button class="btn btn-secondary btn-sm" onclick="editTenant('${t.id}')">Editar</button>
        <button class="btn btn-primary btn-sm" onclick="openProvisionar('${t.id}','${t.id}')">Provisionar</button>
        <button class="btn btn-danger btn-sm" onclick="confirmDelete('${t.id}','${t.id}')">Eliminar</button>
      </td>
    </tr>`).join('') || '<tr><td colspan="7" class="empty">Sin negocios</td></tr>';
}

let _editingTenantId = null;

function openTenantModal() {
  _editingTenantId = null;
  document.getElementById('modal-tenant-title').textContent = 'Nuevo negocio';
  ['mt-id','mt-nombre','mt-ciudad','mt-estado','mt-grupo','mt-notas'].forEach(i => document.getElementById(i).value='');
  document.getElementById('mt-id').disabled = false;
  document.getElementById('mt-plan').value = 'basico';
  document.getElementById('mt-business-type').value = 'taqueria';
  document.getElementById('mt-btn').textContent = 'Crear y provisionar';
  document.getElementById('mt-seccion-taqueria').value = 'ambas';
  _mtToggleSeccion();
  openModal('modal-tenant');
}

function _mtToggleSeccion() {
  const giro = document.getElementById('mt-business-type').value;
  document.getElementById('mt-seccion-row').style.display = giro === 'taqueria' ? '' : 'none';
}

async function editTenant(id) {
  const r = await fetch('/api/tenants'); const data = await r.json();
  const t = data.find(x=>x.id===id); if(!t) return;
  _editingTenantId = id;
  document.getElementById('modal-tenant-title').textContent = 'Editar negocio';
  document.getElementById('mt-id').value=t.id; document.getElementById('mt-id').disabled=true;
  document.getElementById('mt-nombre').value=t.nombre;
  document.getElementById('mt-ciudad').value=t.ciudad; document.getElementById('mt-estado').value=t.estado;
  document.getElementById('mt-grupo').value='';
  document.getElementById('mt-plan').value=t.plan||'basico';
  document.getElementById('mt-business-type').value = t.business_type || 'taqueria';
  document.getElementById('mt-seccion-taqueria').value = t.seccion_taqueria || 'ambas';
  document.getElementById('mt-notas').value=t.notas||'';
  document.getElementById('mt-btn').textContent = 'Guardar cambios';
  _mtToggleSeccion();
  openModal('modal-tenant');
}

async function saveTenant() {
  const id = _editingTenantId || document.getElementById('mt-id').value.trim();
  const nombre = document.getElementById('mt-nombre').value.trim();
  if(!id || !nombre){ toast('El nombre es requerido','err'); return; }
  const body = {
    nombre,
    ciudad:        document.getElementById('mt-ciudad').value.trim(),
    estado:        document.getElementById('mt-estado').value.trim(),
    plan:             document.getElementById('mt-plan').value,
    business_type:    document.getElementById('mt-business-type').value,
    seccion_taqueria: document.getElementById('mt-business-type').value === 'taqueria'
                        ? document.getElementById('mt-seccion-taqueria').value
                        : null,
    notas:            document.getElementById('mt-notas').value.trim(),
  };
  if(!_editingTenantId){ body.db_path=`data/${id}.db`; body.desde=new Date().toLocaleDateString('en-CA'); }
  const url    = _editingTenantId ? `/api/tenants/${_editingTenantId}` : '/api/tenants';
  const method = _editingTenantId ? 'PUT' : 'POST';
  if(!_editingTenantId) body.id = id;
  const r = await fetch(url, {method,headers:{'Content-Type':'application/json'},body:JSON.stringify(body)});
  if(r.ok){
    closeModal('modal-tenant'); loadTenants(); populateTenantSelects();
    if(_editingTenantId){
      toast('Negocio actualizado');
    } else {
      _provTenantId  = id;
      _provPanelPort = 0;
      await _ejecutarProvisionamientoDirecto({
        tenant_id:        id,
        nombre:           body.nombre,
        ciudad:           body.ciudad,
        estado:           body.estado,
        plan:             body.plan,
        business_type:    body.business_type,
        seccion_taqueria: body.business_type === 'taqueria'
          ? document.getElementById('mt-seccion-taqueria').value
          : undefined,
        grupo_id:         document.getElementById('mt-grupo').value.trim(),
      });
    }
  } else { const e=await r.json().catch(()=>({})); toast(e.error||'Error al guardar','err'); }
}

let _elimId = null;

function confirmDelete(id, nombre) {
  _elimId = id;
  document.getElementById('elim-nombre-label').textContent = `${nombre || id} (${id})`;
  document.getElementById('elim-confirmar').checked = false;
  document.getElementById('elim-superadmin-password').value = '';
  document.getElementById('elim-btn').disabled = true;
  openModal('modal-eliminar-tenant');
}

async function ejecutarEliminacion() {
  if (!_elimId) return;
  const superadminPassword=document.getElementById('elim-superadmin-password').value;
  if(!superadminPassword){toast('Ingresa tu contraseña de superadmin','err');return;}
  document.getElementById('elim-btn').disabled = true;
  closeModal('modal-eliminar-tenant');
  const logsEl = document.getElementById('elim-logs');
  logsEl.textContent = '';
  document.getElementById('elim-logs-title').textContent = `Eliminando "${_elimId}"…`;
  openModal('modal-elim-logs');
  try {
    const r = await fetch(`/api/tenants/${_elimId}/eliminar`, {
      method: 'POST',
      headers: {'Content-Type':'application/json'},
      body: JSON.stringify({autorizado:true,superadmin_password:superadminPassword}),
    });
    if(!r.ok){
      const e=await r.json().catch(()=>({}));
      closeModal('modal-elim-logs');
      openModal('modal-eliminar-tenant');
      document.getElementById('elim-btn').disabled=false;
      toast(e.error||'No autorizado','err'); return;
    }
    const reader = r.body.getReader();
    const decoder = new TextDecoder();
    let exito = false;
    while (true) {
      const { done, value } = await reader.read();
      if (done) break;
      const chunk = decoder.decode(value);
      logsEl.textContent += chunk;
      logsEl.scrollTop = logsEl.scrollHeight;
      if (chunk.includes('[DONE:0]') || chunk.includes('[LISTO]')) exito = true;
    }
    document.getElementById('elim-logs-title').textContent = exito
      ? `✅ "${_elimId}" eliminado`
      : `❌ Error al eliminar "${_elimId}"`;
  } catch(e) {
    logsEl.textContent += `\nError: ${e.message}`;
    document.getElementById('elim-logs-title').textContent = '❌ Error de conexión';
  }
}

function openResolverJID() {
  document.getElementById('jid-result').textContent='';
  document.getElementById('jid-usar-btn').style.display='none';
  _jidResuelto=null;
  openModal('modal-jid');
}

async function resolverJID() {
  const tel=document.getElementById('jid-tel').value.replace(/\D/g,'');
  const r=await fetch('/api/resolver-jid',{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify({telefono:tel})});
  const d=await r.json();
  if(r.ok&&d.jid){
    document.getElementById('jid-result').innerHTML=`<div class="badge badge-yellow">JID normalizado — WhatsApp aún no lo ha verificado</div><br><code style="font-size:12px;margin-top:6px;display:block">${d.jid}</code>`;
    _jidResuelto=d.jid; document.getElementById('jid-usar-btn').style.display='';
  } else if(r.ok){
    document.getElementById('jid-result').innerHTML=`<span class="badge badge-red">❌ No registrado en WhatsApp</span>`;
  } else {
    document.getElementById('jid-result').textContent=d.error||'Error';
  }
}

let _provTenantId   = null;
let _provPanelPort  = null;
let _provQRInterval = null;

function openProvisionar(id, nombre) {
  _provTenantId  = id;
  _provPanelPort = 0;
  document.getElementById('prov-id').value          = id;
  document.getElementById('prov-nombre-label').textContent = nombre || id;
  document.getElementById('prov-grupo').value       = '';
  document.getElementById('prov-btn').disabled      = false;
  openModal('modal-provisionar');
}

async function ejecutarProvisionamiento() {
  document.getElementById('prov-btn').disabled = true;
  const body = {
    tenant_id: _provTenantId,
    grupo_id:  document.getElementById('prov-grupo').value.trim(),
  };
  closeModal('modal-provisionar');
  await _ejecutarProvisionamientoDirecto(body);
}

async function _ejecutarProvisionamientoDirecto(body) {
  const etiqueta = body.nombre || body.tenant_id;
  const logsEl = document.getElementById('prov-logs');
  logsEl.textContent = '';
  document.getElementById('prov-logs-title').textContent = `Provisionando "${etiqueta}"…`;
  document.getElementById('prov-qr-section').style.display = 'none';
  document.getElementById('prov-link-panel').style.display = 'none';
  openModal('modal-prov-logs');
  try {
    const r = await fetch('/api/provisionar', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(body),
    });
    const reader = r.body.getReader();
    const decoder = new TextDecoder();
    let exito = false;
    while (true) {
      const { done, value } = await reader.read();
      if (done) break;
      const chunk = decoder.decode(value);
      logsEl.textContent += chunk;
      logsEl.scrollTop = logsEl.scrollHeight;
      if (chunk.includes('[DONE:0]') || chunk.includes('[LISTO]')) exito = true;
    }
    if (exito) {
      document.getElementById('prov-logs-title').textContent = `✅ "${etiqueta}" provisionado`;
      await loadTenants();
      const tenants = await fetch('/api/tenants').then(r=>r.json()).catch(()=>[]);
      const t = tenants.find(x=>x.id===_provTenantId);
      if (t && t.panel_port) {
        const ip = window.location.hostname;
        const linkEl = document.getElementById('prov-link-panel');
        linkEl.href = `http://${ip}:${t.panel_port}`;
        linkEl.style.display = '';
        _provPanelPort = t.panel_port;
      }
      setTimeout(() => {
        document.getElementById('prov-qr-section').style.display = '';
        iniciarPollingQR();
      }, 20000);
      populateTenantSelects();
    } else {
      document.getElementById('prov-logs-title').textContent = '❌ El provisionamiento terminó con errores';
    }
  } catch (e) {
    logsEl.textContent += `\nError de conexión: ${e.message}`;
    document.getElementById('prov-logs-title').textContent = '❌ Error de conexión';
  }
}

function cerrarLogsProvisionar() {
  if (_provQRInterval) { clearInterval(_provQRInterval); _provQRInterval = null; }
  closeModal('modal-prov-logs');
}

function iniciarPollingQR() {
  if (_provQRInterval) clearInterval(_provQRInterval);
  document.getElementById('prov-qr-estado').textContent = 'Buscando QR…';
  document.getElementById('prov-qr-container').innerHTML = '';
  _pollearQR();
  _provQRInterval = setInterval(_pollearQR, 5000);
}

async function _pollearQR() {
  try {
    const r = await fetch(`/api/tenants/${_provTenantId}/qr`);
    if (r.status === 404) {
      document.getElementById('prov-qr-estado').textContent = 'El bot ya está autenticado o aún iniciando — reintentando…';
      return;
    }
    if (!r.ok) { document.getElementById('prov-qr-estado').textContent = 'Panel del tenant no disponible todavía…'; return; }
    const { qr } = await r.json();
    if (!qr) return;
    const container = document.getElementById('prov-qr-container');
    container.innerHTML = '';
    new QRCode(container, { text: qr, width: 220, height: 220, colorDark: '#000000', colorLight: '#ffffff' });
    document.getElementById('prov-qr-estado').textContent = 'Escanea con WhatsApp → Dispositivos vinculados → Vincular dispositivo';
    clearInterval(_provQRInterval);
    _provQRInterval = setInterval(async () => {
      const check = await fetch(`/api/tenants/${_provTenantId}/qr`).catch(() => null);
      if (check?.status === 404) {
        clearInterval(_provQRInterval); _provQRInterval = null;
        document.getElementById('prov-qr-container').innerHTML = '<div style="padding:20px;color:green;font-weight:600">✅ WhatsApp vinculado</div>';
        document.getElementById('prov-qr-estado').textContent = 'El bot está listo para recibir mensajes.';
      }
    }, 5000);
  } catch (e) {
    document.getElementById('prov-qr-estado').textContent = `Error: ${e.message}`;
  }
}

function toggleNotifJIDField() {
  const mod = document.getElementById('tc-modalidad').value;
  document.getElementById('campo-grupo-id').style.display    = mod==='grupo'    ? '' : 'none';
  document.getElementById('campo-privado-jid').style.display = mod==='privado'  ? '' : 'none';
  document.getElementById('campo-autochat-nota').style.display = mod==='autochat' ? '' : 'none';
  if(mod === 'grupo' && _tcTenant) cargarGruposWA(_tcTenant);
}

async function cargarGruposWA(tenantId) {
  const selectEl   = document.getElementById('tc-grupo-select');
  const cargandoEl = document.getElementById('campo-grupo-cargando');
  cargandoEl.style.display = '';
  selectEl.style.display   = 'none';
  try {
    const r = await fetch(`/api/tenants/${tenantId}/grupos`);
    if(!r.ok) throw new Error('Sin grupos');
    const grupos = await r.json();
    if(!grupos.length) { cargandoEl.textContent = 'El bot no reporta grupos aún (conecta WhatsApp primero).'; return; }
    cargandoEl.style.display = 'none';
    selectEl.innerHTML = `<option value="">— selecciona un grupo —</option>` +
      grupos.map(g=>`<option value="${g.id}">${g.nombre} (${g.participantes} participantes)</option>`).join('');
    const actual = document.getElementById('tc-grupo-id').value;
    if(actual) selectEl.value = actual;
    selectEl.style.display = '';
  } catch {
    cargandoEl.textContent = 'No se pudo cargar la lista de grupos.';
  }
}

function generarJIDPrivado() {
  const tel = document.getElementById('tc-privado-tel').value.replace(/\D/g,'').slice(-10);
  const jid = tel.length === 10 ? `521${tel}@c.us` : '';
  document.getElementById('tc-privado-jid').value = jid;
  document.getElementById('tc-privado-jid-preview').textContent = jid ? `JID: ${jid}` : 'JID: — (ingresa 10 dígitos)';
}

function usarJID() {
  if(!_jidResuelto) return;
  const mod=document.getElementById('tc-modalidad').value;
  if(mod==='privado'){
    document.getElementById('tc-privado-jid').value=_jidResuelto;
    toast('JID asignado al número privado');
  } else {
    document.getElementById('tc-grupo-id').value=_jidResuelto;
    toast('JID asignado al campo GRUPO_ID');
  }
  closeModal('modal-jid');
}

async function openGruposWA() {
  openModal('modal-grupos');
  document.getElementById('grupos-list').textContent='Cargando…';
  if(!_tcTenant){document.getElementById('grupos-list').textContent='Selecciona un tenant';return;}
  const r=await fetch(`/api/tenants/${_tcTenant}/grupos`);
  if(!r.ok){document.getElementById('grupos-list').textContent='No se pudo leer el caché de grupos';return;}
  const grupos=await r.json();
  if(!grupos.length){document.getElementById('grupos-list').innerHTML='<div class="empty">Sin grupos</div>';return;}
  document.getElementById('grupos-list').innerHTML=grupos.map(g=>`
    <div style="display:flex;justify-content:space-between;align-items:center;padding:8px 0;border-bottom:1px solid var(--border)">
      <div><div style="font-weight:600">${esc(g.nombre)}</div><code style="font-size:11px;color:var(--muted)">${esc(g.id)}</code></div>
      <button class="btn btn-secondary btn-sm" onclick="document.getElementById('tc-grupo-id').value='${g.id}';closeModal('modal-grupos');toast('JID copiado al campo')">Usar</button>
    </div>`).join('');
}

document.querySelector('[data-s="tenants"]').addEventListener('click', () => setTimeout(loadTenants, 100));
