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
  getConfig, guardarTelefonoReal,
} = require("../db");

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
  const { usuario, password } = req.body;
  const user = getUsuarioPanel(usuario);
  if (!user || !bcrypt.compareSync(password, user.password))
    return res.status(401).json({ error: "Usuario o contraseña incorrectos" });
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
app.post("/api/productos", requireAuth, (req, res) => { createProducto(req.body); res.json({ ok: true }); });
app.put("/api/productos/:id", requireAuth, (req, res) => { updateProducto(parseInt(req.params.id), req.body); res.json({ ok: true }); });
app.delete("/api/productos/:id", requireAuth, (req, res) => { deleteProducto(parseInt(req.params.id)); res.json({ ok: true }); });

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
app.put("/api/pedidos/:id/estado", requireAuth, (req, res) => {
  updatePedidoEstado(parseInt(req.params.id), req.body.estado);
  res.json({ ok: true });
});
app.delete("/api/pedidos/:id", requireAuth, (req, res) => {
  deletePedido(parseInt(req.params.id));
  res.json({ ok: true });
});

// ── STATS ─────────────────────────────────────────────────────────────────────
app.get("/api/stats", requireAuth, (req, res) => {
  const pedidosHoy = getPedidosHoy();
  const clientes   = getAllClientes();
  res.json({
    pedidos_hoy:      pedidosHoy.length,
    pendientes:       pedidosHoy.filter(p => p.estado === "pendiente").length,
    confirmados:      pedidosHoy.filter(p => p.estado === "confirmado").length,
    cancelados:       pedidosHoy.filter(p => p.estado === "cancelado").length,
    rechazados:       pedidosHoy.filter(p => p.estado === "rechazado").length,
    total_ventas_hoy: pedidosHoy.filter(p => p.estado === "confirmado").reduce((a, p) => a + (p.total || 0), 0),
    total_clientes:   clientes.length,
    negocio:          getConfig("nombre_negocio") || "Tacos Javier",
  });
});

function startPanel(port = 3000) {
  app.listen(port, () => {
    console.log(`\n🌐 Panel de administración corriendo en http://localhost:${port}`);
    console.log(`   Usuario: admin | Contraseña: admin123\n`);
  });
}

module.exports = { startPanel };