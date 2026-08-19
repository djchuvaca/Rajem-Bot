let _tcConfig = {};
let _tcMap = null, _tcMarker = null;
let _tcUsuarioOriginal = '';
let _tcPendingSave = null;

async function loadTenantConfig() {
  const id=document.getElementById('tc-tenant-select').value;
  if(!id){document.getElementById('tc-content').style.display='none';return;}
  _tcTenant=id;
  const r=await fetch(`/api/tenants/${id}/config`); if(!r.ok) return;
  _tcConfig=await r.json();
  document.getElementById('tc-content').style.display='block';
  loadTenantCatalogo();
  const credResp=await fetch(`/api/tenants/${id}/panel-credentials`);
  const cred=credResp.ok ? await credResp.json() : {usuario:''};
  _tcUsuarioOriginal=cred.usuario||'';
  document.getElementById('tc-panel-usuario').value=_tcUsuarioOriginal;
  document.getElementById('tc-panel-password').value='';

  const modalidad = _tcConfig.notif_modalidad || 'grupo';
  document.getElementById('tc-modalidad').value = modalidad;
  document.getElementById('tc-grupo-id').value  = _tcConfig.grupo_id || '';
  document.getElementById('tc-autochat-jid').value = _tcConfig.notif_autochat_jid || '';
  const jidPrivado = _tcConfig.notif_privado_jid || '';
  const telMatch   = jidPrivado.match(/521(\d{10})@c\.us/);
  document.getElementById('tc-privado-tel').value = telMatch ? telMatch[1] : '';
  document.getElementById('tc-privado-jid').value = jidPrivado;
  if(jidPrivado) document.getElementById('tc-privado-jid-preview').textContent = `JID: ${jidPrivado}`;
  toggleNotifJIDField();
  document.getElementById('tc-timeout-rec').value=_tcConfig.timeout_recordatorio_min||'20';
  document.getElementById('tc-timeout-ses').value=_tcConfig.timeout_sesion_min||'35';
  document.getElementById('tc-tipo-servicio').value=_tcConfig.tipo_servicio||'ambos';
  document.getElementById('tc-seccion-taqueria').value=_tcConfig.seccion_taqueria||'ambas';
  document.getElementById('tc-negocio-calle').value=_tcConfig.negocio_calle||'';
  document.getElementById('tc-negocio-colonia').value=_tcConfig.negocio_colonia||'';
  document.getElementById('tc-negocio-referencia').value=_tcConfig.negocio_referencia||'';
  document.getElementById('tc-lat').value=_tcConfig.negocio_lat||'';
  document.getElementById('tc-lon').value=_tcConfig.negocio_lon||'';
  document.getElementById('tc-geo-aprox').checked=_tcConfig.geo_tarifa_aproximada==='1';
  document.getElementById('tc-pasarela').value=_tcConfig.pasarela_activa||'';
  document.getElementById('tc-public-url').value=_tcConfig.public_url||'';
  renderPasarelaFields();
  setTimeout(()=>{
    if(!_tcMap){
      _tcMap=L.map('tc-mini-mapa').setView([21.51,-104.89],12);
      L.tileLayer('https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png',{attribution:'© OSM'}).addTo(_tcMap);
      _tcMap.on('click',e=>{
        document.getElementById('tc-lat').value=e.latlng.lat.toFixed(7);
        document.getElementById('tc-lon').value=e.latlng.lng.toFixed(7);
        if(_tcMarker)_tcMarker.setLatLng(e.latlng); else _tcMarker=L.marker(e.latlng).addTo(_tcMap);
      });
    } else _tcMap.invalidateSize();
    const lat=parseFloat(_tcConfig.negocio_lat); const lon=parseFloat(_tcConfig.negocio_lon);
    if(!isNaN(lat)&&!isNaN(lon)){
      _tcMap.setView([lat,lon],14);
      if(_tcMarker)_tcMarker.setLatLng([lat,lon]); else _tcMarker=L.marker([lat,lon]).addTo(_tcMap);
    }
  },200);
}

async function loadTenantCatalogo(){
  const giroEl=document.getElementById('tc-catalogo-giro');
  const formatosEl=document.getElementById('tc-formatos-list');
  const productosEl=document.getElementById('tc-productos-list');
  if(!_tcTenant||!giroEl||!formatosEl||!productosEl)return;
  formatosEl.innerHTML=productosEl.innerHTML='<div class="empty">Cargando catálogo…</div>';
  const r=await fetch(`/api/tenants/${_tcTenant}/catalogo`);
  if(!r.ok){formatosEl.innerHTML=productosEl.innerHTML='<div class="empty">No se pudo cargar el catálogo</div>';return;}
  const c=await r.json();
  const todos=[...(c.formatos||[]),...(c.cortes||[]),...(c.bebidas||[]),...(c.salsas||[])];
  const habilitados=todos.filter(x=>x.activo).length;
  giroEl.innerHTML=`<div class="catalog-hero">
    <div class="catalog-hero-main"><div class="catalog-hero-icon">${c.giro?.emoji||'🏪'}</div><div><div class="catalog-hero-name">${esc(c.giro?.nombre||c.giro?.slug||'Giro')}</div><div class="catalog-hero-sub">Catálogo maestro asignado a este tenant</div></div></div>
    <span class="badge badge-green">${habilitados} de ${todos.length} habilitados</span>
  </div>`;
  const fila=(tipo,item)=>`<div class="catalog-item ${item.activo?'is-on':'is-off'}">
    <div class="catalog-item-copy"><div class="catalog-item-name">${item.emoji||''} ${esc(item.nombre||item.slug)}</div>${item.descripcion?`<div class="catalog-item-desc">${esc(item.descripcion)}</div>`:''}<div class="catalog-item-state ${item.activo?'on':'off'}">${item.activo?'● Habilitado':'○ Deshabilitado'}</div></div>
    <label class="toggle" title="${item.activo?'Deshabilitar':'Habilitar'}"><input type="checkbox" ${item.activo?'checked':''}
      onchange="toggleTenantCatalogo('${tipo}','${encodeURIComponent(item.slug)}',${item.id||0},this)"><span class="toggle-slider"></span></label>
  </div>`;
  const bloque=(tipo,icono,titulo,subtitulo,items)=>{
    const lista=items||[], activos=lista.filter(x=>x.activo).length;
    return `<div class="catalog-section"><div class="catalog-section-head"><div><div class="catalog-section-title">${icono} ${titulo}</div>${subtitulo?`<div style="font-size:10px;color:var(--muted);margin-top:2px">${subtitulo}</div>`:''}</div><span class="catalog-section-meta">${activos}/${lista.length} habilitados</span></div><div class="catalog-grid">${lista.map(x=>fila(tipo,x)).join('')||'<div class="empty">Sin elementos en este Giro</div>'}</div></div>`;
  };
  formatosEl.innerHTML=bloque('formato','🍽️','Formatos de venta','Presentaciones permitidas para este negocio',c.formatos);
  const cortes=c.cortes||[];
  const esTaqueria=c.giro?.slug==='taqueria';
  const gruposCortes=esTaqueria
    ? [
        ['corte','🐷','Taquería de carnitas','Cortes y especialidades de carnitas',cortes.filter(x=>x.seccion==='carnitas')],
        ['corte','🔥','Taquería de asada y trompo','Carnes asadas, al pastor y combinaciones',cortes.filter(x=>x.seccion==='asada')],
      ]
    : [['corte','🍴','Productos principales','Productos definidos por el Giro',cortes]];
  productosEl.innerHTML=[
    ...gruposCortes.map(g=>bloque(...g)),
    bloque('refresco','🥤','Bebidas','Bebidas disponibles para habilitar',c.bebidas),
    bloque('salsa','🌶️','Salsas y complementos','Extras definidos por el Giro',c.salsas),
  ].join('');
}

async function toggleTenantCatalogo(tipo,slug,id,input){
  slug=decodeURIComponent(slug);
  const activo=input.checked;
  input.disabled=true;
  const url=tipo==='formato'
    ? `/api/tenants/${_tcTenant}/catalogo/formatos/${id}`
    : `/api/tenants/${_tcTenant}/catalogo/productos`;
  const body=tipo==='formato'?{activo}:{categoria:tipo,producto_slug:slug,activo};
  const r=await fetch(url,{method:'PUT',headers:{'Content-Type':'application/json'},body:JSON.stringify(body)});
  input.disabled=false;
  if(!r.ok){input.checked=!activo;const e=await r.json().catch(()=>({}));toast(e.error||'No se pudo actualizar','err');return;}
  toast(activo?'Elemento habilitado':'Elemento deshabilitado');
  loadTenantCatalogo();
}

function renderPasarelaFields() {
  const p=document.getElementById('tc-pasarela').value;
  let cfg={};
  try{ cfg=JSON.parse(_tcConfig.pasarela_config||'{}'); }catch(_){}
  const el=document.getElementById('tc-pasarela-fields');
  const toggleBtn=(id)=>`<button class="btn btn-secondary btn-sm" style="margin-top:4px" onclick="const e=document.getElementById('${id}');e.type=e.type==='password'?'text':'password'">👁</button>`;
  const baseUrl=document.getElementById('tc-public-url')?.value.trim()||'[URL pública del tenant]';
  if(p==='mercadopago'){
    el.innerHTML=`<div class="form-group"><label>Access Token (APP_USR-…)</label><input id="tc-mp-token" type="password" value="" placeholder="${cfg.access_token==='__KEEP__'?'Configurado — dejar vacío para conservar':'Sin configurar'}">${toggleBtn('tc-mp-token')}</div>`;
  } else if(p==='stripe'){
    el.innerHTML=`
      <div class="form-group"><label>Secret Key (sk_live_… / sk_test_…)</label><input id="tc-stripe-key" type="password" value="" placeholder="${cfg.secret_key==='__KEEP__'?'Configurada — dejar vacío para conservar':'Sin configurar'}">${toggleBtn('tc-stripe-key')}</div>
      <div class="form-group"><label>Webhook Secret (whsec_…)</label><input id="tc-stripe-wsecret" type="password" value="" placeholder="${cfg.webhook_secret==='__KEEP__'?'Configurado — dejar vacío para conservar':'Sin configurar'}">${toggleBtn('tc-stripe-wsecret')}</div>
      <small style="color:var(--muted)">URL webhook: <code>${baseUrl}/webhook/stripe</code></small>`;
  } else if(p==='conekta'){
    el.innerHTML=`
      <div class="form-group"><label>Private Key (key_…)</label><input id="tc-conekta-key" type="password" value="" placeholder="${cfg.private_key==='__KEEP__'?'Configurada — dejar vacío para conservar':'Sin configurar'}">${toggleBtn('tc-conekta-key')}</div>
      <small style="color:var(--muted)">URL webhook: <code>${baseUrl}/webhook/conekta</code></small>`;
  } else { el.innerHTML=''; }
}

async function saveTenantConfig() {
  if(!_tcTenant){toast('Selecciona un negocio','err');return;}
  const modalidad = document.getElementById('tc-modalidad').value;
  if(modalidad==='grupo' && !document.getElementById('tc-grupo-id').value.trim()){
    toast('Selecciona o escribe el JID del grupo','err'); return;
  }
  if(modalidad==='privado' && !document.getElementById('tc-privado-jid').value.trim()){
    toast('Ingresa 10 dígitos para generar el JID privado','err'); return;
  }
  const pasarela=document.getElementById('tc-pasarela').value;
  let pasarelaConfig='{}';
  if(pasarela==='mercadopago'){
    const token=document.getElementById('tc-mp-token')?.value||'';
    pasarelaConfig=JSON.stringify({access_token:token||'__KEEP__'});
  } else if(pasarela==='stripe'){
    const key=document.getElementById('tc-stripe-key')?.value||'';
    const wsecret=document.getElementById('tc-stripe-wsecret')?.value||'';
    pasarelaConfig=JSON.stringify({secret_key:key||'__KEEP__',webhook_secret:wsecret||'__KEEP__'});
  } else if(pasarela==='conekta'){
    const key=document.getElementById('tc-conekta-key')?.value||'';
    pasarelaConfig=JSON.stringify({private_key:key||'__KEEP__'});
  }
  const config={
    grupo_id:          document.getElementById('tc-grupo-id').value.trim(),
    notif_modalidad:   modalidad,
    notif_privado_jid: document.getElementById('tc-privado-jid').value.trim(),
    timeout_recordatorio_min: document.getElementById('tc-timeout-rec').value,
    timeout_sesion_min:       document.getElementById('tc-timeout-ses').value,
    tipo_servicio:     document.getElementById('tc-tipo-servicio').value,
    seccion_taqueria:  document.getElementById('tc-seccion-taqueria').value,
    negocio_calle:      document.getElementById('tc-negocio-calle').value.trim(),
    negocio_colonia:    document.getElementById('tc-negocio-colonia').value.trim(),
    negocio_referencia: document.getElementById('tc-negocio-referencia').value.trim(),
    negocio_lat:            document.getElementById('tc-lat').value,
    negocio_lon:            document.getElementById('tc-lon').value,
    geo_tarifa_aproximada:  document.getElementById('tc-geo-aprox').checked ? '1' : '0',
    pasarela_activa:   pasarela,
    pasarela_config:   pasarelaConfig,
    public_url:        document.getElementById('tc-public-url').value.trim().replace(/\/$/,''),
  };
  const usuario=document.getElementById('tc-panel-usuario').value.trim();
  const passwordNuevo=document.getElementById('tc-panel-password').value;
  if(!/^[a-zA-Z0-9._-]{3,50}$/.test(usuario)){toast('Usuario inválido: usa de 3 a 50 letras, números, punto, guion o guion bajo','err');return;}
  if(passwordNuevo && passwordNuevo.length<12){toast('La contraseña nueva debe tener al menos 12 caracteres','err');return;}
  const credencialesModificadas=usuario!==_tcUsuarioOriginal || passwordNuevo.length>0;
  if(credencialesModificadas){
    _tcPendingSave={config,usuario,passwordNuevo};
    const cambios=[];
    if(usuario!==_tcUsuarioOriginal) cambios.push(`Usuario: ${_tcUsuarioOriginal} → ${usuario}`);
    if(passwordNuevo) cambios.push('Contraseña: será reemplazada por una nueva');
    document.getElementById('tc-cred-resumen').textContent=cambios.join(' · ');
    document.getElementById('tc-cred-confirmar').checked=false;
    document.getElementById('tc-cred-superadmin-password').value='';
    document.getElementById('tc-cred-btn').disabled=true;
    openModal('modal-credenciales-tenant');
    return;
  }
  await guardarConfigTenant(config);
}

async function guardarConfigTenant(config){
  const r=await fetch(`/api/tenants/${_tcTenant}/config/bulk`,{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify({config})});
  if(r.ok){toast('Configuración guardada');return true;}
  const e=await r.json().catch(()=>({})); toast(e.error||'Error al guardar','err'); return false;
}

function cancelarCambioCredenciales(){
  _tcPendingSave=null;
  closeModal('modal-credenciales-tenant');
}

async function confirmarCambioCredenciales(){
  if(!_tcPendingSave || !document.getElementById('tc-cred-confirmar').checked) return;
  const pendiente=_tcPendingSave;
  const superadminPassword=document.getElementById('tc-cred-superadmin-password').value;
  if(!superadminPassword){toast('Ingresa tu contraseña de superadmin para autorizar','err');return;}
  const btn=document.getElementById('tc-cred-btn');
  btn.disabled=true;
  const r=await fetch(`/api/tenants/${_tcTenant}/panel-credentials`,{
    method:'PUT',headers:{'Content-Type':'application/json'},
    body:JSON.stringify({usuario:pendiente.usuario,password_nuevo:pendiente.passwordNuevo,autorizado:true,superadmin_password:superadminPassword})
  });
  if(!r.ok){
    const e=await r.json().catch(()=>({}));
    toast(e.error||'No se pudieron cambiar las credenciales','err');
    btn.disabled=false; return;
  }
  const configOk=await guardarConfigTenant(pendiente.config);
  if(!configOk){btn.disabled=false;return;}
  _tcUsuarioOriginal=pendiente.usuario;
  document.getElementById('tc-panel-password').value='';
  _tcPendingSave=null;
  closeModal('modal-credenciales-tenant');
  toast('Configuración y acceso del tenant actualizados');
}
