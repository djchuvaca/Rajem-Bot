const { queryAll, queryOne, run } = require("./core");

// ─── MENU ITEMS (habilitados por Superadmin; precios editables por tenant) ────
function getMenuItems(categoria = null) {
  const where  = categoria ? "WHERE eliminado=0 AND activo=1 AND categoria=?" : "WHERE eliminado=0 AND activo=1";
  const params = categoria ? [categoria] : [];
  return queryAll(`SELECT * FROM menu_items ${where} ORDER BY categoria, producto_slug`, params) || [];
}

// ─── CLIENTES ─────────────────────────────────────────────────────────────────
function getCliente(telefono) {
  return queryOne("SELECT * FROM clientes WHERE telefono = ?", [telefono]);
}
function getAllClientes() {
  return queryAll("SELECT * FROM clientes ORDER BY fecha_registro DESC");
}
function upsertCliente(datos) {
  const existe = getCliente(datos.telefono);
  if (existe) {
    run(
      `UPDATE clientes SET
        nombre       = COALESCE(?, nombre),
        apellido     = COALESCE(?, apellido),
        calle_numero = COALESCE(?, calle_numero),
        colonia      = COALESCE(?, colonia),
        referencia   = COALESCE(?, referencia)
        WHERE telefono = ?`,
      [datos.nombre, datos.apellido, datos.calle_numero, datos.colonia, datos.referencia, datos.telefono]
    );
  } else {
    run(
      "INSERT INTO clientes (nombre, apellido, telefono, calle_numero, colonia, referencia) VALUES (?,?,?,?,?,?)",
      [datos.nombre, datos.apellido, datos.telefono, datos.calle_numero, datos.colonia, datos.referencia]
    );
  }
  return getCliente(datos.telefono);
}
function updateClientePanel(id, datos) {
  run(
    `UPDATE clientes SET nombre=?, apellido=?, telefono=?, calle_numero=?, colonia=?, referencia=?
     WHERE id=?`,
    [datos.nombre, datos.apellido, datos.telefono, datos.calle_numero, datos.colonia, datos.referencia, id]
  );
  return queryOne("SELECT * FROM clientes WHERE id=?", [id]);
}
function guardarUltimoPedido(telefono, jsonObj) {
  try { run("UPDATE clientes SET ultimo_pedido_json = ? WHERE telefono = ?", [JSON.stringify(jsonObj), telefono]); } catch (_) {}
}
function getUltimoPedido(telefono) {
  try {
    const row = queryOne("SELECT ultimo_pedido_json FROM clientes WHERE telefono = ?", [telefono]);
    return row?.ultimo_pedido_json ? JSON.parse(row.ultimo_pedido_json) : null;
  } catch (_) { return null; }
}

// ─── PEDIDOS ──────────────────────────────────────────────────────────────────
function registrarPedido(datos) {
  const { getDB, guardarDB } = require("./core");
  const db = getDB();
  if (!db) return null;
  db.run(
    `INSERT INTO pedidos (cliente_id, tipo, orden, total, metodo_pago, estado, hora_entrega)
     VALUES (?,?,?,?,?,?,?)`,
    [datos.cliente_id, datos.tipo, datos.orden, datos.total, datos.metodo_pago, datos.estado || "pendiente", datos.hora_entrega]
  );
  if (datos.cliente_id)
    db.run("UPDATE clientes SET total_pedidos = total_pedidos + 1 WHERE id = ?", [datos.cliente_id]);
  const resultado = db.exec("SELECT last_insert_rowid() as id");
  guardarDB();
  return resultado[0]?.values[0][0] || null;
}

function actualizarEstadoPorId(pedidoId, estado) {
  run("UPDATE pedidos SET estado = ? WHERE id = ?", [estado, pedidoId]);
}

function actualizarEstadoPedido(telefono, estado) {
  run(
    `UPDATE pedidos SET estado = ? WHERE id = (
      SELECT p.id FROM pedidos p
      INNER JOIN clientes c ON p.cliente_id = c.id
      WHERE c.telefono = ? AND p.estado = 'pendiente'
      ORDER BY p.fecha DESC LIMIT 1)`,
    [estado, telefono]
  );
}
function getPedidosHoy() {
  return queryAll(
    `SELECT p.*, c.nombre, c.apellido, c.telefono FROM pedidos p
     LEFT JOIN clientes c ON p.cliente_id = c.id
     WHERE date(p.fecha) = date('now', 'localtime') ORDER BY p.fecha DESC`
  );
}
function getAllPedidos() {
  return queryAll(
    `SELECT p.*, c.nombre, c.apellido, c.telefono FROM pedidos p
     LEFT JOIN clientes c ON p.cliente_id = c.id ORDER BY p.fecha DESC LIMIT 200`
  );
}
function updatePedidoEstado(id, estado) {
  run("UPDATE pedidos SET estado = ? WHERE id = ?", [estado, id]);
}
function getTopClientes(limit = 10) {
  return queryAll(
    `SELECT c.*,
       COALESCE(SUM(CASE WHEN p.estado IN ('confirmado','listo','en_camino') THEN p.total ELSE 0 END), 0) AS gasto_total
     FROM clientes c
     LEFT JOIN pedidos p ON p.cliente_id = c.id
     WHERE c.total_pedidos > 0
     GROUP BY c.id
     ORDER BY c.total_pedidos DESC
     LIMIT ?`,
    [limit]
  );
}

function getPedidosPorCliente(telefono) {
  return queryAll(
    `SELECT p.* FROM pedidos p
     INNER JOIN clientes c ON p.cliente_id = c.id
     WHERE c.telefono = ? ORDER BY p.fecha DESC LIMIT 15`,
    [telefono]
  );
}

function actualizarEstadoConfirmado(telefono, nuevoEstado) {
  run(
    `UPDATE pedidos SET estado = ? WHERE id = (
      SELECT p.id FROM pedidos p
      INNER JOIN clientes c ON p.cliente_id = c.id
      WHERE c.telefono = ? AND p.estado = 'confirmado'
      ORDER BY p.fecha DESC LIMIT 1)`,
    [nuevoEstado, telefono]
  );
}

function getPedidosPorFecha(fechaInicio, fechaFin) {
  return queryAll(
    `SELECT p.*, c.nombre, c.apellido, c.telefono FROM pedidos p
     LEFT JOIN clientes c ON p.cliente_id = c.id
     WHERE date(p.fecha) >= date(?) AND date(p.fecha) <= date(?)
     ORDER BY p.fecha DESC`,
    [fechaInicio, fechaFin]
  );
}

function getStatsReporte(fechaInicio, fechaFin) {
  const pedidos     = getPedidosPorFecha(fechaInicio, fechaFin);
  const confirmados = pedidos.filter(p => ['confirmado','listo','en_camino'].includes(p.estado));
  const cancelados  = pedidos.filter(p => ['cancelado','rechazado'].includes(p.estado));
  const domicilios  = confirmados.filter(p => p.tipo === 'domicilio');
  const mostradores = confirmados.filter(p => p.tipo === 'mostrador');
  const ventas      = confirmados.reduce((s, p) => s + (p.total || 0), 0);
  const ticket      = confirmados.length ? Math.round(ventas / confirmados.length) : 0;

  const catalogo = require('../giros/catalogo-tenant');
  const activos = new Set(catalogo.getMenuItemsActivos('corte').map(i => i.producto_slug));
  const productos = catalogo.getCortesTenant().filter(c => activos.has(c.slug));
  const conteoCortes = {};
  for (const p of pedidos) {
    const orden = (p.orden || '').toLowerCase();
    for (const prod of productos) {
      if (orden.includes(prod.nombre.toLowerCase()))
        conteoCortes[prod.nombre] = (conteoCortes[prod.nombre] || 0) + 1;
    }
  }

  return {
    total:            pedidos.length,
    confirmados:      confirmados.length,
    cancelados:       cancelados.length,
    domicilios:       domicilios.length,
    mostradores:      mostradores.length,
    ventas:           Math.round(ventas),
    ticket,
    conteoCortes,
    ventasDomicilio:  Math.round(domicilios.reduce((s, p) => s + (p.total || 0), 0)),
    ventasMostrador:  Math.round(mostradores.reduce((s, p) => s + (p.total || 0), 0)),
  };
}

// ─── PAGOS PENDIENTES (MercadoPago) ──────────────────────────────────────────
function guardarPagoPendiente(pedidoId, { jid, telefono, resumen, nombre }, expiraEn) {
  run(
    `INSERT OR REPLACE INTO pagos_pendientes (pedido_id, jid, telefono, nombre, resumen, expira_en)
     VALUES (?,?,?,?,?,?)`,
    [String(pedidoId), jid, telefono || '', nombre || '', resumen || '', expiraEn]
  );
}

function obtenerPagoPendiente(pedidoId) {
  const row = queryOne(
    "SELECT * FROM pagos_pendientes WHERE pedido_id = ? AND expira_en > datetime('now')",
    [String(pedidoId)]
  );
  if (!row) return null;
  return { jid: row.jid, telefono: row.telefono, nombre: row.nombre, resumen: row.resumen };
}

function eliminarPagoPendiente(pedidoId) {
  run("DELETE FROM pagos_pendientes WHERE pedido_id = ?", [String(pedidoId)]);
}

function limpiarPagosPendientesExpirados() {
  run("DELETE FROM pagos_pendientes WHERE expira_en <= datetime('now')");
}

// ─── DESPACHOS PROGRAMADOS ────────────────────────────────────────────────────
function guardarDespachoProgramado(data) {
  const result = run(
    `INSERT INTO despachos_programados
     (pedido_id, cliente_nombre, cliente_tel, cliente_calle, cliente_colonia, cliente_ref, total_orden, tarifa, hora_despacho)
     VALUES (?,?,?,?,?,?,?,?,?)`,
    [data.pedidoId, data.clienteNombre, data.clienteTelefono, data.clienteCalle,
     data.clienteColonia, data.clienteReferencia, data.totalOrden, data.tarifaDomicilio,
     data.horaDespacho]
  );
  return result.lastInsertRowid;
}

function marcarDespachoEjecutado(id) {
  run("UPDATE despachos_programados SET ejecutado = 1 WHERE id = ?", [id]);
}

function getDespachosPendientes() {
  return queryAll("SELECT * FROM despachos_programados WHERE ejecutado = 0");
}

module.exports = {
  getMenuItems,
  getCliente, getAllClientes, upsertCliente, updateClientePanel, guardarUltimoPedido, getUltimoPedido,
  registrarPedido, actualizarEstadoPedido, actualizarEstadoPorId, getPedidosHoy, getAllPedidos, updatePedidoEstado,
  getPedidosPorCliente, actualizarEstadoConfirmado, getPedidosPorFecha, getStatsReporte,
  getTopClientes,
  guardarPagoPendiente, obtenerPagoPendiente, eliminarPagoPendiente, limpiarPagosPendientesExpirados,
  guardarDespachoProgramado, marcarDespachoEjecutado, getDespachosPendientes,
};
