// src/superadmin/server.js
// Panel de super-administrador de Rajem's Technology.
// Puerto 3001, solo localhost. Auth separada de los paneles de negocio.

const express  = require('express');
const session  = require('express-session');
const bcrypt   = require('bcryptjs');
const path     = require('path');

const {
  getAdminDB, getGlobalConfig, setGlobalConfig, getAllGlobalConfig,
  getSuperadminUsuario, updateSuperadminPassword,
  getGroqApiKey, getGroqTimeoutMs, getGroqModelo, getAppUrl, getGrupoMandaditosGlobal,
} = require('../db/admin');
const SqliteSessionStore = require('../db/session-store');

const {
  getTenants, getTenant, upsertTenant, deleteTenant,
  getTenantStats, getTenantConfig, setTenantConfig,
  getTenantPedidos, getTenantColonias, setTenantColonia, deleteTenantColonia,
  getTenantZonas, setTenantZonas, getTenantQR, getTenantBotEstado,
} = require('./tenant-reader');

const _loginAttempts = new Map();

const app = express();
app.use(express.json());
app.use(express.urlencoded({ extended: true }));
app.use(session({
  name:              'rajem.superadmin.sid',
  secret:            process.env.SUPERADMIN_SECRET || 'rajem-superadmin-secret-2024',
  resave:            false,
  saveUninitialized: false,
  store:             new SqliteSessionStore(() => getAdminDB()),
  cookie:            { maxAge: 8 * 60 * 60 * 1000 },
}));
app.use(express.static(path.join(__dirname, 'public')));

function requireAuth(req, res, next) {
  if (req.session?.usuario) return next();
  res.status(401).json({ error: 'No autorizado' });
}

// ── AUTH ──────────────────────────────────────────────────────────────────────
app.post('/api/login', (req, res) => {
  const ip  = req.ip || 'unknown';
  const now = Date.now();
  const att = _loginAttempts.get(ip) || { count: 0, resetAt: now + 60_000 };
  if (now > att.resetAt) { att.count = 0; att.resetAt = now + 60_000; }
  if (att.count >= 5) return res.status(429).json({ error: 'Demasiados intentos. Espera 1 minuto.' });
  att.count++;
  _loginAttempts.set(ip, att);

  const { usuario, password } = req.body;
  const user = getSuperadminUsuario(usuario);
  if (!user || !bcrypt.compareSync(password, user.password))
    return res.status(401).json({ error: 'Usuario o contraseña incorrectos' });

  att.count = 0;
  req.session.usuario = usuario;
  res.json({ ok: true });
});

app.post('/api/logout', (req, res) => { req.session.destroy(); res.json({ ok: true }); });
app.get('/api/me', requireAuth, (req, res) => res.json({ usuario: req.session.usuario }));

app.post('/api/cambiar-password', requireAuth, (req, res) => {
  const { password_actual, password_nuevo } = req.body;
  const user = getSuperadminUsuario(req.session.usuario);
  if (!bcrypt.compareSync(password_actual, user.password))
    return res.status(400).json({ error: 'Contraseña actual incorrecta' });
  updateSuperadminPassword(req.session.usuario, bcrypt.hashSync(password_nuevo, 10));
  res.json({ ok: true });
});

// ── DASHBOARD — todas los tenants ─────────────────────────────────────────────
app.get('/api/dashboard', requireAuth, (req, res) => {
  const tenants = getTenants();
  const data = tenants.map(t => ({
    ...t,
    bot_estado: getTenantBotEstado(t),
    stats: getTenantStats(t),
  }));
  res.json(data);
});

// ── TENANTS CRUD ──────────────────────────────────────────────────────────────
app.get('/api/tenants', requireAuth, (req, res) => {
  res.json(getTenants().map(t => ({ ...t, bot_estado: getTenantBotEstado(t) })));
});

app.post('/api/tenants', requireAuth, (req, res) => {
  const { id, nombre, ciudad, estado, db_path, logs_path, panel_port, plan, desde, notas } = req.body;
  if (!id || !nombre || !db_path) return res.status(400).json({ error: 'Faltan campos requeridos: id, nombre, db_path' });
  upsertTenant({ id, nombre, ciudad: ciudad || '', estado: estado || '', db_path, logs_path: logs_path || 'logs/', panel_port: parseInt(panel_port) || 3000, activo: true, plan: plan || 'basico', desde: desde || new Date().toISOString().slice(0,10), notas: notas || '' });
  res.json({ ok: true });
});

app.put('/api/tenants/:id', requireAuth, (req, res) => {
  const tenant = getTenant(req.params.id);
  if (!tenant) return res.status(404).json({ error: 'Tenant no encontrado' });
  upsertTenant({ ...tenant, ...req.body, id: req.params.id });
  res.json({ ok: true });
});

app.delete('/api/tenants/:id', requireAuth, (req, res) => {
  deleteTenant(req.params.id);
  res.json({ ok: true });
});

// Eliminacion completa: baja contenedor, limpia compose y env (streaming)
app.post('/api/tenants/:id/eliminar', requireAuth, (req, res) => {
  const webhookPort = process.env.WEBHOOK_PORT || 4000;
  const secret      = process.env.WEBHOOK_SECRET || '';
  const body        = JSON.stringify({ tenant_id: req.params.id });

  res.setHeader('Content-Type', 'text/plain; charset=utf-8');
  res.setHeader('Transfer-Encoding', 'chunked');
  res.setHeader('Cache-Control', 'no-cache');
  res.setHeader('X-Accel-Buffering', 'no');

  const options = {
    hostname: process.env.WEBHOOK_HOST || 'host.docker.internal',
    port:     webhookPort,
    path:     '/eliminar',
    method:   'POST',
    headers: {
      'Content-Type':   'application/json',
      'Content-Length': Buffer.byteLength(body),
      ...(secret ? { 'Authorization': `Bearer ${secret}` } : {}),
    },
  };

  const http = require('http');
  const proxyReq = http.request(options, proxyRes => {
    proxyRes.on('data', chunk => res.write(chunk));
    proxyRes.on('end', () => {
      deleteTenant(req.params.id);
      res.end();
    });
  });
  proxyReq.on('error', err => {
    res.write(`\nError: webhook-deploy no responde en puerto ${webhookPort}.\n`);
    res.end();
  });
  proxyReq.write(body);
  proxyReq.end();
});

// ── STATS POR TENANT ──────────────────────────────────────────────────────────
app.get('/api/tenants/:id/stats', requireAuth, (req, res) => {
  const tenant = getTenant(req.params.id);
  if (!tenant) return res.status(404).json({ error: 'Tenant no encontrado' });
  res.json(getTenantStats(tenant));
});

app.get('/api/tenants/:id/pedidos', requireAuth, (req, res) => {
  const tenant = getTenant(req.params.id);
  if (!tenant) return res.status(404).json({ error: 'Tenant no encontrado' });
  const { desde, hasta, limit } = req.query;
  res.json(getTenantPedidos(tenant, { desde, hasta, limit: parseInt(limit) || 50 }));
});

// ── CONFIG TÉCNICA POR TENANT ─────────────────────────────────────────────────
app.get('/api/tenants/:id/config', requireAuth, (req, res) => {
  const tenant = getTenant(req.params.id);
  if (!tenant) return res.status(404).json({ error: 'Tenant no encontrado' });
  res.json(getTenantConfig(tenant));
});

app.post('/api/tenants/:id/config', requireAuth, (req, res) => {
  const tenant = getTenant(req.params.id);
  if (!tenant) return res.status(404).json({ error: 'Tenant no encontrado' });
  const { clave, valor } = req.body;
  if (!clave) return res.status(400).json({ error: 'Falta clave' });
  const ok = setTenantConfig(tenant, clave, valor);
  res.json({ ok });
});

// Guardar múltiples claves de config a la vez
app.post('/api/tenants/:id/config/bulk', requireAuth, (req, res) => {
  const tenant = getTenant(req.params.id);
  if (!tenant) return res.status(404).json({ error: 'Tenant no encontrado' });
  const { config } = req.body; // { clave: valor, ... }
  if (!config || typeof config !== 'object') return res.status(400).json({ error: 'Formato inválido' });
  for (const [clave, valor] of Object.entries(config)) {
    setTenantConfig(tenant, clave, valor);
  }
  res.json({ ok: true });
});

// ── COLONIAS POR TENANT ───────────────────────────────────────────────────────
app.get('/api/tenants/:id/colonias', requireAuth, (req, res) => {
  const tenant = getTenant(req.params.id);
  if (!tenant) return res.status(404).json({ error: 'Tenant no encontrado' });
  res.json(getTenantColonias(tenant));
});

app.post('/api/tenants/:id/colonias', requireAuth, (req, res) => {
  const tenant = getTenant(req.params.id);
  if (!tenant) return res.status(404).json({ error: 'Tenant no encontrado' });
  const { nombre, lat, lon, tipo, aliases } = req.body;
  if (!nombre || lat == null || lon == null) return res.status(400).json({ error: 'Faltan campos' });
  const slug = _toSlug(nombre);
  const ok = setTenantColonia(tenant, { nombre, lat: parseFloat(lat), lon: parseFloat(lon), tipo: tipo || _inferTipo(nombre), slug, aliases: aliases || [] });
  res.json({ ok });
});

app.put('/api/tenants/:id/colonias/:colId', requireAuth, (req, res) => {
  const tenant = getTenant(req.params.id);
  if (!tenant) return res.status(404).json({ error: 'Tenant no encontrado' });
  const { nombre, lat, lon, activo, tipo, aliases } = req.body;
  const slug = _toSlug(nombre);
  const ok = setTenantColonia(tenant, { id: parseInt(req.params.colId), nombre, lat: parseFloat(lat), lon: parseFloat(lon), activo: activo ?? 1, tipo: tipo || _inferTipo(nombre), slug, aliases: aliases || [] });
  res.json({ ok });
});

app.delete('/api/tenants/:id/colonias/:colId', requireAuth, (req, res) => {
  const tenant = getTenant(req.params.id);
  if (!tenant) return res.status(404).json({ error: 'Tenant no encontrado' });
  deleteTenantColonia(tenant, parseInt(req.params.colId));
  res.json({ ok: true });
});

// ── ZONAS DE TARIFA POR TENANT ────────────────────────────────────────────────
app.get('/api/tenants/:id/zonas', requireAuth, (req, res) => {
  const tenant = getTenant(req.params.id);
  if (!tenant) return res.status(404).json({ error: 'Tenant no encontrado' });
  res.json(getTenantZonas(tenant));
});

app.put('/api/tenants/:id/zonas', requireAuth, (req, res) => {
  const tenant = getTenant(req.params.id);
  if (!tenant) return res.status(404).json({ error: 'Tenant no encontrado' });
  const { zonas } = req.body;
  if (!Array.isArray(zonas)) return res.status(400).json({ error: 'Formato inválido' });
  setTenantZonas(tenant, zonas);
  res.json({ ok: true });
});

// ── CONFIG GLOBAL (IA, APP_URL, grupo_mandaditos, Sentry) ─────────────────────
app.get('/api/global-config', requireAuth, (req, res) => res.json(getAllGlobalConfig()));

app.post('/api/global-config', requireAuth, (req, res) => {
  const { clave, valor } = req.body;
  if (!clave) return res.status(400).json({ error: 'Falta clave' });
  setGlobalConfig(clave, valor ?? '');
  res.json({ ok: true });
});

app.post('/api/global-config/bulk', requireAuth, (req, res) => {
  const { config } = req.body;
  if (!config || typeof config !== 'object') return res.status(400).json({ error: 'Formato inválido' });
  for (const [clave, valor] of Object.entries(config)) setGlobalConfig(clave, valor ?? '');
  res.json({ ok: true });
});

// ── RESOLUCIÓN DE JIDs (usa el cliente WA del bot) ───────────────────────────
let _waClient = null;
function setWaClient(client) { _waClient = client; }

app.post('/api/resolver-jid', requireAuth, async (req, res) => {
  if (!_waClient) return res.status(503).json({ error: 'Bot de WhatsApp no conectado' });
  const { telefono } = req.body;
  if (!telefono) return res.status(400).json({ error: 'Falta telefono' });
  try {
    const numero = telefono.replace(/\D/g, '');
    const jid = `521${numero.slice(-10)}@c.us`;
    // Verificar que existe en WhatsApp
    const existe = await _waClient.isRegisteredUser(jid);
    res.json({ jid: existe ? jid : null, existe, telefono: numero.slice(-10) });
  } catch (e) {
    res.status(500).json({ error: e.message });
  }
});

app.get('/api/grupos-wa', requireAuth, async (req, res) => {
  if (!_waClient) return res.status(503).json({ error: 'Bot de WhatsApp no conectado' });
  try {
    const chats = await _waClient.getChats();
    const grupos = chats
      .filter(c => c.isGroup)
      .map(c => ({ id: c.id._serialized, nombre: c.name, participantes: c.participants?.length || 0 }))
      .slice(0, 50);
    res.json(grupos);
  } catch (e) {
    res.status(500).json({ error: e.message });
  }
});

// ── PROVISIONAMIENTO DE NUEVO TENANT ─────────────────────────────────────────
// Retransmite la petición al webhook-deploy (que corre fuera de Docker en el host)
// y hace streaming de los logs de vuelta al navegador.
app.post('/api/provisionar', requireAuth, (req, res) => {
  const webhookPort = process.env.WEBHOOK_PORT || 4000;
  const secret      = process.env.WEBHOOK_SECRET || '';
  // Inyectar GROQ key global si el cliente no la envía
  const reqBody = { ...req.body };
  if (!reqBody.groq_key) {
    const k = getGroqApiKey();
    if (k) reqBody.groq_key = k;
  }
  const body = JSON.stringify(reqBody);

  res.setHeader('Content-Type', 'text/plain; charset=utf-8');
  res.setHeader('Transfer-Encoding', 'chunked');
  res.setHeader('Cache-Control', 'no-cache');
  res.setHeader('X-Accel-Buffering', 'no');

  const options = {
    hostname: process.env.WEBHOOK_HOST || 'host.docker.internal',
    port:     webhookPort,
    path:     '/provisionar',
    method:   'POST',
    headers: {
      'Content-Type':   'application/json',
      'Content-Length': Buffer.byteLength(body),
      ...(secret ? { 'Authorization': `Bearer ${secret}` } : {}),
    },
  };

  const http = require('http');
  const proxyReq = http.request(options, proxyRes => {
    proxyRes.on('data', chunk => res.write(chunk));
    proxyRes.on('end',  ()    => res.end());
  });
  proxyReq.on('error', err => {
    res.write(`\nError: webhook-deploy no responde en puerto ${webhookPort}.\n`);
    res.write(`Verifica que esté corriendo: pm2 status\n`);
    res.end();
  });
  proxyReq.write(body);
  proxyReq.end();
});

// ── QR DE VINCULACIÓN POR TENANT ─────────────────────────────────────────────
// Lee qr_pendiente desde la BD del tenant (volumen compartido ./data).
// No requiere llamadas HTTP entre contenedores.
app.get('/api/tenants/:id/qr', requireAuth, (req, res) => {
  const tenant = getTenant(req.params.id);
  if (!tenant) return res.status(404).json({ error: 'Tenant no encontrado' });
  const qr = getTenantQR(tenant);
  if (!qr) return res.status(404).json({ error: 'Sin QR — el bot ya está autenticado o aún no ha iniciado' });
  res.json({ qr, ts: Date.now() });
});

// ── GRUPOS WA POR TENANT ──────────────────────────────────────────────────────
// Lee grupos_wa_cache desde la BD del tenant (se actualiza cuando el bot conecta).
app.get('/api/tenants/:id/grupos', requireAuth, (req, res) => {
  const tenant = getTenant(req.params.id);
  if (!tenant) return res.status(404).json({ error: 'Tenant no encontrado' });
  const cfg = getTenantConfig(tenant);
  try {
    const grupos = JSON.parse(cfg.grupos_wa_cache || '[]');
    res.json(grupos);
  } catch {
    res.json([]);
  }
});

// ── HEALTH ────────────────────────────────────────────────────────────────────
app.get('/health', (req, res) => {
  let dbOk = false;
  try { dbOk = !!getAdminDB().prepare('SELECT 1').get(); } catch (_) {}
  res.status(dbOk ? 200 : 503).json({ status: dbOk ? 'ok' : 'degraded', db: dbOk ? 'ok' : 'error' });
});

// ── HELPERS ───────────────────────────────────────────────────────────────────
function _toSlug(nombre) {
  return (nombre || '')
    .toLowerCase()
    .normalize('NFD').replace(/[̀-ͯ]/g, '')
    .replace(/\s+/g, '-')
    .replace(/[^a-z0-9-]/g, '')
    .replace(/-+/g, '-')
    .replace(/^-|-$/g, '');
}

function _inferTipo(nombre) {
  const n = nombre.toLowerCase();
  if (/infonavit/.test(n))                          return 'infonavit';
  if (/fovissste/.test(n))                          return 'fovissste';
  if (/^fracc|fraccionamiento/.test(n))             return 'fraccionamiento';
  if (/^residencial|residencial\s/.test(n))         return 'residencial';
  if (/^ampl|ampliaci[oó]n/.test(n))               return 'ampliacion';
  if (/^unidad\s/.test(n))                          return 'unidad';
  if (/^privada\s/.test(n))                         return 'privada';
  return 'colonia';
}

function startSuperAdmin(port = 3001, waClient = null) {
  if (waClient) _waClient = waClient;
  // Inicializar admin.db al arrancar
  getAdminDB();
  app.listen(port, '0.0.0.0', () => {
    console.log(`\n🔐 Super-admin corriendo en http://0.0.0.0:${port}`);
  });
}

module.exports = { startSuperAdmin, setWaClient };
