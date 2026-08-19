async function doLogin() {
  const u = document.getElementById('sa-user').value;
  const p = document.getElementById('sa-pass').value;
  const r = await fetch('/api/login', { method:'POST', headers:{'Content-Type':'application/json'}, body:JSON.stringify({usuario:u,password:p}) });
  if (r.ok) {
    document.getElementById('login-screen').style.display = 'none';
    document.getElementById('app').style.display = 'flex';
    document.getElementById('sa-user-label').textContent = u;
    loadDashboard(); populateTenantSelects(); loadGlobalConfig();
    _restoreSection();
  } else {
    const e = await r.json();
    const el = document.getElementById('login-error');
    el.textContent = e.error; el.style.display = 'block';
  }
}

async function doLogout() {
  await fetch('/api/logout', {method:'POST'});
  location.reload();
}

function showSection(name) {
  document.querySelectorAll('.section').forEach(s => s.classList.remove('active'));
  document.querySelectorAll('.nav-item').forEach(n => n.classList.remove('active'));
  document.getElementById('sec-'+name).classList.add('active');
  document.querySelector(`[data-s="${name}"]`).classList.add('active');
  history.replaceState(null, '', '#' + name);
}

function _restoreSection() {
  const name = location.hash.slice(1);
  if (name && document.getElementById('sec-' + name)) showSection(name);
}

document.getElementById('sa-pass').addEventListener('keydown', e => { if(e.key==='Enter') doLogin(); });

// Auto-check session
fetch('/api/me').then(r => {
  if (r.ok) r.json().then(d => {
    document.getElementById('login-screen').style.display = 'none';
    document.getElementById('app').style.display = 'flex';
    document.getElementById('sa-user-label').textContent = d.usuario;
    loadDashboard(); populateTenantSelects(); loadGlobalConfig();
    _restoreSection();
  });
});
