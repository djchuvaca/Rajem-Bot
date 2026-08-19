async function loadGlobalConfig() {
  const r=await fetch('/api/global-config'); if(!r.ok) return;
  const data=await r.json();
  const m=Object.fromEntries(data.map(d=>[d.clave,d.valor]));
  document.getElementById('g-appurl').value=m.app_url||'';
  document.getElementById('g-mandaditos').value=m.grupo_mandaditos_id||'';
  document.getElementById('g-sentry').value=m.sentry_dsn||'';
  const groqEl=document.getElementById('g-groq');
  groqEl.value='';
  groqEl.placeholder=m.groq_api_key?'Configurada — dejar vacío para conservar':'gsk_… — dejar vacío para desactivar';
}

async function saveGlobalConfig() {
  const groqVal=document.getElementById('g-groq').value.trim();
  const config={app_url:document.getElementById('g-appurl').value.trim(),grupo_mandaditos_id:document.getElementById('g-mandaditos').value.trim(),sentry_dsn:document.getElementById('g-sentry').value.trim()};
  if(groqVal) config.groq_api_key=groqVal;
  const r=await fetch('/api/global-config/bulk',{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify({config})});
  if(r.ok){toast('Config global guardada');loadGlobalConfig();}else toast('Error','err');
}

async function cambiarPassword() {
  const actual=document.getElementById('g-pass-actual').value;
  const nueva=document.getElementById('g-pass-nueva').value;
  if(!nueva||nueva.length<12){toast('La nueva contraseña debe tener al menos 12 caracteres','err');return;}
  const r=await fetch('/api/cambiar-password',{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify({password_actual:actual,password_nuevo:nueva})});
  if(r.ok){document.getElementById('g-pass-actual').value='';document.getElementById('g-pass-nueva').value='';toast('Contraseña actualizada');}
  else toast('Contraseña actual incorrecta','err');
}
