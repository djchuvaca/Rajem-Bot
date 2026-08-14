const express      = require("express");
const session      = require("express-session");
const bcrypt       = require("bcryptjs");
const path         = require("path");
const fs           = require("fs");
const {
  getUsuarioPanel, updatePasswordPanel,
  getAllConfig, setConfig,
  getHorarios, updateHorario,
  getBanco, updateBanco,
  getAllMensajes, setMensaje,
  getAllClientes, getCliente, updateClientePanel,
  getAllPedidos, getPedidosHoy, updatePedidoEstado,
  getConfig, guardarTelefonoReal, getJIDReal, getGrupoId, getNotifDestinoJID,
  getPedidosPorFecha, getStatsReporte, getTopClientes,
  getBusinessType, getBusinessTypeSlug,
  getItemTypes,
  invalidarCacheItemTypes,
} = require("../db");
const { queryOne, queryAll, run, getBsdb } = require("../db/core");
const SqliteSessionStore = require("../db/session-store");
const { invalidarCacheCortes } = require("../handlers/pedidoParser");
const { invalidarCacheColonias, invalidarCacheConfig } = require("../geo");
const geoTepic = require('../geo/geotepic');

const { getWhatsappClient, getStatusInfo, getQR } = require("./whatsapp-bridge");
const botPausado = require("../estado/bot-pausado");
const { actualizarEstadoPorId } = require("../db");
const mpPagos = require("../pagos");
const { despacharConDelay } = require("../handlers/mandaditos");
const catalogoTenant = require('../giros/catalogo-tenant');
const { getGiroActivo } = require('../giros');
const observabilidad = require('../db/observabilidad');

// Rate limiting para login (en memoria, se reinicia al reiniciar el servidor)
const _loginAttempts = new Map();

const app = express();
app.disable('x-powered-by');
if (process.env.TRUST_PROXY === '1') app.set('trust proxy', 1);
app.use((_req, res, next) => {
  res.setHeader('X-Content-Type-Options', 'nosniff');
  res.setHeader('X-Frame-Options', 'DENY');
  res.setHeader('Referrer-Policy', 'same-origin');
  res.setHeader('Permissions-Policy', 'camera=(), microphone=(), geolocation=()');
  next();
});

app.use(express.json({
  limit: '1mb',
  verify: (req, _res, buf) => {
    // Stripe requiere rawBody para verificar la firma HMAC del webhook
    if (req.path === '/webhook/stripe') req.rawBody = buf;
  },
}));
app.use(express.urlencoded({ extended: true, limit: '1mb' }));
if (process.env.NODE_ENV === 'production' && (!process.env.PANEL_SECRET || process.env.PANEL_SECRET.length < 32)) {
  throw new Error('PANEL_SECRET es obligatorio en producción y debe tener al menos 32 caracteres');
}
if (!process.env.PANEL_SECRET) {
  console.warn("[SEGURIDAD] PANEL_SECRET no está definido en .env — usando secreto por defecto (INSEGURO en producción)");
}
app.use(session({
  name:              `rajem.panel.${process.env.TENANT_ID || 'default'}.sid`,
  secret:            process.env.PANEL_SECRET || "tacos-javier-secret-2024",
  resave:            false,
  saveUninitialized: false,
  store:             new SqliteSessionStore(() => getBsdb()),
  cookie:            { maxAge: 8 * 60 * 60 * 1000, httpOnly: true, sameSite: 'lax', secure: process.env.COOKIE_SECURE === '1' },
}));
app.use(express.static(path.join(__dirname, "public")));

app.use((req, res, next) => {
  if (!['POST', 'PUT', 'PATCH', 'DELETE'].includes(req.method)) return next();
  const origin = req.get('origin');
  if (!origin) return next();
  try {
    if (new URL(origin).host !== req.get('host')) return res.status(403).json({ error: 'Origen no permitido' });
  } catch (_) { return res.status(403).json({ error: 'Origen inválido' }); }
  next();
});

app.get("/api/negocio", (req, res) => {
  res.json({ nombre: getConfig("nombre_negocio") || "el negocio" });
});

function requireAuth(req, res, next) {
  if (req.session && req.session.usuario) return next();
  res.status(401).json({ error: "No autorizado" });
}

const { planIncluye, getPlanActivo, PLANES } = require("../features");

function requireFeature(feature) {
  return (req, res, next) => {
    const plan = getPlanActivo();
    if (!planIncluye(plan, feature)) {
      const requiere = ['pagos_mp', 'geo_zonas', 'reportes_avanzados', 'multi_formatos'].includes(feature) ? 'plus' : 'pro';
      return res.status(403).json({ error: 'Función no disponible en tu plan actual', feature, plan_actual: plan, requiere });
    }
    next();
  };
}

app.get("/api/mi-plan", requireAuth, (req, res) => {
  const plan = getPlanActivo();
  res.json({ plan, features: [...(PLANES[plan] || PLANES.basico)] });
});

// ── AUTH ──────────────────────────────────────────────────────────────────────
app.post("/api/login", (req, res) => {
  const ip  = req.ip || req.socket?.remoteAddress || "unknown";
  const now = Date.now();
  const att = _loginAttempts.get(ip) || { count: 0, resetAt: now + 60_000 };
  if (now > att.resetAt) { att.count = 0; att.resetAt = now + 60_000; }
  if (att.count >= 5)
    return res.status(429).json({ error: "Demasiados intentos. Espera 1 minuto." });
  att.count++;
  _loginAttempts.set(ip, att);

  const { usuario, password } = req.body;
  const user = getUsuarioPanel(usuario);
  if (!user || !bcrypt.compareSync(password, user.password))
    return res.status(401).json({ error: "Usuario o contraseña incorrectos" });

  att.count = 0;
  _loginAttempts.set(ip, att);
  req.session.usuario = usuario;
  res.json({ ok: true });
});

app.post("/api/logout", (req, res) => { req.session.destroy(); res.json({ ok: true }); });
app.get("/api/me", requireAuth, (req, res) => res.json({ usuario: req.session.usuario }));

app.post("/api/cambiar-password", requireAuth, (req, res) => {
  const { password_actual, password_nuevo } = req.body;
  const user = getUsuarioPanel(req.session.usuario);
  if (!bcrypt.compareSync(password_actual, user.password))
    return res.status(400).json({ error: "Contraseña actual incorrecta" });
  if (typeof password_nuevo !== 'string' || password_nuevo.length < 12)
    return res.status(400).json({ error: "La contraseña nueva debe tener al menos 12 caracteres" });
  updatePasswordPanel(req.session.usuario, bcrypt.hashSync(password_nuevo, 10));
  res.json({ ok: true });
});

// ── CONFIGURACION ─────────────────────────────────────────────────────────────
// Claves protegidas — solo el super-admin puede modificarlas; el tenant envía una solicitud.
const _CLAVES_GEO = new Set([
  'negocio_lat', 'negocio_lon',
  'negocio_calle', 'negocio_colonia', 'negocio_referencia',
  'domicilio_costo',
]);

app.get("/api/config", requireAuth, (req, res) => res.json(getAllConfig()));
app.post("/api/config", requireAuth, (req, res) => {
  if (_CLAVES_GEO.has(req.body.clave)) {
    return res.status(403).json({ error: "Esta configuración es administrada por el equipo de soporte. Usa el formulario de solicitud de cambio en la sección Zonas de Envío." });
  }
  setConfig(req.body.clave, req.body.valor);
  res.json({ ok: true });
});

// ── HORARIOS ──────────────────────────────────────────────────────────────────
app.get("/api/horarios", requireAuth, (req, res) => res.json(getHorarios()));
app.post("/api/horarios/:dia", requireAuth, (req, res) => {
  const { abierto, hora_inicio, hora_fin } = req.body;
  updateHorario(parseInt(req.params.dia), abierto ? 1 : 0, hora_inicio, hora_fin);
  res.json({ ok: true });
});

// ── BANCO ─────────────────────────────────────────────────────────────────────
app.get("/api/banco", requireAuth, (req, res) => res.json(getBanco()));
app.post("/api/banco", requireAuth, (req, res) => {
  updateBanco(req.body.banco, req.body.beneficiario, req.body.clabe);
  res.json({ ok: true });
});

// ── MENSAJES BOT ──────────────────────────────────────────────────────────────
function _mensajesPermitidosGiro() {
  const giro = getGiroActivo();
  const defaults = giro?.mensajesDefaults || {};
  const permitidos = new Map(Object.entries(defaults));
  for (const formato of giro?.itemTypes || []) {
    if (!formato.soporta_gramos && !formato.soporta_pesos) {
      permitidos.set(`menu_formato_${formato.slug}_nota`, defaults.menu_taco_nota || '');
    }
  }
  return permitidos;
}

app.get("/api/mensajes", requireAuth, (req, res) => {
  const permitidos = _mensajesPermitidosGiro();
  const guardados = new Map(getAllMensajes().map(m => [m.clave, m.valor]));
  res.json([...permitidos].map(([clave, valorDefault]) => ({
    clave,
    valor: guardados.has(clave) ? guardados.get(clave) : valorDefault,
  })));
});

app.get("/api/mensajes/contexto", requireAuth, (_req, res) => {
  const items     = catalogoTenant.getMenuItemsActivos();
  const formatos  = catalogoTenant.getFormatosTenant();
  const cortes    = items.filter(i => i.categoria === 'corte');
  const bebidas   = items.filter(i => i.categoria === 'refresco');
  const salsas    = items.filter(i => i.categoria === 'salsa');
  const tieneFormato = predicado => formatos.some(f => predicado(f) && cortes.some(i => i.formato_slug === f.slug));
  const servicioDomicilio = getConfig('tipo_servicio') !== 'solo_mostrador';
  res.json({
    giro: getGiroActivo()?.nombre || getBusinessTypeSlug(),
    catalogo: {
      presentaciones: new Set(cortes.map(i => i.formato_slug).filter(Boolean)).size,
      cortes:         new Set(cortes.map(i => i.producto_slug)).size,
      bebidas:        bebidas.length,
      salsas:         salsas.length,
    },
    formatos_pieza: formatos
      .filter(f => !f.soporta_gramos && !f.soporta_pesos && cortes.some(i => i.formato_slug === f.slug))
      .map(f => ({
        slug: f.slug,
        nombre: f.nombre_plural || f.nombre || f.slug,
        emoji: f.emoji || '🍽️',
        clave: `menu_formato_${f.slug}_nota`,
      })),
    aplica: {
      menu_taco_nota:      tieneFormato(f => !f.soporta_gramos && !f.soporta_pesos),
      menu_gramos_nota:    tieneFormato(f => Boolean(f.soporta_gramos)),
      menu_por_cantidad:   tieneFormato(f => Boolean(f.soporta_pesos)),
      menu_salsas_nota:    salsas.length > 0,
      menu_pie_salsas:     salsas.length > 0,
      menu_nota_precios:   items.length > 0,
      menu_domicilio_nota: servicioDomicilio && items.length > 0,
      comprobante_recibido: Boolean(getBanco()?.activo),
    },
  });
});

app.post("/api/mensajes", requireAuth, (req, res) => {
  const clave = String(req.body.clave || '');
  const valor = typeof req.body.valor === 'string' ? req.body.valor : '';
  if (!_mensajesPermitidosGiro().has(clave)) return res.status(400).json({ error: 'El mensaje no pertenece al Giro activo' });
  if (valor.length > 4000) return res.status(400).json({ error: 'El mensaje excede 4000 caracteres' });
  setMensaje(clave, valor);
  res.json({ ok: true });
});

// Solicitud de nuevo producto (no disponible en el catálogo actual)
app.post("/api/solicitudes-producto", requireAuth, (req, res) => {
  const { nombre_propuesto, descripcion, categoria, motivo } = req.body;
  if (!nombre_propuesto) return res.status(400).json({ error: "nombre_propuesto requerido" });
  run(
    "INSERT INTO solicitudes_producto (nombre_propuesto, descripcion, categoria, motivo) VALUES (?,?,?,?)",
    [nombre_propuesto, descripcion || '', categoria || 'corte', motivo || '']
  );
  // Notificar al grupo de admins si el cliente WA está disponible
  try {
    const { getClienteWA } = require("./whatsapp-bridge");
    const grupoId = process.env.GRUPO_ID;
    const client  = getClienteWA();
    if (client && grupoId) {
      const msg = `📋 *Nueva solicitud de producto*\n\n*Nombre:* ${nombre_propuesto}\n*Categoría:* ${categoria || 'corte'}\n*Descripción:* ${descripcion || '—'}\n*Motivo:* ${motivo || '—'}\n\n_Revisar en el panel de super-admin._`;
      client.sendMessage(grupoId, msg).catch(() => {});
    }
  } catch (_) {}
  res.json({ ok: true });
});

// ── SOLICITUDES GEO ───────────────────────────────────────────────────────────
const _TIPOS_GEO_VALIDOS = new Set(['ubicacion', 'direccion', 'domicilio_costo', 'tarifas']);

app.get("/api/solicitudes-geo", requireAuth, requireFeature('geo_zonas'), (req, res) => {
  res.json(queryAll("SELECT * FROM solicitudes_geo ORDER BY created_at DESC"));
});

app.post("/api/solicitudes-geo", requireAuth, requireFeature('geo_zonas'), (req, res) => {
  const { tipo, datos_propuestos, motivo } = req.body;
  if (!tipo || !_TIPOS_GEO_VALIDOS.has(tipo)) {
    return res.status(400).json({ error: "tipo inválido. Valores permitidos: ubicacion, direccion, domicilio_costo, tarifas" });
  }
  if (!datos_propuestos || typeof datos_propuestos !== 'object') {
    return res.status(400).json({ error: "datos_propuestos es requerido y debe ser un objeto" });
  }
  run(
    "INSERT INTO solicitudes_geo (tipo, datos_propuestos, motivo) VALUES (?,?,?)",
    [tipo, JSON.stringify(datos_propuestos), motivo || '']
  );
  try {
    const { getClienteWA } = require("./whatsapp-bridge");
    const grupoId = process.env.GRUPO_ID;
    const client  = getClienteWA();
    if (client && grupoId) {
      const etiquetas = { ubicacion: 'coordenadas GPS', direccion: 'dirección del negocio', domicilio_costo: 'costo de domicilio', tarifas: 'tarifas por zona' };
      const msg = `📍 *Nueva solicitud de cambio geográfico*\n\n*Tipo:* ${etiquetas[tipo] || tipo}\n*Motivo:* ${motivo || '—'}\n\n_Revisar en el panel de super-admin._`;
      client.sendMessage(grupoId, msg).catch(() => {});
    }
  } catch (_) {}
  res.json({ ok: true });
});

// ── CLIENTES ──────────────────────────────────────────────────────────────────
app.get("/api/clientes", requireAuth, (req, res) => res.json(getAllClientes()));

// Rutas estáticas ANTES del parámetro dinámico :telefono
app.get("/api/clientes/export", requireAuth, (req, res) => {
  const clientes = getAllClientes();
  const cols     = ["id","nombre","apellido","telefono","calle_numero","colonia","referencia","total_pedidos","fecha_registro"];
  const enc      = v => `"${String(v ?? "").replace(/"/g, '""')}"`;
  const rows     = [cols.join(","), ...clientes.map(c => cols.map(col => enc(c[col])).join(","))];
  res.setHeader("Content-Type", "text/csv; charset=utf-8");
  res.setHeader("Content-Disposition", `attachment; filename="clientes_${new Date().toISOString().substring(0, 10)}.csv"`);
  res.send("﻿" + rows.join("\n"));
});

app.get("/api/clientes/:telefono", requireAuth, (req, res) => {
  const cliente = getCliente(req.params.telefono);
  if (!cliente) return res.status(404).json({ error: "No encontrado" });
  res.json(cliente);
});

app.put("/api/clientes/:id", requireAuth, (req, res) => {
  try {
    const id = parseInt(req.params.id);
    const actual = queryOne("SELECT * FROM clientes WHERE id=?", [id]);
    if (!actual) return res.status(404).json({ error: 'Cliente no encontrado' });
    const telefono = String(req.body.telefono || '').replace(/\D/g, '');
    if (!/^[2-9]\d{9}$/.test(telefono)) return res.status(400).json({ error: 'El teléfono debe contener 10 dígitos válidos' });
    const repetido = queryOne("SELECT id FROM clientes WHERE telefono=? AND id<>?", [telefono, id]);
    if (repetido) return res.status(409).json({ error: 'Ese teléfono ya pertenece a otro cliente' });
    const limpio = valor => String(valor ?? '').trim().slice(0, 200) || null;
    const cliente = updateClientePanel(id, {
      nombre: limpio(req.body.nombre),
      apellido: limpio(req.body.apellido),
      telefono,
      calle_numero: limpio(req.body.calle_numero),
      colonia: limpio(req.body.colonia),
      referencia: limpio(req.body.referencia),
    });
    res.json({ ok: true, cliente });
  } catch (e) { res.status(400).json({ error: e.message }); }
});

app.post("/api/clientes", requireAuth, (_req, res) => res.status(403).json({ error: 'Los clientes se registran desde la conversación de WhatsApp' }));
app.delete("/api/clientes/:id", requireAuth, (_req, res) => res.status(403).json({ error: 'Los clientes no pueden eliminarse' }));

// ── CONTROL DEL NEGOCIO ───────────────────────────────────────────────────────
app.get("/api/negocio/estado", requireAuth, (req, res) => {
  res.json({
    cerrado: getConfig("cierre_manual") === "1",
    pausado: botPausado.pausado,
  });
});
app.post("/api/negocio/pausa", requireAuth, (req, res) => {
  botPausado.pausado = !!req.body.pausar;
  res.json({ ok: true, pausado: botPausado.pausado });
});
app.post("/api/negocio/cierre", requireAuth, (req, res) => {
  setConfig("cierre_manual", req.body.cerrar ? "1" : "0");
  res.json({ ok: true, cerrado: !!req.body.cerrar });
});

// ── PEDIDOS ───────────────────────────────────────────────────────────────────
app.get("/api/pedidos", requireAuth, (req, res) => {
  if (req.query.hoy) return res.json(getPedidosHoy());
  if (req.query.cliente) {
    const { getPedidosPorCliente } = require("../db");
    return res.json(getPedidosPorCliente(req.query.cliente));
  }
  res.json(getAllPedidos());
});
const MSGS_ESTADO = {
  confirmado: "✅ Tu pedido ha sido *confirmado*. ¡Pronto estará listo!",
  rechazado:  "❌ Tu pedido fue *rechazado*. Contáctanos si tienes dudas.",
  cancelado:  "❌ Tu pedido ha sido *cancelado*. Si tienes alguna duda, contáctanos.",
  en_camino:  "🛵 Tu pedido ya va *en camino*. ¡Prepárate para recibirlo!",
  listo:      "🏪 Tu pedido ya está *listo* para recoger en el mostrador. ¡Te esperamos! 😊",
};

app.put("/api/pedidos/:id/estado", requireAuth, (req, res) => {
  const { estado } = req.body;
  updatePedidoEstado(parseInt(req.params.id), estado);
  res.json({ ok: true });

  if (MSGS_ESTADO[estado]) {
    const waClient = getWhatsappClient();
    if (waClient) {
      const row = queryOne(
        `SELECT c.telefono FROM pedidos p LEFT JOIN clientes c ON p.cliente_id = c.id WHERE p.id = ?`,
        [parseInt(req.params.id)]
      );
      if (row?.telefono) {
        const jid = getJIDReal(row.telefono) || `521${row.telefono}@c.us`;
        waClient.sendMessage(jid, MSGS_ESTADO[estado]).catch(() => {});
      }
    }
  }
});
app.delete("/api/pedidos/:id", requireAuth, (_req, res) => {
  res.status(403).json({ error: 'Las ventas son registros históricos y no pueden eliminarse' });
});

// ── TRAZABILIDAD Y ATENCIÓN OPERATIVA ────────────────────────────────────────
app.get('/api/observabilidad/resumen', requireAuth, (_req, res) => {
  const abiertas = queryOne("SELECT COUNT(*) total FROM alertas_operativas WHERE estado='abierta'")?.total || 0;
  const criticas = queryOne("SELECT COUNT(*) total FROM alertas_operativas WHERE estado='abierta' AND severidad IN ('critica','alta')")?.total || 0;
  const activas = queryOne("SELECT COUNT(*) total FROM conversaciones_trace WHERE estado='activa' AND actualizada_en >= datetime('now','-48 hours')")?.total || 0;
  res.json({ alertas_abiertas: abiertas, alertas_prioritarias: criticas, conversaciones_activas: activas });
});

app.get('/api/observabilidad/alertas', requireAuth, (req, res) => {
  res.json(observabilidad.listarAlertas({ estado: req.query.estado || 'abierta', limite: req.query.limite }));
});

app.put('/api/observabilidad/alertas/:id/resolver', requireAuth, (req, res) => {
  const id = Number(req.params.id);
  if (!Number.isInteger(id) || id < 1) return res.status(400).json({ error: 'ID inválido' });
  const ok = observabilidad.resolverAlerta(id, req.session.usuario, req.body.nota || '');
  if (!ok) return res.status(404).json({ error: 'Alerta abierta no encontrada' });
  res.json({ ok: true });
});

app.get('/api/observabilidad/conversaciones', requireAuth, (req, res) => {
  res.json(observabilidad.listarConversaciones(req.query.limite));
});

app.get('/api/observabilidad/conversaciones/:id', requireAuth, (req, res) => {
  const resultado = observabilidad.obtenerConversacion(req.params.id);
  if (!resultado) return res.status(404).json({ error: 'Conversación no encontrada' });
  res.json(resultado);
});

// ── STATS ─────────────────────────────────────────────────────────────────────
app.get("/api/stats", requireAuth, (req, res) => {
  const pedidosHoy  = getPedidosHoy();
  const confirmados = pedidosHoy.filter(p => ["confirmado","listo","en_camino"].includes(p.estado));
  const totalVentas = confirmados.reduce((a, p) => a + (p.total || 0), 0);
  const ticket      = confirmados.length ? Math.round(totalVentas / confirmados.length) : 0;
  const domicilios  = confirmados.filter(p => p.tipo === "domicilio");
  const mostradores = confirmados.filter(p => p.tipo === "mostrador");

  const conteoCortes = {};
  const cortesMenu = new Set(catalogoTenant.getMenuItemsActivos('corte').map(i => i.producto_slug));
  const CORTES_STAT = catalogoTenant.getCortesTenant()
    .filter(c => cortesMenu.has(c.slug)).map(c => c.nombre.toLowerCase());
  for (const p of pedidosHoy) {
    const orden = (p.orden || "").toLowerCase();
    for (const c of CORTES_STAT) if (orden.includes(c)) conteoCortes[c] = (conteoCortes[c] || 0) + 1;
  }
  const corteMasPedido = Object.entries(conteoCortes).sort((a, b) => b[1] - a[1])[0]?.[0] || null;

  res.json({
    pedidos_hoy:       pedidosHoy.length,
    pendientes:        pedidosHoy.filter(p => p.estado === "pendiente").length,
    confirmados:       confirmados.length,
    cancelados:        pedidosHoy.filter(p => p.estado === "cancelado").length,
    rechazados:        pedidosHoy.filter(p => p.estado === "rechazado").length,
    total_ventas_hoy:  totalVentas,
    ticket_promedio:   ticket,
    domicilios_hoy:    domicilios.length,
    mostradores_hoy:   mostradores.length,
    ventas_domicilio:  Math.round(domicilios.reduce((s, p) => s + (p.total || 0), 0)),
    ventas_mostrador:  Math.round(mostradores.reduce((s, p) => s + (p.total || 0), 0)),
    corte_mas_pedido:  corteMasPedido,
    conteo_cortes:     conteoCortes,
    total_clientes:    queryOne("SELECT COUNT(*) as n FROM clientes")?.n || 0,
    negocio:           getConfig("nombre_negocio") || "Tacos Javier",
  });
});

// ── REPORTES POR RANGO DE FECHAS ──────────────────────────────────────────────
app.get("/api/reportes", requireAuth, requireFeature('reportes_avanzados'), (req, res) => {
  const { desde, hasta } = req.query;
  if (!desde || !hasta) return res.status(400).json({ error: "Parámetros desde y hasta requeridos" });
  const { queryAll } = require("../db/core");
  const stats  = getStatsReporte(desde, hasta);
  const porDia = queryAll(
    `SELECT date(p.fecha, 'localtime') AS dia,
            COUNT(*)                                                             AS total,
            SUM(CASE WHEN p.estado IN ('confirmado','listo','en_camino') THEN 1 ELSE 0 END) AS confirmados,
            SUM(CASE WHEN p.tipo='domicilio' AND p.estado IN ('confirmado','listo','en_camino') THEN 1 ELSE 0 END) AS domicilios,
            ROUND(SUM(CASE WHEN p.estado IN ('confirmado','listo','en_camino') THEN p.total ELSE 0 END), 2) AS ventas
     FROM pedidos p
     WHERE date(p.fecha, 'localtime') >= ? AND date(p.fecha, 'localtime') <= ?
     GROUP BY dia ORDER BY dia ASC`,
    [desde, hasta]
  );
  res.json({ stats, porDia });
});

// ── TOP CLIENTES ──────────────────────────────────────────────────────────────
app.get("/api/stats/top-clientes", requireAuth, requireFeature('reportes_avanzados'), (req, res) => {
  const limit = Math.min(parseInt(req.query.limit) || 10, 50);
  res.json(getTopClientes(limit));
});

// ── STATS HISTÓRICO ───────────────────────────────────────────────────────────
app.get("/api/stats/historico", requireAuth, requireFeature('reportes_avanzados'), (req, res) => {
  const dias  = req.query.periodo === "mes" ? 30 : 7;
  const { queryAll } = require("../db/core");
  const filas = queryAll(
    `SELECT date(fecha, 'localtime') AS dia,
            COUNT(*)                                                   AS total,
            SUM(CASE WHEN estado = 'confirmado' THEN 1 ELSE 0 END)    AS confirmados,
            SUM(CASE WHEN estado = 'cancelado'
                      OR estado  = 'rechazado' THEN 1 ELSE 0 END)     AS cancelados,
            ROUND(SUM(CASE WHEN estado = 'confirmado'
                           THEN total ELSE 0 END), 2)                 AS ventas
     FROM pedidos
     WHERE fecha >= date('now', 'localtime', ? || ' days')
     GROUP BY dia ORDER BY dia ASC`,
    [`-${dias}`]
  );
  res.json(filas);
});

// ── HELPER: NOTIFICACIÓN WA TRAS PAGO CONFIRMADO ─────────────────────────────
async function _notificarPagoConfirmado(resultado, proveedor = 'Pasarela') {
  const waClient = getWhatsappClient();
  if (!waClient) return;
  if (resultado.jid) {
    try {
      await waClient.sendMessage(resultado.jid,
        `✅ *¡Pago confirmado!*\n\nTu pedido está en proceso 🌮🔥\nEn breve te avisamos cuando esté listo. ¡Gracias por tu preferencia! 😊`
      );
    } catch (_) {}
  }
  const notifJID = getNotifDestinoJID();
  if (notifJID && resultado.resumen) {
    try {
      const nombre = resultado.nombre || resultado.telefono || 'Cliente';
      await waClient.sendMessage(notifJID,
        `✅ *PAGO CONFIRMADO — ${proveedor}*\n\n👤 ${nombre}\n📦 Pedido #${resultado.pedidoId}\n\n${resultado.resumen}`
      );
    } catch (_) {}
  }
  // Despacho a mandaditos si es pedido a domicilio
  if (resultado.pedidoId) {
    try {
      const row = queryOne(
        `SELECT p.tipo, p.total, c.calle_numero, c.colonia, c.referencia
         FROM pedidos p LEFT JOIN clientes c ON p.cliente_id = c.id
         WHERE p.id = ?`,
        [resultado.pedidoId]
      );
      if (row && row.tipo === 'domicilio') {
        const tarifa = parseInt(getConfig('domicilio_costo') || '50', 10);
        despacharConDelay(waClient, {
          pedidoId:          resultado.pedidoId,
          clienteNombre:     resultado.nombre      || 'Cliente',
          clienteTelefono:   resultado.telefono    || null,
          clienteCalle:      row.calle_numero      || null,
          clienteColonia:    row.colonia           || null,
          clienteReferencia: row.referencia        || null,
          totalOrden:        `$${row.total         || 0}`,
          tarifaDomicilio:   tarifa,
        }).catch(e => console.error('[Mandaditos] Error al programar despacho pago:', e.message));
      }
    } catch (e) { console.error('[Mandaditos] Error consultando pedido para despacho:', e.message); }
  }
}

// ── WEBHOOK MERCADOPAGO (público) ─────────────────────────────────────────────
app.post("/webhook/mercadopago", async (req, res) => {
  const { type, data } = req.body || {};
  if (type !== "payment" || !data?.id) return res.sendStatus(202);
  try {
    const resultado = await mpPagos.procesarPago(data.id);
    if (!resultado?.aprobado) return res.sendStatus(202);
    try { actualizarEstadoPorId(resultado.pedidoId, "confirmado"); } catch (_) {}
    if (resultado.jid) { try { require("../estado").esperandoPagoMP.delete(resultado.jid); } catch (_) {} }
    await _notificarPagoConfirmado(resultado, 'MercadoPago');
    res.sendStatus(200);
  } catch (e) {
    console.error("[Webhook MP] Error:", e.message);
    res.sendStatus(500);
  }
});

// ── WEBHOOK STRIPE (público) ──────────────────────────────────────────────────
app.post("/webhook/stripe", async (req, res) => {
  const firma = req.headers['stripe-signature'];
  if (!firma || !req.rawBody) return res.sendStatus(400);
  try {
    const stripeDriver = require('../pagos/stripe');
    const event = stripeDriver.verificarWebhookEvento(req.rawBody, firma);
    if (!event) return res.sendStatus(400);
    if (event.type !== 'checkout.session.completed') return res.sendStatus(202);
    const session = event.data.object;
    if (session.payment_status !== 'paid') return res.sendStatus(202);
    const resultado = await stripeDriver.procesarPago(session.id);
    if (!resultado?.aprobado) return res.sendStatus(202);
    try { actualizarEstadoPorId(parseInt(resultado.pedidoId), 'confirmado'); } catch (_) {}
    if (resultado.jid) { try { require('../estado').esperandoPagoMP.delete(resultado.jid); } catch (_) {} }
    await _notificarPagoConfirmado(resultado, 'Stripe');
    res.sendStatus(200);
  } catch (e) {
    console.error('[Webhook Stripe] Error:', e.message);
    res.sendStatus(500);
  }
});

// ── WEBHOOK CONEKTA (público) ─────────────────────────────────────────────────
app.post("/webhook/conekta", async (req, res) => {
  const { type, data } = req.body || {};
  if (type !== 'order.paid' || !data?.object?.id) return res.sendStatus(202);
  try {
    const conektaDriver = require('../pagos/conekta');
    const resultado = await conektaDriver.procesarPago(data.object.id);
    if (!resultado?.aprobado) return res.sendStatus(202);
    try { actualizarEstadoPorId(parseInt(resultado.pedidoId), 'confirmado'); } catch (_) {}
    if (resultado.jid) { try { require('../estado').esperandoPagoMP.delete(resultado.jid); } catch (_) {} }
    await _notificarPagoConfirmado(resultado, 'Conekta');
    res.sendStatus(200);
  } catch (e) {
    console.error('[Webhook Conekta] Error:', e.message);
    res.sendStatus(500);
  }
});

// ── SESIONES ACTIVAS ──────────────────────────────────────────────────────────
app.get("/api/sesiones", requireAuth, (req, res) => {
  const {
    clientesNuevos: cN, datosRecibidos: dR,
    esperandoCorte: eC, esperandoTipoItem: eTI,
    esperandoConfirmacionItem: eCI, esperandoAgregarMas: eAM,
    resumenPendiente: rP, esperandoCaptura: eCap,
  } = require("../estado");

  const todos = new Set([
    ...cN, ...dR,
    ...eC.keys(), ...eTI.keys(), ...eCI.keys(),
    ...eAM.keys(), ...rP.keys(), ...eCap.keys(),
  ]);

  const ETIQUETAS = {
    resumen_pendiente: "Resumen pendiente",
    esperando_captura: "Esperando transferencia",
    agregar_mas:       "Agregando más",
    confirmacion_item: "Confirmando ítem",
    esperando_corte:   "Eligiendo corte",
    esperando_tipo:    "Eligiendo taco/torta",
    tomando_pedido:    "Tomando pedido",
    formulario:        "Llenando formulario",
  };

  const sesiones = [];
  for (const num of todos) {
    let estado = "formulario";
    if (rP.has(num))   estado = "resumen_pendiente";
    else if (eCap.has(num))  estado = "esperando_captura";
    else if (eAM.has(num))   estado = "agregar_mas";
    else if (eCI.has(num))   estado = "confirmacion_item";
    else if (eC.has(num))    estado = "esperando_corte";
    else if (eTI.has(num))   estado = "esperando_tipo";
    else if (dR.has(num))    estado = "tomando_pedido";
    sesiones.push({ numero: num.replace(/@.+/, "").slice(-10), estado, etiqueta: ETIQUETAS[estado] });
  }

  res.json({ total: sesiones.length, sesiones });
});

// ── QR DE VINCULACIÓN (sin auth — proxy del super admin lo consume server-to-server) ──
app.get("/api/qr", (req, res) => {
  const { qr, ts } = getQR();
  if (!qr) return res.status(404).json({ error: "Sin QR — bot ya autenticado o aún iniciando" });
  res.json({ qr, ts });
});

// ── HEALTH CHECK (público, para monitoreo externo) ───────────────────────────
app.get("/health", (req, res) => {
  const { wa_estado, uptime_segundos, tenant } = getStatusInfo();

  let dbOk = false;
  try {
    dbOk = !!queryOne("SELECT 1 AS ok");
  } catch (_) {}

  const saludable = wa_estado === "conectado" && dbOk;

  res.status(saludable ? 200 : 503).json({
    status:    saludable ? "ok" : "degraded",
    whatsapp:  wa_estado,
    db:        dbOk ? "ok" : "error",
    uptime_s:  uptime_segundos,
    tenant,
    timestamp: new Date().toISOString(),
  });
});

// ── STATUS DEL BOT ────────────────────────────────────────────────────────────
app.get("/api/status", requireAuth, (req, res) => res.json(getStatusInfo()));

// ── NOTIFICACIÓN AL CLIENTE ───────────────────────────────────────────────────
// POST /api/pedidos/:id/notificar  { mensaje: "Tu pedido va en camino 🛵" }
app.post("/api/pedidos/:id/notificar", requireAuth, async (req, res) => {
  const { mensaje } = req.body;
  if (!mensaje) return res.status(400).json({ error: "Falta el campo 'mensaje'" });

  const waClient = getWhatsappClient();
  if (!waClient) return res.status(503).json({ error: "Bot de WhatsApp no conectado aún" });

  const row = queryOne(
    `SELECT c.telefono FROM pedidos p LEFT JOIN clientes c ON p.cliente_id = c.id WHERE p.id = ?`,
    [parseInt(req.params.id)]
  );
  if (!row?.telefono) return res.status(404).json({ error: "No se encontró teléfono para ese pedido" });

  const chatId = getJIDReal(row.telefono) || `521${row.telefono}@c.us`;
  try {
    await waClient.sendMessage(chatId, mensaje);
    res.json({ ok: true, enviado_a: row.telefono });
  } catch (e) {
    res.status(500).json({ error: e.message });
  }
});

// ── ALERTA PEDIDOS PENDIENTES SIN ATENDER ─────────────────────────────────────
const _pedidosAlertados = new Set();
let _alertasInicializado = false;

setInterval(async () => {
  const notifJID = getNotifDestinoJID();
  if (!notifJID) return;
  const waClient = getWhatsappClient();
  if (!waClient) return;

  const { queryAll } = require("../db/core");
  const alertaMin = parseInt(getConfig("alerta_pedido_min") || "10");
  const pendientes = queryAll(
    `SELECT p.id, c.nombre, c.apellido, c.telefono, p.total, p.hora_entrega
     FROM pedidos p
     LEFT JOIN clientes c ON p.cliente_id = c.id
     WHERE p.estado = 'pendiente'
       AND datetime(p.fecha, 'localtime') <= datetime('now', 'localtime', '-' || ? || ' minutes')
     ORDER BY p.fecha ASC`,
    [alertaMin]
  );

  for (const p of pendientes) {
    if (_pedidosAlertados.has(p.id)) continue;
    _pedidosAlertados.add(p.id);
    // Primer tick tras arranque: marcar como vistos sin alertar (son pedidos pre-reinicio)
    if (!_alertasInicializado) continue;
    const nombre = [p.nombre, p.apellido].filter(Boolean).join(" ") || p.telefono || "—";
    try {
      await waClient.sendMessage(notifJID,
        `⚠️ *Pedido sin confirmar*\n\n` +
        `El pedido *#${p.id}* de *${nombre}* lleva más de 10 minutos esperando.\n` +
        `Total: $${Math.round(p.total || 0)}\n\n` +
        `Usa *!confirmar ${p.telefono || nombre}* o revisa el panel.`
      );
    } catch (_) {}
  }

  _alertasInicializado = true;

  // Quitar de alertados los que ya no son pendientes (fueron atendidos)
  const idsActuales = new Set(pendientes.map(p => p.id));
  for (const id of _pedidosAlertados) {
    if (!idsActuales.has(id)) _pedidosAlertados.delete(id);
  }
}, 5 * 60 * 1000).unref();

// ── COLONIAS Y TARIFAS DE ENVÍO ───────────────────────────────────────────────
app.get("/api/colonias", requireAuth, (req, res) => {
  const tenantId = process.env.TENANT_ID || '';
  let tenant = null;
  try {
    const registry = JSON.parse(fs.readFileSync(path.join(__dirname, '../../data/tenants.json'), 'utf8'));
    tenant = geoTepic.resolverTenant(registry.tenants || [], tenantId, getBsdb()?.name || '');
  } catch (_) {}
  if (!tenant || !geoTepic.esTenantTepic(tenant)) return res.status(403).json({ error: "GeoTepic solo está disponible para tenants de Tepic, Nayarit" });
  let colonias;
  try {
    geoTepic.inicializarDesdeTenants([tenant]);
    colonias = geoTepic.listarParaTenant(tenant);
  } catch (e) { return res.status(500).json({ error: e.message }); }
  const negLat    = parseFloat(getConfig("negocio_lat") || "0");
  const negLon    = parseFloat(getConfig("negocio_lon") || "0");

  if (negLat && negLon) {
    const { haversine } = require("../geo");
    const zonas = queryAll("SELECT * FROM tarifas_zonas ORDER BY distancia_max ASC");
    return res.json(colonias.map(c => {
      const d = Math.round(haversine(negLat, negLon, c.lat, c.lon) * 10) / 10;
      let zona_actual = null;
      for (const z of zonas) {
        if (d <= z.distancia_max) { zona_actual = z.nombre_zona; break; }
      }
      if (!zona_actual && zonas.length) zona_actual = zonas[zonas.length - 1].nombre_zona;
      return { ...c, distancia: d, zona_actual };
    }));
  }
  res.json(colonias.map(c => ({ ...c, distancia: null, zona_actual: null })));
});

app.put("/api/colonias/cobertura", requireAuth, (req, res) => {
  const tenantId = process.env.TENANT_ID || '';
  let tenant = null;
  try {
    const registry = JSON.parse(fs.readFileSync(path.join(__dirname, '../../data/tenants.json'), 'utf8'));
    tenant = geoTepic.resolverTenant(registry.tenants || [], tenantId, getBsdb()?.name || '');
  } catch (_) {}
  if (!tenant || !geoTepic.esTenantTepic(tenant)) return res.status(403).json({ error: "GeoTepic solo está disponible para tenants de Tepic, Nayarit" });
  try {
    const resultado = geoTepic.aplicarRadioCobertura(
      tenant,
      parseFloat(getConfig('negocio_lat') || ''),
      parseFloat(getConfig('negocio_lon') || ''),
      req.body.radio_km
    );
    invalidarCacheColonias();
    invalidarCacheConfig();
    res.json({ ok: true, ...resultado });
  } catch (e) { res.status(400).json({ error: e.message }); }
});

// Las colonias se crean/editan/eliminan solo desde el super-admin.
// El tenant solo puede activar o desactivar su entrega a cada colonia.
app.put("/api/colonias/:id/activo", requireAuth, (req, res) => {
  const { activo } = req.body;
  if (activo === undefined) return res.status(400).json({ error: "Falta campo activo" });
  const local = queryOne("SELECT geo_tepic_id FROM colonias WHERE id=?", [parseInt(req.params.id)]);
  if (!local?.geo_tepic_id) return res.status(404).json({ error: "Colonia GeoTepic no encontrada" });
  if (activo && !geoTepic.listarColonias({ incluirInactivas: false }).some(c => c.id === local.geo_tepic_id)) {
    return res.status(403).json({ error: "La colonia está deshabilitada en GeoTepic" });
  }
  const radio = parseFloat(getConfig('geo_radio_cobertura_km') || '');
  if (activo && Number.isFinite(radio) && radio > 0) {
    const colonia = queryOne('SELECT lat,lon FROM colonias WHERE id=?', [parseInt(req.params.id)]);
    const lat = parseFloat(getConfig('negocio_lat') || '');
    const lon = parseFloat(getConfig('negocio_lon') || '');
    const { haversine } = require('../geo');
    if (colonia && Number.isFinite(lat) && Number.isFinite(lon) && haversine(lat, lon, colonia.lat, colonia.lon) > radio) {
      return res.status(403).json({ error: `Esta colonia está fuera del radio de cobertura de ${radio} km` });
    }
  }
  run("UPDATE colonias SET activo=? WHERE id=? AND geo_tepic_id IS NOT NULL", [activo ? 1 : 0, parseInt(req.params.id)]);
  invalidarCacheColonias();
  res.json({ ok: true });
});

app.get("/api/tarifas-zonas", requireAuth, (req, res) => {
  res.json(queryAll("SELECT * FROM tarifas_zonas ORDER BY distancia_max ASC"));
});

// Las tarifas de envío son administradas exclusivamente por el super-admin.
// El tenant solicita cambios a través de POST /api/solicitudes-geo.
app.put("/api/tarifas-zonas", requireAuth, (req, res) => {
  res.status(403).json({ error: "Las tarifas de envío son administradas por el equipo de soporte. Usa el formulario de solicitud de cambio en la sección Zonas de Envío." });
});

// ── BUSINESS TYPES ────────────────────────────────────────────────────────────
// GET  /api/business-types/actual — plantilla activa del tenant
app.get("/api/business-types/actual", requireAuth, (req, res) => {
  try {
    const slug = getBusinessTypeSlug();
    const bt   = getBusinessType(slug);
    const its  = getItemTypes();
    res.json({ slug, businessType: bt, itemTypes: its });
  } catch (e) { res.status(500).json({ error: e.message }); }
});

// ── ITEM TYPES (tipos de ítem del negocio actual) ─────────────────────────────
// GET    /api/item-types           — lista los item_types del negocio activo
// PUT    /api/item-types/:slug     — editar item_type existente
app.get("/api/item-types", requireAuth, (req, res) => {
  try { res.json(getItemTypes()); } catch (e) { res.status(500).json({ error: e.message }); }
});

app.put("/api/item-types/:id", requireAuth, (req, res) => {
  try {
    const id = parseInt(req.params.id);
    if (!catalogoTenant.esFormatoIdValido(id)) return res.status(404).json({ error: 'Presentación fuera del giro activo' });
    const { precio_base, activo } = req.body;
    if (activo !== undefined) return res.status(403).json({ error: 'El Superadmin habilita los formatos de venta' });
    if (precio_base !== undefined) run('UPDATE item_types SET precio_base=? WHERE id=?', [Number(precio_base), id]);
    invalidarCacheItemTypes(); invalidarCacheCortes();
    res.json({ ok: true });
  } catch (e) { res.status(500).json({ error: e.message }); }
});

// ── CORTES ────────────────────────────────────────────────────────────────────
// GET /api/cortes — todos los cortes del giro (incluye inactivos)
app.get("/api/cortes", requireAuth, (req, res) => {
  try { res.json(catalogoTenant.getCortesTenant()); } catch (e) { res.status(500).json({ error: e.message }); }
});

// POST /api/cortes — crear nuevo corte
app.post("/api/cortes", requireAuth, (req, res) => {
  res.status(403).json({ error: 'Los cortes se definen exclusivamente en el módulo de giro' });
});

// PUT /api/cortes/:id — editar corte (precio, aliases, activo)
app.put("/api/cortes/:id", requireAuth, (req, res) => {
  res.status(403).json({ error: 'La definición pertenece al giro; precios y activación se configuran en el menú' });
});

// ── MENÚ DEL TENANT (menu_items) ─────────────────────────────────────────────

// GET /api/menu-items?categoria=corte|refresco|salsa
app.get("/api/menu-items", requireAuth, (req, res) => {
  const { categoria } = req.query;
  res.json(catalogoTenant.getMenuItemsTenant(categoria || null));
});

// Altas y habilitación pertenecen exclusivamente al Superadmin.
app.post("/api/menu-items", requireAuth, (_req, res) => {
  res.status(403).json({ error: 'El Superadmin habilita los productos del tenant' });
});

// PUT /api/menu-items/:id — el tenant solo puede editar el precio
app.put("/api/menu-items/:id", requireAuth, (req, res) => {
  const id = parseInt(req.params.id);
  const { precio, activo, disponible } = req.body;
  const item = queryOne("SELECT * FROM menu_items WHERE id=? AND eliminado=0", [id]);
  if (!item) return res.status(404).json({ error: "Item no encontrado" });
  if (activo !== undefined) return res.status(403).json({ error: 'El Superadmin controla la habilitación de productos' });
  if (precio  !== undefined) run("UPDATE menu_items SET precio=? WHERE id=?",  [parseFloat(precio) || 0, id]);
  if (disponible !== undefined) run("UPDATE menu_items SET disponible=? WHERE id=? AND activo=1", [disponible ? 1 : 0, id]);
  invalidarCacheCortes();
  res.json({ ok: true });
});

// DELETE /api/menu-items/:id — soft delete
app.delete("/api/menu-items/:id", requireAuth, (req, res) => {
  res.status(403).json({ error: 'El Superadmin controla la disponibilidad de productos' });
});

// Disponibilidad operativa: no cambia la habilitación asignada por Superadmin.
app.post("/api/menu-items/toggle-corte", requireAuth, (req, res) => {
  const { producto_slug, disponible } = req.body;
  if (!producto_slug || !catalogoTenant.esProductoValido('corte', producto_slug)) {
    return res.status(400).json({ error: 'Corte inválido para el giro activo' });
  }
  run("UPDATE menu_items SET disponible=? WHERE producto_slug=? AND categoria='corte' AND activo=1 AND eliminado=0",
    [disponible ? 1 : 0, producto_slug]);
  invalidarCacheCortes();
  res.json({ ok: true });
});

// ── CATÁLOGO DEL GIRO (para selección en modales) ────────────────────────────

// GET /api/catalogo/cortes — cortes del giro agrupados por sección, filtrados por seccion_taqueria
app.get("/api/catalogo/cortes", requireAuth, (req, res) => {
  try {
    const cortes = catalogoTenant.getCortesTenant();
    const seccion = getConfig('seccion_taqueria') || 'ambas';
    const asada    = seccion !== 'carnitas' ? cortes.filter(c => c.seccion === 'asada')  : [];
    const carnitas = seccion !== 'asada'    ? cortes.filter(c => c.seccion !== 'asada') : [];
    res.json({ asada, carnitas });
  } catch (e) { res.status(500).json({ error: e.message }); }
});

// GET /api/catalogo/bebidas
app.get("/api/catalogo/bebidas", requireAuth, (req, res) => {
  res.json(catalogoTenant.getBebidasTenant());
});

// GET /api/catalogo/salsas
app.get("/api/catalogo/salsas", requireAuth, (req, res) => {
  res.json(catalogoTenant.getSalsasTenant());
});

// ── FORMATOS (item_types del giro activo) ─────────────────────────────────────

// GET /api/formatos — formatos del giro
// ?todos=1 devuelve activos e inactivos (para gestión en el panel)
app.get("/api/formatos", requireAuth, (req, res) => {
  try {
    if (req.query.todos === "1") {
      return res.json(catalogoTenant.getFormatosTenant({ todos: true }));
    }
    res.json(catalogoTenant.getFormatosTenant());
  } catch (e) { res.status(500).json({ error: e.message }); }
});

// PUT /api/formatos/:id — el tenant solo puede editar precio_base
// cascade:true propaga el precio a todos los menu_items del formato (útil desde el wizard)
app.put("/api/formatos/:id", requireAuth, (req, res) => {
  const id = parseInt(req.params.id);
  if (!catalogoTenant.esFormatoIdValido(id)) return res.status(404).json({ error: 'Formato no definido por el giro activo' });
  const { precio_base, activo } = req.body;
  if (activo !== undefined) return res.status(403).json({ error: 'El Superadmin habilita los formatos de venta' });
  try {
    const { run } = require("../db/core");
    if (precio_base !== undefined) {
      run("UPDATE item_types SET precio_base = ? WHERE id = ?", [precio_base, id]);
      const it = queryOne("SELECT slug FROM item_types WHERE id=?", [id]);
      if (it) run("UPDATE menu_items SET precio=? WHERE formato_slug=? AND eliminado=0", [precio_base, it.slug]);
    }
    invalidarCacheItemTypes();
    invalidarCacheCortes();
    res.json({ ok: true });
  } catch (e) { res.status(500).json({ error: e.message }); }
});

function startPanel(port = 3000) {
  app.listen(port, () => {
    console.log(`\n🌐 Panel de administración corriendo en http://localhost:${port}`);
    console.log(`   Usuario: admin (usa scripts/reset-password.js para recuperar acceso)\n`);
  });
}

module.exports = { startPanel };
