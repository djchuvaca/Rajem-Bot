/**
 * estado/sesiones.js
 * Serialización, persistencia y restauración de sesiones desde la BD.
 */

const {
  conversaciones, clientesNuevos, clientesPreventa, datosRecibidos,
  referenciaPreguntas, horaEntregaPreventa,
  resumenPendiente, esperandoCaptura, datosAcumulados, datosCampos,
  pedidosConfirmados, esperandoMotivoCancelacion, esperandoConfirmacionItem,
  esperandoAgregarMas, pedidoJSONActual, esperandoConfirmacionDatos,
  tipoEntregaCliente, esperandoCorte, esperandoEdicion, esperandoTipoItem, pendientesConfirmacion,
  esperandoExtras, ordenPreResumen, esperandoPagoMP,
} = require("./maps");

function serializarEstado(numero) {
  const estado = {};
  if (clientesNuevos.has(numero))             estado.clienteNuevo         = true;
  if (clientesPreventa.has(numero))           estado.preventa             = true;
  if (datosRecibidos.has(numero))             estado.datosRecibidos       = true;
  if (referenciaPreguntas.has(numero))        estado.referenciaPreguntas  = true;
  if (horaEntregaPreventa.has(numero))        estado.horaEntrega          = horaEntregaPreventa.get(numero);
  if (resumenPendiente.has(numero))           estado.resumenPendiente     = resumenPendiente.get(numero);
  if (esperandoCaptura.has(numero))           estado.esperandoCaptura     = esperandoCaptura.get(numero);
  if (datosAcumulados.has(numero))            estado.datosAcumulados      = datosAcumulados.get(numero);
  if (datosCampos.has(numero))                estado.datosCampos          = datosCampos.get(numero);
  if (pedidosConfirmados.has(numero))         estado.pedidoConfirmado     = pedidosConfirmados.get(numero);
  if (esperandoMotivoCancelacion.has(numero)) estado.esperandoCancelacion = esperandoMotivoCancelacion.get(numero);
  if (esperandoConfirmacionItem.has(numero))  estado.esperandoConfirmItem = esperandoConfirmacionItem.get(numero);
  if (esperandoAgregarMas.has(numero))        estado.esperandoAgregarMas  = esperandoAgregarMas.get(numero);
  if (pedidoJSONActual.has(numero))           estado.pedidoJSONActual     = pedidoJSONActual.get(numero);
  if (esperandoConfirmacionDatos.has(numero)) estado.esperandoConfirmDatos = esperandoConfirmacionDatos.get(numero);
  if (tipoEntregaCliente.has(numero))         estado.tipoEntregaCliente   = tipoEntregaCliente.get(numero);
  if (esperandoCorte.has(numero))             estado.esperandoCorte       = esperandoCorte.get(numero);
  if (esperandoEdicion.has(numero))           estado.esperandoEdicion     = esperandoEdicion.get(numero);
  if (esperandoTipoItem.has(numero))          estado.esperandoTipoItem    = esperandoTipoItem.get(numero);
  if (pendientesConfirmacion.has(numero))     estado.pendienteConfirmacion = pendientesConfirmacion.get(numero);
  if (esperandoExtras.has(numero))            estado.esperandoExtras       = esperandoExtras.get(numero);
  if (ordenPreResumen.has(numero))            estado.ordenPreResumen       = ordenPreResumen.get(numero);
  if (esperandoPagoMP.has(numero))            estado.esperandoPagoMP       = esperandoPagoMP.get(numero);
  return estado;
}

function restaurarEstado(numero, estado, historial = []) {
  if (!estado || Object.keys(estado).length === 0) return;
  if (estado.clienteNuevo)          clientesNuevos.add(numero);
  if (estado.preventa)              clientesPreventa.add(numero);
  if (estado.datosRecibidos)        datosRecibidos.add(numero);
  if (estado.referenciaPreguntas)   referenciaPreguntas.add(numero);
  if (estado.horaEntrega)           horaEntregaPreventa.set(numero, estado.horaEntrega);
  if (estado.resumenPendiente)      resumenPendiente.set(numero, estado.resumenPendiente);
  if (estado.esperandoCaptura)      esperandoCaptura.set(numero, estado.esperandoCaptura);
  if (estado.datosAcumulados)       datosAcumulados.set(numero, estado.datosAcumulados);
  if (estado.datosCampos)           datosCampos.set(numero, estado.datosCampos);
  if (estado.pedidoConfirmado)      pedidosConfirmados.set(numero, estado.pedidoConfirmado);
  if (estado.esperandoCancelacion)  esperandoMotivoCancelacion.set(numero, estado.esperandoCancelacion);
  if (estado.esperandoConfirmItem)  esperandoConfirmacionItem.set(numero, estado.esperandoConfirmItem);
  if (estado.esperandoAgregarMas)   esperandoAgregarMas.set(numero, estado.esperandoAgregarMas);
  if (estado.pedidoJSONActual)      pedidoJSONActual.set(numero, estado.pedidoJSONActual);
  if (estado.esperandoConfirmDatos) esperandoConfirmacionDatos.set(numero, estado.esperandoConfirmDatos);
  if (estado.tipoEntregaCliente)    tipoEntregaCliente.set(numero, estado.tipoEntregaCliente);
  if (estado.esperandoCorte)        esperandoCorte.set(numero, estado.esperandoCorte);
  if (estado.esperandoEdicion)      esperandoEdicion.set(numero, estado.esperandoEdicion);
  if (estado.esperandoTipoItem)       esperandoTipoItem.set(numero, estado.esperandoTipoItem);
  if (estado.pendienteConfirmacion)   pendientesConfirmacion.set(numero, estado.pendienteConfirmacion);
  if (estado.esperandoExtras)         esperandoExtras.set(numero, estado.esperandoExtras);
  if (estado.ordenPreResumen)         ordenPreResumen.set(numero, estado.ordenPreResumen);
  if (estado.esperandoPagoMP)         esperandoPagoMP.set(numero, estado.esperandoPagoMP);
  if (historial.length > 0)           conversaciones.set(numero, historial);
}

function persistirEstado(numero) {
  const { guardarSesion, eliminarSesion } = require("../db");
  const estado    = serializarEstado(numero);
  const historial = conversaciones.get(numero) || [];
  if (Object.keys(estado).length === 0) {
    eliminarSesion(numero);
    return;
  }
  guardarSesion(numero, estado, historial);
}

// Claves que indican que el cliente está en medio de un flujo conversacional real.
// Sesiones con solo datos de fondo (datosCampos, tipoEntregaCliente, etc.) no se restauran.
const _CLAVES_FLUJO_ACTIVO = new Set([
  "resumenPendiente", "esperandoCaptura", "esperandoConfirmItem",
  "esperandoAgregarMas", "esperandoConfirmDatos", "esperandoEdicion",
  "esperandoCorte", "esperandoTipoItem", "esperandoCancelacion", "esperandoExtras",
  "ordenPreResumen", "pendienteConfirmacion", "esperandoPagoMP",
]);

function _tieneFlujoActivo(estado) {
  return Object.keys(estado).some(k => _CLAVES_FLUJO_ACTIVO.has(k));
}

function restaurarTodasLasSesiones() {
  const { cargarTodasLasSesiones, limpiarSesionesAntiguas } = require("../db");
  limpiarSesionesAntiguas(8);
  const sesiones = cargarTodasLasSesiones();
  let restauradas = 0;
  for (const { numero, estado, historial } of sesiones) {
    try {
      if (!_tieneFlujoActivo(estado)) continue;
      restaurarEstado(numero, estado, historial);
      restauradas++;
    } catch (e) {
      console.error(`[SESION] Error restaurando ${numero}:`, e.message);
    }
  }
  if (restauradas > 0)
    console.log(`♻️  ${restauradas} sesión(es) activa(s) restaurada(s) desde la BD`);
}

module.exports = { serializarEstado, restaurarEstado, persistirEstado, restaurarTodasLasSesiones };
