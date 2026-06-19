// scripts/ngrok-start.js
// Arranca ngrok, obtiene la URL pública, actualiza APP_URL en .env y luego inicia el bot.

const { spawn } = require('child_process');
const http = require('http');
const fs = require('fs');
const path = require('path');

const ENV_PATH = path.join(__dirname, '..', '.env');
const PUERTO = process.env.PANEL_PORT || 3000;

function obtenerUrlNgrok(intentosMax = 25) {
  return new Promise((resolve, reject) => {
    let intentos = 0;

    const intentar = () => {
      http.get('http://localhost:4040/api/tunnels', (res) => {
        let data = '';
        res.on('data', chunk => (data += chunk));
        res.on('end', () => {
          try {
            const json = JSON.parse(data);
            const tunnel = json.tunnels.find(t => t.proto === 'https');
            if (tunnel) return resolve(tunnel.public_url);
          } catch {}
          reintentar();
        });
      }).on('error', reintentar);
    };

    const reintentar = () => {
      if (++intentos >= intentosMax) {
        return reject(new Error('ngrok no respondió. Verifica que esté instalado y autenticado.'));
      }
      setTimeout(intentar, 1500);
    };

    // Esperar 2s para que ngrok levante antes del primer intento
    setTimeout(intentar, 2000);
  });
}

function actualizarEnv(url) {
  let contenido = fs.existsSync(ENV_PATH) ? fs.readFileSync(ENV_PATH, 'utf8') : '';

  if (/^APP_URL=.*/m.test(contenido)) {
    contenido = contenido.replace(/^APP_URL=.*/m, `APP_URL=${url}`);
  } else {
    contenido += `\nAPP_URL=${url}`;
  }

  fs.writeFileSync(ENV_PATH, contenido, 'utf8');
}

// ── Arrancar ngrok ──────────────────────────────────────────────────────────
console.log('[ngrok] Iniciando túnel en puerto', PUERTO, '...');

const ngrok = spawn('ngrok', ['http', String(PUERTO)], {
  stdio: ['ignore', 'ignore', 'pipe'],
});

ngrok.stderr.on('data', data => {
  const msg = data.toString().trim();
  if (msg) console.error('[ngrok]', msg);
});

ngrok.on('error', err => {
  console.error('[ngrok] No se pudo iniciar:', err.message);
  console.error('        Instala ngrok con: winget install ngrok.ngrok');
  console.error('        Luego autentica con: ngrok config add-authtoken TU_TOKEN');
  process.exit(1);
});

// ── Obtener URL → actualizar .env → iniciar bot ─────────────────────────────
obtenerUrlNgrok()
  .then(url => {
    actualizarEnv(url);
    console.log('[ngrok] URL pública:', url);
    console.log('[ngrok] APP_URL actualizada en .env');
    console.log('[bot]   Iniciando...\n');

    const bot = spawn('node', ['index.js'], {
      stdio: 'inherit',
      cwd: path.join(__dirname, '..'),
    });

    bot.on('close', code => {
      ngrok.kill();
      process.exit(code ?? 0);
    });
  })
  .catch(err => {
    console.error('[ngrok] Error:', err.message);
    ngrok.kill();
    process.exit(1);
  });

// Al cerrar con Ctrl+C, matar también ngrok
process.on('SIGINT', () => {
  ngrok.kill();
  process.exit(0);
});
