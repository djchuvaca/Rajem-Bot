const { queryAll, queryOne, run } = require("./core");

// ─── PRODUCTOS ────────────────────────────────────────────────────────────────
function getProductos() {
  return queryAll("SELECT * FROM productos WHERE activo = 1");
}
function getProducto(nombre) {
  return queryOne("SELECT * FROM productos WHERE nombre = ? AND activo = 1", [nombre.toLowerCase()]);
}
function updateProducto(id, datos) {
  run(
    "UPDATE productos SET nombre=?, descripcion=?, precio_taco=?, precio_torta=?, precio_100g=?, activo=?, sinonimos=? WHERE id=?",
    [datos.nombre, datos.descripcion, datos.precio_taco, datos.precio_torta, datos.precio_100g, datos.activo, datos.sinonimos || '', id]
  );
}
function createProducto(datos) {
  run(
    "INSERT INTO productos (nombre, descripcion, precio_taco, precio_torta, precio_100g, sinonimos, categoria) VALUES (?,?,?,?,?,?,?)",
    [datos.nombre, datos.descripcion, datos.precio_taco, datos.precio_torta, datos.precio_100g, datos.sinonimos || '', datos.categoria || 'corte']
  );
}
function deleteProducto(id) {
  run("UPDATE productos SET activo = 0 WHERE id = ?", [id]);
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
function deleteCliente(id) {
  run("DELETE FROM clientes WHERE id = ?", [id]);
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
function deletePedido(id) {
  run("DELETE FROM pedidos WHERE id = ?", [id]);
}

function setProductoActivo(nombre, activo) {
  run("UPDATE productos SET activo = ? WHERE LOWER(nombre) = LOWER(?)", [activo ? 1 : 0, nombre]);
}

function updateProductoPrecio(nombre, precioTaco, precioTorta) {
  run(
    "UPDATE productos SET precio_taco = ?, precio_torta = ? WHERE LOWER(nombre) = LOWER(?)",
    [precioTaco, precioTorta, nombre]
  );
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

module.exports = {
  getProductos, getProducto, updateProducto, createProducto, deleteProducto,
  getCliente, getAllClientes, upsertCliente, deleteCliente, guardarUltimoPedido, getUltimoPedido,
  registrarPedido, actualizarEstadoPedido, actualizarEstadoPorId, getPedidosHoy, getAllPedidos, updatePedidoEstado, deletePedido,
  getPedidosPorCliente, actualizarEstadoConfirmado, getPedidosPorFecha,
  setProductoActivo, updateProductoPrecio, getTopClientes,
  guardarPagoPendiente, obtenerPagoPendiente, eliminarPagoPendiente, limpiarPagosPendientesExpirados,
};
