require('dotenv').config({ path: require('path').resolve(__dirname, '../.env') });

const http   = require('http');
const crypto = require('crypto');
const path   = require('path');
const { exec, spawn } = require('child_process');

const PORT    = process.env.WEBHOOK_PORT   || 4000;
const SECRET  = process.env.WEBHOOK_SECRET || '';
const PROJECT = path.resolve(__dirname, '..');

function leerBody(req) {
  return new Promise((resolve, reject) => {
    let body = '';
    req.on('data', chunk => body += chunk);
    req.on('end', () => resolve(body));
    req.on('error', reject);
  });
}

function verificarFirmaGitHub(payload, firma) {
  if (!SECRET) return true;
  const digest = 'sha256=' + crypto.createHmac('sha256', SECRET).update(payload).digest('hex');
  try { return crypto.timingSafeEqual(Buffer.from(digest), Buffer.from(firma)); } catch { return false; }
}

function verificarBearer(req) {
  if (!SECRET) return true;
  const auth = req.headers['authorization'] || '';
  return auth === `Bearer ${SECRET}`;
}

// ── /deploy — webhook de GitHub ───────────────────────────────────────────────
async function handleDeploy(req, res) {
  const body  = await leerBody(req);
  const firma = req.headers['x-hub-signature-256'] || '';

  if (SECRET && !verificarFirmaGitHub(body, firma)) {
    res.writeHead(401); res.end('Unauthorized');
    console.error('[webhook] Firma inválida — solicitud rechazada');
    return;
  }

  let payload;
  try { payload = JSON.parse(body); } catch {
    res.writeHead(400); res.end('Bad request'); return;
  }

  if (payload.ref !== 'refs/heads/main') {
    res.writeHead(200); res.end('Ignorado — no es rama main'); return;
  }

  res.writeHead(200); res.end('Deploy iniciado');

  // Analizar qué archivos cambiaron
  const changed = (payload.commits || [])
    .flatMap(c => [...(c.added || []), ...(c.removed || []), ...(c.modified || [])]);

  const needsNpmInstall  = changed.some(f => ['package.json', 'package-lock.json'].includes(f));
  const needsWebhookSelf = changed.includes('scripts/webhook-deploy.js');
  const onlyStatic       = changed.length > 0 && changed.every(f => f.startsWith('src/superadmin/public/'));

  // git pull siempre
  const cmds = [`cd ${PROJECT}`, 'git pull'];

  if (needsNpmInstall) {
    cmds.push('npm install --omit=dev --silent');
    console.log('[webhook] package.json cambió — npm install incluido');
  }

  if (!onlyStatic) {
    // Reiniciar superadmin y todos los bots de tenant (todos excepto webhook-deploy)
    cmds.push(
      `pm2 list --no-color 2>/dev/null | awk '/online|stopped|errored/{print $4}' | grep -v '^webhook-deploy$' | xargs -r pm2 restart 2>/dev/null || true`
    );
    console.log('[webhook] Reiniciando apps PM2 (excepto webhook-deploy)');
  } else {
    console.log('[webhook] Solo estáticos de superadmin — no se reinician procesos');
  }

  const cmd = cmds.join(' && ');
  console.log(`[webhook] Push de ${payload.pusher?.name || 'unknown'} — ejecutando: ${cmd}`);

  exec(cmd, { timeout: 300_000 }, (err, stdout, stderr) => {
    if (err) { console.error('[webhook] Error en deploy:', err.message); return; }
    if (stdout) console.log('[webhook]', stdout.trim());
    if (stderr) console.error('[webhook]', stderr.trim());
    console.log('[webhook] ✅ Deploy completado');
    // Reiniciar webhook-deploy al final si el propio script cambió
    if (needsWebhookSelf) {
      console.log('[webhook] Reiniciando webhook-deploy en 3s...');
      setTimeout(() => exec('pm2 restart webhook-deploy'), 3000);
    }
  });
}

// ── /provisionar — aprovisiona un nuevo tenant desde el super admin ───────────
async function handleProvisionar(req, res) {
  if (!verificarBearer(req)) {
    res.writeHead(401); res.end('Unauthorized'); return;
  }

  let data;
  try {
    const body = await leerBody(req);
    data = JSON.parse(body);
  } catch {
    res.writeHead(400); res.end('JSON inválido'); return;
  }

  if (!data.tenant_id) {
    res.writeHead(400); res.end('Faltan campos requeridos: tenant_id'); return;
  }

  // Respuesta en streaming (chunked) para que el super admin muestre logs en tiempo real
  res.writeHead(200, {
    'Content-Type':      'text/plain; charset=utf-8',
    'Transfer-Encoding': 'chunked',
    'Cache-Control':     'no-cache',
    'X-Accel-Buffering': 'no',
  });

  const env = {
    ...process.env,
    PROV_NON_INTERACTIVE: '1',
    TENANT_ID:            data.tenant_id,
    PROV_NOMBRE:          data.nombre       || data.tenant_id,
    PROV_CIUDAD:          data.ciudad       || '',
    PROV_ESTADO:          data.estado       || '',
    ...(data.panel_port ? { PROV_PANEL_PORT: String(data.panel_port) } : {}),
    ...(data.business_type    ? { PROV_BUSINESS_TYPE:    data.business_type    } : {}),
    ...(data.seccion_taqueria ? { PROV_SECCION_TAQUERIA: data.seccion_taqueria } : {}),
    PROV_GRUPO_ID:        data.grupo_id     || '',
    PROV_PANEL_SECRET:    data.panel_secret || '',
    PROV_PLAN:            data.plan         || 'basico',
    PROV_NOTAS:           data.notas        || '',
  };

  console.log(`[webhook] Provisionando tenant "${data.tenant_id}"...`);

  const proc = spawn('bash', [path.join(PROJECT, 'scripts/provisionar-tenant.sh')], {
    env,
    cwd: PROJECT,
  });

  const stripAnsi = s => s.toString().replace(/\x1b\[[0-9;]*m/g, '');
  proc.stdout.on('data', chunk => res.write(stripAnsi(chunk)));
  proc.stderr.on('data', chunk => res.write(stripAnsi(chunk)));
  proc.on('close', code => {
    console.log(`[webhook] Provisionamiento finalizado con código ${code}`);
    res.write(`\n[DONE:${code}]\n`);
    res.end();
  });
  proc.on('error', err => {
    console.error('[webhook] Error al ejecutar script:', err.message);
    res.write(`\n[ERROR: ${err.message}]\n`);
    res.end();
  });
}

// ── /eliminar — elimina un tenant del servidor ────────────────────────────────
async function handleEliminar(req, res) {
  if (!verificarBearer(req)) {
    res.writeHead(401); res.end('Unauthorized'); return;
  }

  let data;
  try {
    const body = await leerBody(req);
    data = JSON.parse(body);
  } catch {
    res.writeHead(400); res.end('JSON invalido'); return;
  }

  if (!data.tenant_id) {
    res.writeHead(400); res.end('Falta tenant_id'); return;
  }

  res.writeHead(200, {
    'Content-Type':      'text/plain; charset=utf-8',
    'Transfer-Encoding': 'chunked',
    'Cache-Control':     'no-cache',
    'X-Accel-Buffering': 'no',
  });

  const env = {
    ...process.env,
    TENANT_ID: data.tenant_id,
  };

  console.log(`[webhook] Eliminando tenant "${data.tenant_id}"...`);

  const proc = spawn('bash', [path.join(PROJECT, 'scripts/eliminar-tenant.sh')], {
    env,
    cwd: PROJECT,
  });

  const stripAnsi = s => s.toString().replace(/\x1b\[[0-9;]*m/g, '');
  proc.stdout.on('data', chunk => res.write(stripAnsi(chunk)));
  proc.stderr.on('data', chunk => res.write(stripAnsi(chunk)));
  proc.on('close', code => {
    console.log(`[webhook] Eliminacion finalizada con codigo ${code}`);
    res.write(`\n[DONE:${code}]\n`);
    res.end();
  });
  proc.on('error', err => {
    console.error('[webhook] Error al eliminar:', err.message);
    res.write(`\n[ERROR: ${err.message}]\n`);
    res.end();
  });
}

// ── Servidor HTTP ─────────────────────────────────────────────────────────────
const server = http.createServer((req, res) => {
  if      (req.method === 'GET'  && req.url === '/health')      { res.writeHead(200, { 'Content-Type': 'application/json' }); res.end(JSON.stringify({ status: 'ok', uptime: process.uptime() })); }
  else if (req.method === 'POST' && req.url === '/deploy')      handleDeploy(req, res).catch(e => { try { res.writeHead(500); res.end(e.message); } catch {} });
  else if (req.method === 'POST' && req.url === '/provisionar') handleProvisionar(req, res).catch(e => { try { res.writeHead(500); res.end(e.message); } catch {} });
  else if (req.method === 'POST' && req.url === '/eliminar')    handleEliminar(req, res).catch(e => { try { res.writeHead(500); res.end(e.message); } catch {} });
  else { res.writeHead(404); res.end('Not found'); }
});

server.listen(PORT, () => console.log(`[webhook] Escuchando en puerto ${PORT}`));
