/**
 * db/index.js
 * Punto de entrada único — re-exporta todo para que el resto del proyecto
 * siga usando require("../db") sin cambiar ningún import existente.
 */

const core         = require("./core");
const config       = require("./config");
const modelos      = require("./modelos");
const businessTypes = require("./business-types");
const cortesDB     = require("./cortes");
const { seedDB }   = require("./seed");

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
  getPasarelaActiva:       config.getPasarelaActiva,
  getPasarelaConfig:       config.getPasarelaConfig,
  getNotifModalidad:       config.getNotifModalidad,
  getNotifDestinoJID:      config.getNotifDestinoJID,

  // business types & item types
  getAllBusinessTypes:     businessTypes.getAllBusinessTypes,
  getBusinessType:         businessTypes.getBusinessType,
  createBusinessType:      businessTypes.createBusinessType,
  updateBusinessType:      businessTypes.updateBusinessType,
  getBusinessTypeSlug:     businessTypes.getBusinessTypeSlug,
  getItemTypes:            businessTypes.getItemTypes,
  getItemTypeBySlug:       businessTypes.getItemTypeBySlug,
  createItemType:          businessTypes.createItemType,
  updateItemType:          businessTypes.updateItemType,
  deleteItemType:          businessTypes.deleteItemType,
  invalidarCacheItemTypes: businessTypes.invalidarCacheItemTypes,
  getTemplateProducts:     businessTypes.getTemplateProducts,

  // cortes (catálogo de cortes/ingredientes — nuevo modelo)
  getCortesBD:              cortesDB.getCortesBD,
  getCortesBDObj:           cortesDB.getCortesBDObj,
  getAllCortesBD:            cortesDB.getAllCortesBD,
  getPrecioCorteFormato:    cortesDB.getPrecioCorteFormato,
  calcularPrecioMixto:      cortesDB.calcularPrecioMixto,
  invalidarCacheCortesBD:   cortesDB.invalidarCacheCortesBD,
  createCorte:              cortesDB.createCorte,
  updateCorte:              cortesDB.updateCorte,

  // menu_items (menú activo configurado por el tenant)
  getMenuItems:        modelos.getMenuItems,

  // productos (bebidas/salsas — cortes migrados a tabla cortes)
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
