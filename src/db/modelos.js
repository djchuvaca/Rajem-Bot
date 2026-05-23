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
    "UPDATE productos SET nombre=?, descripcion=?, precio_taco=?, precio_torta=?, precio_100g=?, activo=? WHERE id=?",
    [datos.nombre, datos.descripcion, datos.precio_taco, datos.precio_torta, datos.precio_100g, datos.activo, id]
  );
}
function createProducto(datos) {
  run(
    "INSERT INTO productos (nombre, descripcion, precio_taco, precio_torta, precio_100g) VALUES (?,?,?,?,?)",
    [datos.nombre, datos.descripcion, datos.precio_taco, datos.precio_torta, datos.precio_100g]
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
        correo       = COALESCE(?, correo),
        calle_numero = COALESCE(?, calle_numero),
        colonia      = COALESCE(?, colonia),
        referencia   = COALESCE(?, referencia)
        WHERE telefono = ?`,
      [datos.nombre, datos.apellido, datos.correo, datos.calle_numero, datos.colonia, datos.referencia, datos.telefono]
    );
  } else {
    run(
      "INSERT INTO clientes (nombre, apellido, telefono, correo, calle_numero, colonia, referencia) VALUES (?,?,?,?,?,?,?)",
      [datos.nombre, datos.apellido, datos.telefono, datos.correo, datos.calle_numero, datos.colonia, datos.referencia]
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

module.exports = {
  getProductos, getProducto, updateProducto, createProducto, deleteProducto,
  getCliente, getAllClientes, upsertCliente, deleteCliente, guardarUltimoPedido, getUltimoPedido,
  registrarPedido, actualizarEstadoPedido, getPedidosHoy, getAllPedidos, updatePedidoEstado, deletePedido,
};
