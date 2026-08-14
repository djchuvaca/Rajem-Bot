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
  getAppUrl, getGrupoMandaditosGlobal,
} = require('../db/admin');
const SqliteSessionStore = require('../db/session-store');
const geoTepic = require('../geo/geotepic');

const {
  getTenants, getTenant, upsertTenant, deleteTenant,
  getTenantStats, getTenantConfig, setTenantConfig, setTenantConfigBulk,
  getTenantPanelUsuario, updateTenantPanelCredentials,
  getTenantPedidos,
  getTenantZonas, setTenantZonas, getTenantQR, getTenantBotEstado,
  getTenantSolicitudesGeo, updateTenantSolicitudGeo, applyTenantGeoSolicitud,
  getTenantPlan, setTenantPlan,
  getTenantRepartidores, updateTenantRepartidor, deleteTenantRepartidor,
  getTenantMandaditosConfig, setTenantMandaditosConfig,
  getTenantEntregasHistorial, getTenantReporteReparto,
} = require('./tenant-reader');

const _loginAttempts = new Map();

const _superadminSecret = process.env.SUPERADMIN_SECRET;
if (process.env.NODE_ENV === 'production' && (!_superadminSecret || _superadminSecret.length < 32)) {
  throw new Error('SUPERADMIN_SECRET es obligatorio en producción y debe tener al menos 32 caracteres');
}
const app = express();
app.disable('x-powered-by');
app.use((_req, res, next) => {
  res.setHeader('X-Content-Type-Options', 'nosniff');
  res.setHeader('X-Frame-Options', 'DENY');
  res.setHeader('Referrer-Policy', 'same-origin');
  next();
});
app.use(express.json());
app.use(express.urlencoded({ extended: true }));
app.use(session({
  name:              'rajem.superadmin.sid',
  secret:            _superadminSecret || 'rajem-superadmin-secret-local-dev',
  resave:            false,
  saveUninitialized: false,
  store:             new SqliteSessionStore(() => getAdminDB()),
  cookie:            { maxAge: 8 * 60 * 60 * 1000, httpOnly: true, sameSite: 'lax', secure: process.env.COOKIE_SECURE === '1' },
}));
app.use(express.static(path.join(__dirname, 'public')));

app.use((req, res, next) => {
  if (!['POST', 'PUT', 'PATCH', 'DELETE'].includes(req.method)) return next();
  const origin = req.get('origin');
  if (!origin) return next();
  try {
    if (new URL(origin).host !== req.get('host')) return res.status(403).json({ error: 'Origen no permitido' });
  } catch (_) { return res.status(403).json({ error: 'Origen inválido' }); }
  next();
});

function requireAuth(req, res, next) {
  if (req.session?.usuario) return next();
  res.status(401).json({ error: 'No autorizado' });
}

function fechaLocalISO() {
  const ahora = new Date();
  return new Date(ahora.getTime() - ahora.getTimezoneOffset() * 60000).toISOString().slice(0, 10);
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
  if (typeof password_nuevo !== 'string' || password_nuevo.length < 12) return res.status(400).json({ error: 'La contraseña nueva debe tener al menos 12 caracteres' });
  updateSuperadminPassword(req.session.usuario, bcrypt.hashSync(password_nuevo, 10));
  res.json({ ok: true });
});

// ── DASHBOARD — todas los tenants ─────────────────────────────────────────────
app.get('/api/dashboard', requireAuth, (req, res) => {
  const tenants = getTenants();
  const data = tenants.map(t => ({
    ...t,
    plan:      t.plan || 'basico',
    bot_estado: getTenantBotEstado(t),
    stats:     getTenantStats(t),
  }));
  res.json(data);
});

// ── TENANTS CRUD ──────────────────────────────────────────────────────────────
app.get('/api/tenants', requireAuth, (req, res) => {
  res.json(getTenants().map(t => ({ ...t, bot_estado: getTenantBotEstado(t) })));
});

app.post('/api/tenants', requireAuth, (req, res) => {
  const { id, nombre, ciudad, estado, db_path, logs_path, panel_port, plan, desde, notas, business_type, seccion_taqueria } = req.body;
  if (!id || !nombre || !db_path) return res.status(400).json({ error: 'Faltan campos requeridos: id, nombre, db_path' });
  if (!/^[a-z0-9][a-z0-9-]{1,62}$/.test(id)) return res.status(400).json({ error: 'ID de tenant inválido' });
  if (getTenant(id)) return res.status(409).json({ error: 'El tenant ya existe' });
  const planValido = ['basico', 'plus', 'pro'].includes(plan) ? plan : 'basico';
  upsertTenant({ id, nombre, ciudad: ciudad || '', estado: estado || '', db_path, logs_path: logs_path || 'logs/', panel_port: parseInt(panel_port) || 3000, activo: true, plan: planValido, desde: desde || fechaLocalISO(), notas: notas || '', business_type: business_type || 'taqueria', seccion_taqueria: seccion_taqueria || null });
  // Sincronizar plan a la BD del tenant si ya existe
  const newTenant = getTenant(id);
  if (newTenant) try { setTenantPlan(newTenant, planValido); } catch (_) {}
  res.json({ ok: true });
});

app.put('/api/tenants/:id', requireAuth, (req, res) => {
  const tenant = getTenant(req.params.id);
  if (!tenant) return res.status(404).json({ error: 'Tenant no encontrado' });
  const allowed = ['nombre','ciudad','estado','plan','notas','business_type','seccion_taqueria','activo'];
  const cambios = Object.fromEntries(allowed.filter(k => req.body[k] !== undefined).map(k => [k, req.body[k]]));
  if (cambios.plan && !['basico','plus','pro'].includes(cambios.plan)) return res.status(400).json({ error: 'Plan inválido' });
  if (cambios.business_type && !['taqueria','pizzeria','hamburgueseria'].includes(cambios.business_type)) return res.status(400).json({ error: 'Giro inválido' });
  const actualizado = { ...tenant, ...cambios, id: req.params.id };
  if (cambios.plan && !setTenantConfig(tenant, 'plan_activo', cambios.plan)) return res.status(409).json({ error: 'No se pudo sincronizar el plan en la base del tenant' });
  const cfg = {};
  if (cambios.business_type) cfg.business_type_slug = cambios.business_type;
  if (cambios.seccion_taqueria !== undefined) cfg.seccion_taqueria = cambios.seccion_taqueria || '';
  if (Object.keys(cfg).length && !setTenantConfigBulk(tenant, cfg)) return res.status(409).json({ error: 'No se pudo sincronizar el giro en la base del tenant' });
  upsertTenant(actualizado);
  res.json({ ok: true });
});

app.delete('/api/tenants/:id', requireAuth, (req, res) => {
  res.status(410).json({ error: 'Usa la eliminación completa para evitar recursos huérfanos' });
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
    hostname: process.env.WEBHOOK_HOST || 'localhost',
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
    let salida = '';
    proxyRes.on('data', chunk => { salida += chunk.toString(); res.write(chunk); });
    proxyRes.on('end', () => {
      if (proxyRes.statusCode >= 200 && proxyRes.statusCode < 300 && /\[DONE:0\]/.test(salida)) deleteTenant(req.params.id);
      else res.write('\nEl registro se conserva porque la eliminación no terminó correctamente.\n');
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
  ok ? res.json({ ok: true }) : res.status(500).json({ error: 'No se pudo escribir en la base del tenant' });
});

// Guardar múltiples claves de config a la vez
app.post('/api/tenants/:id/config/bulk', requireAuth, (req, res) => {
  const tenant = getTenant(req.params.id);
  if (!tenant) return res.status(404).json({ error: 'Tenant no encontrado' });
  const { config } = req.body;
  if (!config || typeof config !== 'object') return res.status(400).json({ error: 'Formato inválido' });
  if (!setTenantConfigBulk(tenant, config)) return res.status(500).json({ error: 'No se pudo guardar la configuración de forma atómica' });
  res.json({ ok: true });
});

app.get('/api/tenants/:id/panel-credentials', requireAuth, (req, res) => {
  const tenant = getTenant(req.params.id);
  if (!tenant) return res.status(404).json({ error: 'Tenant no encontrado' });
  const credenciales = getTenantPanelUsuario(tenant);
  if (!credenciales) return res.status(404).json({ error: 'Usuario del panel no encontrado' });
  res.json({ usuario: credenciales.usuario, password_configurada: true });
});

app.put('/api/tenants/:id/panel-credentials', requireAuth, (req, res) => {
  const tenant = getTenant(req.params.id);
  if (!tenant) return res.status(404).json({ error: 'Tenant no encontrado' });
  const { usuario, password_nuevo, autorizado } = req.body;
  if (autorizado !== true) return res.status(403).json({ error: 'Debes autorizar expresamente el cambio de credenciales' });
  if (typeof usuario !== 'string' || !/^[a-zA-Z0-9._-]{3,50}$/.test(usuario.trim())) {
    return res.status(400).json({ error: 'El usuario debe tener entre 3 y 50 caracteres y usar solo letras, números, punto, guion o guion bajo' });
  }
  if (password_nuevo !== undefined && password_nuevo !== '' && (typeof password_nuevo !== 'string' || password_nuevo.length < 12)) {
    return res.status(400).json({ error: 'La contraseña nueva debe tener al menos 12 caracteres' });
  }
  const ok = updateTenantPanelCredentials(tenant, {
    usuario: usuario.trim(),
    passwordHash: password_nuevo ? bcrypt.hashSync(password_nuevo, 10) : null,
  });
  ok ? res.json({ ok: true }) : res.status(500).json({ error: 'No se pudieron actualizar las credenciales del tenant' });
});

// ── GEOTEPIC — diccionario maestro administrado exclusivamente aquí ──────────
app.get('/api/geo/tepic/colonias', requireAuth, (_req, res) => {
  try {
    geoTepic.inicializarDesdeTenants(getTenants());
    res.json(geoTepic.listarColonias({ incluirExcluidas: _req.query.incluir_excluidas === '1' }));
  } catch (e) { res.status(500).json({ error: e.message }); }
});

app.post('/api/geo/tepic/colonias', requireAuth, (req, res) => {
  try { res.json({ ok: true, id: geoTepic.guardarColonia(req.body) }); }
  catch (e) { res.status(400).json({ error: e.message }); }
});

app.put('/api/geo/tepic/colonias/:colId', requireAuth, (req, res) => {
  try { res.json({ ok: true, id: geoTepic.guardarColonia({ ...req.body, id: req.params.colId }) }); }
  catch (e) { res.status(400).json({ error: e.message }); }
});

app.delete('/api/geo/tepic/colonias/:colId', requireAuth, (req, res) => {
  try { res.json({ ok: geoTepic.eliminarColonia(req.params.colId) }); }
  catch (e) { res.status(400).json({ error: e.message }); }
});

app.post('/api/geo/tepic/colonias/:colId/restaurar', requireAuth, (req, res) => {
  try { res.json({ ok: geoTepic.restaurarColonia(req.params.colId) }); }
  catch (e) { res.status(400).json({ error: e.message }); }
});

app.get('/api/geo/tepic/auditoria', requireAuth, (req, res) => {
  try { res.json(geoTepic.listarAuditoria(req.query.limite)); }
  catch (e) { res.status(500).json({ error: e.message }); }
});

// Vista de soporte: definición maestra + activación particular del tenant Tepic.
app.get('/api/tenants/:id/colonias', requireAuth, (req, res) => {
  const tenant = getTenant(req.params.id);
  if (!tenant) return res.status(404).json({ error: 'Tenant no encontrado' });
  if (!geoTepic.esTenantTepic(tenant)) return res.status(403).json({ error: 'GeoTepic solo aplica a Tepic, Nayarit' });
  try {
    geoTepic.inicializarDesdeTenants(getTenants());
    res.json(geoTepic.listarParaTenant(tenant));
  } catch (e) { res.status(500).json({ error: e.message }); }
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
  if (zonas.some(z => !z.nombre_zona || !Number.isFinite(Number(z.distancia_max)) || !Number.isFinite(Number(z.tarifa)))) return res.status(400).json({ error: 'Hay zonas inválidas' });
  if (!setTenantZonas(tenant, zonas)) return res.status(500).json({ error: 'No se pudieron guardar las zonas' });
  res.json({ ok: true });
});

// ── PLAN DE MEMBRESÍA POR TENANT ─────────────────────────────────────────────
app.get('/api/tenants/:id/plan', requireAuth, (req, res) => {
  const tenant = getTenant(req.params.id);
  if (!tenant) return res.status(404).json({ error: 'Tenant no encontrado' });
  res.json({ plan: getTenantPlan(tenant) });
});

app.put('/api/tenants/:id/plan', requireAuth, (req, res) => {
  const tenant = getTenant(req.params.id);
  if (!tenant) return res.status(404).json({ error: 'Tenant no encontrado' });
  const { plan } = req.body;
  const ok = setTenantPlan(tenant, plan);
  if (!['basico','plus','pro'].includes(plan)) return res.status(400).json({ error: 'Plan inválido. Valores permitidos: basico, plus, pro' });
  if (!ok) return res.status(500).json({ error: 'No se pudo sincronizar el plan en la base del tenant' });
  res.json({ ok: true, plan });
});

// ── SOLICITUDES GEO POR TENANT ────────────────────────────────────────────────
app.get('/api/tenants/:id/solicitudes-geo', requireAuth, (req, res) => {
  const tenant = getTenant(req.params.id);
  if (!tenant) return res.status(404).json({ error: 'Tenant no encontrado' });
  res.json(getTenantSolicitudesGeo(tenant));
});

app.post('/api/tenants/:id/solicitudes-geo/:solId/aprobar', requireAuth, (req, res) => {
  const tenant = getTenant(req.params.id);
  if (!tenant) return res.status(404).json({ error: 'Tenant no encontrado' });
  const solId = parseInt(req.params.solId);
  const { respuesta } = req.body;

  const solicitudes = getTenantSolicitudesGeo(tenant);
  const solicitud = solicitudes.find(s => s.id === solId);
  if (!solicitud) return res.status(404).json({ error: 'Solicitud no encontrada' });
  if (solicitud.estado !== 'pendiente') return res.status(409).json({ error: `La solicitud ya fue ${solicitud.estado}` });

  const aplicado = applyTenantGeoSolicitud(tenant, solicitud);
  if (!aplicado) return res.status(500).json({ error: 'No se pudo aplicar la configuración. Verifica que la BD del tenant esté accesible.' });

  if (!updateTenantSolicitudGeo(tenant, solId, { estado: 'aprobada', respuesta: respuesta || '' })) return res.status(500).json({ error: 'La configuración se aplicó, pero no se pudo cerrar la solicitud' });
  res.json({ ok: true });
});

app.post('/api/tenants/:id/solicitudes-geo/:solId/rechazar', requireAuth, (req, res) => {
  const tenant = getTenant(req.params.id);
  if (!tenant) return res.status(404).json({ error: 'Tenant no encontrado' });
  const solId = parseInt(req.params.solId);
  const { respuesta } = req.body;

  const solicitudes = getTenantSolicitudesGeo(tenant);
  const solicitud = solicitudes.find(s => s.id === solId);
  if (!solicitud) return res.status(404).json({ error: 'Solicitud no encontrada' });
  if (solicitud.estado !== 'pendiente') return res.status(409).json({ error: `La solicitud ya fue ${solicitud.estado}` });

  if (!updateTenantSolicitudGeo(tenant, solId, { estado: 'rechazada', respuesta: respuesta || '' })) return res.status(500).json({ error: 'No se pudo actualizar la solicitud' });
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

// El superadmin no comparte memoria con los bots: solo normaliza el JID.
app.post('/api/resolver-jid', requireAuth, (req, res) => {
  const { telefono } = req.body;
  if (!telefono) return res.status(400).json({ error: 'Falta telefono' });
  const numero = String(telefono).replace(/\D/g, '').slice(-10);
  if (!/^[2-9]\d{9}$/.test(numero)) return res.status(400).json({ error: 'Número mexicano inválido' });
  res.json({ jid: `521${numero}@c.us`, verificado: false, telefono: numero });
});

// ── PROVISIONAMIENTO DE NUEVO TENANT ─────────────────────────────────────────
// Retransmite la petición al webhook-deploy (que corre fuera de Docker en el host)
// y hace streaming de los logs de vuelta al navegador.
app.post('/api/provisionar', requireAuth, (req, res) => {
  const webhookPort = process.env.WEBHOOK_PORT || 4000;
  const secret      = process.env.WEBHOOK_SECRET || '';
  const reqBody = { ...req.body };
  const body = JSON.stringify(reqBody);

  res.setHeader('Content-Type', 'text/plain; charset=utf-8');
  res.setHeader('Transfer-Encoding', 'chunked');
  res.setHeader('Cache-Control', 'no-cache');
  res.setHeader('X-Accel-Buffering', 'no');

  const options = {
    hostname: process.env.WEBHOOK_HOST || 'localhost',
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

// ── MANDADITOS — REPARTIDORES ─────────────────────────────────────────────────
app.get('/api/tenants/:id/repartidores', requireAuth, (req, res) => {
  const tenant = getTenant(req.params.id);
  if (!tenant) return res.status(404).json({ error: 'Tenant no encontrado' });
  const reps = getTenantRepartidores(tenant).map(r => ({
    ...r,
    // Calcular minutos en ruta si está activo (el panel lo pide al refrescar)
    minutos_en_ruta: r.en_ruta && r.tiempo_ruta_inicio
      ? Math.round((Date.now() - new Date(r.tiempo_ruta_inicio).getTime()) / 60000)
      : null,
  }));
  res.json(reps);
});

app.put('/api/tenants/:id/repartidores/:repId', requireAuth, (req, res) => {
  const tenant = getTenant(req.params.id);
  if (!tenant) return res.status(404).json({ error: 'Tenant no encontrado' });
  const { nombre, activo } = req.body;
  const ok = updateTenantRepartidor(tenant, parseInt(req.params.repId), { nombre, activo });
  ok ? res.json({ ok: true }) : res.status(500).json({ error: 'Error al actualizar' });
});

app.delete('/api/tenants/:id/repartidores/:repId', requireAuth, (req, res) => {
  const tenant = getTenant(req.params.id);
  if (!tenant) return res.status(404).json({ error: 'Tenant no encontrado' });
  const ok = deleteTenantRepartidor(tenant, parseInt(req.params.repId));
  ok ? res.json({ ok: true }) : res.status(500).json({ error: 'Error al eliminar' });
});

app.get('/api/tenants/:id/mandaditos-config', requireAuth, (req, res) => {
  const tenant = getTenant(req.params.id);
  if (!tenant) return res.status(404).json({ error: 'Tenant no encontrado' });
  res.json(getTenantMandaditosConfig(tenant));
});

app.put('/api/tenants/:id/mandaditos-config', requireAuth, (req, res) => {
  const tenant = getTenant(req.params.id);
  if (!tenant) return res.status(404).json({ error: 'Tenant no encontrado' });
  const ok = setTenantMandaditosConfig(tenant, req.body);
  ok ? res.json({ ok: true }) : res.status(500).json({ error: 'Error al guardar' });
});

app.get('/api/tenants/:id/entregas-historial', requireAuth, (req, res) => {
  const tenant = getTenant(req.params.id);
  if (!tenant) return res.status(404).json({ error: 'Tenant no encontrado' });
  const { repartidor_id, desde, hasta } = req.query;
  res.json(getTenantEntregasHistorial(tenant, {
    repartidorId: repartidor_id ? parseInt(repartidor_id) : null,
    desde: desde || null,
    hasta: hasta || null,
  }));
});

app.get('/api/tenants/:id/reporte-reparto', requireAuth, (req, res) => {
  const tenant = getTenant(req.params.id);
  if (!tenant) return res.status(404).json({ error: 'Tenant no encontrado' });
  const { desde, hasta } = req.query;
  res.json(getTenantReporteReparto(tenant, { desde: desde || null, hasta: hasta || null }));
});

function startSuperAdmin(port = 3001) {
  // Inicializar admin.db al arrancar
  getAdminDB();
  const coloniasInicializadas = geoTepic.inicializarDesdeTenants(getTenants());
  if (coloniasInicializadas) console.log(`[GeoTepic] Catálogo maestro inicializado con ${coloniasInicializadas} colonias`);
  app.listen(port, '0.0.0.0', () => {
    console.log(`\n🔐 Super-admin corriendo en http://0.0.0.0:${port}`);
  });
}

module.exports = { startSuperAdmin };
