async function loadDashboard() {
  const r = await fetch('/api/dashboard'); if(!r.ok) return;
  const data = await r.json();
  const el = document.getElementById('dashboard-cards');
  if (!data.length) { el.innerHTML = '<div class="empty">No hay negocios registrados</div>'; return; }
  el.innerHTML = data.map(t => {
    const s = t.stats || {};
    const _BE = {activo:'badge-green',pausado:'badge-yellow',inactivo:'badge-gray'};
    const _BL = {activo:'Activo',pausado:'En pausa',inactivo:'Inactivo'};
    const badge = `<span class="badge ${_BE[t.bot_estado]||'badge-gray'}">${_BL[t.bot_estado]||'Inactivo'}</span>`;
    const plan = `<span class="badge badge-blue">${t.plan}</span>`;
    return `<div class="card">
      <div class="card-header"><div class="card-title">${esc(s.nombre_negocio||t.nombre)}</div>${badge}</div>
      <div style="display:flex;gap:6px;margin-bottom:10px">${plan}</div>
      <div class="stat-row">Pedidos hoy <span>${s.pedidos_hoy||0}</span></div>
      <div class="stat-row">Confirmados hoy <span>${s.confirmados_hoy||0}</span></div>
      <div class="stat-row">Ventas hoy <span>$${s.ventas_hoy||0}</span></div>
      <div class="stat-row">Pendientes <span style="${(s.pendientes||0)>0?'color:var(--yellow)':''}">${s.pendientes||0}</span></div>
      <div class="stat-row">Sesiones activas <span>${s.sesiones_activas||0}</span></div>
      <div class="stat-row">Clientes totales <span>${s.total_clientes||0}</span></div>
      ${s.error?`<div style="color:var(--red);font-size:11px;margin-top:8px">⚠️ ${esc(s.error)}</div>`:''}
      <div style="margin-top:12px;font-size:11px;color:var(--muted2)">${esc(t.ciudad)}, ${esc(t.estado)} · Puerto ${Number(t.panel_port)||'—'}</div>
    </div>`;
  }).join('');
}
