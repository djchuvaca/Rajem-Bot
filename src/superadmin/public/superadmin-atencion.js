async function loadAuditoria(){
  const tbody=document.getElementById('auditoria-tbody');
  const r=await fetch('/api/auditoria?limit=300');
  if(!r.ok){tbody.innerHTML='<tr><td colspan="6" class="empty">No se pudo cargar la auditoría</td></tr>';return;}
  const rows=await r.json();
  tbody.innerHTML=rows.map(a=>`<tr>
    <td>${esc(a.created_at)}</td><td>${esc(a.usuario)}</td><td>${esc(a.accion)}</td>
    <td>${esc(a.entidad||'—')} ${a.entidad_id?`<code>${esc(a.entidad_id)}</code>`:''}</td>
    <td><small>${esc(a.detalles||'—')}</small></td><td>${esc(a.ip||'—')}</td>
  </tr>`).join('')||'<tr><td colspan="6" class="empty">Todavía no hay acciones registradas</td></tr>';
}

const _escObs = v => String(v ?? '').replace(/&/g,'&amp;').replace(/</g,'&lt;').replace(/>/g,'&gt;').replace(/"/g,'&quot;').replace(/'/g,'&#39;');
const _fechaObs = v => v ? new Date(String(v).replace(' ','T')).toLocaleString('es-MX') : '—';

async function loadAtencion() {
  const tid = document.getElementById('atencion-tenant-select').value;
  const content = document.getElementById('atencion-content');
  const empty   = document.getElementById('atencion-empty');
  if (!tid) { content.style.display='none'; empty.style.display=''; return; }
  content.style.display=''; empty.style.display='none';

  const estado = document.getElementById('obs-filtro-alertas-sa')?.value || 'abierta';
  const [resumen, alertas, conversaciones] = await Promise.all([
    fetch(`/api/tenants/${tid}/observabilidad/resumen`).then(r=>r.json()),
    fetch(`/api/tenants/${tid}/observabilidad/alertas?estado=${encodeURIComponent(estado)}`).then(r=>r.json()),
    fetch(`/api/tenants/${tid}/observabilidad/conversaciones?limite=100`).then(r=>r.json()),
  ]);

  document.getElementById('obs-stats-sa').innerHTML = `
    <div class="stat-card red"><div class="stat-num">${Number(resumen.alertas_abiertas)||0}</div><div class="stat-label">Alertas abiertas</div></div>
    <div class="stat-card yellow"><div class="stat-num">${Number(resumen.alertas_prioritarias)||0}</div><div class="stat-label">Prioridad alta</div></div>
    <div class="stat-card blue"><div class="stat-num">${Number(resumen.conversaciones_activas)||0}</div><div class="stat-label">Conversaciones activas</div></div>`;

  const badge = document.getElementById('nav-badge-alertas-sa');
  if (badge) { badge.textContent=resumen.alertas_abiertas||''; badge.style.display=resumen.alertas_abiertas?'inline-block':'none'; }

  const tbA = document.querySelector('#obs-alertas-sa-table tbody');
  tbA.innerHTML = (Array.isArray(alertas) && alertas.length) ? alertas.map(a => {
    const color = a.severidad==='critica'||a.severidad==='alta' ? 'red' : a.severidad==='media' ? 'yellow' : 'gray';
    return `<tr><td><span class="badge badge-${color}">${_escObs(a.severidad)}</span></td>
      <td><b>${_escObs(a.titulo)}</b><div class="hint">${_escObs(a.tipo)} · ${Number(a.ocurrencias)||1} vez/veces</div></td>
      <td>${_escObs(a.detalle)}</td><td>${_escObs(a.etapa_actual)}</td><td>${_fechaObs(a.actualizada_en)}</td>
      <td>${a.estado==='abierta'?`<button class="btn btn-primary btn-sm" onclick="resolverAlertaTenant('${_escObs(tid)}',${Number(a.id)})">Resolver</button>`:''}&nbsp;<button class="btn btn-secondary btn-sm" onclick="verConversacionTenant('${_escObs(tid)}','${_escObs(a.trace_id)}')">Ver</button></td></tr>`;
  }).join('') : '<tr><td colspan="6" class="empty">No hay alertas en este estado.</td></tr>';

  const tbC = document.querySelector('#obs-conversaciones-sa-table tbody');
  tbC.innerHTML = (Array.isArray(conversaciones) && conversaciones.length) ? conversaciones.map(c =>
    `<tr><td>${_escObs(c.jid)}</td><td>${_escObs(c.etapa_actual)}</td>
    <td>${c.pedido_id?'#'+Number(c.pedido_id):'—'}</td><td>${Number(c.eventos)||0}</td>
    <td>${Number(c.alertas_abiertas)||0}</td><td>${_fechaObs(c.actualizada_en)}</td>
    <td><button class="btn btn-secondary btn-sm" onclick="verConversacionTenant('${_escObs(tid)}','${_escObs(c.id)}')">Ver línea</button></td></tr>`
  ).join('') : '<tr><td colspan="7" class="empty">Todavía no hay conversaciones registradas.</td></tr>';
}

async function resolverAlertaTenant(tid, id) {
  const nota = prompt('Nota de resolución (opcional):') ?? null;
  if (nota === null) return;
  const r = await fetch(`/api/tenants/${tid}/observabilidad/alertas/${id}/resolver`, { method:'PUT', headers:{'Content-Type':'application/json'}, body:JSON.stringify({ nota }) });
  const data = await r.json();
  if (!r.ok) return toast(data.error || 'No se pudo resolver', 'err');
  toast('Alerta resuelta');
  loadAtencion();
}

async function verConversacionTenant(tid, id) {
  const r = await fetch(`/api/tenants/${tid}/observabilidad/conversaciones/${encodeURIComponent(id)}`);
  const c = await r.json();
  if (!r.ok || c.error) return toast(c.error || 'No se pudo cargar', 'err');
  const detalle = document.getElementById('obs-detalle-sa');
  document.getElementById('obs-timeline-sa').innerHTML = (c.eventos || []).map(e => {
    const color = e.direccion==='cliente' ? 'blue' : e.direccion==='bot' ? 'green' : 'gray';
    return `<div style="border-left:2px solid var(--border2);padding:4px 0 14px 14px;margin-left:6px">
      <div><span class="badge badge-${color}">${_escObs(e.direccion)}</span> <b>${_escObs(e.tipo)}</b> <span class="hint">${_fechaObs(e.fecha)} · ${_escObs(e.etapa)}</span></div>
      <div style="white-space:pre-wrap;margin-top:6px;font-size:13px">${_escObs(e.contenido)}</div></div>`;
  }).join('') || '<div class="empty">Sin eventos.</div>';
  detalle.style.display = 'block';
  detalle.scrollIntoView({ behavior:'smooth', block:'start' });
}
