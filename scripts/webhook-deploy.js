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
  console.log(`[webhook] Push de ${payload.pusher?.name || 'unknown'} — desplegando...`);

  exec(
    `cd ${PROJECT} && git pull && docker compose up -d --build`,
    { timeout: 300_000 },
    (err, stdout, stderr) => {
      if (err) { console.error('[webhook] Error en deploy:', err.message); return; }
      if (stdout) console.log('[webhook]', stdout.trim());
      if (stderr) console.error('[webhook]', stderr.trim());
      console.log('[webhook] ✅ Deploy completado');
    }
  );
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

  if (!data.tenant_id || !data.groq_key) {
    res.writeHead(400); res.end('Faltan campos requeridos: tenant_id, groq_key'); return;
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
    PROV_PANEL_PORT:      String(data.panel_port || 3002),
    PROV_GROQ_KEY:        data.groq_key,
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

  proc.stdout.on('data', chunk => res.write(chunk));
  proc.stderr.on('data', chunk => res.write(chunk));
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

// ── Servidor HTTP ─────────────────────────────────────────────────────────────
const server = http.createServer((req, res) => {
  if      (req.method === 'POST' && req.url === '/deploy')      handleDeploy(req, res).catch(e => { try { res.writeHead(500); res.end(e.message); } catch {} });
  else if (req.method === 'POST' && req.url === '/provisionar') handleProvisionar(req, res).catch(e => { try { res.writeHead(500); res.end(e.message); } catch {} });
  else { res.writeHead(404); res.end('Not found'); }
});

server.listen(PORT, () => console.log(`[webhook] Escuchando en puerto ${PORT}`));
