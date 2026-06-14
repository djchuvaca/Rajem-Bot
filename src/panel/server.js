const express      = require("express");
const session      = require("express-session");
const bcrypt       = require("bcryptjs");
const path         = require("path");
const {
  getUsuarioPanel, updatePasswordPanel,
  getAllConfig, setConfig,
  getHorarios, updateHorario,
  getBanco, updateBanco,
  getAllMensajes, setMensaje,
  getProductos, updateProducto, createProducto, deleteProducto,
  getAllClientes, getCliente, upsertCliente, deleteCliente,
  getAllPedidos, getPedidosHoy, updatePedidoEstado, deletePedido,
  getConfig, guardarTelefonoReal, getJIDReal, getGrupoId,
  getPedidosPorFecha, getStatsReporte, getTopClientes,
} = require("../db");
const { queryOne, queryAll, run } = require("../db/core");
const { invalidarCacheCortes } = require("../handlers/pedidoParser");
const { invalidarCacheColonias } = require("../geo");

const { getWhatsappClient, getStatusInfo } = require("./whatsapp-bridge");
const botPausado = require("../estado/bot-pausado");
const { actualizarEstadoPorId } = require("../db");
const mpPagos = require("../pagos/mercadopago");

// Rate limiting para login (en memoria, se reinicia al reiniciar el servidor)
const _loginAttempts = new Map();

const app = express();

app.use(express.json());
app.use(express.urlencoded({ extended: true }));
app.use(session({
  secret:            process.env.PANEL_SECRET || "tacos-javier-secret-2024",
  resave:            false,
  saveUninitialized: false,
  cookie:            { maxAge: 8 * 60 * 60 * 1000 },
}));
app.use(express.static(path.join(__dirname, "public")));

function requireAuth(req, res, next) {
  if (req.session && req.session.usuario) return next();
  res.status(401).json({ error: "No autorizado" });
}

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
  updatePasswordPanel(req.session.usuario, bcrypt.hashSync(password_nuevo, 10));
  res.json({ ok: true });
});

// ── CONFIGURACION ─────────────────────────────────────────────────────────────
app.get("/api/config", requireAuth, (req, res) => res.json(getAllConfig()));
app.post("/api/config", requireAuth, (req, res) => {
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
app.get("/api/mensajes", requireAuth, (req, res) => res.json(getAllMensajes()));
app.post("/api/mensajes", requireAuth, (req, res) => {
  setMensaje(req.body.clave, req.body.valor);
  res.json({ ok: true });
});

// ── PRODUCTOS ─────────────────────────────────────────────────────────────────
app.get("/api/productos", requireAuth, (req, res) => res.json(getProductos()));
app.post("/api/productos", requireAuth, (req, res) => { createProducto(req.body); invalidarCacheCortes(); res.json({ ok: true }); });
app.put("/api/productos/:id", requireAuth, (req, res) => { updateProducto(parseInt(req.params.id), req.body); invalidarCacheCortes(); res.json({ ok: true }); });
app.delete("/api/productos/:id", requireAuth, (req, res) => { deleteProducto(parseInt(req.params.id)); invalidarCacheCortes(); res.json({ ok: true }); });

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

app.post("/api/clientes", requireAuth, (req, res) => {
  try {
    const cliente = upsertCliente(req.body);
    // Si tiene teléfono de whatsapp, guardar relación para cliente frecuente
    if (req.body.whatsapp && req.body.telefono)
      guardarTelefonoReal(req.body.whatsapp, req.body.telefono);
    res.json({ ok: true, cliente });
  } catch (e) { res.status(400).json({ error: e.message }); }
});

app.put("/api/clientes/:id", requireAuth, (req, res) => {
  try {
    upsertCliente(req.body);
    if (req.body.whatsapp && req.body.telefono)
      guardarTelefonoReal(req.body.whatsapp, req.body.telefono);
    res.json({ ok: true });
  } catch (e) { res.status(400).json({ error: e.message }); }
});

app.delete("/api/clientes/:id", requireAuth, (req, res) => {
  deleteCliente(parseInt(req.params.id));
  res.json({ ok: true });
});

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
app.delete("/api/pedidos/:id", requireAuth, (req, res) => {
  deletePedido(parseInt(req.params.id));
  res.json({ ok: true });
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
  const CORTES_STAT  = getProductos().map(p => p.nombre.toLowerCase());
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
app.get("/api/reportes", requireAuth, (req, res) => {
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
app.get("/api/stats/top-clientes", requireAuth, (req, res) => {
  const limit = Math.min(parseInt(req.query.limit) || 10, 50);
  res.json(getTopClientes(limit));
});

// ── STATS HISTÓRICO ───────────────────────────────────────────────────────────
app.get("/api/stats/historico", requireAuth, (req, res) => {
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

// ── WEBHOOK MERCADOPAGO (público) ─────────────────────────────────────────────
app.post("/webhook/mercadopago", async (req, res) => {
  res.sendStatus(200); // responder inmediato para que MP no reintente

  const { type, data } = req.body || {};
  if (type !== "payment" || !data?.id) return;

  try {
    const resultado = await mpPagos.procesarPago(data.id);
    if (!resultado?.aprobado) return;

    // Actualizar estado en BD
    try { actualizarEstadoPorId(resultado.pedidoId, "confirmado"); } catch (_) {}

    const waClient = getWhatsappClient();
    if (!waClient) return;

    // Notificar al cliente
    if (resultado.jid) {
      try {
        await waClient.sendMessage(resultado.jid,
          `✅ *¡Pago confirmado!*\n\nTu pedido está en proceso 🌮🔥\nEn breve te avisamos cuando esté listo. ¡Gracias por tu preferencia! 😊`
        );
      } catch (_) {}
    }

    // Notificar al grupo
    const grupoId = getGrupoId();
    if (grupoId && resultado.resumen) {
      try {
        const nombre = resultado.nombre || resultado.telefono || "Cliente";
        await waClient.sendMessage(grupoId,
          `✅ *PAGO CONFIRMADO — MercadoPago*\n\n` +
          `👤 ${nombre}\n` +
          `📦 Pedido #${resultado.pedidoId}\n\n` +
          `${resultado.resumen}`
        );
      } catch (_) {}
    }
  } catch (e) {
    console.error("[Webhook MP] Error:", e.message);
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
  const grupoId = getGrupoId();
  if (!grupoId) return;
  const waClient = getWhatsappClient();
  if (!waClient) return;

  const { queryAll } = require("../db/core");
  const pendientes = queryAll(
    `SELECT p.id, c.nombre, c.apellido, c.telefono, p.total, p.hora_entrega
     FROM pedidos p
     LEFT JOIN clientes c ON p.cliente_id = c.id
     WHERE p.estado = 'pendiente'
       AND datetime(p.fecha, 'localtime') <= datetime('now', 'localtime', '-10 minutes')
     ORDER BY p.fecha ASC`
  );

  for (const p of pendientes) {
    if (_pedidosAlertados.has(p.id)) continue;
    _pedidosAlertados.add(p.id);
    // Primer tick tras arranque: marcar como vistos sin alertar (son pedidos pre-reinicio)
    if (!_alertasInicializado) continue;
    const nombre = [p.nombre, p.apellido].filter(Boolean).join(" ") || p.telefono || "—";
    try {
      await waClient.sendMessage(grupoId,
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
  const colonias  = queryAll("SELECT * FROM colonias ORDER BY nombre");
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

app.post("/api/colonias", requireAuth, (req, res) => {
  const { nombre, lat, lon } = req.body;
  if (!nombre || lat == null || lon == null) return res.status(400).json({ error: "Faltan campos" });
  try {
    run("INSERT INTO colonias (nombre, lat, lon) VALUES (?,?,?)", [nombre, parseFloat(lat), parseFloat(lon)]);
    invalidarCacheColonias();
    res.json({ ok: true });
  } catch (e) { res.status(400).json({ error: e.message }); }
});

app.put("/api/colonias/:id", requireAuth, (req, res) => {
  const { nombre, lat, lon, activo } = req.body;
  run("UPDATE colonias SET nombre=?, lat=?, lon=?, activo=? WHERE id=?",
    [nombre, parseFloat(lat), parseFloat(lon), activo ?? 1, parseInt(req.params.id)]);
  invalidarCacheColonias();
  res.json({ ok: true });
});

app.delete("/api/colonias/:id", requireAuth, (req, res) => {
  run("DELETE FROM colonias WHERE id=?", [parseInt(req.params.id)]);
  invalidarCacheColonias();
  res.json({ ok: true });
});

app.get("/api/tarifas-zonas", requireAuth, (req, res) => {
  res.json(queryAll("SELECT * FROM tarifas_zonas ORDER BY distancia_max ASC"));
});

app.put("/api/tarifas-zonas", requireAuth, (req, res) => {
  const { zonas } = req.body;
  if (!Array.isArray(zonas)) return res.status(400).json({ error: "Formato inválido" });
  run("DELETE FROM tarifas_zonas");
  for (const z of zonas) {
    run("INSERT INTO tarifas_zonas (nombre_zona, distancia_max, tarifa) VALUES (?,?,?)",
      [z.nombre_zona, parseFloat(z.distancia_max), parseFloat(z.tarifa)]);
  }
  res.json({ ok: true });
});

function startPanel(port = 3000) {
  app.listen(port, () => {
    console.log(`\n🌐 Panel de administración corriendo en http://localhost:${port}`);
    console.log(`   Usuario: admin (usa scripts/reset-password.js para recuperar acceso)\n`);
  });
}

module.exports = { startPanel };