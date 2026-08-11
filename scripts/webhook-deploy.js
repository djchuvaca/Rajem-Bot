require('dotenv').config({ path: require('path').resolve(__dirname, '../.env') });

const http   = require('http');
const crypto = require('crypto');
const { exec } = require('child_process');
const path   = require('path');

const PORT       = process.env.WEBHOOK_PORT   || 4000;
const SECRET     = process.env.WEBHOOK_SECRET || '';
const PROJECT    = path.resolve(__dirname, '..');

function verificarFirma(payload, firma) {
  if (!SECRET) return true;
  const digest = 'sha256=' + crypto.createHmac('sha256', SECRET).update(payload).digest('hex');
  try { return crypto.timingSafeEqual(Buffer.from(digest), Buffer.from(firma)); } catch { return false; }
}

const server = http.createServer((req, res) => {
  if (req.method !== 'POST' || req.url !== '/deploy') {
    res.writeHead(404); res.end('Not found'); return;
  }

  let body = '';
  req.on('data', chunk => body += chunk);
  req.on('end', () => {
    const firma = req.headers['x-hub-signature-256'] || '';

    if (SECRET && !verificarFirma(body, firma)) {
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
  });
});

server.listen(PORT, () => console.log(`[webhook] Escuchando en puerto ${PORT}`));
