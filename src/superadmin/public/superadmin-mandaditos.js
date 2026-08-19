let _mandTenantId = null;

async function loadMandaditos() {
  const tid = document.getElementById('mand-tenant-select').value;
  if (!tid) { document.getElementById('mand-content').style.display='none'; return; }
  _mandTenantId = tid;
  document.getElementById('mand-content').style.display='';

  // Config de tiempos
  const rc = await fetch(`/api/tenants/${tid}/mandaditos-config`);
  if (rc.ok) {
    const cfg = await rc.json();
    document.getElementById('mand-silencio').value     = cfg.mandaditos_silencio_min     || 15;
    document.getElementById('mand-recordatorio').value = cfg.mandaditos_recordatorio_min || 30;
    document.getElementById('mand-timeout').value      = cfg.mandaditos_timeout_post_min || 20;
  }

  // Repartidores
  const rr = await fetch(`/api/tenants/${tid}/repartidores`);
  const tbody = document.getElementById('mand-tbody');
  if (!rr.ok) { tbody.innerHTML='<tr><td colspan="9" class="empty">Error al cargar</td></tr>'; return; }
  const reps = await rr.json();
  // Poblar select de historial
  const histSel = document.getElementById('hist-rep');
  if (histSel) {
    const current = histSel.value;
    histSel.innerHTML = '<option value="">Todos</option>' + reps.map(r => `<option value="${r.id}">${esc(r.nombre)}</option>`).join('');
    if (current) histSel.value = current;
  }
  if (!reps.length) { tbody.innerHTML='<tr><td colspan="9" class="empty">Sin repartidores registrados aún</td></tr>'; return; }
  tbody.innerHTML = reps.map(r => `
    <tr>
      <td><span id="mand-nombre-${r.id}">${esc(r.nombre)}</span></td>
      <td>${r.activo ? '<span class="badge badge-green">Activo</span>' : '<span class="badge badge-gray">Pausado</span>'}</td>
      <td>${r.en_ruta ? '<span class="badge badge-yellow">En ruta</span>' : '<span class="badge badge-gray">Libre</span>'}</td>
      <td>${r.pedido_actual_id ? '#'+r.pedido_actual_id : '—'}</td>
      <td>${r.minutos_en_ruta != null ? r.minutos_en_ruta+' min' : '—'}</td>
      <td>${r.entregas_hoy}</td>
      <td>${r.entregas_total}</td>
      <td>${r.promedio_entrega_min != null ? r.promedio_entrega_min+' min' : '—'}</td>
      <td style="display:flex;gap:6px;flex-wrap:wrap">
        <button class="btn btn-secondary btn-sm" onclick="editarRepartidor(${r.id},'${encodeURIComponent(r.nombre)}')">✏️</button>
        <button class="btn btn-secondary btn-sm" onclick="toggleRepartidor(${r.id},${r.activo})">${r.activo ? 'Pausar' : 'Activar'}</button>
        <button class="btn btn-danger btn-sm" onclick="eliminarRepartidor(${r.id})">🗑️</button>
      </td>
    </tr>`).join('');
}

async function saveMandaditosConfig() {
  if (!_mandTenantId) return;
  const config = {
    mandaditos_silencio_min:     document.getElementById('mand-silencio').value,
    mandaditos_recordatorio_min: document.getElementById('mand-recordatorio').value,
    mandaditos_timeout_post_min: document.getElementById('mand-timeout').value,
  };
  const r = await fetch(`/api/tenants/${_mandTenantId}/mandaditos-config`, {
    method:'PUT', headers:{'Content-Type':'application/json'}, body:JSON.stringify(config)
  });
  const data = await r.json().catch(()=>({}));
  r.ok ? toast('Tiempos guardados') : toast(data.error || 'Error al guardar','err');
}

async function editarRepartidor(id, nombreActual) {
  nombreActual = decodeURIComponent(nombreActual);
  const nuevo = prompt('Nuevo nombre:', nombreActual);
  if (!nuevo || nuevo === nombreActual) return;
  const r = await fetch(`/api/tenants/${_mandTenantId}/repartidores/${id}`, {
    method:'PUT', headers:{'Content-Type':'application/json'}, body:JSON.stringify({nombre:nuevo})
  });
  const data = await r.json().catch(()=>({}));
  r.ok ? (toast('Nombre actualizado'), loadMandaditos()) : toast(data.error || 'Error al actualizar','err');
}

async function toggleRepartidor(id, activoActual) {
  const r = await fetch(`/api/tenants/${_mandTenantId}/repartidores/${id}`, {
    method:'PUT', headers:{'Content-Type':'application/json'}, body:JSON.stringify({activo: !activoActual})
  });
  const data = await r.json().catch(()=>({}));
  r.ok ? (toast('Estado actualizado'), loadMandaditos()) : toast(data.error || 'Error al actualizar','err');
}

async function eliminarRepartidor(id) {
  if (!confirm('¿Eliminar este repartidor? Si tiene historial se pausará para conservar sus métricas.')) return;
  const r = await fetch(`/api/tenants/${_mandTenantId}/repartidores/${id}`, { method:'DELETE' });
  const data = await r.json().catch(()=>({}));
  r.ok ? (toast(data.mensaje || (data.accion==='eliminado'?'Repartidor eliminado':'Repartidor pausado')), loadMandaditos()) : toast(data.error || 'Error al eliminar','err');
}

async function loadReporteReparto() {
  if (!_mandTenantId) return toast('Selecciona un negocio','err');
  const desde = document.getElementById('rep-desde').value || '';
  const hasta  = document.getElementById('rep-hasta').value  || '';
  const params = new URLSearchParams();
  if (desde) params.set('desde', desde);
  if (hasta)  params.set('hasta', hasta);
  const r = await fetch(`/api/tenants/${_mandTenantId}/reporte-reparto?${params}`);
  const tbody = document.getElementById('rep-tbody');
  if (!r.ok) { tbody.innerHTML='<tr><td colspan="6" class="empty">Error al cargar</td></tr>'; return; }
  const data = await r.json();
  if (!data.length) { tbody.innerHTML='<tr><td colspan="6" class="empty">Sin datos para el periodo seleccionado</td></tr>'; return; }
  tbody.innerHTML = data.map(d => `
    <tr>
      <td>${esc(d.nombre)}${d.activo ? '' : ' <span class="badge badge-gray" style="font-size:10px">Pausado</span>'}</td>
      <td>${d.total_entregas}</td>
      <td>${d.confirmadas}</td>
      <td>${d.timeouts}</td>
      <td>${d.promedio_min_periodo != null ? d.promedio_min_periodo+' min' : '—'}</td>
      <td>${d.promedio_global != null ? d.promedio_global+' min' : '—'}</td>
    </tr>`).join('');
}

async function loadHistorialReparto() {
  if (!_mandTenantId) return toast('Selecciona un negocio','err');
  const repId  = document.getElementById('hist-rep').value   || '';
  const desde  = document.getElementById('hist-desde').value || '';
  const hasta  = document.getElementById('hist-hasta').value  || '';
  const params = new URLSearchParams();
  if (repId) params.set('repartidor_id', repId);
  if (desde) params.set('desde', desde);
  if (hasta)  params.set('hasta', hasta);
  const r = await fetch(`/api/tenants/${_mandTenantId}/entregas-historial?${params}`);
  const tbody = document.getElementById('hist-tbody');
  if (!r.ok) { tbody.innerHTML='<tr><td colspan="6" class="empty">Error al cargar</td></tr>'; return; }
  const data = await r.json();
  if (!data.length) { tbody.innerHTML='<tr><td colspan="6" class="empty">Sin entregas para los filtros seleccionados</td></tr>'; return; }
  tbody.innerHTML = data.map(d => `
    <tr>
      <td>${d.fecha}</td>
      <td>${esc(d.repartidor_nombre)}</td>
      <td>${d.pedido_id ? '#'+d.pedido_id : '—'}</td>
      <td>${esc(d.colonia || '—')}</td>
      <td>${d.minutos != null ? d.minutos+' min' : '—'}</td>
      <td>${d.confirmado ? '<span class="badge badge-green">Confirmada</span>' : '<span class="badge badge-gray">Timeout</span>'}</td>
    </tr>`).join('');
}
