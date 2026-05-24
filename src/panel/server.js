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
  getConfig, guardarTelefonoReal, getJIDReal,
} = require("../db");
const { queryOne } = require("../db/core");
const { invalidarCacheCortes } = require("../handlers/pedidoParser");

const { getWhatsappClient } = require("./whatsapp-bridge");

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

// ── PEDIDOS ───────────────────────────────────────────────────────────────────
app.get("/api/pedidos", requireAuth, (req, res) => {
  res.json(req.query.hoy ? getPedidosHoy() : getAllPedidos());
});
const MSGS_ESTADO = {
  confirmado: "✅ Tu pedido ha sido *confirmado*. ¡Pronto estará listo!",
  rechazado:  "❌ Tu pedido fue *rechazado*. Contáctanos si tienes dudas.",
  en_camino:  "🛵 Tu pedido ya va *en camino*. ¡Prepárate para recibirlo!",
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
  const confirmados = pedidosHoy.filter(p => p.estado === "confirmado");
  const totalVentas = confirmados.reduce((a, p) => a + (p.total || 0), 0);
  const ticket      = confirmados.length ? Math.round(totalVentas / confirmados.length) : 0;

  // Corte más pedido hoy (busca en texto de la orden)
  const conteoCortes = {};
  const CORTES_STAT  = ["surtido", "carne", "buche", "cuero", "lengua"];
  for (const p of pedidosHoy) {
    const orden = (p.orden || "").toLowerCase();
    for (const c of CORTES_STAT) if (orden.includes(c)) conteoCortes[c] = (conteoCortes[c] || 0) + 1;
  }
  const corteMasPedido = Object.entries(conteoCortes).sort((a, b) => b[1] - a[1])[0]?.[0] || null;

  res.json({
    pedidos_hoy:      pedidosHoy.length,
    pendientes:       pedidosHoy.filter(p => p.estado === "pendiente").length,
    confirmados:      confirmados.length,
    cancelados:       pedidosHoy.filter(p => p.estado === "cancelado").length,
    rechazados:       pedidosHoy.filter(p => p.estado === "rechazado").length,
    total_ventas_hoy: totalVentas,
    ticket_promedio:  ticket,
    corte_mas_pedido: corteMasPedido,
    conteo_cortes:    conteoCortes,
    total_clientes:   queryOne("SELECT COUNT(*) as n FROM clientes")?.n || 0,
    negocio:          getConfig("nombre_negocio") || "Tacos Javier",
  });
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

function startPanel(port = 3000) {
  app.listen(port, () => {
    console.log(`\n🌐 Panel de administración corriendo en http://localhost:${port}`);
    console.log(`   Usuario: admin | Contraseña: admin123\n`);
  });
}

module.exports = { startPanel };