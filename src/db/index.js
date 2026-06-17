/**
 * db/index.js
 * Punto de entrada único — re-exporta todo para que el resto del proyecto
 * siga usando require("../db") sin cambiar ningún import existente.
 */

const core    = require("./core");
const config  = require("./config");
const modelos = require("./modelos");
const { seedDB } = require("./seed");

// initDB ahora también ejecuta el seed
async function initDB() {
  await core.initDB();
  await seedDB();
  return core.getDB();
}

module.exports = {
  // core
  initDB,
  guardarDB: core.guardarDB,

  // config
  getConfig:    config.getConfig,
  setConfig:    config.setConfig,
  getAllConfig:  config.getAllConfig,

  // horarios
  getHorarios:    config.getHorarios,
  getHorarioDia:  config.getHorarioDia,
  updateHorario:  config.updateHorario,

  // banco
  getBanco:     config.getBanco,
  updateBanco:  config.updateBanco,

  // mensajes bot
  getMensaje:    config.getMensaje,
  setMensaje:    config.setMensaje,
  getAllMensajes: config.getAllMensajes,

  // usuarios panel
  getUsuarioPanel:    config.getUsuarioPanel,
  updatePasswordPanel: config.updatePasswordPanel,

  // sesiones
  guardarSesion:          config.guardarSesion,
  eliminarSesion:         config.eliminarSesion,
  cargarTodasLasSesiones: config.cargarTodasLasSesiones,
  limpiarSesionesAntiguas:    config.limpiarSesionesAntiguas,
  limpiarTodasLasSesionesDB: config.limpiarTodasLasSesionesDB,

  // teléfonos reales
  guardarTelefonoReal: config.guardarTelefonoReal,
  getTelefonoReal:     config.getTelefonoReal,
  guardarJIDReal:      config.guardarJIDReal,
  getJIDReal:          config.getJIDReal,
  getGrupoId:              config.getGrupoId,
  getGrupoMandaditosId:    config.getGrupoMandaditosId,

  // productos
  getProductos:        modelos.getProductos,
  getProducto:         modelos.getProducto,
  updateProducto:      modelos.updateProducto,
  createProducto:      modelos.createProducto,
  deleteProducto:      modelos.deleteProducto,
  setProductoActivo:   modelos.setProductoActivo,
  updateProductoPrecio: modelos.updateProductoPrecio,

  // clientes
  getCliente:          modelos.getCliente,
  getAllClientes:       modelos.getAllClientes,
  getTopClientes:      modelos.getTopClientes,
  upsertCliente:       modelos.upsertCliente,
  deleteCliente:       modelos.deleteCliente,
  guardarUltimoPedido: modelos.guardarUltimoPedido,
  getUltimoPedido:     modelos.getUltimoPedido,

  // pedidos
  registrarPedido:            modelos.registrarPedido,
  actualizarEstadoPedido:     modelos.actualizarEstadoPedido,
  actualizarEstadoPorId:      modelos.actualizarEstadoPorId,
  actualizarEstadoConfirmado: modelos.actualizarEstadoConfirmado,
  getPedidosHoy:              modelos.getPedidosHoy,
  getAllPedidos:               modelos.getAllPedidos,
  getPedidosPorCliente:       modelos.getPedidosPorCliente,
  getPedidosPorFecha:         modelos.getPedidosPorFecha,
  getStatsReporte:            modelos.getStatsReporte,
  updatePedidoEstado:         modelos.updatePedidoEstado,
  deletePedido:               modelos.deletePedido,

  // pagos pendientes MP
  guardarPagoPendiente:             modelos.guardarPagoPendiente,
  obtenerPagoPendiente:             modelos.obtenerPagoPendiente,
  eliminarPagoPendiente:            modelos.eliminarPagoPendiente,
  limpiarPagosPendientesExpirados:  modelos.limpiarPagosPendientesExpirados,

  // despachos programados (preventa)
  guardarDespachoProgramado:  modelos.guardarDespachoProgramado,
  marcarDespachoEjecutado:    modelos.marcarDespachoEjecutado,
  getDespachosPendientes:     modelos.getDespachosPendientes,
};
