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
const observabilidad = require('./observabilidad');
const { seedDB }   = require("./seed");

// initDB ahora también ejecuta el seed
async function initDB() {
  await core.initDB();
  await seedDB();
  observabilidad.limpiarObservabilidadAntigua(config.getConfig('observabilidad_retencion_dias') || 90);
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
  getTipoServicio:         config.getTipoServicio,

  // business types & item types
  getBusinessType:         businessTypes.getBusinessType,
  getBusinessTypeSlug:     businessTypes.getBusinessTypeSlug,
  getItemTypes:            businessTypes.getItemTypes,
  getItemTypeBySlug:       businessTypes.getItemTypeBySlug,
  invalidarCacheItemTypes: businessTypes.invalidarCacheItemTypes,

  // cortes (catálogo de cortes/ingredientes — nuevo modelo)
  getCortesBD:              cortesDB.getCortesBD,

  // menu_items (habilitación del Superadmin + disponibilidad/precios del tenant)
  getMenuItems:        modelos.getMenuItems,

  // clientes
  getCliente:          modelos.getCliente,
  getAllClientes:       modelos.getAllClientes,
  getTopClientes:      modelos.getTopClientes,
  upsertCliente:       modelos.upsertCliente,
  updateClientePanel:  modelos.updateClientePanel,
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

  // pagos pendientes MP
  guardarPagoPendiente:             modelos.guardarPagoPendiente,
  obtenerPagoPendiente:             modelos.obtenerPagoPendiente,
  eliminarPagoPendiente:            modelos.eliminarPagoPendiente,
  limpiarPagosPendientesExpirados:  modelos.limpiarPagosPendientesExpirados,

  // despachos programados (preventa)
  guardarDespachoProgramado:  modelos.guardarDespachoProgramado,
  marcarDespachoEjecutado:    modelos.marcarDespachoEjecutado,
  getDespachosPendientes:     modelos.getDespachosPendientes,

  // trazabilidad y atención operativa
  ...observabilidad,
};
